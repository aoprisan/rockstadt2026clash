import type { BandMeta } from './types';

/**
 * Descriptive metadata for the acts on the bill, keyed by exact band name.
 *
 * Kept as a side table (rather than inline in `data.ts`) so the running order
 * stays a clean transcription of the posters. Genres are only listed where
 * they're well established for the act; bands we're unsure about are simply
 * omitted and the UI degrades gracefully. Every band still gets a working
 * "listen" affordance via the Spotify-search fallback in `bandListen()`.
 */
export const BAND_META: Record<string, BandMeta> = {
  // ---- Day 1 ----
  'Heaven Shall Burn': { genre: 'Melodic death / metalcore' },
  Sabaton: { genre: 'Power metal' },
  'Black Label Society': { genre: 'Heavy metal' },
  'Marilyn Manson': { genre: 'Industrial rock' },
  Majestica: { genre: 'Symphonic power metal' },
  Alcest: { genre: 'Blackgaze' },
  'Death Angel': { genre: 'Thrash metal' },
  'Fu Manchu': { genre: 'Stoner rock' },
  Vended: { genre: 'Nu metal' },
  Creeper: { genre: 'Horror punk' },
  Groza: { genre: 'Melodic black metal' },
  Necrotted: { genre: 'Death metal' },
  'Implant pentru Refuz': { genre: 'Punk / hardcore' },

  // ---- Day 2 ----
  Elder: { genre: 'Stoner / prog rock' },
  'Bleed From Within': { genre: 'Metalcore' },
  Igorrr: { genre: 'Avant-garde metal' },
  Hatebreed: { genre: 'Metalcore / hardcore' },
  Godsmack: { genre: 'Alternative metal' },
  Gutalax: { genre: 'Goregrind' },
  'Orbit Culture': { genre: 'Melodic metal' },
  Nevermore: { genre: 'Progressive metal' },
  'In Flames': { genre: 'Melodic death metal' },
  'Employed To Serve': { genre: 'Metalcore / hardcore' },
  Tribulation: { genre: 'Gothic death metal' },
  Cryptopsy: { genre: 'Technical death metal' },
  Immolation: { genre: 'Death metal' },
  Deafheaven: { genre: 'Blackgaze' },
  Grave: { genre: 'Death metal' },

  // ---- Day 3 ----
  'Municipal Waste': { genre: 'Crossover thrash' },
  'In Extremo': { genre: 'Medieval folk metal' },
  'Arch Enemy': { genre: 'Melodic death metal' },
  'Lamb of God': { genre: 'Groove metal' },
  Vader: { genre: 'Death metal' },
  'Thy Art Is Murder': { genre: 'Deathcore' },
  Accept: { genre: 'Heavy metal' },
  'Slaughter To Prevail': { genre: 'Deathcore' },
  Annisokay: { genre: 'Metalcore' },
  'Novembers Doom': { genre: 'Death / doom metal' },
  'Animals As Leaders': { genre: 'Progressive / djent' },
  'The Ghost Inside': { genre: 'Metalcore' },
  Perturbator: { genre: 'Darksynth' },
  Candlemass: { genre: 'Doom metal' },
  Deicide: { genre: 'Death metal' },
  Allt: { genre: 'Melodic metalcore' },

  // ---- Day 4 ----
  'Fit For An Autopsy': { genre: 'Deathcore' },
  Trooper: { genre: 'Hard rock' },
  Helloween: { genre: 'Power metal' },
  Satyricon: { genre: 'Black metal' },
  Northlane: { genre: 'Metalcore / djent' },
  Airbourne: { genre: 'Hard rock' },
  Amorphis: { genre: 'Melodic death / prog metal' },
  'Slow Crush': { genre: 'Shoegaze' },
  Monolord: { genre: 'Doom / stoner' },
  Bucovina: { genre: 'Folk / black metal' },
  Malevolence: { genre: 'Metalcore / hardcore' },
  Coroner: { genre: 'Technical thrash' },
  'Wolves In The Throne Room': { genre: 'Atmospheric black metal' },
  'Raised By Owls': { genre: 'Deathcore / grind' },

  // ---- Day 5 ----
  Decapitated: { genre: 'Technical death metal' },
  Periphery: { genre: 'Progressive metal / djent' },
  Grandson: { genre: 'Alternative rock' },
  'The Prodigy': { genre: 'Electronic / big beat' },
  'Signs Of The Swarm': { genre: 'Deathcore' },
  Feuerschwanz: { genre: 'Medieval folk metal' },
  Carcass: { genre: 'Melodic death / grindcore' },
  'The Gathering': { genre: 'Atmospheric rock' },
  Soulfly: { genre: 'Groove metal' },
  Voivod: { genre: 'Progressive thrash' },
  Evergrey: { genre: 'Progressive metal' },
  Insomnium: { genre: 'Melodic death metal' },
  Psychonaut: { genre: 'Post-metal' },
};

/** Genre label for a band, if we have one. */
export function bandGenre(band: string): string | undefined {
  return BAND_META[band]?.genre;
}

/**
 * A "listen" link for a band: the curated one if present, otherwise a Spotify
 * search — a real, working URL for every act without inventing specific IDs.
 */
export function bandListen(band: string): string {
  const curated = BAND_META[band]?.listen;
  if (curated) return curated;
  return `https://open.spotify.com/search/${encodeURIComponent(band)}`;
}
