// Sim time is in seconds. One in-game day = balance.dayLength seconds.
import balance from '../data/balance.json';

export const DAY_LENGTH: number = balance.dayLength;
export const WORK_START: number = balance.workStart;
export const WORK_END: number = balance.workEnd;

export const dayOf = (t: number): number => Math.floor(t / DAY_LENGTH);
/** Seconds into the current day, rounded to microseconds to absorb float noise. */
const secOfDay = (t: number): number => Math.round((t - dayOf(t) * DAY_LENGTH) * 1e6) / 1e6;
export const timeOfDay = (t: number): number => secOfDay(t) / DAY_LENGTH;
export const isWorkHours = (t: number): boolean => {
  const s = secOfDay(t);
  return s >= WORK_START * DAY_LENGTH && s < WORK_END * DAY_LENGTH;
};
/** First time strictly after t at which work hours begin. */
export function nextWorkStart(t: number): number {
  const base = dayOf(t) * DAY_LENGTH + WORK_START * DAY_LENGTH;
  return base > t ? base : base + DAY_LENGTH;
}
/** First time strictly after t at which work hours end. */
export function nextWorkEnd(t: number): number {
  const base = dayOf(t) * DAY_LENGTH + WORK_END * DAY_LENGTH;
  return base > t ? base : base + DAY_LENGTH;
}
