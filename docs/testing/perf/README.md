# Performance (M10)

**Status: measured on one development machine only.** "Low-end" figures below come from Chrome's CPU throttling
(4×), a **proxy** for a slower machine, not a measurement of one. No claim about any real device is made
([PERF-01, PERF-02](../MANUAL-TEST-PLAN.md), [KI-44](../KNOWN-ISSUES.md)).

## Method

- **Headless frame CPU** — `node --expose-gc --import tsx scripts/perf-scenes.ts <label> [--frames 600] [--only scene]`:
  the game's real frame path (simulation step, camera, `ViewRenderer`, the menu bar) over fixed scenes — turtle
  stage 0 and 4, manta 4, whale 4, the house interior, rain, active fishing, a Carrier animating at overview, the
  minimum zoom (overview) and the maximum zoom (close-up; up close since M10) — each at 1280×720, 1920×1080 and a
  phone's 844×390. 90 warm-up frames, then mean, p50/p95/p99/max per frame, the per-phase split (world frame,
  magnify and overlay, native Blobbi, HUD, menu bar), heap growth across the run (after GC), and world generation
  times. `PROFILE=<dir>` also writes a CPU profile of the measured frames only.
- **Browser** — `node scripts/perf-browser.mjs <label> [--throttle 4] [--seconds 6] [--port 5211]` with
  `npx vite --port 5211` and Chrome (`--headless=new --remote-debugging-port=9333`, a fresh profile): a new turtle
  island through the real title flow, then for each scene the rAF frame intervals (FPS, p50/p95/p99/max), long
  tasks, the JS heap at start and end, and the game's own view timing. Scenes: turtle stage 0 in every camera mode,
  rain, fishing, turtle stage 4 in every mode, at 1280×720 and 844×390.
- **Comparisons** — `node scripts/perf-compare.mjs <before.json> <after.json>` prints the tables below. The
  machine's speed drifted during the session (the same unchanged menu-bar code measured up to 40 % apart), so
  before/after pairs are only compared when run **back to back**; the raw JSON of every run is kept here.

## Baseline (M9, `68ed169`)

- Headless: 1–7 ms CPU a frame on average; p95 often 2–3× the median; walking spikes of 4–7 ms; no heap growth.
- Unthrottled Chrome: 60 FPS everywhere, no long tasks; the heap saw-toothed between about 35 and 120 MB.
- 4× throttled Chrome (proxy): overview at 1280×720 at 21–38 FPS with long tasks (up to 20 in 6 s); exploration
  33–56 FPS; close-up 44–60 FPS. At 844×390 mostly 40–60 FPS.
- Generation: turtle 0.36–0.52 s, manta 0.39–0.69 s, whale 0.45–0.54 s; growing to stage 4: 0.15–0.38 s.

## What was expensive (frame-only CPU profiles, `PROFILE=`)

1. **The walking spikes** were a new Blobbi pose being rasterized from the kit's SVG — twice: once at the native
   size the view draws, once at the gameplay size the split view then threw away — about 2.5 ms each, with tens of
   MB of garbage per sprite (the sub-sample coverage loop).
2. **Lighting** (night and rain): a floating-point formula on every pixel of the world frame and the overlay.
3. **Small per-frame allocations**: a key string (with `JSON.stringify`) per object per frame for its sprite, the
   magnify maps and spans per frame.
4. The magnify itself (one indexed copy per screen pixel) — the floor of the software renderer; a span-fill variant
   was tried and measured slower, and reverted.

## Optimisations (commit `5a6a671`, pixel-identical)

- The split view no longer rasterizes the unused gameplay-size Blobbi.
- Coverage in `src/blobbi/svg-raster.ts`: an active-edge list and integer sub-sample counts mapped through the exact
  float sums (bit-identical output, verified over 360 sprites; about 40 % less garbage).
- Lighting: per-channel tables where no lamp reaches (exactly the old formula; `tests/perf-optimizations.test.ts`).
- Object sprites remembered per placement; magnify maps and spans reused.

