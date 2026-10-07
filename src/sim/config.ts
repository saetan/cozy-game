// The one module that owns balance.json (#22). Every other file reads the numbers through DEFAULTS.
// Later stages add per-village overrides here; for now this is the plain data.
import balance from '../data/balance.json';

export const DEFAULTS = balance;
export type Config = typeof DEFAULTS;
