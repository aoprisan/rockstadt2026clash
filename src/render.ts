import { DAYS, FESTIVAL } from './data';
import type { FestivalDay, SetSlot } from './types';
import {
  buildSlots,
  clashingIds,
  findClashes,
  fmtDuration,
  getSlot,
} from './schedule';
import { selection, loadActiveDay, saveActiveDay } from './store';
import { shareSelection } from './share';
import { openShareApp } from './share-app';
import { openMap } from './map';
import { openWeather } from './weather';
import { exportCalendar, clearCalendar, hasExported } from './calendar';
import * as notify from './notify';

const PX_PER_MIN = 1.7;
const HEADER_OFFSET = 0;

let activeDayId = loadActiveDay(DAYS[0].id);
let onlyPicks = false;

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
  root.appendChild(renderToolbar());

  const main = el('main', 'content');
  main.id = 'content';
  root.appendChild(main);

  root.appendChild(renderShareBar());

  selection.subscribe(() => {
    renderContent(main);
    refreshChrome();
  });

  renderContent(main);
  refreshChrome();
}

function renderHeader(): HTMLElement {
  const header = el('header', 'app-header');
  const title = el('div', 'brand');
  title.appendChild(el('h1', 'brand-name', FESTIVAL.name));
  const sub = el('p', 'brand-sub');
  sub.textContent = `${FESTIVAL.edition} · ${FESTIVAL.dates} · ${FESTIVAL.location}`;
  title.appendChild(sub);
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

  bar.appendChild(toggles);

  // Collapsible panel: secondary reminder + calendar controls live here so
  // they no longer crowd the top of the screen.
  const panel = el('div', 'toolbar-options');
  panel.id = 'toolbar-options';
  panel.hidden = true;

  const notifyCtl = renderNotifyControl();
  if (notifyCtl) panel.appendChild(notifyCtl);
  panel.appendChild(renderCalendarMenu());

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
  toggle.title = 'Get a reminder before each picked set starts';
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

  const clashing = clashingIds(selectedSlots());

  main.appendChild(renderClashSummary(day));
  main.appendChild(renderTimeline(slots, clashing));
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

  if (dayClashes.length === 0) {
    panel.classList.add('ok');
    panel.appendChild(el('span', 'clash-icon', '✓'));
    panel.appendChild(el('p', 'clash-title', 'No clashes on this day. You’re all set.'));
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
    panel.appendChild(li);
    list.appendChild(li);
  }
  panel.appendChild(list);
  return panel;
}

function renderTimeline(slots: SetSlot[], clashing: Set<string>): HTMLElement {
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

  // stage columns
  const cols = el('div', 'stage-cols');

  for (const stageKey of ['rugina', 'brasov', 'calmuc'] as const) {
    const col = el('div', 'stage-col');
    col.style.setProperty('--stage', stageColor(stageKey));
    const colSlots = visible.filter((s) => s.stage.id === stageKey);
    for (const slot of colSlots) {
      col.appendChild(renderSlot(slot, top, clashing));
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

function renderSlot(slot: SetSlot, top: number, clashing: Set<string>): HTMLElement {
  const y = (slot.start - top) * PX_PER_MIN;
  const h = (slot.end - slot.start) * PX_PER_MIN;
  const node = el('button', 'set');
  node.style.top = `${y}px`;
  node.style.height = `${Math.max(h - 3, 22)}px`;
  node.style.setProperty('--stage', slot.stage.color);

  const picked = selection.has(slot.id);
  const isClash = picked && clashing.has(slot.id);
  if (picked) node.classList.add('picked');
  if (isClash) node.classList.add('clashing');

  node.setAttribute(
    'aria-label',
    `${slot.band}, ${slot.startLabel} to ${slot.endLabel}, ${slot.stage.name}${
      picked ? ', selected' : ''
    }${isClash ? ', clashes with another pick' : ''}`,
  );
  node.setAttribute('aria-pressed', String(picked));

  const band = el('span', 'set-band', slot.band);
  node.appendChild(band);
  const time = el('span', 'set-time', `${slot.startLabel}–${slot.endLabel}`);
  node.appendChild(time);

  if (isClash) node.appendChild(el('span', 'set-flag', '⚠'));
  else if (picked) node.appendChild(el('span', 'set-flag check', '✓'));

  const link = el('a', 'set-link');
  link.appendChild(el('span', 'set-link-label', 'Info'));
  link.appendChild(el('span', 'set-link-icon', '↗'));
  link.setAttribute('href', slot.link);
  link.setAttribute('target', '_blank');
  link.setAttribute('rel', 'noopener noreferrer');
  link.setAttribute('aria-label', `Open ${slot.band} info`);
  link.addEventListener('click', (e) => e.stopPropagation());
  node.appendChild(link);

  node.addEventListener('click', () => selection.toggle(slot.id));
  return node;
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
