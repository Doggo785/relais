import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plan, parseStatus, NoRoute, LEG_MAX, FREE, bikeEstS, distM } from '../www/plan.js';

const MERIGNAC = [44.8386, -0.6436];
const LORMONT = [44.8790, -0.5217];
const pt = s => [s.lat, s.lon];

function lineNetwork(k = 12) {
  const stations = Array.from({ length: k }, (_, i) => ({
    id: String(i), name: `B${i}`,
    lat: MERIGNAC[0] + (LORMONT[0] - MERIGNAC[0]) * i / (k - 1),
    lon: MERIGNAC[1] + (LORMONT[1] - MERIGNAC[1]) * i / (k - 1),
  }));
  const dur = stations.map(a => stations.map(b => bikeEstS(distM(pt(a), pt(b)))));
  const status = Object.fromEntries(stations.map(s => [s.id, { classic: 3, docks: 5, renting: true, returning: true }]));
  return { stations, status, dur };
}

function addStation({ stations, status, dur }, s, st) {
  stations.push(s);
  dur.forEach((row, i) => row.push(bikeEstS(distM(pt(stations[i]), pt(s)))));
  dur.push(stations.map(o => bikeEstS(distM(pt(s), pt(o)))));
  status[s.id] = st;
}

const route = (net, o = MERIGNAC, d = LORMONT, opts) => plan(net.stations, net.status, net.dur, o, d, opts);

function checkChain(res) {
  res.legs.slice(1).forEach((l, i) => assert.equal(l.from.id, res.legs[i].to.id));
  assert.equal(res.relays, res.legs.length - 1);
  for (const l of res.legs) assert.ok(l.min * 60 <= LEG_MAX + 1, `étape de ${l.min} min`);
}

test('trajet long Mérignac → Lormont découpé en étapes de 25 min max', () => {
  const res = route(lineNetwork());
  assert.ok(res.legs.length >= 2);
  assert.equal(res.legs[0].from.id, '0');
  assert.equal(res.legs.at(-1).to.id, '11');
  assert.equal(res.newRentals, res.legs.length);
  checkChain(res);
});

test('un relais sans aucun vélo disponible reste utilisable : on reprend son vélo', () => {
  const net = lineNetwork();
  for (const s of Object.values(net.status)) s.classic = 0;
  net.status['0'].classic = 5;
  const res = route(net);
  assert.ok(res.legs.length >= 2);
  checkChain(res);
});

test('relais sans place libre évité', () => {
  const net = lineNetwork();
  const relays = route(net).legs.slice(0, -1).map(l => l.to.id);
  for (const r of relays) net.status[r].docks = 0;
  const res = route(net);
  assert.ok(!res.legs.some(l => relays.includes(l.to.id)));
  checkChain(res);
});

test('borne pleine : recalcul depuis la position actuelle, vélo en main', () => {
  const net = lineNetwork();
  const full = net.stations[5];
  const riding = 20 * 60;
  const res = route(net, pt(full), LORMONT, { riding, exclude: new Set([full.id]) });
  const first = res.legs[0];
  assert.ok(first.from.current);
  assert.notEqual(first.to.id, full.id);
  assert.ok(riding + first.min * 60 <= FREE);
  assert.equal(res.newRentals, res.legs.length - 1); // la location en cours est déjà payée
  checkChain(res);
});

test('bornes de secours à moins de 400 m, au retrait et au dépôt', () => {
  const net = lineNetwork();
  const r = route(net).legs[0].to;
  addStation(net, { id: 'bis', name: 'Bis', lat: r.lat + 0.002, lon: r.lon }, { classic: 1, docks: 4, renting: true, returning: true });
  addStation(net, { id: 'dep', name: 'Dep', lat: MERIGNAC[0] + 0.002, lon: MERIGNAC[1] }, { classic: 4, docks: 4, renting: true, returning: true });
  const res = route(net);
  const leg = res.legs.find(l => ['bis', r.id].includes(l.to.id));
  assert.deepEqual(new Set([leg.to.id, ...leg.backups.map(b => b.id)]), new Set([r.id, 'bis']));
  const first = res.legs[0].from;
  assert.ok(first.backups.length >= 1 && first.backups.length <= 3);
  assert.ok(first.backups.every(b => distM(pt(first), pt(b)) <= 400));
});

test('borne risquée (1 vélo) évitée si une borne sûre est presque aussi proche', () => {
  const net = lineNetwork();
  net.status['0'].classic = 1;
  addStation(net, { id: 'sure', name: 'Sûre', lat: MERIGNAC[0] + 0.0015, lon: MERIGNAC[1] }, { classic: 4, docks: 4, renting: true, returning: true });
  assert.equal(route(net).legs[0].from.id, 'sure');
});

test('borne risquée gardée et signalée si c\'est la seule', () => {
  const net = lineNetwork();
  net.status['0'].classic = 1;
  const res = route(net);
  assert.equal(res.legs[0].from.id, '0');
  assert.equal(res.legs[0].from.risky, true);
});

test('aucun vélo classique à la borne la plus proche', () => {
  const net = lineNetwork();
  net.status['0'].classic = 0;
  assert.notEqual(route(net).legs[0].from.id, '0');
});

test('aucun vélo classique nulle part : pas d\'itinéraire', () => {
  const net = lineNetwork();
  for (const s of Object.values(net.status)) s.classic = 0;
  assert.throws(() => route(net), NoRoute);
});

test('bornes signalées exclues', () => {
  const net = lineNetwork();
  const res = route(net, MERIGNAC, LORMONT, { exclude: new Set(['0', '11']) });
  assert.notEqual(res.legs[0].from.id, '0');
  assert.notEqual(res.legs.at(-1).to.id, '11');
});

test('trajet court : à pied', () => {
  const res = route(lineNetwork(), MERIGNAC, [MERIGNAC[0] + 0.002, MERIGNAC[1]]);
  assert.deepEqual(res.legs, []);
  assert.ok(res.totalMin < 5);
});

test('flux GBFS : vélos classiques par type, bornes muettes ignorées', () => {
  const now = Date.parse('2026-11-26T14:00:00Z');
  const st = parseStatus([
    { station_id: 'a', last_reported: '2026-11-26T13:59:00Z', is_installed: true, is_renting: true, is_returning: true,
      num_docks_available: 3, vehicle_types_available: [{ vehicle_type_id: 'classic', count: 2 }, { vehicle_type_id: 'electric', count: 5 }] },
    { station_id: 'muette', last_reported: '2026-11-26T13:00:00Z', is_installed: true, is_renting: true, is_returning: true, num_docks_available: 3 },
  ], new Set(['classic']), now);
  assert.deepEqual(st, { a: { classic: 2, docks: 3, renting: true, returning: true } });
});
