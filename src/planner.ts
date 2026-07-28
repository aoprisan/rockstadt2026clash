import { DAYS } from './data';
import type { FestivalDay, SetSlot } from './types';
import {
  buildSlots,
  fmtDuration,
  getSlot,
  minutesToLabel,
  overlaps,
  walkMinutes,
} from './schedule';
import { selection } from './store';
import { tasteProfile, scoreAgainst, type Suggestion } from './taste';
import { applyResolutions, subscribeDuels } from './duel';

/**
 * The smart day planner: turns a pile of picks — clashes and all — into the
 * best walkable running order for a day, and tells you exactly what it had to
 * drop and why. Entirely client-side, recomputed on demand.
 *
 * The optimiser is weighted interval scheduling over the day's picks: each set
 * is worth its length in minutes, a ★ must-see is worth strictly more than any
 * combination of unstarred sets, and moving between stages costs real walking
 * time — arriving after the downbeat is charged as minutes of the set you'll
 * miss. An O(n²) chain DP is plenty at festival scale (≤ ~20 picks a day).
 */

/** Dominates any sum of plain set lengths, so must-sees are never sacrificed. */
const STAR_WEIGHT = 100_000;
/** A gap in the chosen chain at least this long counts as free time. */
const MIN_GAP = 25;

export interface PlannedSet {
  kind: 'set';
  slot: SetSlot;
  starred: boolean;
  /** True when a clash-duel split truncated this set (labels show the window). */
  partial?: boolean;
  /** Transition from the previously chosen set (absent on the day's opener). */
  walk?: number;
  gap?: number;
  /** Minutes of this set you'll miss because the walk is longer than the gap. */
  lateBy?: number;
}

export interface PlannedGap {
  kind: 'gap';
  /** Noon-anchored timeline minutes bounding the free stretch. */
  start: number;
  end: number;
  minutes: number;
  suggestions: Suggestion[];
}

export type PlanEntry = PlannedSet | PlannedGap;

export interface DroppedPick {
  slot: SetSlot;
  /** The chosen sets this pick overlaps — the reason it was dropped. */
  conflictsWith: SetSlot[];
  /** True when the user themselves benched this set in a clash duel. */
  byCall?: boolean;
}

export interface DayPlan {
  day: FestivalDay;
  entries: PlanEntry[];
  dropped: DroppedPick[];
  /** Minutes of music you'll actually watch (late arrivals deducted). */
  watchMinutes: number;
  starredTotal: number;
  starredKept: number;
}

/**
 * The picks a plan is built from. Defaults to the live selection; callers can
 * pass an explicit id set to plan a *hypothetical* line-up (the stamina engine
 * scores "what if I dropped this set?" without touching the real picks).
 */
function pickedSlots(picks?: ReadonlySet<string>): SetSlot[] {
  return [...(picks ?? selection.ids())]
    .map((id) => getSlot(id))
    .filter((s): s is SetSlot => Boolean(s))
    .filter((s) => !s.cancelled);
}

/* ---------- the optimiser ---------- */

function transitionLateBy(a: SetSlot, b: SetSlot): number {
  if (a.stage.id === b.stage.id) return 0;
  return Math.max(0, walkMinutes(a.stage.id, b.stage.id) - (b.start - a.end));
}

/**
 * Compute the optimal running order for one day, or null with no picks there.
 * Pass `pool` to plan a hypothetical line-up instead of the saved selection.
 */
