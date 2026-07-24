import { DAYS } from './data';
import type { FestivalDay, SetSlot } from './types';
import { getSlot } from './schedule';
import { selection } from './store';

/**
 * The festival journal: once a picked set has actually played, rate it with
 * 🤘 horns, mark the ones you didn't make it to, and keep a one-line memory.
 * Everything stays on-device, and it all feeds the shareable "Rewind" recap.
 */

const RATING_KEY = 'ref2026.journal.ratings.v1';
const SKIP_KEY = 'ref2026.journal.skips.v1';
const NOTE_KEY = 'ref2026.journal.notes.v1';

export const MAX_HORNS = 5;

type Listener = () => void;
const listeners = new Set<Listener>();

function loadRecord(key: string): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    /* corrupted / private mode */
  }
  return {};
}

function loadList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

const ratings = new Map<string, number>(
  Object.entries(loadRecord(RATING_KEY)).filter(
    (e): e is [string, number] =>
      typeof e[1] === 'number' && e[1] >= 1 && e[1] <= MAX_HORNS,
  ),
);
const skips = new Set<string>(loadList(SKIP_KEY));
const notes = new Map<string, string>(
  Object.entries(loadRecord(NOTE_KEY)).filter(
    (e): e is [string, string] => typeof e[1] === 'string' && e[1].length > 0,
  ),
);

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / private mode */
  }
}

function notify(): void {
  listeners.forEach((fn) => fn());
}

