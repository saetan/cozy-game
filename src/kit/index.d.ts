import type { Group, Material, Object3D } from 'three';

export const CELL: number, WALL_H: number, T: number, FOUND_H: number, RISE: number;
export const PITCH: number, PORCH_RISE: number, PORCH_EAVE: number, PORCH_H: number;

export type Species = 'bunny' | 'bear' | 'cat' | 'fox' | 'frog';
export type ActionName = 'stand' | 'walk' | 'wave' | 'carry' | 'work' | 'water' | 'sell' | 'sit' | 'ride' | 'push' | 'walkBike' | 'sow' | 'hoe';
export type Cell = [x: number, z: number];
export type FloorCell = [x: number, z: number, floor: number];

export interface HouseStyle {
  plaster: Material; roof: Material; shutters: boolean; shutterMat: Material;
}
export interface HouseSpec {
  name?: string; note?: string;
  cells: (Cell | FloorCell)[];
  door: Cell; porch: Cell[]; chimney: number | null;
  garage: { cells: Cell[]; door: Cell } | null;
  drive: Cell[]; style: HouseStyle; seed: number;
}
export interface PlanPiece {
  key: string; make: () => Object3D;
  x: number; y: number; z: number; ry: number;
}

export const LEVELS: (HouseSpec & { name: string; note: string })[];
export const LEVEL_STYLE: HouseStyle;
export function buildPlan(spec: HouseSpec, ox?: number, oz?: number): PlanPiece[];
export function house(seed: number): Group;
export function rect(x0: number, x1: number, z0: number, z1: number, f: number): FloorCell[];

export function resident(species: Species, opts?: { outfit?: Material; scarf?: Material; pose?: string }): Group;
export function setAction(res: Group, action: ActionName | string): Group;
export function setPose(res: Group, pose: string): Group;
export function animate(res: Group, t: number): void;
export function board(vehicle: Group, res: Group): Group;
export function alight(vehicle: Group): Group;
export function parkBike(stand: Group, bike: Group, i?: number): Group;
export function unparkBike(bike: Group, parent: Object3D): Group;
export function slotWorld(stand: Group, i?: number): { pos: unknown; ry: number; approach: unknown };
export const WALK_BIKE_OFFSET: unknown;
export function newResident(...args: any[]): Group;
export function defineAction(name: string, def?: { label?: string; pose?: string; setup?: (...a: any[]) => void; tick?: (...a: any[]) => void }): void;
export function actorScene(species: Species, action: ActionName | string): Group;
export const getActors: () => Group[];
export const clearActors: () => void;

export function M(name: string, color: string, rough?: number, metal?: number): Material;
export function box(name: string, w: number, h: number, d: number, mat: Material, x?: number, y?: number, z?: number): Object3D;
export function grp(name: string, ...kids: Object3D[]): Group;
export const P: Record<string, (...args: any[]) => Group>;
export const PLASTER: Record<string, Material>;
export const ROOF: Record<string, Material>;
export const FUR: Record<string, Material>;
export const CLOTH: Record<string, Material>;
export const PAINT: Record<string, Material>;
export const CROPS: string[];
export const SPECIES: Species[];
export const RES_DEFAULT: Record<string, [string, string]>;
export const POSES: Record<string, number[]>;
export const ACTIONS: Record<string, string>;
export const SIDES: Record<string, [number, number, number]>;
export function produce(type: string): Group;
export function crop(type: string, stage?: number, opts?: { thirsty?: boolean }): Group;
export function cropThirsty(type: string): Group;
export function animateMarker(obj: Object3D, t: number): void;
export const GROUND_FX: number, SOW_T: number;
export function hash(...n: unknown[]): number;
export function rng(seed: number): () => number;
export function pick<T>(r: () => number, o: Record<string, T>): T;
