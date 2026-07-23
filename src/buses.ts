import { toMinutes } from './schedule';

/**
 * RATBV city buses between Brașov and the festival site in Ghimbav.
 *
 * The festival's own directions page sends people on line 210 or 220 from
 * Stadionul Municipal to the "Făgărașului" stop in Ghimbav, which is roughly a
 * 10 minute walk from the gate.
 *
 * Timetables transcribed from the official RATBV stop displays:
 *   210 → Ghimbav   https://www.ratbv.ro/afisaje/210-intors.html
 *   220 → Codlea    https://www.ratbv.ro/afisaje/220-intors.html
 *   (and the matching "-dus" pages for the run back into Brașov)
 *
 * Note the two lines are not mirror images: on the way back, 210 does **not**
 * call at Făgărașului — it leaves Ghimbav via Crizantemei / Gentianei — so the
 * return chips carry their own stop name.
 */

export type BusLineId = '210' | '220';
/** RATBV publishes one table for Mon–Fri and one for Sat–Sun. */
export type DayType = 'weekday' | 'weekend';

export interface BusRun {
  line: BusLineId;
  /** "HH:MM" departure from the stop named on the run. */
  time: string;
  /** Stop the bus leaves from. */
  stop: string;
  /** Minutes from the noon anchor, so late runs sort past midnight. */
  at: number;
}

export const STOP_TOWN = 'Stadionul Municipal';
export const STOP_SITE = 'Ghimbav Făgărașului';

/** Ride time Stadionul Municipal → Ghimbav Făgărașului, per line. */
const RIDE_MIN: Record<BusLineId, number> = { '210': 14, '220': 13 };

/** Făgărașului stop → festival gate, per the festival's directions page. */
export const WALK_MIN = 10;

export const SOURCES = [
  { label: 'RATBV 210', url: 'https://www.ratbv.ro/afisaje/210-intors.html' },
  { label: 'RATBV 220', url: 'https://www.ratbv.ro/afisaje/220-intors.html' },
];

/**
 * Extra services laid on for the festival — announced by the organisers rather
 * than published as a RATBV stop display, so these are windows, not timetables.
 *
 * The night buses matter more than their footnote size suggests: every night of
 * this running order ends after the last scheduled bus, so for most people they
 * are the ride home rather than a fallback. Note they run to Livada Poștei, not
 * back to Stadionul Municipal where the daytime lines start.
 */
export const EXTRAS = {
  /** Both lines are supplemented across the arrival window. */
  inbound: { from: '13:00', to: '17:00' },
  /** Return services from the festival area into central Brașov. */
  night: { from: '00:30', to: '03:00', dest: 'Livada Poștei, Brașov' },
};

/** True for a departure inside the supplemented 13:00–17:00 arrival window. */
export function inExtraWindow(run: BusRun): boolean {
  return run.at >= toMinutes(EXTRAS.inbound.from) && run.at <= toMinutes(EXTRAS.inbound.to);
}

/** Departures from Stadionul Municipal, Brașov → Ghimbav. */
const OUTBOUND: Record<BusLineId, Record<DayType, string[]>> = {
  '210': {
    weekday: [
      '05:00', '05:30', '06:00', '06:30', '07:00', '07:30', '08:00', '08:30',
      '09:30', '10:30', '11:30', '12:30', '13:00', '13:30', '14:00', '14:30',
      '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:30', '19:30',
      '20:30', '21:30', '22:30',
    ],
    weekend: [
      '06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00',
      '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00',
      '22:00',
    ],
  },
  '220': {
    weekday: [
      '05:00', '05:30', '06:05', '06:25', '06:51', '07:20', '07:38', '08:01',
      '08:30', '09:10', '09:35', '10:20', '10:40', '11:45', '12:10', '12:25',
      '12:55', '13:15', '13:35', '14:00', '14:25', '14:45', '15:20', '15:45',
      '16:00', '16:21', '16:55', '17:10', '17:35', '18:10', '18:40', '19:15',
      '19:50', '20:25', '21:00', '21:35', '22:10', '22:50',
    ],
    weekend: [
      '05:25', '06:35', '07:45', '08:59', '10:05', '11:15', '12:25', '13:35',
      '14:45', '15:55', '17:05', '18:19', '19:25', '20:35', '21:45', '22:55',
    ],
  },
};

