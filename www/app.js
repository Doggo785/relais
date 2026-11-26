import { plan, parseStatus, NoRoute } from './plan.js';

const GBFS = f => `https://bdx.mecatran.com/utw/ws/gbfs/bordeaux/v3/${f}.json?apiKey=opendata-bordeaux-metropole-flux-gtfs-rt`;
const OSRM = 'https://routing.openstreetmap.de/routed-bike';
// shortcut: matrice livrée avec l'APK seulement ; ajouter l'URL GitHub Pages quand le dépôt existera (ADR 0003).
const MATRIX_URLS = ['matrix.json'];
const TBM_PACKAGE = 'com.infotbm.tbm';
const SIGNAL_MS = 2 * 3600e3;
const COLORS = ['#d7263d', '#1b73e8', '#0a7d4f', '#f46036', '#7b2cbf', '#2e294e'];

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const msg = t => { $('msg').textContent = t || ''; };
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(`relais.${k}`)) ?? d; } catch { return d; } },
  set: (k, v) => v == null ? localStorage.removeItem(`relais.${k}`) : localStorage.setItem(`relais.${k}`, JSON.stringify(v)),
};
const cap = window.Capacitor;
const plugins = cap?.isNativePlatform?.()
  ? { LocalNotifications: cap.registerPlugin('LocalNotifications'), AppLauncher: cap.registerPlugin('AppLauncher') } : {};

// --- Données -------------------------------------------------------------------------------------

let net = null, status = null, statusAt = 0, classicIds = null;

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function loadMatrix() {
  for (const url of MATRIX_URLS) {
    try { return net = await getJson(url); } catch { /* source suivante */ }
  }
  throw new Error('Matrice des durées introuvable');
}

async function loadStatus(force = false) {
  if (!force && Date.now() - statusAt < 30e3) return;
  // le libellé du type "classic" dit « Vélo électrique » (bug producteur) : on se fie à propulsion_type
  classicIds ??= new Set((await getJson(GBFS('vehicle_types'))).data.vehicle_types
    .filter(v => v.propulsion_type === 'human').map(v => v.vehicle_type_id));
  status = parseStatus((await getJson(GBFS('station_status'))).data.stations, classicIds);
  statusAt = Date.now();
}

function signaled() {
  const s = Object.fromEntries(Object.entries(store.get('signalees', {})).filter(([, until]) => until > Date.now()));
  store.set('signalees', s);
  return Object.keys(s);
}
const signal = id => store.set('signalees', { ...store.get('signalees', {}), [id]: Date.now() + SIGNAL_MS });

async function legGeometry(a, b) {
  try {
    const r = await getJson(`${OSRM}/route/v1/bike/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson`);
    return r.routes[0].geometry.coordinates.map(([lo, la]) => [la, lo]);
  } catch { return [[a.lat, a.lon], [b.lat, b.lon]]; } // tracé à vol d'oiseau en secours
}

async function compute(from, to, { riding = null, exclude = [] } = {}) {
  msg('Calcul…');
  try {
    if (!net) await loadMatrix();
    await loadStatus();
  } catch { msg('Données TBM injoignables : vérifiez la connexion.'); return null; }
  try {
    const res = plan(net.stations, status, net.dur, from, to, { riding, exclude: new Set([...signaled(), ...exclude]) });
    await Promise.all(res.legs.map(async l => { l.geometry = await legGeometry(l.from, l.to); }));
    res.statusAt = statusAt;
    msg('');
    return res;
  } catch (e) {
    msg(e instanceof NoRoute ? e.message : 'Erreur de calcul.');
    return null;
  }
}

// --- Appareil : GPS, applis externes, alertes ----------------------------------------------------

const here = () => new Promise((ok, ko) => navigator.geolocation.getCurrentPosition(
  p => ok([p.coords.latitude, p.coords.longitude]), ko, { enableHighAccuracy: true, timeout: 10000 }));

async function openExternal(url) {
  if (plugins.AppLauncher) await plugins.AppLauncher.openUrl({ url });
  else window.open(url, '_blank');
}
const navigate = (p, mode = 'bicycling') =>
  openExternal(`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}&travelmode=${mode}`);

async function openTbm() {
  try {
    if (!plugins.AppLauncher || !(await plugins.AppLauncher.openUrl({ url: TBM_PACKAGE })).completed) throw 0;
  } catch { openExternal(`https://play.google.com/store/apps/details?id=${TBM_PACKAGE}`); }
}

