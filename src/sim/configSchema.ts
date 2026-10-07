// What each key in balance.json is: its kind, sane range, panel group and whether it can change mid-game.
// Pure data and functions over a config object passed in (this file never imports balance.json), and it holds
// no default values, so it is not a second copy of balance.json. Ranges are validation bounds, not game values.
// Design: issue #22 ("Design proposal: live configuration"), sections 3 and 4.

export type ConfigKind = 'number' | 'integer' | 'fraction' | 'option' | 'list' | 'text';
/** live: safe mid-game. newVillage: read once when a village is created. fixed: edit the file. */
export type ConfigClass = 'live' | 'newVillage' | 'fixed';
export type ConfigGroup = 'speeds' | 'traffic' | 'crops' | 'costs' | 'roles' | 'time' | 'village';

export interface SchemaEntry {
  /** Dotted path. `*` matches one segment, `**` matches the rest of the path. */
  pattern: string;
  kind: ConfigKind;
  min?: number;
  max?: number;
  /** For `option`: the allowed values. `{crops}` means the keys of the config's `crops` object. */
  options?: readonly string[] | '{crops}';
  /** For `list`: the allowed items. */
  itemOptions?: readonly string[];
  /** `null` is a real value (for example an unlimited lane). */
  nullable?: boolean;
  group: ConfigGroup;
  class: ConfigClass;
  /** Why the key is not live (shown in the panel and in refusals). */
  reason?: string;
}

export const VEHICLES = ['bicycle', 'wagon', 'car'] as const; // pinned to balance.json by a test
export const WHEN_BUSY = ['wait', 'waitOrWalk', 'ignore'] as const; // pinned to traffic.ts by a test
const FIXED_IDS = 'ids and text live in saves or must match kit models; it is not tuning';
const FIXED_SHAPE = 'shapes are copied into each saved building and must match the kit models';
const NEW_VILLAGE_CLOCK = 'sim time is absolute seconds, so changing it would rewrite the date and time of day';
const NEW_VILLAGE_START = 'it is read once when a village is created';
const NEW_VILLAGE_CROP = 'new farm plots start with it, and mid-game that could be a crop the village has not unlocked';

export const MAX_HOUSE_LEVEL = 7; // pinned to houseLevels.json by a test

