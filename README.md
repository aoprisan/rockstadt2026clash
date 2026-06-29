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
- **Timeline grid** — all three stages (Adrian Rugină, Brașov, Andrei Calmuc)
  side by side on a real time axis, including sets that run past midnight.
- **Your schedule, saved locally** — picks persist in `localStorage`; no
  account, no tracking.
- **"Only my picks" filter** to see just your personal line-up.
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
