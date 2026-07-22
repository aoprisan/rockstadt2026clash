import { DAYS, FESTIVAL, DATA_VERSION } from './data';
import type { FestivalDay, SetSlot } from './types';
import {
  buildSlots,
  clashingIds,
  findClashes,
  findTightTransitions,
  tightIds,
  fmtDuration,
  getSlot,
  festivalInstant,
  ALL_SLOTS,
} from './schedule';
import {
  selection,
  loadActiveDay,
  saveActiveDay,
  loadSeenVersion,
  saveSeenVersion,
} from './store';
import { shareSelection } from './share';
import { openShareApp } from './share-app';
import { sharePicksLink } from './picks-link';
import { computeLive, fmtCountdown } from './live';
import { computeStats } from './stats';
import { openMap } from './map';
import {
  fmtMm,
  openWeather,
  setWeatherIcons,
  subscribeForecast,
  ensureForecast,
  startForecastAutoRefresh,
} from './weather';
import { exportCalendar, clearCalendar, hasExported } from './calendar';
import * as notify from './notify';

// Vertical scale of the timeline. Sized so even the shortest sets (45 min) are
// tall enough to hold their full content — a three-line band name plus the
// time, weather and both action pills — without clipping. Longer sets simply
// get proportionally taller boxes.
const PX_PER_MIN = 2.4;
const HEADER_OFFSET = 0;

let activeDayId = loadActiveDay(DAYS[0].id);
let onlyPicks = false;
// The filters / picks / clashes panel under the day tabs is folded away by
// default; the header keeps showing live pick + clash counts while it's closed.
let controlsOpen = false;
// The "Your festival" stats panel at the foot of the schedule is likewise
// collapsed by default.
let statsOpen = false;
let bannerDismissed = false;

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

function activeDay(): FestivalDay {
  return DAYS.find((d) => d.id === activeDayId) ?? DAYS[0];
}

/** All selected slots across the whole festival. */
function selectedSlots(): SetSlot[] {
  return selection
    .ids()
    .map((id) => getSlot(id))
    .filter((s): s is SetSlot => Boolean(s));
}

export function mount(root: HTMLElement): void {
  root.innerHTML = '';
  root.appendChild(renderHeader());
  root.appendChild(renderDayTabs());
  root.appendChild(renderControls());

  const banner = el('div', 'update-banner-wrap');
  banner.id = 'update-banner';
  root.appendChild(banner);

  const main = el('main', 'content');
  main.id = 'content';
  root.appendChild(main);

  root.appendChild(renderShareBar());

  // Host for in-app reminder toasts (the visible counterpart to the native OS
  // notification). Fixed to the viewport, filled by the reminder subscription.
  const toasts = el('div', 'toast-host');
  toasts.id = 'toast-host';
  toasts.setAttribute('aria-live', 'polite');
  root.appendChild(toasts);

  // Surface an in-app toast whenever a picked set enters its reminder window.
  // Native notifications keep reaching the user in the background; this covers
  // the case where the app is focused and the OS suppresses its own banner.
  notify.onReminder(({ slot, lead }) => showReminderToast(slot, lead));

  selection.subscribe(() => {
    renderContent(main);
    renderLiveBar();
    refreshChrome();
  });

  // Per-set weather icons need the hourly forecast; load it in the background
  // and re-render the timeline once it arrives (from cache, then network).
  subscribeForecast(() => renderContent(main));
  void ensureForecast();
  // Keep it current while the app sits open all evening (timer + tab refocus).
  startForecastAutoRefresh();

  renderUpdateBanner();
  renderClock();
  renderLiveBar();
  renderContent(main);
  refreshChrome();

  // The clock ticks every second; the "now" line and "Now / Next" bar creep
  // forward on their own while the app sits open all evening.
  window.setInterval(renderClock, 1_000);
  window.setInterval(() => {
    positionNowLine();
    renderLiveBar();
  }, 30_000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      renderClock();
      positionNowLine();
      renderLiveBar();
    }
  });
}

function renderHeader(): HTMLElement {
  const header = el('header', 'app-header');
  const title = el('div', 'brand');
  title.appendChild(el('h1', 'brand-name', FESTIVAL.name));
  const sub = el('p', 'brand-sub');
  sub.textContent = `${FESTIVAL.edition} · ${FESTIVAL.dates} · ${FESTIVAL.location}`;
  title.appendChild(sub);

  // Live wall clock — the current date and time, ticking while the app is open.
  const clock = el('p', 'brand-clock');
  clock.id = 'header-clock';
  title.appendChild(clock);

  header.appendChild(title);

  const stats = el('div', 'header-stats');
  stats.id = 'header-stats';
  header.appendChild(stats);
  return header;
}

function renderDayTabs(): HTMLElement {
  const nav = el('nav', 'day-tabs');
  nav.setAttribute('aria-label', 'Festival days');
  for (const day of DAYS) {
    const btn = el('button', 'day-tab', day.label);
    btn.dataset.day = day.id;
    const date = new Date(day.date + 'T00:00:00');
    const small = el(
      'span',
      'day-date',
      date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    );
    btn.appendChild(small);
    if (day.id === activeDayId) btn.classList.add('active');
    btn.addEventListener('click', () => {
      activeDayId = day.id;
      saveActiveDay(day.id);
      refreshChrome();
      renderContent(document.getElementById('content') as HTMLElement);
    });
    nav.appendChild(btn);
  }
  return nav;
}