export const SCHEMA: readonly SchemaEntry[] = [
  // time
  { pattern: 'dayLength', kind: 'number', min: 60, max: 86400, group: 'time', class: 'newVillage', reason: NEW_VILLAGE_CLOCK },
  { pattern: 'startTimeOfDay', kind: 'fraction', group: 'time', class: 'newVillage', reason: NEW_VILLAGE_START },
  { pattern: 'workStart', kind: 'fraction', group: 'time', class: 'live' },
  { pattern: 'workEnd', kind: 'fraction', group: 'time', class: 'live' },
  { pattern: 'offlineCapHours', kind: 'number', min: 0, max: 48, group: 'time', class: 'live' },
  { pattern: 'times.*', kind: 'number', min: 0.1, max: 60, group: 'time', class: 'live' }, // near zero: many events per instant and no visible work; large: strands a task, as in-progress work keeps old numbers
  { pattern: 'abortRetrySeconds', kind: 'number', min: 5, max: 600, group: 'time', class: 'live' }, // PR #41
  // speeds
  { pattern: 'walking.speed.*', kind: 'number', min: 0.5, max: 50, group: 'speeds', class: 'live' },
  { pattern: 'vehicles.*.speed.*', kind: 'number', min: 0.5, max: 50, group: 'speeds', class: 'live' },
  // vehicles
  { pattern: 'vehicles.*.houseLevel', kind: 'integer', min: 1, max: MAX_HOUSE_LEVEL, group: 'village', class: 'live' },
  { pattern: 'vehicles.wagon.carry', kind: 'integer', min: 1, max: 20, group: 'roles', class: 'live' },
  // traffic
  { pattern: 'traffic.*.capacity', kind: 'integer', min: 1, max: 20, nullable: true, group: 'traffic', class: 'live' },
  { pattern: 'traffic.*.appliesTo', kind: 'list', itemOptions: VEHICLES, group: 'traffic', class: 'live' },
  { pattern: 'traffic.*.whenBusy', kind: 'option', options: WHEN_BUSY, group: 'traffic', class: 'live' },
  { pattern: 'traffic.*.maxWaitSeconds', kind: 'number', min: 0, max: 3600, group: 'traffic', class: 'live' },
  // crops and farm
  { pattern: 'crops.*.growTime', kind: 'number', min: 10, max: 20000, group: 'crops', class: 'live' },
  { pattern: 'crops.*.price', kind: 'integer', min: 1, max: 1000000, group: 'crops', class: 'live' },
  { pattern: 'crops.*.unlock', kind: 'integer', min: 0, max: 100000000, group: 'crops', class: 'live' },
  { pattern: 'defaultCrop', kind: 'option', options: '{crops}', group: 'crops', class: 'newVillage', reason: NEW_VILLAGE_CROP },
  { pattern: 'waterFraction', kind: 'fraction', min: 0.05, max: 0.95, group: 'crops', class: 'live' }, // 0 or 1 makes a zero-length phase
  { pattern: 'maxCrates', kind: 'integer', min: 1, max: 100, group: 'crops', class: 'live' },
  { pattern: 'scarecrow.radius', kind: 'integer', min: 0, max: 20, group: 'crops', class: 'live' },
  { pattern: 'scarecrow.growthMultiplier', kind: 'number', min: 1, max: 5, group: 'crops', class: 'live' },
  // roles
  { pattern: 'specialistMultiplier', kind: 'number', min: 1, max: 5, group: 'roles', class: 'live' },
  { pattern: 'traits.*.speed.*', kind: 'number', min: 0.5, max: 5, group: 'roles', class: 'live' },
  { pattern: 'traits.*.carry', kind: 'integer', min: 1, max: 20, group: 'roles', class: 'live' },
  { pattern: 'traits.*.workStartDelay', kind: 'fraction', min: 0, max: 0.5, group: 'roles', class: 'live' },
  { pattern: 'traits.*.name', kind: 'text', group: 'roles', class: 'fixed', reason: FIXED_IDS },
  { pattern: 'traits.*.desc', kind: 'text', group: 'roles', class: 'fixed', reason: FIXED_IDS },
  // costs
  { pattern: 'startingCoins', kind: 'integer', min: 0, max: 100000000, group: 'costs', class: 'newVillage', reason: NEW_VILLAGE_START },
  { pattern: 'costs.*.coins', kind: 'integer', min: 0, max: 100000000, group: 'costs', class: 'live' },
  { pattern: 'houseLevelCosts.*.coins', kind: 'integer', min: 0, max: 100000000, group: 'costs', class: 'live' },
  { pattern: 'marketLevelCosts.*.coins', kind: 'integer', min: 0, max: 100000000, group: 'costs', class: 'live' },
  { pattern: 'chunkCost.base', kind: 'integer', min: 0, max: 100000000, group: 'costs', class: 'live' },
  { pattern: 'chunkCost.growth', kind: 'number', min: 1, max: 5, group: 'costs', class: 'live' },
  // village
  { pattern: 'arrivalLevels.*', kind: 'integer', min: 1, max: MAX_HOUSE_LEVEL, group: 'village', class: 'live' },
  { pattern: 'footprints.**', kind: 'number', group: 'village', class: 'fixed', reason: FIXED_SHAPE },
  { pattern: 'market.**', kind: 'number', group: 'village', class: 'fixed', reason: FIXED_SHAPE },
  { pattern: 'species.*', kind: 'text', group: 'village', class: 'fixed', reason: FIXED_IDS },
  { pattern: 'names.*', kind: 'text', group: 'village', class: 'fixed', reason: FIXED_IDS },
];

const GROUP_ORDER: readonly ConfigGroup[] = ['time', 'speeds', 'traffic', 'crops', 'roles', 'costs', 'village'];

function matches(pattern: string, path: string): boolean {
  const p = pattern.split('.'), s = path.split('.');
  for (let i = 0; i < p.length; i++) {
    if (p[i] === '**') return s.length > i;
    if (i >= s.length || (p[i] !== '*' && p[i] !== s[i])) return false;
  }
  return p.length === s.length;
}

/** The schema entries matching a dotted path (the coverage test requires exactly one per balance.json leaf). */
export const entriesFor = (path: string): SchemaEntry[] => SCHEMA.filter(e => matches(e.pattern, path));

/**
 * Schema patterns whose readers have been converted to the live config. Only these can be changed; a stage that
 * converts a family adds its pattern here (stage 3: the `traffic.*` patterns). Nothing is wired yet.
 */
