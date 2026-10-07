// Shown instead of the game when the stored save cannot be loaded. Nothing is written or cleared until the player picks "Start a new village".
import type { SaveData, SaveProblem, SaveStore } from '../systems/save';
import { el } from './dom';
import { downloadSave } from './saveMenu';

export const recoveryMessage = (reason: SaveProblem) => reason === 'unsupported-version'
  ? 'Your village was saved by a newer version of the game, so this version cannot open it.'
  : 'Your saved village looks damaged, so the game cannot open it.';

export function showRecovery(root: HTMLElement, o: { reason: SaveProblem; data: SaveData }, store: SaveStore) {
  const exportBtn = el('button', { id: 'recovery-export', class: 'wide' }, 'Export this save');
  exportBtn.addEventListener('click', () => downloadSave(o.data));
  const newBtn = el('button', { id: 'recovery-new', class: 'wide' }, 'Start a new village');
  newBtn.addEventListener('click', async () => {
    if (!confirm('Start a new village? The saved village will be replaced and cannot be recovered. Export it first if you want to keep a copy.')) return;
    await store.clear();
    location.reload();
  });
  root.append(el('div', { id: 'recovery-card', class: 'ui-panel', role: 'alertdialog' },
    el('div', { class: 'card-title' }, "Can't open your village"),
    el('p', { id: 'recovery-msg' }, recoveryMessage(o.reason)),
    el('p', {}, 'Export a copy first if you want to keep it. Starting a new village replaces the saved one.'),
    el('div', { class: 'card-actions' }, exportBtn, newBtn)));
}
