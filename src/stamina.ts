import { DAYS } from './data';
import type { FestivalDay, SetSlot } from './types';
import { fmtDuration, getSlot, minutesToLabel, subscribeSchedule, toMinutes } from './schedule';
import { planDay, type DayPlan, type PlannedSet } from './planner';
import { subscribeDuels } from './duel';
import { selection } from './store';
import { scoreAgainst, tasteProfile } from './taste';
import { hourFor, hasForecast, subscribeForecast, type HourForecast } from './weather';
import {
  EXTRAS,
  WALK_MIN,
  boardBy,
  dayTypeFor,
  toTown,
  type BusRun,
  type DayType,
} from './buses';

/**
 * The stamina engine: five days, sets until 02:45, an open field in July and a
 * bus that stops running at 03:00. Every other clashfinder plans one day at a
 * time and assumes you're a machine; this one plans the *week* and assumes
 * you're a body.
 *
 * It takes the duel-resolved route the day planner already computes, charges it
 * for time on your feet, stage hops, the small hours, heat and UV from the live
 * hourly forecast, rain, and real door-to-door travel off the RATBV timetable —
 * then tracks a reserve battery across the whole run: each day drains it, each
 * night refills it by however much sleep the running order actually leaves you.
 *
 * The output is deliberately opinionated: concrete, numbered interventions
 * ("drop Fu Manchu, 01:00–02:00, and you gain 1h55 in bed"), and a repair pass
 * that will name the sets to cut to keep the week above a floor. It is a model,
 * not medicine — every input it uses is shown in the panel so you can disagree
 * with it.
 */

/* ---------- profile ---------- */

export type BaseId = 'camp' | 'bus' | 'car';

export interface StaminaProfile {
  /** Where you sleep, which decides your door-to-door travel each day. */
  base: BaseId;
  /** Hours of sleep you need to wake up level. */
  sleepTarget: number;
}

const PROFILE_KEY = 'ref2026.stamina.v1';
const DEFAULT_PROFILE: StaminaProfile = { base: 'bus', sleepTarget: 7.5 };

export const BASES: { id: BaseId; label: string; hint: string }[] = [
  { id: 'camp', label: '⛺ Camping on site', hint: 'Tent a few minutes from the gate' },
  { id: 'bus', label: '🚌 Brașov, by bus', hint: 'RATBV 210/220 out, the 211T night line back' },
  { id: 'car', label: '🚗 Brașov, driving', hint: 'Own wheels, parking near the site' },
];

let cached: StaminaProfile | null = null;
const listeners = new Set<() => void>();

export function profile(): StaminaProfile {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<StaminaProfile>) : {};
    const base = BASES.some((b) => b.id === parsed.base) ? (parsed.base as BaseId) : DEFAULT_PROFILE.base;
    const target =
      typeof parsed.sleepTarget === 'number' && parsed.sleepTarget >= 5 && parsed.sleepTarget <= 10
        ? parsed.sleepTarget
        : DEFAULT_PROFILE.sleepTarget;
    cached = { base, sleepTarget: target };
  } catch {
    cached = { ...DEFAULT_PROFILE };
  }
  return cached;
}

export function setProfile(patch: Partial<StaminaProfile>): void {
  cached = { ...profile(), ...patch };
  invalidateWeek();
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(cached));
  } catch {
    /* ignore quota / private mode */
  }
  listeners.forEach((fn) => fn());
}

