import { DAYS } from './data';
import { fmtDuration, minutesToLabel } from './schedule';
import { selection } from './store';
import { subscribeDuels } from './duel';
import { ensureForecast, hasForecast, subscribeForecast } from './weather';
import {
  BASES,
  RESERVE_FLOOR,
  applyRepair,
  profile,
  proposeRepair,
  reserveTone,
  setProfile,
  subscribeStamina,
  currentWeek,
  type DayLoad,
  type Intervention,
  type Repair,
  type Week,
} from './stamina';

/**
 * The stamina panel: the whole festival as one battery.
 *
 * Everything here is computed on device from the picks, the RATBV timetable and
 * the hourly forecast — see `stamina.ts` for the model. The panel's job is to
 * be honest about it: every number it shows, it also shows the input for, and
 * every piece of advice comes with the one tap that acts on it.
 */

let dialog: HTMLDialogElement | null = null;
let repair: Repair | null = null;
let repairing = false;

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

export function openStamina(): void {
  if (!dialog) dialog = buildDialog();
  repair = null;
  repaint();
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  // Heat and UV come from the hourly forecast; make sure it's on its way.
  void ensureForecast();
}

function buildDialog(): HTMLDialogElement {
  const d = document.createElement('dialog');
  d.className = 'stamina';
  d.setAttribute('aria-label', 'Festival stamina and recovery');

  const card = el('div', 'stamina-card');

  const head = el('div', 'stamina-head');
  head.appendChild(el('h2', 'stamina-title', '🔋 Stamina'));
  const close = el('button', 'stamina-close', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close stamina');
  close.addEventListener('click', () => d.close());
  head.appendChild(close);
  card.appendChild(head);

  card.appendChild(
    el(
      'p',
      'stamina-sub',
      'Five days on a field, modelled: your route, the forecast and the last bus home turned into what’s left in the tank.',
    ),
  );

  const body = el('div', 'stamina-body');
  body.id = 'stamina-body';
  card.appendChild(body);

  d.appendChild(card);
  d.addEventListener('click', (e) => {
    if (e.target === d) d.close();
  });

  // The panel is live: picks, duel calls, the profile and the forecast all
  // change the numbers, and all four can change while it's open.
  const refresh = (): void => {
    if (d.open) repaint();
  };
  selection.subscribe(refresh);
  subscribeDuels(refresh);
  subscribeStamina(refresh);
  subscribeForecast(refresh);

  document.body.appendChild(d);
  return d;
}

function repaint(): void {
  const body = dialog?.querySelector('#stamina-body');
  if (!body) return;
  body.innerHTML = '';

  const week = currentWeek();
  if (!week.hasPlan) {
    body.appendChild(
      el(
        'p',
        'stamina-empty',
        'Nothing to model yet. Pick some sets on the timeline and this becomes a five-day read on how much of you will still be standing on the last night — sleep, heat, walking, and the last bus home.',
      ),
    );
    return;
  }

  body.appendChild(renderChart(week));
  body.appendChild(renderVerdict(week));
  body.appendChild(renderProfile());
  body.appendChild(renderRepair());

  for (const d of week.days) {
    if (d.sets === 0) continue;
    body.appendChild(renderDayCard(d, week.interventions.filter((i) => i.dayId === d.day.id)));
  }

  if (!hasForecast()) {
    body.appendChild(
      el(
        'p',
        'stamina-note',
        '☁ No forecast loaded yet, so heat, UV and rain aren’t in these numbers. Open Weather once with a signal and they will be.',
      ),
    );
  }

  body.appendChild(
    el(
      'p',
      'stamina-note',
      'A model, not medicine. It charges your planned route for hours on site, stage-to-stage walking, the small hours, ' +
        'heat and UV from the hourly forecast, and real door-to-door travel — then repays it with whatever sleep the running order leaves, ' +
        'discounted for the part that lands in daylight. Every input is on the cards above; disagree with any of it and change your picks.',
    ),
  );
}

/* ---------- the battery chart ---------- */

function renderChart(week: Week): HTMLElement {
  const wrap = el('div', 'stamina-chart');
  const days = week.days;
  const W = 320;
  const H = 108;
  const padX = 16;
  const padTop = 10;
  const padBottom = 22;
  const step = (W - padX * 2) / Math.max(1, days.length - 1);
  const y = (v: number): number => padTop + (1 - v / 100) * (H - padTop - padBottom);
  const x = (i: number): number => padX + i * step;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'stamina-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute(
    'aria-label',
    `Reserve across the festival: ${days.map((d) => `${d.day.label} ${d.reserveEnd}%`).join(', ')}`,
  );

  const ns = 'http://www.w3.org/2000/svg';
  const line = (x1: number, y1: number, x2: number, y2: number, cls: string): void => {
    const l = document.createElementNS(ns, 'line');
    l.setAttribute('x1', String(x1));
    l.setAttribute('y1', String(y1));
    l.setAttribute('x2', String(x2));
    l.setAttribute('y2', String(y2));
    l.setAttribute('class', cls);
    svg.appendChild(l);
  };

  // The floor the repair pass aims to keep you above.
  line(padX - 8, y(RESERVE_FLOOR), W - padX + 8, y(RESERVE_FLOOR), 'stamina-floor');

  // Each day's drain as a vertical drop from the morning reading to the night's.
  days.forEach((d, i) => {
    if (d.sets === 0) return;
    line(x(i), y(d.reserveStart), x(i), y(d.reserveEnd), 'stamina-drop');
  });

  // The ceiling you wake up to — it sinks as fatigue carries over.
  const ceiling = days.map((d, i) => `${x(i)},${y(d.ceiling)}`).join(' ');
  const ceilPath = document.createElementNS(ns, 'polyline');
  ceilPath.setAttribute('points', ceiling);
  ceilPath.setAttribute('class', 'stamina-ceiling');
  svg.appendChild(ceilPath);

  const path = document.createElementNS(ns, 'polyline');
  path.setAttribute('points', days.map((d, i) => `${x(i)},${y(d.reserveEnd)}`).join(' '));
  path.setAttribute('class', 'stamina-line');
  svg.appendChild(path);

  days.forEach((d, i) => {
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', String(x(i)));
    dot.setAttribute('cy', String(y(d.reserveEnd)));
    dot.setAttribute('r', d.sets ? '4' : '2.5');
    dot.setAttribute('class', `stamina-dot is-${reserveTone(d.reserveEnd)}`);
    svg.appendChild(dot);

    const value = document.createElementNS(ns, 'text');
    value.setAttribute('x', String(x(i)));
    value.setAttribute('y', String(Math.max(10, y(d.reserveEnd) - 8)));
    value.setAttribute('class', 'stamina-value');
    value.textContent = d.sets ? `${d.reserveEnd}%` : '—';
    svg.appendChild(value);

    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', String(x(i)));
    label.setAttribute('y', String(H - 6));
    label.setAttribute('class', 'stamina-xlabel');
    label.textContent = d.day.label.replace('Day ', 'D');
    svg.appendChild(label);
  });

  wrap.appendChild(svg);
  const legend = el('div', 'stamina-legend');
  legend.appendChild(el('span', 'stamina-legend-item is-line', 'reserve at night'));
  legend.appendChild(el('span', 'stamina-legend-item is-ceiling', 'best you can wake up to'));
  legend.appendChild(el('span', 'stamina-legend-item is-floor', `floor ${RESERVE_FLOOR}%`));
  wrap.appendChild(legend);
  return wrap;
}

