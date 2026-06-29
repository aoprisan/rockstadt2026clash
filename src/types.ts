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
  /** minutes from a fixed noon anchor, monotonic across midnight */
  start: number;
  end: number;
}