Headless, back to back (M9 → optimised, first runs of the session):

| Scene | Viewport | Mean ms | p95 ms | p99 ms | Max ms |
|---|---|---|---|---|---|
| turtle-stage0 | 1280x720 | 1.58 → 1.43 | 4.80 → 3.03 | 6.34 → 4.12 | 7.7 → 9.7 |
| turtle-stage0 | 1920x1080 | 2.51 → 2.30 | 2.86 → 2.90 | 7.15 → 4.78 | 8.9 → 5.9 |
| turtle-stage0 | phone-844x390 | 0.97 → 0.81 | 0.97 → 0.83 | 5.57 → 3.21 | 7.4 → 4.3 |
| turtle-stage4 | 1280x720 | 2.05 → 1.77 | 2.35 → 2.06 | 6.80 → 4.25 | 9.1 → 5.5 |
| turtle-stage4 | 1920x1080 | 3.01 → 2.74 | 5.08 → 3.43 | 7.62 → 5.26 | 9.8 → 6.3 |
| turtle-stage4 | phone-844x390 | 1.23 → 0.97 | 1.36 → 1.08 | 5.71 → 3.46 | 7.7 → 4.6 |
| manta-stage4 | 1280x720 | 2.96 → 2.61 | 3.26 → 2.97 | 7.65 → 4.95 | 10.1 → 6.3 |
| manta-stage4 | 1920x1080 | 4.18 → 3.81 | 4.51 → 4.21 | 9.02 → 6.23 | 11.1 → 7.6 |
| manta-stage4 | phone-844x390 | 1.63 → 1.34 | 1.81 → 1.63 | 6.16 → 3.61 | 8.3 → 5.0 |
| whale-stage4 | 1280x720 | 1.74 → 1.44 | 2.03 → 1.73 | 6.46 → 3.81 | 8.2 → 5.1 |
| whale-stage4 | 1920x1080 | 2.75 → 2.45 | 3.08 → 2.72 | 7.52 → 4.88 | 8.8 → 6.2 |
| whale-stage4 | phone-844x390 | 1.11 → 0.84 | 1.31 → 1.23 | 5.72 → 3.23 | 7.4 → 4.5 |
| interior | 1280x720 | 1.09 → 1.08 | 2.95 → 2.91 | 3.54 → 3.31 | 4.2 → 4.0 |
| interior | 1920x1080 | 1.96 → 1.97 | 3.79 → 3.72 | 4.52 → 4.23 | 5.2 → 5.0 |
| interior | phone-844x390 | 0.65 → 0.67 | 2.45 → 2.37 | 3.18 → 2.90 | 3.9 → 3.4 |
| rain | 1280x720 | 2.80 → 2.00 | 5.94 → 3.60 | 7.33 → 4.47 | 9.4 → 5.7 |
| rain | 1920x1080 | 5.48 → 3.45 | 8.55 → 4.98 | 10.22 → 5.87 | 11.8 → 7.3 |
| rain | phone-844x390 | 1.57 → 1.10 | 4.63 → 2.56 | 6.09 → 3.42 | 7.8 → 4.8 |
| fishing | 1280x720 | 1.36 → 1.37 | 1.37 → 1.44 | 6.38 → 4.93 | 8.2 → 6.3 |
| fishing | 1920x1080 | 2.32 → 2.35 | 2.34 → 2.56 | 7.56 → 6.04 | 9.2 → 7.5 |
| fishing | phone-844x390 | 0.82 → 0.78 | 0.78 → 0.79 | 5.94 → 3.91 | 7.5 → 5.7 |
| carrier-anim-overview | 1280x720 | 2.50 → 2.29 | 5.11 → 3.61 | 6.84 → 4.49 | 7.8 → 4.8 |
| carrier-anim-overview | 1920x1080 | 4.11 → 3.98 | 6.74 → 5.15 | 8.23 → 6.02 | 9.2 → 6.7 |
| carrier-anim-overview | phone-844x390 | 1.54 → 1.27 | 4.04 → 2.46 | 5.82 → 3.28 | 6.5 → 3.8 |
| min-zoom-overview | 1280x720 | 2.46 → 2.26 | 3.13 → 3.26 | 7.36 → 4.42 | 9.0 → 5.7 |
| min-zoom-overview | 1920x1080 | 3.97 → 3.87 | 4.85 → 4.75 | 8.35 → 6.04 | 10.6 → 7.2 |
| min-zoom-overview | phone-844x390 | 1.97 → 1.76 | 2.62 → 2.28 | 6.26 → 3.96 | 8.0 → 5.2 |
| max-zoom-closeup | 1280x720 | 1.42 → 1.16 | 1.53 → 1.32 | 6.86 → 3.98 | 9.5 → 6.0 |
| max-zoom-closeup | 1920x1080 | 2.25 → 2.01 | 2.38 → 2.26 | 7.64 → 5.10 | 10.3 → 6.8 |
| max-zoom-closeup | phone-844x390 | 0.88 → 0.65 | 1.55 → 0.64 | 6.12 → 3.33 | 8.5 → 5.4 |

