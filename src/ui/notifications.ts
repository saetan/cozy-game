// Arrival cards (queued, dismissed with OK) and level-up toasts. Reads sim.log by index; never mutates it.
import { LEVELS } from '../kit/index.js';
import { traitInfo } from '../sim/traits';
import type { SimState } from '../sim/state';
import { el } from './dom';

export function createNotifications(sim: SimState, root: HTMLElement) {
  const card = root.querySelector<HTMLElement>('#arrival-card')!, toast = root.querySelector<HTMLElement>('#toast')!;
  let seen = sim.log.length; // entries from before the UI existed (e.g. the demo village) are not announced
  const queue: number[] = []; // resident ids waiting for their card
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  function showCard() {
    const r = queue.length ? sim.residents.get(queue[0]) : undefined;
    if (!r) { card.hidden = true; card.replaceChildren(); return; }
    const t = traitInfo(r), ok = el('button', { id: 'arrival-ok', class: 'primary' }, 'OK');
    ok.addEventListener('click', () => { queue.shift(); showCard(); });
    card.hidden = false;
    card.replaceChildren(
      el('div', { class: 'card-title' }, `${r.name} the ${r.species} moved in!`),
      el('div', { class: 'card-trait' }, `${t.name} — ${t.desc}`),
      el('div', { class: 'card-actions' }, ok, queue.length > 1 ? el('span', { class: 'card-more' }, `${queue.length - 1} more arriving`) : ''),
    );
  }
  function say(msg: string) {
    toast.textContent = msg; toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2800);
  }
  card.hidden = true; toast.hidden = true;
  return {
    say,
    update() {
      while (seen < sim.log.length) {
        const e = sim.log[seen++];
        if (e.kind === 'arrival') { queue.push(e.residentId); showCard(); }
        else say(`House grew to Lv ${e.level} · ${LEVELS[e.level - 1].name}`);
      }
    },
  };
}