export function subscribeStamina(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* ---------- model constants ---------- */

/** Gate queue, bag check, first beer — before the first set you picked. */
const PRE_SHOW = 40;
/** Getting off the site after the last note. */
const POST_SHOW = 15;
/** Shower, food, doom-scrolling — between getting in and actually sleeping. */
const WIND_DOWN = 25;
/** Waking, eating and packing before you can set off again. */
const GET_READY = 45;
/** A planned gap at least this long is real rest rather than a queue shuffle. */
const REST_GAP = 25;
/** "Feels like" at or above this is heat load in an open field. */
const HOT_FEELS = 28;
/** UV at or above this burns exposed skin inside half an hour. */
const HIGH_UV = 6;
/** Rain probability at or above this counts as getting wet. */
const WET_PROB = 50;
/** Brașov sits at 600m: clear nights get genuinely cold by 02:00. */
const COLD_TEMP = 13;
/** How much of a day's strain comes off the battery. */
const DRAIN_K = 0.7;
/** A full night at your target restores this many points. */
const RECOVERY_MAX = 52;
/**
 * The share of each day's drain that a single night simply cannot repay. Five
 * days in a field is not five independent days: the ceiling you wake up to
 * drops a little every morning, which is why day 5 of a festival feels nothing
 * like day 1 even after a long lie-in.
 */
const RESIDUAL_K = 0.18;
/** Longest stretch of continuous show-going before you need to eat. */
const MEAL_STRETCH = 270;
/** Reserve below this and the week is running on fumes. */
export const RESERVE_FLOOR = 45;

/* ---------- weather exposure ---------- */

export interface Climate {
  hasData: boolean;
  peakFeels: number | null;
  minTemp: number | null;
  peakUv: number | null;
  /** On-site minutes at or above the heat / UV / rain / cold thresholds. */
  hotMinutes: number;
  uvMinutes: number;
  rainMinutes: number;
  coldMinutes: number;
  rainMm: number;
  /** Wall-clock window of the hottest run of hours, when there is one. */
  hotFrom: number | null;
  hotTo: number | null;
  rainFrom: number | null;
  rainTo: number | null;
}

const EMPTY_CLIMATE: Climate = {
  hasData: false,
  peakFeels: null,
  minTemp: null,
  peakUv: null,
  hotMinutes: 0,
  uvMinutes: 0,
  rainMinutes: 0,
  coldMinutes: 0,
  rainMm: 0,
  hotFrom: null,
  hotTo: null,
  rainFrom: null,
  rainTo: null,
};

/**
 * Exposure over the stretch you're actually on the grounds — you stand in the
 * same sun and the same rain during the gaps between sets, so the whole on-site
 * window counts, not just the minutes in front of a stage.
 */
function climateOver(date: string, from: number, to: number): Climate {
  if (!hasForecast()) return { ...EMPTY_CLIMATE };
  const out: Climate = { ...EMPTY_CLIMATE, hasData: true };
  let sawAny = false;
  for (let block = Math.floor(from / 60) * 60; block < to; block += 60) {
    const h: HourForecast | undefined = hourFor(date, block);
    if (!h) continue;
    sawAny = true;
    const minutes = Math.min(to, block + 60) - Math.max(from, block);
    if (minutes <= 0) continue;
    const feels = h.feels ?? h.temp;
    if (feels != null) {
      out.peakFeels = out.peakFeels == null ? feels : Math.max(out.peakFeels, feels);
      if (feels >= HOT_FEELS) {
        out.hotMinutes += minutes;
        if (out.hotFrom == null) out.hotFrom = Math.max(from, block);
        out.hotTo = Math.min(to, block + 60);
      }
    }
    if (h.temp != null) {
      out.minTemp = out.minTemp == null ? h.temp : Math.min(out.minTemp, h.temp);
      if (h.temp <= COLD_TEMP) out.coldMinutes += minutes;
    }
    if (h.uv != null) {
      out.peakUv = out.peakUv == null ? h.uv : Math.max(out.peakUv, h.uv);
      if (h.uv >= HIGH_UV) out.uvMinutes += minutes;
    }
    if (h.precip != null && h.precip >= WET_PROB) {
      out.rainMinutes += minutes;
      if (out.rainFrom == null) out.rainFrom = Math.max(from, block);
      out.rainTo = Math.min(to, block + 60);
    }
    if (h.precipMm != null) out.rainMm += (h.precipMm * minutes) / 60;
  }
  if (!sawAny) return { ...EMPTY_CLIMATE };
  return out;
}

/* ---------- travel ---------- */

export interface Travel {
  /** Door-to-gate minutes on the way out. */
  out: number;
  /** Gate-to-bed minutes on the way back. */
  home: number;
  /** Human summary of the return leg — the one that decides your sleep. */
  note: string;
  /** The bus that gets you there in time, when you're riding one. */
  board?: BusRun;
  /** Set when the running order outlasts every ride home. */
  stranded?: boolean;
  /** Minutes waiting at the stop before the ride home actually leaves. */
  wait?: number;
}

/** Walk from the gate to the tent, or from the gate to your own car. */
const CAMP_WALK = 9;
const CAR_WALK = 10;
/** Ghimbav → a bed in Brașov once you're moving. */
const CAR_DRIVE = 22;
const BUS_RIDE_HOME = 25;
/** Stop → pillow at the Brașov end. */
const LAST_LEG = 12;

function travelFor(date: string, arrive: number, depart: number): Travel {
  const p = profile();
  if (p.base === 'camp') {
    return { out: CAMP_WALK, home: CAMP_WALK + 6, note: 'Tent on site — no ride to catch.' };
  }
  if (p.base === 'car') {
    return {
      out: CAR_WALK + CAR_DRIVE + 5,
      home: CAR_WALK + CAR_DRIVE + 5,
      note: `~${CAR_WALK + CAR_DRIVE + 5}m gate to bed by car — the only thing between you and sleep is the car park queue.`,
    };
  }

  const type: DayType = dayTypeFor(date);
  const board = boardBy(type, arrive);
  // Out: getting to Stadionul Municipal, the ride, and the 10m walk from the
  // Făgărașului stop. RATBV runs both lines on a 15m headway all festival, so
  // the wait is short even when the printed timetable is sparse.
  const out = 12 + Math.round(EXTRAS.daytime.headwayMin / 2) + 14 + WALK_MIN;

  const atStop = depart + 5; // the 211T boards at the festival gate itself
  const nightFrom = toMinutes(EXTRAS.night.from);
  const nightTo = toMinutes(EXTRAS.night.to);

  if (atStop >= nightFrom && atStop <= nightTo) {
    const wait = Math.ceil(EXTRAS.night.headwayMin / 2);
    return {
      out,
      home: 5 + wait + BUS_RIDE_HOME + LAST_LEG,
      wait,
      board,
      note: `${EXTRAS.night.line} from ${EXTRAS.night.boardStop} — every ${EXTRAS.night.headwayMin}m until ${EXTRAS.night.to}, ~${BUS_RIDE_HOME}m to ${EXTRAS.night.dest}.`,
    };
  }

  if (atStop > nightTo) {
    // Off the end of the night service: a taxi, or several hours on site.
    return {
      out,
      home: 10 + 25 + LAST_LEG,
      board,
      stranded: true,
      note: `The ${EXTRAS.night.line} runs until ${EXTRAS.night.to} and your last set puts you at the stop around ${minutesToLabel(atStop)}. Taxi money, or a few hours on site until the morning buses.`,
    };
  }

  // Leaving before the night service starts: the scheduled return, if one is
  // still running, otherwise you're waiting for the 00:30 shuttle anyway.
  const gateStop = depart + WALK_MIN;
  const run = toTown(type).find((r) => r.at >= gateStop && r.at < nightFrom);
  if (run) {
    const wait = run.at - gateStop;
    return {
      out,
      home: WALK_MIN + wait + BUS_RIDE_HOME + LAST_LEG,
      wait,
      board,
      note: `Scheduled ${run.line} at ${run.time} from ${run.stop} — ${wait}m at the stop after you walk out.`,
    };
  }
  const wait = nightFrom + Math.ceil(EXTRAS.night.headwayMin / 2) - (depart + 5);
  return {
    out,
    home: 5 + wait + BUS_RIDE_HOME + LAST_LEG,
    wait,
    board,
    note: `You're out at ${minutesToLabel(depart)} but the scheduled buses have finished — ${fmtDuration(wait)} on site until the ${EXTRAS.night.line} starts at ${EXTRAS.night.from}.`,
  };
}

/* ---------- the day model ---------- */

export interface DayLoad {
  day: FestivalDay;
  plan: DayPlan | null;
  /** Noon-anchored minutes: on site from `arrive` until `depart`. */
  arrive: number | null;
  depart: number | null;
  siteMinutes: number;
  watchMinutes: number;
  walkMinutes: number;
  restMinutes: number;
  lateNightMinutes: number;
  sets: number;
  climate: Climate;
  travel: Travel | null;
  /** 0–100 load for the day itself. */
  strain: number;
  /** Battery at the start of the day and after it, before that night's sleep. */
  reserveStart: number;
  reserveEnd: number;
  /** The best you could possibly be by this morning — 100 minus carried fatigue. */
  ceiling: number;
  /** Hours in bed before the next festival day, from the running order. */
  sleepHours: number | null;
  /** What those hours are actually worth once daylight (and canvas) is charged. */
  sleepEffective: number | null;
  bedAt: number | null;
  upAt: number | null;
  /** How much the following night gives back, in battery points. */
  recovery: number;
  /** The longest continuous show-going stretch with no real break, in minutes. */
  longestStretch: number;
  /** When that stretch begins (noon-anchored minutes). */
  stretchFrom: number | null;
  /** The biggest hole in the day's route — where a meal has to fit. */
  bestBreak: { start: number; end: number; minutes: number } | null;
}

export interface Week {
  days: DayLoad[];
  /** Lowest battery reading across the run (after the worst day). */
  lowest: number;
  lowestDayId: string | null;
  interventions: Intervention[];
  /** True once at least one day has picks to model. */
  hasPlan: boolean;
}

function plannedSets(plan: DayPlan | null): PlannedSet[] {
  if (!plan) return [];
  return plan.entries.filter((e): e is PlannedSet => e.kind === 'set');
}

/** On-feet load for a single day, before the week's battery maths. */
function loadFor(day: FestivalDay, picks?: ReadonlySet<string>): DayLoad {
  const plan = planDay(day.id, picks);
  const sets = plannedSets(plan);
  const base: DayLoad = {
    day,
    plan,
    arrive: null,
    depart: null,
    siteMinutes: 0,
    watchMinutes: 0,
    walkMinutes: 0,
    restMinutes: 0,
    lateNightMinutes: 0,
    sets: sets.length,
    climate: { ...EMPTY_CLIMATE },
    travel: null,
    strain: 0,
    reserveStart: 100,
    reserveEnd: 100,
    ceiling: 100,
    sleepHours: null,
    sleepEffective: null,
    bedAt: null,
    upAt: null,
    recovery: 0,
    longestStretch: 0,
    stretchFrom: null,
    bestBreak: null,
  };
  if (!plan || sets.length === 0) return base;

  const arrive = sets[0].slot.start - PRE_SHOW;
  const depart = sets[sets.length - 1].slot.end + POST_SHOW;
  const walkMinutes = sets.reduce((sum, s) => sum + (s.walk ?? 0), 0);
  const restMinutes = plan.entries.reduce(
    (sum, e) => (e.kind === 'gap' && e.minutes >= REST_GAP ? sum + e.minutes : sum),
    0,
  );

  // Minute 720 on the noon-anchored scale is midnight; everything past it is
  // played against your body clock rather than with it.
  const lateNightMinutes = Math.max(0, depart - Math.max(arrive, 720));

  // Longest run of sets with no gap worth calling a break — the hunger signal —
  // measured wall-clock from the first downbeat of the run to the last note, so
  // the five-minute shuffles between stages count as part of the stretch.
  let longestStretch = 0;
  let stretchFrom: number | null = null;
  let runStart: number | null = null;
  let runEnd = 0;
  const closeRun = (): void => {
    if (runStart == null) return;
    if (runEnd - runStart > longestStretch) {
      longestStretch = runEnd - runStart;
      stretchFrom = runStart;
    }
    runStart = null;
  };
  for (const entry of plan.entries) {
    if (entry.kind === 'gap' && entry.minutes >= REST_GAP) closeRun();
    else if (entry.kind === 'set') {
      if (runStart == null) runStart = entry.slot.start;
      runEnd = entry.slot.end;
    }
  }
  closeRun();

  let bestBreak: DayLoad['bestBreak'] = null;
  for (let i = 1; i < sets.length; i++) {
    const from = sets[i - 1].slot;
    const to = sets[i].slot;
    const free = to.start - from.end - (sets[i].walk ?? 0);
    if (free > 0 && (!bestBreak || free > bestBreak.minutes)) {
      bestBreak = { start: from.end, end: to.start, minutes: free };
    }
  }

  return {
    ...base,
    arrive,
    depart,
    siteMinutes: depart - arrive,
    watchMinutes: plan.watchMinutes,
    walkMinutes,
    restMinutes,
    lateNightMinutes,
    climate: climateOver(day.date, arrive, depart),
    travel: travelFor(day.date, arrive, depart),
    longestStretch,
    stretchFrom,
    bestBreak,
  };
}

function strainFor(d: DayLoad): number {
  if (!d.travel || d.sets === 0) return 0;
  const siteHours = d.siteMinutes / 60;
  const raw =
    3.0 * siteHours +
    0.1 * d.walkMinutes +
    0.055 * d.lateNightMinutes +
    0.075 * d.climate.hotMinutes +
    0.05 * d.climate.uvMinutes +
    0.06 * d.climate.rainMinutes +
    0.03 * d.climate.coldMinutes +
    0.2 * (d.travel.out + d.travel.home) -
    0.045 * d.restMinutes;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/** Absolute minutes on a single scale across the whole festival week. */
function absolute(dayIndex: number, minute: number): number {
  return dayIndex * 1440 + minute;
}

/** Wall-clock hour (0–23) of an absolute festival minute (0 = noon on day 1). */
function hourOfDay(abs: number): number {
  return Math.floor(((((abs % 1440) + 1440) % 1440) + 720) / 60) % 24;
}

/**
 * How much of an hour in bed is worth as sleep, by the hour of the day.
 *
 * This is the part every festival planner gets wrong. A running order that
 * finishes at 02:45 and restarts at 15:00 looks like ten hours in bed, so a
 * naive model says you're fine. You aren't: half of it lands in daylight, and
 * under canvas in July the tent is an oven from about nine in the morning. The
 * hours before sunrise are the only ones that count in full.
 */
function sleepEfficiency(hour: number, camping: boolean): number {
  if (hour >= 22 || hour < 6) return 1;
  if (hour < 8) return 0.85;
  if (hour < 10) return camping ? 0.45 : 0.65;
  if (hour < 12) return camping ? 0.3 : 0.5;
  return camping ? 0.25 : 0.4;
}

/** Nobody banks more than this in one go, however long the window is. */
const MAX_EFFECTIVE_SLEEP = 9 * 60;

/** Minutes in bed, and what those minutes are actually worth. */
function sleepValue(bedAt: number, upAt: number): { minutes: number; effective: number } {
  const minutes = Math.max(0, upAt - bedAt);
  if (minutes === 0) return { minutes: 0, effective: 0 };
  const camping = profile().base === 'camp';
  let effective = 0;
  for (let m = bedAt; m < upAt; m += 30) {
    const span = Math.min(30, upAt - m);
    effective += span * sleepEfficiency(hourOfDay(m), camping);
  }
  return { minutes, effective: Math.min(MAX_EFFECTIVE_SLEEP, effective) };
}

/**
 * The whole run: five days of load, four nights of recovery, one battery.
 * Pass `picks` to model a hypothetical line-up (the repair search does).
 *
 * `interventions` is left empty here; `weekOutlook` fills it. The search runs
 * this bare version thousands of times, and advice it never reads is waste.
 */
function computeWeek(picks?: ReadonlySet<string>): Week {
  const days = DAYS.map((day) => loadFor(day, picks));
  for (const d of days) d.strain = strainFor(d);

  const target = profile().sleepTarget * 60;
  let reserve = 100;
  let residual = 0;
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    d.ceiling = Math.round(100 - residual);
    d.reserveStart = Math.round(reserve);
    const drain = d.strain * DRAIN_K;
    reserve = Math.max(0, reserve - drain);
    d.reserveEnd = Math.round(reserve);
    residual += RESIDUAL_K * drain;

    // The night after this day. It ends when you have to set off for the next
    // festival day — or whenever you like, if there isn't one.
    const next = days.slice(i + 1).find((n) => n.arrive != null);
    if (d.depart != null && d.travel) {
      const bed = absolute(i, d.depart + d.travel.home + WIND_DOWN);
      d.bedAt = bed;
      if (next && next.arrive != null && next.travel) {
        const nextIndex = days.indexOf(next);
        const up = absolute(nextIndex, next.arrive - next.travel.out - GET_READY);
        d.upAt = up;
        const { minutes, effective } = sleepValue(bed, up);
        d.sleepHours = minutes / 60;
        d.sleepEffective = effective / 60;
        d.recovery = Math.min(RECOVERY_MAX, (effective / target) * RECOVERY_MAX);
      } else {
        // Nothing to get up for: assume you sleep yourself out.
        d.sleepHours = profile().sleepTarget;
        d.sleepEffective = profile().sleepTarget;
        d.recovery = RECOVERY_MAX;
      }
    } else {
      // A day off in the middle of the run is worth more than a good night.
      d.sleepHours = profile().sleepTarget;
      d.sleepEffective = profile().sleepTarget;
      d.recovery = RECOVERY_MAX;
    }
    if (i < days.length - 1) reserve = Math.min(100 - residual, reserve + d.recovery);
  }

  let lowest = 100;
  let lowestDayId: string | null = null;
  for (const d of days) {
    if (d.sets > 0 && d.reserveEnd < lowest) {
      lowest = d.reserveEnd;
      lowestDayId = d.day.id;
    }
  }

  const hasPlan = days.some((d) => d.sets > 0);
  return { days, lowest: hasPlan ? lowest : 100, lowestDayId, interventions: [], hasPlan };
}

/** The week plus its ranked advice — what the panel renders. */
export function weekOutlook(picks?: ReadonlySet<string>): Week {
  const week = computeWeek(picks);
  week.interventions = buildInterventions(week, picks);
  return week;
}

/**
 * The current week, memoised until something it depends on changes. The
 * autopilot repaints once a second and the header badge on every pick, so the
 * full outlook — advice, drop offers and all — is computed once per change
 * rather than once per paint.
 */
let memo: Week | null = null;

export function invalidateWeek(): void {
  memo = null;
}

export function currentWeek(): Week {
  if (!memo) memo = weekOutlook();
  return memo;
}

selection.subscribe(invalidateWeek);
subscribeDuels(invalidateWeek);
subscribeForecast(invalidateWeek);
subscribeSchedule(invalidateWeek);

/* ---------- interventions ---------- */

export type Severity = 'critical' | 'warn' | 'tip';

export interface Intervention {
  id: string;
  dayId: string;
  severity: Severity;
  icon: string;
  title: string;
  detail: string;
  /** A pick you can drop right here, with what dropping it buys you. */
  drop?: { slot: SetSlot; label: string };
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warn: 1, tip: 2 };

/** Genre-affinity profile of a line-up, built once and passed around. */
function profileOf(picks?: ReadonlySet<string>): Map<string, number> {
  const ids = [...(picks ?? selection.ids())];
  return tasteProfile(ids.map((id) => getSlot(id)).filter((s): s is SetSlot => Boolean(s)));
}

/** Taste value of a set: how much cutting it would actually hurt. */
function valueOf(slot: SetSlot, prof: Map<string, number>): number {
  return (slot.end - slot.start) / 60 + scoreAgainst(prof, slot).score;
}

/**
 * Sets from the back end of a night — the only ones whose removal can move your
 * bedtime. ★ must-sees are never candidates.
 */
function lateCandidates(d: DayLoad): SetSlot[] {
  const sets = plannedSets(d.plan)
    .map((p) => p.slot)
    .filter((s) => !selection.isStarred(s.id));
  if (sets.length <= 1) return [];
  return sets.filter((s) => s.end >= (d.depart ?? 0) - 180);
}

function bandsBetween(d: DayLoad, from: number, to: number): string[] {
  return plannedSets(d.plan)
    .filter((p) => p.slot.start < to && from < p.slot.end)
    .map((p) => p.slot.band);
}

function buildInterventions(week: Week, picks?: ReadonlySet<string>): Intervention[] {
  const out: Intervention[] = [];
  const target = profile().sleepTarget;
  const prof = profileOf(picks);

  week.days.forEach((d, i) => {
    if (d.sets === 0 || d.arrive == null || d.depart == null || !d.travel) return;
    const id = d.day.id;

    if (d.travel.stranded) {
      out.push({
        id: `${id}:stranded`,
        dayId: id,
        severity: 'critical',
        icon: '🚌',
        title: `No ride home after ${d.day.label}`,
        detail: d.travel.note,
        drop: dropOffer(d, picks, prof, 'in bed, and the shuttle is still running', (after) => !after.travel?.stranded),
      });
    } else if ((d.travel.wait ?? 0) >= 30) {
      out.push({
        id: `${id}:wait`,
        dayId: id,
        severity: 'warn',
        icon: '🕓',
        title: `${fmtDuration(d.travel.wait ?? 0)} at the stop after ${d.day.label}`,
        detail: d.travel.note,
      });
    }

    if (d.sleepEffective != null && d.sleepHours != null && i < week.days.length - 1) {
      const shortfall = target - d.sleepEffective;
      if (d.sleepEffective < 5 || shortfall >= 1.5) {
        const lost = Math.round((d.sleepHours - d.sleepEffective) * 60);
        out.push({
          id: `${id}:sleep`,
          dayId: id,
          severity: d.sleepEffective < 4.5 ? 'critical' : 'warn',
          icon: '😴',
          title: `${fmtDuration(Math.round(d.sleepEffective * 60))} of real sleep after ${d.day.label}`,
          detail:
            `Bed around ${clockOf(d.bedAt)}, up at ${clockOf(d.upAt)}: ${fmtDuration(Math.round(d.sleepHours * 60))} in bed, ` +
            (lost >= 30
              ? `but ${fmtDuration(lost)} of it lands after sunrise${profile().base === 'camp' ? ' in a tent that turns into an oven' : ''}, so it counts for far less. `
              : '') +
            `That's ${fmtDuration(Math.round(shortfall * 60))} under your ${target}h target, and the debt lands on the *next* day, not this one.`,
          drop: dropOffer(d, picks, prof, 'in bed'),
        });
      }
    }

    if (d.longestStretch >= MEAL_STRETCH) {
      const gap = d.bestBreak;
      // A hole at 01:10 is not a dinner window, however long it is.
      const roomy = gap && gap.minutes >= 18 && gap.start < toMinutes('22:00');
      out.push({
        id: `${id}:meal`,
        dayId: id,
        severity: 'warn',
        icon: '🍽',
        title: `${fmtDuration(d.longestStretch)} back-to-back from ${minutesToLabel(d.stretchFrom ?? d.arrive + PRE_SHOW)}`,
        detail: roomy
          ? `The one hole in this route is ${fmtDuration(gap.minutes)} at ${minutesToLabel(gap.start)}–${minutesToLabel(gap.end)}. ` +
            'That is your meal window, and it is long enough for exactly one queue — pick the stand before you get there.'
          : (gap
              ? `The only hole in it is ${fmtDuration(gap.minutes)} at ${minutesToLabel(gap.start)} — too small or too late to be a meal. `
              : 'There is no hole in it at all. ') +
            `Eat before ${minutesToLabel(d.stretchFrom ?? d.arrive + PRE_SHOW)}, or carry the night's food in with you.`,
      });
    }

    const c = d.climate;
    if (c.hasData && c.hotMinutes >= 60 && c.hotFrom != null && c.hotTo != null) {
      const bands = bandsBetween(d, c.hotFrom, c.hotTo).slice(0, 3);
      out.push({
        id: `${id}:heat`,
        dayId: id,
        severity: c.peakFeels != null && c.peakFeels >= 32 ? 'critical' : 'warn',
        icon: '🥵',
        title: `${fmtDuration(c.hotMinutes)} in the heat — feels ${Math.round(c.peakFeels ?? 0)}°`,
        detail:
          `${minutesToLabel(c.hotFrom)}–${minutesToLabel(c.hotTo)}${bands.length ? ` covers ${bands.join(', ')}` : ''}` +
          `${c.peakUv != null && c.peakUv >= HIGH_UV ? ` with UV ${Math.round(c.peakUv)}` : ''}. ` +
          'Half a litre an hour and shade between sets, or you pay for it at midnight.',
      });
    }

    if (c.hasData && c.rainMinutes >= 45 && c.rainFrom != null && c.rainTo != null) {
      const bands = bandsBetween(d, c.rainFrom, c.rainTo).slice(0, 3);
      out.push({
        id: `${id}:rain`,
        dayId: id,
        severity: 'warn',
        icon: '🌧',
        title: `Rain likely ${minutesToLabel(c.rainFrom)}–${minutesToLabel(c.rainTo)}`,
        detail:
          `${bands.length ? `${bands.join(', ')} — ` : ''}${c.rainMm >= 1 ? `about ${c.rainMm.toFixed(1)} mm. ` : ''}` +
          'A poncho weighs nothing; being wet from 19:00 to 01:00 is the fastest way to lose a day.',
      });
    }

    if (c.hasData && c.coldMinutes >= 60 && c.minTemp != null) {
      out.push({
        id: `${id}:cold`,
        dayId: id,
        severity: 'tip',
        icon: '🧥',
        title: `Down to ${Math.round(c.minTemp)}° in the small hours`,
        detail: `You're on site until ${minutesToLabel(d.depart)} and the field has no walls. Pack a layer at 15:00 that you'll want at 01:00.`,
      });
    }

    if (d.siteMinutes >= 600) {
      out.push({
        id: `${id}:marathon`,
        dayId: id,
        severity: 'tip',
        icon: '🥾',
        title: `${fmtDuration(d.siteMinutes)} on site`,
        detail: `${d.sets} sets, ${fmtDuration(d.walkMinutes)} of walking between stages, ${fmtDuration(d.restMinutes)} of planned sitting. The route is optimal; the day is just long.`,
      });
    }

    if (d.reserveStart < 40) {
      const star = plannedSets(d.plan).find((p) => p.starred);
      out.push({
        id: `${id}:reserve`,
        dayId: id,
        severity: 'critical',
        icon: '🪫',
        title: `You reach ${d.day.label} at ${d.reserveStart}%`,
        detail: star
          ? `Four days of this run land here. ${star.slot.band} at ${star.slot.startLabel} is your ★ — protect it by arriving later, not by pushing through the afternoon.`
          : 'Four days of this run land here. Nothing on this day is starred — trimming the afternoon costs you very little.',
        drop: earlyDropOffer(d),
      });
    }
  });

  return out.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      DAYS.findIndex((x) => x.id === a.dayId) - DAYS.findIndex((x) => x.id === b.dayId),
  );
}