Chrome, 4× CPU throttling (proxy), first pair:

| Scene | Viewport | FPS | p95 interval ms | Long tasks | View ms |
|---|---|---|---|---|---|
| turtle-stage0-exploration | 1280x720 | 45.2 → 53.3 | 33.4 → 33.3 | 0 → 0 | 12.1 → 8.1 |
| turtle-stage0-overview | 1280x720 | 29.1 → 40.9 | 49.9 → 33.4 | 0 → 0 | 23.3 → 14.3 |
| turtle-stage0-closeup | 1280x720 | 60.0 → 60.0 | 16.7 → 16.7 | 0 → 0 | 5.9 → 4.4 |
| rain-exploration | 1280x720 | 45.5 → 53.2 | 33.4 → 33.3 | 0 → 0 | 11.6 → 7.9 |
| fishing-exploration | 1280x720 | 45.6 → 52.6 | 33.4 → 33.4 | 0 → 0 | 11.1 → 8.2 |
| turtle-stage4-exploration | 1280x720 | 56.3 → 58.8 | 33.3 → 16.7 | 0 → 0 | 26.1 → 23.3 |
| turtle-stage4-overview | 1280x720 | 38.0 → 58.2 | 33.4 → 16.8 | 0 → 0 | 22.9 → 14.0 |
| turtle-stage4-closeup | 1280x720 | 59.3 → 59.8 | 16.7 → 16.7 | 0 → 0 | 5.0 → 5.0 |
| turtle-stage0-exploration | 844x390 | 60.0 → 60.0 | 16.8 → 16.8 | 0 → 0 | 5.3 → 4.1 |
| turtle-stage0-overview | 844x390 | 40.1 → 58.3 | 33.4 → 16.8 | 0 → 0 | 19.9 → 12.6 |
| turtle-stage0-closeup | 844x390 | 60.0 → 60.0 | 16.8 → 16.7 | 0 → 0 | 2.2 → 2.5 |
| rain-exploration | 844x390 | 60.0 → 60.0 | 16.7 → 16.7 | 0 → 0 | 5.3 → 3.6 |
| fishing-exploration | 844x390 | 60.0 → 60.0 | 16.8 → 16.7 | 0 → 0 | 5.5 → 3.7 |
| turtle-stage4-exploration | 844x390 | 58.2 → 59.7 | 16.8 → 16.8 | 0 → 0 | 13.6 → 11.6 |
| turtle-stage4-overview | 844x390 | 45.5 → 58.8 | 33.4 → 16.7 | 0 → 0 | 20.4 → 12.9 |
| turtle-stage4-closeup | 844x390 | 59.3 → 59.8 | 16.8 → 16.7 | 0 → 0 | 3.5 → 20.8 |

## Final M10 (all features: open sea, marine life, fishing, up close)

