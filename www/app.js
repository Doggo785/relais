import { plan, alternatives, parseStatus, confidence, NoRoute, FREE } from './plan.js';
import { placeFromShared, reverse } from './places.js';
import { createSheet } from './sheet.js';
import { openSearch, favorites, recents, placeLabel } from './search-screen.js';
import { renderRoute, cost, LEG_COLORS } from './route-view.js';

const GBFS = f => `https://bdx.mecatran.com/utw/ws/gbfs/bordeaux/v3/${f}.json?apiKey=opendata-bordeaux-metropole-flux-gtfs-rt`;
const OSRM = 'https://routing.openstreetmap.de/routed-bike';
// Matrice à jour publiée chaque mois sur GitHub Pages (ADR 0003), copie de l'APK en secours
const MATRIX_URLS = ['https://doggo785.github.io/relais/matrix.json', 'matrix.json'];
const TBM_PACKAGE = 'com.infotbm.tbm';
const SIGNAL_MS = 2 * 3600e3;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const msg = t => { $('msg').textContent = t || ''; };
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(`relais.${k}`)) ?? d; } catch { return d; } },
  set: (k, v) => v == null ? localStorage.removeItem(`relais.${k}`) : localStorage.setItem(`relais.${k}`, JSON.stringify(v)),
};
const cap = window.Capacitor;
const plugins = cap?.isNativePlatform?.() ? Object.fromEntries(
  ['LocalNotifications', 'AppLauncher', 'IncomingShare', 'CapacitorHttp'].map(n => [n, cap.registerPlugin(n)])) : {};

// --- Données -------------------------------------------------------------------------------------

let net = null, status = null, statusAt = 0, classicIds = null;

