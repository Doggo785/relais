// Écran de recherche de lieu plein écran : Ma position, favoris, récents, résultats, choix sur la carte.
import { searchPlaces } from './places.js';
import { distM } from './plan.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const fmtDist = m => m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
const samePlace = (a, b) => a && b && Math.abs(a.lat - b.lat) < 1e-5 && Math.abs(a.lon - b.lon) < 1e-5;

// --- Favoris et récents (gardés sur le téléphone) ------------------------------------------------

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(`relais.${k}`)) ?? d; } catch { return d; } };
const write = (k, v) => localStorage.setItem(`relais.${k}`, JSON.stringify(v));
const SLOTS = { home: { label: 'Maison', icon: '🏠' }, work: { label: 'Travail', icon: '💼' } };
const strip = ({ name, detail, icon, lat, lon }) => ({ name, detail, icon, lat, lon });

export const favorites = {
  all: () => read('favoris', []),
  slot: s => favorites.all().find(f => f.slot === s) ?? null,
  find: p => favorites.all().find(f => samePlace(f, p)) ?? null,
  /** Favori de type Maison/Travail (slot) ou personnel (label choisi par l'utilisateur). */
  save(place, { slot = null, label = null } = {}) {
    const rest = favorites.all().filter(f => !(slot && f.slot === slot) && !samePlace(f, place));
    write('favoris', [...rest, { ...strip(place), slot, label: slot ? SLOTS[slot].label : label }]);
  },
  remove: p => write('favoris', favorites.all().filter(f => !samePlace(f, p))),
};

export const recents = {
  all: () => read('recents', []),
  add: p => write('recents', [strip(p), ...recents.all().filter(r => !samePlace(r, p))].slice(0, 10)),
};

/** Libellé court d'un lieu choisi, pour les champs départ/arrivée. */
export const placeLabel = p => p.here ? 'Ma position' : favorites.find(p)?.label ?? p.name;

// --- Écran ---------------------------------------------------------------------------------------

/**
 * opts : {title, allowHere, stations, near: [lat, lon] | null, onPick(place), onPickOnMap()}
 * place = {name, detail, icon, lat, lon} ou {here: true} pour « Ma position ».
 */
