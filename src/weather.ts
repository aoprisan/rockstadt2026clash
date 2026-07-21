import { DAYS, FESTIVAL } from './data';

// Festival site: Ghimbav · Brașov, Romania.
const LAT = 45.66;
const LON = 25.51;
const TZ = 'Europe/Bucharest';

// Free, keyless, CORS-enabled forecast API.
const API = 'https://api.open-meteo.com/v1/forecast';

// Cache the last good forecast so the panel still shows something on the
// festival grounds with patchy signal (this is an offline-first PWA).
const CACHE_KEY = 'ref2026:weather';
const CACHE_TTL_MS = 60 * 60 * 1000; // an hour is plenty for a daily forecast

// Festival sets run from mid-afternoon well past midnight, so the "day" we
// care about weather-wise is 14:00 through 03:00 the following morning.
const HOUR_FROM = 14; // inclusive, on the day's date
const HOUR_TO = 27; // exclusive; 24–27 map to 00:00–02:00 the next morning

interface DailyForecast {
  date: string; // ISO yyyy-mm-dd
  code: number | null;
  tMax: number | null;
  tMin: number | null;
  precip: number | null; // max precipitation probability %
  wind: number | null; // max wind km/h
}

interface HourForecast {
  time: string; // ISO yyyy-mm-ddThh:00 (local festival time)
  code: number | null;
  temp: number | null; // °C
  precip: number | null; // precipitation probability %
  wind: number | null; // wind km/h
  isDay: boolean; // false during the hours after sunset, so clear skies show a moon
}

interface Cached {
  fetchedAt: number;
  days: DailyForecast[];
  hours: HourForecast[];
}

let dialog: HTMLDialogElement | null = null;
// The most recently rendered hourly data, keyed by ISO hour, so row toggles can
// build their strip lazily without re-fetching.
let hourIndex = new Map<string, HourForecast>();

// The timeline shows per-set weather icons, so it needs the hourly forecast in
// memory whether or not the weather dialog has ever been opened. We load it
// once (cache first, then a background refresh) and let interested views
// subscribe for a re-render when the data lands.
let ensurePromise: Promise<void> | null = null;
const forecastListeners = new Set<() => void>();

function notifyForecast(): void {
  forecastListeners.forEach((cb) => cb());
}

/** Be notified when hourly forecast data becomes (or changes to) available. */
export function subscribeForecast(cb: () => void): () => void {
  forecastListeners.add(cb);
  return () => forecastListeners.delete(cb);
}

/**
 * Make sure the hourly forecast is in memory. Shows cached data instantly and
 * refreshes from the network in the background. Safe to call repeatedly — the
 * work happens at most once per page load.
 */
export function ensureForecast(): Promise<void> {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    const cached = readCache();
    if (cached) {
      hourIndex = new Map(cached.hours.map((h) => [h.time, h]));
      notifyForecast();
      if (Date.now() - cached.fetchedAt < CACHE_TTL_MS) return;
    }
    try {
      const { days, hours } = await fetchForecast();
      writeCache({ fetchedAt: Date.now(), days, hours });
      hourIndex = new Map(hours.map((h) => [h.time, h]));
      notifyForecast();
    } catch {
      /* offline / API down — keep whatever the cache gave us (if anything) */
    }
  })();
  return ensurePromise;
}

export interface SetWeather {
  /**
   * One icon per festival hour the set touches, with consecutive identical
   * conditions collapsed: a short set within one hour shows a single icon,
   * while a longer set that runs through changing skies shows how the weather
   * shifts across it.
   */
  icons: { icon: string; label: string }[];
  /** Peak precipitation probability (%) across the set's hours, or null. */
  precip: number | null;
}

/**
 * Weather covering a single set's time span, given the day's ISO date and the
 * set's start/end in noon-anchored minutes (see schedule.toMinutes).
 *
 * Returns collapsed per-hour icons plus the peak rain chance over the set.
 * `icons` is empty until forecast data is available.
 */
export function setWeatherIcons(
  dayDate: string,
  startMin: number,
  endMin: number,
): SetWeather {
  if (hourIndex.size === 0) return { icons: [], precip: null };
  const out: { icon: string; label: string }[] = [];
  let precip: number | null = null;
  // Snap to the start of the hour the set begins in, then step hour by hour
  // until the set ends. Noon-anchored minute 720 is the following midnight, so
  // anything at or beyond it belongs to the next calendar day.
  const firstHour = Math.floor(startMin / 60) * 60;
  for (let m = firstHour; m < endMin; m += 60) {
    const realHour = (((Math.floor(m / 60) + 12) % 24) + 24) % 24;
    const onDate = m >= 720 ? addDays(dayDate, 1) : dayDate;
    const key = `${onDate}T${String(realHour).padStart(2, '0')}:00`;
    const h = hourIndex.get(key);
    if (!h) continue;
    if (h.precip != null) precip = Math.max(precip ?? 0, h.precip);
    if (h.code == null) continue;
    const cond = describe(h.code, h.isDay);
    const prev = out[out.length - 1];
    if (prev && prev.icon === cond.icon) continue; // collapse runs of same sky
    out.push(cond);
  }
  return { icons: out, precip };
}

