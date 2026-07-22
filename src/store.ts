const KEY = 'ref2026.selection.v1';
const STAR_KEY = 'ref2026.stars.v1';
const DAY_KEY = 'ref2026.activeDay.v1';
const SEEN_VERSION_KEY = 'ref2026.dataVersion.v1';

type Listener = () => void;

class SelectionStore {
  private selected: Set<string>;
  /** "Must-see" tier: a subset of `selected` the user has starred. */
  private starred: Set<string>;
  private listeners = new Set<Listener>();

  constructor() {
    this.selected = new Set(load(KEY));
    // Stars only make sense on picked sets; prune any strays from old data.
    this.starred = new Set(load(STAR_KEY).filter((id) => this.selected.has(id)));
  }

  has(id: string): boolean {
    return this.selected.has(id);
  }

  ids(): string[] {
    return [...this.selected];
  }

  size(): number {
    return this.selected.size;
  }

  isStarred(id: string): boolean {
    return this.starred.has(id);
  }

  starredIds(): string[] {
    return [...this.starred];
  }

  toggle(id: string): void {
    if (this.selected.has(id)) {
      this.selected.delete(id);
      this.starred.delete(id); // un-picking clears the star too
    } else {
      this.selected.add(id);
    }
    this.persist();
  }

  /** Flip the "must-see" star on a picked set (no-op on unpicked ids). */
  toggleStar(id: string): void {
    if (!this.selected.has(id)) return;
    if (this.starred.has(id)) this.starred.delete(id);
    else this.starred.add(id);
    this.persist();
  }

  clear(): void {
    this.selected.clear();
    this.starred.clear();
    this.persist();
  }

  /** Replace the entire selection at once (used when importing a shared link). */
  replaceAll(ids: string[]): void {
    this.selected = new Set(ids);
    this.starred = new Set([...this.starred].filter((id) => this.selected.has(id)));
    this.persist();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private persist(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify([...this.selected]));
      localStorage.setItem(STAR_KEY, JSON.stringify([...this.starred]));
    } catch {
      /* ignore quota / private mode */
    }
    this.listeners.forEach((fn) => fn());
  }
}

function load(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export const selection = new SelectionStore();

export function loadActiveDay(fallback: string): string {
  try {
    return localStorage.getItem(DAY_KEY) || fallback;
  } catch {
    return fallback;
  }
}

export function saveActiveDay(id: string): void {
  try {
    localStorage.setItem(DAY_KEY, id);
  } catch {
    /* ignore */
  }
}

/** The data version this device last acknowledged, or null on first visit. */
export function loadSeenVersion(): string | null {
  try {
    return localStorage.getItem(SEEN_VERSION_KEY);
  } catch {
    return null;
  }
}

export function saveSeenVersion(v: string): void {
  try {
    localStorage.setItem(SEEN_VERSION_KEY, v);
  } catch {
    /* ignore */
  }
}
