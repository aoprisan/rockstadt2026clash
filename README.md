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
- **Clash duels** — clashes aren't just flagged, they can be *settled*. Every
  clash becomes an interactive duel card: a taste head-to-head (how each band
  matches the genres of everything else you picked), one-tap **See A / See B**
  calls, and a computed **✂ split** — "watch 24m of A, walk ~6m, catch all of
  B" — built from real stage-to-stage walking times, only offered when a
  meaningful chunk of both sets is reachable. Keeping one side still tells you
  how much of the other you could catch around it. Decisions persist and flow
  everywhere: the header badge counts only *unsettled* clashes, settled sets
  stop glowing red on the timeline (a benched loser dims with ⏸, split sets
  carry ✂), and the day planner obeys your calls — benched sets leave the
  route, split sets are truncated to your exact windows. Undo any time.
- **Smart day planner** — one tap turns your picks, clashes and all, into the
  best walkable running order for each day: a weighted-interval-scheduling
  optimiser keeps every ★ must-see it can, then maximises minutes of music,
  charging real stage-to-stage walking time (arriving after the downbeat costs
  you the minutes you'd miss). It lays the day out as a run of show — walks,
  breathers, late-arrival warnings — lists exactly which sets it dropped and
  which chosen sets beat them, and fills your free gaps with **taste-matched
  suggestions**: unpicked sets that fit the window, ranked by a tiny TF-IDF
  genre-affinity model built from everything you've picked (one tap adds them).
- **Running order patches — the festival as it actually runs** — every
  clashfinder treats the poster as gospel. Real festivals don't: a stage loses
  fifteen minutes in the afternoon and carries it all night, a band misses a
  border crossing, a set gets pulled for weather. From that moment every clash,
  every walk, every countdown and every "leave at 23:16" in a planning app is
  quietly wrong — and the app never says so. **⏱ Running order** (in Options,
  or from the banner) is the patch layer: mark a stage as running late and every
  set on it that hasn't started yet moves — sets you already watched keep the
  times they actually had — or nudge a single set, or mark a band as not
  happening at all. Everything downstream re-times itself off the patched
  running order: the timeline (moved sets carry a `⏱ +15m` chip, pulled ones are
  struck through), clash and tight-walk detection, the day planner's chain, the
  Autopilot's "leave at", your on-device reminders, the calendar export, crew
  meet-ups and the stamina model. A permanent banner says how many patches are
  live, because times that silently disagree with the printed poster are worse
  than no times at all. And patches ride along on the **crew beam**: whoever is
  standing at the barrier when the stage manager announces the delay can push
  the fix to everyone they meet, with no network at all.
- **Stamina — the five-day battery, and what to cut** — every other clashfinder
  plans one day at a time and assumes you're a machine. This one plans the
  *week* and assumes you're a body. It takes the planner's duel-resolved route
  and charges it for hours on site, stage-to-stage walking, the small hours,
  heat and UV from the live hourly forecast, rain, and real door-to-door travel
  off the RATBV timetable — then repays it each night with however much sleep
  the running order actually leaves you, **discounted for the part that lands in
  daylight** (ten hours in bed after a 02:45 finish is not ten hours of sleep,
  and in a tent in July it's a lot less). A reserve battery tracks the whole run
  in one chart, with a ceiling that sinks each morning because five days in a
  field is not five independent days. Each day card shows every input — on-site
  hours, walking, feels-like peak, real sleep, door-to-door travel with the bus
  to board — and ranked, numbered advice: the night your last set puts you at the
  stop *after* the 211T stops running, the day with no hole big enough to eat in,
  the stretch that feels 31° with UV 8 and which bands it covers. Advice comes
  with the one tap that acts on it ("Drop Wolves In The Throne Room 01:45–02:45
  → +1h 33m in bed, and the shuttle is still running"), verified by re-running
  the model rather than guessed. And **⚕ Fix my week** searches your picks for
  the fewest cuts that keep every night above the floor — greedy on
  battery-recovered per unit of taste lost, ★ must-sees untouchable, and it
  refuses to propose a sacrifice that buys nothing. Tell it whether you're
  camping, on the bus or driving and the whole model re-reads. The projected low
  point rides in the header; the day's read and its most urgent call ride inside
  the Autopilot, because at 01:00 on the grounds nobody opens a planning panel.
- **Festival Autopilot** — live turn-by-turn guidance through your day, built
  on the planner's duel-resolved route. A full-screen pilot view tells you what
  you're watching and until when, exactly **when to leave** (real walking time
  charged: "leave at 23:16 · 🚶 4m → Brașov for Marilyn Manson"), when you're
  in free time and until when, and when to move — with a 5-minute warning and a
  go-time buzz (vibration) for every stage change, a live progress bar, and an
  optional **screen wake lock** so the phone can sit propped up like a boarding
  gate display. Change a pick or settle a duel mid-evening and the pilot
  re-routes instantly. Entirely on-device: it keeps navigating when the
  festival network doesn't.
- **Crew beam — sync plans by QR, zero network** — one phone shows a QR
  (Crew → 📡 My crew QR), the other scans it with its camera (BarcodeDetector,
  with a paste-the-link fallback for browsers without it), and the plans merge.
  A beam carries your name, your picks, **every crew plan you've already
  collected** and any **running-order patches** you're carrying, so plans and
  corrections propagate gossip-style: scan one friend and you inherit everyone
  they've met, and the delay they logged at the barrier. The same `#c=…` beam
  also travels as a plain link over any messenger, and scanning it never touches your own picks. Server-based
  crew apps go dark when the site's signal does; this needs nothing but eye
  contact.
- **Crew mode** — paste the picks links your friends share and their plans
  overlay yours, entirely client-side: initials badges on every set a friend is
  going to, a per-day list of the sets you'll be together for, and computed
  **meet-up windows** — the stretches when every single member of the crew is
  free at the same time. Re-pasting a fresh link under the same name updates a
  friend; no accounts, no backend, nothing leaves the device.
- **Festival journal & "My Rockstadt Rewind"** — once a picked set has played,
  rate it 🤘 to 🤘🤘🤘🤘🤘 in the journal, mark the ones you didn't make it to,
  and keep a one-line memory ("wall of death", "guest song"). Ratings show on
  the timeline, and a dot on the Journal button nudges you while sets are
  still unrated. One tap then renders **My Rockstadt Rewind** — a shareable
  Wrapped-style PNG of the festival you actually had: sets seen, hours of live
  music, your top-rated podium, the genres that defined your week, your stage
  split and your best quote — straight to the native share sheet. Works
  mid-festival as a running tally; everything stays on-device.
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
  temperature, condition and rain chance for each hour. The same hourly pull
  also carries apparent temperature and UV index — the numbers the stamina model
  charges you for standing in — and falls back to the original field set if the
  API ever refuses them, so the forecast can't be lost to a variable name. The
  last result is cached in `localStorage`, so the panel still shows the most
  recent forecast offline on the festival grounds.
- **Bag — the gate list, crossed with the forecast** — the festival's own
  allowed and prohibited lists (**Options → 🎒 Bag**, or from the footer of the
  site map) as a checklist rather than a poster. The six allowed items tick off
  as you pack them and the ticks persist in `localStorage`, so the list survives
  being closed on the way out the door. The same cached hourly forecast the
  timeline uses decides which lines shout: the wettest day promotes the raincoat
  — and makes the umbrella ban worth reading twice — peak UV promotes the
  sunscreen, the hottest hour the sunglasses, and a cold small-hours reading
  tells you to leave room for a layer. With no forecast on the device the lists
  still read in full, minus the weather notes.
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

`src/data.ts` is the poster; `src/delays.ts` is the night. Patches logged in
**⏱ Running order** are applied in `schedule.ts` as slots are built, so every
consumer — clashes, planner, pilot, reminders, calendar, stamina — sees the
patched times without knowing the patch layer exists. `ALL_SLOTS` is rebuilt in
place when a patch lands (its identity, order and length are load-bearing: the
share-link codec indexes picks by position in it), and `subscribeSchedule`
tells the views to repaint.

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
