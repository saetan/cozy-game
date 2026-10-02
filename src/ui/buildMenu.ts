// Build menu: cost labels and affordability, refreshed whenever coins change.
import { canAfford, costOf, type CostKey } from '../sim/costs';
import type { SimState } from '../sim/state';

const COSTED: Record<string, CostKey> = { house: 'house', farmPlot: 'farmPlot', path: 'path', road: 'road' };
const PER_TILE = new Set(['path', 'road']);

export function createBuildMenu(sim: SimState, root: HTMLElement) {
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('.build-btn, .tile-btn')];
  let last = NaN;
  return {
    update() {
      if (sim.coins === last) return;
      last = sim.coins;
      for (const b of buttons) {
        const id = b.dataset.type ?? b.dataset.tool ?? '', key = COSTED[id];
        if (!key) continue;
        const cost = costOf(key);
        const label = b.querySelector('.cost');
        if (label) label.textContent = `· ${cost.coins}${PER_TILE.has(id) ? ' / tile' : ''}`;
        b.disabled = !canAfford(sim, cost);
        b.title = b.disabled ? 'Not enough coins' : '';
      }
    },
  };
}