async function getJson(url, timeoutMs = 15000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function loadMatrix() {
  for (const url of MATRIX_URLS) {
    try {
      const m = await getJson(url, 5000);
      // fichier venu du réseau : on vérifie sa forme avant de s'en servir
      if (Array.isArray(m.stations) && Array.isArray(m.dur) && m.dur.length === m.stations.length) {
        net = m;
        drawStations();
        return net;
      }
    } catch { /* source suivante */ }
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
  drawStations();
}

function signaled() {
  const s = Object.fromEntries(Object.entries(store.get('signalees', {})).filter(([, until]) => until > Date.now()));
  store.set('signalees', s);
  return Object.keys(s);
}
const signal = id => store.set('signalees', { ...store.get('signalees', {}), [id]: Date.now() + SIGNAL_MS });

async function withGeometry(p) {
  await Promise.all(p.legs.map(async l => {
    if (l.geometry) return;
    try {
      const r = await getJson(`${OSRM}/route/v1/bike/${l.from.lon},${l.from.lat};${l.to.lon},${l.to.lat}?overview=full&geometries=geojson`);
      l.geometry = r.routes[0].geometry.coordinates.map(([lo, la]) => [la, lo]);
    } catch { l.geometry = [[l.from.lat, l.from.lon], [l.to.lat, l.to.lon]]; } // vol d'oiseau en secours
  }));
  return p;
}

/** Meilleur itinéraire et alternatives, ou null (message affiché par `say`). */
async function computeRoutes(from, to, { riding = null, exclude = [] } = {}, say = msg) {
  say('Calcul…');
  try {
    if (!net) await loadMatrix();
    await loadStatus();
  } catch { say('Données TBM injoignables : vérifiez la connexion.'); return null; }
  const opts = { riding, exclude: new Set([...signaled(), ...exclude]) };
  try {
    const best = plan(net.stations, status, net.dur, from, to, opts);
    const routes = [best, ...alternatives(net.stations, status, net.dur, from, to, opts, best)];
    await withGeometry(best);
    say('');
    return { routes, freshAt: statusAt };
  } catch (e) {
    say(e instanceof NoRoute ? e.message : 'Erreur de calcul.');
    return null;
  }
}

// --- Appareil : GPS, applis externes, alertes ----------------------------------------------------

let lastPos = null;
const here = () => new Promise((ok, ko) => navigator.geolocation.getCurrentPosition(p => {
  lastPos = [p.coords.latitude, p.coords.longitude];
  showPosition();
  ok(lastPos);
}, ko, { enableHighAccuracy: true, timeout: 10000 }));
const posOr = async s => { try { return await here(); } catch { return [s.lat, s.lon]; } };

async function openExternal(url) {
  if (plugins.AppLauncher) await plugins.AppLauncher.openUrl({ url });
  else window.open(url, '_blank');
}
const navigate = (p, mode = 'bicycling') =>
  openExternal(`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}&travelmode=${mode}`);

async function openTbm() {
  try {
    if (!plugins.AppLauncher || !(await plugins.AppLauncher.openUrl({ url: TBM_PACKAGE })).completed) throw new Error();
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
  if (!LN()) return;
  if ((await LN().requestPermissions()).display !== 'granted') {
    return msg('Notifications refusées : les alertes de 20 et 25 min ne sonneront pas.');
  }
  if ((await LN().checkExactNotificationSetting?.())?.exact_alarm === 'denied') {
    msg('Autorisez « Alarmes et rappels » pour Relais : sans ça, les alertes peuvent arriver en retard.');
    await LN().changeExactNotificationSetting();
  }
}

// --- Carte ---------------------------------------------------------------------------------------

const map = L.map('map', { zoomControl: false, attributionControl: false }).setView([44.8378, -0.5792], 13);
L.control.attribution({ prefix: false, position: 'topright' }).addTo(map);
// OpenStreetMap : tuiles 2,5× plus légères que le Plan IGN (réseau lent) ; l'appli s'identifie par son
// User-Agent (capacitor.config.json) comme le demande la politique d'usage OSM. Thème sombre : inversé en CSS.
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">contributeurs OpenStreetMap</a>',
}).addTo(map);
// Bornes : petits points colorés selon leur niveau de confiance, sous le tracé, cachés de loin
map.createPane('stations').style.zIndex = 350;
const stationLayer = L.layerGroup();
const stationRenderer = L.canvas({ pane: 'stations' });
const CONF_COLORS = { ok: '#16a34a', mid: '#f59e0b', low: '#dc2626', off: '#9ca3af' };
const STATION_MIN_ZOOM = 13;

function drawStations() {
  if (!net || !status) return;
  stationLayer.clearLayers();
  for (const s of net.stations) {
    const x = status[s.id];
    L.circleMarker([s.lat, s.lon], { renderer: stationRenderer, radius: 4.5, weight: 1.5, color: '#fff',
      fillColor: CONF_COLORS[confidence(x)], fillOpacity: 0.95 })
      .bindPopup(`<strong>${esc(s.name)}</strong><br>${x ? `${x.classic} vélo${x.classic > 1 ? 's' : ''} classique${x.classic > 1 ? 's' : ''} · ${x.docks} place${x.docks > 1 ? 's' : ''} libre${x.docks > 1 ? 's' : ''}` : 'Muette ou hors service'}`)
      .addTo(stationLayer);
  }
}
const toggleStations = () => map.getZoom() >= STATION_MIN_ZOOM ? stationLayer.addTo(map) : stationLayer.remove();
map.on('zoomend', toggleStations);
toggleStations();

const routeLayer = L.layerGroup().addTo(map);
let posMarker = null;

function showPosition() {
  if (!lastPos) return;
  posMarker ??= L.circleMarker(lastPos, { radius: 8, color: '#fff', weight: 3, fillColor: '#2f80ed', fillOpacity: 1 }).addTo(map);
  posMarker.setLatLng(lastPos);
}

const dot = (ll, fill, title) => L.circleMarker(ll, { radius: 9, color: '#fff', weight: 3, fillColor: fill, fillOpacity: 1 })
  .bindTooltip(esc(title)).addTo(routeLayer);

function fit(bounds) {
  map.invalidateSize();
  map.fitBounds(bounds, { paddingTopLeft: [24, 48], paddingBottomRight: [24, sheet.visible + 24], maxZoom: 16 });
}

function drawRoute(p) {
  routeLayer.clearLayers();
  const walk = (a, b) => L.polyline([a, b], { color: '#6b7280', dashArray: '2 9', weight: 4, lineCap: 'round' }).addTo(routeLayer);
  const legs = p.legs;
  if (legs.length && !legs[0].from.current) walk(p.origin, [legs[0].from.lat, legs[0].from.lon]);
  legs.forEach((l, i) => {
    L.polyline(l.geometry, { color: '#fff', weight: 9, opacity: 0.9 }).addTo(routeLayer); // liseré, lisible sur tout fond
    L.polyline(l.geometry, { color: LEG_COLORS[i % LEG_COLORS.length], weight: 5 }).addTo(routeLayer);
  });
  if (legs.length) walk([legs.at(-1).to.lat, legs.at(-1).to.lon], p.dest); else walk(p.origin, p.dest);
  legs.forEach((l, i) => {
    if (i === 0 && !l.from.current) dot([l.from.lat, l.from.lon], LEG_COLORS[0], `Retrait · ${l.from.name}`);
    dot([l.to.lat, l.to.lon], LEG_COLORS[(i + 1) % LEG_COLORS.length], `${i === legs.length - 1 ? 'Dépôt' : 'Relais'} · ${l.to.name}`);
  });
  dot(p.origin, '#6b7280', 'Départ');
  dot(p.dest, '#111827', 'Arrivée');
  fit(L.featureGroup(routeLayer.getLayers()).getBounds());
}

// Appui long sur la carte : partir d'ici / aller ici
map.on('contextmenu', async e => {
  if (trip) return;
  const ll = [e.latlng.lat, e.latlng.lng];
  const box = document.createElement('div');
  box.className = 'map-popup';
  box.innerHTML = '<strong>Ce point</strong><div class="small muted">…</div><button class="btn" data-f="from">Partir d\'ici</button><button class="btn primary" data-f="to">Aller ici</button>';
  const popup = L.popup({ closeButton: false, minWidth: 200 }).setLatLng(e.latlng).setContent(box).openOn(map);
  const info = await reverse(ll);
  box.querySelector('strong').textContent = info.name;
  box.querySelector('.small').textContent = info.detail;
  box.onclick = ev => {
    const f = ev.target.closest('[data-f]')?.dataset.f;
    if (!f) return;
    map.closePopup(popup);
    choose(f, { ...info, icon: '📍', lat: ll[0], lon: ll[1] });
  };
});

// --- Panneau et vues -----------------------------------------------------------------------------

const sheet = createSheet($('sheet'));

function show(v, state) {
  document.querySelectorAll('[data-view]').forEach(el => { el.hidden = el.id !== v; });
  $('crosshair').hidden = v !== 'pick';
  // bouton d'action hors du panneau : toujours visible, quelle que soit la hauteur du panneau
  const cta = v === 'route' && routeState?.routes[routeState.selected].legs.length;
  $('cta').hidden = !cta;
  $('sheet').classList.toggle('has-cta', !!cta);
  if (cta) $('ctaBtn').textContent = routeState.reroute ? 'Suivre cet itinéraire' : 'Démarrer le trajet';
  requestAnimationFrame(() => {
    // replié = jusqu'au bas du dernier élément utile, plus la barre de gestes d'Android
    const last = { home: '.settings summary', route: '.route-head' }[v];
    const el = last ? $(v).querySelector(last) : $(v);
    const body = $('sheet').querySelector('.sheet-body');
    const bottom = el.getBoundingClientRect().bottom - $('sheet').getBoundingClientRect().top + body.scrollTop;
    sheet.setPeek(bottom + parseFloat(getComputedStyle(body).paddingBottom));
    sheet.set(state ?? 'peek');
  });
}

// --- Accueil : départ et arrivée -----------------------------------------------------------------

const places = { from: { here: true }, to: null };

function renderHome() {
  const set = (id, p, empty) => {
    const label = $(id).querySelector('.label');
    label.textContent = p ? placeLabel(p) : empty;
    label.classList.toggle('empty', !p);
  };
  set('fromField', places.from, 'D\'où pars-tu ?');
  set('toField', places.to, 'Où vas-tu ?');
  const favs = favorites.all();
  $('favChips').innerHTML = favs.map((f, i) =>
    `<button class="chip" data-fav="${i}">${f.slot === 'home' ? '🏠' : f.slot === 'work' ? '💼' : '★'} ${esc(f.label)}</button>`).join('');
  $('favChips').hidden = !favs.length;
}

function choose(field, place) {
  places[field] = place;
  renderHome();
  if (places.from && places.to) planTrip();
  else show('home', 'peek');
}

const search = field => openSearch({
  title: field === 'from' ? 'D\'où pars-tu ?' : 'Où vas-tu ?',
  allowHere: field === 'from',
  stations: net?.stations ?? [],
  near: lastPos,
  onPick: p => choose(field, p),
  onPickOnMap: () => startPick(field),
});

$('fromField').onclick = () => search('from');
$('toField').onclick = () => search('to');
$('swap').onclick = () => {
  [places.from, places.to] = [places.to, places.from];
  renderHome();
  if (places.from && places.to) planTrip();
};
$('favChips').onclick = e => {
  const f = favorites.all()[+e.target.closest('[data-fav]')?.dataset.fav];
  if (f) choose('to', f);
};
$('profil').value = store.get('profil', 'abonne');
$('profil').onchange = () => { store.set('profil', $('profil').value); if (routeState) renderRouteView(); };

// Choisir sur la carte : repère fixe, on déplace la carte dessous
let picking = null;
const startPick = field => { picking = field; show('pick', 'peek'); };
const crosshairLatLng = () => {
  const r = $('crosshair').getBoundingClientRect();
  const ll = map.containerPointToLatLng([r.left + r.width / 2, r.bottom]);
  return [ll.lat, ll.lng];
};
$('pickCancel').onclick = () => { picking = null; show('home'); };
$('pickOk').onclick = async () => {
  const ll = crosshairLatLng(), field = picking;
  picking = null;
  const info = await reverse(ll);
  choose(field, { ...info, icon: '📍', lat: ll[0], lon: ll[1] });
};

// --- Itinéraire ----------------------------------------------------------------------------------

let routeState = null; // {routes, selected, freshAt, destName, reroute}

async function planTrip() {
  show('home', 'peek');
  let from = places.from;
  if (from.here) {
    msg('Position…');
    try { const [lat, lon] = await here(); from = { lat, lon }; } catch { return msg('Position GPS indisponible : choisissez un départ.'); }
  }
  const res = await computeRoutes([from.lat, from.lon], [places.to.lat, places.to.lon]);
  if (!res) return show('home', 'peek');
  routeState = { ...res, selected: 0, destName: placeLabel(places.to) };
  await renderRouteView();
  show('route', 'half');
}

async function renderRouteView() {
  const { routes, selected } = routeState;
  await withGeometry(routes[selected]);
  $('route').innerHTML = renderRoute({ ...routeState, profile: $('profil').value });
  $('cta').hidden = !routes[selected].legs.length;
  drawRoute(routes[selected]);
}

$('route').onclick = async e => {
  const alt = e.target.closest('[data-alt]');
  if (alt) { routeState.selected = +alt.dataset.alt; return renderRouteView(); }
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'close') {
    const reroute = routeState.reroute;
    routeState = null;
    if (reroute) return setTrip(trip);
    routeLayer.clearLayers();
    return show('home');
  }
};

