// Calcul d'itinéraire Relais : pur (aucun accès réseau), partagé par l'appli et les tests.
// Vocabulaire : voir GLOSSARY.md. Règles : docs/adr/0006 et 0008.

export const FREE = 30 * 60;        // secondes gratuites par location
export const LEG_MAX = 25 * 60;     // 5 min de marge
export const RELAY_S = 90;          // déposer puis reprendre son vélo
// Pénalité selon les vélos (retrait) ou places (dépôt) annoncés : à quelques minutes près, on préfère la
// borne la mieux fournie (ADR 0006). 1 seul = borne risquée.
export const supplyPenalty = n => n <= 1 ? 300 : n === 2 ? 120 : 0;
export const WALK_MAX_M = 1500;     // marche max (vol d'oiseau) vers/depuis une borne
export const BACKUP_M = 400;
export const MUTE_S = 30 * 60;      // borne muette au-delà

export class NoRoute extends Error {}

export function distM([la1, lo1], [la2, lo2]) {
  const r = Math.PI / 180;
  const a = Math.sin((la2 - la1) * r / 2) ** 2 +
    Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin((lo2 - lo1) * r / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(a));
}

// shortcut: vol d'oiseau ×1,3 pour la marche (5 km/h) et le vélo hors matrice (12 km/h, vitesse
// effective mesurée sur OSRM vélo) ; passer par OSRM si les écarts gênent en pratique.
export const walkS = m => m * 1.3 / (5 / 3.6);
export const bikeEstS = m => m * 1.3 / (12 / 3.6);
const pt = s => [s.lat, s.lon];

/** Flux GBFS station_status → {id: {classic, docks, renting, returning}}, sans les bornes muettes. */
export function parseStatus(gbfsStations, classicIds, now = Date.now()) {
  const out = {};
  for (const s of gbfsStations) {
    if (now - Date.parse(s.last_reported) > MUTE_S * 1000) continue;
    const installed = s.is_installed !== false;
    out[s.station_id] = {
      classic: (s.vehicle_types_available || [])
        .filter(v => classicIds.has(v.vehicle_type_id)).reduce((n, v) => n + v.count, 0),
      docks: s.num_docks_available || 0,
      renting: installed && !!s.is_renting,
      returning: installed && !!s.is_returning,
    };
  }
  return out;
}

/**
 * Plus court chemin départ → arrivée en étapes ≤ LEG_MAX.
 * stations : [{id, name, lat, lon}] alignées sur dur (secondes, null si injoignable).
 * opts.riding : secondes déjà roulées sur la location en cours (« Borne pleine ») ; le départ est
 *   alors un vélo en main à `origin`.
 * opts.exclude : ids de bornes à éviter (borne pleine, bornes signalées).
 * opts.relayPenalty : coût ajouté à chaque relais, sans changer la durée réelle (alternative « Moins de relais »).
 */