export function planDay(dayId: string, pool?: ReadonlySet<string>): DayPlan | null {
  const day = DAYS.find((d) => d.id === dayId);
  if (!day) return null;
  const rawPicks = pickedSlots(pool).filter((s) => s.dayId === dayId);
  if (rawPicks.length === 0) return null;

  // The user's clash-duel calls come first: benched losers leave the pool and
  // split pairs are truncated to their windows. The optimiser then arbitrates
  // whatever clashes remain unresolved.
  const { slots: adjusted, droppedByCall, partial } = applyResolutions(rawPicks);
  const picks = adjusted.sort((x, y) => x.start - y.start || x.end - y.end);
  if (picks.length === 0) return null;

  const weight = (s: SetSlot): number =>
    s.end - s.start + (selection.isStarred(s.id) ? STAR_WEIGHT : 0);

  // dp[i]: best value of a non-overlapping chain ending at pick i.
  const n = picks.length;
  const dp = new Array<number>(n);
  const parent = new Array<number>(n).fill(-1);
  for (let i = 0; i < n; i++) {
    dp[i] = weight(picks[i]);
    for (let j = 0; j < i; j++) {
      if (picks[j].end > picks[i].start) continue; // overlap — not chainable
      const value = dp[j] + weight(picks[i]) - transitionLateBy(picks[j], picks[i]);
      if (value > dp[i]) {
        dp[i] = value;
        parent[i] = j;
      }
    }
  }

  let best = 0;
  for (let i = 1; i < n; i++) if (dp[i] > dp[best]) best = i;
  const chain: SetSlot[] = [];
  for (let i = best; i >= 0; i = parent[i]) chain.unshift(picks[i]);

  const chosen = new Set(chain.map((s) => s.id));
  const dropped: DroppedPick[] = picks
    .filter((s) => !chosen.has(s.id))
    .map((s) => ({
      slot: s,
      conflictsWith: chain.filter((c) => overlaps(c, s)),
    }));
  for (const [loserId, winner] of droppedByCall) {
    const slot = rawPicks.find((s) => s.id === loserId);
    if (slot) dropped.push({ slot, conflictsWith: [winner], byCall: true });
  }

  // Free-gap suggestions come from the day's unpicked sets, scored against the
  // taste profile of everything the user picked across the whole festival.
  const profile = tasteProfile(pickedSlots(pool));
  const daySlots = buildSlots(day);
  const isPicked = (id: string): boolean => (pool ? pool.has(id) : selection.has(id));

  const entries: PlanEntry[] = [];
  let watchMinutes = 0;
  for (let i = 0; i < chain.length; i++) {
    const slot = chain[i];
    const entry: PlannedSet = {
      kind: 'set',
      slot,
      starred: selection.isStarred(slot.id),
    };
    if (partial.has(slot.id)) entry.partial = true;
    if (i > 0) {
      const prev = chain[i - 1];
      const gap = slot.start - prev.end;
      const walk = prev.stage.id === slot.stage.id ? 0 : walkMinutes(prev.stage.id, slot.stage.id);
      entry.gap = gap;
      entry.walk = walk;
      const late = Math.max(0, walk - gap);
      if (late > 0) entry.lateBy = late;

      const free = gap - walk;
      if (free >= MIN_GAP) {
        const suggestions = daySlots
          .filter(
            (c) =>
              !isPicked(c.id) &&
              c.start >= prev.end + (c.stage.id === prev.stage.id ? 0 : walkMinutes(prev.stage.id, c.stage.id)) &&
              c.end + (c.stage.id === slot.stage.id ? 0 : walkMinutes(c.stage.id, slot.stage.id)) <= slot.start,
          )
          .map((c) => scoreAgainst(profile, c))
          .sort((a, b) => b.score - a.score || b.slot.end - b.slot.start - (a.slot.end - a.slot.start))
          .slice(0, 2);
        entries.push({
          kind: 'gap',
          start: prev.end,
          end: slot.start,
          minutes: free,
          suggestions,
        });
      }
    }
    watchMinutes += slot.end - slot.start - (entry.lateBy ?? 0);
    entries.push(entry);
  }

  const starredTotal = picks.filter((s) => selection.isStarred(s.id)).length;
  const starredKept = chain.filter((s) => selection.isStarred(s.id)).length;

  return { day, entries, dropped, watchMinutes, starredTotal, starredKept };
}

/* ---------- dialog ---------- */

let dialog: HTMLDialogElement | null = null;
let dialogDayId: string | null = null;

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