$('ctaBtn').onclick = async () => {
  const p = routeState.routes[routeState.selected], { reroute, destName } = routeState;
  routeState = null;
  if (!reroute) await ensureAlertPermissions();
  const riding = !!p.legs[0].from.current;
  // en cours de route et déjà à vélo : même location, le chrono continue
  const next = { plan: p, destName, leg: 0, phase: riding ? 'velo' : 'retrait', start: riding && trip ? trip.start : Date.now() };
  if (trip) advance(next); else setTrip(next); // changement d'itinéraire en route : on peut revenir à l'ancien
};

// --- Mode trajet ---------------------------------------------------------------------------------
// trip = {plan, destName, leg, phase: 'retrait' | 'velo', start, history} ; enregistré : Android peut fermer l'appli.
// history garde les états précédents pour revenir en arrière après une fausse manip.

let trip = null;
const HISTORY_MAX = 20;
/** Avance le trajet en gardant l'état courant dans l'historique. */
const advance = changes => setTrip({ ...trip, ...changes,
  history: [...(trip.history ?? []), { ...trip, history: undefined }].slice(-HISTORY_MAX) });

async function onBack() {
  if (!trip.history?.length) { // tout début du trajet : retour à l'aperçu de l'itinéraire
    const { plan: p, destName } = trip;
    await cancelAlerts();
    trip = null;
    store.set('trip', null);
    routeState = { routes: [p], selected: 0, freshAt: statusAt || Date.now(), destName };
    await renderRouteView();
    return show('route', 'half');
  }
  const prev = trip.history.at(-1);
  setTrip({ ...prev, history: trip.history.slice(0, -1) });
  // les alertes suivent l'état restauré : chrono de la location d'alors, ou rien si pas encore à vélo
  if (prev.phase === 'velo') await scheduleAlerts(prev.start); else await cancelAlerts();
  tripMsg('Retour à l\'étape précédente.');
}

