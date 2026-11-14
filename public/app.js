const get = id => document.getElementById(id);
const form = get('search-form');
const mode = get('mode');
const region = get('region');
const department = get('department');
const city = get('city');
const cityList = get('city-options');
const settings = get('settings');
const settingsForm = get('settings-form');
const resultList = get('result-list');
const alternatives = get('alternatives');
const selectedRoles = new Set();
const collator = new Intl.Collator('fr');
let config = {};
let territories = { regions: {}, departments: [] };
let cityTimer;
let cityRequestId = 0;
let cityMatches = [];
let activeCity = -1;
let searchInProgress = false;
let suggestionRevision = 0;

async function api(path, data) {
  const options = data === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
  let response;
  let payload;
  try {
    response = await fetch(path, options);
    payload = await response.json();
  } catch {
    throw new Error('Le serveur local est indisponible. Vérifiez qu’il est toujours lancé.');
  }
  if (!response.ok) throw new Error(payload.error ?? 'Une erreur est survenue.');
  return payload;
}

function message(element, value, isError = false) {
  element.textContent = value;
  element.hidden = !value;
  element.classList.toggle('error', isError);
}

function refreshSource() {
  const live = mode.value === 'linkedin';
  const element = get('header-mode');
  element.classList.toggle('live', live && config.apifyReady);
  element.lastChild.textContent = live ? (config.apifyReady ? ' LinkedIn via Apify' : ' Apify à configurer') : ' Mode démo';
}

function refreshDepartments() {
  const previous = department.value;
  const options = territories.departments.filter(item => !region.value || item.region === region.value)
    .sort((a, b) => collator.compare(a.name, b.name));
  department.replaceChildren(new Option('Tous', ''), ...options.map(item => new Option(item.name + ' (' + item.code + ')', item.code)));
  if (options.some(item => item.code === previous)) department.value = previous;
}

function closeCityList() {
  clearTimeout(cityTimer);
  cityRequestId += 1;
  cityMatches = [];
  activeCity = -1;
  cityList.replaceChildren();
  cityList.hidden = true;
  city.setAttribute('aria-expanded', 'false');
  city.removeAttribute('aria-activedescendant');
}

function selectCity(match) {
  city.value = match.name;
  department.value = match.department;
  closeCityList();
}

function scheduleCities() {
  closeCityList();
  if (city.value.trim().length < 2) return;
  const requestId = cityRequestId;
  cityTimer = setTimeout(async () => {
    try {
      const query = new URLSearchParams({ q: city.value, region: region.value, department: department.value });
      const matches = await api('/api/cities?' + query);
      if (requestId !== cityRequestId || document.activeElement !== city) return;
      cityMatches = matches;
      cityList.replaceChildren(...matches.map((match, index) => {
        const option = document.createElement('li');
        option.id = 'city-choice-' + index;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', 'false');
        option.textContent = match.name + ' (' + match.department + ')';
        option.addEventListener('pointerdown', event => event.preventDefault());
        option.addEventListener('click', () => selectCity(match));
        return option;
      }));
      cityList.hidden = matches.length === 0;
      city.setAttribute('aria-expanded', String(matches.length > 0));
    } catch {
      if (requestId === cityRequestId) closeCityList();
    }
  }, 140);
}

city.addEventListener('input', scheduleCities);
city.addEventListener('focus', scheduleCities);
city.addEventListener('blur', closeCityList);
city.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeCityList();
  if (!cityMatches.length) return;
  if (event.key === 'Enter' && activeCity >= 0) {
    event.preventDefault();
    return selectCity(cityMatches[activeCity]);
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  event.preventDefault();
  activeCity = event.key === 'ArrowDown' ? (activeCity + 1) % cityMatches.length
    : (activeCity < 1 ? cityMatches.length - 1 : activeCity - 1);
  for (const [index, option] of [...cityList.children].entries()) {
    option.setAttribute('aria-selected', String(index === activeCity));
  }
  const option = cityList.children[activeCity];
  city.setAttribute('aria-activedescendant', option.id);
  option.scrollIntoView({ block: 'nearest' });
});