export const WIRED: readonly string[] = [];
/** Which patterns count as wired; tests pass 'all' to exercise the value checks. */
export type WiredSet = readonly string[] | 'all';
const isWired = (e: SchemaEntry, wired: WiredSet): boolean => wired === 'all' || wired.includes(e.pattern);

export type CheckResult = { ok: true } | { ok: false; reason: string };
/** Where the change is made: into a running village, or into the settings of a new one. */
export type ConfigMode = 'live' | 'newVillage';

const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** True when `path` names an own leaf of `config`: own properties at every segment, canonical in-range array indexes. */
export function isLeafOf(config: unknown, path: unknown): boolean {
  if (typeof path !== 'string' || path === '') return false;
  let cur: unknown = config;
  for (const seg of path.split('.')) {
    if (FORBIDDEN.has(seg) || !isObj(cur)) return false;
    if (Array.isArray(cur)) {
      if (!/^(0|[1-9]\d*)$/.test(seg) || Number(seg) >= cur.length || !Object.hasOwn(cur, seg)) return false;
    } else if (!Object.hasOwn(cur, seg)) return false;
    cur = cur[seg as keyof typeof cur];
  }
  const e = entriesFor(path)[0];
  return !isObj(cur) || e?.kind === 'list';
}

function optionsOf(e: SchemaEntry, config?: unknown): readonly string[] {
  if (e.options === '{crops}') {
    const crops = (config as { crops?: unknown } | undefined)?.crops;
    return isObj(crops) ? Object.keys(crops) : [];
  }
  return e.options ?? [];
}

function describe(e: SchemaEntry, config?: unknown): string {
  const range = (what: string) => (e.min !== undefined && e.max !== undefined ? `${what} ${e.min} to ${e.max}` : what);
  let s: string;
  switch (e.kind) {
    case 'integer': s = range('whole number'); break;
    case 'fraction': s = `number ${e.min ?? 0} to ${e.max ?? 1}`; break;
    case 'number': s = range('number'); break;
    case 'option': { const o = optionsOf(e, config); s = o.length ? `one of ${o.join(', ')}` : 'one of the crops in the config'; break; }
    case 'list': s = `list of ${e.itemOptions!.join(', ')}`; break;
    default: s = 'text';
  }
  return e.nullable ? `${s}, or null` : s;
}

/**
 * Validates one change against the config it would apply to. Refuses paths that are not an own leaf of `config`,
 * fixed keys, keys that do not apply in `mode`, keys not wired yet, and values outside the schema.
 */
export function checkConfig(config: unknown, path: unknown, value: unknown, mode: ConfigMode, wired: WiredSet = WIRED): CheckResult {
  if (typeof path !== 'string') return { ok: false, reason: 'path: must be a text path such as traffic.lane.capacity' };
  const found = entriesFor(path);
  if (found.length === 0 || !isLeafOf(config, path)) return { ok: false, reason: `${path}: unknown setting` };
  const e = found[0];
  if (e.class === 'fixed') return { ok: false, reason: `${path}: fixed, edit src/data/balance.json (${e.reason})` };
  if (e.class === 'newVillage' && mode === 'live') return { ok: false, reason: `${path}: only for a new village (${e.reason})` };
  if (!isWired(e, wired)) return { ok: false, reason: `${path}: not adjustable in this build yet` };
  const bad = (): CheckResult => ({ ok: false, reason: `${path}: ${describe(e, config)}` });
  const good: CheckResult = { ok: true };
  if (value === null) return e.nullable ? good : bad();
  switch (e.kind) {
    case 'number': case 'integer': case 'fraction': {
      if (typeof value !== 'number' || !Number.isFinite(value) || Object.is(value, -0)) return bad();
      if (e.kind === 'integer' && !Number.isInteger(value)) return bad();
      const fr = e.kind === 'fraction';
      const min = e.min ?? (fr ? 0 : -Infinity), max = e.max ?? (fr ? 1 : Infinity);
      return value < min || value > max ? bad() : good;
    }
    case 'option':
      return typeof value === 'string' && optionsOf(e, config).includes(value) ? good : bad();
    case 'list':
      return Array.isArray(value) && Object.keys(value).length === value.length
        && value.every(v => typeof v === 'string' && e.itemOptions!.includes(v)) && new Set(value).size === value.length
        ? good : bad();
    default:
      return typeof value === 'string' ? good : bad();
  }
}

