import { DAYS } from './data';
import { getSlot, subscribeSchedule } from './schedule';
import { selection } from './store';
import type { SetSlot } from './types';

/**
 * Set-start reminders.
 *
 * The app has no backend, so reminders are scheduled on the device with
 * `setTimeout` and a periodic safety scan. They fire while the app is open
 * (including in a backgrounded tab / installed PWA) through two channels:
 *
 *  - **Native** — an OS notification shown through the service worker
 *    registration when available (required on mobile) and falling back to the
 *    `Notification` constructor on desktop. This is what reaches the user while
 *    the app sits in the background.
 *  - **In-app** — a listener hook (`onReminder`) the UI subscribes to so it can
 *    surface a visible toast while the app is focused, where browsers routinely
 *    suppress the OS notification.
 */

const ENABLED_KEY = 'ref2026.notify.enabled.v1';
const LEAD_KEY = 'ref2026.notify.lead.v1';
const FIRED_KEY = 'ref2026.notify.fired.v1';

/** Minutes-before-start options offered in the UI. */
export const LEAD_OPTIONS = [5, 10, 15, 30] as const;
const DEFAULT_LEAD = 15;

/** Only sets starting within this window get a precise timer; the rest are
 * picked up by the periodic scan as they enter range. Keeps timer delays well
 * under the ~24.8 day `setTimeout` ceiling. */
const TIMER_HORIZON_MS = 12 * 60 * 60 * 1000;
const SCAN_INTERVAL_MS = 60 * 1000;

const dayDate = new Map(DAYS.map((d) => [d.id, d.date]));

let timers: ReturnType<typeof setTimeout>[] = [];
let scanTimer: ReturnType<typeof setInterval> | undefined;
let started = false;
let onChange: (() => void) | undefined;

/** Details handed to in-app reminder listeners when a set is coming up. */
export interface ReminderEvent {
  slot: SetSlot;
  /** Minutes before the set start this reminder represents. */
  lead: number;
}

type ReminderListener = (event: ReminderEvent) => void;
const reminderListeners = new Set<ReminderListener>();

/**
 * Subscribe to in-app reminders. The callback runs whenever a picked set enters
 * its reminder window, so the UI can show a visible toast alongside the native
 * OS notification. Returns an unsubscribe function.
 */
export function onReminder(fn: ReminderListener): () => void {
  reminderListeners.add(fn);
  return () => reminderListeners.delete(fn);
}

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function permission(): NotificationPermission {
  return notificationsSupported() ? Notification.permission : 'denied';
}

export function isEnabled(): boolean {
  if (!notificationsSupported()) return false;
  try {
    return localStorage.getItem(ENABLED_KEY) === '1' && permission() === 'granted';
  } catch {
    return false;
  }
}

export function leadMinutes(): number {
  try {
    const n = Number(localStorage.getItem(LEAD_KEY));
    return LEAD_OPTIONS.includes(n as (typeof LEAD_OPTIONS)[number]) ? n : DEFAULT_LEAD;
  } catch {
    return DEFAULT_LEAD;
  }
}

export function setLeadMinutes(n: number): void {
  try {
    localStorage.setItem(LEAD_KEY, String(n));
  } catch {
    /* ignore */
  }
  reschedule();
}

/**
 * Turn reminders on or off. Enabling requests notification permission first.
 * Returns the resulting enabled state so the UI can reflect a denial.
 */
export async function setEnabled(on: boolean): Promise<boolean> {
  if (!on) {
    persistEnabled(false);
    reschedule();
    return false;
  }
  if (!notificationsSupported()) return false;

  let perm = permission();
  if (perm === 'default') {
    try {
      perm = await Notification.requestPermission();
    } catch {
      perm = 'denied';
    }
  }
  const granted = perm === 'granted';
  persistEnabled(granted);
  reschedule();
  return granted;
}

