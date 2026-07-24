import type { StageId } from './types';

/**
 * Running-order patches: the festival as it is actually happening.
 *
 * Every clashfinder — this one included, until now — treats the poster as
 * gospel. Real festivals don't: a stage slips fifteen minutes during the
 * afternoon and never gets it back, a band misses a border crossing, a set gets
 * pulled for weather. From that moment every clash, every walk, every countdown
 * and every "leave at 23:16" in the app is quietly wrong, and the app never
 * says so.
 *
 * This is the patch layer. A stage can be marked as running late (from now on,
 * not retroactively — what you already watched happened when it happened), a
 * single set can be nudged or cancelled outright, and everything downstream —
 * the timeline, clashes, the planner chain, the pilot, reminders, the stamina
 * model — recomputes off the patched times. Patches ride along on the crew beam,
 * so the person standing at the barrier who notices first can push the fix to
 * everyone they meet, with no network at all.
 *
 * The store deliberately knows nothing about the schedule module: `schedule.ts`
 * reads *from* here when it builds slots, so a dependency in the other
 * direction would be a cycle.
 */

const KEY = 'ref2026.delays.v1';

export interface StagePatch {
  /** Minutes late (negative means running early — it happens, rarely). */
  minutes: number;
  /**
   * The noon-anchored minute the slip starts applying from. Sets that had
   * already started when you logged it keep their original times.
   */
  from: number;
}

interface DelayState {
  /** Keyed `dayId::stageId`. */
  stages: Record<string, StagePatch>;
  /** Per-set overrides, keyed by slot id, in minutes. */
  sets: Record<string, number>;
  /** Slot ids that aren't happening at all. */
  cancelled: string[];
}

/** Applies to every set on the stage, however early in the day. */
export const FROM_ALL = -100_000;

const EMPTY: DelayState = { stages: {}, sets: {}, cancelled: [] };

let state: DelayState | null = null;
const listeners = new Set<() => void>();

function load(): DelayState {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<DelayState>) : {};
    state = {
      stages: sanitiseStages(parsed.stages),
      sets: sanitiseSets(parsed.sets),
      cancelled: Array.isArray(parsed.cancelled)
        ? parsed.cancelled.filter((id): id is string => typeof id === 'string')
        : [],
    };
  } catch {
    state = { ...EMPTY, stages: {}, sets: {}, cancelled: [] };
  }
  return state;
}

/** Patches are user input and travel over beams, so both paths get scrubbed. */
function sanitiseStages(input: unknown): Record<string, StagePatch> {
  const out: Record<string, StagePatch> = {};
  if (!input || typeof input !== 'object') return out;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const v = value as Partial<StagePatch>;
    if (typeof v?.minutes !== 'number' || !Number.isFinite(v.minutes)) continue;
    const minutes = clampShift(v.minutes);
    if (minutes === 0) continue;
    out[key] = {
      minutes,
      from: typeof v.from === 'number' && Number.isFinite(v.from) ? v.from : FROM_ALL,
    };
  }
  return out;
}

function sanitiseSets(input: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!input || typeof input !== 'object') return out;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const minutes = clampShift(value);
    if (minutes !== 0) out[key] = minutes;
  }
  return out;
}

/** A running order can slip; it can't teleport. */
export const MAX_SHIFT = 180;

export function clampShift(minutes: number): number {
  return Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, Math.round(minutes)));
}

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(load()));
  } catch {
    /* ignore quota / private mode */
  }
  listeners.forEach((fn) => fn());
}