const MIN_WORK_DAY = 0.05; // fraction of a day, after the latest trait delay

/** Violations of rules that span several keys, on a complete (merged) config. Empty when fine. Never throws. */
export function checkConfigWhole(config: unknown): string[] {
  const out: string[] = [];
  const c = isObj(config) ? config : {};
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const { workStart, workEnd } = c;
  if (!num(workStart) || !num(workEnd)) out.push('workStart and workEnd must both be numbers');
  else if (!(workStart < workEnd)) out.push(`workStart (${workStart}) must be less than workEnd (${workEnd}): residents would never work`);
  else {
    const traits = isObj(c.traits) ? Object.values(c.traits) : [];
    const delay = Math.max(0, ...traits.map(t => (isObj(t) && num(t.workStartDelay) ? t.workStartDelay : 0)));
    if (workEnd - workStart - delay < MIN_WORK_DAY - 1e-9)
      out.push(`workEnd - workStart - the largest trait workStartDelay (${+(workEnd - workStart - delay).toFixed(6)}) must be at least ${MIN_WORK_DAY} of a day`);
  }
  const crops = isObj(c.crops) ? Object.keys(c.crops) : [];
  if (typeof c.defaultCrop !== 'string' || !crops.includes(c.defaultCrop)) out.push(`defaultCrop (${String(c.defaultCrop)}) must be one of the crops: ${crops.join(', ')}`);
  const market = isObj(c.costs) && isObj(c.costs.market) ? c.costs.market.coins : undefined;
  if (!num(c.startingCoins) || !num(market)) out.push('startingCoins and costs.market.coins must both be numbers');
  else if (market > c.startingCoins) out.push(`costs.market.coins (${market}) must not exceed startingCoins (${c.startingCoins}): the first market could not be afforded and nothing would sell`);
  if (!Array.isArray(c.arrivalLevels) || !c.arrivalLevels.includes(1)) out.push('arrivalLevels must include 1: otherwise the first house stays empty');
  return out;
}

/** One entry point for a whole change: the per-key check, then the whole-config checks on the merged result. */
export function checkChange(config: unknown, path: unknown, value: unknown, mode: ConfigMode, wired: WiredSet = WIRED): CheckResult {
  const r = checkConfig(config, path, value, mode, wired);
  if (!r.ok) return r;
  const merged = structuredClone(config) as Record<string, any>;
  const segs = (path as string).split('.');
  let cur: any = merged;
  for (const seg of segs.slice(0, -1)) cur = cur[seg];
  cur[segs[segs.length - 1]] = value;
  const violations = checkConfigWhole(merged);
  return violations.length ? { ok: false, reason: `${path}: ${violations[0]}` } : r;
}

export interface ConfigEntry {
  path: string;
  kind: ConfigKind;
  min?: number;
  max?: number;
  options?: readonly string[];
  nullable: boolean;
  group: ConfigGroup;
  class: ConfigClass;
  reason?: string;
  wired: boolean;
}

/** Every concrete leaf of a config as `[path, value]`. Lists the schema names as `list` are leaves; other arrays are walked. */
export function leaves(config: unknown): [string, unknown][] {
  const out: [string, unknown][] = [];
  const walk = (v: unknown, path: string) => {
    const e = path ? entriesFor(path)[0] : undefined;
    if (v === null || typeof v !== 'object' || e?.kind === 'list') { out.push([path, v]); return; }
    for (const [k, c] of Object.entries(v)) walk(c, path ? `${path}.${k}` : k);
  };
  walk(config, '');
  return out;
}

/** A flat, stably ordered list of every concrete key in the config with its schema entry (for the tuning panel). */
export function configEntries(config: unknown, wired: WiredSet = WIRED): ConfigEntry[] {
  const rows: ConfigEntry[] = [];
  for (const [path] of leaves(config)) {
    const e = entriesFor(path)[0];
    if (!e) continue; // the coverage test fails on this
    const options = e.options === '{crops}' ? optionsOf(e, config) : e.options ?? e.itemOptions;
    rows.push({ path, kind: e.kind, min: e.min, max: e.max, options, nullable: !!e.nullable, group: e.group, class: e.class, reason: e.reason, wired: isWired(e, wired) });
  }
  // group order, then the config's own key order; Array.sort is stable
  return rows.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
}