Headless, back to back (M9 re-run → final). The first two scenes of the M9 run measured faster than its own later
scenes (its unchanged menu bar at 0.125 ms against 0.18 ms everywhere else); every phase elsewhere is equal or
better, except the open sea: about +1 ms of world time at the 1920×1080 overview, where most of the screen is sea.

| Scene | Viewport | Mean ms | p95 ms | p99 ms | Max ms |
|---|---|---|---|---|---|
| turtle-stage0 | 1280x720 | 1.57 → 2.06 | 4.62 → 4.19 | 6.35 → 6.21 | 7.8 → 14.2 |
| turtle-stage0 | 1920x1080 | 2.51 → 3.25 | 4.63 → 3.94 | 7.42 → 6.86 | 8.9 → 8.2 |
| turtle-stage0 | phone-844x390 | 0.97 → 1.13 | 1.50 → 1.23 | 5.61 → 4.40 | 7.3 → 5.7 |
| turtle-stage4 | 1280x720 | 2.05 → 2.56 | 2.25 → 3.17 | 6.73 → 6.39 | 8.7 → 8.1 |
| turtle-stage4 | 1920x1080 | 3.00 → 3.98 | 3.53 → 4.73 | 7.52 → 7.37 | 10.3 → 8.8 |
| turtle-stage4 | phone-844x390 | 1.22 → 1.39 | 3.40 → 1.53 | 5.67 → 4.90 | 7.7 → 6.2 |
| manta-stage4 | 1280x720 | 4.59 → 3.58 | 9.08 → 3.81 | 12.10 → 6.90 | 27.3 → 8.5 |
| manta-stage4 | 1920x1080 | 5.75 → 5.23 | 8.31 → 5.94 | 12.52 → 8.68 | 15.2 → 10.1 |
| manta-stage4 | phone-844x390 | 2.35 → 1.87 | 2.59 → 2.08 | 9.16 → 5.09 | 12.9 → 6.4 |
| whale-stage4 | 1280x720 | 2.29 → 1.87 | 2.91 → 2.19 | 8.45 → 5.08 | 10.8 → 6.5 |
| whale-stage4 | 1920x1080 | 3.74 → 3.27 | 6.00 → 3.60 | 10.13 → 6.70 | 12.2 → 8.1 |
| whale-stage4 | phone-844x390 | 1.57 → 1.20 | 2.32 → 1.53 | 8.20 → 4.68 | 10.7 → 6.4 |
| interior | 1280x720 | 1.55 → 1.55 | 4.22 → 4.10 | 5.20 → 5.04 | 6.3 → 6.2 |
| interior | 1920x1080 | 2.61 → 2.60 | 5.23 → 5.01 | 6.07 → 5.80 | 6.9 → 6.8 |
| interior | phone-844x390 | 0.91 → 0.89 | 3.64 → 3.13 | 4.45 → 4.08 | 5.4 → 4.6 |
| rain | 1280x720 | 3.82 → 2.64 | 8.36 → 4.73 | 10.66 → 6.10 | 13.5 → 8.4 |
| rain | 1920x1080 | 7.53 → 4.61 | 12.03 → 6.55 | 13.92 → 8.14 | 26.6 → 9.7 |
| rain | phone-844x390 | 2.28 → 1.51 | 6.83 → 3.54 | 9.31 → 4.84 | 11.2 → 6.3 |
| fishing | 1280x720 | 1.90 → 1.80 | 2.05 → 1.93 | 9.08 → 6.75 | 12.2 → 9.4 |
| fishing | 1920x1080 | 3.12 → 3.15 | 3.27 → 3.34 | 9.71 → 7.88 | 12.7 → 10.1 |
| fishing | phone-844x390 | 1.15 → 1.06 | 1.10 → 1.03 | 7.96 → 5.52 | 10.3 → 7.5 |
| carrier-anim-overview | 1280x720 | 3.55 → 3.11 | 6.81 → 4.73 | 9.90 → 5.88 | 13.3 → 7.1 |
| carrier-anim-overview | 1920x1080 | 5.59 → 6.17 | 8.98 → 7.89 | 11.89 → 8.91 | 16.0 → 9.6 |
| carrier-anim-overview | phone-844x390 | 2.19 → 1.76 | 5.58 → 3.26 | 8.21 → 4.53 | 9.3 → 5.7 |
| min-zoom-overview | 1280x720 | 3.34 → 3.52 | 6.35 → 4.48 | 9.63 → 6.44 | 12.5 → 8.5 |
| min-zoom-overview | 1920x1080 | 5.40 → 6.48 | 9.11 → 8.23 | 11.36 → 9.57 | 23.0 → 11.0 |
| min-zoom-overview | phone-844x390 | 2.76 → 2.66 | 3.82 → 3.70 | 8.66 → 6.03 | 11.6 → 7.5 |
| max-zoom-closeup | 1280x720 | 2.04 → 1.61 | 2.27 → 1.75 | 10.02 → 5.54 | 13.5 → 8.4 |
| max-zoom-closeup | 1920x1080 | 3.18 → 2.73 | 3.58 → 3.16 | 11.17 → 6.78 | 14.8 → 8.9 |
| max-zoom-closeup | phone-844x390 | 1.26 → 0.92 | 1.81 → 0.93 | 9.04 → 4.81 | 12.2 → 7.5 |

