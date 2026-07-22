# Rockstadt 2026 Clashfinder

An installable **Progressive Web App** (TypeScript + Vite) for the
**Rockstadt Extreme Fest 2026** — 12th edition, Ghimbav · Brașov, Romania,
27–31 July 2026.

Pick the bands you want to see across the three stages and the app instantly
flags **clashes** — sets you've picked that overlap in time.

🔗 **Live:** https://aoprisan.github.io/rockstadt2026clash/

## Features

- **Clash detection** — overlapping picks are highlighted in red, with a
  per-day summary listing each conflict and how long it overlaps.
- **Tight-crossing warnings** — even when two picks don't overlap, back-to-back
  sets on *different* stages with too small a gap to walk across are flagged in
  amber (a rung below a true clash), with the gap and estimated walk time.
- **Must-see stars** — picked sets can be starred (★) as a second, higher tier.
  Stars glow gold on the timeline and are the planner's protected class.
- **Smart day planner** — one tap turns your picks, clashes and all, into the
  best walkable running order for each day: a weighted-interval-scheduling
  optimiser keeps every ★ must-see it can, then maximises minutes of music,
  charging real stage-to-stage walking time (arriving after the downbeat costs
  you the minutes you'd miss). It lays the day out as a run of show — walks,
  breathers, late-arrival warnings — lists exactly which sets it dropped and
  which chosen sets beat them, and fills your free gaps with **taste-matched
  suggestions**: unpicked sets that fit the window, ranked by a tiny TF-IDF
  genre-affinity model built from everything you've picked (one tap adds them).
- **Crew mode** — paste the picks links your friends share and their plans
  overlay yours, entirely client-side: initials badges on every set a friend is
  going to, a per-day list of the sets you'll be together for, and computed
  **meet-up windows** — the stretches when every single member of the crew is
  free at the same time. Re-pasting a fresh link under the same name updates a
  friend; no accounts, no backend, nothing leaves the device.
- **Now / Next live bar** — a self-updating strip that counts down to the gates
  before the festival, then during it shows what's on now among your picks and
  what you're about to miss, with a live countdown.
- **Timeline grid** — all three stages (Adrian Rugină, Brașov, Andrei Calmuc)
  side by side on a real time axis, including sets that run past midnight.
- **Band info at a glance** — each set shows its genre and a **▶ Listen** link
  (Spotify) alongside the info link, so you can sample a band before committing.
- **Find a band** — search box that jumps to any act across all five days and
  flashes it on the timeline.
- **Your festival** — a personal summary: total sets, time on site (double
  bookings counted once), days active, clashes and your busiest day.
- **Your schedule, saved locally** — picks persist in `localStorage`; no
  account, no tracking.
- **Share your picks as a link** — a compact `#p=…` link (in **Options**) that
  reopens your exact line-up on another device, entirely client-side. Great for
  comparing plans with friends.
- **"Only my picks" filter** to see just your personal line-up.
- **Set reminders** — opt in to a notification a chosen number of minutes
  (5/10/15/30) before each picked set starts. Scheduled on-device with no
  backend. Each reminder fires on two channels while the app is open: a
  **native** OS notification (which reaches you in the background) and a
  visible **in-app toast** (for when the app is focused and the browser hides
  its own banner). Tap the toast to jump straight to that set on the timeline.
- **Add to calendar** — export your picks as an `.ics` file with an alarm
  before every set. Your phone's native calendar then reminds you reliably
  **even when the app is fully closed** — offline and cross-platform, still no
  backend. Times are emitted in UTC (the festival sits in UTC+3) so they land
  correctly whatever timezone your device is in.
- **Share as image** — export your picks to a PNG and send them straight to the
  native mobile share sheet (falls back to a download on desktop).
- **Weather forecast** — a per-day forecast for the festival site (high/low,
  rain chance, wind) pulled live from the free, keyless
  [Open-Meteo](https://open-meteo.com/) API. Tap any day to expand an
  **hourly** strip covering the festival hours (14:00 → the small hours) with
  temperature, condition and rain chance for each hour. The last result is
  cached in `localStorage`, so the panel still shows the most recent forecast
  offline on the festival grounds.
- **Installable & offline** — full PWA with a service worker (manifest, icons,
  offline caching) so it works on the festival grounds with patchy signal.

## Stages

| Stage | Colour |
| --- | --- |
| Adrian Rugină | 🟢 green |
| Brașov | 🟣 purple |
| Andrei Calmuc | 🟠 orange |

## Development

```bash
npm install
npm run icons   # regenerate PWA icons (no native deps)
npm run dev     # local dev server
npm run build   # type-check + production build into dist/
npm run preview # preview the production build
```

## Deployment

Every push to the deploy branch builds the app and publishes `dist/` to
**GitHub Pages** via the workflow in `.github/workflows/deploy.yml`.

> One-time setup: in the repository **Settings → Pages**, set
> **Source = GitHub Actions**.

The Vite `base` is set to `/rockstadt2026clash/` in `vite.config.ts` to match
the repository name; update it if the repo is renamed.

## Data

Set times are transcribed from the official festival day posters and are
**subject to change**. This is an unofficial fan-made tool.

Whenever the running order changes, bump `DATA_VERSION` in `src/data.ts`.
Returning visitors whose device last saw an older stamp then get a one-time
"running order updated" banner so stale plans don't go unnoticed. Band genres
and curated listen links live in `src/band-meta.ts` (keyed by band name);
bands without an entry fall back to a Spotify search.

## License

Copyright © 2026 Andrei Oprisan.

This project is licensed under the **GNU Affero General Public License v3.0
only** (`AGPL-3.0-only`) — see [`LICENSE`](LICENSE). You're free to use, study,
modify and share it; if you run a modified version as a network service, the
AGPL requires you to offer that version's source to its users.

The copyright is held solely by the author, who reserves the right to offer the
software under **separate commercial terms**. If the AGPL's terms don't fit your
use case, a commercial license is available on request.

Contributions are welcome under the terms in [`AGENTS.md`](AGENTS.md), which
include a licensing grant that keeps this dual-licensing possible.