function setTrip(t) {
  trip = t;
  store.set('trip', t);
  if (!t) {
    cancelAlerts();
    routeLayer.clearLayers();
    return show('home');
  }
  renderTrip();
  show('trip', 'peek');
  drawRoute(t.plan);
}

const button = (label, onclick, cls = '') => {
  const b = document.createElement('button');
  b.className = `btn ${cls}`; b.textContent = label; b.onclick = onclick;
  return b;
};
const row = (...els) => { const d = document.createElement('div'); d.className = 'btn-row'; d.append(...els); return d; };
const tripMsg = t => { $('tripMsg').textContent = t || ''; };
const plural = (n, w) => `${n} ${n > 1 ? w.replace(/(\S+)/g, '$1s') : w}`;

function renderTrip() {
  const { plan: p, leg: i, phase } = trip, l = p.legs[i], last = i === p.legs.length - 1;
  $('tripStep').textContent = `Étape ${i + 1} sur ${p.legs.length} · vers ${trip.destName ?? 'l\'arrivée'}`;
  $('chronoBox').hidden = phase !== 'velo';
  $('back').setAttribute('aria-label', trip.history?.length ? 'Revenir à l\'étape précédente' : 'Revenir à l\'itinéraire');
  if (phase === 'retrait') {
    const relay = i > 0;
    $('tripTitle').textContent = `${relay ? 'Relais' : 'Retrait'} · ${l.from.name}`;
    $('tripInfo').innerHTML = relay ? 'Déposez le vélo puis reprenez-le : nouvelle location, de nouveau 30 min gratuites.'
      : `${plural(l.from.classic, 'vélo classique annoncé')}${l.from.risky ? ' <span class="badge">⚠ risqué</span>' : ''}`;
    $('tripButtons').replaceChildren(
      ...(i === 0 && p.walkStartMin ? [row(button('🚶 Y aller à pied', () => navigate(l.from, 'walking')))] : []),
      row(button('🔓 Débloquer', openTbm), button('Vélo retiré', onRented, 'primary')),
      row(button('Aucun vélo ne se débloque', onNoBike, 'warn')),
    );
  } else {
    $('tripTitle').textContent = `${last ? 'Dépôt' : 'Relais'} · ${l.to.name}`;
    $('tripInfo').innerHTML = (l.to.unusable ? '<span class="badge">⚠ n\'annonce plus de place libre</span> Visez une borne de secours.'
      : `${Math.round(l.min)} min à vélo · ${plural(l.to.docks, 'place libre')}${l.to.risky ? ' <span class="badge">⚠ risqué</span>' : ''}`) +
      (l.backups?.length ? `<br>Secours : ${l.backups.map(b => esc(b.name)).join(', ')}` : '');
    $('tripButtons').replaceChildren(
      row(button('🧭 Naviguer', () => navigate(l.to)), button(last ? 'Vélo déposé · arrivé' : 'Vélo déposé', onDocked, 'primary')),
      row(button('Borne pleine', onFull, 'warn')),
    );
  }
  tick();
}

