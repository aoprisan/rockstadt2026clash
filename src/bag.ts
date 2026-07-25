import { DAYS } from './data';
import { minutesToLabel } from './schedule';
import { ensureForecast, hasForecast, hourFor, subscribeForecast } from './weather';

/**
 * The gate list: what the festival lets through the bag check and what it turns
 * away, straight from the official allowed / prohibited posters.
 *
 * The lists themselves are fixed, but the panel is not a poster: the forecast
 * decides which lines are shouting at you today. A 70 per cent afternoon on day
 * three promotes the raincoat (and makes the umbrella ban worth reading twice);
 * UV 8 promotes the sunscreen. Allowed items tick off as you pack them and the
 * ticks persist, so the list survives being closed on the way out the door.
 */

const PACKED_KEY = 'ref2026.bag.v1';

/** On-site window used for the forecast scan: 14:00 through 02:00, noon-anchored. */
const ON_SITE_FROM = 120;
const ON_SITE_TO = 840;
/** "Cold" only counts from 21:00 on — an extra layer is a night problem. */
const NIGHT_FROM = 540;

/** Thresholds shared with the stamina model's read of the same forecast. */
const WET_PROB = 40; // % chance before an hour counts as wet
const HIGH_UV = 6; // burn territory
const HOT_FEELS = 30; // °C apparent temperature
const COLD_TEMP = 14; // °C — the small hours on a field in the Carpathians

interface DayPeak {
  label: string;
  value: number;
  /** Wall-clock label of the hour the peak lands in. */
  at: string;
}

interface GateWeather {
  hasData: boolean;
  /** Wettest day on the grounds, if any hour crosses WET_PROB. */
  wettest: (DayPeak & { mm: number }) | null;
  /** Peak UV across the festival, if it ever reaches HIGH_UV. */
  uv: DayPeak | null;
  /** Peak apparent temperature, if it ever reaches HOT_FEELS. */
  heat: DayPeak | null;
  /** Coldest hour on the grounds, if it ever drops below COLD_TEMP. */
  cold: DayPeak | null;
}

const NO_WEATHER: GateWeather = {
  hasData: false,
  wettest: null,
  uv: null,
  heat: null,
  cold: null,
};

interface BagItem {
  id: string;
  /** Verbatim from the festival's poster. */
  label: string;
  /** Why it matters, independent of the forecast. */
  note: string;
  /** Forecast-driven line, shown as a highlighted chip when it fires. */
  live?: (w: GateWeather) => string | null;
}

const ALLOWED: BagItem[] = [
  {
    id: 'bag',
    label: 'Small backpack or bag',
    note: 'One small bag each, opened at the gate. The less there is to search, the shorter your queue.',
    live: (w) =>
      w.cold
        ? `Leave room for a layer: ${Math.round(w.cold.value)}° on ${w.cold.label} around ${w.cold.at}, and the last sets run past that.`
        : null,
  },
  {
    id: 'sunscreen',
    label: 'Sunscreen',
    note: 'Gates open in full afternoon sun and there is very little shade between the stages.',
    live: (w) =>
      w.uv
        ? `UV ${Math.round(w.uv.value)} on ${w.uv.label} around ${w.uv.at} — that burns in under half an hour, and you still have the rest of the week to stand through.`
        : null,
  },
  {
    id: 'sunglasses',
    label: 'Sunglasses',
    note: 'The early sets play into the sun; you will be squinting from the barrier otherwise.',
    live: (w) =>
      w.heat
        ? `Feels like ${Math.round(w.heat.value)}° on ${w.heat.label} around ${w.heat.at}.`
        : null,
  },
  {
    id: 'powerbank',
    label: 'Power bank',
    note: 'This app, your reminders, your tickets and your meet-ups all run off the same battery, from doors to the last bus.',
  },
  {
    id: 'raincoat',
    label: 'Raincoat',
    note: 'Umbrellas are turned away at the gate, so a coat or poncho is the only cover you get.',
    live: (w) =>
      w.wettest
        ? `${w.wettest.label} is the wet one: ${Math.round(w.wettest.value)}% around ${w.wettest.at}${w.wettest.mm >= 1 ? `, about ${Math.round(w.wettest.mm)} mm on the day` : ''}.`
        : null,
  },
  {
    id: 'smokes',
    label: 'Pack of cigarettes and lighter',
    note: 'Both make it through the bag check.',
  },
];

