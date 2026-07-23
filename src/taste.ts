import type { SetSlot } from './types';
import { ALL_SLOTS } from './schedule';

/**
 * A tiny TF-IDF genre-affinity model built from the user's picks. Shared by the
 * day planner (free-gap suggestions) and the clash duels (head-to-head taste
 * comparison). Entirely client-side and cheap enough to recompute on demand.
 */

export interface Suggestion {
  slot: SetSlot;
  /** Taste-affinity score (0 = no genre signal). */
  score: number;
  /** The genre words that matched your picks, best first. */
  matched: string[];
}

export function genreTokens(genre: string | undefined): string[] {
  if (!genre) return [];
  return [...new Set(genre.toLowerCase().split(/[\s/·,+-]+/).filter((t) => t.length > 2))];
}

/**
 * Inverse document frequency of each genre word across the whole bill, so
 * near-universal words ("metal") count for far less than distinctive ones
 * ("doom", "grind", "synth").
 */
const GENRE_IDF: Map<string, number> = (() => {
  const bandGenres = new Map<string, string | undefined>();
  for (const s of ALL_SLOTS) if (!bandGenres.has(s.band)) bandGenres.set(s.band, s.genre);
  const df = new Map<string, number>();
  let docs = 0;
  for (const genre of bandGenres.values()) {
    const tokens = genreTokens(genre);
    if (tokens.length === 0) continue;
    docs++;
    for (const t of tokens) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const idf = new Map<string, number>();
  for (const [t, n] of df) idf.set(t, Math.log(1 + docs / n));
  return idf;
})();

/** Sum of idf weights per genre word across the user's picked bands. */
export function tasteProfile(picks: SetSlot[]): Map<string, number> {
  const profile = new Map<string, number>();
  const seen = new Set<string>();
  for (const s of picks) {
    if (seen.has(s.band)) continue;
    seen.add(s.band);
    for (const t of genreTokens(s.genre)) {
      profile.set(t, (profile.get(t) ?? 0) + (GENRE_IDF.get(t) ?? 0));
    }
  }
  return profile;
}

export function scoreAgainst(profile: Map<string, number>, slot: SetSlot): Suggestion {
  const contributions: Array<[string, number]> = [];
  for (const t of genreTokens(slot.genre)) {
    const w = profile.get(t);
    if (w) contributions.push([t, w]);
  }
  contributions.sort((a, b) => b[1] - a[1]);
  return {
    slot,
    score: contributions.reduce((sum, [, w]) => sum + w, 0),
    matched: contributions.map(([t]) => t),
  };
}
