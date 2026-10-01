// Trait effects (balance.traits). Pure lookups used by the economy.
import balance from '../data/balance.json';
import type { Resident } from './state';

type TraitDef = { name: string; desc: string; speed?: Record<string, number>; carry?: number; workStartDelay?: number };
const def = (r: Pick<Resident, 'trait'>): TraitDef => balance.traits[r.trait] as TraitDef;

export const traitInfo = (r: Pick<Resident, 'trait'>): { name: string; desc: string } => def(r);
/** Task-duration divisor from the trait for a balance.times key (1 = no effect). Stacks with the specialist multiplier. */
export const traitSpeed = (r: Resident, time: string): number => def(r).speed?.[time] ?? 1;
/** Crates a hauler carries per trip. */
export const carryCapacity = (r: Resident): number => def(r).carry ?? 1;
/** Fraction of a day the resident starts work later. */
export const workDelay = (r: Resident): number => def(r).workStartDelay ?? 0;
