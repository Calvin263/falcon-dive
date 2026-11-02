# Falcon Dive

A build-free canvas game using native ES modules and no production dependencies. Serve over HTTP; opening the HTML directly does not load ES modules reliably.

## Run

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\serve.ps1
```

Open http://localhost:8081/. Use `-Port 8082` if the default port is occupied.

## Architecture

- `index.html` and `styles/game.css`: document shell and presentation.
- `src/main.js`: browser lifecycle, scheduling, and diagnostics.
- `src/game.js`: composition root; creates independent sessions and injects dependencies.
- `src/config.js`: shared balance tables and constants.
- `src/core/`: frame scheduler, bounded cache, storage adapter, math, and viewport.
- `src/game/`: progression, settings, scoring, and day transitions.
- `src/simulation/`: flight/camera, procedural world/weather, prey/senses, combat, hazards, companions, and water encounters.
- `src/rendering/`: scene drawing, cached sprites, HUD, and menu screens.
- `src/input.js`: input binding; listeners accept a lifecycle cancellation signal.

System factories receive `{ session, viewport, systems, storage }`. Cross-system calls use explicit system names; modules do not import each other cyclically. Mutable gameplay data lives in the session, not browser globals. The existing `window.__falconDiveDebug` facade remains available for behavior checks.

## Performance

- Active rendering is capped at 60 FPS independently of display refresh rate.
- Paused scenes and completed menu animations redraw only after input or resizing. Hidden pages stop the scheduler; resuming resets timing.
- Player and prey poses are outlined once and cached. The sprite cache is bounded to 768 entries and approximately 32 MB of RGBA pixels; browser/GPU overhead is additional.
- Deterministic terrain is cached by world seed with a 512-entry limit.
- Grass work follows visible density, skips offscreen ground, and reuses visible lake bounds and wind calculations.
- The main canvas is opaque and uses CSS-pixel dimensions rather than multiplying work by device pixel ratio.

`window.__falconDiveDebug.getMetrics()` reports draw/update counts, last CPU timings, and cache usage. These timings do not measure GPU execution. Verify actual GPU utilization on the target machine; no fixed utilization reduction is guaranteed.

Existing `falconDive.progress` and `falconDive.settings` storage keys and legacy upgrade migrations are preserved.

## Verify

Node.js 22 or newer and npm are required for development checks only.

```powershell
npm ci
npm test
npm run lint
npx playwright install chromium
npm run test:browser
```

Playwright starts or reuses the server on port 8082 and checks desktop/mobile canvas rendering, controls, pause/visibility suspension, saving, and day transitions. Screenshots and failure traces are written under the ignored `test-results/` directory.