// Itinéraire en ligne verticale (heure d'arrivée, étapes, secours dépliables) et choix des alternatives.
import { RELAY_S } from './plan.js';

export const LEG_COLORS = ['#7c5cff', '#0ea5a4', '#f97316', '#e11d74', '#2f80ed', '#65a30d'];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const plural = (n, w) => `${n} ${n > 1 ? w.replace(/(\S+)/g, '$1s') : w}`;
const clock = t => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
export const cost = (p, profile) => profile === 'occasionnel' ? `${p.newRentals} €` : '0 €';

const rentInfo = s => `${plural(s.classic, 'vélo classique')}${s.risky ? ' <span class="badge">⚠ risqué</span>' : ''}`;
const dockInfo = s => `${plural(s.docks, 'place libre')}${s.risky ? ' <span class="badge">⚠ risqué</span>' : ''}`;
const backupList = (list, info) => list?.length
  ? `Bornes de secours à moins de 400 m :<ul>${list.map(b => `<li>${esc(b.name)} · ${info(b)}</li>`).join('')}</ul>`
  : 'Aucune borne de secours à moins de 400 m.';

function item({ cls = '', color, what, meta, time, more }) {
  const head = `<span class="what">${what}</span>${time ? `<span class="meta" style="float:right">${time}</span>` : ''}
    ${meta ? `<div class="meta">${meta}</div>` : ''}`;
  return `<li class="tl ${cls}" style="${color ? `--c:${color}` : ''}"><span class="pin" aria-hidden="true"></span>
    ${more ? `<details><summary class="head">${head}</summary><div class="more">${more}</div></details>` : `<div class="head">${head}</div>`}</li>`;
}

/** Ligne verticale d'un itinéraire, avec l'heure prévue à chaque point. */
export function timeline(p, destName, start = Date.now()) {
  let t = start;
  const at = min => { t += min * 60e3; return clock(t); };
  const out = [];
  if (!p.legs.length) {
    out.push(item({ cls: 'walk', what: `🚶 ${Math.round(p.totalMin)} min à pied`, time: clock(t) }));
    out.push(item({ what: esc(destName), meta: 'Arrivée', time: at(p.totalMin) }));
    return `<ol class="timeline">${out.join('')}</ol>`;
  }
  const first = p.legs[0];
  if (first.from.current) {
    out.push(item({ color: LEG_COLORS[0], what: 'Votre position', meta: 'Vous êtes déjà à vélo', time: clock(t) }));
  } else {
    if (p.walkStartMin) out.push(item({ cls: 'walk', what: `🚶 ${Math.round(p.walkStartMin)} min à pied`, time: clock(t) }));
    out.push(item({ color: LEG_COLORS[0], what: `Retrait · ${esc(first.from.name)}`, meta: rentInfo(first.from),
      time: at(p.walkStartMin), more: backupList(first.from.backups, rentInfo) }));
  }
  p.legs.forEach((l, i) => {
    const last = i === p.legs.length - 1;
    const color = LEG_COLORS[i % LEG_COLORS.length], next = LEG_COLORS[(i + 1) % LEG_COLORS.length];
    out.push(item({ color, what: `🚲 ${Math.round(l.min)} min à vélo`, meta: `Étape ${i + 1} sur ${p.legs.length} · gratuite` }));
    out.push(item({ color: last ? undefined : next,
      what: `${last ? 'Dépôt' : 'Relais'} · ${esc(l.to.name)}`,
      meta: `${last ? '' : 'Déposez puis reprenez votre vélo · '}${dockInfo(l.to)}`,
      time: at(l.min + (last ? 0 : RELAY_S / 60)), more: backupList(l.backups, dockInfo) }));
  });
  if (p.walkEndMin) out.push(item({ cls: 'walk', what: `🚶 ${Math.round(p.walkEndMin)} min à pied` }));
  out.push(item({ what: esc(destName), meta: 'Arrivée', time: at(p.walkEndMin) }));
  return `<ol class="timeline">${out.join('')}</ol>`;
}

/**
 * Vue complète : en-tête (heure d'arrivée, résumé), alternatives, ligne verticale.
 * routes = [meilleur, ...alternatives] ; data-alt et data-act="close" sont gérés par l'appelant.
 */
export function renderRoute({ routes, selected, profile, destName, freshAt }) {
  const p = routes[selected], best = routes[0];
  const arrival = clock(Date.now() + p.totalMin * 60e3);
  const sum = p.legs.length
    ? `${Math.round(p.totalMin)} min · ${p.relays} relais · ${cost(p, profile)}`
    : `${Math.round(p.totalMin)} min à pied, c'est le plus rapide`;
  const alts = routes.length > 1 ? `<div class="alts" role="radiogroup" aria-label="Itinéraires">${routes.map((r, i) => `
      <button class="alt${i === selected ? ' selected' : ''}" role="radio" aria-checked="${i === selected}" data-alt="${i}">
        <div class="t">${Math.round(r.totalMin)} min${i ? ` <span class="small muted">+${Math.max(0, Math.round(r.totalMin - best.totalMin))}</span>` : ''}</div>
        <div class="l">${esc(r.label ?? 'Recommandé')} · ${r.relays} relais</div>
      </button>`).join('')}</div>` : '';
  return `
    <div class="route-head" data-drag>
      <div class="txt"><div class="arrival">Arrivée ${arrival}</div><div class="summary">${sum}</div></div>
      <button class="icon-btn" data-act="close" aria-label="Fermer l'itinéraire">✕</button>
    </div>
    ${alts}
    ${timeline(p, destName)}
    <p class="small muted">Disponibilités relevées à ${clock(freshAt)}. Les bornes peuvent changer d'ici là.</p>
`;
}
