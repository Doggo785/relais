// Calcule la matrice des durées vélo entre toutes les bornes (OSRM) : node scripts/build-matrix.js <sortie.json>
// Lancé chaque mois par GitHub Actions.
import { writeFileSync } from 'node:fs';

const GBFS = 'https://bdx.mecatran.com/utw/ws/gbfs/bordeaux/v3/station_information.json?apiKey=opendata-bordeaux-metropole-flux-gtfs-rt';
const OSRM = (process.env.OSRM_URL || 'https://routing.openstreetmap.de/routed-bike').replace(/\/$/, '');
const BLOCK = 50; // les serveurs OSRM publics refusent plus de 100 points par requête
const out = process.argv[2];
if (!out) throw new Error('usage : node scripts/build-matrix.js <sortie.json>');

async function getJson(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'relais-matrix/1.0' }, signal: AbortSignal.timeout(90_000) });
      if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
      return await r.json();
    } catch (e) {
      if (i === tries) throw e;
      await new Promise(ok => setTimeout(ok, 5000));
    }
  }
}

const stations = (await getJson(GBFS)).data.stations.map(s => ({
  id: s.station_id, name: s.name.find(n => n.language === 'fr')?.text ?? s.name[0].text, lat: s.lat, lon: s.lon,
}));
const n = stations.length;
const dur = Array.from({ length: n }, () => Array(n).fill(null));
for (let a = 0; a < n; a += BLOCK) {
  for (let b = 0; b < n; b += BLOCK) {
    const src = stations.slice(a, a + BLOCK), dst = stations.slice(b, b + BLOCK);
    const coords = [...src, ...dst].map(s => `${s.lon},${s.lat}`).join(';');
    const range = (from, len) => Array.from({ length: len }, (_, i) => from + i).join(';');
    const res = await getJson(`${OSRM}/table/v1/bike/${coords}?annotations=duration` +
      `&sources=${range(0, src.length)}&destinations=${range(src.length, dst.length)}`);
    res.durations.forEach((row, i) => row.forEach((t, j) => { dur[a + i][b + j] = t == null ? null : Math.round(t); }));
    console.log(`bloc ${a}/${b} ok`);
  }
}
if (dur.flat().filter(t => t == null).length > n * n / 10) throw new Error('trop de durées manquantes, matrice refusée');
writeFileSync(out, JSON.stringify({ stations, dur, built: new Date().toISOString() }));
console.log(`${n} bornes → ${out}`);