function clockOf(abs: number | null): string {
  if (abs == null) return '—';
  return minutesToLabel(((abs % 1440) + 1440) % 1440);
}

/** "Drop this late set and gain X" — computed by actually re-running the model. */
function dropOffer(
  d: DayLoad,
  picks: ReadonlySet<string> | undefined,
  prof: Map<string, number>,
  suffix: string,
  requires?: (after: DayLoad) => boolean,
): { slot: SetSlot; label: string } | undefined {
  const base = new Set(picks ?? selection.ids());
  let best: { slot: SetSlot; gain: number; ratio: number } | null = null;
  // Only a set that actually moves your departure buys you anything, and the
  // cheapest one by taste often isn't the closer — so price every candidate by
  // re-running the model rather than guessing from the running order. When the
  // offer promises something specific (a bus you'd otherwise miss), the trial
  // run has to deliver it too.
  for (const slot of lateCandidates(d)) {
    const without = new Set(base);
    without.delete(slot.id);
    const after = computeWeek(without).days.find((x) => x.day.id === d.day.id);
    if (!after) continue;
    if (requires && !requires(after)) continue;
    const gain = (after.sleepEffective ?? 0) - (d.sleepEffective ?? 0);
    if (gain < 0.25) continue;
    const ratio = gain / Math.max(0.4, valueOf(slot, prof));
    if (!best || ratio > best.ratio) best = { slot, gain, ratio };
  }
  if (!best) return undefined;
  return {
    slot: best.slot,
    label: `Drop ${best.slot.band} (${best.slot.startLabel}–${best.slot.endLabel}) → +${fmtDuration(Math.round(best.gain * 60))} ${suffix}`,
  };
}

