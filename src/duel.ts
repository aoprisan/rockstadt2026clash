import type { SetSlot } from './types';
import { getSlot, minutesToLabel, overlaps, walkMinutes, type Clash } from './schedule';
import { selection } from './store';
import { tasteProfile, scoreAgainst } from './taste';

/**
 * Clash duels: every clash between two picks can be settled with an explicit
 * decision — keep one side, keep the other, or *split* the pair (leave the
 * first set early, walk over, catch the second). Decisions persist on-device
 * and feed the smart planner, so "resolved" means resolved everywhere.
 */

const KEY = 'ref2026.duels.v1';

/** Minimum minutes of a set that still count as "seeing" it in a split. */
const MIN_CHUNK = 15;
/** Minimum leftover of a benched set worth mentioning as a consolation. */
const MIN_CONSOLATION = 10;

/** The stored decision: the winning slot id, or a literal split. */
export type DuelDecision = { kind: 'keep'; winner: string } | { kind: 'split' };

type Listener = () => void;
const listeners = new Set<Listener>();

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('~~');
}

function load(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string') out[k] = v;
      }
      return out;
    }
  } catch {
    /* corrupted / private mode */
  }
  return {};
}

let decisions: Record<string, string> = load();

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(decisions));
  } catch {
    /* ignore quota / private mode */
  }
  listeners.forEach((fn) => fn());
}

/** Drop decisions whose sets are no longer both picked (or no longer exist). */
function prune(): void {
  let changed = false;
  for (const key of Object.keys(decisions)) {
    const [a, b] = key.split('~~');
    if (a && b && selection.has(a) && selection.has(b) && getSlot(a) && getSlot(b)) continue;
    delete decisions[key];
    changed = true;
  }
  if (changed) persist();
}
selection.subscribe(prune);

