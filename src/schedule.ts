import { DAYS, STAGES } from './data';
import { bandGenre, bandListen } from './band-meta';
import { isCancelled, shiftFor, subscribeDelays } from './delays';
import type { FestivalDay, SetSlot, StageId } from './types';

/**
 * The canonical stage order, and a wire format: `ALL_SLOTS` is built from it and
 * the share-link codec indexes picks by position in that array. It must stay
 * fixed — the order the timeline *shows* the stages in lives in `stage-order.ts`
 * and is the user's to rearrange.
 */
const STAGE_ORDER: StageId[] = ['rugina', 'brasov', 'calmuc'];

/**
 * The festival runs 27–31 July 2026 in Eastern European Summer Time (UTC+3).
 * Converting each set to an absolute UTC instant lets "now / next" and the
 * calendar export line up regardless of the viewer's own device timezone.
 */
const FEST_UTC_OFFSET_H = 3;

export function festivalInstant(isoDate: string, hhmm: string): Date {
  const [y, mo, d] = isoDate.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const day = h < 8 ? d + 1 : d; // small-hours sets roll into the next date
  return new Date(Date.UTC(y, mo - 1, day, h - FEST_UTC_OFFSET_H, mi));
}

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

/** Resolve a band link: curated URL if present, otherwise a web search. */
export function bandLink(band: string, link?: string): string {
  if (link) return link;
  return `https://duckduckgo.com/?q=${encodeURIComponent(`${band} band official`)}`;
}

/**
 * Build a day's slots with the running-order patches applied: a stage running
 * late shifts every set on it that hadn't started when the slip was logged, a
 * per-set nudge overrides that, and a cancelled set stays in the grid (struck
 * through) so the pick and its history survive being un-cancelled.
 */
export function buildSlots(day: FestivalDay): SetSlot[] {
  const slots: SetSlot[] = [];
  for (const stageId of STAGE_ORDER) {
    for (const raw of day.sets[stageId]) {
      const id = slotId(day.id, stageId, raw.band);
      const start = toMinutes(raw.start);
      const shift = shiftFor(day.id, stageId, id, start);
      slots.push({
        id,
        band: raw.band,
        stage: STAGES[stageId],
        dayId: day.id,
        startLabel: shift ? minutesToLabel(start + shift) : raw.start,
        endLabel: shift ? minutesToLabel(toMinutes(raw.end) + shift) : raw.end,
        link: bandLink(raw.band, raw.link),
        listen: bandListen(raw.band),
        genre: bandGenre(raw.band),
        start: start + shift,
        end: toMinutes(raw.end) + shift,
        startAt: new Date(festivalInstant(day.date, raw.start).getTime() + shift * 60_000),
        endAt: new Date(festivalInstant(day.date, raw.end).getTime() + shift * 60_000),
        shift,
        cancelled: isCancelled(id),
      });
    }
  }
  return slots;
}

/**
 * A day's show window: first note to last note, padded either side so the small
 * hours after midnight — and the slow morning that follows — still count as
 * part of "that day" rather than the next one.
 */
const DAY_PAD_MS = 6 * 3600_000;

function dayWindow(day: FestivalDay): { from: number; to: number } {
  const slots = buildSlots(day);
  return {
    from: Math.min(...slots.map((s) => s.startAt.getTime())) - DAY_PAD_MS,
    to: Math.max(...slots.map((s) => s.endAt.getTime())) + DAY_PAD_MS,
  };
}

/**
 * The festival day under way right now, or `null` outside the show windows
 * (before the gates open, between days, and once it's all over).
 */
export function todayDayId(nowMs: number): string | null {
  for (const day of DAYS) {
    const { from, to } = dayWindow(day);
    if (nowMs >= from && nowMs <= to) return day.id;
  }
  return null;
}

/**
 * The day to open on: the one under way, else the next day still to come, else
 * — once the festival is over — the final day.
 */
export function currentDayId(nowMs: number): string {
  const today = todayDayId(nowMs);
  if (today) return today;
  const upcoming = DAYS.find((day) => dayWindow(day).from > nowMs);
  return (upcoming ?? DAYS[DAYS.length - 1]).id;
}

