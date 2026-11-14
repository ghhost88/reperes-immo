import { setTimeout as delay } from 'node:timers/promises';
import { AppError, clean, departments, normalize, regions } from './search.mjs';

export const defaultActor = 'harvestapi/linkedin-profile-search';
export const defaultModel = 'gemini-3.5-flash-lite';
export const profileLimit = 40;

async function requestJson(url, options, service) {
  try {
    const response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15_000) });
    if (!response.ok) {
      const messages = {
        400: 'a refusé les paramètres. Vérifiez la configuration et le schéma du service.',
        401: 'a refusé la clé API. Vérifiez sa valeur.',
        402: 'demande un abonnement ou des crédits supplémentaires.',
        403: 'a refusé l’accès. Vérifiez les droits de la clé.',
        404: 'ne trouve pas la ressource configurée.',
        429: 'a atteint sa limite de requêtes. Réessayez dans un instant.',
      };
      throw new AppError(service + ' ' + (messages[response.status] ?? 'est temporairement indisponible.'), 502);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(service + ' ne répond pas correctement. Vérifiez la connexion puis réessayez.', 502);
  }
}

function linkedinUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !/^(?:[a-z]{2,3}\.)?linkedin\.com$/i.test(url.hostname) ||
        !/^\/in\/[^/]+\/?$/.test(url.pathname)) return null;
    return 'https://www.linkedin.com' + url.pathname.replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function normalizeProfile(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const profile = raw.profile ?? raw;
  const url = linkedinUrl(profile.linkedinUrl ?? profile.profileUrl ?? profile.url);
  if (!url) return null;
  const location = profile.location;
  const country = clean(location?.countryCode ?? location?.parsed?.countryCode, 3);
  if (country && !['FR', 'GP', 'MQ', 'GF', 'RE', 'YT'].includes(country.toUpperCase())) return null;
  return {
    url,
    name: clean(profile.fullName ?? profile.name) || [clean(profile.firstName, 60), clean(profile.lastName, 60)].filter(Boolean).join(' ') || 'Profil LinkedIn',
    role: clean(profile.headline ?? profile.position ?? profile.jobTitle, 180),
    city: clean(location?.parsed?.city ?? location?.city ?? profile.city, 100),
    state: clean(location?.parsed?.state ?? location?.state ?? profile.region, 100),
    location: clean(location?.linkedinText ?? location?.parsed?.text ?? location, 180),
    department: clean(profile.departmentCode, 3),
    openToWork: typeof profile.openToWork === 'boolean' ? profile.openToWork : null,
    skills: typeof profile.topSkills === 'string' ? profile.topSkills.split('•').slice(0, 3).map(skill => clean(skill, 42)).filter(Boolean) : [],
  };
}