export function subscribeDelays(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const stageKey = (dayId: string, stage: StageId): string => `${dayId}::${stage}`;

export function stagePatch(dayId: string, stage: StageId): StagePatch | null {
  return load().stages[stageKey(dayId, stage)] ?? null;
}

/**
 * Mark a stage as running late. `from` is the noon-anchored minute the slip
 * applies from — pass FROM_ALL when the day hasn't started yet.
 */
export function setStagePatch(dayId: string, stage: StageId, minutes: number, from: number): void {
  const s = load();
  const value = clampShift(minutes);
  if (value === 0) delete s.stages[stageKey(dayId, stage)];
  else s.stages[stageKey(dayId, stage)] = { minutes: value, from };
  persist();
}

export function setSetShift(slotId: string, minutes: number): void {
  const s = load();
  const value = clampShift(minutes);
  if (value === 0) delete s.sets[slotId];
  else s.sets[slotId] = value;
  persist();
}

export function isCancelled(slotId: string): boolean {
  return load().cancelled.includes(slotId);
}

export function toggleCancelled(slotId: string): void {
  const s = load();
  s.cancelled = s.cancelled.includes(slotId)
    ? s.cancelled.filter((id) => id !== slotId)
    : [...s.cancelled, slotId];
  persist();
}

/**
 * Minutes to shift one set by: its own override if it has one, otherwise the
 * stage's slip — but only for sets that hadn't started when the slip was logged.
 */
export function shiftFor(
  dayId: string,
  stage: StageId,
  slotId: string,
  startMin: number,
): number {
  const s = load();
  const own = s.sets[slotId];
  if (own != null) return own;
  const patch = s.stages[stageKey(dayId, stage)];
  if (!patch) return 0;
  return startMin >= patch.from ? patch.minutes : 0;
}

/** How many patches are live — drives the "the poster is out of date" banner. */
export function patchCount(): number {
  const s = load();
  return Object.keys(s.stages).length + Object.keys(s.sets).length + s.cancelled.length;
}

export function clearAll(): void {
  state = { stages: {}, sets: {}, cancelled: [] };
  persist();
}

export function clearStage(dayId: string, stage: StageId): void {
  const s = load();
  delete s.stages[stageKey(dayId, stage)];
  persist();
}

export function clearSet(slotId: string): void {
  const s = load();
  delete s.sets[slotId];
  s.cancelled = s.cancelled.filter((id) => id !== slotId);
  persist();
}

/* ---------- travelling over a crew beam ---------- */

/** Compact wire form: the same three tables, short keys. */
export interface DelayWire {
  st?: Record<string, [number, number]>;
  se?: Record<string, number>;
  cx?: string[];
}

export function exportDelays(): DelayWire | undefined {
  const s = load();
  if (patchCount() === 0) return undefined;
  const st: Record<string, [number, number]> = {};
  for (const [k, v] of Object.entries(s.stages)) st[k] = [v.minutes, v.from];
  const wire: DelayWire = {};
  if (Object.keys(st).length) wire.st = st;
  if (Object.keys(s.sets).length) wire.se = { ...s.sets };
  if (s.cancelled.length) wire.cx = [...s.cancelled];
  return wire;
}

/**
 * Fold received patches in. A patch is a claim about the world, so the newest
 * one wins on a conflict — except a cancellation, which is never un-done by a
 * beam: someone else's stale copy shouldn't resurrect a band that dropped out.
 */
export function importDelays(wire: DelayWire | undefined): number {
  if (!wire || typeof wire !== 'object') return 0;
  const s = load();
  let applied = 0;

  if (wire.st && typeof wire.st === 'object') {
    for (const [key, value] of Object.entries(wire.st)) {
      if (!Array.isArray(value) || typeof value[0] !== 'number') continue;
      const minutes = clampShift(value[0]);
      if (minutes === 0) continue;
      const from = typeof value[1] === 'number' && Number.isFinite(value[1]) ? value[1] : FROM_ALL;
      const mine = s.stages[key];
      if (mine && mine.minutes === minutes && mine.from === from) continue;
      s.stages[key] = { minutes, from };
      applied++;
    }
  }
  if (wire.se && typeof wire.se === 'object') {
    for (const [key, value] of Object.entries(wire.se)) {
      if (typeof value !== 'number') continue;
      const minutes = clampShift(value);
      if (minutes === 0 || s.sets[key] === minutes) continue;
      s.sets[key] = minutes;
      applied++;
    }
  }
  if (Array.isArray(wire.cx)) {
    for (const id of wire.cx) {
      if (typeof id !== 'string' || s.cancelled.includes(id)) continue;
      s.cancelled.push(id);
      applied++;
    }
  }
  if (applied > 0) persist();
  return applied;
}
