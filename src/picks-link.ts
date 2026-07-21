import { ALL_SLOTS } from './schedule';
import { selection } from './store';
import { FESTIVAL } from './data';

/**
 * Encode the current picks into a short, shareable link so a friend can open
 * your exact line-up (or compare theirs against it). Fully client-side: the
 * selection rides in the URL hash as a base64url bitmask over the stable slot
 * order, no backend and nothing to store.
 */

const VERSION = '1';
const slotIndex = new Map(ALL_SLOTS.map((s, i) => [s.id, i]));

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

/** A `#p=…` token capturing the current selection. */
export function encodePicks(): string {
  const bytes = new Uint8Array(Math.ceil(ALL_SLOTS.length / 8));
  for (const id of selection.ids()) {
    const idx = slotIndex.get(id);
    if (idx == null) continue;
    bytes[idx >> 3] |= 1 << (idx & 7);
  }
  return VERSION + toBase64Url(bytes);
}

/** Decode a `#p=…` token back into slot ids (empty if malformed/mismatched). */
export function decodePicks(token: string): string[] {
  if (!token || token[0] !== VERSION) return [];
  const bytes = fromBase64Url(token.slice(1));
  if (!bytes) return [];
  const ids: string[] = [];
  for (let i = 0; i < ALL_SLOTS.length; i++) {
    if (bytes[i >> 3] & (1 << (i & 7))) ids.push(ALL_SLOTS[i].id);
  }
  return ids;
}

/** The absolute URL that reproduces the current picks on another device. */
export function buildPicksUrl(): string {
  return `${location.origin}${location.pathname}#p=${encodePicks()}`;
}

export interface PicksShareResult {
  outcome: 'shared' | 'copied' | 'failed' | 'empty';
}

async function copy(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
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

/** Offer the picks link via the native share sheet, else copy to clipboard. */
export async function sharePicksLink(): Promise<PicksShareResult> {
  if (selection.size() === 0) return { outcome: 'empty' };
  const url = buildPicksUrl();

  const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
  if (typeof nav.share === 'function') {
    try {
      await nav.share({
        title: `My ${FESTIVAL.name} 2026 picks`,
        text: `My picks for ${FESTIVAL.name} 2026 — open them in the clashfinder:`,
        url,
      });
      return { outcome: 'shared' };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { outcome: 'shared' };
      }
      /* fall through to clipboard */
    }
  }

  return { outcome: (await copy(url)) ? 'copied' : 'failed' };
}

/**
 * On load, import picks from a `#p=…` link if present. Replaces the current
 * selection (confirming first if the user already had picks), then strips the
 * hash so a refresh doesn't re-import. Returns true if picks were imported.
 */
export function importPicksFromUrl(): boolean {
  const hash = location.hash;
  const match = hash.match(/[#&]p=([^&]+)/);
  if (!match) return false;

  const ids = decodePicks(decodeURIComponent(match[1]));
  const clearHash = () =>
    history.replaceState(null, '', location.pathname + location.search);

  if (ids.length === 0) {
    clearHash();
    return false;
  }

  const had = selection.size();
  if (had > 0 && !confirm('Load the shared picks? This replaces your current selection.')) {
    clearHash();
    return false;
  }

  selection.replaceAll(ids);
  clearHash();
  return true;
}