/** Open the day planner for the given day (defaults to the last one shown). */
export function openPlanner(dayId: string): void {
  dialogDayId = dayId;
  if (!dialog) dialog = buildDialog();
  repaint();
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function buildDialog(): HTMLDialogElement {
  const d = document.createElement('dialog');
  d.className = 'planner';
  d.setAttribute('aria-label', 'Smart day planner');

  const card = el('div', 'planner-card');

  const head = el('div', 'planner-head');
  head.appendChild(el('h2', 'planner-title', '🧭 Day planner'));
  const close = el('button', 'planner-close', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close planner');
  close.addEventListener('click', () => d.close());
  head.appendChild(close);
  card.appendChild(head);

  const tabs = el('div', 'planner-tabs');
  tabs.id = 'planner-tabs';
  card.appendChild(tabs);

  const body = el('div', 'planner-body');
  body.id = 'planner-body';
  card.appendChild(body);

  d.appendChild(card);
  d.addEventListener('click', (e) => {
    if (e.target === d) d.close();
  });
  // Duel calls made from the clash panel reshape the plan; live-refresh if open.
  subscribeDuels(() => {
    if (d.open) repaint();
  });
  document.body.appendChild(d);
  return d;
}

function repaint(): void {
  if (!dialog || !dialogDayId) return;
  const tabs = dialog.querySelector('#planner-tabs');
  const body = dialog.querySelector('#planner-body');
  if (!tabs || !body) return;

  tabs.innerHTML = '';
  for (const day of DAYS) {
    const count = pickedSlots().filter((s) => s.dayId === day.id).length;
    const btn = el('button', 'planner-tab', day.label);
    btn.type = 'button';
    if (count > 0) btn.appendChild(el('span', 'planner-tab-count', String(count)));
    if (day.id === dialogDayId) btn.classList.add('active');
    btn.addEventListener('click', () => {
      dialogDayId = day.id;
      repaint();
    });
    tabs.appendChild(btn);
  }

  body.innerHTML = '';
  const plan = planDay(dialogDayId);
  if (!plan) {
    const empty = el('p', 'planner-empty');
    empty.textContent =
      'No picks on this day yet. Tap some bands on the timeline, star your must-sees, and the planner will lay out your best route.';
    body.appendChild(empty);
    return;
  }

  if (plan.starredTotal > plan.starredKept) {
    const warn = el('p', 'planner-star-warn');
    warn.textContent = `⚠ ${plan.starredTotal - plan.starredKept} of your ★ must-sees clash with each other — even the best route can’t keep them all.`;
    body.appendChild(warn);
  }

  const list = el('ol', 'planner-list');
  let prevKind: PlanEntry['kind'] | null = null;
  for (const entry of plan.entries) {
    list.appendChild(
      entry.kind === 'set' ? renderSetRow(entry, prevKind === 'gap') : renderGapRow(entry),
    );
    prevKind = entry.kind;
  }
  body.appendChild(list);

  if (plan.dropped.length > 0) {
    const dropHead = el('p', 'planner-dropped-head', 'Left out (clashes the route resolves):');
    body.appendChild(dropHead);
    const ul = el('ul', 'planner-dropped');
    for (const d of plan.dropped) {
      const li = el('li', 'planner-dropped-item');
      const band = el('span', 'planner-band', d.slot.band);
      band.style.setProperty('--c', d.slot.stage.color);
      li.appendChild(band);
      const vs = d.conflictsWith.map((c) => c.band).join(', ');
      li.appendChild(
        el(
          'span',
          'planner-dropped-why',
          d.byCall
            ? `${d.slot.startLabel}–${d.slot.endLabel} · your duel call — you chose ${vs}`
            : `${d.slot.startLabel}–${d.slot.endLabel} · loses to ${vs || 'a better chain'}`,
        ),
      );
      ul.appendChild(li);
    }
    body.appendChild(ul);
  }

  const kept = plan.entries.filter((e) => e.kind === 'set').length;
  const summary = el(
    'p',
    'planner-summary',
    `${kept} set${kept === 1 ? '' : 's'} · ${fmtDuration(plan.watchMinutes)} of music` +
      (plan.starredTotal ? ` · ${plan.starredKept}/${plan.starredTotal} must-sees` : ''),
  );
  body.appendChild(summary);

  const hint = el(
    'p',
    'planner-hint',
    'The route keeps every ★ must-see it can, then maximises time in front of a stage — walking time included. Star sets on the timeline to protect them here.',
  );
  body.appendChild(hint);
}

function renderSetRow(entry: PlannedSet, afterGap: boolean): HTMLElement {
  const li = el('li', 'planner-item');

  // A free-gap block right above already shows the window — repeating it as a
  // "breather" line is noise (and a gap that long can never make you late).
  if (entry.walk != null && entry.gap != null && !afterGap) {
    const trans = el('div', 'planner-transition');
    if (entry.lateBy) {
      trans.classList.add('is-late');
      trans.textContent = `🚶 ~${entry.walk}m walk, only ${entry.gap}m gap — you’ll miss the first ~${entry.lateBy}m`;
    } else if (entry.walk > 0) {
      trans.textContent = `🚶 ~${entry.walk}m walk over · ${entry.gap}m gap`;
    } else {
      trans.textContent = `⏸ ${entry.gap}m breather, same stage`;
    }
    li.appendChild(trans);
  }

  // Must-sees get a gold row, matching how they read on the timeline.
  const row = el('div', entry.starred ? 'planner-set is-starred' : 'planner-set');
  row.style.setProperty('--c', entry.slot.stage.color);
  row.appendChild(el('span', 'planner-time', `${entry.slot.startLabel}–${entry.slot.endLabel}`));
  const band = el('span', 'planner-band', entry.slot.band);
  band.style.setProperty('--c', entry.slot.stage.color);
  row.appendChild(band);
  if (entry.starred) row.appendChild(el('span', 'planner-star', '★'));
  if (entry.partial) {
    const chip = el('span', 'planner-split-chip', '✂ split');
    chip.title = 'Truncated by your clash-duel split — the times show your window';
    row.appendChild(chip);
  }
  row.appendChild(el('span', 'planner-stage', entry.slot.stage.name.replace(' Stage', '')));
  li.appendChild(row);
  return li;
}

function renderGapRow(entry: PlannedGap): HTMLElement {
  const li = el('li', 'planner-item planner-gap');
  const head = el('div', 'planner-gap-head');
  head.textContent = `🕐 ${fmtDuration(entry.minutes)} free · ${minutesToLabel(entry.start)}–${minutesToLabel(entry.end)}`;
  li.appendChild(head);

  for (const sug of entry.suggestions) {
    const row = el('div', 'planner-sug');
    const band = el('span', 'planner-band', sug.slot.band);
    band.style.setProperty('--c', sug.slot.stage.color);
    row.appendChild(band);
    const why =
      sug.score > 0 && sug.matched.length
        ? `${sug.slot.genre ?? ''} — matches your taste (${sug.matched.slice(0, 2).join(', ')})`
        : sug.slot.genre ?? 'fits this gap entirely';
    row.appendChild(
      el('span', 'planner-sug-why', `${sug.slot.startLabel}–${sug.slot.endLabel} · ${why}`),
    );
    const add = el('button', 'planner-sug-add', '+ Add');
    add.type = 'button';
    add.setAttribute('aria-label', `Add ${sug.slot.band} to your picks`);
    add.addEventListener('click', () => {
      selection.toggle(sug.slot.id);
      repaint();
    });
    row.appendChild(add);
    li.appendChild(row);
  }
  if (entry.suggestions.length === 0) {
    li.appendChild(
      el('div', 'planner-sug-none', 'Nothing else fits this window — grab food or a beer. 🍻'),
    );
  }
  return li;
}
