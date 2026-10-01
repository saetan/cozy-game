// Renderer, camera (orbit / pan / zoom, touch-friendly), lights and the frame loop.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const BG = '#f4f0ea';

export function createScene(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, 90, 260); // locked chunks fade into the fog

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 600);
  camera.position.set(22, 20, 28);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.45;
  controls.minDistance = 8;
  controls.maxDistance = 140;
  controls.screenSpacePanning = false; // pan slides along the ground
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c4, 1.0));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0002;
  Object.assign(key.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, far: 120 });
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xfff4e6, 0.5);
  fill.position.set(-5, 3, -4);
  scene.add(fill);

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  const frameHooks: ((t: number) => void)[] = [];
  renderer.setAnimationLoop(() => {
    const t = performance.now() / 1000;
    key.target.position.copy(controls.target); // shadow box follows the camera focus
    key.position.copy(controls.target).add(new THREE.Vector3(8, 14, 10));
    for (const h of frameHooks) h(t);
    controls.update();
    renderer.render(scene, camera);
  });

  /** While painting tiles the left mouse / one finger must not orbit; two-finger pan/zoom and right-drag pan stay. */
  function setPaintMode(on: boolean) {
    (controls.mouseButtons as { LEFT: unknown }).LEFT = on ? null : THREE.MOUSE.ROTATE;
    (controls.touches as { ONE: unknown }).ONE = on ? null : THREE.TOUCH.ROTATE;
  }

  return { renderer, scene, camera, controls, setPaintMode, onFrame: (h: (t: number) => void) => { frameHooks.push(h); } };
}