region.addEventListener('change', () => {
  refreshDepartments();
  closeCityList();
});
department.addEventListener('change', closeCityList);
mode.addEventListener('change', refreshSource);

function criteria() {
  const data = new FormData(form);
  return { ...Object.fromEntries(data), openOnly: data.has('openOnly'), alternatives: [...selectedRoles] };
}

function renderProfiles(profiles, resultMode, limit) {
  const template = get('profile-template');
  const fragment = document.createDocumentFragment();
  for (const profile of profiles) {
    const card = template.content.cloneNode(true);
    const status = card.querySelector('.status-pill');
    card.querySelector('h3').textContent = profile.name;
    card.querySelector('.avatar').textContent = profile.name.split(/\s+/).slice(0, 2).map(word => word[0]?.toUpperCase()).join('');
    card.querySelector('.profile-role').textContent = profile.role || 'Métier non renseigné';
    const cityLabel = profile.department && profile.city ? profile.city + ' (' + profile.department + ')' : profile.city;
    card.querySelector('.profile-location span').textContent = [cityLabel, profile.region].filter(Boolean).join(' · ') || profile.location || 'Localisation non renseignée';
    const skills = card.querySelector('.skills');
    for (const skill of profile.skills) {
      const item = document.createElement('li');
      item.textContent = skill;
      skills.append(item);
    }
    skills.hidden = !skills.children.length;
    status.classList.toggle('open', profile.openToWork === true);
    status.querySelector('span').textContent = profile.openToWork === true ? 'Ouvert aux opportunités'
      : profile.openToWork === false ? 'Badge absent' : 'Statut non renseigné';
    if (profile.url) {
      const link = card.querySelector('.profile-link');
      link.href = profile.url;
      link.hidden = false;
    }
    fragment.append(card);
  }
  resultList.replaceChildren(fragment);
  const count = profiles.length;
  get('count').hidden = false;
  get('count').querySelector('span').textContent = count + (count === 1 ? ' profil' : ' profils');
  get('results-subtitle').textContent = resultMode === 'demo' ? 'Profils fictifs de démonstration'
    : 'LinkedIn via Apify · jusqu’à ' + limit + ' profils examinés';
  message(get('result-message'), count ? '' : 'Aucun profil ne correspond. Essayez de retirer un critère.');
}

async function search(data, initial = false) {
  if (searchInProgress) return;
  if (data.mode === 'linkedin' && !config.apifyReady) {
    message(get('result-message'), 'Ajoutez une clé API Apify dans Connexions pour lancer la recherche LinkedIn.', true);
    await openSettings();
    return;
  }
  searchInProgress = true;
  get('search-fields').disabled = true;
  get('reset-search').disabled = true;
  resultList.setAttribute('aria-busy', 'true');
  if (!initial) {
    resultList.replaceChildren();
    get('count').hidden = true;
    get('results-subtitle').textContent = data.mode === 'demo' ? 'Profils fictifs de démonstration' : 'LinkedIn via Apify';
    get('search-button').querySelector('span').textContent = 'Recherche en cours…';
    message(get('result-message'), 'Recherche en cours…');
  }
  try {
    let result = await api('/api/search', data);
    if (result.id) {
      const url = '/api/search/' + result.id;
      do {
        await new Promise(resolve => setTimeout(resolve, 1550));
        result = await api(url);
        if (result.status === 'running') message(get('result-message'), result.message);
      } while (result.status === 'running');
    }
    if (result.status === 'error') throw new Error(result.message);
    renderProfiles(result.profiles, result.mode, result.limit);
  } catch (error) {
    get('count').hidden = true;
    message(get('result-message'), error.message, true);
  } finally {
    resultList.setAttribute('aria-busy', 'false');
    get('search-button').querySelector('span').textContent = 'Lancer la recherche';
    get('search-fields').disabled = false;
    get('reset-search').disabled = false;
    searchInProgress = false;
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  closeCityList();
  void search(criteria());
});
form.addEventListener('reset', () => {
  closeCityList();
  clearAlternatives();
  setTimeout(() => {
    refreshDepartments();
    refreshSource();
    void search(criteria());
  }, 0);
});