const ALERTS = [
  { id: 20, min: 20, title: 'Relais : 20 min', body: 'Préparez-vous à déposer le vélo.' },
  { id: 25, min: 25, title: 'Relais : 25 min !', body: 'Déposez le vélo maintenant : gratuit jusqu\'à 30 min.' },
];
const LN = () => plugins.LocalNotifications;

async function scheduleAlerts(start) {
  if (!LN()) return;
  await cancelAlerts();
  await LN().schedule({ notifications: ALERTS.filter(a => start + a.min * 60e3 > Date.now()).map(a => ({
    id: a.id, title: a.title, body: a.body, schedule: { at: new Date(start + a.min * 60e3), allowWhileIdle: true },
  })) });
}
const cancelAlerts = async () => LN() && LN().cancel({ notifications: ALERTS.map(a => ({ id: a.id })) });

async function ensureAlertPermissions() {
  if (!LN()) return true;
  if ((await LN().requestPermissions()).display !== 'granted') {
    msg('Notifications refusées : les alertes de 20 et 25 min ne sonneront pas.');
    return false;
  }
  if ((await LN().checkExactNotificationSetting?.())?.exact_alarm === 'denied') {
    msg('Autorisez « Alarmes et rappels » pour Relais : sans ça, les alertes peuvent arriver en retard.');
    await LN().changeExactNotificationSetting();
  }
  return true;
}

// --- Carte et recherche --------------------------------------------------------------------------

const map = L.map('map').setView([44.8378, -0.5792], 13);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '© contributeurs OpenStreetMap',
}).addTo(map);
const layer = L.layerGroup().addTo(map);

const pts = { from: null, to: null };
const sugg = {};
let timer;

for (const k of ['from', 'to']) {
  $(k).addEventListener('input', e => {
    const q = e.target.value;
    pts[k] = sugg[q] || null;
    if (pts[k] || q.length < 3) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      // Géoplateforme IGN (successeur de l'API Adresse) ; lat/lon ne fait que favoriser la zone
      const r = await getJson(`https://data.geopf.fr/geocodage/search?limit=15&lat=44.84&lon=-0.58&q=${encodeURIComponent(q)}`).catch(() => null);
      if (!r) return msg('Recherche d\'adresse indisponible.');
      const near = r.features.filter(({ geometry: { coordinates: [lon, lat] } }) => lat > 44.6 && lat < 45.1 && lon > -0.95 && lon < -0.25);
      msg(near.length ? '' : 'Aucune adresse trouvée dans la métropole.');
      $('sugg').replaceChildren(...near.slice(0, 5).map(f => {
        sugg[f.properties.label] = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
        return new Option(f.properties.label);
      }));
    }, 300);
  });
}

$('gps').onclick = async () => {
  try { pts.from = await here(); $('from').value = 'Ma position'; } catch { msg('Position GPS indisponible.'); }
};

$('search').onsubmit = async e => {
  e.preventDefault();
  if (!pts.from || !pts.to) return msg('Choisissez un départ et une arrivée dans les suggestions.');
  const res = await compute(pts.from, pts.to);
  if (res) { setTrip(null); show(res); }
};

$('profil').value = store.get('profil', 'abonne');
$('profil').onchange = () => { store.set('profil', $('profil').value); if (current) show(current); };

// --- Affichage d'un itinéraire -------------------------------------------------------------------

let current = null; // itinéraire affiché

const cost = p => $('profil').value === 'occasionnel' ? `${p.newRentals} €` : '0 €';
const plural = (n, w) => `${n} ${n > 1 ? w.replace(/(\S+)/g, '$1s') : w}`;
const rentTxt = s => `${esc(s.name)} <span class="small">(${plural(s.classic, 'vélo classique')})</span>` +
  (s.risky ? ' <span class="risk">⚠ risqué : 1 seul vélo annoncé</span>' : '');
const returnTxt = s => `${esc(s.name)} <span class="small">(${plural(s.docks, 'place')})</span>` +
  (s.risky ? ' <span class="risk">⚠ risqué : 1 seule place annoncée</span>' : '');
const backupTxt = (list, txt) => list?.length
  ? `<br><span class="small">Secours : ${list.map(txt).join(' · ')}</span>`
  : '<br><span class="small">Pas de borne de secours à moins de 400 m</span>';

