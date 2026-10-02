// "While you were away" panel. summaryLines is pure so it can be unit-tested.
import { LEVELS } from '../kit/index.js';
import { formatAway, MIN_SUMMARY_SECONDS, type AwaySummary } from '../systems/catchup';
import balance from '../data/balance.json';
import type { SimState } from '../sim/state';
import { el } from './dom';

export const shouldShowAway = (s: AwaySummary) => s.simSeconds >= MIN_SUMMARY_SECONDS;

export function summaryLines(s: AwaySummary, sim: SimState): { title: string; lines: string[] } {
  const title = `While you were away (${formatAway(s.realSeconds)})`;
  const lines: string[] = [];
  if (s.capped) lines.push(`(capped at ${balance.offlineCapHours} h)`);
  lines.push(`Coins earned: ${s.coins}`, `Crops harvested: ${s.stats.harvested}`, `Crops sold: ${s.stats.sold}`,
    `${s.days} ${s.days === 1 ? 'day' : 'days'} passed`);
  for (const e of s.log) {
    if (e.kind === 'arrival') {
      const r = sim.residents.get(e.residentId);
      if (r) lines.push(`${r.name} the ${r.species} moved in`);
    } else lines.push(`House grew to Lv ${e.level} · ${LEVELS[e.level - 1].name}`);
  }
  return { title, lines };
}

export function showAway(root: HTMLElement, s: AwaySummary, sim: SimState) {
  const card = root.querySelector<HTMLElement>('#away-card')!;
  const { title, lines } = summaryLines(s, sim);
  const ok = el('button', { id: 'away-ok', class: 'primary' }, 'OK');
  ok.addEventListener('click', () => { card.hidden = true; card.replaceChildren(); });
  const ul = el('ul', {}); for (const l of lines) ul.append(el('li', {}, l));
  card.replaceChildren(el('div', { class: 'card-title' }, title), ul, el('div', { class: 'card-actions' }, ok));
  card.hidden = false;
}