function renderVerdict(week: Week): HTMLElement {
  const last = [...week.days].reverse().find((d) => d.sets > 0);
  const low = week.days.find((d) => d.day.id === week.lowestDayId);
  const tone = reserveTone(week.lowest);
  const p = el('p', `stamina-verdict is-${tone}`);
  const headline =
    tone === 'ok'
      ? `This week holds up: you finish ${last?.day.label ?? 'the run'} at ${last?.reserveEnd ?? 0}%.`
      : tone === 'warn'
        ? `Tight but survivable — the low point is ${low?.day.label ?? ''} at ${week.lowest}%.`
        : `As planned, ${low?.day.label ?? 'one of these days'} ends at ${week.lowest}%. Something is going to get dropped; better it's your choice than your body's.`;
  p.appendChild(el('strong', undefined, headline));
  const criticals = week.interventions.filter((i) => i.severity === 'critical').length;
  if (criticals > 0) {
    p.appendChild(
      el(
        'span',
        'stamina-verdict-more',
        criticals === 1
          ? ' One call below needs making before the gates open.'
          : ` ${criticals} calls below need making before the gates open.`,
      ),
    );
  }
  return p;
}

/* ---------- profile ---------- */

function renderProfile(): HTMLElement {
  const wrap = el('div', 'stamina-profile');
  const p = profile();

  wrap.appendChild(el('div', 'stamina-profile-label', 'Where you sleep'));
  const chips = el('div', 'stamina-chips');
  for (const base of BASES) {
    const btn = el('button', 'stamina-chip', base.label);
    btn.type = 'button';
    btn.title = base.hint;
    if (base.id === p.base) btn.classList.add('active');
    btn.addEventListener('click', () => setProfile({ base: base.id }));
    chips.appendChild(btn);
  }
  wrap.appendChild(chips);

  const sleep = el('div', 'stamina-stepper');
  sleep.appendChild(el('span', 'stamina-profile-label', 'Sleep you need'));
  const minus = el('button', 'stamina-step', '−');
  minus.type = 'button';
  minus.setAttribute('aria-label', 'Less sleep needed');
  minus.addEventListener('click', () => setProfile({ sleepTarget: Math.max(5, p.sleepTarget - 0.5) }));
  const value = el('span', 'stamina-step-value', `${p.sleepTarget}h`);
  const plus = el('button', 'stamina-step', '+');
  plus.type = 'button';
  plus.setAttribute('aria-label', 'More sleep needed');
  plus.addEventListener('click', () => setProfile({ sleepTarget: Math.min(10, p.sleepTarget + 0.5) }));
  sleep.appendChild(minus);
  sleep.appendChild(value);
  sleep.appendChild(plus);
  wrap.appendChild(sleep);

  return wrap;
}

