import { STAGES } from './data';
import type { StageId } from './types';
import { moveStage, setStageOrder, stageOrder, stagePosition } from './stage-order';

/**
 * Drag-to-rearrange for the timeline's stage columns.
 *
 * Pointer events rather than HTML5 drag-and-drop, because the phone in a field
 * is the primary device and native DnD never fires there. While a drag is in
 * flight nothing re-renders: the header chip follows the finger and the other
 * chips — with their whole columns — slide out of its way on transforms. Only
 * the drop commits, and the commit is what repaints the grid.
 */

/** Column gutter, in px. Keep in step with `--stage-gap` in style.css. */
const GAP = 6;

/** How far a press has to travel sideways before it counts as a drag. */
const THRESHOLD = 5;

export function attachStageReorder(names: HTMLElement, cols: HTMLElement): void {
  const chips = Array.from(names.querySelectorAll<HTMLElement>('.stage-name'));
  if (chips.length < 2) return;
  for (const chip of chips) {
    chip.addEventListener('pointerdown', (e) => beginDrag(e, chip, names, cols));
    chip.addEventListener('keydown', (e) => onKeydown(e, chip));
    // The browser's own drag gesture would fight the pointer one.
    chip.addEventListener('dragstart', (e) => e.preventDefault());
  }
}

function shortName(id: StageId): string {
  return STAGES[id].name.replace(' Stage', '');
}

/** Where chip/column `j` has to sit while the stage from `from` hovers `to`. */
function displacement(j: number, from: number, to: number, step: number): number {
  if (from < to && j > from && j <= to) return -step;
  if (from > to && j >= to && j < from) return step;
  return 0;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function beginDrag(
  ev: PointerEvent,
  chip: HTMLElement,
  names: HTMLElement,
  cols: HTMLElement,
): void {
  if (ev.button > 0) return; // right / middle click is not a drag
  const id = chip.dataset.stage as StageId | undefined;
  if (!id) return;

  const order = stageOrder();
  const from = order.indexOf(id);
  if (from < 0) return;

  const chipEls = order.map((s) =>
    names.querySelector<HTMLElement>(`.stage-name[data-stage="${s}"]`),
  );
  const colEls = order.map((s) =>
    cols.querySelector<HTMLElement>(`.stage-col[data-stage="${s}"]`),
  );
  if (chipEls.some((n) => !n)) return;

  const step = chip.getBoundingClientRect().width + GAP;
  const last = order.length - 1;
  const startX = ev.clientX;
  let dragging = false;
  let to = from;

  const paint = (dx: number): void => {
    for (let j = 0; j <= last; j++) {
      const shift = j === from ? dx : displacement(j, from, to, step);
      const t = shift ? `translateX(${shift}px)` : '';
      const c = chipEls[j];
      if (c) c.style.transform = t;
      const col = colEls[j];
      if (col) col.style.transform = t;
    }
  };

  const clear = (): void => {
    for (let j = 0; j <= last; j++) {
      chipEls[j]?.style.removeProperty('transform');
      colEls[j]?.style.removeProperty('transform');
    }
    names.classList.remove('is-reordering');
    chip.classList.remove('is-dragging');
    colEls[from]?.classList.remove('is-dragging');
  };

  const onMove = (e: PointerEvent): void => {
    const dx = e.clientX - startX;
    if (!dragging) {
      if (Math.abs(dx) < THRESHOLD) return;
      dragging = true;
      try {
        chip.setPointerCapture(e.pointerId);
      } catch {
        /* capture is a nicety, the drag works without it */
      }
      names.classList.add('is-reordering');
      chip.classList.add('is-dragging');
      colEls[from]?.classList.add('is-dragging');
    }
    // The stage can only travel as far as the columns either side of it.
    const travel = clamp(dx, -from * step, (last - from) * step);
    to = clamp(from + Math.round(travel / step), 0, last);
    paint(travel);
  };

  const finish = (commit: boolean): void => {
    chip.removeEventListener('pointermove', onMove);
    chip.removeEventListener('pointerup', onUp);
    chip.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('keydown', onEscape, true);
    const moved = dragging && commit && to !== from;
    clear();
    if (!moved) return;
    const next = [...order];
    next.splice(from, 1);
    next.splice(to, 0, id);
    // Committing repaints the grid from the new order (see subscribeStageOrder
    // in render.ts), which drops the nodes this drag was transforming.
    setStageOrder(next);
    announce(`${shortName(id)} moved to column ${to + 1} of ${order.length}.`);
  };

  const onUp = (): void => finish(true);
  const onCancel = (): void => finish(false);
  const onEscape = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation(); // don't let a cancelled drag also close a dialog
    finish(false);
  };

  chip.addEventListener('pointermove', onMove);
  chip.addEventListener('pointerup', onUp);
  chip.addEventListener('pointercancel', onCancel);
  window.addEventListener('keydown', onEscape, true);
}

/** Arrow keys move a focused stage column — the keyboard's version of a drag. */
function onKeydown(ev: KeyboardEvent, chip: HTMLElement): void {
  const id = chip.dataset.stage as StageId | undefined;
  if (!id || ev.altKey || ev.ctrlKey || ev.metaKey) return;

  const order = stageOrder();
  const at = stagePosition(id);
  let delta = 0;
  if (ev.key === 'ArrowLeft') delta = -1;
  else if (ev.key === 'ArrowRight') delta = 1;
  else if (ev.key === 'Home') delta = -at;
  else if (ev.key === 'End') delta = order.length - 1 - at;
  else return;

  ev.preventDefault();
  if (!delta || !moveStage(id, delta)) {
    announce(`${shortName(id)} is already in column ${at + 1} of ${order.length}.`);
    return;
  }
  announce(`${shortName(id)} moved to column ${at + delta + 1} of ${order.length}.`);
  // The commit rebuilt the header; put focus back on the stage that moved so
  // the next arrow press keeps moving the same one.
  document
    .querySelector<HTMLElement>(`.stage-name[data-stage="${id}"]`)
    ?.focus({ preventScroll: true });
}

let liveRegion: HTMLElement | null = null;

/**
 * Say what happened, for screen readers. The region lives on `body` rather than
 * in the header because a commit re-renders the header out from under it.
 */
function announce(message: string): void {
  if (!liveRegion) {
    liveRegion = document.createElement('div');
    liveRegion.className = 'sr-only';
    liveRegion.setAttribute('aria-live', 'polite');
    document.body.appendChild(liveRegion);
  }
  liveRegion.textContent = message;
}