/** The mirror image: skip the afternoon opener and start the day later. */
function earlyDropOffer(d: DayLoad): { slot: SetSlot; label: string } | undefined {
  const sets = plannedSets(d.plan).map((p) => p.slot);
  if (sets.length <= 1) return undefined;
  const first = sets[0];
  if (selection.isStarred(first.id)) return undefined;
  const gain = sets[1].start - first.start;
  if (gain < 45) return undefined;
  return {
    slot: first,
    label: `Skip ${first.band} (${first.startLabel}) → arrive ${fmtDuration(gain)} later`,
  };
}

/* ---------- the repair pass ---------- */

export interface Cut {
  slot: SetSlot;
  /** Why this one, in the user's terms. */
  reason: string;
}

export interface Repair {
  cuts: Cut[];
  /** Battery at the end of each day, before and after the cuts. */
  before: number[];
  after: number[];
  beforeLow: number;
  afterLow: number;
  /** True when the cuts got the whole week above the floor. */
  solved: boolean;
}

/** Total shortfall below the floor across the week — the thing we minimise. */
function deficit(week: Week, floor: number): number {
  return week.days.reduce(
    (sum, d) => (d.sets > 0 ? sum + Math.max(0, floor - d.reserveEnd) : sum),
    0,
  );
}

/**
 * Name the sets to cut. A greedy search over every unstarred pick: at each step
 * it takes the cut with the best shortfall-removed-per-unit-of-taste-lost, and
 * stops as soon as the week clears the floor (or nothing helps any more).
 *
 * ★ must-sees are never proposed. Neither is anything that doesn't measurably
 * move the battery — this refuses to suggest a sacrifice that buys nothing.
 */
