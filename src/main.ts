// Game entry: chunked world, camera, and the House placement mode.
import { createScene } from './render/scene';
import { createChunkView } from './render/chunkView';
import { HOUSE_FOOTPRINT, createHouseObject, setHousePose, stepTweens } from './render/houseView';
import { createPlacementMode } from './ui/placementMode';
import { createWorld } from './sim/world';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const { scene, camera, onFrame } = createScene(canvas);
const world = createWorld();
scene.add(createChunkView(world).root);

createPlacementMode({
  canvas, scene, camera, world, footprint: HOUSE_FOOTPRINT, root: document.body,
  onPlaced: p => {
    const house = createHouseObject(undefined, true, performance.now() / 1000);
    setHousePose(house, p.footprint, p.rotation, p.origin[0], p.origin[1]);
    scene.add(house);
  },
});

onFrame(t => stepTweens(t));
