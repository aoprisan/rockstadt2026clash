import { DAYS } from './data';

/**
 * Sets that changed stage since this device last opened the app.
 *
 * A slot id is `dayId::stage::band`, so a band moved to another stage gets a
 * brand new id — and every id stored against the old one (your pick, your star,
 * last night's rating, a friend's overlay, a nudge you logged at the barrier)
 * points at a set that no longer exists. Left alone that reads as data loss:
 * the pick you made weeks ago is simply gone, and the same set sits unpicked
 * two stages over.
 *
 * So before anything reads storage, every stored id whose band still plays that
 * day — just somewhere else — is rewritten to the id it has now. The mapping is
 * derived from the running order rather than hardcoded, so the next move needs
 * no code. A band dropped from the bill entirely has no new id and is left
 * alone: `cancelled` sets stay in the grid, and a genuinely orphaned id is
 * already ignored everywhere.
 *
 * This runs as an import side effect, and `main.ts` imports it first, because
 * `store.ts`, `journal.ts` and `crew.ts` all read `localStorage` while they are
 * being evaluated — a call from `main.ts`'s body would be far too late. For the
 * same reason nothing here imports those modules, or `schedule.ts` (which reads
 * the delay patches as it builds slots): the id format below is the one
 * `slotId()` in `schedule.ts` builds, kept in step by hand.
 */

/** Every stored value that can contain a slot id. */
const STORAGE_KEYS = [
  'ref2026.selection.v1', // picks
  'ref2026.stars.v1', // must-sees
  'ref2026.crew.v1', // friends' plans, as { name, color, ids }
  'ref2026.journal.ratings.v1',
  'ref2026.journal.skips.v1',
  'ref2026.journal.notes.v1',
  'ref2026.duels.v1', // keyed by a sorted `a~~b` pair of slot ids
  'ref2026.delays.v1', // per-set nudges and cancellations
  'ref2026.cal.exported.v1',
  'ref2026.notify.fired.v1',
];

const PICKS_KEY = 'ref2026.selection.v1';

/** Slot ids in the running order as it stands now. */
const live = new Set<string>();
/** `dayId::band` -> the id that band's set has now, wherever it plays. */
const byBand = new Map<string, string>();

for (const day of DAYS) {
  for (const [stage, sets] of Object.entries(day.sets)) {
    for (const raw of sets) {
      const id = `${day.id}::${stage}::${raw.band}`;
      live.add(id);
      byBand.set(`${day.id}::${raw.band}`, id);
    }
  }
}

/** The new ids of picks that moved, so the update banner can name them. */
const movedPickIds = new Set<string>();

/** Where a stored id lives now, or null if it is fine (or truly gone). */
function rewriteId(id: string): string | null {
  if (live.has(id)) return null;
  const parts = id.split('::');
  if (parts.length !== 3) return null; // not a slot id (e.g. a `day::stage` key)
  const now = byBand.get(`${parts[0]}::${parts[2]}`);
  return now && now !== id ? now : null;
}

/** A stored string: a slot id, or the `a~~b` key a clash duel is filed under. */
function rewriteString(s: string): string | null {
  if (!s.includes('~~')) return rewriteId(s);
  const halves = s.split('~~');
  if (halves.length !== 2) return null;
  const moved = halves.map((half) => rewriteId(half) ?? half);
  if (moved[0] === halves[0] && moved[1] === halves[1]) return null;
  return moved.sort().join('~~'); // duel keys are stored sorted
}

/** Rewrite ids anywhere in a stored value — in arrays, in values, in keys. */
function rewriteValue(value: unknown): unknown {
  if (typeof value === 'string') return rewriteString(value) ?? value;
  if (Array.isArray(value)) return value.map(rewriteValue);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      out[rewriteString(key) ?? key] = rewriteValue(inner);
    }
    return out;
  }
  return value;
}

function remapKey(key: string): void {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return; // private mode: nothing stored, nothing to move
  }
  if (!raw) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return; // corrupted; the owning module will discard it on load
  }

  const next = JSON.stringify(rewriteValue(parsed));
  if (next === raw) return;

  if (key === PICKS_KEY) {
    const before = new Set(Array.isArray(parsed) ? parsed : []);
    for (const id of JSON.parse(next) as unknown[]) {
      if (typeof id === 'string' && !before.has(id)) movedPickIds.add(id);
    }
  }

  try {
    localStorage.setItem(key, next);
  } catch {
    /* quota / private mode: the ids stay orphaned, nothing is lost */
  }
}

STORAGE_KEYS.forEach(remapKey);

/**
 * Picks that were carried over to a new stage on this launch. The update banner
 * names them, so a move is something you are told about rather than something
 * you notice at 18:25 in front of the wrong stage.
 */
export function movedPicks(): Set<string> {
  return movedPickIds;
}