function clearAlternatives() {
  suggestionRevision += 1;
  selectedRoles.clear();
  alternatives.replaceChildren();
  message(get('suggest-status'), '');
}
get('keywords').addEventListener('input', clearAlternatives);
get('role').addEventListener('input', clearAlternatives);
get('suggest').addEventListener('click', async () => {
  const button = get('suggest');
  const { role, keywords } = criteria();
  if (!role.trim() && !keywords.trim()) {
    message(get('suggest-status'), 'Saisissez d’abord un métier ou des mots-clés.', true);
    return;
  }
  clearAlternatives();
  const revision = suggestionRevision;
  button.disabled = true;
  message(get('suggest-status'), 'Recherche de métiers proches…');
  try {
    const result = await api('/api/suggestions', { role, keywords });
    if (revision !== suggestionRevision) return;
    message(get('suggest-status'), result.suggestions.length ?
      (result.source === 'gemini' ? 'Gemini · Sélectionnez les métiers à ajouter.' : 'Exemples de démo · Sélectionnez les métiers à ajouter.')
      : 'Aucun métier proposé.');
    for (const label of result.suggestions) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'alternative';
      item.textContent = label;
      item.setAttribute('aria-pressed', 'false');
      item.addEventListener('click', () => {
        if (selectedRoles.has(label)) selectedRoles.delete(label);
        else selectedRoles.add(label);
        item.setAttribute('aria-pressed', String(selectedRoles.has(label)));
      });
      alternatives.append(item);
    }
  } catch (error) {
    if (revision === suggestionRevision) message(get('suggest-status'), error.message, true);
  } finally {
    button.disabled = false;
  }
});

async function openSettings() {
  if (settings.open) return;
  settingsForm.reset();
  get('apify-actor').value = config.apifyActor ?? '';
  get('gemini-model').value = config.geminiModel ?? '';
  for (const [service, ready] of [['apify', config.apifyReady], ['gemini', config.geminiReady]]) {
    const status = get(service + '-status');
    status.textContent = ready ? 'Clé renseignée' : 'À configurer';
    status.classList.toggle('ready', Boolean(ready));
    get('clear-' + service + '-label').hidden = !ready;
  }
  message(get('settings-message'), '');
  settings.showModal();
}

get('open-settings').addEventListener('click', openSettings);
get('close-settings').addEventListener('click', () => settings.close());
settings.addEventListener('close', () => {
  settingsForm.reset();
  for (const button of settings.querySelectorAll('.show-key')) {
    get(button.dataset.for).type = 'password';
    button.setAttribute('aria-pressed', 'false');
  }
});
for (const button of settings.querySelectorAll('.show-key')) {
  button.addEventListener('click', () => {
    const input = get(button.dataset.for);
    input.type = input.type === 'password' ? 'text' : 'password';
    button.setAttribute('aria-pressed', String(input.type === 'text'));
  });
}

settingsForm.addEventListener('submit', async event => {
  event.preventDefault();
  const data = new FormData(settingsForm);
  const save = get('save-settings');
  save.disabled = true;
  try {
    config = await api('/api/config', {
      ...Object.fromEntries(data), clearApify: data.has('clearApify'), clearGemini: data.has('clearGemini'),
    });
    refreshSource();
    settings.close();
  } catch (error) {
    message(get('settings-message'), error.message, true);
  } finally {
    save.disabled = false;
  }
});

try {
  [config, territories] = await Promise.all([api('/api/config'), api('/api/territories')]);
  for (const [code, label] of Object.entries(territories.regions).sort((a, b) => collator.compare(a[1], b[1]))) {
    region.add(new Option(label, code));
  }
  refreshDepartments();
  refreshSource();
  await search(criteria(), true);
} catch (error) {
  resultList.setAttribute('aria-busy', 'false');
  get('count').hidden = true;
  message(get('result-message'), error.message, true);
}