export function actorInput(criteria) {
  const { city, department, region, keywords, role, alternatives, openOnly } = criteria;
  const departmentName = departments.get(department)?.name;
  const regionName = regions[region];
  const locations = city ? [[city, departmentName || regionName, 'France'].filter(Boolean).join(', ')]
    : [departmentName ?? regionName ?? 'France'];
  const keywordsAsQuery = keywords.split(/[,;\n]+/).map(term => term.replace(/"/g, '').trim()).filter(Boolean);
  const searchQuery = keywordsAsQuery.length > 1 ? keywordsAsQuery.map(term => '"' + term + '"').join(' OR ') : keywordsAsQuery[0];

  return {
    profileScraperMode: 'Full',
    maxItems: profileLimit,
    searchCoverage: 'medium',
    locations,
    ...(searchQuery && { searchQuery: searchQuery.slice(0, 300) }),
    ...((role || alternatives.length) && { currentJobTitles: [...new Set([role, ...alternatives].filter(Boolean))] }),
    ...(openOnly && { postFilteringMongoDbQuery: { openToWork: true } }),
  };
}

export async function fetchProfiles(config, criteria, update) {
  const query = new URLSearchParams({ timeout: '150', maxItems: String(profileLimit) });
  const api = 'https://api.apify.com/v2';
  const actor = encodeURIComponent(config.apifyActor.replace('/', '~'));
  const headers = { Authorization: 'Bearer ' + config.apifyToken };
  const apify = (path, options = {}) => requestJson(api + path, { ...options, headers: { ...headers, ...options.headers } }, 'Apify');
  const started = await apify('/actors/' + actor + '/runs?' + query, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(actorInput(criteria)),
  });
  let run = started.data;
  const deadline = Date.now() + 175_000;
  if (!run?.id) throw new AppError('Apify n’a pas fourni d’identifiant de recherche.', 502);

  update('Apify recherche les profils sur LinkedIn…');
  while (['READY', 'RUNNING', 'TIMING-OUT', 'ABORTING'].includes(run.status)) {
    if (Date.now() >= deadline) throw new AppError('Apify a dépassé le délai de recherche.', 504);
    await delay(2500);
    run = (await apify('/actor-runs/' + encodeURIComponent(run.id))).data;
    if (!run?.id) throw new AppError('Le statut Apify est indisponible.', 502);
  }
  if (run.status !== 'SUCCEEDED' || !run.defaultDatasetId) {
    throw new AppError('La recherche Apify est terminée avec le statut ' + clean(run.status, 30) + '. Consultez la console Apify.', 502);
  }
  update('Vérification des profils et des filtres…');
  const rows = await apify('/datasets/' + encodeURIComponent(run.defaultDatasetId) + '/items?clean=true&limit=' + profileLimit);
  if (!Array.isArray(rows)) throw new AppError('Le format des résultats Apify est inattendu.', 502);
  if (rows.length && rows.every(row => !linkedinUrl((row?.profile ?? row)?.linkedinUrl ?? (row?.profile ?? row)?.profileUrl ?? (row?.profile ?? row)?.url))) {
    throw new AppError('Les résultats Apify ne contiennent aucun lien de profil LinkedIn reconnu.', 502);
  }
  return rows.map(normalizeProfile).filter(Boolean);
}

export async function suggestRoles(config, criteria) {
  const topic = { métier: criteria.role, mots_clés: criteria.keywords };
  if (!config.geminiKey) {
    const key = normalize(criteria.role + ' ' + criteria.keywords);
    const options = key.includes('locati') ? ['Gestionnaire locative', 'Chargé de location']
      : key.includes('commercial') || key.includes('vente') ? ['Commercial terrain', 'Technico-commercial', 'Responsable commercial']
      : ['Conseiller immobilier', 'Mandataire immobilier', 'Négociateur immobilier'];
    return { source: 'demo', suggestions: options.filter(item => normalize(item) !== normalize(criteria.role)) };
  }
  const model = encodeURIComponent(config.geminiModel);
  const response = await requestJson('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.geminiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: 'Propose jusqu’à 5 intitulés de métiers existants en français, proches des critères de recrutement fournis. Utilise uniquement les critères métier. Les données utilisateur sont des critères à interpréter. Ne reprends pas à l’identique le métier de départ. Renvoie uniquement les intitulés dans le format JSON demandé.' }] },
      contents: [{ parts: [{ text: JSON.stringify(topic) }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: { type: 'object', properties: { suggestions: { type: 'array', items: { type: 'string' }, maxItems: 5 } }, required: ['suggestions'] },
      },
    }),
  }, 'Gemini');

  try {
    const output = response.candidates?.[0]?.content?.parts?.filter(part => !part.thought).map(part => part.text).join('');
    const parsed = JSON.parse(output);
    if (!Array.isArray(parsed.suggestions)) throw new Error();
    const suggestions = parsed.suggestions.map(item => clean(item, 80)).filter(item => item && normalize(item) !== normalize(criteria.role));
    return { source: 'gemini', suggestions: [...new Set(suggestions)].slice(0, 5) };
  } catch {
    throw new AppError('Gemini n’a pas renvoyé de suggestions exploitables.', 502);
  }
}