export function proposeRepair(floor: number = RESERVE_FLOOR, maxCuts = 5): Repair | null {
  const start = new Set(selection.ids());
  if (start.size === 0) return null;
  const baseline = computeWeek(start);
  const before = baseline.days.map((d) => d.reserveEnd);
  const beforeLow = baseline.lowest;
  if (deficit(baseline, floor) === 0) {
    return {
      cuts: [],
      before,
      after: before,
      beforeLow,
      afterLow: beforeLow,
      solved: true,
    };
  }

  let current = start;
  let currentWeek = baseline;
  const prof = profileOf(start);
  const cuts: Cut[] = [];

  while (cuts.length < maxCuts && deficit(currentWeek, floor) > 0) {
    const candidates = [...current]
      .map((id) => getSlot(id))
      .filter((s): s is SetSlot => Boolean(s))
      .filter((s) => !selection.isStarred(s.id));

    let best: { slot: SetSlot; week: Week; gain: number; ratio: number } | null = null;
    const baseDeficit = deficit(currentWeek, floor);
    for (const slot of candidates) {
      const trial = new Set(current);
      trial.delete(slot.id);
      const week = computeWeek(trial);
      const gain = baseDeficit - deficit(week, floor);
      if (gain <= 0.5) continue;
      const ratio = gain / Math.max(0.4, valueOf(slot, prof));
      if (!best || ratio > best.ratio) best = { slot, week, gain, ratio };
    }
    if (!best) break;

    const dayBefore = currentWeek.days.find((d) => d.day.id === best!.slot.dayId);
    const dayAfter = best.week.days.find((d) => d.day.id === best!.slot.dayId);
    const reasonBits: string[] = [];
    const sleepGain = (dayAfter?.sleepEffective ?? 0) - (dayBefore?.sleepEffective ?? 0);
    const laterStart = (dayAfter?.arrive ?? 0) - (dayBefore?.arrive ?? 0);
    const earlierEnd = (dayBefore?.depart ?? 0) - (dayAfter?.depart ?? 0);
    if (laterStart >= 20) reasonBits.push(`start ${fmtDuration(laterStart)} later`);
    if (earlierEnd >= 20) reasonBits.push(`off site ${fmtDuration(earlierEnd)} earlier`);
    if (sleepGain >= 0.25) reasonBits.push(`+${fmtDuration(Math.round(sleepGain * 60))} real sleep`);
    const strainDrop = (dayBefore?.strain ?? 0) - (dayAfter?.strain ?? 0);
    if (strainDrop > 0) reasonBits.push(`−${strainDrop} load on ${dayBefore?.day.label}`);
    cuts.push({
      slot: best.slot,
      reason: reasonBits.length
        ? reasonBits.join(' · ')
        : `frees ${fmtDuration(best.slot.end - best.slot.start)}`,
    });
    current = new Set([...current].filter((id) => id !== best!.slot.id));
    currentWeek = best.week;
  }

  if (cuts.length === 0) return null;
  const finalWeek = computeWeek(current);
  return {
    cuts,
    before,
    after: finalWeek.days.map((d) => d.reserveEnd),
    beforeLow,
    afterLow: finalWeek.lowest,
    solved: deficit(finalWeek, floor) === 0,
  };
}

