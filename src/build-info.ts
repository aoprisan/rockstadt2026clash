/**
 * When this bundle was built, and from which commit — injected by Vite's
 * `define` at build time (see `vite.config.ts`). In `npm run dev` the values are
 * still replaced, so the stamp is real in development too.
 */
declare const __BUILD_TIME__: string;
declare const __BUILD_COMMIT__: string;

/** ISO timestamp of the build. */
export const BUILD_TIME: string = __BUILD_TIME__;

/** Short commit hash the build came from, or 'dev' when git wasn't available. */
export const BUILD_COMMIT: string = __BUILD_COMMIT__;

/** "25 Jul 2026, 15:12" in the viewer's own timezone — a stamp you can compare. */
export function buildLabel(): string {
  const d = new Date(BUILD_TIME);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "3 days ago" / "20 minutes ago" — how stale the copy on this device is. */
export function buildAge(now: number = Date.now()): string {
  const then = new Date(BUILD_TIME).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.max(0, Math.round((now - then) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
