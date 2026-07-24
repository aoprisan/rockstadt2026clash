import { DAYS, STAGES } from './data';
import type { StageId } from './types';
import { buildSlots, festivalInstant, minutesToLabel, subscribeSchedule } from './schedule';
import { selection } from './store';
import {
  FROM_ALL,
  MAX_SHIFT,
  clearAll,
  clearStage,
  isCancelled,
  patchCount,
  setSetShift,
  setStagePatch,
  stagePatch,
  toggleCancelled,
} from './delays';

/**
 * "⏱ Running order" — the panel for patching the festival as it actually runs.
 *
 * The important control is the per-stage slip, because that is how festivals
 * fail: a stage loses fifteen minutes in the afternoon and carries it all night.
 * Logging it here moves every set on that stage that hasn't started yet, and
 * the whole app — clashes, planner, pilot, reminders, stamina — recomputes off
 * the new times.
 */

const STAGE_ORDER: StageId[] = ['rugina', 'brasov', 'calmuc'];
const STEP = 5;

let dialog: HTMLDialogElement | null = null;
let panelDayId: string = DAYS[0].id;

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

/**
 * The noon-anchored minute it is *right now* on a given festival day, or
 * FROM_ALL when that day hasn't started — a slip logged before the gates open
 * applies to the whole day, one logged at 21:40 only to what comes after.
 */
function nowMinuteOn(date: string): number {
  const noon = festivalInstant(date, '12:00').getTime();
  const minutes = (Date.now() - noon) / 60_000;
  return minutes <= 0 ? FROM_ALL : Math.round(minutes);
}

export function openDelays(dayId?: string): void {
  if (dayId) panelDayId = dayId;
  if (!dialog) dialog = buildDialog();
  repaint();
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function buildDialog(): HTMLDialogElement {
  const d = document.createElement('dialog');
  d.className = 'delays';
  d.setAttribute('aria-label', 'Running order patches');

  const card = el('div', 'delays-card');

  const head = el('div', 'delays-head');
  head.appendChild(el('h2', 'delays-title', '⏱ Running order'));
  const close = el('button', 'delays-close', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close running order');
  close.addEventListener('click', () => d.close());
  head.appendChild(close);
  card.appendChild(head);

  card.appendChild(
    el(
      'p',
      'delays-sub',
      'The poster is a plan; this is what is actually happening. Log a slip and the whole app re-times itself — clashes, the planner, the pilot, your reminders and the stamina model.',
    ),
  );

  const tabs = el('div', 'delays-tabs');
  tabs.id = 'delays-tabs';
  card.appendChild(tabs);

  const body = el('div', 'delays-body');
  body.id = 'delays-body';
  card.appendChild(body);

  d.appendChild(card);
  d.addEventListener('click', (e) => {
    if (e.target === d) d.close();
  });

  subscribeSchedule(() => {
    if (d.open) repaint();
  });

  document.body.appendChild(d);
  return d;
}

function repaint(): void {
  const tabs = dialog?.querySelector('#delays-tabs');
  const body = dialog?.querySelector('#delays-body');
  if (!tabs || !body) return;

  tabs.innerHTML = '';
  for (const day of DAYS) {
    const btn = el('button', 'delays-tab', day.label);
    btn.type = 'button';
    const patched = buildSlots(day).filter((s) => s.shift || s.cancelled).length;
    if (patched > 0) btn.appendChild(el('span', 'delays-tab-count', String(patched)));
    if (day.id === panelDayId) btn.classList.add('active');
    btn.addEventListener('click', () => {
      panelDayId = day.id;
      repaint();
    });
    tabs.appendChild(btn);
  }

  const day = DAYS.find((d) => d.id === panelDayId) ?? DAYS[0];
  body.innerHTML = '';

  const live = nowMinuteOn(day.date) !== FROM_ALL;
  body.appendChild(
    el(
      'p',
      'delays-hint',
      live
        ? 'This day is under way, so a stage slip applies from now on — sets that already started keep the times they actually had.'
        : 'This day hasn’t started, so a stage slip applies to every set on it.',
    ),
  );

  for (const stageId of STAGE_ORDER) {
    body.appendChild(renderStage(day.id, day.date, stageId));
  }

  const slots = buildSlots(day);
  const patched = slots.filter((s) => s.shift || s.cancelled);
  if (patched.length > 0) {
    body.appendChild(el('p', 'delays-section', 'Patched on this day'));
    const ul = el('ul', 'delays-patched');
    for (const slot of patched) {
      const li = el('li', 'delays-patched-item');
      const band = el('span', 'delays-band', slot.band);
      band.style.setProperty('--c', slot.stage.color);
      li.appendChild(band);
      li.appendChild(
        el(
          'span',
          'delays-patched-why',
          slot.cancelled
            ? 'cancelled — not happening'
            : `now ${slot.startLabel}–${slot.endLabel} · ${slot.shift > 0 ? `${slot.shift}m late` : `${-slot.shift}m early`}`,
        ),
      );
      ul.appendChild(li);
    }
    body.appendChild(ul);
  }

  body.appendChild(el('p', 'delays-section', 'A single band'));
  body.appendChild(renderSetList(day.id));

  if (patchCount() > 0) {
    const reset = el('button', 'delays-reset', `Clear all ${patchCount()} patches`);
    reset.type = 'button';
    reset.addEventListener('click', () => {
      if (confirm('Drop every running-order patch and go back to the poster times?')) clearAll();
    });
    body.appendChild(reset);
  }

  body.appendChild(
    el(
      'p',
      'delays-note',
      'Patches are yours, on this device — and they ride along on the crew beam (Crew → 📡), so whoever spots the slip first can push it to everyone they meet without a signal.',
    ),
  );
}

function renderStage(dayId: string, date: string, stageId: StageId): HTMLElement {
  const stage = STAGES[stageId];
  const wrap = el('div', 'delays-stage');
  wrap.style.setProperty('--c', stage.color);

  const head = el('div', 'delays-stage-head');
  head.appendChild(el('span', 'delays-stage-name', stage.name.replace(' Stage', '')));
  const patch = stagePatch(dayId, stageId);
  const value = patch?.minutes ?? 0;
  const readout = el(
    'span',
    `delays-stage-value${value ? ' is-set' : ''}`,
    value === 0 ? 'on time' : value > 0 ? `${value}m late` : `${-value}m early`,
  );
  head.appendChild(readout);
  wrap.appendChild(head);

  const row = el('div', 'delays-stepper');
  const bump = (by: number): void => {
    const next = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, value + by));
    if (next === 0) clearStage(dayId, stageId);
    // Keep the original anchor when deepening an existing slip: re-stamping it
    // would quietly un-shift the sets that have already moved.
    else setStagePatch(dayId, stageId, next, patch?.from ?? nowMinuteOn(date));
  };
  for (const by of [-STEP, STEP, 15]) {
    const btn = el('button', 'delays-step', by > 0 ? `+${by}m` : `−${-by}m`);
    btn.type = 'button';
    btn.addEventListener('click', () => bump(by));
    row.appendChild(btn);
  }
  if (value !== 0) {
    const clear = el('button', 'delays-step is-clear', 'on time');
    clear.type = 'button';
    clear.addEventListener('click', () => clearStage(dayId, stageId));
    row.appendChild(clear);
  }
  wrap.appendChild(row);

  if (patch && patch.from !== FROM_ALL) {
    wrap.appendChild(
      el('p', 'delays-stage-from', `Applied from ${minutesToLabel(patch.from)} onward.`),
    );
  }
  return wrap;
}

