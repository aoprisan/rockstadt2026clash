import qrcode from 'qrcode-generator';
import { FESTIVAL } from './data';
import { SHARE_URL } from './share';

/** Build a crisp, scalable SVG QR code for the given text. */
function qrSvg(text: string): string {
  // Type 0 = auto-size; 'M' error correction tolerates a little smudging.
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  // `scalable` strips the fixed width/height so CSS can size it freely.
  return qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
}

let dialog: HTMLDialogElement | null = null;

/** Open a dialog with a QR code and link-sharing actions for the app itself. */
export function openShareApp(): void {
  if (!dialog) dialog = buildDialog();
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function buildDialog(): HTMLDialogElement {
  const d = document.createElement('dialog');
  d.className = 'share-app';
  d.setAttribute('aria-label', 'Share this app');

  const card = document.createElement('div');
  card.className = 'share-app-card';

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'share-app-close';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '✕';
  close.addEventListener('click', () => d.close());
  card.appendChild(close);

  const title = document.createElement('h2');
  title.className = 'share-app-title';
  title.textContent = 'Share the clashfinder';
  card.appendChild(title);

  const sub = document.createElement('p');
  sub.className = 'share-app-sub';
  sub.textContent = `Scan to open the ${FESTIVAL.name} 2026 clashfinder on another phone.`;
  card.appendChild(sub);

  const qr = document.createElement('div');
  qr.className = 'share-app-qr';
  qr.innerHTML = qrSvg(SHARE_URL);
  card.appendChild(qr);

  const link = document.createElement('p');
  link.className = 'share-app-link';
  link.textContent = SHARE_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');
  card.appendChild(link);

  const actions = document.createElement('div');
  actions.className = 'share-app-actions';

  const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
  if (typeof nav.share === 'function') {
    const shareBtn = document.createElement('button');
    shareBtn.type = 'button';
    shareBtn.className = 'share-app-btn primary';
    shareBtn.textContent = '⤴ Share link';
    shareBtn.addEventListener('click', async () => {
      try {
        await nav.share!({
          title: `${FESTIVAL.name} 2026 Clashfinder`,
          text: `Plan your ${FESTIVAL.name} 2026 — clashfinder:`,
          url: SHARE_URL,
        });
      } catch {
        /* user dismissed the share sheet — nothing to do */
      }
    });
    actions.appendChild(shareBtn);
  }

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'share-app-btn';
  copyBtn.textContent = 'Copy link';
  copyBtn.addEventListener('click', async () => {
    const ok = await copyLink(SHARE_URL);
    copyBtn.textContent = ok ? 'Copied ✓' : 'Copy failed';
    setTimeout(() => (copyBtn.textContent = 'Copy link'), 1600);
  });
  actions.appendChild(copyBtn);

  card.appendChild(actions);
  d.appendChild(card);

  // Backdrop click closes the dialog.
  d.addEventListener('click', (e) => {
    if (e.target === d) d.close();
  });

  document.body.appendChild(d);
  return d;
}

async function copyLink(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy copy */
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
