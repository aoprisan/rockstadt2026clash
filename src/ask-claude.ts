import { DAYS, FESTIVAL, STAGES } from './data';
import type { SetSlot, StageId } from './types';
import {
  ALL_SLOTS,
  findClashes,
  findTightTransitions,
  fmtDuration,
  getSlot,
  minutesToLabel,
} from './schedule';
import { boardBy, dayTypeFor, EXTRAS, STOP_TOWN, TICKET_APP, WALK_MIN } from './buses';
import { selection } from './store';
import { tasteProfile } from './taste';
import { currentWeek } from './stamina';

/**
 * "Ask Claude": turn the user's picks — plus every clash, tight walk and the
 * rest of the bill — into a single, copy-paste-ready prompt they can hand to
 * Claude (or any assistant) to get help *discovering similar bands*,
 * *optimising their day* or *resolving conflicts*.
 *
 * The app has no backend and no API key, so nothing is sent anywhere: we build
 * the prompt entirely client-side, drop it in a dialog with a copy button, and
 * offer a one-tap link that opens claude.ai with the prompt prefilled.
 */

/** Where the prompt should steer the assistant. */
export type AskFocus = 'all' | 'similar' | 'optimise' | 'clashes' | 'buses' | 'food' | 'stamina';

const STAGE_ORDER: StageId[] = ['rugina', 'brasov', 'calmuc'];

const FOCUS_LABELS: Record<AskFocus, string> = {
  all: '✨ Everything',
  similar: '🎸 Similar bands',
  optimise: '🧭 Optimise my day',
  clashes: '⚔ Resolve clashes',
  buses: '🚌 Buses',
  food: '🍽 When to eat',
  stamina: '🔋 Survive the week',
};

/** How early before the first set we aim to be at the gate. */
const ARRIVE_BUFFER_MIN = 20;
/** Shortest gap in a day's picks worth calling a meal window. */
const MEAL_GAP_MIN = 30;

function pickedSlots(): SetSlot[] {
  return selection
    .ids()
    .map((id) => getSlot(id))
    .filter((s): s is SetSlot => Boolean(s))
    .filter((s) => !s.cancelled);
}

/** Short stage name without the trailing "Stage" for compact prompt lines. */
function shortStage(id: StageId): string {
  return STAGES[id].name.replace(' Stage', '');
}

function slotLine(s: SetSlot, starred = false): string {
  const genre = s.genre ? ` · ${s.genre}` : '';
  const star = starred ? ' ★ must-see' : '';
  return `- ${s.startLabel}–${s.endLabel} · ${s.band} · ${shortStage(s.stage.id)}${genre}${star}`;
}

/** Day-by-day list, one section per day that has any slots in `slots`. */
function byDaySections(slots: SetSlot[], line: (s: SetSlot) => string): string[] {
  const out: string[] = [];
  for (const day of DAYS) {
    const daySlots = slots
      .filter((s) => s.dayId === day.id)
      .sort((a, b) => a.start - b.start || STAGE_ORDER.indexOf(a.stage.id) - STAGE_ORDER.indexOf(b.stage.id));
    if (daySlots.length === 0) continue;
    out.push(`${day.label} (${day.date}):\n${daySlots.map(line).join('\n')}`);
  }
  return out;
}

/** The user's dominant genres, most distinctive first, as a short phrase. */
function tasteSummary(picks: SetSlot[]): string {
  const profile = tasteProfile(picks);
  const top = [...profile.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([t]) => t);
  return top.join(', ');
}

function clashLines(picks: SetSlot[]): string[] {
  return findClashes(picks).map((c) => {
    const day = DAYS.find((d) => d.id === c.a.dayId)?.label ?? c.a.dayId;
    return `- ${day}: ${c.a.band} (${c.a.startLabel}–${c.a.endLabel}, ${shortStage(c.a.stage.id)}) overlaps ${c.b.band} (${c.b.startLabel}–${c.b.endLabel}, ${shortStage(c.b.stage.id)}) by ${fmtDuration(c.minutes)}`;
  });
}