function renderSetList(dayId: string): HTMLElement {
  const day = DAYS.find((d) => d.id === dayId) ?? DAYS[0];
  const list = el('ul', 'delays-sets');
  const slots = [...buildSlots(day)].sort((a, b) => a.start - b.start);
  for (const slot of slots) {
    const li = el('li', 'delays-set');
    if (slot.cancelled) li.classList.add('is-off');
    if (selection.has(slot.id)) li.classList.add('is-pick');

    const label = el('div', 'delays-set-label');
    const band = el('span', 'delays-band', slot.band);
    band.style.setProperty('--c', slot.stage.color);
    label.appendChild(band);
    label.appendChild(
      el(
        'span',
        'delays-set-time',
        `${slot.startLabel}–${slot.endLabel} · ${slot.stage.name.replace(' Stage', '')}`,
      ),
    );
    li.appendChild(label);

    const actions = el('div', 'delays-set-actions');
    const nudge = (by: number): void => setSetShift(slot.id, slot.shift + by);
    for (const by of [-STEP, STEP]) {
      const btn = el('button', 'delays-mini', by > 0 ? `+${by}` : `−${-by}`);
      btn.type = 'button';
      btn.title = by > 0 ? `Push ${slot.band} ${by} minutes later` : `Pull ${slot.band} ${-by} minutes earlier`;
      btn.disabled = slot.cancelled;
      btn.addEventListener('click', () => nudge(by));
      actions.appendChild(btn);
    }
    const off = el('button', 'delays-mini is-off', isCancelled(slot.id) ? '↩' : '✕');
    off.type = 'button';
    off.title = isCancelled(slot.id)
      ? `${slot.band} is back on`
      : `${slot.band} isn’t happening`;
    off.addEventListener('click', () => toggleCancelled(slot.id));
    actions.appendChild(off);
    li.appendChild(actions);
    list.appendChild(li);
  }
  return list;
}
