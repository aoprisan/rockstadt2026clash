import qrcode from 'qrcode-generator';
import { FESTIVAL } from './data';
import { decodePicks, encodeIds, encodePicks } from './picks-link';
import { addFriend, crewList, type Friend } from './crew';
import { selection } from './store';
import { exportDelays, importDelays, type DelayWire } from './delays';

/**
 * Crew beam: sync festival plans phone-to-phone with **zero network** — point a
 * camera at a QR code. A beam carries your name, your picks, *and every crew
 * plan you already collected*, so plans spread through a crew gossip-style:
 * scan one friend and you inherit everyone they've met. Server-based crew apps
 * go dark when the site's signal does; this needs nothing but eye contact.
 *
 * The payload is a `#c=…` token (base64url JSON of name + picks bitmask tokens)
 * so the exact same beam also works as a normal link over any messenger.
 */

const NAME_KEY = 'ref2026.beamName.v1';
const BEAM_VERSION = '1';

/* ---------- my name ---------- */

export function myName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveMyName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name.trim());
  } catch {
    /* ignore quota / private mode */
  }
}

/* ---------- encode / decode ---------- */

interface BeamMember {
  name: string;
  ids: string[];
}

export interface BeamPayload {
  /** The person beaming (becomes / updates a friend on the receiving side). */
  me: BeamMember;
  /** The crew plans they carry (relayed friends-of-friends). */
  crew: BeamMember[];
  /**
   * Running-order patches they carry. Unlike picks these aren't an opinion —
   * they're a claim about what the festival is actually doing — so they spread
   * to everyone a beam touches.
   */
  delays?: DelayWire;
}

