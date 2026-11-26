// Panneau glissant à trois hauteurs (replié, mi-hauteur, déplié), comme les applis de cartes.
// On le tire par sa poignée ou par tout élément marqué data-drag ; un appui sur la poignée le monte d'un cran.

export function createSheet(el, { onChange } = {}) {
  const ORDER = ['peek', 'half', 'full'];
  let state = 'peek', peekPx = 220;
  const full = () => el.getBoundingClientRect().height;
  const px = s => s === 'peek' ? Math.min(peekPx, full()) : s === 'half' ? Math.min(Math.round(innerHeight * 0.55), full()) : full();

  function set(s) {
    state = s;
    el.style.removeProperty('transform');
    el.style.setProperty('--sheet-visible', `${px(s)}px`);
    onChange?.(s, px(s));
  }

  let drag = null;
  el.addEventListener('pointerdown', e => {
    if (!e.target.closest('.handle-zone, [data-drag]') || e.target.closest('button:not(.handle-zone), input, select, a')) return;
    drag = { y: e.clientY, visible: px(state), moved: false, t: e.timeStamp, lastY: e.clientY, lastT: e.timeStamp, v: 0 };
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', e => {
    if (!drag) return;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.abs(dy) < 8) return;
    drag.moved = true;
    el.classList.add('dragging');
    drag.v = (e.clientY - drag.lastY) / Math.max(1, e.timeStamp - drag.lastT); // px/ms, > 0 vers le bas
    drag.lastY = e.clientY; drag.lastT = e.timeStamp;
    const visible = Math.max(px('peek') * 0.6, Math.min(full(), drag.visible - dy));
    el.style.transform = `translateY(${full() - visible}px)`;
  });
  const end = e => {
    if (!drag) return;
    const d = drag; drag = null;
    el.classList.remove('dragging');
    if (!d.moved) {
      if (e.target.closest('.handle-zone')) set(ORDER[(ORDER.indexOf(state) + 1) % ORDER.length]);
      return;
    }
    const visible = d.visible - (e.clientY - d.y);
    if (Math.abs(d.v) > 0.5) { // geste rapide : un cran dans le sens du geste
      const i = ORDER.indexOf(state) + (d.v < 0 ? 1 : -1);
      return set(ORDER[Math.max(0, Math.min(ORDER.length - 1, i))]);
    }
    set(ORDER.reduce((a, b) => Math.abs(px(b) - visible) < Math.abs(px(a) - visible) ? b : a));
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  addEventListener('resize', () => set(state));

  return {
    set,
    get state() { return state; },
    get visible() { return px(state); },
    /** Hauteur du panneau replié, ajustée au contenu de la vue courante. */
    setPeek(h) { peekPx = h; if (state === 'peek') set('peek'); },
  };
}