/**
 * The whole bill, patches included. Rebuilt **in place** whenever a patch
 * lands: every module imports this binding directly, and the share-link codec
 * indexes picks by position in it, so the array's identity, order and length
 * all have to survive a rebuild — only the contents change.
 */
export const ALL_SLOTS: SetSlot[] = DAYS.flatMap(buildSlots);

let slotById = new Map(ALL_SLOTS.map((s) => [s.id, s]));

export function getSlot(id: string): SetSlot | undefined {
  return slotById.get(id);
}

const scheduleListeners = new Set<() => void>();

/** Be told when the running order itself changes under you. */
export function subscribeSchedule(fn: () => void): () => void {
  scheduleListeners.add(fn);
  return () => scheduleListeners.delete(fn);
}

function rebuildSchedule(): void {
  const fresh = DAYS.flatMap(buildSlots);
  ALL_SLOTS.length = 0;
  ALL_SLOTS.push(...fresh);
  slotById = new Map(ALL_SLOTS.map((s) => [s.id, s]));
  scheduleListeners.forEach((fn) => fn());
}

subscribeDelays(rebuildSchedule);

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
      if (a.dayId !== b.dayId) continue; // sets on different days never clash
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

/** Format noon-anchored timeline minutes back into a "HH:MM" wall-clock label. */
export function minutesToLabel(min: number): string {
  let total = min + 12 * 60; // undo noon anchor
  total = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/**
 * Rough walking time between stages, in minutes. The three stages sit close
 * together on the festival ground, but you still can't teleport: a set ending
 * on one stage and the next you've picked starting on another needs a moment.
 */
const STAGE_WALK: Record<StageId, Record<StageId, number>> = {
  rugina: { rugina: 0, brasov: 4, calmuc: 6 },
  brasov: { rugina: 4, brasov: 0, calmuc: 4 },
  calmuc: { rugina: 6, brasov: 4, calmuc: 0 },
};

/** Comfort margin on top of the raw walk before a hop counts as "tight". */
const TIGHT_BUFFER = 3;

export function walkMinutes(a: StageId, b: StageId): number {
  return STAGE_WALK[a][b];
}

export interface Transition {
  from: SetSlot;
  to: SetSlot;
  /** gap between `from` ending and `to` starting, in minutes (>= 0) */
  gap: number;
  /** estimated walking time between the two stages, in minutes */
  walk: number;
  /** gap minus walk — negative means you literally can't make it in time */
  slack: number;
}

/**
 * Flag back-to-back picks on *different* stages where the gap is too short to
 * comfortably walk across — a real conflict the pure time-overlap clash check
 * misses. For each pick we look only at the very next non-overlapping pick (the
 * one you'd actually leave for); an earlier same-stage successor needs no walk.
 */
export function findTightTransitions(slots: SetSlot[]): Transition[] {
  const byDay = new Map<string, SetSlot[]>();
  for (const s of slots) {
    const list = byDay.get(s.dayId) ?? [];
    list.push(s);
    byDay.set(s.dayId, list);
  }

  const out: Transition[] = [];
  for (const list of byDay.values()) {
    const sorted = [...list].sort((x, y) => x.start - y.start);
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i];
      // The set you'd move to next: the earliest pick that starts at or after
      // this one ends (a later start that still overlaps is a clash, not a hop).
      const b = sorted.slice(i + 1).find((s) => s.start >= a.end);
      if (!b) continue;
      if (b.stage.id === a.stage.id) continue; // same stage, no walk needed
      const gap = b.start - a.end;
      const walk = walkMinutes(a.stage.id, b.stage.id);
      if (gap < walk + TIGHT_BUFFER) {
        out.push({ from: a, to: b, gap, walk, slack: gap - walk });
      }
    }
  }
  return out;
}

/** Slot ids involved in at least one tight transition. */
export function tightIds(slots: SetSlot[]): Set<string> {
  const ids = new Set<string>();
  for (const t of findTightTransitions(slots)) {
    ids.add(t.from.id);
    ids.add(t.to.id);
  }
  return ids;
}