/** Apply a repair proposal to the real picks. */
export function applyRepair(repair: Repair): void {
  for (const cut of repair.cuts) {
    if (selection.has(cut.slot.id)) selection.toggle(cut.slot.id);
  }
}

/**
 * Just the battery reading for the week — no advice, no drop offers. Cheap
 * enough for the header badge to recompute on every pick.
 */
export function weekBattery(): { lowest: number; lowestDayId: string | null; hasPlan: boolean } {
  const week = currentWeek();
  return { lowest: week.lowest, lowestDayId: week.lowestDayId, hasPlan: week.hasPlan };
}

/** The modelled load for one day, or null when nothing is picked on it. */
export function dayRead(dayId: string): DayLoad | null {
  const d = currentWeek().days.find((x) => x.day.id === dayId);
  return d && d.sets > 0 ? d : null;
}

/** The advice for one day, most urgent first. */
export function dayAdvice(dayId: string): Intervention[] {
  return currentWeek().interventions.filter((i) => i.dayId === dayId);
}

/** Colour band for a battery reading, shared by the panel and the bar. */
export function reserveTone(value: number): 'ok' | 'warn' | 'bad' {
  if (value >= 60) return 'ok';
  if (value >= RESERVE_FLOOR) return 'warn';
  return 'bad';
}
