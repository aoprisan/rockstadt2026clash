import { DAYS, FESTIVAL } from './data';
import { getSlot } from './schedule';
import { selection } from './store';
import { leadMinutes } from './notify';
import type { SetSlot } from './types';

/**
 * Export the user's picks as an `.ics` calendar with a per-set alarm, so the
 * device's native calendar reminds them before each set — reliably, even when
 * this app is fully closed, offline, on any platform. No backend required.
 *
 * A matching CANCEL export lets the user pull those events back out of their
 * calendar again. We remember which sets were exported (by UID) so removal
 * works even after the picks themselves have changed.
 */

const ADD_FILE = 'rockstadt-2026-picks.ics';
const CANCEL_FILE = 'rockstadt-2026-remove.ics';
const EXPORTED_KEY = 'ref2026.cal.exported.v1';

const dayDate = new Map(DAYS.map((d) => [d.id, d.date]));

/**
 * The festival runs 27–31 July 2026, firmly inside Eastern European Summer
 * Time (UTC+3). Emitting absolute UTC keeps every event at the correct moment
 * regardless of the device's own timezone.
 */
const FEST_UTC_OFFSET_H = 3;

function toUtc(dayId: string, hhmm: string): Date | null {
  const date = dayDate.get(dayId);
  if (!date) return null;
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const day = h < 8 ? d + 1 : d; // small-hours sets roll into the next date
  return new Date(Date.UTC(y, mo - 1, day, h - FEST_UTC_OFFSET_H, mi));
}

/** Date -> iCalendar UTC stamp, e.g. 20260727T183000Z. */
function stampOf(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** Escape a text value per RFC 5545 (commas, semicolons, backslashes). */
function esc(s: string): string {
  return s.replace(/([\\;,])/g, '\\$1').replace(/\n/g, '\\n');
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function uidOf(slot: SetSlot): string {
  return `${slot.dayId}-${slot.stage.id}-${slug(slot.band)}@rockstadt2026clash`;
}

function vevent(
  slot: SetSlot,
  opts: { cancel: boolean; lead: number; stamp: string },
): string | null {
  const start = toUtc(slot.dayId, slot.startLabel);
  const end = toUtc(slot.dayId, slot.endLabel);
  if (!start || !end) return null;

  const lines = [
    'BEGIN:VEVENT',
    `UID:${uidOf(slot)}`,
    `DTSTAMP:${opts.stamp}`,
    `DTSTART:${stampOf(start)}`,
    `DTEND:${stampOf(end)}`,
    `SUMMARY:${esc(slot.band)}`,
    `LOCATION:${esc(slot.stage.name)}`,
  ];

  if (opts.cancel) {
    // Higher SEQUENCE + CANCELLED status tells the calendar to drop the event.
    lines.push('STATUS:CANCELLED', 'SEQUENCE:1');
  } else {
    lines.push(
      `DESCRIPTION:${esc(`${FESTIVAL.name} — ${slot.stage.name}`)}`,
      'SEQUENCE:0',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(`${slot.band} starts in ${opts.lead} min`)}`,
      `TRIGGER:-PT${opts.lead}M`,
      'END:VALARM',
    );
  }

  lines.push('END:VEVENT');
  return lines.join('\r\n');
}

function wrapCalendar(method: 'PUBLISH' | 'CANCEL', events: string[]): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//rockstadt2026clash//Clashfinder//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    `X-WR-CALNAME:${esc(`${FESTIVAL.name} 2026 — my picks`)}`,
    ...events,
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

function slotsFromIds(ids: string[]): SetSlot[] {
  return (
    ids
      .map((id) => getSlot(id))
      .filter((s): s is SetSlot => Boolean(s))
      // Never write a calendar entry for a set that isn't happening. Times here
      // are the patched ones, so an export after a slip reflects the real night.
      .filter((s) => !s.cancelled)
  );
}

function loadExported(): Set<string> {
  try {
    const raw = localStorage.getItem(EXPORTED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function rememberExported(ids: string[]): void {
  try {
    const set = loadExported();
    ids.forEach((id) => set.add(id));
    localStorage.setItem(EXPORTED_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

function forgetExported(): void {
  try {
    localStorage.removeItem(EXPORTED_KEY);
  } catch {
    /* ignore */
  }
}

/** True when at least one set has been exported and not yet removed. */
export function hasExported(): boolean {
  return slotsFromIds([...loadExported()]).length > 0;
}

/** Build the add `.ics` for the current selection, or null if empty. */
export function buildAddIcs(): string | null {
  const lead = leadMinutes();
  const stamp = stampOf(new Date());
  const events = slotsFromIds(selection.ids())
    .map((s) => vevent(s, { cancel: false, lead, stamp }))
    .filter((v): v is string => Boolean(v));
  return events.length ? wrapCalendar('PUBLISH', events) : null;
}

/** Build the cancel `.ics` for everything exported so far, or null if none. */
export function buildCancelIcs(): string | null {
  const stamp = stampOf(new Date());
  const events = slotsFromIds([...loadExported()])
    .map((s) => vevent(s, { cancel: true, lead: 0, stamp }))
    .filter((v): v is string => Boolean(v));
  return events.length ? wrapCalendar('CANCEL', events) : null;
}

export interface CalendarResult {
  outcome: 'shared' | 'downloaded' | 'empty';
}

/** Hand an `.ics` blob to the OS share sheet (mobile) or a download (desktop). */
async function deliver(ics: string, fileName: string, title: string): Promise<CalendarResult> {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const file = new File([blob], fileName, { type: 'text/calendar' });

  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };
  const shareData: ShareData = { files: [file], title };

  if (typeof nav.canShare === 'function' && nav.canShare(shareData) && nav.share) {
    try {
      await nav.share(shareData);
      return { outcome: 'shared' };
    } catch (err) {
      // User dismissed the share sheet — treat as a no-op, don't force a download.
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { outcome: 'shared' };
      }
      // Any other failure: fall through to a download so they still get the file.
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { outcome: 'downloaded' };
}

/** Export the current picks to the calendar (with reminders). */
export async function exportCalendar(): Promise<CalendarResult> {
  const ics = buildAddIcs();
  if (!ics) return { outcome: 'empty' };
  const result = await deliver(ics, ADD_FILE, `${FESTIVAL.name} 2026 — my picks`);
  rememberExported(selection.ids());
  return result;
}

/** Remove the previously-exported events from the calendar. */
export async function clearCalendar(): Promise<CalendarResult> {
  const ics = buildCancelIcs();
  if (!ics) return { outcome: 'empty' };
  const result = await deliver(ics, CANCEL_FILE, `${FESTIVAL.name} 2026 — remove`);
  forgetExported();
  return result;
}