export function openSearch(opts) {
  const root = document.createElement('div');
  root.className = 'search-screen';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', opts.title);
  root.innerHTML = `
    <div class="search-bar">
      <button class="icon-btn" data-act="back" aria-label="Retour">←</button>
      <input type="search" enterkeyhint="search" autocomplete="off" placeholder="${esc(opts.title)}" aria-label="${esc(opts.title)}">
      <button class="icon-btn" data-act="clear" aria-label="Effacer" hidden>✕</button>
    </div>
    <div class="search-list" role="list"></div>`;
  document.body.append(root);
  const input = root.querySelector('input'), list = root.querySelector('.search-list'), clear = root.querySelector('[data-act=clear]');
  let results = [], seq = 0, timer, setting = null; // setting = slot Maison/Travail en cours de définition

  const close = () => { root.remove(); removeEventListener('popstate', onBack); };
  const onBack = () => close();
  history.pushState({ search: true }, ''); // le bouton retour d'Android ferme l'écran
  addEventListener('popstate', onBack);
  const leave = () => history.back();

  const pick = place => {
    if (setting) favorites.save(place, { slot: setting });
    if (!place.here) recents.add(place);
    leave();
    opts.onPick(place);
  };

  const row = (p, i, { icon = p.icon, name = p.name, detail = p.detail, star = true } = {}) => {
    const fav = favorites.find(p);
    const dist = opts.near && !p.here && p.lat != null ? fmtDist(distM(opts.near, [p.lat, p.lon])) : '';
    return `<div class="row-item" role="listitem">
      <button class="row-main" data-pick="${i}">
        <span class="ico" aria-hidden="true">${icon}</span>
        <span class="txt"><span class="name">${esc(name)}</span>${detail ? `<span class="detail">${esc(detail)}</span>` : ''}</span>
        ${dist ? `<span class="dist">${dist}</span>` : ''}
      </button>
      ${star ? `<button class="star" data-star="${i}" aria-pressed="${!!fav}" aria-label="${fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}">${fav ? '★' : '☆'}</button>` : ''}
    </div>`;
  };

  function renderHome() {
    const rows = [];
    let h = '';
    if (opts.allowHere && !setting) {
      rows.push({ here: true });
      h += row({ here: true }, 0, { icon: '📍', name: 'Ma position', detail: 'Mesurée au moment du calcul', star: false });
    }
    if (!setting) {
      h += '<p class="section-title">Favoris</p>';
      for (const slot of Object.keys(SLOTS)) {
        const f = favorites.slot(slot);
        const i = rows.push(f ?? { setSlot: slot }) - 1;
        h += f ? row(f, i, { icon: SLOTS[slot].icon, name: SLOTS[slot].label, detail: f.name })
          : row({}, i, { icon: '＋', name: `Ajouter ${SLOTS[slot].label}`, detail: '', star: false });
      }
      for (const f of favorites.all().filter(f => !f.slot)) h += row(f, rows.push(f) - 1, { icon: '★', name: f.label, detail: f.name });
      const rec = recents.all();
      if (rec.length) {
        h += '<p class="section-title">Récents</p>';
        for (const r of rec) h += row(r, rows.push(r) - 1, { icon: '🕘' });
      }
    }
    h += row({}, rows.push({ onMap: true }) - 1, { icon: '🗺️', name: 'Choisir sur la carte', detail: 'Placez le repère sur le lieu', star: false });
    results = rows;
    list.innerHTML = h;
  }

  async function renderSearch(q) {
    const my = ++seq;
    list.innerHTML = '<p class="empty-hint">Recherche…</p>';
    const found = await searchPlaces(q, { stations: opts.stations, near: opts.near ?? undefined });
    if (my !== seq) return; // une saisie plus récente a pris le relais
    results = found;
    list.innerHTML = found.length ? found.map((p, i) => row(p, i)).join('')
      : '<p class="empty-hint">Aucun lieu trouvé dans la métropole.<br>Essayez une adresse ou « Choisir sur la carte ».</p>';
  }

  const refresh = () => {
    const q = input.value.trim();
    clear.hidden = !q;
    clearTimeout(timer);
    if (q.length < 2) { seq++; renderHome(); return; }
    timer = setTimeout(() => renderSearch(q), 250);
  };

  input.addEventListener('input', refresh);
  root.addEventListener('click', e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'back') return leave();
    if (act === 'clear') { input.value = ''; refresh(); input.focus(); return; }
    const star = e.target.closest('[data-star]');
    if (star) {
      const p = results[+star.dataset.star];
      if (favorites.find(p)) {
        if (confirm(`Retirer « ${placeLabel(p)} » des favoris ?`)) favorites.remove(p);
      } else {
        const label = prompt('Nom du favori', p.name);
        if (label?.trim()) favorites.save(p, { label: label.trim() });
      }
      return input.value.trim().length >= 2 ? list.querySelectorAll('[data-star]').forEach(b => {
        const f = favorites.find(results[+b.dataset.star]);
        b.textContent = f ? '★' : '☆'; b.setAttribute('aria-pressed', !!f);
      }) : renderHome();
    }
    const p = results[+e.target.closest('[data-pick]')?.dataset.pick];
    if (!p) return;
    if (p.setSlot) {
      setting = p.setSlot;
      input.placeholder = `Adresse de ${SLOTS[setting].label}`;
      input.value = ''; refresh(); input.focus();
      return;
    }
    if (p.onMap) { leave(); return opts.onPickOnMap(); }
    pick(p);
  });

  renderHome();
  input.focus();
}