function renderToolbar(): HTMLElement {
  const wrap = el('div', 'toolbar-wrap');
  const bar = el('div', 'toolbar');

  // Left group: the primary "Only my picks" filter stays always visible.
  const toggles = el('div', 'tb-group');

  const pickToggle = el('label', 'switch');
  const cb = el('input') as HTMLInputElement;
  cb.type = 'checkbox';
  cb.addEventListener('change', () => {
    onlyPicks = cb.checked;
    renderContent(document.getElementById('content') as HTMLElement);
  });
  pickToggle.appendChild(cb);
  pickToggle.appendChild(el('span', 'switch-track'));
  pickToggle.appendChild(el('span', 'switch-label', 'Only my picks'));
  toggles.appendChild(pickToggle);

  toggles.appendChild(renderSearch());

  bar.appendChild(toggles);

  // Collapsible panel: secondary reminder + calendar controls live here so
  // they no longer crowd the top of the screen.
  const panel = el('div', 'toolbar-options');
  panel.id = 'toolbar-options';
  panel.hidden = true;

  const notifyCtl = renderNotifyControl();
  if (notifyCtl) panel.appendChild(notifyCtl);
  panel.appendChild(renderCalendarMenu());
  panel.appendChild(renderPicksLinkButton());

  // Right group: options disclosure + clear all.
  const actions = el('div', 'tb-group tb-actions');

  const optionsBtn = el('button', 'btn-ghost btn-options', '⚙ Options ▾');
  optionsBtn.setAttribute('aria-haspopup', 'true');
  optionsBtn.setAttribute('aria-expanded', 'false');
  optionsBtn.setAttribute('aria-controls', 'toolbar-options');
  optionsBtn.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    optionsBtn.setAttribute('aria-expanded', String(open));
    optionsBtn.textContent = open ? '⚙ Options ▴' : '⚙ Options ▾';
  });
  actions.appendChild(optionsBtn);

  const clear = el('button', 'btn-ghost', 'Clear all');
  clear.addEventListener('click', () => {
    if (selection.size() === 0) return;
    if (confirm('Remove all your picks?')) selection.clear();
  });
  actions.appendChild(clear);

  bar.appendChild(actions);

  wrap.appendChild(bar);
  wrap.appendChild(panel);
  return wrap;
}

/**
 * Everything that used to crowd the space under the day tabs — the "Only my
 * picks" filter, band search, Options, Clear all, the now/next live bar and the
 * clash / tight-crossing summary — folded into one panel that stays collapsed
 * by default. The header still shows live pick + clash counts, so nothing
 * urgent is lost while it's closed.
 */
function renderControls(): HTMLElement {
  const wrap = el('div', 'controls-wrap');

  const body = el('div', 'controls-body');
  body.id = 'controls-body';
  body.hidden = !controlsOpen;
  body.appendChild(renderToolbar());

  // Hosts re-filled by renderLiveBar() / renderContent(); they just live inside
  // the collapsible now instead of at the top of the page.
  const live = el('div', 'live-bar-wrap');
  live.id = 'live-bar';
  body.appendChild(live);

  const clash = el('div', 'clash-summary-wrap');
  clash.id = 'clash-summary';
  body.appendChild(clash);

  const toggle = el('button', 'controls-toggle');
  toggle.id = 'controls-toggle';
  toggle.setAttribute('aria-controls', 'controls-body');
  const paint = (): void => {
    toggle.setAttribute('aria-expanded', String(controlsOpen));
    toggle.innerHTML = '';
    toggle.appendChild(
      el('span', 'controls-toggle-label', 'Filters, picks & clashes'),
    );
    toggle.appendChild(
      el('span', 'controls-toggle-chevron', controlsOpen ? '▲' : '▼'),
    );
  };
  paint();
  toggle.addEventListener('click', () => {
    controlsOpen = !controlsOpen;
    body.hidden = !controlsOpen;
    paint();
  });

  wrap.appendChild(toggle);
  wrap.appendChild(body);
  return wrap;
}

/**
 * "📅 Calendar" button with a small Add / Remove menu. Add exports the current
 * picks with reminders; Remove cancels the events previously exported.
 */
function renderCalendarMenu(): HTMLElement {
  const wrap = el('div', 'cal-wrap');

  const btn = el('button', 'btn-ghost btn-calendar', '📅 Calendar ▾');
  btn.id = 'calendar-btn';
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');

  const menu = el('div', 'cal-menu');
  menu.hidden = true;

  const add = el('button', 'cal-menu-item', 'Add to calendar');
  add.title = 'Add your picks with a reminder before each set';
  add.addEventListener('click', () => {
    close();
    void handleCalendar('add');
  });

  const remove = el('button', 'cal-menu-item', 'Remove from calendar');
  remove.title = 'Cancel the festival events you previously added';
  remove.addEventListener('click', () => {
    close();
    void handleCalendar('remove');
  });

  menu.appendChild(add);
  menu.appendChild(remove);

  function close(): void {
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  }
  function open(): void {
    add.disabled = selection.size() === 0;
    remove.disabled = !hasExported();
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden ? open() : close();
  });
  document.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  wrap.appendChild(btn);
  wrap.appendChild(menu);
  return wrap;
}

