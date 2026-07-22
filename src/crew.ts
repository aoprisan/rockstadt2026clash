import { DAYS } from './data';
import type { SetSlot } from './types';
import { fmtDuration, getSlot, minutesToLabel } from './schedule';
import { decodePicks } from './picks-link';
import { selection } from './store';

/**
 * Crew mode: your friends' festival plans, layered over yours. A friend is
 * added by pasting the `#p=…` picks link they shared — the same compact
 * bitmask token the app already generates — so the whole feature stays
 * client-side with no accounts and no backend. From the overlays we derive
 * who's at each set, which sets you'll be together for, and the "meet-up
 * windows" when the entire crew is free at the same time.
 */

export interface Friend {
  name: string;
  color: string;
  ids: string[];
}

const CREW_KEY = 'ref2026.crew.v1';

/** Distinct, bright colours (away from the three stage hues) for friend chips. */
const PALETTE = ['#4cc9f0', '#f72585', '#ffd166', '#90be6d', '#b5179e', '#43aa8b', '#f8961e', '#7b8cff'];

/** Everyone in the crew must be free at least this long to call it a meet-up. */
const MIN_MEET = 20;

type Listener = () => void;
const listeners = new Set<Listener>();
let crew: Friend[] = load();

function load(): Friend[] {
  try {
    const raw = localStorage.getItem(CREW_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (f): f is Friend =>
        f &&
        typeof f.name === 'string' &&
        typeof f.color === 'string' &&
        Array.isArray(f.ids) &&
        f.ids.every((id: unknown) => typeof id === 'string'),
    );
  } catch {
    return [];
  }
}

function persist(): void {
  try {
    localStorage.setItem(CREW_KEY, JSON.stringify(crew));
  } catch {
    /* ignore quota / private mode */
  }
  listeners.forEach((fn) => fn());
}

