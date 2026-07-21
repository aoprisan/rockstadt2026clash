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

interface DailyForecast {
  date: string; // ISO yyyy-mm-dd
  code: number | null;
  tMax: number | null;
  tMin: number | null;
  precip: number | null; // max precipitation probability %
  wind: number | null; // max wind km/h
}

interface Cached {
  fetchedAt: number;
  days: DailyForecast[];
}

let dialog: HTMLDialogElement | null = null;

/** Open a panel with the 5-day festival weather forecast. */
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
  sub.textContent = FESTIVAL.location;
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
  const fresh = cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS;

  // Show cached data immediately if we have any; only show a spinner when we
  // have nothing at all to display.
  if (cached) renderDays(body, cached.days);
  else body.innerHTML = '<p class="weather-status">Loading forecast…</p>';

  if (fresh) {
    setNote(note, cached!.fetchedAt);
    return;
  }

  try {
    const days = await fetchForecast();
    writeCache({ fetchedAt: Date.now(), days });
    renderDays(body, days);
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

async function fetchForecast(): Promise<DailyForecast[]> {
  const params = new URLSearchParams({
    latitude: String(LAT),
    longitude: String(LON),
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max',
    timezone: TZ,
    start_date: firstDate(),
    end_date: lastDate(),
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

  return DAYS.map(
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
}

function renderDays(body: HTMLElement, days: DailyForecast[]): void {
  body.innerHTML = '';
  const list = document.createElement('ul');
  list.className = 'weather-list';

  DAYS.forEach((day) => {
    const f = days.find((d) => d.date === day.date);
    const li = document.createElement('li');
    li.className = 'weather-row';

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
    li.appendChild(when);

    const cond = describe(f?.code ?? null);
    const icon = document.createElement('span');
    icon.className = 'weather-icon';
    icon.textContent = cond.icon;
    icon.setAttribute('aria-hidden', 'true');
    li.appendChild(icon);

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
    li.appendChild(info);

    list.appendChild(li);
  });

  body.appendChild(list);
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

/** Map a WMO weather code to an emoji + short label. */
function describe(code: number | null): { icon: string; label: string } {
  if (code == null) return { icon: '❓', label: '—' };
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