/**
 * "Remind me" toggle plus a lead-time selector. Returns null on platforms
 * without the Notification API so the toolbar stays clean.
 */
function renderNotifyControl(): HTMLElement | null {
  if (!notify.notificationsSupported()) return null;

  const wrap = el('div', 'notify-ctl');

  const toggle = el('label', 'switch');
  toggle.title =
    'Get an in-app and native reminder before each picked set starts';
  const cb = el('input') as HTMLInputElement;
  cb.type = 'checkbox';
  cb.checked = notify.isEnabled();

  const lead = el('select', 'notify-lead') as HTMLSelectElement;
  lead.setAttribute('aria-label', 'Remind me this many minutes before a set');
  for (const min of notify.LEAD_OPTIONS) {
    const opt = el('option') as HTMLOptionElement;
    opt.value = String(min);
    opt.textContent = `${min} min before`;
    if (min === notify.leadMinutes()) opt.selected = true;
    lead.appendChild(opt);
  }
  lead.hidden = !cb.checked;
  lead.addEventListener('change', () => notify.setLeadMinutes(Number(lead.value)));

  cb.addEventListener('change', async () => {
    const wanted = cb.checked;
    const ok = await notify.setEnabled(wanted);
    cb.checked = ok;
    lead.hidden = !ok;
    if (wanted && !ok) {
      alert(
        notify.permission() === 'denied'
          ? 'Notifications are blocked for this site. Enable them in your browser settings to get set reminders.'
          : 'Could not enable notifications on this device.',
      );
    }
  });

  toggle.appendChild(cb);
  toggle.appendChild(el('span', 'switch-track'));
  toggle.appendChild(el('span', 'switch-label', '🔔 Remind me'));
  wrap.appendChild(toggle);
  wrap.appendChild(lead);
  return wrap;
}

/** Sticky bottom bar holding the primary share actions. */
function renderShareBar(): HTMLElement {
  const bar = el('div', 'share-bar');

  const map = el('button', 'btn-ghost btn-map', '🗺 Map');
  map.setAttribute('aria-label', 'Open the festival site map');
  map.addEventListener('click', () => openMap());
  bar.appendChild(map);

  const weather = el('button', 'btn-ghost btn-weather', '🌤 Weather');
  weather.setAttribute('aria-label', 'Open the festival weather forecast');
  weather.addEventListener('click', () => openWeather());
  bar.appendChild(weather);

  const shareApp = el('button', 'btn-ghost btn-share-app', '▦ Share app');
  shareApp.setAttribute('aria-label', 'Share this app with a QR code and link');
  shareApp.addEventListener('click', () => openShareApp());
  bar.appendChild(shareApp);

  const share = el('button', 'btn-ghost btn-share', '⤴ Share');
  share.id = 'share-btn';
  share.setAttribute('aria-label', 'Share your picks as an image');
  share.addEventListener('click', () => handleShare(share));
  bar.appendChild(share);

  return bar;
}

async function handleShare(btn: HTMLButtonElement): Promise<void> {
  if (selection.size() === 0 || btn.disabled) return;
  const original = btn.textContent;
  btn.disabled = true;
  btn.classList.add('busy');
  btn.textContent = 'Preparing…';
  try {
    const { outcome } = await shareSelection();
    if (outcome === 'downloaded') {
      btn.textContent = 'Saved image ✓';
    } else {
      btn.textContent = original;
    }
  } catch {
    btn.textContent = 'Share failed';
  } finally {
    setTimeout(() => {
      btn.disabled = selection.size() === 0;
      btn.classList.remove('busy');
      btn.textContent = original;
    }, 1600);
  }
}

async function handleCalendar(mode: 'add' | 'remove'): Promise<void> {
  const btn = document.getElementById('calendar-btn') as HTMLButtonElement | null;
  if (!btn) return;
  const original = btn.textContent;
  btn.disabled = true;
  try {
    const { outcome } = mode === 'add' ? await exportCalendar() : await clearCalendar();
    if (outcome === 'empty') {
      btn.textContent = mode === 'add' ? 'No picks yet' : 'Nothing to remove';
    } else if (outcome === 'downloaded') {
      btn.textContent = mode === 'add' ? 'Saved .ics ✓' : 'Saved remove ✓';
    } else {
      btn.textContent = mode === 'add' ? 'Added ✓' : 'Removed ✓';
    }
  } catch {
    btn.textContent = mode === 'add' ? 'Export failed' : 'Remove failed';
  } finally {
    setTimeout(() => {
      btn.textContent = original;
      btn.disabled = false;
    }, 1600);
  }
}

function refreshChrome(): void {
  document.querySelectorAll<HTMLButtonElement>('.day-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.day === activeDayId);
  });

  const shareBtn = document.getElementById('share-btn') as HTMLButtonElement | null;
  if (shareBtn && !shareBtn.classList.contains('busy')) {
    shareBtn.disabled = selection.size() === 0;
  }


  const stats = document.getElementById('header-stats');
  if (stats) {
    const picks = selection.size();
    const clashCount = findClashes(selectedSlots()).length;
    stats.innerHTML = '';
    const pickBadge = el('div', 'stat');
    pickBadge.appendChild(el('span', 'stat-num', String(picks)));
    pickBadge.appendChild(el('span', 'stat-label', picks === 1 ? 'pick' : 'picks'));
    stats.appendChild(pickBadge);

    const clashBadge = el('div', clashCount ? 'stat stat-clash' : 'stat');
    clashBadge.appendChild(el('span', 'stat-num', String(clashCount)));
    clashBadge.appendChild(
      el('span', 'stat-label', clashCount === 1 ? 'clash' : 'clashes'),
    );
    stats.appendChild(clashBadge);
  }
}

