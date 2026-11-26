// Recherche de lieux (ADR 0010) : bornes (sur le téléphone), IGN (adresses), Photon (lieux nommés).
import { distM } from './plan.js';

const BBOX = { s: 44.6, n: 45.1, w: -0.95, e: -0.25 }; // Bordeaux Métropole, large
export const inMetro = ([lat, lon]) => lat > BBOX.s && lat < BBOX.n && lon > BBOX.w && lon < BBOX.e;
export const norm = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// type = « clé:valeur » OpenStreetMap (ex. amenity:school) ; valeur exacte, pour ne pas confondre garden et garden_centre
const ICONS = [
  [/:(school|college|university|kindergarten)$/, '🎓'], [/:(restaurant|fast_food|food_court)$/, '🍽️'],
  [/:(cafe|bar|pub|biergarten)$/, '☕'], [/:(hospital|clinic|doctors|pharmacy)$/, '🏥'],
  [/:(tram_stop|bus_stop|station|halt|platform)$/, '🚋'], [/:(park|garden|playground|nature_reserve)$/, '🌳'],
  [/:(cinema|theatre|arts_centre|museum|attraction)$/, '🎭'], [/^shop:|:(mall|marketplace|retail)$/, '🛍️'],
  [/:bicycle_rental$/, '🚲'], [/:(townhall|library|community_centre|post_office)$/, '🏛️'],
  [/:(stadium|sports_centre|swimming_pool)$/, '🏟️'], [/^highway:/, '🛣️'],
];
export const iconFor = type => ICONS.find(([re]) => re.test(type))?.[1] ?? '📍';

export function searchStations(stations, q, limit = 3) {
  const nq = norm(q);
  if (nq.length < 2) return [];
  return stations.filter(s => norm(s.name).includes(nq))
    .sort((a, b) => norm(b.name).startsWith(nq) - norm(a.name).startsWith(nq))
    .slice(0, limit)
    .map(s => ({ name: s.name, detail: 'Borne Le Vélo', icon: '🚲', lat: s.lat, lon: s.lon }));
}

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function searchIgn(q, near) {
  const r = await getJson(`https://data.geopf.fr/geocodage/search?index=address&limit=10&lat=${near[0]}&lon=${near[1]}&q=${encodeURIComponent(q)}`);
  return r.features.map(f => ({
    name: f.properties.name, detail: `${f.properties.postcode} ${f.properties.city}`, icon: '🏠',
    lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], score: f.properties.score,
  })).filter(p => inMetro([p.lat, p.lon]));
}

async function searchPhoton(q, near) {
  const r = await getJson(`https://photon.komoot.io/api/?limit=8&lang=fr&bbox=${BBOX.w},${BBOX.s},${BBOX.e},${BBOX.n}` +
    `&lat=${near[0]}&lon=${near[1]}&q=${encodeURIComponent(q)}`);
  return r.features.filter(f => f.properties.name).map(({ properties: p, geometry: g }) => ({
    name: p.name,
    detail: [p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street, p.district ?? p.locality, p.city]
      .filter(Boolean).join(', '),
    icon: iconFor(`${p.osm_key}:${p.osm_value}`),
    lat: g.coordinates[1], lon: g.coordinates[0],
  }));
}

/** Résultats fusionnés : bornes, puis adresses d'abord si la saisie commence par un numéro, sinon lieux nommés d'abord. */
export async function searchPlaces(q, { stations = [], near = [44.8378, -0.5792] } = {}) {
  const [ign, photon] = await Promise.all([searchIgn(q, near).catch(() => []), searchPhoton(q, near).catch(() => [])]);
  const ordered = [...searchStations(stations, q), ...(/^\d/.test(q.trim()) ? [...ign, ...photon] : [...photon, ...ign])];
  const out = [];
  for (const p of ordered) {
    const same = o => norm(o.name) === norm(p.name) && (norm(o.detail) === norm(p.detail) || distM([o.lat, o.lon], [p.lat, p.lon]) < 150);
    if (!out.some(same)) out.push(p);
  }
  return out.slice(0, 12);
}

export async function reverse([lat, lon]) {
  try {
    const f = (await getJson(`https://data.geopf.fr/geocodage/reverse?index=address&limit=1&lat=${lat}&lon=${lon}`)).features[0];
    if (f && distM([lat, lon], [f.geometry.coordinates[1], f.geometry.coordinates[0]]) < 100) {
      return { name: f.properties.name, detail: `${f.properties.postcode} ${f.properties.city}` };
    }
  } catch { /* pas de nom : on garde « Point sur la carte » */ }
  return { name: 'Point sur la carte', detail: `${lat.toFixed(5)}, ${lon.toFixed(5)}` };
}

// --- Lieu partagé depuis une autre appli (Google Maps…) ------------------------------------------

/** Texte partagé → {name, query, url} : 1re ligne = nom, lignes suivantes = adresse, lien éventuel. */
export function parseShared(text) {
  const url = text.match(/https?:\/\/\S+/)?.[0] ?? null;
  const lines = text.replace(/https?:\/\/\S+/g, '').split('\n').map(l => l.trim()).filter(Boolean);
  return { name: lines[0] ?? null, query: lines.join(', ') || null, url };
}

/** Coordonnées contenues dans une URL Google Maps (aussi quand elle est encodée dans une page de consentement). */
export function coordsFromMapsUrl(url) {
  const u = decodeURIComponent(decodeURIComponent(url));
  const m = u.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || u.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ||
    u.match(/[?&](?:q|ll|query|destination|center)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** Lieu partagé → {name, detail, lat, lon} ou null. resolveUrl(url) suit les redirections (lien court). */
export async function placeFromShared(text, resolveUrl) {
  const { name, query, url } = parseShared(text);
  const direct = url && coordsFromMapsUrl(url);
  if (direct && inMetro(direct)) return { name: name ?? 'Lieu partagé', detail: query ?? '', lat: direct[0], lon: direct[1] };
  if (query) {
    const ign = (await searchIgn(query, [44.8378, -0.5792]).catch(() => []))[0];
    if (ign && ign.score > 0.5) return { ...ign, name: name ?? ign.name, detail: query };
    const poi = (await searchPhoton(name, [44.8378, -0.5792]).catch(() => []))[0];
    if (poi) return poi;
  }
  if (url && resolveUrl) {
    const c = coordsFromMapsUrl(await resolveUrl(url).catch(() => ''));
    if (c && inMetro(c)) return { name: name ?? 'Lieu partagé', detail: query ?? '', lat: c[0], lon: c[1] };
  }
  return null;
}
