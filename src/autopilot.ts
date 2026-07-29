import { DAYS } from './data';
import type { FestivalDay } from './types';
import { currentDayId, fmtDuration, subscribeSchedule, walkMinutes } from './schedule';
import { planDay, type PlannedSet } from './planner';
import { selection } from './store';
import { subscribeDuels } from './duel';
import { dayAdvice, dayRead, reserveTone } from './stamina';

/**
 * Festival Autopilot: live turn-by-turn guidance through your day. It takes the
 * planner's duel-resolved running order and turns it into a real-time engine —
 * what you're watching, when to *leave* (walking time charged), where to walk,
 * and how long you've got — with departure alerts and an optional screen wake
 * lock so the phone can sit on a table like a boarding gate display. Entirely
 * on-device: it keeps navigating when the site's network doesn't.
 */

/* ---------- itinerary ---------- */

/** A stage-to-stage move between two chosen sets. */
interface Move {
  next: PlannedSet;
  /** Walk length in minutes (0 = same stage). */
  walkMin: number;
  /** Latest instant you can leave and still catch the downbeat (or the set's
   * end when even that is too late — you go straight over). */
  departMs: number;
  arriveMs: number;
}

interface Leg {
  set: PlannedSet;
  startMs: number;
  endMs: number;
  /** The transition after this set (absent on the day's closer). */
  move?: Move;
}

/** What the pilot is telling you to do right now. */
export type ApState =
  | { kind: 'idle' } // no picks on this day
  | { kind: 'preshow'; first: Leg }
  | { kind: 'watch'; leg: Leg; sinceMs: number }
  | { kind: 'free'; untilMs: number; move: Move }
  | { kind: 'walk'; move: Move }
  | { kind: 'early'; move: Move }
  | { kind: 'done' };

function buildLegs(dayId: string): Leg[] {
  const plan = planDay(dayId);
  if (!plan) return [];
  const sets = plan.entries.filter((e): e is PlannedSet => e.kind === 'set');

  const legs: Leg[] = sets.map((set) => ({
    set,
    startMs: set.slot.startAt.getTime(),
    endMs: set.slot.endAt.getTime(),
  }));

  for (let i = 0; i < legs.length - 1; i++) {
    const cur = legs[i];
    const nxt = legs[i + 1];
    const walkMin =
      cur.set.slot.stage.id === nxt.set.slot.stage.id
        ? 0
        : walkMinutes(cur.set.slot.stage.id, nxt.set.slot.stage.id);
    // Leave as late as still catches all of the next set — but never before
    // this set ends (the planner already decided the full set is worth it).
    const departMs = Math.max(cur.endMs, nxt.startMs - walkMin * 60_000);
    cur.move = { next: nxt.set, walkMin, departMs, arriveMs: departMs + walkMin * 60_000 };
  }
  return legs;
}

function stateAt(legs: Leg[], nowMs: number): ApState {
  if (legs.length === 0) return { kind: 'idle' };
  const first = legs[0];
  if (nowMs < first.startMs) return { kind: 'preshow', first };

  for (const leg of legs) {
    if (nowMs < leg.endMs && nowMs >= leg.startMs) {
      return { kind: 'watch', leg, sinceMs: nowMs - leg.startMs };
    }
    const move = leg.move;
    if (!move) continue;
    if (nowMs >= leg.endMs && nowMs < move.departMs) {
      return { kind: 'free', untilMs: move.departMs, move };
    }
    if (nowMs >= move.departMs && nowMs < move.arriveMs) {
      return { kind: 'walk', move };
    }
    const nextStart = move.next.slot.startAt.getTime();
    if (nowMs >= move.arriveMs && nowMs < nextStart) {
      return { kind: 'early', move };
    }
  }
  return { kind: 'done' };
}

/* ---------- formatting ---------- */

