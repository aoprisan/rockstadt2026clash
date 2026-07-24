import type { SetSlot } from './types';
import { ALL_SLOTS, getSlot } from './schedule';
import { selection } from './store';

/**
 * "Now / Next" live running order. Everything is computed against real absolute
 * time (`Date.now()`), so it behaves correctly whatever timezone the phone is
 * set to — before the festival it counts down to the gates, during it tells you
 * what's on and what you're about to miss, and after it calls it a night.
 */

export type LivePhase = 'empty' | 'pre' | 'live' | 'post';

export interface LiveState {
  phase: LivePhase;
  /** A pick currently on stage (live phase). */
  now?: { slot: SetSlot; endsInMin: number };
  /** The next pick still to come. */
  next?: { slot: SetSlot; startsInMin: number };
  /** Minutes until the festival's first note (pre phase). */
  toGatesMin?: number;
}

function pickedSlots(): SetSlot[] {
  return selection
    .ids()
    .map((id) => getSlot(id))
    .filter((s): s is SetSlot => Boolean(s))
    .filter((s) => !s.cancelled);
}

/** Earliest start across the whole line-up — the festival's first note. */
function festivalStartMs(): number {
  return Math.min(...ALL_SLOTS.map((s) => s.startAt.getTime()));
}

export function computeLive(nowMs: number): LiveState {
  const picks = pickedSlots();
  if (picks.length === 0) return { phase: 'empty' };

  const byStart = [...picks].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  const current = byStart.find(
    (s) => s.startAt.getTime() <= nowMs && nowMs < s.endAt.getTime(),
  );
  const upcoming = byStart.find((s) => s.startAt.getTime() > nowMs);

  const minsUntil = (d: Date) => Math.round((d.getTime() - nowMs) / 60000);

  if (current) {
    return {
      phase: 'live',
      now: { slot: current, endsInMin: minsUntil(current.endAt) },
      next: upcoming ? { slot: upcoming, startsInMin: minsUntil(upcoming.startAt) } : undefined,
    };
  }

  if (upcoming) {
    // More than 12h out (and before the festival even opens) reads as "pre".
    const far = upcoming.startAt.getTime() - nowMs > 12 * 3600_000;
    if (far && nowMs < festivalStartMs()) {
      return { phase: 'pre', toGatesMin: minsUntil(upcoming.startAt) };
    }
    return { phase: 'live', next: { slot: upcoming, startsInMin: minsUntil(upcoming.startAt) } };
  }

  return { phase: 'post' };
}

/** Compact human countdown: "2d 4h", "3h 20m", "12m", "now". */
export function fmtCountdown(min: number): string {
  if (min <= 0) return 'now';
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}
