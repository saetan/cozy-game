import { describe, expect, it } from 'vitest';
import { advance, apply, createSim } from '../src/sim/sim';
import { canStore } from '../src/sim/jobs';
import balance from '../src/data/balance.json';
import { deserialize, serialize, type SaveData } from '../src/systems/save';

/** A real version 1 save: crateCrop did not exist, so a plot holding crates has none. */
function v1Save(): SaveData {
  const sim = createSim({ seed: 1 });
  apply(sim, { type: 'placeBuilding', building: 'house', rotation: 0, origin: [0, 0] });
  const id = (apply(sim, { type: 'placeBuilding', building: 'farmPlot', rotation: 0, origin: [0, 6] }) as { id: number }).id;
  const plot = sim.buildings.get(id)!;
  plot.plotState = 'ripe'; plot.crates = 1; plot.crop = 'carrot'; plot.growCrop = 'carrot';
  const d = JSON.parse(JSON.stringify(serialize(sim, 5))) as any;
  d.version = 1; delete d.sim.unlockedCrops; delete d.sim.chunksBought; delete d.sim.streets; d.sim.tiles = [];
  for (const r of d.sim.residents) delete r.vehicle;
  for (const b of d.sim.buildings) { delete b.crateCrop; delete b.growCrop; }
  return d as SaveData;
}

describe('plots with crates but no crateCrop (version 1 saves)', () => {
  it('canStore treats them as holding the plot crop', () => {
    expect(canStore({ crates: 1, crop: 'carrot' } as never, 'carrot')).toBe(true);
    expect(canStore({ crates: balance.maxCrates, crop: 'carrot' } as never, 'carrot')).toBe(false);
  });
  it('a loaded version 1 save harvests once, with no job storm', () => {
    const sim = deserialize(v1Save());
    const plot = [...sim.buildings.values()].find(b => b.type === 'farmPlot')!;
    expect(plot.crateCrop).toBeUndefined();
    let posted = 0;
    const next = sim.nextJobId;
    advance(sim, 600);
    posted = sim.nextJobId - next;
    expect(sim.stats.harvested).toBeGreaterThan(0);
    expect(posted).toBeLessThan(15); // the looping guard posted a harvest job every tick
  });
});
