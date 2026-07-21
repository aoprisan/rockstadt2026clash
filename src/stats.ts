import type { SetSlot } from './types';
import { DAYS } from './data';
import { getSlot, findClashes } from './schedule';
import { selection } from './store';

/** A summary of the whole selection, for the "Your festival" panel. */
export interface FestivalStats {
  picks: number;
  /** Total time on the ground: the union of picked sets (overlaps counted once). */
  onSiteMin: number;
  daysActive: number;
  clashes: number;
  busiest?: { label: string; count: number };
  perStage: { rugina: number; brasov: number; calmuc: number };
}

function pickedSlots(): SetSlot[] {
  return selection
    .ids()
    .map((id) => getSlot(id))
    .filter((s): s is SetSlot => Boolean(s));
}

/** Total length of the union of a day's intervals (double-booked time once). */
function unionMinutes(slots: SetSlot[]): number {
  const intervals = slots.map((s) => [s.start, s.end] as const).sort((a, b) => a[0] - b[0]);
  let total = 0;
  let curStart = -Infinity;
  let curEnd = -Infinity;
  for (const [start, end] of intervals) {
    if (start > curEnd) {
      if (curEnd > -Infinity) total += curEnd - curStart;
      curStart = start;
      curEnd = end;
    } else {
      curEnd = Math.max(curEnd, end);
    }
  }
  if (curEnd > -Infinity) total += curEnd - curStart;
  return total;
}

export function computeStats(): FestivalStats {
  const slots = pickedSlots();
  const perStage = { rugina: 0, brasov: 0, calmuc: 0 };
  const perDay = new Map<string, SetSlot[]>();

  for (const s of slots) {
    perStage[s.stage.id] += 1;
    const list = perDay.get(s.dayId) ?? [];
    list.push(s);
    perDay.set(s.dayId, list);
  }

  let onSiteMin = 0;
  let busiest: { label: string; count: number } | undefined;
  for (const day of DAYS) {
    const list = perDay.get(day.id);
    if (!list || list.length === 0) continue;
    onSiteMin += unionMinutes(list);
    if (!busiest || list.length > busiest.count) {
      busiest = { label: day.label, count: list.length };
    }
  }

  return {
    picks: slots.length,
    onSiteMin,
    daysActive: perDay.size,
    clashes: findClashes(slots).length,
    busiest,
    perStage,
  };
}