function renderContent(main: HTMLElement): void {
  main.innerHTML = '';
  const day = activeDay();
  const slots = buildSlots(day);

  const selected = selectedSlots();
  const clashing = clashingIds(selected);
  const tight = tightIds(selected);

  // The clash / tight-crossing summary now lives in the collapsible controls
  // panel rather than above the timeline.
  renderClashSummaryHost(day);
  main.appendChild(renderTimeline(slots, clashing, tight, day.date));
  const stats = renderStats();
  if (stats) main.appendChild(stats);
}

function renderClashSummaryHost(day: FestivalDay): void {
  const host = document.getElementById('clash-summary');
  if (!host) return;
  host.innerHTML = '';
  host.appendChild(renderClashSummary(day));
}

function clashBandLink(slot: SetSlot): HTMLAnchorElement {
  const a = el('a', 'clash-band', slot.band);
  a.style.setProperty('--c', slot.stage.color);
  a.href = slot.link;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

function renderClashSummary(day: FestivalDay): HTMLElement {
  const panel = el('section', 'clash-panel');
  const dayClashes = findClashes(selectedSlots()).filter(
    (c) => c.a.dayId === day.id && c.b.dayId === day.id,
  );

  if (selection.size() === 0) {
    panel.classList.add('hint');
    panel.appendChild(
      el(
        'p',
        'hint-text',
        'Tap a band to add it to your schedule. Overlapping picks are flagged as clashes.',
      ),
    );
    return panel;
  }

  const dayTight = findTightTransitions(selectedSlots()).filter(
    (t) => t.from.dayId === day.id,
  );

  if (dayClashes.length === 0) {
    panel.classList.add('ok');
    const head = el('div', 'clash-head');
    head.appendChild(el('span', 'clash-icon', '✓'));
    head.appendChild(el('p', 'clash-title', 'No clashes on this day. You’re all set.'));
    panel.appendChild(head);
    const tight = renderTightBlock(dayTight);
    if (tight) panel.appendChild(tight);
    return panel;
  }

  panel.classList.add('warn');
  const head = el('div', 'clash-head');
  head.appendChild(el('span', 'clash-icon', '⚠'));
  head.appendChild(
    el(
      'p',
      'clash-title',
      `${dayClashes.length} clash${dayClashes.length > 1 ? 'es' : ''} in your picks today`,
    ),
  );
  panel.appendChild(head);

  const list = el('ul', 'clash-list');
  for (const c of dayClashes) {
    const li = el('li', 'clash-item');
    const a = clashBandLink(c.a);
    const b = clashBandLink(c.b);
    li.appendChild(a);
    li.appendChild(el('span', 'clash-vs', 'vs'));
    li.appendChild(b);
    li.appendChild(el('span', 'clash-overlap', `${fmtDuration(c.minutes)} overlap`));
    list.appendChild(li);
  }
  panel.appendChild(list);
  const tight = renderTightBlock(dayTight);
  if (tight) panel.appendChild(tight);
  return panel;
}

/**
 * A "tight transitions" block: back-to-back picks on different stages where the
 * gap is too short to comfortably walk across. Amber, not ember — a heads-up,
 * a rung below a true clash. Returns null when there are none.
 */
function renderTightBlock(
  transitions: ReturnType<typeof findTightTransitions>,
): HTMLElement | null {
  if (transitions.length === 0) return null;
  const wrap = el('section', 'tight-block');

  const head = el('div', 'tight-head');
  head.appendChild(el('span', 'tight-icon', '🚶'));
  head.appendChild(
    el(
      'p',
      'tight-title',
      `${transitions.length} tight ${transitions.length > 1 ? 'crossings' : 'crossing'} between stages`,
    ),
  );
  wrap.appendChild(head);

  const list = el('ul', 'tight-list');
  for (const t of transitions) {
    const li = el('li', 'tight-item');
    li.appendChild(tightBandLabel(t.from));
    li.appendChild(el('span', 'tight-arrow', '→'));
    li.appendChild(tightBandLabel(t.to));
    const detail =
      t.slack < 0
        ? `only ${t.gap}m for a ${t.walk}m walk`
        : `${t.gap}m gap · ~${t.walk}m walk`;
    const note = el('span', t.slack < 0 ? 'tight-gap is-short' : 'tight-gap', detail);
    li.appendChild(note);
    list.appendChild(li);
  }
  wrap.appendChild(list);
  return wrap;
}

function tightBandLabel(slot: SetSlot): HTMLElement {
  const span = el('span', 'tight-band', slot.band);
  span.style.setProperty('--c', slot.stage.color);
  return span;
}

function renderTimeline(
  slots: SetSlot[],
  clashing: Set<string>,
  tight: Set<string>,
  dayDate: string,
): HTMLElement {
  const visible = onlyPicks ? slots.filter((s) => selection.has(s.id)) : slots;

  const wrap = el('div', 'timeline-wrap');

  if (visible.length === 0) {
    const empty = el('div', 'empty');
    empty.appendChild(el('p', 'empty-title', 'No picks on this day yet'));
    empty.appendChild(
      el('p', 'empty-sub', 'Turn off “Only my picks” to browse the full line-up.'),
    );
    wrap.appendChild(empty);
    return wrap;
  }

  const minStart = Math.min(...slots.map((s) => s.start));
  const maxEnd = Math.max(...slots.map((s) => s.end));
  // round to the hour
  const top = Math.floor(minStart / 60) * 60;
  const bottom = Math.ceil(maxEnd / 60) * 60;
  const totalMin = bottom - top;
  const height = totalMin * PX_PER_MIN;

  const grid = el('div', 'timeline');
  grid.style.height = `${height + HEADER_OFFSET}px`;

  // hour gridlines + axis labels
  const axis = el('div', 'time-axis');
  for (let m = top; m <= bottom; m += 60) {
    const y = (m - top) * PX_PER_MIN;
    const line = el('div', 'gridline');
    line.style.top = `${y}px`;
    grid.appendChild(line);

    const label = el('span', 'time-label', minutesToLabel(m));
    label.style.top = `${y}px`;
    axis.appendChild(label);
  }
  grid.appendChild(axis);

  // "You are here" marker: a horizontal rule at the current time, shown only
  // while now falls within this day's schedule window (so it appears on the
  // running day of the festival and nowhere else). positionNowLine() reads the
  // window bounds off the element and is also re-run on a timer.
  const nowLine = el('div', 'now-line');
  nowLine.id = 'now-line';
  nowLine.setAttribute('aria-hidden', 'true');
  nowLine.dataset.top = String(top);
  nowLine.dataset.bottom = String(bottom);
  nowLine.dataset.date = dayDate;
  nowLine.appendChild(el('span', 'now-line-label', 'NOW'));
  grid.appendChild(nowLine);
  positionNowLine(nowLine);

  // stage columns
  const cols = el('div', 'stage-cols');

  for (const stageKey of ['rugina', 'brasov', 'calmuc'] as const) {
    const col = el('div', 'stage-col');
    col.style.setProperty('--stage', stageColor(stageKey));
    const colSlots = visible.filter((s) => s.stage.id === stageKey);
    for (const slot of colSlots) {
      col.appendChild(renderSlot(slot, top, clashing, tight, dayDate));
    }
    cols.appendChild(col);
  }
  grid.appendChild(cols);

  // sticky stage header
  const header = el('div', 'stage-header');
  for (const stageKey of ['rugina', 'brasov', 'calmuc'] as const) {
    const h = el('div', 'stage-name');
    h.style.setProperty('--stage', stageColor(stageKey));
    h.textContent = stageShort(stageKey);
    header.appendChild(h);
  }

  wrap.appendChild(header);
  wrap.appendChild(grid);
  return wrap;
}

function renderSlot(
  slot: SetSlot,
  top: number,
  clashing: Set<string>,
  tight: Set<string>,
  dayDate: string,
): HTMLElement {
  const y = (slot.start - top) * PX_PER_MIN;
  const h = (slot.end - slot.start) * PX_PER_MIN;
  const node = el('button', 'set');
  node.dataset.slot = slot.id;
  node.style.top = `${y}px`;
  node.style.height = `${Math.max(h - 3, 22)}px`;
  node.style.setProperty('--stage', slot.stage.color);

  const picked = selection.has(slot.id);
  const isClash = picked && clashing.has(slot.id);
  const isTight = picked && !isClash && tight.has(slot.id);
  if (picked) node.classList.add('picked');
  if (isClash) node.classList.add('clashing');
  if (isTight) node.classList.add('tight');

  node.setAttribute(
    'aria-label',
    `${slot.band}, ${slot.startLabel} to ${slot.endLabel}, ${slot.stage.name}${
      slot.genre ? `, ${slot.genre}` : ''
    }${picked ? ', selected' : ''}${isClash ? ', clashes with another pick' : ''}${
      isTight ? ', tight walk from your previous pick' : ''
    }`,
  );
  node.setAttribute('aria-pressed', String(picked));

  const band = el('span', 'set-band', slot.band);
  node.appendChild(band);

  if (slot.genre) node.appendChild(el('span', 'set-genre', slot.genre));

  const timeRow = el('div', 'set-timerow');
  const time = el('span', 'set-time', `${slot.startLabel}–${slot.endLabel}`);
  timeRow.appendChild(time);

  // Forecast for the hours this set runs — one or more icons depending on how
  // long the set is and whether the sky changes across it, plus the peak rain
  // chance across the set.
  const wx = setWeatherIcons(dayDate, slot.start, slot.end);
  if (wx.icons.length || wx.precip != null) {
    const strip = el('span', 'set-weather');
    const labels = wx.icons.map((c) => c.label).join(', then ');
    // Show the amount when it's non-zero; when the set carries a rain chance but
    // no forecast accumulation, read "probably dry" rather than a bare "0 mm"
    // (the % is an ensemble spread, the mm a single deterministic run).
    const hasMm = wx.precipMm != null && wx.precipMm > 0;
    const dryish = wx.precipMm === 0 && wx.precip != null;
    const mmText = hasMm ? `${fmtMm(wx.precipMm!)} mm` : dryish ? 'probably dry' : '';
    const rainText = wx.precip != null ? `${Math.round(wx.precip)}% rain` : '';
    // Pair the chance with the amount in the tooltip: "40% rain · 3.2 mm".
    const rainDetail = [rainText, mmText].filter(Boolean).join(' · ');
    const aria = [labels, rainDetail].filter(Boolean).join(' · ');
    strip.setAttribute('aria-label', aria ? `Forecast: ${aria}` : 'Forecast');
    strip.title = [wx.icons.map((c) => c.label).join(' → '), rainDetail]
      .filter(Boolean)
      .join(' · ');
    for (const c of wx.icons) {
      const ic = el('span', 'set-wx-icon', c.icon);
      ic.setAttribute('aria-hidden', 'true');
      strip.appendChild(ic);
    }
    if (wx.precip != null) {
      const rain = el('span', 'set-wx-rain', `💧${Math.round(wx.precip)}%`);
      rain.setAttribute('aria-hidden', 'true');
      if (wx.precip >= 50) rain.classList.add('is-wet');
      strip.appendChild(rain);
    }
    if (hasMm) {
      const amount = el('span', 'set-wx-mm', `${fmtMm(wx.precipMm!)}mm`);
      amount.setAttribute('aria-hidden', 'true');
      strip.appendChild(amount);
    } else if (dryish) {
      const amount = el('span', 'set-wx-mm set-wx-dry', 'probably dry');
      amount.setAttribute('aria-hidden', 'true');
      strip.appendChild(amount);
    }
    timeRow.appendChild(strip);
  }
  node.appendChild(timeRow);

  if (isClash) node.appendChild(el('span', 'set-flag', '⚠'));
  else if (isTight) node.appendChild(el('span', 'set-flag walk', '🚶'));
  else if (picked) node.appendChild(el('span', 'set-flag check', '✓'));

  const actions = el('div', 'set-actions');

  const listen = el('a', 'set-pill set-listen');
  listen.appendChild(el('span', 'set-pill-icon', '▶'));
  listen.setAttribute('href', slot.listen);
  listen.setAttribute('target', '_blank');
  listen.setAttribute('rel', 'noopener noreferrer');
  listen.setAttribute('aria-label', `Listen to ${slot.band}`);
  listen.title = `Listen to ${slot.band}`;
  listen.addEventListener('click', (e) => e.stopPropagation());
  actions.appendChild(listen);

  const link = el('a', 'set-pill set-link');
  link.appendChild(el('span', 'set-link-label', 'Info'));
  link.appendChild(el('span', 'set-pill-icon', '↗'));
  link.setAttribute('href', slot.link);
  link.setAttribute('target', '_blank');
  link.setAttribute('rel', 'noopener noreferrer');
  link.setAttribute('aria-label', `Open ${slot.band} info`);
  link.addEventListener('click', (e) => e.stopPropagation());
  actions.appendChild(link);

  node.appendChild(actions);

  node.addEventListener('click', () => selection.toggle(slot.id));
  return node;
}

/* ---------- data-update banner ---------- */
function renderUpdateBanner(): void {
  const host = document.getElementById('update-banner');
  if (!host) return;
  host.innerHTML = '';

  const seen = loadSeenVersion();
  // First visit ever: quietly record the version, no banner.
  if (seen == null) {
    saveSeenVersion(DATA_VERSION);
    return;
  }
  if (seen === DATA_VERSION || bannerDismissed) return;

  const bar = el('div', 'update-banner');
  bar.setAttribute('role', 'status');
  bar.appendChild(el('span', 'update-banner-icon', '↻'));
  bar.appendChild(
    el(
      'span',
      'update-banner-text',
      'Running order updated — some set times may have changed. Double-check your picks.',
    ),
  );
  const dismiss = el('button', 'update-banner-close', '✕');
  dismiss.setAttribute('aria-label', 'Dismiss');
  dismiss.addEventListener('click', () => {
    bannerDismissed = true;
    saveSeenVersion(DATA_VERSION);
    renderUpdateBanner();
  });
  bar.appendChild(dismiss);
  host.appendChild(bar);
}

/* ---------- live wall clock ---------- */
function renderClock(): void {
  const host = document.getElementById('header-clock');
  if (!host) return;
  const now = new Date();
  const date = now.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const time = now.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  host.innerHTML = '';
  host.appendChild(el('span', 'clock-date', `${date} · `));
  host.appendChild(el('span', 'clock-time', time));
}

/**
 * Place (or hide) the "now" rule on the timeline. The current instant is
 * converted into the timeline's minutes-from-noon coordinate via the day's
 * festival noon; the line only shows while now sits inside this day's window,
 * which naturally limits it to the day currently running.
 */
function positionNowLine(line?: HTMLElement | null): void {
  const el0 = line ?? document.getElementById('now-line');
  if (!el0) return;
  const top = Number(el0.dataset.top);
  const bottom = Number(el0.dataset.bottom);
  const date = el0.dataset.date;
  if (!date || Number.isNaN(top) || Number.isNaN(bottom)) return;
  const noonMs = festivalInstant(date, '12:00').getTime();
  const nowMin = (Date.now() - noonMs) / 60_000;
  if (nowMin < top || nowMin > bottom) {
    el0.hidden = true;
    return;
  }
  el0.hidden = false;
  el0.style.top = `${(nowMin - top) * PX_PER_MIN}px`;
}

/* ---------- "now / next" live bar ---------- */
function renderLiveBar(): void {
  const host = document.getElementById('live-bar');
  if (!host) return;
  host.innerHTML = '';

  const state = computeLive(Date.now());
  if (state.phase === 'empty') return; // nothing picked — stay out of the way

  const bar = el('div', 'live-bar');
  bar.setAttribute('role', 'status');

  if (state.phase === 'pre' && state.toGatesMin != null) {
    bar.classList.add('is-pre');
    bar.appendChild(
      liveCell('Your festival starts', `in ${fmtCountdown(state.toGatesMin)}`, null),
    );
    host.appendChild(bar);
    return;
  }

  if (state.phase === 'post') {
    bar.classList.add('is-post');
    bar.appendChild(liveCell('That’s a wrap', 'no more picks tonight 🤘', null));
    host.appendChild(bar);
    return;
  }

  // live
  bar.classList.add('is-live');
  if (state.now) {
    const c = liveCell(
      'Now',
      `${state.now.slot.band} · ends ${fmtCountdown(state.now.endsInMin)}`,
      state.now.slot.stage.color,
    );
    c.classList.add('live-now');
    bar.appendChild(c);
  }
  if (state.next) {
    const c = liveCell(
      state.now ? 'Then' : 'Next',
      `${state.next.slot.band} · in ${fmtCountdown(state.next.startsInMin)}`,
      state.next.slot.stage.color,
    );
    bar.appendChild(c);
  }
  if (!state.now && !state.next) {
    bar.appendChild(liveCell('Standing by', 'nothing on right now', null));
  }
  host.appendChild(bar);
}

/* ---------- in-app reminder toasts ---------- */
/**
 * Show a dismissible in-app toast for an upcoming picked set. Complements the
 * native OS notification (which browsers routinely hide while the app is
 * focused). Tapping the toast jumps to the set on the timeline; it also
 * self-dismisses after a short while, and old toasts are capped so a burst of
 * back-to-back sets can't bury the screen.
 */
function showReminderToast(slot: SetSlot, lead: number): void {
  const host = document.getElementById('toast-host');
  if (!host) return;

  // Keep at most a few on screen — drop the oldest first.
  while (host.children.length >= 3) host.firstElementChild?.remove();

  const toast = el('div', 'toast');
  toast.setAttribute('role', 'status');
  toast.style.setProperty('--c', slot.stage.color);

  const dot = el('span', 'toast-dot');
  dot.setAttribute('aria-hidden', 'true');
  toast.appendChild(dot);

  const body = el('div', 'toast-body');
  const lead_ = Math.max(0, Math.round(lead));
  body.appendChild(
    el('span', 'toast-title', `${slot.band} ${lead_ > 0 ? `starts in ${lead_} min` : 'is starting'}`),
  );
  body.appendChild(
    el('span', 'toast-meta', `${slot.startLabel} · ${slot.stage.name}`),
  );
  toast.appendChild(body);

  const close = el('button', 'toast-close', '✕');
  close.setAttribute('aria-label', `Dismiss reminder for ${slot.band}`);

  let removed = false;
  const remove = (): void => {
    if (removed) return;
    removed = true;
    toast.classList.add('leaving');
    window.setTimeout(() => toast.remove(), 200);
  };

  close.addEventListener('click', (e) => {
    e.stopPropagation();
    remove();
  });
  toast.addEventListener('click', () => {
    remove();
    jumpToSlot(slot);
  });

  toast.appendChild(close);
  host.appendChild(toast);

  // Auto-dismiss after ~12s so it doesn't linger through the set itself.
  window.setTimeout(remove, 12_000);
}

function liveCell(label: string, value: string, color: string | null): HTMLElement {
  const cell = el('div', 'live-cell');
  const lab = el('span', 'live-label', label);
  if (color) lab.style.setProperty('--c', color);
  if (color) lab.classList.add('has-dot');
  cell.appendChild(lab);
  cell.appendChild(el('span', 'live-value', value));
  return cell;
}

/* ---------- "your festival" stats ---------- */
function renderStats(): HTMLElement | null {
  const s = computeStats();
  if (s.picks === 0) return null;

  const panel = el('section', 'stats-panel');

  const body = el('div', 'stats-body');
  body.id = 'stats-body';
  body.hidden = !statsOpen;

  const toggle = el('button', 'stats-toggle');
  toggle.id = 'stats-toggle';
  toggle.setAttribute('aria-controls', 'stats-body');
  const paint = (): void => {
    toggle.setAttribute('aria-expanded', String(statsOpen));
    toggle.innerHTML = '';
    toggle.appendChild(el('span', 'stats-title', 'Your festival'));
    toggle.appendChild(el('span', 'stats-toggle-chevron', statsOpen ? '▲' : '▼'));
  };
  paint();
  toggle.addEventListener('click', () => {
    statsOpen = !statsOpen;
    body.hidden = !statsOpen;
    paint();
  });
  panel.appendChild(toggle);

  const grid = el('div', 'stats-grid');
  const tile = (num: string, label: string): HTMLElement => {
    const t = el('div', 'stats-tile');
    t.appendChild(el('span', 'stats-num', num));
    t.appendChild(el('span', 'stats-tile-label', label));
    return t;
  };

  grid.appendChild(tile(String(s.picks), s.picks === 1 ? 'set' : 'sets'));
  const hours = Math.floor(s.onSiteMin / 60);
  const mins = s.onSiteMin % 60;
  grid.appendChild(tile(hours ? `${hours}h${mins ? ` ${mins}m` : ''}` : `${mins}m`, 'on site'));
  grid.appendChild(tile(String(s.daysActive), s.daysActive === 1 ? 'day' : 'days'));
  const clashTile = tile(String(s.clashes), s.clashes === 1 ? 'clash' : 'clashes');
  if (s.clashes) clashTile.classList.add('is-clash');
  grid.appendChild(clashTile);
  body.appendChild(grid);

  if (s.busiest) {
    const line = el(
      'p',
      'stats-note',
      `Busiest day: ${s.busiest.label} (${s.busiest.count} sets). Stage split — 🟢 ${s.perStage.rugina} · 🟣 ${s.perStage.brasov} · 🟠 ${s.perStage.calmuc}.`,
    );
    body.appendChild(line);
  }
  panel.appendChild(body);
  return panel;
}

/* ---------- band search ---------- */
function renderSearch(): HTMLElement {
  const wrap = el('div', 'search-wrap');

  const input = el('input', 'search-input') as HTMLInputElement;
  input.type = 'search';
  input.placeholder = '🔎 Find a band';
  input.setAttribute('aria-label', 'Find a band across all days');
  input.autocomplete = 'off';

  const results = el('div', 'search-results');
  results.hidden = true;

  const close = (): void => {
    results.hidden = true;
    results.innerHTML = '';
  };

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    results.innerHTML = '';
    if (q.length < 2) {
      results.hidden = true;
      return;
    }
    const matches = ALL_SLOTS.filter((s) => s.band.toLowerCase().includes(q)).slice(0, 8);
    if (matches.length === 0) {
      const none = el('div', 'search-none', 'No band matches');
      results.appendChild(none);
      results.hidden = false;
      return;
    }
    for (const slot of matches) {
      const item = el('button', 'search-item');
      item.type = 'button';
      const dayLabel = DAYS.find((d) => d.id === slot.dayId)?.label ?? '';
      const name = el('span', 'search-band', slot.band);
      name.style.setProperty('--c', slot.stage.color);
      item.appendChild(name);
      item.appendChild(
        el('span', 'search-meta', `${dayLabel} · ${slot.startLabel} · ${slot.stage.name}`),
      );
      item.addEventListener('click', () => {
        input.value = '';
        close();
        jumpToSlot(slot);
      });
      results.appendChild(item);
    }
    results.hidden = false;
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      close();
    }
  });
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target as Node)) close();
  });

  wrap.appendChild(input);
  wrap.appendChild(results);
  return wrap;
}