/** Wire form: names + compact picks tokens, not raw id lists. */
interface BeamWire {
  v: number;
  me: { n: string; p: string };
  fr: { n: string; p: string }[];
  /** Running-order patches, omitted entirely when there are none. */
  dl?: DelayWire;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array | null {
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** The `#c=…` token for this device: my name + picks + every known crew plan. */
export function encodeBeam(): string {
  const wire: BeamWire = {
    v: 1,
    me: { n: myName(), p: encodePicks() },
    fr: crewList().map((f) => ({ n: f.name, p: encodeIds(f.ids) })),
  };
  const dl = exportDelays();
  if (dl) wire.dl = dl;
  const bytes = new TextEncoder().encode(JSON.stringify(wire));
  return BEAM_VERSION + toBase64Url(bytes);
}

export function buildBeamUrl(): string {
  return `${location.origin}${location.pathname}#c=${encodeBeam()}`;
}

export function decodeBeam(token: string): BeamPayload | null {
  if (!token || token[0] !== BEAM_VERSION) return null;
  const bytes = fromBase64Url(token.slice(1));
  if (!bytes) return null;
  try {
    const wire = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (!wire || typeof wire !== 'object') return null;
    const w = wire as BeamWire;
    const member = (m: { n?: unknown; p?: unknown }): BeamMember | null => {
      if (typeof m?.n !== 'string' || typeof m?.p !== 'string') return null;
      return { name: m.n.trim().slice(0, 24), ids: decodePicks(m.p) };
    };
    const me = member(w.me);
    if (!me) return null;
    const crew = Array.isArray(w.fr)
      ? w.fr.map(member).filter((m): m is BeamMember => m !== null)
      : [];
    // Older beams carry no patches at all; newer ones are validated on import.
    return { me, crew, delays: w.dl };
  } catch {
    return null;
  }
}

/* ---------- merging a received beam ---------- */

export interface BeamResult {
  /** Names newly added to the crew. */
  added: string[];
  /** Names that were already in the crew and got their plan refreshed. */
  updated: string[];
  /** Members skipped because they look like *you* (your plan stays yours). */
  skippedSelf: number;
  /** Running-order patches picked up from the beam. */
  patches: number;
}

/**
 * Fold a beam into the local crew: the sender becomes (or refreshes) a friend,
 * and every crew plan they relay is merged too. Entries whose name matches
 * yours are skipped — you already have the canonical copy of your own plan.
 */
export function applyBeam(beam: BeamPayload): BeamResult {
  const mine = myName().toLowerCase();
  const before = new Set(crewList().map((f) => f.name.toLowerCase()));
  const result: BeamResult = { added: [], updated: [], skippedSelf: 0, patches: 0 };

  const merge = (m: BeamMember): void => {
    if (!m.name || m.ids.length === 0) return;
    if (mine && m.name.toLowerCase() === mine) {
      result.skippedSelf++;
      return;
    }
    const existed = before.has(m.name.toLowerCase());
    addFriend(m.name, m.ids);
    (existed ? result.updated : result.added).push(m.name);
    before.add(m.name.toLowerCase());
  };

  merge(beam.me);
  for (const m of beam.crew) merge(m);
  result.patches = importDelays(beam.delays);
  return result;
}

/**
 * Whatever the user pasted or scanned — a beam URL, a plain picks link, or a
 * bare token — classified and decoded. Plain picks links still need a name
 * before they can join the crew, so they surface as their own kind.
 */
export type ScanParse =
  | { kind: 'beam'; beam: BeamPayload }
  | { kind: 'picks'; ids: string[] }
  | { kind: 'empty' }
  | { kind: 'invalid' };

/**
 * Links arrive mangled: messengers wrap them in `<>`, chat clients percent-encode
 * the `#`, and phone keyboards sprinkle in zero-width characters. Clean all of
 * that off before we decide a perfectly good beam is garbage.
 */
function normalizeInput(input: string): string {
  let s = input.replace(/[\u200b-\u200f\u2060\ufeff]/g, '').trim();
  s = s.replace(/^[<"'(\s]+/, '').replace(/[>"')\s.,]+$/, '');
  // A `#` that survived as %23 (common when a link rides through a chat app).
  if (!s.includes('#') && /%23/i.test(s)) {
    try {
      s = decodeURIComponent(s);
    } catch {
      /* leave it as-is */
    }
  }
  return s;
}

function decodeToken(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw; // a stray % in the token — treat it literally
  }
}

export function parseBeamInput(input: string): ScanParse {
  const trimmed = normalizeInput(input);
  if (!trimmed) return { kind: 'empty' };

  const beamMatch = trimmed.match(/[#&?]c=([^&\s]+)/);
  const beamToken = beamMatch ? decodeToken(beamMatch[1]) : trimmed;
  const beam = decodeBeam(beamToken);
  if (beam) return { kind: 'beam', beam };

  const picksMatch = trimmed.match(/[#&?]p=([^&\s]+)/);
  const picksToken = picksMatch ? decodeToken(picksMatch[1]) : trimmed;
  const ids = decodePicks(picksToken);
  if (ids.length > 0) return { kind: 'picks', ids };

  return { kind: 'invalid' };
}

/**
 * On load, import a crew beam from a `#c=…` link if present (the same beam the
 * QR carries, arriving over a messenger instead). Adds friends — never touches
 * your own picks — then strips the hash. Returns true if anything was merged.
 */
export function importBeamFromUrl(): boolean {
  const match = location.hash.match(/[#&]c=([^&]+)/);
  if (!match) return false;
  const clearHash = () =>
    history.replaceState(null, '', location.pathname + location.search);

  const beam = decodeBeam(decodeURIComponent(match[1]));
  if (!beam || !beam.me.name) {
    clearHash();
    return false;
  }

  const extra = beam.crew.filter((m) => m.ids.length > 0).length;
  const what =
    `Add ${beam.me.name}${extra > 0 ? ` (+${extra} crew plan${extra === 1 ? '' : 's'} they carry)` : ''} to your crew?`;
  if (!confirm(what)) {
    clearHash();
    return false;
  }

  applyBeam(beam);
  clearHash();
  return true;
}

/* ---------- barcode detection (not yet in TS's DOM lib) ---------- */

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

function barcodeDetector(): BarcodeDetectorLike | null {
  const ctor = (window as Window & { BarcodeDetector?: BarcodeDetectorCtor })
    .BarcodeDetector;
  if (!ctor) return null;
  try {
    return new ctor({ formats: ['qr_code'] });
  } catch {
    return null;
  }
}

/* ---------- dialog ---------- */

let dialog: HTMLDialogElement | null = null;
let stream: MediaStream | null = null;
let scanTimer: number | null = null;
/** Repaint the crew dialog behind us after a successful merge. */
let onMerged: (() => void) | null = null;

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

export function openBeam(mode: 'show' | 'scan', merged?: () => void): void {
  onMerged = merged ?? null;
  if (!dialog) dialog = buildDialog();
  repaint(mode);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function stopCamera(): void {
  if (scanTimer != null) {
    window.clearInterval(scanTimer);
    scanTimer = null;
  }
  if (stream) {
    for (const track of stream.getTracks()) track.stop();
    stream = null;
  }
}

function buildDialog(): HTMLDialogElement {
  const d = document.createElement('dialog');
  d.className = 'beam';
  d.setAttribute('aria-label', 'Crew beam — sync plans by QR');

  const card = el('div', 'beam-card');

  const head = el('div', 'beam-head');
  head.appendChild(el('h2', 'beam-title', '📡 Crew beam'));
  const close = el('button', 'beam-close', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close crew beam');
  close.addEventListener('click', () => d.close());
  head.appendChild(close);
  card.appendChild(head);

  const body = el('div', 'beam-body');
  body.id = 'beam-body';
  card.appendChild(body);

  d.appendChild(card);
  d.addEventListener('click', (e) => {
    if (e.target === d) d.close();
  });
  d.addEventListener('close', stopCamera);
  document.body.appendChild(d);
  return d;
}

function repaint(mode: 'show' | 'scan'): void {
  const body = dialog?.querySelector('#beam-body');
  if (!body) return;
  stopCamera();
  body.innerHTML = '';

  body.appendChild(
    el(
      'p',
      'beam-intro',
      'Sync plans with no signal at all: one phone shows a QR, the other scans it. A beam carries your picks and every crew plan you’ve already collected, so one scan can sync a whole crew.',
    ),
  );

  // Your beam name — the label your plan travels under on friends' phones.
  const nameRow = el('div', 'beam-name-row');
  const nameLabel = el('label', 'beam-name-label', 'Your name');
  const nameInput = el('input', 'crew-input beam-name') as HTMLInputElement;
  nameInput.placeholder = 'e.g. Alex';
  nameInput.maxLength = 24;
  nameInput.value = myName();
  nameInput.setAttribute('aria-label', 'Your name, shown on friends’ timelines');
  nameLabel.appendChild(nameInput);
  nameRow.appendChild(nameLabel);
  body.appendChild(nameRow);

  // Mode switch.
  const tabs = el('div', 'beam-tabs');
  const showTab = el('button', 'beam-tab', '▦ My QR');
  showTab.type = 'button';
  const scanTab = el('button', 'beam-tab', '📷 Scan');
  scanTab.type = 'button';
  (mode === 'show' ? showTab : scanTab).classList.add('active');
  showTab.addEventListener('click', () => repaint('show'));
  scanTab.addEventListener('click', () => repaint('scan'));
  tabs.appendChild(showTab);
  tabs.appendChild(scanTab);
  body.appendChild(tabs);

  const pane = el('div', 'beam-pane');
  body.appendChild(pane);

  if (mode === 'show') paintShow(pane, nameInput);
  else paintScan(pane, nameInput);

  nameInput.addEventListener('change', () => {
    saveMyName(nameInput.value);
    if (mode === 'show') repaint('show'); // the QR embeds the name — refresh it
  });
}

/* ---------- "My QR" pane ---------- */

function qrSvg(text: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
}

function paintShow(pane: HTMLElement, nameInput: HTMLInputElement): void {
  if (!myName()) {
    pane.appendChild(
      el('p', 'beam-nudge', 'Set your name above first — it’s the label your plan shows up under on your friends’ phones.'),
    );
    nameInput.focus();
    return;
  }
  if (selection.size() === 0 && crewList().length === 0) {
    pane.appendChild(
      el('p', 'beam-nudge', 'Nothing to beam yet — pick some sets on the timeline first.'),
    );
    return;
  }

  const url = buildBeamUrl();
  const qr = el('div', 'beam-qr');
  qr.innerHTML = qrSvg(url);
  pane.appendChild(qr);

  const carried = crewList().length;
  pane.appendChild(
    el(
      'p',
      'beam-carries',
      `Carries your ${selection.size()} pick${selection.size() === 1 ? '' : 's'}` +
        (carried > 0
          ? ` + ${carried} crew plan${carried === 1 ? '' : 's'} (${crewList()
              .map((f: Friend) => f.name)
              .join(', ')})`
          : '') +
        '. Friends scan it from Crew → 📡 Beam.',
    ),
  );

  const actions = el('div', 'beam-actions');
  const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
  if (typeof nav.share === 'function') {
    const share = el('button', 'beam-btn primary', '⤴ Share beam link');
    share.type = 'button';
    share.addEventListener('click', async () => {
      try {
        await nav.share!({
          title: `${FESTIVAL.name} 2026 crew beam`,
          text: `My ${FESTIVAL.name} 2026 plan (+crew) — open to add me to yours:`,
          url,
        });
      } catch {
        /* dismissed */
      }
    });
    actions.appendChild(share);
  }
  const copy = el('button', 'beam-btn', 'Copy beam link');
  copy.type = 'button';
  copy.addEventListener('click', async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      /* clipboard unavailable */
    }
    copy.textContent = ok ? 'Copied ✓' : 'Copy failed';
    setTimeout(() => (copy.textContent = 'Copy beam link'), 1600);
  });
  actions.appendChild(copy);
  pane.appendChild(actions);
}

/* ---------- "Scan" pane ---------- */

function describeResult(r: BeamResult): string {
  const bits: string[] = [];
  if (r.added.length) bits.push(`added ${r.added.join(', ')}`);
  if (r.updated.length) bits.push(`updated ${r.updated.join(', ')}`);
  if (r.patches) {
    bits.push(`picked up ${r.patches} running-order patch${r.patches === 1 ? '' : 'es'}`);
  }
  if (bits.length === 0) return 'Nothing new in that beam.';
  return `🤘 Crew synced — ${bits.join(' · ')}.`;
}

/**
 * Where the payload came from — only the wording differs, but "that code" is
 * nonsense when someone hit Add on an empty paste box.
 */
type PayloadSource = 'scan' | 'paste';

interface ScanUi {
  /** Live feedback for the attempt in progress. */
  status: HTMLElement;
  /** Sticky confirmation of what actually landed in the crew, kept on screen. */
  done: HTMLElement;
}

function fail(ui: ScanUi, message: string): false {
  ui.status.textContent = message;
  ui.status.classList.add('is-error');
  return false;
}

function succeed(ui: ScanUi, message: string): true {
  // The merge is the headline: park it on its own line so a later fat-fingered
  // paste can't leave the screen claiming nothing was added.
  ui.done.textContent = message;
  ui.status.textContent = '';
  ui.status.classList.remove('is-error');
  onMerged?.();
  return true;
}

function handlePayload(
  text: string,
  ui: ScanUi,
  fallbackName: () => string,
  source: PayloadSource = 'scan',
): boolean {
  const parsed = parseBeamInput(text);
  if (parsed.kind === 'empty') {
    return fail(
      ui,
      source === 'paste'
        ? 'Paste a beam or picks link first — the box above is empty.'
        : 'That QR code was empty.',
    );
  }
  if (parsed.kind === 'invalid') {
    return fail(
      ui,
      source === 'paste'
        ? 'That link isn’t a crew beam or picks link — copy the whole thing, including the part after the #.'
        : 'That code isn’t a crew beam or picks link — it needs to be a friend’s ▦ My QR.',
    );
  }
  ui.status.classList.remove('is-error');
  if (parsed.kind === 'beam') {
    if (!parsed.beam.me.name && parsed.beam.crew.length === 0) {
      return fail(ui, 'That beam was empty — the sender needs to pick some sets first.');
    }
    const result = applyBeam(parsed.beam);
    return succeed(ui, describeResult(result));
  }
  // A plain picks link has no name riding along — ask for one.
  const name = fallbackName();
  if (!name) {
    ui.status.textContent =
      'That’s a plain picks link — type the friend’s name below, then try again.';
    ui.status.classList.remove('is-error');
    return false;
  }
  addFriend(name, parsed.ids);
  return succeed(
    ui,
    `🤘 Added ${name} (${parsed.ids.length} pick${parsed.ids.length === 1 ? '' : 's'}).`,
  );
}

/** Keep autofill and iOS autocorrect out of fields holding tokens and names. */
function noAutofill(input: HTMLInputElement): void {
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('autocapitalize', 'off');
  input.setAttribute('data-1p-ignore', '');
}

function paintScan(pane: HTMLElement, _nameInput: HTMLInputElement): void {
  const done = el('p', 'beam-done');
  done.setAttribute('role', 'status');
  const status = el('p', 'beam-status');
  status.setAttribute('role', 'status');
  const ui: ScanUi = { status, done };

  const detector = barcodeDetector();
  const camHost = el('div', 'beam-cam-host');

  // Friend-name field, needed only when scanning a plain #p= picks link.
  const friendName = el('input', 'crew-input beam-friend-name') as HTMLInputElement;
  friendName.placeholder = 'Friend’s name (for plain picks links)';
  friendName.maxLength = 24;
  friendName.setAttribute('aria-label', 'Friend’s name, used when adding a plain picks link');
  noAutofill(friendName);
  friendName.setAttribute('autocapitalize', 'words');

  if (detector && navigator.mediaDevices?.getUserMedia) {
    const start = el('button', 'beam-btn primary beam-start', '📷 Start camera');
    start.type = 'button';
    start.addEventListener('click', async () => {
      start.disabled = true;
      status.textContent = 'Opening camera…';
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
      } catch {
        status.textContent =
          'Camera unavailable or permission denied — paste their beam link below instead.';
        status.classList.add('is-error');
        start.disabled = false;
        return;
      }
      const video = el('video', 'beam-video') as HTMLVideoElement;
      video.setAttribute('playsinline', '');
      video.muted = true;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      camHost.innerHTML = '';
      camHost.appendChild(video);
      status.textContent = 'Point at a friend’s crew QR…';

      // detect() outlives a 350ms tick, so ticks overlap. Without these guards a
      // late frame lands *after* a successful merge and overwrites the result
      // with "that isn't a crew beam" — the crew member is added, but the screen
      // says it failed.
      let busy = false;
      let merged = false;
      let lastMiss = '';

      scanTimer = window.setInterval(async () => {
        if (!stream || busy || merged) return;
        busy = true;
        try {
          const codes = await detector.detect(video);
          if (!stream || merged) return; // the camera was closed while we decoded
          const hit = codes.find((c) => c.rawValue);
          if (!hit) return;
          // Don't re-report the same unusable code every third of a second.
          const parsed = parseBeamInput(hit.rawValue);
          if (parsed.kind === 'invalid' || parsed.kind === 'empty') {
            if (hit.rawValue === lastMiss) return;
            lastMiss = hit.rawValue;
          }
          if (handlePayload(hit.rawValue, ui, () => friendName.value.trim())) {
            merged = true;
            stopCamera();
            camHost.innerHTML = '';
            const again = el('button', 'beam-btn', '📷 Scan another');
            again.type = 'button';
            again.addEventListener('click', () => repaint('scan'));
            camHost.appendChild(again);
            if (navigator.vibrate) navigator.vibrate(80);
          }
        } catch {
          /* a frame failed to decode — keep trying */
        } finally {
          busy = false;
        }
      }, 350);
    });
    camHost.appendChild(start);
  } else {
    camHost.appendChild(
      el(
        'p',
        'beam-nudge',
        'This browser can’t scan QR codes directly — paste the beam link below instead (any messenger will carry it).',
      ),
    );
  }

  pane.appendChild(camHost);
  pane.appendChild(done);
  pane.appendChild(status);

  // Paste fallback — works everywhere, including iOS Safari without detector.
  const form = el('form', 'beam-paste') as HTMLFormElement;
  const paste = el('input', 'crew-input beam-paste-input') as HTMLInputElement;
  paste.placeholder = '…or paste a beam / picks link';
  paste.setAttribute('aria-label', 'Paste a crew beam or picks link');
  noAutofill(paste);
  const go = el('button', 'beam-btn', 'Add') as HTMLButtonElement;
  go.type = 'submit';
  form.appendChild(paste);
  form.appendChild(friendName);
  form.appendChild(go);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (handlePayload(paste.value, ui, () => friendName.value.trim(), 'paste')) {
      paste.value = '';
    }
  });
  pane.appendChild(form);
}
