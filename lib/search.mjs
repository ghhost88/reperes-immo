import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('../data/territoires.json', import.meta.url), 'utf8'));
export const regions = Object.fromEntries(data.regions);
export const departments = new Map(data.departments.map(([code, name, region]) => [code, { name, region }]));

export function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replaceAll('œ', 'oe').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export const clean = (value, max = 150) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const cities = data.cities.filter(([, code]) => departments.has(code))
  .map(([name, department]) => ({ name, key: normalize(name), department }));
const citiesByName = new Map();
for (const city of cities) {
  if (!citiesByName.has(city.key)) citiesByName.set(city.key, []);
  const matches = citiesByName.get(city.key);
  if (!matches.includes(city.department)) matches.push(city.department);
}

function withinRegion(department, region) {
  return !region || departments.get(department)?.region === region;
}

export function citySuggestions(query, department, region) {
  const key = normalize(query);
  if (key.length < 2) return [];
  return cities.filter(city => city.key.startsWith(key) && (!department || city.department === department)
    && withinRegion(city.department, region)).slice(0, 10);
}

export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function readCriteria(input) {
  const criteria = {
    keywords: clean(input.keywords, 200),
    role: clean(input.role, 100),
    alternatives: Array.isArray(input.alternatives) ? input.alternatives.slice(0, 5).map(item => clean(item, 80)).filter(Boolean) : [],
    region: clean(input.region, 3),
    department: clean(input.department, 3),
    city: clean(input.city, 100),
    openOnly: input.openOnly === true,
  };
  const { region, department, city } = criteria;
  if (region && !Object.hasOwn(regions, region)) throw new AppError('Sélectionnez une région dans la liste.');
  if (department && (!departments.has(department) || !withinRegion(department, region))) {
    throw new AppError('Sélectionnez un département dans la région choisie.');
  }

  const known = citiesByName.get(normalize(city));
  if (known && !known.some(code => (!department || department === code) && withinRegion(code, region))) {
    throw new AppError('La ville saisie ne correspond pas au département ou à la région sélectionnés.');
  }
  return criteria;
}

export function findDepartment(profile) {
  if (departments.has(profile.department)) return profile.department;
  const matches = citiesByName.get(normalize(profile.city)) ?? [];
  const state = normalize(profile.state);
  if (state) {
    const direct = data.departments.find(([, name]) => normalize(name) === state);
    if (direct && (!matches.length || matches.includes(direct[0]))) return direct[0];
    const narrowed = matches.filter(code => normalize(regions[departments.get(code).region]) === state);
    if (narrowed.length === 1) return narrowed[0];
  }
  return matches.length === 1 ? matches[0] : '';
}

export function filterProfiles(profiles, criteria, isDemo) {
  const keywordTerms = criteria.keywords.split(/[,;\n]+/).map(normalize).filter(Boolean);
  const roles = [criteria.role, ...criteria.alternatives].map(normalize).filter(Boolean);
  const seen = new Set();
  const results = [];
  for (const profile of profiles) {
    const department = findDepartment(profile);
    const region = departments.get(department)?.region;
    const regionName = regions[region] ?? clean(profile.state);
    if (criteria.openOnly && profile.openToWork !== true) continue;
    if (criteria.city && normalize(profile.city) !== normalize(criteria.city)) continue;
    if (criteria.department && department !== criteria.department) continue;
    if (criteria.region && criteria.region !== region &&
        (region || normalize(regions[criteria.region]) !== normalize(profile.state))) continue;

    if (isDemo) {
      const searchable = normalize([profile.role, ...profile.skills].join(' '));
      if (keywordTerms.length && !keywordTerms.some(term => searchable.includes(term))) continue;
      if (roles.length && !roles.some(role => normalize(profile.role).includes(role))) continue;
    }
    const id = profile.url || JSON.stringify([profile.name, profile.role, profile.city]);
    if (seen.has(id)) continue;
    seen.add(id);
    results.push({
      name: profile.name, role: profile.role, city: profile.city,
      department, region: regionName, location: profile.location ?? '',
      openToWork: profile.openToWork, skills: profile.skills,
      url: profile.url ?? null,
    });
  }
  return results.sort((a, b) => Number(b.openToWork === true) - Number(a.openToWork === true));
}
