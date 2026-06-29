import { DAYS, FESTIVAL } from './data';
import { getSlot } from './schedule';
import { selection } from './store';
import { leadMinutes } from './notify';
import type { SetSlot } from './types';

/**
 * Export the user's picks as an `.ics` calendar with a per-set alarm, so the
 * device's native calendar reminds them before each set — reliably, even when
 * this app is fully closed, offline, on any platform. No backend required.
 */

const FILE_NAME = 'rockstadt-2026-picks.ics';

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

function vevent(slot: SetSlot, lead: number, stamp: string): string | null {
  const start = toUtc(slot.dayId, slot.startLabel);
  const end = toUtc(slot.dayId, slot.endLabel);
  if (!start || !end) return null;

  const uid = `${slot.dayId}-${slot.stage.id}-${slug(slot.band)}@rockstadt2026clash`;
  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${stampOf(start)}`,
    `DTEND:${stampOf(end)}`,
    `SUMMARY:${esc(slot.band)}`,
    `LOCATION:${esc(slot.stage.name)}`,
    `DESCRIPTION:${esc(`${FESTIVAL.name} — ${slot.stage.name}`)}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(`${slot.band} starts in ${lead} min`)}`,
    `TRIGGER:-PT${lead}M`,
    'END:VALARM',
    'END:VEVENT',
  ].join('\r\n');
}

/** Build the `.ics` text for the current selection, or null if empty. */
export function buildIcs(): string | null {
  const lead = leadMinutes();
  const stamp = stampOf(new Date());
  const events = selection
    .ids()
    .map((id) => getSlot(id))
    .filter((s): s is SetSlot => Boolean(s))
    .map((s) => vevent(s, lead, stamp))
    .filter((v): v is string => Boolean(v));

  if (events.length === 0) return null;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//rockstadt2026clash//Clashfinder//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(`${FESTIVAL.name} 2026 — my picks`)}`,
    ...events,
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

export interface CalendarResult {
  outcome: 'shared' | 'downloaded' | 'empty';
}

/**
 * Hand the `.ics` to the OS: the native share sheet on mobile (so the user can
 * drop it straight into their calendar), or a file download elsewhere.
 */
export async function exportCalendar(): Promise<CalendarResult> {
  const ics = buildIcs();
  if (!ics) return { outcome: 'empty' };

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const file = new File([blob], FILE_NAME, { type: 'text/calendar' });

  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };
  const shareData: ShareData = { files: [file], title: `${FESTIVAL.name} 2026 — my picks` };

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
  a.download = FILE_NAME;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { outcome: 'downloaded' };
}