function tightLines(picks: SetSlot[]): string[] {
  return findTightTransitions(picks).map((t) => {
    const day = DAYS.find((d) => d.id === t.from.dayId)?.label ?? t.from.dayId;
    const verdict =
      t.slack < 0
        ? `you'd miss the first ~${-t.slack}m of ${t.to.band}`
        : `only ${t.slack}m to spare`;
    return `- ${day}: ${t.from.band} (ends ${t.from.endLabel}, ${shortStage(t.from.stage.id)}) → ${t.to.band} (starts ${t.to.startLabel}, ${shortStage(t.to.stage.id)}) — ~${t.walk}m walk, ${t.gap}m gap, ${verdict}`;
  });
}

/** Picks for one day, sorted by start then end. */
function dayPicks(picks: SetSlot[], dayId: string): SetSlot[] {
  return picks
    .filter((s) => s.dayId === dayId)
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

/** The general RATBV facts that hold for the whole festival. */
function busFacts(): string {
  const door = EXTRAS.daytime.headwayMin;
  return [
    '## Getting there & back (RATBV city buses)',
    `- To the site: lines ${EXTRAS.daytime.lines.join(' and ')} from ${STOP_TOWN} (Brașov), roughly every ${door} min during the festival, with extra runs ${EXTRAS.inbound.from}–${EXTRAS.inbound.to}. Ride is ~13–14 min, then a ~${WALK_MIN} min walk from the Ghimbav Făgărașului stop to the gate.`,
    `- Home at night: line ${EXTRAS.night.line} (${EXTRAS.night.route}), boarding at the "${EXTRAS.night.boardStop}" stop, every ~${EXTRAS.night.headwayMin} min from ${EXTRAS.night.from} to ${EXTRAS.night.to}.`,
    `- Bus tickets: the ${TICKET_APP.name} app (${TICKET_APP.url}) sells RATBV's full tariff list, metropolitan lines included, at kiosk price — attach a ${TICKET_APP.cards}, then scan the QR at the stop or in the vehicle. Romanian-language, so worth setting up before travelling. Otherwise mobile cashiers sell tickets at the "${EXTRAS.tickets.where}" stop between ${EXTRAS.tickets.from} and ${EXTRAS.tickets.to}.`,
    '- Earlier in the evening, daytime 210/220 buses run back from Ghimbav until roughly 23:00–23:40.',
  ].join('\n');
}

/** Per-day: when the day starts/ends and which bus reaches the gate in time. */
function travelLines(picks: SetSlot[]): string[] {
  const out: string[] = [];
  for (const day of DAYS) {
    const dp = dayPicks(picks, day.id);
    if (dp.length === 0) continue;
    const first = dp[0];
    const lastEnd = dp.reduce((a, b) => (b.end > a.end ? b : a));
    const type = dayTypeFor(day.date);
    const bus = boardBy(type, first.start - ARRIVE_BUFFER_MIN);
    const arrival = bus
      ? `catch the ${bus.line} at ${bus.time} from ${STOP_TOWN} (at the gate ~${minutesToLabel(bus.atGate)})`
      : 'only the very first morning buses (~05:00) run this early';
    out.push(
      `- ${day.label}: first set ${first.band} at ${first.startLabel}; last set ends ${lastEnd.endLabel}. To arrive in time, ${arrival}. Getting home after ${lastEnd.endLabel} means the ${EXTRAS.night.line} night line (${EXTRAS.night.from}–${EXTRAS.night.to}).`,
    );
  }
  return out;
}

/** Per-day free stretches inside the picks that are long enough to eat in. */
function mealLines(picks: SetSlot[]): string[] {
  const out: string[] = [];
  for (const day of DAYS) {
    const dp = dayPicks(picks, day.id);
    if (dp.length === 0) continue;
    const gaps: string[] = [];
    let cursor = dp[0].end; // latest end seen so far (picks can overlap)
    for (let i = 1; i < dp.length; i++) {
      const s = dp[i];
      if (s.start - cursor >= MEAL_GAP_MIN) {
        gaps.push(`${minutesToLabel(cursor)}–${minutesToLabel(s.start)} (${fmtDuration(s.start - cursor)})`);
      }
      if (s.end > cursor) cursor = s.end;
    }
    out.push(
      `- ${day.label}: ${gaps.length ? `free ${gaps.join(', ')}` : 'back-to-back — no real gap, so eat before the first set or after the last'}`,
    );
  }
  return out;
}

/** The mode-specific "what I'd like from you" section. */
function askSection(focus: AskFocus, hasPicks: boolean): string {
  const similar = hasPicks
    ? 'Suggest other bands **from the un-picked line-up above** that fit my taste, given the genres and artists I already picked. Rank them best-first, say in a few words why each fits, and note whether it drops into a free gap or clashes with something I already have.'
    : 'I haven’t picked anything yet. From the line-up above, suggest a strong starter set of bands to build a plan around, grouped by day, with a one-line reason each.';
  const optimise =
    'Help me turn my picks into the best realistic plan for each day: which sets to prioritise, where a pick isn’t worth a cross-site walk, and which free gaps are worth filling. Assume I can’t be in two places at once and it takes a few minutes to walk between stages.';
  const clashes =
    'Help me resolve the clashes and tight walks above. For each overlapping pair, recommend which to see (or how to split the set), based on how well each fits my taste and how much overlap there is.';
  const buses =
    'Using the bus facts and my per-day arrival/departure below, tell me which bus to catch to reach the gate comfortably before my first set each day, and my best option home after the last set (the night line included). Call out any day where the first set is early or the last set runs so late that only the night buses work.';
  const food =
    'Using my per-day plan and its free gaps below, tell me the best windows to grab food and drink without missing anything I care about — especially around my ★ must-sees — and whether any day is so back-to-back that I should eat before the first set or after the last instead.';
  const stamina =
    'Five days of this is a physical problem, not just a scheduling one. Using the stamina model in the section above — hours on site, sleep the running order actually leaves me, heat and the ride home — tell me which specific sets to drop to make it to the last night in one piece, which days to arrive later on, and where to eat and drink. Argue with the model where you think it is wrong, and never propose dropping a ★ must-see.';

  switch (focus) {
    case 'similar':
      return similar;
    case 'optimise':
      return optimise;
    case 'clashes':
      return clashes;
    case 'buses':
      return buses;
    case 'food':
      return food;
    case 'stamina':
      return stamina;
    case 'all':
    default:
      return [
        'Please help me with all of these:',
        `1. **Similar bands.** ${similar}`,
        `2. **Optimise my day.** ${optimise}`,
        `3. **Resolve clashes.** ${clashes}`,
        `4. **Buses.** ${buses}`,
        `5. **When to eat.** ${food}`,
        `6. **Surviving five days.** ${stamina}`,
      ].join('\n');
  }
}

/**
 * The stamina model's read on the week, so the assistant argues from the same
 * numbers the app does: load, sleep, heat and the ride home, day by day.
 */
function staminaSection(): string {
  const week = currentWeek();
  if (!week.hasPlan) return '';
  const lines = [
    '## My stamina model (computed on device from this plan, the forecast and the bus timetable)',
    'A "reserve" battery starts at 100% and drains with hours on site, walking, the small hours, heat and travel; each night repays it with whatever sleep the running order leaves, discounted for the part that lands in daylight.',
  ];
  for (const d of week.days) {
    if (d.sets === 0 || d.arrive == null || d.depart == null) continue;
    const bits = [
      `on site ${minutesToLabel(d.arrive)}–${minutesToLabel(d.depart)} (${fmtDuration(d.siteMinutes)})`,
      `${d.sets} sets`,
      `load ${d.strain}/100`,
      `reserve ${d.reserveStart}% → ${d.reserveEnd}%`,
    ];
    if (d.sleepEffective != null) {
      bits.push(`sleep after: ~${fmtDuration(Math.round(d.sleepEffective * 60))} of real rest`);
    }
    if (d.climate.hasData && d.climate.peakFeels != null) {
      bits.push(`feels up to ${Math.round(d.climate.peakFeels)}°`);
    }
    if (d.travel) bits.push(`travel ${fmtDuration(d.travel.out + d.travel.home)} door to door`);
    lines.push(`- **${d.day.label}** — ${bits.join(' · ')}`);
  }
  const flags = week.interventions.filter((i) => i.severity !== 'tip');
  if (flags.length) {
    lines.push('', 'Flagged by the model:');
    for (const f of flags.slice(0, 10)) {
      const day = DAYS.find((x) => x.id === f.dayId)?.label ?? '';
      lines.push(`- [${f.severity}] ${day}: ${f.title} — ${f.detail}`);
    }
  }
  return lines.join('\n');
}

/** Build the full prompt for the given focus from the current selection. */
export function buildPrompt(focus: AskFocus): string {
  const picks = pickedSlots();
  const starred = new Set(selection.starredIds());
  const unpicked = ALL_SLOTS.filter((s) => !selection.has(s.id));

  const lines: string[] = [];

  lines.push(
    `I'm planning which bands to see at ${FESTIVAL.name} (${FESTIVAL.dates}, ${FESTIVAL.location}) — a metal & rock festival with three stages running in parallel (${STAGE_ORDER.map(shortStage).join(', ')}). Sets on different stages often overlap, and there's a short walk between stages. Help me plan.`,
  );

  if (picks.length > 0) {
    const starCount = starred.size;
    lines.push(
      `\n## My current picks (${picks.length} set${picks.length === 1 ? '' : 's'}${starCount ? `, ${starCount} starred as must-see` : ''})\n` +
        byDaySections(picks, (s) => slotLine(s, starred.has(s.id))).join('\n\n'),
    );

    const taste = tasteSummary(picks);
    if (taste) lines.push(`\nMy taste, by the genres I picked most: ${taste}.`);

    const clashes = clashLines(picks);
    lines.push(
      `\n## Clashes in my picks (overlapping sets I can't fully catch both of)\n` +
        (clashes.length ? clashes.join('\n') : '- None — no two of my picks overlap.'),
    );

    const tight = tightLines(picks);
    if (tight.length) {
      lines.push(
        `\n## Tight walks (back-to-back picks on different stages, little time to cross)\n` +
          tight.join('\n'),
      );
    }

    lines.push(`\n${busFacts()}`);
    lines.push(`\n## My arrival & departure each day\n${travelLines(picks).join('\n')}`);
    lines.push(
      `\n## Free gaps in my picks (for meal breaks)\n${mealLines(picks).join('\n')}`,
    );
    lines.push(`\n${staminaSection()}`);
  } else {
    lines.push(`\n## My current picks\nI haven't picked anything yet.`);
    lines.push(`\n${busFacts()}`);
  }

  lines.push(
    `\n## The rest of the line-up I haven't picked (suggest additions that actually fit my schedule)\n` +
      byDaySections(unpicked, (s) => slotLine(s)).join('\n\n'),
  );

  lines.push(`\n## What I'd like from you\n${askSection(focus, picks.length > 0)}`);
  lines.push(
    `\nKeep every suggestion to bands actually on the line-up above, reference the day, time and stage, and flag any new clash a suggestion would create.`,
  );

  return lines.join('\n');
}

/* ---------- clipboard + Claude hand-off ---------- */

/** claude.ai prefills a new chat from `?q=`; keep the URL under a safe length. */
const CLAUDE_MAX_QUERY = 6000;

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/* ---------- dialog ---------- */

let dialog: HTMLDialogElement | null = null;
let focus: AskFocus = 'all';

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

export function openAskClaude(): void {
  focus = 'all';
  if (!dialog) dialog = buildDialog();
  repaint();
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function buildDialog(): HTMLDialogElement {
  const d = document.createElement('dialog');
  d.className = 'planner ask';
  d.setAttribute('aria-label', 'Ask Claude to help with your picks');

  const card = el('div', 'planner-card');

  const head = el('div', 'planner-head');
  head.appendChild(el('h2', 'planner-title', '🤖 Ask Claude'));
  const close = el('button', 'planner-close', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', () => d.close());
  head.appendChild(close);
  card.appendChild(head);

  const intro = el(
    'p',
    'ask-intro',
    'Build a ready-to-paste prompt from your picks — clashes, tight walks, buses, meal gaps and the rest of the bill included — then copy it or open it straight in Claude. Nothing leaves your device until you do.',
  );
  card.appendChild(intro);

  const tabs = el('div', 'planner-tabs ask-tabs');
  tabs.id = 'ask-tabs';
  card.appendChild(tabs);

  const body = el('div', 'planner-body');
  body.id = 'ask-body';
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
  const tabs = dialog.querySelector('#ask-tabs');
  const body = dialog.querySelector('#ask-body');
  if (!tabs || !body) return;

  tabs.innerHTML = '';
  (Object.keys(FOCUS_LABELS) as AskFocus[]).forEach((f) => {
    const btn = el('button', 'planner-tab', FOCUS_LABELS[f]);
    btn.type = 'button';
    if (f === focus) btn.classList.add('active');
    btn.addEventListener('click', () => {
      focus = f;
      repaint();
    });
    tabs.appendChild(btn);
  });

  body.innerHTML = '';

  if (selection.size() === 0) {
    body.appendChild(
      el(
        'p',
        'ask-empty',
        'Tip: pick a few bands on the timeline first and Claude can tailor its suggestions to your taste. You can still generate a “what should I start with?” prompt below.',
      ),
    );
  }

  const prompt = buildPrompt(focus);

  const ta = el('textarea', 'ask-textarea');
  ta.value = prompt;
  ta.rows = 12;
  ta.spellcheck = false;
  ta.setAttribute('aria-label', 'The prompt to send to Claude — edit it if you like');
  body.appendChild(ta);

  const actions = el('div', 'ask-actions');

  const copy = el('button', 'ask-btn ask-btn-primary', '📋 Copy prompt');
  copy.type = 'button';
  copy.addEventListener('click', () => {
    void copyText(ta.value).then((ok) => {
      copy.textContent = ok ? '✓ Copied' : '⚠ Copy failed — select & copy';
      setTimeout(() => {
        copy.textContent = '📋 Copy prompt';
      }, 2200);
    });
  });
  actions.appendChild(copy);

  const open = el('button', 'ask-btn', '↗ Open in Claude');
  open.type = 'button';
  open.title = 'Copies the prompt, then opens claude.ai';
  open.addEventListener('click', () => {
    const text = ta.value;
    void copyText(text);
    // Prefill the chat when the prompt is short enough for a URL; otherwise
    // open a blank chat — the prompt is already on the clipboard to paste.
    const url =
      text.length <= CLAUDE_MAX_QUERY
        ? `https://claude.ai/new?q=${encodeURIComponent(text)}`
        : 'https://claude.ai/new';
    window.open(url, '_blank', 'noopener');
  });
  actions.appendChild(open);

  body.appendChild(actions);

  body.appendChild(
    el(
      'p',
      'ask-hint',
      'Claude works best when it can see the whole bill, so the prompt lists every set. Edit it above before copying if you want to narrow the ask.',
    ),
  );
}