function persistEnabled(on: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** Absolute start time of a set on the user's device clock. Sets listed before
 * 08:00 belong to the small hours of the following calendar day. */
function slotStart(slot: SetSlot): number {
  const date = dayDate.get(slot.dayId);
  if (!date) return NaN;
  const [h, m] = slot.startLabel.split(':').map(Number);
  const d = new Date(`${date}T00:00:00`);
  d.setHours(h, m, 0, 0);
  if (h < 8) d.setDate(d.getDate() + 1);
  return d.getTime();
}

function firedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(FIRED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

/**
 * Forget that a reminder already went out for sets that are still ahead of us.
 *
 * A reminder is only "done" for a set that has been and gone. When a stage slip
 * pushes a set later, the reminder the user already got was for a time that no
 * longer exists — so the alert has to be allowed to fire again against the new
 * one. (Pulling a set earlier is handled by the same rule.)
 */
function unfireUpcoming(): void {
  const ids = firedIds();
  if (ids.size === 0) return;
  const now = Date.now();
  let changed = false;
  for (const id of [...ids]) {
    const slot = getSlot(id);
    if (slot && !slot.cancelled && slot.startAt.getTime() > now) {
      ids.delete(id);
      changed = true;
    }
  }
  if (!changed) return;
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

function markFired(id: string): void {
  try {
    const ids = firedIds();
    ids.add(id);
    localStorage.setItem(FIRED_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

async function show(slot: SetSlot, lead: number): Promise<void> {
  const icon = `${import.meta.env.BASE_URL}icon-192.png`;
  const title = `${slot.band} starts in ${lead} min`;
  const body = `${slot.startLabel} · ${slot.stage.name}`;
  const options: NotificationOptions = {
    body,
    icon,
    badge: icon,
    tag: `set-${slot.id}`,
    data: { url: import.meta.env.BASE_URL },
  };

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, options);
        return;
      }
    }
    new Notification(title, options);
  } catch {
    /* notifications can throw on unsupported platforms — ignore */
  }
}

function fire(slot: SetSlot, lead: number): void {
  markFired(slot.id);
  void show(slot, lead);
  for (const fn of reminderListeners) {
    try {
      fn({ slot, lead });
    } catch {
      /* a misbehaving listener must not stop the others */
    }
  }
  onChange?.();
}

function clearTimers(): void {
  timers.forEach(clearTimeout);
  timers = [];
}

/** (Re)build the timer set from the current selection, lead time and clock. */
export function reschedule(): void {
  clearTimers();
  if (!isEnabled()) return;

  const lead = leadMinutes() * 60 * 1000;
  const now = Date.now();
  const done = firedIds();

  for (const id of selection.ids()) {
    if (done.has(id)) continue;
    const slot = getSlot(id);
    if (!slot || slot.cancelled) continue;

    const start = slotStart(slot);
    if (!Number.isFinite(start)) continue;
    const remindAt = start - lead;

    if (now >= remindAt) {
      // Reminder time already passed — fire now if the set hasn't started yet.
      if (now < start) fire(slot, leadMinutes());
      continue;
    }
    if (remindAt - now <= TIMER_HORIZON_MS) {
      timers.push(setTimeout(() => fire(slot, leadMinutes()), remindAt - now));
    }
  }
}

/**
 * Start the scheduler. Re-runs on selection changes, on a periodic scan (to
 * catch sets entering the timer horizon), and when the tab regains focus.
 * `notify` is invoked after a reminder fires so the UI can refresh.
 */
export function init(notify?: () => void): void {
  if (started || !notificationsSupported()) return;
  started = true;
  onChange = notify;

  selection.subscribe(reschedule);
  // A patched running order moves the sets the timers were queued against.
  subscribeSchedule(() => {
    unfireUpcoming();
    reschedule();
  });
  scanTimer = setInterval(reschedule, SCAN_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reschedule();
  });

  reschedule();
}

export function stopScheduler(): void {
  clearTimers();
  if (scanTimer) clearInterval(scanTimer);
  scanTimer = undefined;
  started = false;
}
