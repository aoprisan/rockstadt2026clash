import { FESTIVAL } from './data';

// Served from /public, resolved against the deploy base so it works on GitHub
// Pages (/rockstadt2026clash/) and in local dev alike.
const MAP_SRC = `${import.meta.env.BASE_URL}site-map.jpg`;

let dialog: HTMLDialogElement | null = null;

/** Open a full-screen, zoomable view of the festival site map. */
export function openMap(): void {
  if (!dialog) dialog = buildDialog();
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function buildDialog(): HTMLDialogElement {
  const d = document.createElement('dialog');
  d.className = 'site-map';
  d.setAttribute('aria-label', 'Festival site map');

  const card = document.createElement('div');
  card.className = 'site-map-card';

  const head = document.createElement('div');
  head.className = 'site-map-head';

  const title = document.createElement('h2');
  title.className = 'site-map-title';
  title.textContent = 'Site map';
  head.appendChild(title);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'site-map-close';
  close.setAttribute('aria-label', 'Close map');
  close.textContent = '✕';
  close.addEventListener('click', () => d.close());
  head.appendChild(close);

  card.appendChild(head);

  // Scrollable viewport: the image sits at its natural aspect ratio and can be
  // panned/pinch-zoomed on touch, or scrolled on desktop.
  const viewport = document.createElement('div');
  viewport.className = 'site-map-viewport';

  const img = document.createElement('img');
  img.className = 'site-map-img';
  img.src = MAP_SRC;
  img.alt = `${FESTIVAL.name} site map showing stages, entrances, bars, food areas and restrooms`;
  img.decoding = 'async';
  viewport.appendChild(img);

  card.appendChild(viewport);

  const hint = document.createElement('p');
  hint.className = 'site-map-hint';
  hint.textContent = 'Pinch or scroll to zoom.';
  card.appendChild(hint);

  d.appendChild(card);

  // Backdrop click closes the dialog.
  d.addEventListener('click', (e) => {
    if (e.target === d) d.close();
  });

  document.body.appendChild(d);
  return d;
}