export function subscribeDuels(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The stored decision for a clash pair, or null while it's unresolved. */
export function duelDecision(aId: string, bId: string): DuelDecision | null {
  const v = decisions[pairKey(aId, bId)];
  if (!v) return null;
  if (v === '*split*') return { kind: 'split' };
  if (v === aId || v === bId) return { kind: 'keep', winner: v };
  return null; // stale winner id (running order changed)
}

export function resolveDuel(aId: string, bId: string, decision: DuelDecision): void {
  decisions[pairKey(aId, bId)] = decision.kind === 'split' ? '*split*' : decision.winner;
  persist();
}

export function clearDuel(aId: string, bId: string): void {
  delete decisions[pairKey(aId, bId)];
  persist();
}

export function unresolvedCount(clashes: Clash[]): number {
  return clashes.filter((c) => !duelDecision(c.a.id, c.b.id)).length;
}

/* ---------- the split calculator ---------- */

export interface SplitPlan {
  first: SetSlot;
  second: SetSlot;
  /** Timeline minutes: when you leave `first` and when you reach `second`. */
  leaveAt: number;
  arriveAt: number;
  firstMinutes: number;
  secondMinutes: number;
  walk: number;
}

/** Best split for a fixed order: watch `x` first, then walk over to `y`. */
function orderedSplit(x: SetSlot, y: SetSlot): SplitPlan | null {
  const walk = walkMinutes(x.stage.id, y.stage.id);
  // Two candidate leave times: as late as still catches ALL of y, or as early
  // as a meaningful chunk of x allows (maximising the y side). Any leave time
  // between them trades minute-for-minute, so these bracket the optimum.
  const candidates = [y.start - walk, x.start + MIN_CHUNK];
  let best: SplitPlan | null = null;
  for (const leaveAt of candidates) {
    if (leaveAt < x.start + MIN_CHUNK || leaveAt > x.end) continue;
    const arriveAt = Math.max(y.start, leaveAt + walk);
    const firstMinutes = leaveAt - x.start;
    const secondMinutes = y.end - arriveAt;
    if (secondMinutes < MIN_CHUNK) continue;
    const total = firstMinutes + secondMinutes;
    if (!best || total > best.firstMinutes + best.secondMinutes) {
      best = { first: x, second: y, leaveAt, arriveAt, firstMinutes, secondMinutes, walk };
    }
  }
  return best;
}

/** The best way to see a real chunk of both clashing sets, if one exists. */
export function bestSplit(a: SetSlot, b: SetSlot): SplitPlan | null {
  const ab = orderedSplit(a, b);
  const ba = orderedSplit(b, a);
  if (!ab) return ba;
  if (!ba) return ab;
  return ab.firstMinutes + ab.secondMinutes >= ba.firstMinutes + ba.secondMinutes ? ab : ba;
}

/**
 * When you keep `winner`, how much of `loser` can you still catch around it —
 * its head (before walking over to the winner) or its tail (after the winner
 * ends). Null when the crumbs are too small to be worth mentioning.
 */
export interface Consolation {
  minutes: number;
  kind: 'head' | 'tail';
}

export function consolation(winner: SetSlot, loser: SetSlot): Consolation | null {
  const walk = walkMinutes(winner.stage.id, loser.stage.id);
  const tail = loser.end - Math.max(loser.start, winner.end + walk);
  const head = Math.min(loser.end, winner.start - walk) - loser.start;
  if (tail >= head && tail >= MIN_CONSOLATION) return { minutes: tail, kind: 'tail' };
  if (head > tail && head >= MIN_CONSOLATION) return { minutes: head, kind: 'head' };
  return null;
}

/* ---------- taste head-to-head ---------- */

export interface DuelOdds {
  aScore: number;
  bScore: number;
  /** Percent of the taste signal on side A, or null when there's no signal. */
  aPct: number | null;
}

/**
 * How each duelist matches the taste profile of *everything else* you picked
 * (the duelists themselves are excluded so neither can vote for itself).
 */
export function duelOdds(a: SetSlot, b: SetSlot): DuelOdds {
  const rest = selection
    .ids()
    .map((id) => getSlot(id))
    .filter((s): s is SetSlot => Boolean(s) && s!.band !== a.band && s!.band !== b.band);
  const profile = tasteProfile(rest);
  const aScore = scoreAgainst(profile, a).score;
  const bScore = scoreAgainst(profile, b).score;
  const total = aScore + bScore;
  return {
    aScore,
    bScore,
    aPct: total > 0 ? Math.round((aScore / total) * 100) : null,
  };
}

/* ---------- feeding the planner ---------- */

export interface AdjustedPicks {
  /** The picks after your duel calls: losers gone, split sets truncated. */
  slots: SetSlot[];
  /** Benched loser id -> the winner you chose over it. */
  droppedByCall: Map<string, SetSlot>;
  /** Ids of sets truncated by a split decision. */
  partial: Set<string>;
}

/** Shift a set's absolute instants to match a truncated timeline window. */
function truncated(slot: SetSlot, start: number, end: number): SetSlot {
  return {
    ...slot,
    start,
    end,
    startLabel: minutesToLabel(start),
    endLabel: minutesToLabel(end),
    startAt: new Date(slot.startAt.getTime() + (start - slot.start) * 60_000),
    endAt: new Date(slot.endAt.getTime() + (end - slot.end) * 60_000),
  };
}

/**
 * Apply the user's duel decisions to a set of picks (typically one day's).
 * Unresolved clashes pass through untouched — the planner's optimiser still
 * arbitrates those.
 */
export function applyResolutions(picks: SetSlot[]): AdjustedPicks {
  const byId = new Map(picks.map((s) => [s.id, s]));
  const dropped = new Map<string, SetSlot>();
  const trunc = new Map<string, { start: number; end: number }>();

  for (const [key, value] of Object.entries(decisions)) {
    const [idA, idB] = key.split('~~');
    const a = byId.get(idA);
    const b = byId.get(idB);
    if (!a || !b || !overlaps(a, b)) continue; // not this batch, or times changed

    if (value === '*split*') {
      const split = bestSplit(a, b);
      if (!split) continue; // overlap grew too total to split — back to unresolved
      const f = trunc.get(split.first.id) ?? { start: split.first.start, end: split.first.end };
      f.end = Math.min(f.end, split.leaveAt);
      trunc.set(split.first.id, f);
      const s = trunc.get(split.second.id) ?? { start: split.second.start, end: split.second.end };
      s.start = Math.max(s.start, split.arriveAt);
      trunc.set(split.second.id, s);
    } else if (value === idA) {
      dropped.set(idB, a);
    } else if (value === idB) {
      dropped.set(idA, b);
    }
  }

  const slots: SetSlot[] = [];
  const partial = new Set<string>();
  for (const s of picks) {
    if (dropped.has(s.id)) continue;
    const t = trunc.get(s.id);
    if (!t) {
      slots.push(s);
      continue;
    }
    if (t.end - t.start <= 0) continue; // several splits ate the whole set
    if (t.start !== s.start || t.end !== s.end) {
      slots.push(truncated(s, t.start, t.end));
      partial.add(s.id);
    } else {
      slots.push(s);
    }
  }
  return { slots, droppedByCall: dropped, partial };
}