const timeLabel = (ms: number): string => {
  const d = new Date(ms);
  // Festival wall clock (UTC+3), independent of the phone's timezone.
  const h = (d.getUTCHours() + 3) % 24;
  return `${String(h).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

/** Live countdown: days/hours far out, seconds only when it's imminent. */
function fmtIn(ms: number): string {
  if (ms <= 0) return 'now';
  const s = Math.ceil(ms / 1000);
  if (s < 90) return `${s}s`;
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ${min % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/* ---------- dialog ---------- */

let dialog: HTMLDialogElement | null = null;
let tick: number | null = null;
let dayId: string | null = null;
let legs: Leg[] = [];
let legsStale = true;
const firedAlerts = new Set<string>();

let wakeWanted = false;
interface WakeSentinel {
  release(): Promise<void>;
  addEventListener(type: 'release', fn: () => void): void;
}
let wakeSentinel: WakeSentinel | null = null;

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

export function openAutopilot(): void {
  dayId = currentDayId(Date.now());
  legsStale = true;
  firedAlerts.clear();
  if (!dialog) dialog = buildDialog();
  paint();
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  if (tick == null) tick = window.setInterval(paint, 1_000);
}

function shutdown(): void {
  if (tick != null) {
    window.clearInterval(tick);
    tick = null;
  }
  wakeWanted = false;
  void releaseWake();
}

/* ---------- wake lock ---------- */

async function requestWake(): Promise<boolean> {
  const nav = navigator as Navigator & {
    wakeLock?: { request(type: 'screen'): Promise<WakeSentinel> };
  };
  if (!nav.wakeLock) return false;
  try {
    wakeSentinel = await nav.wakeLock.request('screen');
    wakeSentinel.addEventListener('release', () => {
      wakeSentinel = null;
      paintWakeButton();
    });
    return true;
  } catch {
    return false;
  }
}

async function releaseWake(): Promise<void> {
  try {
    await wakeSentinel?.release();
  } catch {
    /* already gone */
  }
  wakeSentinel = null;
}

// The OS drops wake locks when the tab hides; re-arm on return if still wanted.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && wakeWanted && dialog?.open && !wakeSentinel) {
    void requestWake().then(paintWakeButton);
  }
});

function paintWakeButton(): void {
  const btn = dialog?.querySelector<HTMLButtonElement>('.ap-wake');
  if (!btn) return;
  btn.classList.toggle('on', wakeSentinel != null);
  btn.textContent = wakeSentinel != null ? '☀ Screen stays on' : '☀ Keep screen on';
}

/* ---------- building the UI ---------- */

function buildDialog(): HTMLDialogElement {
  const d = document.createElement('dialog');
  d.className = 'autopilot';
  d.setAttribute('aria-label', 'Festival autopilot — live guidance');

  const card = el('div', 'ap-card');

  const head = el('div', 'ap-head');
  head.appendChild(el('h2', 'ap-title', '⚡ Autopilot'));

  const wake = el('button', 'ap-wake', '☀ Keep screen on');
  wake.type = 'button';
  wake.title = 'Stop the screen from sleeping while the pilot is up';
  wake.addEventListener('click', async () => {
    if (wakeSentinel) {
      wakeWanted = false;
      await releaseWake();
    } else {
      wakeWanted = true;
      if (!(await requestWake())) {
        wake.textContent = 'Not supported here';
        setTimeout(paintWakeButton, 1600);
        return;
      }
    }
    paintWakeButton();
  });
  head.appendChild(wake);

  const close = el('button', 'ap-close', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close autopilot');
  close.addEventListener('click', () => d.close());
  head.appendChild(close);
  card.appendChild(head);

  const tabs = el('div', 'ap-tabs');
  tabs.id = 'ap-tabs';
  card.appendChild(tabs);

  const body = el('div', 'ap-body');
  body.id = 'ap-body';
  card.appendChild(body);

  d.appendChild(card);
  d.addEventListener('close', shutdown);
  d.addEventListener('click', (e) => {
    if (e.target === d) d.close();
  });

  // Picks or duel calls changing mid-evening reshape the route immediately.
  selection.subscribe(() => {
    legsStale = true;
    if (d.open) paint();
  });
  subscribeDuels(() => {
    legsStale = true;
    if (d.open) paint();
  });
  // A stage running late re-times the route under the pilot's feet.
  subscribeSchedule(() => {
    legsStale = true;
    if (d.open) paint();
  });

  document.body.appendChild(d);
  return d;
}

/* ---------- alerts ---------- */

const WARN_LEAD_MS = 5 * 60_000;

/** Buzz + banner when a stage change is 5 minutes out, and again at go-time. */
function checkAlerts(nowMs: number): void {
  for (const leg of legs) {
    const move = leg.move;
    if (!move || move.walkMin === 0) continue;
    const fire = (key: string, at: number, text: string): void => {
      const id = `${move.next.slot.id}:${key}`;
      if (nowMs < at || nowMs > at + 90_000 || firedAlerts.has(id)) return;
      firedAlerts.add(id);
      if (navigator.vibrate) navigator.vibrate([180, 90, 180]);
      const host = dialog?.querySelector('#ap-body');
      const card = host?.querySelector('.ap-now');
      card?.classList.add('ap-flash');
      window.setTimeout(() => card?.classList.remove('ap-flash'), 4_000);
      const note = el('div', 'ap-alert-note', text);
      host?.prepend(note);
      window.setTimeout(() => note.remove(), 8_000);
    };
    fire(
      'warn',
      move.departMs - WARN_LEAD_MS,
      `⏰ Leave in 5 min — ${move.walkMin}m walk to ${move.next.slot.stage.name} for ${move.next.slot.band}`,
    );
    fire(
      'go',
      move.departMs,
      `🚶 Time to move — ${move.next.slot.stage.name} for ${move.next.slot.band}`,
    );
  }
}

/* ---------- painting ---------- */

function paint(): void {
  if (!dialog || !dayId) return;
  const nowMs = Date.now();

  if (legsStale) {
    legs = buildLegs(dayId);
    legsStale = false;
  }

  paintTabs();
  const body = dialog.querySelector('#ap-body');
  if (!body) return;

  // Keep transient alert banners alive across repaints by re-adding them.
  const notes = [...body.querySelectorAll('.ap-alert-note')];
  body.innerHTML = '';
  for (const n of notes) body.appendChild(n);

  const state = stateAt(legs, nowMs);
  body.appendChild(renderNow(state, nowMs));

  const strip = renderStamina(dayId);
  if (strip) body.appendChild(strip);

  const rest = upcoming(state, nowMs);
  if (rest.length > 0) body.appendChild(renderRest(rest, state));

  checkAlerts(nowMs);
  paintWakeButton();
}

/**
 * A one-line read from the stamina model for the day being piloted: what this
 * night costs you, and the single most urgent thing to do about it. On the
 * grounds at 01:00 that is usually the ride home, and it is exactly when nobody
 * checks a planning panel — so the pilot carries it.
 */
function renderStamina(day: string): HTMLElement | null {
  const read = dayRead(day);
  if (!read) return null;
  const wrap = el('div', `ap-stamina is-${reserveTone(read.reserveEnd)}`);

  const head = el('div', 'ap-stamina-head');
  head.appendChild(el('span', 'ap-stamina-num', `🔋 ${read.reserveEnd}%`));
  head.appendChild(
    el(
      'span',
      'ap-stamina-line',
      read.sleepEffective != null
        ? `left by the end of tonight · ~${fmtDuration(Math.round(read.sleepEffective * 60))} of real sleep after`
        : 'left by the end of tonight',
    ),
  );
  wrap.appendChild(head);

  const top = dayAdvice(day).find((i) => i.severity !== 'tip');
  if (top) wrap.appendChild(el('p', 'ap-stamina-note', `${top.icon} ${top.title} — ${top.detail}`));
  return wrap;
}

function paintTabs(): void {
  const tabs = dialog?.querySelector('#ap-tabs');
  if (!tabs) return;
  tabs.innerHTML = '';
  for (const day of DAYS) {
    const btn = el('button', 'ap-tab', shortLabel(day));
    btn.type = 'button';
    if (day.id === dayId) btn.classList.add('active');
    btn.addEventListener('click', () => {
      dayId = day.id;
      legsStale = true;
      firedAlerts.clear();
      paint();
    });
    tabs.appendChild(btn);
  }
}

function shortLabel(day: FestivalDay): string {
  // "Day 3" → "D3" keeps five tabs on one row of a narrow phone.
  return day.label.replace(/^Day (\d+)$/, 'D$1');
}

function stageChip(name: string, color: string): HTMLElement {
  const chip = el('span', 'ap-stage', name.replace(' Stage', ''));
  chip.style.setProperty('--c', color);
  return chip;
}

function renderNow(state: ApState, nowMs: number): HTMLElement {
  const card = el('div', 'ap-now');

  switch (state.kind) {
    case 'idle': {
      card.appendChild(el('p', 'ap-big', 'No picks this day'));
      card.appendChild(
        el(
          'p',
          'ap-sub',
          'Tap some bands on the timeline (and settle your clashes) — the pilot flies whatever plan you feed it.',
        ),
      );
      break;
    }
    case 'preshow': {
      const { slot } = state.first.set;
      const inMs = state.first.startMs - nowMs;
      card.appendChild(el('p', 'ap-kicker', 'First up'));
      card.appendChild(el('p', 'ap-big', slot.band));
      card.appendChild(stageChip(slot.stage.name, slot.stage.color));
      card.appendChild(
        el('p', 'ap-sub', `${slot.startLabel} · starts in ${fmtIn(inMs)}`),
      );
      if (inMs <= 30 * 60_000) {
        card.appendChild(el('p', 'ap-cue', '🚶 Head over now and take your spot.'));
      }
      break;
    }
    case 'watch': {
      const { slot } = state.leg.set;
      card.classList.add('is-watch');
      card.style.setProperty('--c', slot.stage.color);
      card.appendChild(el('p', 'ap-kicker', state.leg.set.partial ? 'Now (✂ your split)' : 'Now'));
      card.appendChild(el('p', 'ap-big', slot.band + (state.leg.set.starred ? ' ★' : '')));
      card.appendChild(stageChip(slot.stage.name, slot.stage.color));
      card.appendChild(
        el(
          'p',
          'ap-sub',
          `until ${slot.endLabel} · ends in ${fmtIn(state.leg.endMs - nowMs)}`,
        ),
      );
      const bar = el('div', 'ap-progress');
      const fill = el('div', 'ap-progress-fill');
      const pct = Math.min(
        100,
        (100 * (nowMs - state.leg.startMs)) / (state.leg.endMs - state.leg.startMs),
      );
      fill.style.width = `${pct}%`;
      bar.appendChild(fill);
      card.appendChild(bar);
      const move = state.leg.move;
      if (move) {
        card.appendChild(
          el(
            'p',
            'ap-cue',
            move.walkMin > 0
              ? `Next: leave at ${timeLabel(move.departMs)} (${fmtIn(move.departMs - nowMs)}) · 🚶 ${move.walkMin}m → ${move.next.slot.stage.name.replace(' Stage', '')} for ${move.next.slot.band}`
              : `Next: ${move.next.slot.band} on this stage at ${move.next.slot.startLabel} — stay put 🤘`,
          ),
        );
      } else {
        card.appendChild(el('p', 'ap-cue', 'Your closer — ride it out. 🤘'));
      }
      break;
    }
    case 'free': {
      card.appendChild(el('p', 'ap-kicker', 'Free time'));
      card.appendChild(el('p', 'ap-big', '🍻'));
      card.appendChild(
        el(
          'p',
          'ap-sub',
          `until ${timeLabel(state.untilMs)} · ${fmtIn(state.untilMs - nowMs)} — grab food, water, merch`,
        ),
      );
      card.appendChild(
        el(
          'p',
          'ap-cue',
          state.move.walkMin > 0
            ? `Then 🚶 ${state.move.walkMin}m → ${state.move.next.slot.stage.name.replace(' Stage', '')} for ${state.move.next.slot.band}`
            : `Then ${state.move.next.slot.band} at ${state.move.next.slot.startLabel}`,
        ),
      );
      break;
    }
    case 'walk': {
      const n = state.move.next.slot;
      card.classList.add('is-walk');
      card.appendChild(el('p', 'ap-kicker', 'Move now'));
      card.appendChild(el('p', 'ap-big', `🚶 → ${n.stage.name.replace(' Stage', '')}`));
      card.appendChild(stageChip(n.stage.name, n.stage.color));
      card.appendChild(
        el(
          'p',
          'ap-sub',
          `~${state.move.walkMin}m walk · ${n.band} starts ${n.startAt.getTime() <= nowMs ? 'NOW' : `in ${fmtIn(n.startAt.getTime() - nowMs)}`}`,
        ),
      );
      break;
    }
    case 'early': {
      const n = state.move.next.slot;
      card.appendChild(el('p', 'ap-kicker', 'In position'));
      card.appendChild(el('p', 'ap-big', n.band));
      card.appendChild(stageChip(n.stage.name, n.stage.color));
      card.appendChild(
        el('p', 'ap-sub', `starts in ${fmtIn(n.startAt.getTime() - nowMs)} — you made it 🤘`),
      );
      break;
    }
    case 'done': {
      card.appendChild(el('p', 'ap-big', 'That’s the day 🤘'));
      card.appendChild(
        el('p', 'ap-sub', 'No more picks tonight. Rate what you saw in the Journal.'),
      );
      break;
    }
  }
  return card;
}

/** The legs still ahead of the current state, for the rest-of-day strip. */
function upcoming(state: ApState, nowMs: number): Leg[] {
  if (state.kind === 'done' || state.kind === 'idle') return [];
  return legs.filter((l) => {
    if (state.kind === 'watch' && l === state.leg) return false;
    return l.endMs > nowMs;
  });
}

function renderRest(rest: Leg[], state: ApState): HTMLElement {
  const wrap = el('div', 'ap-rest');
  wrap.appendChild(
    el('p', 'ap-rest-head', state.kind === 'preshow' ? 'Your day' : 'Still to come'),
  );
  const ul = el('ul', 'ap-rest-list');
  for (const leg of rest) {
    const li = el('li', 'ap-rest-item');
    const s = leg.set.slot;
    const time = el('span', 'ap-rest-time', `${s.startLabel}–${s.endLabel}`);
    li.appendChild(time);
    const band = el('span', 'ap-rest-band', s.band + (leg.set.starred ? ' ★' : ''));
    band.style.setProperty('--c', s.stage.color);
    li.appendChild(band);
    li.appendChild(el('span', 'ap-rest-stage', s.stage.name.replace(' Stage', '')));
    if (leg.move && leg.move.walkMin > 0) {
      li.appendChild(
        el('span', 'ap-rest-walk', `then 🚶 ${leg.move.walkMin}m · leave ${timeLabel(leg.move.departMs)}`),
      );
    }
    ul.appendChild(li);
  }
  wrap.appendChild(ul);
  wrap.appendChild(
    el(
      'p',
      'ap-hint',
      'The route is your planner chain: duel calls honoured, ★ must-sees protected, walking time charged. Change picks and the pilot re-routes instantly.',
    ),
  );
  return wrap;
}