function show(p) {
  current = p;
  layer.clearLayers();
  const dash = (a, b) => L.polyline([a, b], { color: '#555', dashArray: '6 8', weight: 3 }).addTo(layer);
  const legs = p.legs;
  if (legs.length && p.walkStartMin) dash(p.origin, [legs[0].from.lat, legs[0].from.lon]);
  legs.forEach((l, i) => {
    L.polyline(l.geometry, { color: COLORS[i % COLORS.length], weight: 6 }).addTo(layer);
    L.circleMarker([l.to.lat, l.to.lon], { radius: 8, color: COLORS[i % COLORS.length], fillOpacity: 1 })
      .bindPopup(esc(l.to.name)).addTo(layer);
  });
  if (legs.length) dash([legs.at(-1).to.lat, legs.at(-1).to.lon], p.dest); else dash(p.origin, p.dest);
  L.marker(p.origin, { title: 'Départ' }).addTo(layer);
  L.marker(p.dest, { title: 'Arrivée' }).addTo(layer);

  let h = `<p class="sum">${Math.round(p.totalMin)} min · ${p.relays} relais · ${cost(p)}</p>`;
  if (!legs.length) h += '<p>Le plus rapide est d\'y aller à pied.</p>';
  h += '<ol>';
  if (legs.length && !legs[0].from.current) {
    h += `<li>${p.walkStartMin ? `🚶 ${Math.round(p.walkStartMin)} min jusqu'à ` : 'Retrait à '}${rentTxt(legs[0].from)}${backupTxt(legs[0].from.backups, rentTxt)}</li>`;
  }
  legs.forEach((l, i) => {
    const last = i === legs.length - 1;
    h += `<li style="border-color:${COLORS[i % COLORS.length]}"><strong>Étape ${i + 1} : ${esc(l.from.name)} → ${esc(l.to.name)} (${Math.round(l.min)} min)</strong><br>
      ${last ? 'Dépôt' : 'Relais (déposez puis reprenez votre vélo)'} : ${returnTxt(l.to)}${backupTxt(l.backups, returnTxt)}</li>`;
  });
  if (legs.length && p.walkEndMin) h += `<li>🚶 ${Math.round(p.walkEndMin)} min jusqu'à l'arrivée</li>`;
  h += `</ol><p class="small">Disponibilités relevées à ${new Date(p.statusAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.</p>`;
  if (legs.length && !trip) h += '<button class="main" id="start">Démarrer le trajet</button>';
  $('result').innerHTML = h;
  $('result').hidden = false;
  $('start')?.addEventListener('click', async () => {
    await ensureAlertPermissions();
    setTrip({ plan: p, leg: 0, phase: legs[0].from.current ? 'velo' : 'retrait', start: Date.now() });
  });
  map.invalidateSize(); // le panneau a grandi, la carte a rétréci
  map.fitBounds(L.featureGroup(layer.getLayers()).getBounds(), { padding: [20, 20] });
}

// --- Mode trajet ---------------------------------------------------------------------------------
// trip = {plan, leg, phase: 'retrait' | 'velo', start} ; enregistré : Android peut fermer l'appli.

let trip = null;

function setTrip(t) {
  trip = t;
  store.set('trip', t);
  if (!t) { cancelAlerts(); $('trip').hidden = true; if (current) show(current); return; }
  if (current !== t.plan) show(t.plan);
  $('start')?.remove();
  renderTrip();
}

function button(label, onclick, cls = '') {
  const b = document.createElement('button');
  b.textContent = label; b.className = cls; b.onclick = onclick;
  return b;
}
const row = (...els) => { const d = document.createElement('div'); d.className = 'row'; d.append(...els); return d; };