/** Open a panel with the festival weather forecast (daily + hourly). */
export function openWeather(): void {
  if (!dialog) dialog = buildDialog();
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  void load();
}

function firstDate(): string {
  return DAYS[0].date;
}
function lastDate(): string {
  return DAYS[DAYS.length - 1].date;
}

/** Add whole days to an ISO date (yyyy-mm-dd), staying timezone-agnostic. */
function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** ISO keys + labels for the festival hours (14:00 → 02:00) of a given day. */
function hourKeys(date: string): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  for (let h = HOUR_FROM; h < HOUR_TO; h++) {
    const realHour = h % 24;
    const onDate = h < 24 ? date : addDays(date, 1);
    const hh = String(realHour).padStart(2, '0');
    out.push({ key: `${onDate}T${hh}:00`, label: `${hh}:00` });
  }
  return out;
}

function buildDialog(): HTMLDialogElement {
  const d = document.createElement('dialog');
  d.className = 'weather';
  d.setAttribute('aria-label', 'Festival weather forecast');

  const card = document.createElement('div');
  card.className = 'weather-card';

  const head = document.createElement('div');
  head.className = 'weather-head';

  const title = document.createElement('h2');
  title.className = 'weather-title';
  title.textContent = 'Weather';
  head.appendChild(title);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'weather-close';
  close.setAttribute('aria-label', 'Close weather');
  close.textContent = '✕';
  close.addEventListener('click', () => d.close());
  head.appendChild(close);

  card.appendChild(head);

  const sub = document.createElement('p');
  sub.className = 'weather-sub';
  sub.textContent = `${FESTIVAL.location} · tap a day for the hourly forecast`;
  card.appendChild(sub);

  const body = document.createElement('div');
  body.className = 'weather-body';
  body.id = 'weather-body';
  card.appendChild(body);

  const note = document.createElement('p');
  note.className = 'weather-note';
  note.id = 'weather-note';
  note.textContent = 'Forecast by Open-Meteo.';
  card.appendChild(note);

  d.appendChild(card);

  // Backdrop click closes the dialog.
  d.addEventListener('click', (e) => {
    if (e.target === d) d.close();
  });

  document.body.appendChild(d);
  return d;
}

async function load(): Promise<void> {
  const body = document.getElementById('weather-body');
  const note = document.getElementById('weather-note');
  if (!body) return;

  const cached = readCache();
  // Only skip the network when the cache is recent AND already carries hourly
  // data — a daily-only cache from an older build must be refreshed so the
  // hourly strips have something to show.
  const fresh =
    cached && cached.hours.length > 0 && Date.now() - cached.fetchedAt < CACHE_TTL_MS;

  // Show cached data immediately if we have any; only show a spinner when we
  // have nothing at all to display.
  if (cached) renderDays(body, cached.days, cached.hours);
  else body.innerHTML = '<p class="weather-status">Loading forecast…</p>';

  if (fresh) {
    setNote(note, cached!.fetchedAt);
    return;
  }

  try {
    const { days, hours } = await fetchForecast();
    writeCache({ fetchedAt: Date.now(), days, hours });
    renderDays(body, days, hours);
    setNote(note, Date.now());
  } catch {
    if (!cached) {
      body.innerHTML =
        '<p class="weather-status">Couldn’t load the forecast. Check your connection and try again.</p>';
      if (note) note.textContent = 'Forecast by Open-Meteo.';
    } else {
      // Keep the cached view, just flag that it may be stale.
      setNote(note, cached.fetchedAt, true);
    }
  }
}

