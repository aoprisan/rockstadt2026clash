import { DAYS, STAGES } from './data';
import type { FestivalDay, SetSlot, StageId } from './types';

const STAGE_ORDER: StageId[] = ['rugina', 'brasov', 'calmuc'];

/**
 * Convert "HH:MM" into minutes from a noon anchor so that sets running past
 * midnight stay monotonically ordered (e.g. 01:00 -> next day).
 * Anything before 08:00 is considered part of the previous evening.
 */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  let minutes = h * 60 + m - 12 * 60; // anchor at noon
  if (minutes < -4 * 60) minutes += 24 * 60; // before 08:00 => after midnight
  return minutes;
}

export function slotId(dayId: string, stage: StageId, band: string): string {
  return `${dayId}::${stage}::${band}`;
}

export function buildSlots(day: FestivalDay): SetSlot[] {
  const slots: SetSlot[] = [];
  for (const stageId of STAGE_ORDER) {
    for (const raw of day.sets[stageId]) {
      slots.push({
        id: slotId(day.id, stageId, raw.band),
        band: raw.band,
        stage: STAGES[stageId],
        dayId: day.id,
        startLabel: raw.start,
        endLabel: raw.end,
        start: toMinutes(raw.start),
        end: toMinutes(raw.end),
      });
    }
  }
  return slots;
}

export const ALL_SLOTS: SetSlot[] = DAYS.flatMap(buildSlots);

const slotById = new Map(ALL_SLOTS.map((s) => [s.id, s]));
export function getSlot(id: string): SetSlot | undefined {
  return slotById.get(id);
}

export function overlaps(a: SetSlot, b: SetSlot): boolean {
  return a.start < b.end && b.start < a.end;
}

export interface Clash {
  a: SetSlot;
  b: SetSlot;
  /** overlap duration in minutes */
  minutes: number;
}

/** Find all pairwise clashes among the given (selected) slots. */
export function findClashes(slots: SetSlot[]): Clash[] {
  const sorted = [...slots].sort((x, y) => x.start - y.start);
  const clashes: Clash[] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if (a.stage.id === b.stage.id) continue; // same stage never overlaps
      if (b.start >= a.end) break; // sorted: no later set can overlap a
      if (overlaps(a, b)) {
        const minutes = Math.min(a.end, b.end) - Math.max(a.start, b.start);
        clashes.push({ a, b, minutes });
      }
    }
  }
  return clashes;
}

/** Slot ids that participate in at least one clash within the selection. */
export function clashingIds(slots: SetSlot[]): Set<string> {
  const ids = new Set<string>();
  for (const c of findClashes(slots)) {
    ids.add(c.a.id);
    ids.add(c.b.id);
  }
  return ids;
}

export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}