export function plan(stations, status, dur, origin, dest, { riding = null, exclude = new Set(), relayPenalty = 0 } = {}) {
  const n = stations.length;
  const st = stations.map(s => exclude.has(s.id) ? null : status[s.id]);
  const canRent = i => !!st[i]?.renting && st[i].classic >= 1;      // premier retrait
  const canReturn = i => !!st[i]?.returning && st[i].docks >= 1;
  const rentRisk = i => supplyPenalty(st[i].classic);
  const returnRisk = i => supplyPenalty(st[i].docks);

  // Nœuds : i = vélo déposé à la borne i ; n+i = vélo en main à la borne i ; S départ ; E arrivée.
  // Chaque arc porte [nœud, coût (avec pénalités), durée réelle].
  const S = 2 * n, E = 2 * n + 1;
  function* edges(u) {
    if (u === S) {
      const d = distM(origin, dest);
      if (riding === null && d <= WALK_MAX_M) yield [E, walkS(d), walkS(d)];
      for (let j = 0; j < n; j++) {
        const dj = distM(origin, pt(stations[j]));
        if (riding === null) {
          if (dj <= WALK_MAX_M && canRent(j)) yield [n + j, walkS(dj) + rentRisk(j), walkS(dj)];
        } else {
          const t = bikeEstS(dj);
          // la marge de 5 min sert justement à absorber une borne pleine : on vise 30 min - 1
          if (t <= FREE - 60 - riding && canReturn(j)) yield [j, t + returnRisk(j), t];
        }
      }
    } else if (u >= n) {
      const i = u - n;
      for (let j = 0; j < n; j++) {
        const t = dur[i][j];
        if (j !== i && t != null && t <= LEG_MAX && canReturn(j)) yield [j, t + returnRisk(j), t];
      }
    } else {
      const d = distM(pt(stations[u]), dest);
      if (d <= WALK_MAX_M) yield [E, walkS(d), walkS(d)];
      if (st[u]?.renting) yield [n + u, RELAY_S + relayPenalty, RELAY_S]; // on reprend son propre vélo (ADR 0008)
    }
  }

  // shortcut: file de priorité par tri linéaire, suffisant pour ~500 nœuds ; tas binaire si le réseau grossit.
  const best = new Map([[S, 0]]), prev = new Map(), real = new Map([[S, 0]]), open = new Set([S]);
  while (open.size) {
    let u = null;
    for (const v of open) if (u === null || best.get(v) < best.get(u)) u = v;
    open.delete(u);
    if (u === E) break;
    for (const [v, c, t] of edges(u)) {
      const nc = best.get(u) + c;
      if (nc < (best.get(v) ?? Infinity)) {
        best.set(v, nc); real.set(v, real.get(u) + t); prev.set(v, u); open.add(v);
      }
    }
  }
  if (!best.has(E)) throw new NoRoute('Aucun itinéraire : pas de vélo classique ou de place libre à portée, ou étape impossible en moins de 25 min.');

  const path = [E];
  while (path.at(-1) !== S) path.push(prev.get(path.at(-1)));
  path.reverse();

  const info = (i, role) => {
    const s = stations[i], x = st[i] || { classic: 0, docks: 0 };
    return { id: s.id, name: s.name, lat: s.lat, lon: s.lon, classic: x.classic, docks: x.docks,
      risky: role === 'rent' ? x.classic === 1 : x.docks === 1 };
  };
  const backups = (i, role) => stations.map((s, k) => [k, distM(pt(stations[i]), pt(s))])
    .filter(([k, d]) => k !== i && d <= BACKUP_M && (role === 'rent' ? canRent(k) : canReturn(k)))
    .sort((a, b) => a[1] - b[1]).slice(0, 3).map(([k]) => info(k, role));

  const legs = [];
  for (let k = 1; k < path.length - 1; k++) {
    const a = path[k - 1], b = path[k];
    if (b >= n) continue;
    const from = a === S ? { name: 'Votre position', lat: origin[0], lon: origin[1], current: true }
      : legs.length ? legs.at(-1).to // relais : même borne, on reprend son vélo
        : { ...info(a - n, 'rent'), backups: backups(a - n, 'rent') }; // premier retrait
    legs.push({ from, to: info(b, 'return'), min: Math.round((real.get(b) - real.get(a)) / 6) / 10,
      backups: backups(b, 'return') });
  }
  const walkStart = riding === null && path[1] !== E ? real.get(path[1]) : 0;
  const walkEnd = path.at(-2) !== S ? real.get(E) - real.get(path.at(-2)) : 0;
  const r1 = x => Math.round(x / 6) / 10;
  return { origin, dest, totalMin: r1(real.get(E)), walkStartMin: r1(walkStart), walkEndMin: r1(walkEnd),
    relays: Math.max(legs.length - 1, 0),
    newRentals: riding === null ? legs.length : Math.max(legs.length - 1, 0),
    legs };
}

export const ALT_MAX_MIN = 10;

/** Itinéraires alternatifs (voir GLOSSARY.md) : « Autres bornes » puis « Moins de relais », au plus 10 min de plus. */
export function alternatives(stations, status, dur, origin, dest, opts, best) {
  const key = p => p.legs.map(l => l.to.id).join();
  const relayIds = best.legs.slice(0, -1).map(l => l.to.id);
  const out = [];
  const add = (label, extra, keep = () => true) => {
    let p;
    try { p = plan(stations, status, dur, origin, dest, { ...opts, ...extra }); } catch (e) {
      if (e instanceof NoRoute) return;
      throw e;
    }
    if (keep(p) && p.legs.length && p.totalMin <= best.totalMin + ALT_MAX_MIN && ![best, ...out].some(o => key(o) === key(p))) {
      out.push({ ...p, label });
    }
  };
  if (relayIds.length) add('Autres bornes', { exclude: new Set([...(opts.exclude ?? []), ...relayIds]) });
  if (best.relays) add('Moins de relais', { relayPenalty: 600 }, p => p.relays < best.relays);
  return out;
}