/** Switch to a set's day, then scroll it into view with a brief highlight. */
function jumpToSlot(slot: SetSlot): void {
  // "Only my picks" would hide an unpicked search hit — turn it off first.
  if (onlyPicks && !selection.has(slot.id)) {
    onlyPicks = false;
    const cb = document.querySelector<HTMLInputElement>('.toolbar .switch input');
    if (cb) cb.checked = false;
  }
  if (activeDayId !== slot.dayId) {
    activeDayId = slot.dayId;
    saveActiveDay(slot.dayId);
  }
  refreshChrome();
  renderContent(document.getElementById('content') as HTMLElement);
  requestAnimationFrame(() => {
    const node = document.querySelector<HTMLElement>(`.set[data-slot="${cssEscape(slot.id)}"]`);
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    node.classList.remove('flash');
    void node.offsetWidth; // restart the animation
    node.classList.add('flash');
    window.setTimeout(() => node.classList.remove('flash'), 1600);
  });
}

function cssEscape(s: string): string {
  const anyCss = window.CSS as unknown as { escape?: (v: string) => string };
  return anyCss?.escape ? anyCss.escape(s) : s.replace(/["\\]/g, '\\$&');
}

/* ---------- share picks as a link ---------- */
function renderPicksLinkButton(): HTMLElement {
  const btn = el('button', 'btn-ghost btn-picks-link', '🔗 Share picks link');
  btn.title = 'Copy a link that reopens your exact picks on another device';
  btn.addEventListener('click', async () => {
    if (selection.size() === 0) {
      const original = btn.textContent;
      btn.textContent = 'No picks yet';
      setTimeout(() => (btn.textContent = original), 1600);
      return;
    }
    const original = btn.textContent;
    btn.disabled = true;
    try {
      const { outcome } = await sharePicksLink();
      btn.textContent =
        outcome === 'copied'
          ? 'Link copied ✓'
          : outcome === 'shared'
            ? 'Shared ✓'
            : outcome === 'empty'
              ? 'No picks yet'
              : 'Copy failed';
    } catch {
      btn.textContent = 'Copy failed';
    } finally {
      setTimeout(() => {
        btn.textContent = original;
        btn.disabled = false;
      }, 1600);
    }
  });
  return btn;
}

function minutesToLabel(min: number): string {
  let total = min + 12 * 60; // undo noon anchor
  total = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function stageColor(key: 'rugina' | 'brasov' | 'calmuc'): string {
  return { rugina: '#7ec524', brasov: '#c026d3', calmuc: '#e2761b' }[key];
}

function stageShort(key: 'rugina' | 'brasov' | 'calmuc'): string {
  return { rugina: 'Adrian Rugină', brasov: 'Brașov', calmuc: 'Andrei Calmuc' }[key];
}
