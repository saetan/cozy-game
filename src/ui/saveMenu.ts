// Export / Import / New village buttons. Import and New reload the page so every view is rebuilt from the store.
import { deserialize, type SaveData, type SaveStore } from '../systems/save';

/** Downloads a save as a JSON file (also used by the recovery screen). */
export function downloadSave(data: SaveData) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = `cozy-village-${new Date().toISOString().slice(0, 10)}.json`;
  a.click(); URL.revokeObjectURL(url);
}

export function createSaveMenu(o: { root: HTMLElement; store: SaveStore; snapshot: () => SaveData; say: (m: string) => void; stopSaving: () => void }) {
  const $ = <T extends HTMLElement>(id: string) => o.root.querySelector<T>('#' + id)!;
  const file = $<HTMLInputElement>('import-file');
  $('export-btn').addEventListener('click', () => downloadSave(o.snapshot()));
  $('import-btn').addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files?.[0]; file.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text()) as SaveData;
      deserialize(data); // validates; throws on a bad file
      o.stopSaving(); // else the unload auto-save would overwrite the import
      await o.store.save(data);
      location.reload();
    } catch (e) { o.say(`Import failed: ${e instanceof Error ? e.message : 'bad file'}`); }
  });
  $('new-btn').addEventListener('click', async () => {
    if (!confirm('Start a new village? Your current village will be lost.')) return;
    o.stopSaving();
    await o.store.clear();
    location.reload();
  });
}