async function onRented() {
  advance({ phase: 'velo', start: Date.now() });
  await scheduleAlerts(trip.start);
}

async function onDocked() {
  await cancelAlerts();
  if (trip.leg === trip.plan.legs.length - 1) {
    const p = trip.plan;
    setTrip(null);
    return msg(`Arrivé ! Coût : ${cost(p, $('profil').value)}.`);
  }
  const next = { leg: trip.leg + 1, phase: 'retrait' };
  // disponibilités relues à chaque relais (ADR 0004, sobriété) : prévenir si une borne a changé
  try {
    await loadStatus(true);
    for (const l of trip.plan.legs.slice(next.leg)) {
      const s = status[l.to.id];
      l.to.unusable = !s || !s.returning || s.docks < 1;
      if (s) Object.assign(l.to, { docks: s.docks, risky: s.docks === 1 });
    }
  } catch { /* on garde les dernières données connues */ }
  advance(next);
}

async function onFull() {
  const l = trip.plan.legs[trip.leg];
  const riding = Math.round((Date.now() - trip.start) / 1000);
  const res = await computeRoutes(await posOr(l.to), trip.plan.dest, { riding, exclude: [l.to.id] }, tripMsg);
  if (res) advance({ plan: await withGeometry(res.routes[0]), leg: 0, phase: 'velo' }); // même location
}