/** Departures out of Ghimbav, back to Stadionul Municipal. */
const RETURN: Record<BusLineId, { stop: string; times: Record<DayType, string[]> }> = {
  '220': {
    stop: STOP_SITE,
    times: {
      weekday: [
        '05:45', '06:20', '06:55', '07:11', '07:41', '08:05', '08:28', '08:51',
        '09:15', '10:00', '10:25', '11:25', '11:45', '12:35', '12:55', '13:15',
        '13:45', '14:05', '14:25', '14:51', '15:30', '15:45', '16:05', '16:35',
        '16:50', '17:11', '17:45', '18:00', '18:21', '19:00', '19:30', '20:05',
        '20:40', '21:15', '21:50', '22:25', '23:00', '23:40',
      ],
      weekend: [
        '06:15', '07:25', '08:35', '09:45', '10:55', '12:05', '13:15', '14:25',
        '15:35', '16:45', '17:55', '19:05', '20:15', '21:25', '22:35', '23:45',
      ],
    },
  },
  '210': {
    stop: 'Ghimbav Gentianei',
    times: {
      weekday: [
        '05:34', '06:04', '06:34', '07:04', '07:34', '08:04', '08:34', '09:04',
        '10:04', '11:04', '12:04', '13:04', '13:34', '14:04', '14:34', '15:04',
        '15:34', '16:04', '16:34', '17:04', '17:34', '18:04', '19:04', '20:04',
        '21:04', '22:04', '23:04',
      ],
      weekend: [
        '06:34', '07:34', '08:34', '09:34', '10:34', '11:34', '12:34', '13:34',
        '14:34', '15:34', '16:34', '17:34', '18:34', '19:34', '20:34', '21:34',
        '22:34',
      ],
    },
  },
};

export function dayTypeFor(isoDate: string): DayType {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 || dow === 6 ? 'weekend' : 'weekday';
}

/** The ISO date one day after `isoDate` — the morning your night bus lands in. */
export function nextDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return t.toISOString().slice(0, 10);
}

const sorted = (runs: BusRun[]): BusRun[] => runs.sort((a, b) => a.at - b.at);

/** Buses out of Brașov, with the minute they put you at the festival gate. */
export function toSite(type: DayType): (BusRun & { atGate: number })[] {
  const runs: (BusRun & { atGate: number })[] = [];
  for (const line of ['210', '220'] as BusLineId[]) {
    for (const time of OUTBOUND[line][type]) {
      const at = toMinutes(time);
      runs.push({
        line,
        time,
        stop: STOP_TOWN,
        at,
        atGate: at + RIDE_MIN[line] + WALK_MIN,
      });
    }
  }
  return sorted(runs) as (BusRun & { atGate: number })[];
}

/** Buses back into Brașov, from whichever Ghimbav stop each line uses. */
export function toTown(type: DayType): BusRun[] {
  const runs: BusRun[] = [];
  for (const line of ['210', '220'] as BusLineId[]) {
    const spec = RETURN[line];
    for (const time of spec.times[type]) {
      runs.push({ line, time, stop: spec.stop, at: toMinutes(time) });
    }
  }
  return sorted(runs);
}

/** Latest bus that has you at the gate by `gateBy` (noon-anchored minutes). */
export function boardBy(
  type: DayType,
  gateBy: number,
): (BusRun & { atGate: number }) | undefined {
  const runs = toSite(type).filter((r) => r.atGate <= gateBy);
  return runs[runs.length - 1];
}

/**
 * Last bus of the night back into town. Bounded at midnight on purpose: in the
 * noon-anchored scale the next morning's 05:45 sorts *after* a 23:40, so an
 * unbounded "latest" would quietly hand you a bus seven hours later.
 */
export function lastHome(type: DayType): BusRun | undefined {
  const evening = toTown(type).filter(
    (r) => r.at >= toMinutes('18:00') && r.at < toMinutes('00:00'),
  );
  return evening[evening.length - 1];
}

/** First bus back into town the following morning. */
export function firstHomeNextDay(type: DayType): BusRun | undefined {
  return toTown(type).find((r) => r.at >= toMinutes('00:00'));
}
