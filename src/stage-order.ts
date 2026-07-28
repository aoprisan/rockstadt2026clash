import { STAGES } from './data';
import type { StageId } from './types';

/**
 * Which stage sits in which timeline column.
 *
 * Only the *display* order lives here. The canonical order in `schedule.ts` is
 * a wire format — the share-link codec indexes picks by position in `ALL_SLOTS`
 * — so it must never follow what someone dragged on their own phone.
 */

const KEY = 'ref2026.stageOrder.v1';

/**
 * Left-to-right, the way the stages sit on the festival ground. The grid then
 * reads like the site does, so "the stage on the right" means the same thing on
 * the phone and in the field.
 */
export const DEFAULT_STAGE_ORDER: StageId[] = ['calmuc', 'rugina', 'brasov'];

const KNOWN = Object.keys(STAGES) as StageId[];

type Listener = () => void;

const listeners = new Set<Listener>();

let order: StageId[] = load();

/**
 * Accept a stored order only as far as it makes sense: unknown ids and repeats
 * are dropped, and any stage the stored list forgot (a new stage added to a
 * later edition, say) is appended in its default position rather than vanishing
 * from the grid.
 */
function sanitise(input: unknown): StageId[] {
  const seen = new Set<StageId>();
  const out: StageId[] = [];
  if (Array.isArray(input)) {
    for (const raw of input) {
      if (typeof raw !== 'string') continue;
      const id = raw as StageId;
      if (!KNOWN.includes(id) || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  for (const id of DEFAULT_STAGE_ORDER) {
    if (!seen.has(id)) out.push(id);
  }
  return out;
}

function load(): StageId[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [...DEFAULT_STAGE_ORDER];
    return sanitise(JSON.parse(raw));
  } catch {
    return [...DEFAULT_STAGE_ORDER];
  }
}

function persist(): void {
  try {
    if (isCustomStageOrder()) localStorage.setItem(KEY, JSON.stringify(order));
    else localStorage.removeItem(KEY); // back to default: stop storing a preference
  } catch {
    /* ignore quota / private mode */
  }
  listeners.forEach((fn) => fn());
}

function same(a: StageId[], b: StageId[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/** The stages in the order the timeline should show them, left to right. */
export function stageOrder(): StageId[] {
  return [...order];
}

/** Column index of a stage, 0-based. */
export function stagePosition(id: StageId): number {
  return order.indexOf(id);
}

/** True once the user has dragged the columns away from the festival layout. */
export function isCustomStageOrder(): boolean {
  return !same(order, DEFAULT_STAGE_ORDER);
}

/** Replace the whole order (what a finished drag commits). */
export function setStageOrder(next: StageId[]): void {
  const cleaned = sanitise(next);
  if (same(cleaned, order)) return;
  order = cleaned;
  persist();
}

/**
 * Nudge one stage `delta` columns sideways — the keyboard equivalent of a drag.
 * Returns false when it is already against that edge, so the caller can leave
 * the announcement and the re-render alone.
 */
export function moveStage(id: StageId, delta: number): boolean {
  const from = order.indexOf(id);
  if (from < 0) return false;
  const to = from + delta;
  if (to < 0 || to >= order.length) return false;
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, id);
  setStageOrder(next);
  return true;
}

/** Put the columns back the way the festival lays them out. */
export function resetStageOrder(): void {
  setStageOrder([...DEFAULT_STAGE_ORDER]);
}

export function subscribeStageOrder(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