Chrome, 4× CPU throttling (proxy), back to back, second pair:

| Scene | Viewport | FPS | p95 interval ms | Long tasks | View ms |
|---|---|---|---|---|---|
| turtle-stage0-exploration | 1280x720 | 46.5 → 51.5 | 33.4 → 33.4 | 0 → 0 | 10.3 → 8.4 |
| turtle-stage0-overview | 1280x720 | 28.7 → 38.3 | 50.0 → 33.4 | 0 → 0 | 22.8 → 15.1 |
| turtle-stage0-closeup | 1280x720 | 59.7 → 60.0 | 16.8 → 16.7 | 0 → 0 | 6.1 → 4.0 |
| rain-exploration | 1280x720 | 46.8 → 52.3 | 33.4 → 33.3 | 0 → 0 | 10.3 → 8.4 |
| fishing-exploration | 1280x720 | 46.5 → 51.8 | 33.4 → 33.4 | 0 → 0 | 10.3 → 8.6 |
| turtle-stage4-exploration | 1280x720 | 58.3 → 59.5 | 16.8 → 16.7 | 0 → 0 | 11.7 → 8.1 |
| turtle-stage4-overview | 1280x720 | 35.4 → 57.5 | 50.0 → 16.8 | 10 → 0 | 23.8 → 13.9 |
| turtle-stage4-closeup | 1280x720 | 59.0 → 59.8 | 16.8 → 16.7 | 0 → 0 | 5.5 → 20.6 |
| turtle-stage0-exploration | 844x390 | 60.0 → 60.0 | 16.8 → 16.7 | 0 → 0 | 3.7 → 3.3 |
| turtle-stage0-overview | 844x390 | 60.0 → 60.0 | 16.7 → 16.8 | 0 → 0 | 6.7 → 7.5 |
| turtle-stage0-closeup | 844x390 | 60.0 → 60.0 | 16.8 → 16.8 | 0 → 0 | 1.9 → 1.1 |
| rain-exploration | 844x390 | 60.0 → 60.0 | 16.7 → 16.7 | 0 → 0 | 5.4 → 3.7 |
| fishing-exploration | 844x390 | 60.0 → 60.0 | 16.7 → 16.7 | 0 → 0 | 5.2 → 2.9 |
| turtle-stage4-exploration | 844x390 | 59.8 → 59.8 | 16.8 → 16.8 | 0 → 0 | 28.5 → 21.3 |
| turtle-stage4-overview | 844x390 | 41.7 → 59.5 | 49.9 → 16.7 | 1 → 0 | 20.0 → 12.3 |
| turtle-stage4-closeup | 844x390 | 60.0 → 59.8 | 16.7 → 16.8 | 0 → 0 | 2.6 → 18.3 |

