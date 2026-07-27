export type StageId = 'rugina' | 'brasov' | 'calmuc';

export interface Stage {
  id: StageId;
  name: string;
  color: string;
}

export interface RawSet {
  band: string;
  /** "HH:MM" 24h. Times before ~08:00 are treated as after midnight. */
  start: string;
  end: string;
  /** Official website or social media URL. Falls back to a web search. */
  link?: string;
}

/** Optional per-band descriptive metadata, keyed by band name in band-meta.ts. */
export interface BandMeta {
  /** Short genre label, e.g. "Thrash metal". */
  genre?: string;
  /** A "listen" URL (Spotify/YouTube/Bandcamp). Falls back to a Spotify search. */
  listen?: string;
}

/**
 * The most recent live set we have a documented song list for, keyed by band
 * name in setlists.ts. It is a record of one specific gig, not a prediction:
 * the date and venue are part of the data precisely so the reader can judge how
 * stale it is.
 */
export interface LastSetlist {
  /** ISO date of the gig, when known. Omitted if we could only pin the event. */
  date?: string;
  /** Festival or tour-stop name, e.g. "Hellfest 2026". */
  event?: string;
  /** Venue, e.g. "Val de Moine (Altar Stage)". */
  venue?: string;
  /** City and ISO country code, e.g. "Clisson, FR". */
  city?: string;
  /** Songs in the order played. Encores are not distinguished. */
  songs: string[];
  /** Where the song list came from, so any entry can be checked. */
  source: string;
}

export interface FestivalDay {
  id: string;
  label: string;
  date: string; // ISO date of the day the bulk of sets start
  /** sets keyed by stage id */
  sets: Record<StageId, RawSet[]>;
}

export interface SetSlot {
  id: string;
  band: string;
  stage: Stage;
  dayId: string;
  startLabel: string;
  endLabel: string;
  /** Official website / social link, or a web-search fallback. */
  link: string;
  /** A "listen" URL — curated or a Spotify search fallback (always present). */
  listen: string;
  /** Short genre label, when known. */
  genre?: string;
  /** minutes from a fixed noon anchor, monotonic across midnight */
  start: number;
  end: number;
  /** Absolute instant the set starts, in real (UTC) time. */
  startAt: Date;
  /** Absolute instant the set ends, in real (UTC) time. */
  endAt: Date;
  /** Minutes this set has been shifted by a running-order patch (0 = on time). */
  shift: number;
  /** True when the set has been marked as not happening at all. */
  cancelled: boolean;
}