async function onNoBike() {
  const s = trip.plan.legs[trip.leg].from;
  if (s.id) signal(s.id);
  const res = await computeRoutes(await posOr(s), trip.plan.dest, {}, tripMsg);
  if (!res) return;
  const p = await withGeometry(res.routes[0]);
  advance({ plan: p, leg: 0, phase: p.legs[0]?.from.current ? 'velo' : 'retrait', start: Date.now() });
  tripMsg(s.id ? `${s.name} est évitée pendant 2 h.` : '');
}

$('reroute').onclick = async () => {
  const l = trip.plan.legs[trip.leg], velo = trip.phase === 'velo';
  const from = await posOr(velo ? l.to : l.from);
  const res = await computeRoutes(from, trip.plan.dest,
    velo ? { riding: Math.round((Date.now() - trip.start) / 1000) } : {}, tripMsg);
  if (!res) return;
  routeState = { ...res, selected: 0, destName: trip.destName, reroute: true };
  await renderRouteView();
  show('route', 'half');
};
$('back').onclick = onBack;
$('stop').onclick = () => { if (confirm('Arrêter le trajet ?')) setTrip(null); };

function tick() {
  if (!trip || trip.phase !== 'velo') return;
  const s = Math.floor((Date.now() - trip.start) / 1000);
  const level = s >= 1500 ? 'alert' : s >= 1200 ? 'warn' : '';
  $('chrono').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  $('chrono').className = `chrono ${level}`;
  $('freeBar').className = `free-bar ${level}`;
  $('freeBar').firstElementChild.style.width = `${Math.min(100, s / FREE * 100)}%`;
  $('freeLeft').textContent = s < FREE ? `Gratuit encore ${Math.ceil((FREE - s) / 60)} min` : 'Location payante depuis 30 min';
  $('tripAlert').textContent = level === 'alert' ? 'Déposez le vélo maintenant.' : level === 'warn' ? 'Préparez-vous à déposer le vélo.' : '';
  $('tripAlert').className = `trip-alert ${level}`;
  // hors appli native, pas de notification : on vibre quand l'appli est à l'écran
  if (!LN() && (s === 1200 || s === 1500)) navigator.vibrate?.([300, 100, 300]);
}
setInterval(tick, 1000);

// --- Lieu partagé depuis Google Maps (ADR 0010) --------------------------------------------------

const resolveUrl = async url => (await plugins.CapacitorHttp.get({ url })).url;

async function handleShared() {
  const text = (await plugins.IncomingShare?.take())?.text;
  if (!text) return;
  if (trip) return tripMsg('Lieu partagé ignoré : un trajet est en cours.');
  show('home');
  msg('Lieu partagé : recherche…');
  const place = await placeFromShared(text, plugins.CapacitorHttp ? resolveUrl : null);
  if (!place) return msg('Lieu partagé introuvable dans la métropole.');
  recents.add(place);
  choose('to', place);
}
plugins.IncomingShare?.addListener('share', handleShared);

// --- Démarrage -----------------------------------------------------------------------------------

renderHome();
const saved = store.get('trip');
if (saved?.plan?.legs?.length) setTrip(saved); else show('home');
loadMatrix().catch(() => msg('Matrice des durées introuvable.'));
loadStatus().catch(() => {});
handleShared();
