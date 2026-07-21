# Repository Guidelines

## Project Structure & Module Organization

This repository contains a TypeScript PWA built with Vite. Application code lives in `src/`: `main.ts` bootstraps the app, `render.ts` builds the UI, and focused modules such as `weather.ts`, `calendar.ts`, and `share.ts` own individual features. Festival lineup data is in `src/data.ts`, shared interfaces in `src/types.ts`, and global styling in `src/style.css`. Static images and PWA icons belong in `public/`; regenerate icons with `scripts/gen-icons.mjs`. Deployment configuration is in `.github/workflows/deploy.yml`. Do not commit generated `dist/` or `node_modules/` directories.

## Build, Test, and Development Commands

- `npm install`: install the locked dependencies (CI currently uses Node 20).
- `npm run dev`: start the Vite development server with hot reload.
- `npm run build`: run strict TypeScript checks, then produce the production PWA in `dist/`.
- `npm run preview`: serve the built output for final local verification.
- `npm run icons`: regenerate the PWA icon files in `public/`.

There is no automated test suite or lint command yet. Treat `npm run build` as the minimum required check for every change.

## Coding Style & Naming Conventions

Follow the existing TypeScript style: two-space indentation, single quotes, semicolons, trailing commas in multiline structures, and ES module imports. Keep `strict`, unused-symbol, and switch fallthrough checks passing. Use `camelCase` for variables and functions, `PascalCase` for interfaces and type aliases, and kebab-case for source filenames (for example, `share-app.ts`). Keep feature logic in focused modules and reuse types from `src/types.ts`.

## Testing Guidelines

After building, use `npm run preview` and verify the affected flow at desktop and mobile widths. For PWA changes, check persistence, offline behavior, installability, and service-worker updates. Scheduling or lineup changes should exercise past-midnight sets and overlapping selections. If tests are introduced, place them beside the module as `*.test.ts` and add the runner to `package.json`.

## Commit & Pull Request Guidelines

Recent commits use short, imperative subjects such as `Add hourly weather forecast for festival days`. Keep each commit focused; use the body to explain behavior and edge cases. Pull requests should summarize user-visible effects, list verification performed, link related issues, and include screenshots for visual changes. Confirm `npm run build` succeeds before requesting review.

## Configuration Notes

The GitHub Pages base path in `vite.config.ts` is `/rockstadt2026clash/`; update it if the repository name changes. Do not commit secrets or local configuration files. Weather data uses the keyless Open-Meteo API, while user selections remain in browser storage.

## Licensing & Contributions

This project is released under `AGPL-3.0-only` (see `LICENSE`), with copyright held solely by Andrei Oprisan, who may also offer the software under separate commercial terms.

By submitting a contribution (pull request, patch, or otherwise), you represent that you have the right to do so and you grant Andrei Oprisan a perpetual, worldwide, non-exclusive, royalty-free, irrevocable license to use, reproduce, modify, sublicense, and distribute your contribution, **including the right to relicense it under other terms (such as a commercial license)**. Your contribution remains available to everyone under the AGPL; this grant simply preserves the maintainer's ability to dual-license the combined work. If you cannot agree to this, please open an issue to discuss before contributing.