The first back-to-back pair, for the record (same code, the machine slower during the final run):

| Scene | Viewport | FPS | p95 interval ms | Long tasks | View ms |
|---|---|---|---|---|---|
| turtle-stage0-exploration | 1280x720 | 60.0 → 51.8 | 16.8 → 33.4 | 0 → 0 | 3.3 → 8.0 |
| turtle-stage0-overview | 1280x720 | 59.8 → 38.8 | 16.7 → 33.4 | 0 → 0 | 6.2 → 14.8 |
| turtle-stage0-closeup | 1280x720 | 60.0 → 60.0 | 16.7 → 16.7 | 0 → 0 | 2.6 → 3.7 |
| rain-exploration | 1280x720 | 59.8 → 52.0 | 16.8 → 33.3 | 0 → 0 | 7.6 → 8.5 |
| fishing-exploration | 1280x720 | 59.8 → 52.0 | 16.8 → 33.3 | 0 → 0 | 8.1 → 8.5 |
| turtle-stage4-exploration | 1280x720 | 57.8 → 59.2 | 16.8 → 16.7 | 0 → 0 | 12.5 → 24.9 |
| turtle-stage4-overview | 1280x720 | 34.2 → 57.5 | 50.0 → 16.8 | 15 → 0 | 24.4 → 14.8 |
| turtle-stage4-closeup | 1280x720 | 59.3 → 59.8 | 16.8 → 16.8 | 0 → 0 | 5.4 → 4.6 |
| turtle-stage0-exploration | 844x390 | 60.0 → 60.0 | 16.7 → 16.8 | 0 → 0 | 5.7 → 3.7 |
| turtle-stage0-overview | 844x390 | 39.5 → 56.3 | 33.4 → 33.3 | 0 → 0 | 19.3 → 11.9 |
| turtle-stage0-closeup | 844x390 | 60.0 → 60.0 | 16.7 → 16.7 | 0 → 0 | 2.0 → 1.7 |
| rain-exploration | 844x390 | 60.0 → 60.0 | 16.7 → 16.7 | 0 → 0 | 5.5 → 4.3 |
| fishing-exploration | 844x390 | 60.0 → 60.0 | 16.7 → 16.7 | 0 → 0 | 5.0 → 4.0 |
| turtle-stage4-exploration | 844x390 | 59.7 → 59.8 | 16.8 → 16.8 | 0 → 0 | 28.1 → 20.1 |
| turtle-stage4-overview | 844x390 | 42.3 → 59.5 | 33.4 → 16.8 | 0 → 0 | 20.5 → 11.2 |
| turtle-stage4-closeup | 844x390 | 59.8 → 59.8 | 16.8 → 16.8 | 0 → 0 | 3.2 → 18.7 |

Unthrottled Chrome, final: **60 FPS and no long tasks in every scene and mode, at 1280×720 and 844×390**
(`browser-final-m10.json`).

Memory: no sustained growth — headless, the heap after GC never grew more than 0.7 MB over 600 frames in any scene; in Chrome the heap
saw-tooths (young-generation collections) without a rising floor over each 5–6 s window. The open sea keeps its
tiles for the largest view seen (about 20 MB at 2560×1440, 4 MB minimum).

## Targets

| Target | Result |
|---|---|
| 60 FPS on a reasonable desktop | Met on this development machine, unthrottled, every scene. |
| ≥ 30 FPS on a lower-end target | 4× throttled proxy: 38–60 FPS in every scene at 1280×720, 59.5–60 at 844×390, no long tasks (second pair). Not measured on real hardware. |
| No sustained memory growth | None seen. |
| No severe spikes | p99 under 10 ms headless in every scene; no long tasks unthrottled; none at 4× in the final second pair. First-time pose rasterization remains a small hitch (KI-43). |