/* ---------- the repair pass ---------- */

function renderRepair(): HTMLElement {
  const wrap = el('div', 'stamina-repair');

  if (!repair) {
    const btn = el(
      'button',
      'stamina-fix',
      repairing ? 'Working out what to cut…' : '⚕ Fix my week',
    );
    btn.type = 'button';
    btn.disabled = repairing;
    btn.title = `Find the smallest set of cuts that keeps every night above ${RESERVE_FLOOR}%`;
    btn.addEventListener('click', () => {
      repairing = true;
      repaint();
      // Yield a frame so the button can paint its working state before the
      // search blocks the thread.
      window.setTimeout(() => {
        repair = proposeRepair();
        repairing = false;
        repaint();
      }, 16);
    });
    wrap.appendChild(btn);
    wrap.appendChild(
      el(
        'p',
        'stamina-fix-hint',
        `Names the fewest sets to drop to keep the whole run above ${RESERVE_FLOOR}%. ★ must-sees are never touched, and it only proposes a cut that measurably moves the battery.`,
      ),
    );
    return wrap;
  }

  if (repair.cuts.length === 0) {
    wrap.appendChild(
      el(
        'p',
        'stamina-fix-ok',
        `Nothing to cut — this plan already stays above ${RESERVE_FLOOR}% all week. Go hard.`,
      ),
    );
    wrap.appendChild(dismissButton('Fine'));
    return wrap;
  }

  const head = el(
    'p',
    'stamina-fix-head',
    repair.solved
      ? `Drop these ${repair.cuts.length} and the week clears ${RESERVE_FLOOR}%: low point ${repair.beforeLow}% → ${repair.afterLow}%.`
      : `Best I can do without touching your ★: low point ${repair.beforeLow}% → ${repair.afterLow}%. The rest is protected.`,
  );
  wrap.appendChild(head);

  const list = el('ul', 'stamina-cuts');
  for (const cut of repair.cuts) {
    const li = el('li', 'stamina-cut');
    const band = el('span', 'stamina-cut-band', cut.slot.band);
    band.style.setProperty('--c', cut.slot.stage.color);
    li.appendChild(band);
    li.appendChild(
      el(
        'span',
        'stamina-cut-why',
        `${DAYS.find((x) => x.id === cut.slot.dayId)?.label ?? ''} · ${cut.slot.startLabel}–${cut.slot.endLabel} · ${cut.reason}`,
      ),
    );
    list.appendChild(li);
  }
  wrap.appendChild(list);

  const row = el('div', 'stamina-fix-actions');
  const apply = el('button', 'stamina-apply', `Drop ${repair.cuts.length} set${repair.cuts.length === 1 ? '' : 's'}`);
  apply.type = 'button';
  apply.addEventListener('click', () => {
    if (repair) applyRepair(repair);
    repair = null;
    repaint();
  });
  row.appendChild(apply);
  row.appendChild(dismissButton('Keep them all'));
  wrap.appendChild(row);
  return wrap;
}