function renderTrip() {
  const { plan: p, leg: i, phase } = trip, l = p.legs[i], last = i === p.legs.length - 1;
  const relay = i > 0;
  $('trip').hidden = false;
  $('chrono').hidden = phase !== 'velo';
  $('alert').textContent = '';
  if (phase === 'retrait') {
    $('tripTitle').textContent = relay ? `Relais à ${l.from.name}` : `Retrait à ${l.from.name}`;
    $('tripInfo').textContent = relay ? 'Déposez le vélo puis reprenez-le pour une nouvelle location.'
      : `Puis étape ${i + 1}/${p.legs.length} vers ${l.to.name}.`;
    $('tripButtons').replaceChildren(
      ...(i === 0 && p.walkStartMin ? [row(button('🚶 Y aller (Google Maps)', () => navigate(l.from, 'walking')))] : []),
      row(button('🔓 Débloquer (appli TBM)', openTbm)),
      row(button('Vélo retiré : lancer le chrono', onRented, 'main')),
      row(button('Aucun vélo ne se débloque', onNoBike, 'warn')),
    );
  } else {
    $('tripTitle').textContent = `Étape ${i + 1}/${p.legs.length} → ${l.to.name}`;
    $('tripInfo').innerHTML = (l.to.unusable ? `<span class="risk">⚠ ${esc(l.to.name)} n'annonce plus de place : visez une borne de secours.</span>`
      : `${last ? 'Dépôt' : 'Relais'} : ${returnTxt(l.to)}`) + backupTxt(l.backups, returnTxt);
    $('tripButtons').replaceChildren(
      row(button('🧭 Naviguer (Google Maps)', () => navigate(l.to))),
      row(button(last ? 'Vélo déposé : arrivé' : 'Vélo déposé', onDocked, 'main')),
      row(button('Borne pleine', onFull, 'warn')),
    );
  }
  tick();
  $('trip').scrollIntoView({ behavior: 'smooth' });
}

async function onRented() {
  setTrip({ ...trip, phase: 'velo', start: Date.now() });
  await scheduleAlerts(trip.start);
}

async function onDocked() {
  await cancelAlerts();
  if (trip.leg === trip.plan.legs.length - 1) {
    const p = trip.plan;
    setTrip(null);
    return msg(`Arrivé ! Coût : ${cost(p)}.`);
  }
  const next = { ...trip, leg: trip.leg + 1, phase: 'retrait' };
  // relire les disponibilités à chaque relais (ADR 0004, sobriété) et prévenir si une borne a changé
  try {
    await loadStatus(true);
    for (const l of next.plan.legs.slice(next.leg)) {
      const s = status[l.to.id];
      l.to.unusable = !s || !s.returning || s.docks < 1;
      if (s) Object.assign(l.to, { docks: s.docks, risky: s.docks === 1 });
    }
  } catch { /* on garde les dernières données connues */ }
  setTrip(next);
}

const posOr = async s => { try { return await here(); } catch { return [s.lat, s.lon]; } };

async function onFull() {
  const l = trip.plan.legs[trip.leg];
  const riding = Math.round((Date.now() - trip.start) / 1000);
  // même location qui continue : le chrono et les alertes ne bougent pas
  const res = await compute(await posOr(l.to), trip.plan.dest, { riding, exclude: [l.to.id] });
  if (res) { current = null; setTrip({ plan: res, leg: 0, phase: 'velo', start: trip.start }); }
}

async function onNoBike() {
  const s = trip.plan.legs[trip.leg].from;
  if (s.id) signal(s.id);
  const res = await compute(await posOr(s), trip.plan.dest);
  if (res) {
    current = null;
    msg(s.id ? `${s.name} est évitée pendant 2 h.` : '');
    setTrip({ plan: res, leg: 0, phase: res.legs[0]?.from.current ? 'velo' : 'retrait', start: Date.now() });
  }
}

$('stop').onclick = () => setTrip(null);

function tick() {
  if (!trip || trip.phase !== 'velo') return;
  const s = Math.floor((Date.now() - trip.start) / 1000);
  $('chrono').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  $('chrono').className = s >= 1500 ? 'alert' : s >= 1200 ? 'warn' : '';
  $('alert').textContent = s >= 1500 ? 'Déposez le vélo maintenant : gratuit jusqu\'à 30 min.'
    : s >= 1200 ? 'Préparez-vous à déposer le vélo.' : '';
  // hors appli native, pas de notification : on vibre quand l'appli est à l'écran
  if (!LN() && (s === 1200 || s === 1500)) navigator.vibrate?.([300, 100, 300]);
}
setInterval(tick, 1000);

// --- Démarrage -----------------------------------------------------------------------------------

const saved = store.get('trip');
if (saved?.plan?.legs?.length) setTrip(saved);
loadMatrix().catch(() => msg('Matrice des durées introuvable.'));
loadStatus().catch(() => {});
