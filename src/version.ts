import { DATA_VERSION } from './data';
import { BUILD_COMMIT, buildAge, buildLabel } from './build-info';

/**
 * Version & updates.
 *
 * A PWA that works offline on a field is a PWA that can quietly serve you a
 * three-week-old running order. This panel is the answer to "am I on the current
 * one?": the build stamp baked into the bundle, the running-order version the
 * data carries, and two ways out — a normal check, and a force update that
 * throws away every cached file and re-fetches the app from scratch.
 *
 * Nothing here touches your data: picks, stars, crew, journal, patches and
 * reminders all live in `localStorage`, which neither path clears.
 */

/** Set by main.ts once the service worker registers, so we can report its state. */
let registration: ServiceWorkerRegistration | null = null;

export function noteRegistration(reg: ServiceWorkerRegistration | undefined): void {
  registration = reg ?? null;
  repaint();
}

let dialog: HTMLDialogElement | null = null;
let status: string | null = null;
let busy = false;
let armed = false; // force update asked once, waiting for confirmation

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

/** Open the version panel. */
export function openVersion(): void {
  if (!dialog) dialog = buildDialog();
  status = null;
  busy = false;
  armed = false;
  repaint();
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function buildDialog(): HTMLDialogElement {
  const d = document.createElement('dialog');
  d.className = 'version';
  d.setAttribute('aria-label', 'App version and updates');

  const card = el('div', 'version-card');

  const head = el('div', 'version-head');
  head.appendChild(el('h2', 'version-title', '⟳ Version'));
  const close = el('button', 'version-close', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close version panel');
  close.addEventListener('click', () => d.close());
  head.appendChild(close);
  card.appendChild(head);

  const body = el('div', 'version-body');
  body.id = 'version-body';
  card.appendChild(body);

  d.appendChild(card);
  d.addEventListener('click', (e) => {
    if (e.target === d) d.close();
  });

  document.body.appendChild(d);
  return d;
}

function repaint(): void {
  const body = dialog?.querySelector('#version-body');
  if (!body) return;
  body.innerHTML = '';

  const rows = el('dl', 'version-rows');
  addRow(rows, 'Built', buildLabel(), buildAge());
  addRow(rows, 'Commit', BUILD_COMMIT);
  addRow(rows, 'Running order', DATA_VERSION);
  addRow(rows, 'Offline copy', swLabel());
  body.appendChild(rows);

  const actions = el('div', 'version-actions');

  const check = el('button', 'version-btn', 'Check for update');
  check.type = 'button';
  check.disabled = busy;
  check.addEventListener('click', () => void checkForUpdate());
  actions.appendChild(check);

  const force = el(
    'button',
    `version-btn version-btn-force${armed ? ' armed' : ''}`,
    armed ? 'Tap again to reload' : '⟳ Force update',
  );
  force.type = 'button';
  force.disabled = busy;
  force.addEventListener('click', () => {
    // Two taps: this one throws away the offline copy and reloads the page, so
    // it shouldn't fire from a pocket.
    if (!armed) {
      armed = true;
      status = 'This clears every cached file and reloads. Your picks stay.';
      repaint();
      return;
    }
    void forceUpdate();
  });
  actions.appendChild(force);

  body.appendChild(actions);

  if (status) body.appendChild(el('p', 'version-status', status));

  body.appendChild(
    el(
      'p',
      'version-foot',
      'Picks, stars, crew, journal, running-order patches and reminders live on this device and survive both buttons — an update only replaces the app’s own files.',
    ),
  );
}

function addRow(
  list: HTMLElement,
  label: string,
  value: string,
  sub?: string,
): void {
  list.appendChild(el('dt', 'version-key', label));
  const dd = el('dd', 'version-val', value);
  if (sub) dd.appendChild(el('span', 'version-val-sub', sub));
  list.appendChild(dd);
}

function swLabel(): string {
  if (!('serviceWorker' in navigator)) return 'not supported by this browser';
  if (!registration) return 'not registered yet';
  if (registration.waiting) return 'a newer version is ready — reload to use it';
  if (registration.installing) return 'downloading a newer version…';
  if (registration.active) return 'cached and ready offline';
  return 'registering…';
}

/**
 * Ask the service worker to re-check the server. With `registerType: 'autoUpdate'`
 * a newer worker installs and takes over on its own, so the honest report here is
 * whether one was found — the reload follows by itself.
 */
async function checkForUpdate(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    status = 'This browser has no service worker, so there is nothing cached to refresh — just reload the page.';
    repaint();
    return;
  }
  busy = true;
  armed = false;
  status = 'Checking…';
  repaint();
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    if (regs.length === 0) {
      status = 'No offline copy registered yet — reload the page to install one.';
    } else {
      await Promise.all(regs.map((r) => r.update()));
      const pending = regs.some((r) => r.installing || r.waiting);
      status = pending
        ? 'A newer build is downloading — the app reloads itself as soon as it lands.'
        : `Already on the latest build (${buildLabel()}).`;
      registration = regs[0] ?? registration;
    }
  } catch {
    status = navigator.onLine
      ? 'Could not reach the server. Try again, or use Force update.'
      : 'You are offline — reconnect and check again.';
  } finally {
    busy = false;
    repaint();
  }
}

/**
 * The blunt instrument: unregister every worker, delete every cache, then reload
 * against a URL the HTTP cache has never seen. For when the app is stuck on an
 * old build and the polite check keeps saying it isn't.
 */
async function forceUpdate(): Promise<void> {
  busy = true;
  status = 'Clearing the offline copy…';
  repaint();
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* nothing to clear, or storage refused — reload anyway */
  }
  const url = new URL(window.location.href);
  url.searchParams.set('fresh', String(Date.now()));
  window.location.replace(url.toString());
}

/**
 * Drop the cache-busting `?fresh=` marker a force update leaves behind, so the
 * address bar (and any link the user copies afterwards) stays clean. The hash —
 * where shared picks and crew beams live — is untouched.
 */
export function stripFreshMarker(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('fresh')) return;
  url.searchParams.delete('fresh');
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}
