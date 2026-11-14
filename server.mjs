import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { AppError, citySuggestions, clean, departments, filterProfiles, readCriteria, regions } from './lib/search.mjs';
import { demoProfiles } from './lib/demo.mjs';
import { defaultActor, defaultModel, fetchProfiles, profileLimit, suggestRoles } from './lib/providers.mjs';

try {
  loadEnvFile();
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const host = '127.0.0.1';
const port = Number(process.env.PORT || 3000);
const config = {
  apifyToken: process.env.APIFY_API_TOKEN?.trim() || '',
  apifyActor: process.env.APIFY_ACTOR_ID?.trim() || defaultActor,
  geminiKey: process.env.GEMINI_API_KEY?.trim() || '',
  geminiModel: process.env.GEMINI_MODEL?.trim() || defaultModel,
};
let currentLiveJob = null;
let suggesting = false;
const jobs = new Map();
const allowedHosts = new Set([host + ':' + port, 'localhost:' + port]);
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/icons.svg', ['icons.svg', 'image/svg+xml']],
].map(([path, [file, type]]) => [
  path, { content: readFileSync(new URL('./public/' + file, import.meta.url)), type },
]));

function publicConfig() {
  return {
    apifyReady: Boolean(config.apifyToken), geminiReady: Boolean(config.geminiKey),
    apifyActor: config.apifyActor, geminiModel: config.geminiModel,
  };
}

function send(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readBody(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')) {
    throw new AppError('Format JSON requis.', 415);
  }
  let content = '';
  for await (const chunk of request.setEncoding('utf8')) {
    content += chunk;
    if (Buffer.byteLength(content) > 8192) throw new AppError('La demande est trop longue.', 413);
  }
  try {
    const value = JSON.parse(content);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new AppError('Demande JSON invalide.');
  }
}

function updateConfig(input) {
  const apifyActor = clean(input.apifyActor, 150) || defaultActor;
  const geminiModel = clean(input.geminiModel, 100) || defaultModel;
  if (!/^[a-z\d_-]+(?:[~/][a-z\d_-]+)?$/i.test(apifyActor)) throw new AppError('L’identifiant de l’Actor Apify est invalide.');
  if (!/^[a-z\d._-]+$/i.test(geminiModel)) throw new AppError('Le nom du modèle Gemini est invalide.');
  Object.assign(config, {
    apifyActor, geminiModel,
    apifyToken: input.clearApify === true ? '' : clean(input.apifyKey, 300) || config.apifyToken,
    geminiKey: input.clearGemini === true ? '' : clean(input.geminiKey, 300) || config.geminiKey,
  });
}

function startLiveSearch(criteria) {
  if (!config.apifyToken) throw new AppError('Ajoutez une clé Apify dans Connexions avant de lancer une recherche LinkedIn.');
  if (currentLiveJob) throw new AppError('Une recherche LinkedIn est déjà en cours.', 409);
  const id = randomUUID();
  const job = { status: 'running', message: 'Démarrage de la recherche Apify…', mode: 'linkedin' };
  const currentConfig = { ...config };
  currentLiveJob = id;
  jobs.set(id, job);
  void (async () => {
    try {
      const rows = await fetchProfiles(currentConfig, criteria, message => { job.message = message; });
      Object.assign(job, { status: 'done', profiles: filterProfiles(rows, criteria, false), limit: profileLimit });
    } catch (error) {
      Object.assign(job, { status: 'error', message: error instanceof AppError ? error.message : 'La recherche a échoué.' });
    } finally {
      currentLiveJob = null;
      setTimeout(() => jobs.delete(id), 5 * 60_000).unref();
    }
  })();
  return id;
}

const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Content-Security-Policy', "default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");

  try {
    if (!allowedHosts.has(request.headers.host)) throw new AppError('Adresse locale requise.', 403);
    const origin = request.headers.origin;
    if (origin && origin !== 'http://' + request.headers.host) throw new AppError('Origine refusée.', 403);
    const url = new URL(request.url, 'http://' + request.headers.host);
    const { pathname, searchParams } = url;
    if (request.method === 'GET') {
      const file = files.get(pathname);
      if (file) {
        response.writeHead(200, { 'Content-Type': file.type });
        return response.end(file.content);
      }
      if (pathname === '/api/config') return send(response, 200, publicConfig());
      if (pathname === '/api/territories') {
        return send(response, 200, { regions, departments: [...departments].map(([code, value]) => ({ code, ...value })) });
      }
      if (pathname === '/api/cities') {
        const { city, department, region } = readCriteria({
          city: searchParams.get('q'), department: searchParams.get('department'), region: searchParams.get('region'),
        });
        return send(response, 200, citySuggestions(city, department, region));
      }
      const id = pathname.match(/^\/api\/search\/([a-f0-9-]{36})$/)?.[1];
      if (id && jobs.has(id)) return send(response, 200, jobs.get(id));
    }

    if (request.method === 'POST' && pathname === '/api/config') {
      updateConfig(await readBody(request));
      return send(response, 200, publicConfig());
    }
    if (request.method === 'POST' && pathname === '/api/search') {
      const input = await readBody(request);
      const criteria = readCriteria(input);
      if (input.mode === 'linkedin') {
        return send(response, 202, { id: startLiveSearch(criteria) });
      }
      if (input.mode !== 'demo') throw new AppError('Choisissez une source de recherche.');
      await delay(280);
      return send(response, 200, { status: 'done', mode: 'demo', profiles: filterProfiles(demoProfiles, criteria, true) });
    }
    if (request.method === 'POST' && pathname === '/api/suggestions') {
      const criteria = readCriteria(await readBody(request));
      if (!criteria.role && !criteria.keywords) throw new AppError('Saisissez un métier ou des mots-clés pour obtenir des suggestions.');
      if (suggesting) throw new AppError('Des suggestions sont déjà en cours.', 409);
      suggesting = true;
      try {
        return send(response, 200, await suggestRoles({ ...config }, criteria));
      } finally {
        suggesting = false;
      }
    }
    throw new AppError('Page introuvable.', 404);
  } catch (error) {
    if (!response.headersSent) {
      send(response, error instanceof AppError ? error.status : 500, {
        error: error instanceof AppError ? error.message : 'Une erreur inattendue est survenue.',
      });
    }
  }
});

server.listen(port, host, () => console.log('Repères Immo · http://localhost:' + port));