const PROHIBITED: BagItem[] = [
  {
    id: 'substances',
    label: 'Illegal substances & alcohol',
    note: 'Everything you drink comes from the bars inside the gate.',
  },
  {
    id: 'weapons',
    label: 'Weapons or sharp objects',
    note: 'Pocket knives and multi-tools included — leave them in the car rather than lose them at the search.',
  },
  {
    id: 'food',
    label: 'Outside food and drinks',
    note: 'Food areas, bars and taps are all on the site map.',
  },
  {
    id: 'laser',
    label: 'Laser pointer',
    note: 'Stage crews stop shows over them.',
  },
  {
    id: 'camera',
    label: 'Professional cameras, including DSLRs',
    note: 'Your phone is the camera that gets in without a photo pass.',
  },
  {
    id: 'umbrella',
    label: 'Umbrellas',
    note: 'Refused even in the rain — which is exactly why the raincoat is on the other list.',
    live: (w) =>
      w.wettest
        ? `With ${Math.round(w.wettest.value)}% rain on ${w.wettest.label}, this is the one that catches people out.`
        : null,
  },
];

let dialog: HTMLDialogElement | null = null;
let packed = loadPacked();

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

/** Open the gate list: allowed items to pack, prohibited items to leave home. */
export function openBag(): void {
  if (!dialog) dialog = buildDialog();
  repaint();
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  // The live lines come from the same hourly forecast the timeline uses.
  void ensureForecast();
}