function dismissButton(label: string): HTMLElement {
  const btn = el('button', 'stamina-dismiss', label);
  btn.type = 'button';
  btn.addEventListener('click', () => {
    repair = null;
    repaint();
  });
  return btn;
}

/* ---------- day cards ---------- */

function renderDayCard(d: DayLoad, items: Intervention[]): HTMLElement {
  const card = el('div', 'stamina-day');

  const head = el('div', 'stamina-day-head');
  const title = el('div', 'stamina-day-title');
  title.appendChild(el('span', 'stamina-day-label', d.day.label));
  title.appendChild(
    el(
      'span',
      'stamina-day-date',
      new Date(d.day.date + 'T00:00:00').toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }),
    ),
  );
  head.appendChild(title);
  const badge = el('span', `stamina-badge is-${reserveTone(d.reserveEnd)}`, `${d.reserveEnd}%`);
  badge.title = `Starts the day at ${d.reserveStart}%, ends it at ${d.reserveEnd}%`;
  head.appendChild(badge);
  card.appendChild(head);

  const meter = el('div', 'stamina-meter');
  const fill = el('div', `stamina-meter-fill is-${reserveTone(d.reserveEnd)}`);
  fill.style.width = `${Math.max(2, d.reserveEnd)}%`;
  meter.appendChild(fill);
  card.appendChild(meter);

  const chips = el('div', 'stamina-day-chips');
  const chip = (text: string, title: string): void => {
    const c = el('span', 'stamina-daychip', text);
    c.title = title;
    chips.appendChild(c);
  };
  if (d.arrive != null && d.depart != null) {
    chip(
      `🕒 ${fmtDuration(d.siteMinutes)} on site`,
      `Gate around ${minutesToLabel(d.arrive)}, off site around ${minutesToLabel(d.depart)}`,
    );
  }
  chip(`🎸 ${d.sets} sets · ${fmtDuration(d.watchMinutes)}`, 'Music you actually catch on this route');
  if (d.walkMinutes > 0) chip(`🚶 ${fmtDuration(d.walkMinutes)}`, 'Walking between stages');
  if (d.restMinutes > 0) chip(`🪑 ${fmtDuration(d.restMinutes)} off your feet`, 'Planned gaps of 25m or more');
  if (d.climate.hasData && d.climate.peakFeels != null) {
    chip(
      `🌡 feels ${Math.round(d.climate.peakFeels)}°`,
      d.climate.hotMinutes > 0
        ? `${fmtDuration(d.climate.hotMinutes)} at or above 28° while you're on site`
        : 'Peak apparent temperature while you’re on site',
    );
  }
  if (d.sleepEffective != null && d.sleepHours != null) {
    chip(
      `😴 ${fmtDuration(Math.round(d.sleepEffective * 60))} real`,
      `In bed roughly ${fmtDuration(Math.round(d.sleepHours * 60))}; the rest of the window is daylight sleep, which counts for less.`,
    );
  }
  if (d.travel) {
    const board = d.travel.board;
    chip(
      `🚌 ${fmtDuration(d.travel.out + d.travel.home)} travel`,
      (board ? `Out: the ${board.line} at ${board.time} from ${board.stop} gets you in with time to spare. ` : '') +
        `Back: ${d.travel.note}`,
    );
  }
  card.appendChild(chips);

  if (items.length > 0) {
    const list = el('ul', 'stamina-actions');
    for (const item of items) list.appendChild(renderIntervention(item));
    card.appendChild(list);
  }

  return card;
}

function renderIntervention(item: Intervention): HTMLElement {
  const li = el('li', `stamina-action is-${item.severity}`);
  const head = el('div', 'stamina-action-head');
  head.appendChild(el('span', 'stamina-action-icon', item.icon));
  head.appendChild(el('span', 'stamina-action-title', item.title));
  li.appendChild(head);
  li.appendChild(el('p', 'stamina-action-detail', item.detail));
  if (item.drop) {
    const btn = el('button', 'stamina-action-btn', item.drop.label);
    btn.type = 'button';
    btn.addEventListener('click', () => {
      if (item.drop && selection.has(item.drop.slot.id)) selection.toggle(item.drop.slot.id);
      repair = null;
      repaint();
    });
    li.appendChild(btn);
  }
  return li;
}