async function fetchForecast(): Promise<{ days: DailyForecast[]; hours: HourForecast[] }> {
  const params = new URLSearchParams({
    latitude: String(LAT),
    longitude: String(LON),
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max',
    hourly: 'weather_code,temperature_2m,precipitation_probability,wind_speed_10m,is_day',
    timezone: TZ,
    start_date: firstDate(),
    // Sets on the final night spill past midnight, so pull one extra day of
    // hourly data to cover those small hours.
    end_date: addDays(lastDate(), 1),
  });

  const res = await fetch(`${API}?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as {
    daily?: {
      time?: string[];
      weather_code?: (number | null)[];
      temperature_2m_max?: (number | null)[];
      temperature_2m_min?: (number | null)[];
      precipitation_probability_max?: (number | null)[];
      wind_speed_10m_max?: (number | null)[];
    };
    hourly?: {
      time?: string[];
      weather_code?: (number | null)[];
      temperature_2m?: (number | null)[];
      precipitation_probability?: (number | null)[];
      wind_speed_10m?: (number | null)[];
      is_day?: (number | null)[];
    };
  };

  const daily = json.daily;
  const times = daily?.time ?? [];
  // Map by returned date so we can align to our festival days even if the API
  // clamps the range to its available forecast window.
  const byDate = new Map<string, DailyForecast>();
  times.forEach((date, i) => {
    byDate.set(date, {
      date,
      code: daily?.weather_code?.[i] ?? null,
      tMax: daily?.temperature_2m_max?.[i] ?? null,
      tMin: daily?.temperature_2m_min?.[i] ?? null,
      precip: daily?.precipitation_probability_max?.[i] ?? null,
      wind: daily?.wind_speed_10m_max?.[i] ?? null,
    });
  });

  const days = DAYS.map(
    (day) =>
      byDate.get(day.date) ?? {
        date: day.date,
        code: null,
        tMax: null,
        tMin: null,
        precip: null,
        wind: null,
      },
  );

  const h = json.hourly;
  const hTimes = h?.time ?? [];
  const hours: HourForecast[] = hTimes.map((time, i) => ({
    time,
    code: h?.weather_code?.[i] ?? null,
    temp: h?.temperature_2m?.[i] ?? null,
    precip: h?.precipitation_probability?.[i] ?? null,
    wind: h?.wind_speed_10m?.[i] ?? null,
    // API omits is_day on older caches; default to daytime so we never
    // show a moon over a genuinely sunny hour.
    isDay: (h?.is_day?.[i] ?? 1) !== 0,
  }));

  return { days, hours };
}

function renderDays(body: HTMLElement, days: DailyForecast[], hours: HourForecast[]): void {
  hourIndex = new Map(hours.map((h) => [h.time, h]));

  body.innerHTML = '';
  const list = document.createElement('ul');
  list.className = 'weather-list';

  DAYS.forEach((day) => {
    const f = days.find((d) => d.date === day.date);
    const item = document.createElement('li');
    item.className = 'weather-item';

    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'weather-row';
    row.setAttribute('aria-expanded', 'false');

    const when = document.createElement('div');
    when.className = 'weather-when';
    const lbl = document.createElement('span');
    lbl.className = 'weather-day';
    lbl.textContent = day.label;
    const dt = document.createElement('span');
    dt.className = 'weather-date';
    dt.textContent = new Date(day.date + 'T00:00:00').toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    when.appendChild(lbl);
    when.appendChild(dt);
    row.appendChild(when);

    const cond = describe(f?.code ?? null);
    const icon = document.createElement('span');
    icon.className = 'weather-icon';
    icon.textContent = cond.icon;
    icon.setAttribute('aria-hidden', 'true');
    row.appendChild(icon);

    const info = document.createElement('div');
    info.className = 'weather-info';
    const desc = document.createElement('span');
    desc.className = 'weather-desc';
    desc.textContent = cond.label;
    info.appendChild(desc);

    const meta = document.createElement('span');
    meta.className = 'weather-meta';
    if (hasTemp(f)) {
      meta.appendChild(chip(`${Math.round(f!.tMax!)}° / ${Math.round(f!.tMin!)}°`));
    }
    if (f?.precip != null) meta.appendChild(chip(`💧 ${Math.round(f.precip)}%`));
    if (f?.wind != null) meta.appendChild(chip(`💨 ${Math.round(f.wind)} km/h`));
    if (!hasTemp(f) && f?.precip == null && f?.wind == null) {
      meta.appendChild(chip('Forecast not available yet'));
    }
    info.appendChild(meta);
    row.appendChild(info);

    const chevron = document.createElement('span');
    chevron.className = 'weather-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '▸';
    row.appendChild(chevron);

    const hourly = document.createElement('div');
    hourly.className = 'weather-hours';
    hourly.hidden = true;

    row.addEventListener('click', () => {
      const open = row.getAttribute('aria-expanded') === 'true';
      row.setAttribute('aria-expanded', String(!open));
      hourly.hidden = open;
      if (!open && !hourly.dataset.built) {
        renderHours(hourly, day.date);
        hourly.dataset.built = '1';
      }
    });

    item.appendChild(row);
    item.appendChild(hourly);
    list.appendChild(item);
  });

  body.appendChild(list);
}

function renderHours(container: HTMLElement, date: string): void {
  const keys = hourKeys(date);
  const available = keys.filter(({ key }) => hourIndex.has(key));

  if (available.length === 0) {
    container.innerHTML =
      '<p class="weather-hours-empty">Hourly forecast not available yet.</p>';
    return;
  }

  const scroll = document.createElement('div');
  scroll.className = 'weather-hours-scroll';

  available.forEach(({ key, label }) => {
    const h = hourIndex.get(key)!;
    const cell = document.createElement('div');
    cell.className = 'weather-hour';

    const time = document.createElement('span');
    time.className = 'weather-hour-time';
    time.textContent = label;
    cell.appendChild(time);

    const cond = describe(h.code, h.isDay);
    const ic = document.createElement('span');
    ic.className = 'weather-hour-icon';
    ic.textContent = cond.icon;
    ic.setAttribute('aria-label', cond.label);
    ic.title = cond.label;
    cell.appendChild(ic);

    const temp = document.createElement('span');
    temp.className = 'weather-hour-temp';
    temp.textContent = h.temp != null ? `${Math.round(h.temp)}°` : '—';
    cell.appendChild(temp);

    const rain = document.createElement('span');
    rain.className = 'weather-hour-rain';
    if (h.precip != null) {
      rain.textContent = `💧${Math.round(h.precip)}%`;
      if (h.precip >= 50) rain.classList.add('is-wet');
    } else {
      rain.textContent = '';
    }
    cell.appendChild(rain);

    scroll.appendChild(cell);
  });

  container.innerHTML = '';
  container.appendChild(scroll);
}

function hasTemp(f: DailyForecast | undefined): boolean {
  return f != null && f.tMax != null && f.tMin != null;
}

function chip(text: string): HTMLElement {
  const s = document.createElement('span');
  s.className = 'weather-chip';
  s.textContent = text;
  return s;
}

function setNote(note: HTMLElement | null, when: number, stale = false): void {
  if (!note) return;
  const time = new Date(when).toLocaleString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    month: 'short',
  });
  note.textContent = stale
    ? `Offline — showing last forecast from ${time}. Source: Open-Meteo.`
    : `Updated ${time} · Source: Open-Meteo.`;
}

function readCache(): Cached | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    if (!Array.isArray(parsed.days)) return null;
    // Hourly data was added later; tolerate caches that predate it.
    if (!Array.isArray(parsed.hours)) parsed.hours = [];
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(c: Cached): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* storage full / disabled — non-fatal */
  }
}

/**
 * Map a WMO weather code to an emoji + short label. When `isDay` is false the
 * clear-sky icons switch to a moon so a set playing under a starry sky at 01:00
 * doesn't get a beaming sun.
 */
function describe(code: number | null, isDay = true): { icon: string; label: string } {
  if (code == null) return { icon: '❓', label: '—' };
  if (!isDay) {
    if (code === 0) return { icon: '🌙', label: 'Clear night' };
    if (code === 1) return { icon: '🌙', label: 'Mainly clear' };
    if (code === 2) return { icon: '☁️', label: 'Partly cloudy' };
  }
  const map: Record<number, { icon: string; label: string }> = {
    0: { icon: '☀️', label: 'Clear sky' },
    1: { icon: '🌤', label: 'Mainly clear' },
    2: { icon: '⛅', label: 'Partly cloudy' },
    3: { icon: '☁️', label: 'Overcast' },
    45: { icon: '🌫', label: 'Fog' },
    48: { icon: '🌫', label: 'Rime fog' },
    51: { icon: '🌦', label: 'Light drizzle' },
    53: { icon: '🌦', label: 'Drizzle' },
    55: { icon: '🌦', label: 'Heavy drizzle' },
    56: { icon: '🌧', label: 'Freezing drizzle' },
    57: { icon: '🌧', label: 'Freezing drizzle' },
    61: { icon: '🌧', label: 'Light rain' },
    63: { icon: '🌧', label: 'Rain' },
    65: { icon: '🌧', label: 'Heavy rain' },
    66: { icon: '🌧', label: 'Freezing rain' },
    67: { icon: '🌧', label: 'Freezing rain' },
    71: { icon: '🌨', label: 'Light snow' },
    73: { icon: '🌨', label: 'Snow' },
    75: { icon: '🌨', label: 'Heavy snow' },
    77: { icon: '🌨', label: 'Snow grains' },
    80: { icon: '🌦', label: 'Rain showers' },
    81: { icon: '🌦', label: 'Rain showers' },
    82: { icon: '⛈', label: 'Violent rain showers' },
    85: { icon: '🌨', label: 'Snow showers' },
    86: { icon: '🌨', label: 'Snow showers' },
    95: { icon: '⛈', label: 'Thunderstorm' },
    96: { icon: '⛈', label: 'Thunderstorm, hail' },
    99: { icon: '⛈', label: 'Thunderstorm, hail' },
  };
  return map[code] ?? { icon: '🌡', label: 'Unknown' };
}