function buildDialog(): HTMLDialogElement {
  const d = document.createElement('dialog');
  d.className = 'bag';
  d.setAttribute('aria-label', 'What to bring through the gate');

  const card = el('div', 'bag-card');

  const head = el('div', 'bag-head');
  head.appendChild(el('h2', 'bag-title', '🎒 Bag'));
  const close = el('button', 'bag-close', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close bag list');
  close.addEventListener('click', () => d.close());
  head.appendChild(close);
  card.appendChild(head);

  card.appendChild(
    el(
      'p',
      'bag-sub',
      'What gets through the bag check and what gets turned away — the festival’s own lists, with the forecast for your five days folded in.',
    ),
  );

  const body = el('div', 'bag-body');
  body.id = 'bag-body';
  card.appendChild(body);

  d.appendChild(card);
  d.addEventListener('click', (e) => {
    if (e.target === d) d.close();
  });

  // The forecast can land (or refresh) while the panel is open.
  subscribeForecast(() => {
    if (d.open) repaint();
  });

  document.body.appendChild(d);
  return d;
}

function repaint(): void {
  const body = dialog?.querySelector('#bag-body');
  if (!body) return;
  body.innerHTML = '';

  const weather = readWeather();

  body.appendChild(renderProgress());
  body.appendChild(renderSection('Pack this', 'allow', ALLOWED, weather, true));
  body.appendChild(
    renderSection('Leave at home', 'deny', PROHIBITED, weather, false),
  );

  if (!weather.hasData) {
    body.appendChild(
      el(
        'p',
        'bag-foot',
        'No forecast on this device yet — open the weather panel once with signal and the rain, sun and UV notes fill themselves in here.',
      ),
    );
  }

  body.appendChild(
    el(
      'p',
      'bag-foot',
      'Lists as published by the festival. Security has the final word at the gate, so pack for the search, not for the argument.',
    ),
  );
}

function renderProgress(): HTMLElement {
  const wrap = el('div', 'bag-progress');

  const done = ALLOWED.filter((i) => packed.has(i.id)).length;
  const pct = Math.round((done / ALLOWED.length) * 100);

  const label = el(
    'p',
    'bag-progress-label',
    done === ALLOWED.length
      ? `Bag packed — all ${ALLOWED.length} on board.`
      : `${done} of ${ALLOWED.length} packed.`,
  );
  wrap.appendChild(label);

  const track = el('div', 'bag-progress-track');
  const fill = el('div', 'bag-progress-fill');
  fill.style.width = `${pct}%`;
  track.appendChild(fill);
  wrap.appendChild(track);

  if (done > 0) {
    const reset = el('button', 'bag-reset', 'Clear ticks');
    reset.type = 'button';
    reset.addEventListener('click', () => {
      packed = new Set();
      persist();
      repaint();
    });
    wrap.appendChild(reset);
  }

  return wrap;
}

function renderSection(
  title: string,
  tone: 'allow' | 'deny',
  items: BagItem[],
  weather: GateWeather,
  checkable: boolean,
): HTMLElement {
  const section = el('section', `bag-section bag-${tone}`);
  section.appendChild(el('h3', 'bag-section-title', title));

  const list = el('ul', 'bag-list');
  for (const item of items) {
    const live = item.live?.(weather) ?? null;
    const li = el('li', `bag-item${live ? ' live' : ''}`);

    const row = checkable
      ? (el('button', 'bag-row') as HTMLElement)
      : el('div', 'bag-row');
    if (checkable) {
      const btn = row as HTMLButtonElement;
      btn.type = 'button';
      const on = packed.has(item.id);
      btn.setAttribute('aria-pressed', String(on));
      btn.addEventListener('click', () => {
        if (packed.has(item.id)) packed.delete(item.id);
        else packed.add(item.id);
        persist();
        repaint();
      });
      row.appendChild(el('span', 'bag-tick', on ? '✓' : ''));
      if (on) li.classList.add('packed');
    } else {
      row.appendChild(el('span', 'bag-tick bag-tick-deny', '✕'));
    }

    const text = el('div', 'bag-text');
    text.appendChild(el('span', 'bag-label', item.label));
    text.appendChild(el('span', 'bag-note', item.note));
    if (live) text.appendChild(el('span', 'bag-live', live));
    row.appendChild(text);

    li.appendChild(row);
    list.appendChild(li);
  }
  section.appendChild(list);
  return section;
}

/* ---------- forecast ---------- */

/**
 * Scan every festival day's on-site hours once and keep only the extremes the
 * lists have something to say about: the wettest day, the worst UV, the hottest
 * hour and the coldest. Everything is per-hour data from the same cached
 * Open-Meteo pull the timeline and the stamina model use.
 */
function readWeather(): GateWeather {
  if (!hasForecast()) return { ...NO_WEATHER };

  const out: GateWeather = { ...NO_WEATHER, hasData: false };
  for (const day of DAYS) {
    const label = dayLabel(day.label, day.date);
    let dayMm = 0;
    let dayWet: DayPeak | null = null;

    for (let block = ON_SITE_FROM; block < ON_SITE_TO; block += 60) {
      const h = hourFor(day.date, block);
      if (!h) continue;
      out.hasData = true;
      const at = minutesToLabel(block);

      if (h.precipMm != null) dayMm += h.precipMm;
      if (h.precip != null && h.precip >= WET_PROB) {
        if (!dayWet || h.precip > dayWet.value) {
          dayWet = { label, value: h.precip, at };
        }
      }
      if (h.uv != null && h.uv >= HIGH_UV && (!out.uv || h.uv > out.uv.value)) {
        out.uv = { label, value: h.uv, at };
      }
      const feels = h.feels ?? h.temp;
      if (
        feels != null &&
        feels >= HOT_FEELS &&
        (!out.heat || feels > out.heat.value)
      ) {
        out.heat = { label, value: feels, at };
      }
      if (
        block >= NIGHT_FROM &&
        h.temp != null &&
        h.temp <= COLD_TEMP &&
        (!out.cold || h.temp < out.cold.value)
      ) {
        out.cold = { label, value: h.temp, at };
      }
    }

    if (dayWet && (!out.wettest || dayWet.value > out.wettest.value)) {
      out.wettest = { ...dayWet, mm: dayMm };
    }
  }

  return out.hasData ? out : { ...NO_WEATHER };
}

function dayLabel(label: string, date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return `${label} · ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
}

/* ---------- persistence ---------- */

function loadPacked(): Set<string> {
  try {
    const raw = localStorage.getItem(PACKED_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

function persist(): void {
  try {
    localStorage.setItem(PACKED_KEY, JSON.stringify([...packed]));
  } catch {
    /* ignore quota / private mode */
  }
}