export function subscribeJournal(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function rating(id: string): number {
  return ratings.get(id) ?? 0;
}

/** Set the 🤘 count for a set (0 clears it). */
export function setRating(id: string, horns: number): void {
  if (horns <= 0) ratings.delete(id);
  else ratings.set(id, Math.min(MAX_HORNS, Math.round(horns)));
  save(RATING_KEY, Object.fromEntries(ratings));
  notify();
}

export function isSkipped(id: string): boolean {
  return skips.has(id);
}

/** Toggle "picked it, but didn't make it there in the end". */
export function toggleSkipped(id: string): void {
  if (skips.has(id)) {
    skips.delete(id);
  } else {
    skips.add(id);
    // A set you weren't at can't carry a rating.
    if (ratings.delete(id)) save(RATING_KEY, Object.fromEntries(ratings));
  }
  save(SKIP_KEY, [...skips]);
  notify();
}

export function note(id: string): string {
  return notes.get(id) ?? '';
}

/** Notes save quietly — no listener storm while the user is typing. */
export function setNote(id: string, text: string): void {
  const trimmed = text.trim();
  if (trimmed) notes.set(id, trimmed);
  else notes.delete(id);
  save(NOTE_KEY, Object.fromEntries(notes));
}

/* ---------- what has already played ---------- */

function pickedSlots(): SetSlot[] {
  return selection
    .ids()
    .map((id) => getSlot(id))
    // A set that was pulled from the running order never happened; there is
    // nothing to rate and it shouldn't nag from the journal dot.
    .filter((s): s is SetSlot => Boolean(s))
    .filter((s) => !s.cancelled);
}

/** Picked sets that have finished by `nowMs`, oldest first. */
export function endedPicks(nowMs: number): SetSlot[] {
  return pickedSlots()
    .filter((s) => s.endAt.getTime() <= nowMs)
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

/** Ended picks you were actually at (not marked as missed). */
export function seenSlots(nowMs: number): SetSlot[] {
  return endedPicks(nowMs).filter((s) => !skips.has(s.id));
}

/** Seen sets still waiting on a 🤘 verdict — powers the journal button dot. */
export function unratedCount(nowMs: number): number {
  return seenSlots(nowMs).filter((s) => !ratings.has(s.id)).length;
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

export function openJournal(): void {
  if (!dialog) dialog = buildDialog();
  repaint();
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function buildDialog(): HTMLDialogElement {
  const d = document.createElement('dialog');
  d.className = 'planner journal';
  d.setAttribute('aria-label', 'Festival journal');

  const card = el('div', 'planner-card');

  const head = el('div', 'planner-head');
  head.appendChild(el('h2', 'planner-title', '🤘 Festival journal'));
  const close = el('button', 'planner-close', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close journal');
  close.addEventListener('click', () => d.close());
  head.appendChild(close);
  card.appendChild(head);

  const body = el('div', 'planner-body');
  body.id = 'journal-body';
  card.appendChild(body);

  d.appendChild(card);
  d.addEventListener('click', (e) => {
    if (e.target === d) d.close();
  });
  document.body.appendChild(d);
  return d;
}

function repaint(): void {
  if (!dialog) return;
  const body = dialog.querySelector('#journal-body');
  if (!body) return;
  body.innerHTML = '';

  const ended = endedPicks(Date.now());
  if (ended.length === 0) {
    const empty = el('p', 'planner-empty');
    empty.textContent =
      selection.size() === 0
        ? 'Pick some bands first — once their sets have played, you can rate them here and build your shareable Rewind.'
        : 'Your journal opens once your first pick has played. Come back after the set — rate it 🤘, note the moment, and build your Rewind.';
    body.appendChild(empty);
    return;
  }

  const byDay = new Map<string, SetSlot[]>();
  for (const s of ended) {
    const list = byDay.get(s.dayId) ?? [];
    list.push(s);
    byDay.set(s.dayId, list);
  }

  for (const day of DAYS) {
    const list = byDay.get(day.id);
    if (!list) continue;
    body.appendChild(renderDayGroup(day, list));
  }

  const seen = seenSlots(Date.now()).length;
  const foot = el('div', 'journal-foot');
  const rewind = el('button', 'journal-rewind-btn', '🎞 Share my Rewind');
  rewind.type = 'button';
  rewind.disabled = seen === 0;
  rewind.title =
    seen === 0
      ? 'Rate at least one set you saw to build your Rewind'
      : 'A shareable recap image of your festival so far';
  rewind.addEventListener('click', () => {
    rewind.disabled = true;
    const original = rewind.textContent;
    rewind.textContent = 'Preparing…';
    // Loaded on demand: the canvas renderer is only needed here.
    void import('./recap')
      .then((m) => m.shareRecap())
      .catch(() => undefined)
      .finally(() => {
        rewind.textContent = original;
        rewind.disabled = seenSlots(Date.now()).length === 0;
      });
  });
  foot.appendChild(rewind);
  foot.appendChild(
    el(
      'p',
      'planner-hint',
      'Rate the sets you saw — 🤘 to 🤘🤘🤘🤘🤘 — and mark the ones you missed. Your Rewind turns it into a shareable picture of your festival.',
    ),
  );
  body.appendChild(foot);
}

function renderDayGroup(day: FestivalDay, slots: SetSlot[]): HTMLElement {
  const wrap = el('div', 'journal-day');
  wrap.appendChild(el('h3', 'journal-day-head', day.label));
  for (const slot of slots) wrap.appendChild(renderEntry(slot));
  return wrap;
}

function renderEntry(slot: SetSlot): HTMLElement {
  const row = el('div', 'journal-entry');
  row.style.setProperty('--c', slot.stage.color);

  const top = el('div', 'journal-entry-top');
  top.appendChild(el('span', 'planner-time', `${slot.startLabel}–${slot.endLabel}`));
  const band = el('span', 'planner-band', slot.band);
  band.style.setProperty('--c', slot.stage.color);
  top.appendChild(band);
  top.appendChild(el('span', 'planner-stage', slot.stage.name.replace(' Stage', '')));
  row.appendChild(top);

  const controls = el('div', 'journal-controls');
  controls.appendChild(renderHorns(slot.id));

  const missed = el('button', 'journal-miss');
  missed.type = 'button';
  const paintMiss = (): void => {
    const skipped = isSkipped(slot.id);
    missed.textContent = skipped ? 'Missed it' : 'I was there';
    missed.classList.toggle('is-skipped', skipped);
    missed.setAttribute('aria-pressed', String(skipped));
  };
  paintMiss();
  missed.title = 'Toggle whether you actually made it to this set';
  missed.addEventListener('click', () => {
    toggleSkipped(slot.id);
    repaint(); // rating strip may need clearing/disabling
  });
  controls.appendChild(missed);
  row.appendChild(controls);

  if (!isSkipped(slot.id)) {
    const noteInput = el('input', 'journal-note') as HTMLInputElement;
    noteInput.type = 'text';
    noteInput.maxLength = 120;
    noteInput.placeholder = 'One-line memory… (wall of death? guest song?)';
    noteInput.value = note(slot.id);
    noteInput.setAttribute('aria-label', `Your note about ${slot.band}`);
    noteInput.addEventListener('change', () => setNote(slot.id, noteInput.value));
    row.appendChild(noteInput);
  }

  return row;
}

function renderHorns(id: string): HTMLElement {
  const wrap = el('div', 'journal-horns');
  wrap.setAttribute('role', 'radiogroup');
  wrap.setAttribute('aria-label', 'Rate this set, 1 to 5 horns');
  const skipped = isSkipped(id);
  const current = rating(id);
  for (let n = 1; n <= MAX_HORNS; n++) {
    const btn = el('button', 'journal-horn', '🤘');
    btn.type = 'button';
    btn.disabled = skipped;
    if (n <= current) btn.classList.add('is-on');
    btn.setAttribute('aria-label', `${n} horn${n > 1 ? 's' : ''}`);
    btn.addEventListener('click', () => {
      // Tapping your current rating clears it.
      setRating(id, n === rating(id) ? 0 : n);
      repaint();
    });
    wrap.appendChild(btn);
  }
  return wrap;
}