export function subscribeCrew(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function crewList(): Friend[] {
  return crew;
}

function nextColor(): string {
  const used = new Set(crew.map((f) => f.color));
  return PALETTE.find((c) => !used.has(c)) ?? PALETTE[crew.length % PALETTE.length];
}

/**
 * Add (or update, when the name already exists) a friend from their decoded
 * pick ids. Re-pasting a fresh link under the same name replaces their plan.
 */
export function addFriend(name: string, ids: string[]): Friend {
  const trimmed = name.trim();
  const existing = crew.find((f) => f.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) {
    existing.ids = ids;
    persist();
    return existing;
  }
  const friend: Friend = { name: trimmed, color: nextColor(), ids };
  crew = [...crew, friend];
  persist();
  return friend;
}

export function removeFriend(name: string): void {
  crew = crew.filter((f) => f.name !== name);
  persist();
}

/**
 * Extract the picks token from whatever the user pasted — a full share URL, a
 * fragment, or the bare token — and decode it. Empty array means unparseable.
 */
export function parsePicksInput(input: string): string[] {
  const trimmed = input.trim();
  if (!trimmed) return [];
  const match = trimmed.match(/[#&]p=([^&\s]+)/);
  const token = match ? decodeURIComponent(match[1]) : trimmed;
  return decodePicks(token);
}

/** The friends who picked this set (for the timeline badges). */
export function friendsForSlot(slotId: string): Friend[] {
  return crew.filter((f) => f.ids.includes(slotId));
}

function friendSlots(f: Friend, dayId?: string): SetSlot[] {
  return f.ids
    .map((id) => getSlot(id))
    .filter((s): s is SetSlot => Boolean(s) && (!dayId || s!.dayId === dayId));
}

function mySlots(dayId?: string): SetSlot[] {
  return selection
    .ids()
    .map((id) => getSlot(id))
    .filter((s): s is SetSlot => Boolean(s) && (!dayId || s!.dayId === dayId));
}

export interface TogetherSet {
  slot: SetSlot;
  with: Friend[];
}

/** Sets you picked that at least one friend also picked, in day order. */
export function togetherSets(dayId: string): TogetherSet[] {
  return mySlots(dayId)
    .map((slot) => ({ slot, with: friendsForSlot(slot.id) }))
    .filter((t) => t.with.length > 0)
    .sort((a, b) => a.slot.start - b.slot.start);
}

export interface MeetWindow {
  /** Noon-anchored timeline minutes. */
  start: number;
  end: number;
  minutes: number;
}

export interface DayMeetups {
  dayId: string;
  /** People (you + friends) with at least one pick that day. */
  participants: number;
  windows: MeetWindow[];
}

/**
 * Gaps where *everyone* who is on site that day (you plus every friend with a
 * pick) is simultaneously free: the complement of the union of all busy
 * intervals, clipped to the span from the first to the last of anyone's sets.
 */
export function meetWindows(dayId: string): DayMeetups | null {
  const groups: SetSlot[][] = [];
  const mine = mySlots(dayId);
  if (mine.length) groups.push(mine);
  for (const f of crew) {
    const theirs = friendSlots(f, dayId);
    if (theirs.length) groups.push(theirs);
  }
  if (groups.length < 2) return null; // meeting up needs at least two of you

  const busy = groups
    .flat()
    .map((s) => [s.start, s.end] as const)
    .sort((a, b) => a[0] - b[0]);

  const windows: MeetWindow[] = [];
  let cursor = busy[0][0];
  for (const [start, end] of busy) {
    if (start - cursor >= MIN_MEET) {
      windows.push({ start: cursor, end: start, minutes: start - cursor });
    }
    cursor = Math.max(cursor, end);
  }

  return { dayId, participants: groups.length, windows };
}

/* ---------- dialog ---------- */

let dialog: HTMLDialogElement | null = null;

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

export function openCrew(): void {
  if (!dialog) dialog = buildDialog();
  repaint();
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function buildDialog(): HTMLDialogElement {
  const d = document.createElement('dialog');
  d.className = 'crew';
  d.setAttribute('aria-label', 'Your crew');

  const card = el('div', 'crew-card');

  const head = el('div', 'crew-head');
  head.appendChild(el('h2', 'crew-title', '👥 Your crew'));
  const close = el('button', 'crew-close', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close crew');
  close.addEventListener('click', () => d.close());
  head.appendChild(close);
  card.appendChild(head);

  const body = el('div', 'crew-body');
  body.id = 'crew-body';
  card.appendChild(body);

  d.appendChild(card);
  d.addEventListener('click', (e) => {
    if (e.target === d) d.close();
  });
  document.body.appendChild(d);
  return d;
}

function repaint(): void {
  const body = dialog?.querySelector('#crew-body');
  if (!body) return;
  body.innerHTML = '';

  body.appendChild(
    el(
      'p',
      'crew-intro',
      'Ask a friend for their picks link (Options → 🔗 Share picks link), paste it here, and their plan overlays yours: badges on the timeline, the sets you’ll be together for, and the windows when the whole crew is free to meet.',
    ),
  );

  body.appendChild(renderAddForm());

  if (crewList().length > 0) {
    body.appendChild(renderFriendList());
    body.appendChild(renderMeetups());
  }
}

function renderAddForm(): HTMLElement {
  const form = el('form', 'crew-add') as HTMLFormElement;

  const name = el('input', 'crew-input crew-input-name') as HTMLInputElement;
  name.placeholder = 'Friend’s name';
  name.setAttribute('aria-label', 'Friend’s name');
  name.maxLength = 24;
  name.required = true;

  const link = el('input', 'crew-input crew-input-link') as HTMLInputElement;
  link.placeholder = 'Paste their picks link';
  link.setAttribute('aria-label', 'Paste their picks link');
  link.required = true;

  const err = el('p', 'crew-error');
  err.hidden = true;

  const add = el('button', 'crew-add-btn', 'Add to crew') as HTMLButtonElement;
  add.type = 'submit';

  form.appendChild(name);
  form.appendChild(link);
  form.appendChild(add);
  form.appendChild(err);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const ids = parsePicksInput(link.value);
    if (ids.length === 0) {
      err.textContent =
        'That doesn’t look like a picks link — it should contain “#p=…” (or be the bare token) and hold at least one pick.';
      err.hidden = false;
      return;
    }
    addFriend(name.value, ids);
    repaint();
  });

  return form;
}

function renderFriendList(): HTMLElement {
  const wrap = el('div', 'crew-friends');
  for (const f of crewList()) {
    const slots = friendSlots(f);
    const shared = slots.filter((s) => selection.has(s.id)).length;
    const row = el('div', 'crew-friend');

    const chip = el('span', 'crew-chip', initials(f.name));
    chip.style.setProperty('--c', f.color);
    row.appendChild(chip);

    const info = el('div', 'crew-friend-info');
    info.appendChild(el('span', 'crew-friend-name', f.name));
    info.appendChild(
      el(
        'span',
        'crew-friend-meta',
        `${slots.length} pick${slots.length === 1 ? '' : 's'} · ${shared} with you`,
      ),
    );
    row.appendChild(info);

    const remove = el('button', 'crew-remove', '✕');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${f.name} from your crew`);
    remove.addEventListener('click', () => {
      if (confirm(`Remove ${f.name} from your crew?`)) {
        removeFriend(f.name);
        repaint();
      }
    });
    row.appendChild(remove);

    wrap.appendChild(row);
  }
  const hint = el(
    'p',
    'crew-hint',
    'Plans changed? Paste a friend’s fresh link under the same name to update them.',
  );
  wrap.appendChild(hint);
  return wrap;
}

function renderMeetups(): HTMLElement {
  const wrap = el('div', 'crew-days');
  for (const day of DAYS) {
    const together = togetherSets(day.id);
    const meet = meetWindows(day.id);
    if (together.length === 0 && (!meet || meet.windows.length === 0)) continue;

    const section = el('section', 'crew-day');
    section.appendChild(el('h3', 'crew-day-title', day.label));

    if (together.length > 0) {
      const ul = el('ul', 'crew-together');
      for (const t of together) {
        const li = el('li', 'crew-together-item');
        const band = el('span', 'crew-band', t.slot.band);
        band.style.setProperty('--c', t.slot.stage.color);
        li.appendChild(band);
        li.appendChild(
          el(
            'span',
            'crew-together-meta',
            `${t.slot.startLabel} · with ${t.with.map((f) => f.name).join(', ')}`,
          ),
        );
        ul.appendChild(li);
      }
      section.appendChild(ul);
    }

    if (meet && meet.windows.length > 0) {
      const head = el(
        'p',
        'crew-meet-head',
        `Meet-up windows (all ${meet.participants} of you free):`,
      );
      section.appendChild(head);
      const ul = el('ul', 'crew-meet');
      for (const w of meet.windows) {
        ul.appendChild(
          el(
            'li',
            'crew-meet-item',
            `${minutesToLabel(w.start)}–${minutesToLabel(w.end)} · ${fmtDuration(w.minutes)}`,
          ),
        );
      }
      section.appendChild(ul);
    }

    wrap.appendChild(section);
  }

  if (wrap.children.length === 0) {
    wrap.appendChild(
      el(
        'p',
        'crew-hint',
        'No overlap with your crew yet — pick some sets (or nudge them to) and shared sets and meet-up windows will appear here.',
      ),
    );
  }
  return wrap;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
