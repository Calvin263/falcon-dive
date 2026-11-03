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
- The main canvas is opaque and renders to a 0.75-scale backing store while retaining full-size CSS and logical coordinates, reducing canvas pixel work by about 44%.
- Pause settings offer Low (50%), Medium (75%), and High (100%) canvas resolution; the selection is saved with animal-size settings and applies immediately.

`window.__falconDiveDebug.getMetrics().canvas` reports the backing resolution and scale. `.diagnostics` reports a rolling 180-frame summary of animation gaps, render/update CPU time, current and peak visible prey, flock members, turtles, cats, hunters, particles, combat effects, and cache usage. `slowFrames` retains recent animation gaps over 22 ms with the matching CPU timings and scene counts. Large gaps with low render/update CPU time point outside JavaScript work (for example browser/compositor or GPU scheduling); the canvas API cannot measure GPU execution directly. Compare the diagnostics and Task Manager GPU load during a slowdown; no fixed utilization reduction is guaranteed.

Existing `falconDive.progress` and `falconDive.settings` storage keys and legacy upgrade migrations are preserved.

## Moon flight

The moon cinematic starts when the falcon reaches its current flight ceiling while moving upward at least 250 m/s, regardless of upgrades or spinning, without an escape-velocity popup. Ground collisions only initiate bounces; launch speed alone does not trigger the cinematic.

## Octopus grotto

The tunnel has varied rock contours and a highlighted, sealed right-hand wall; the exit remains on the left. The octopus starts nearer the entrance and retreats deeper as you approach. Head and tentacle hits add recoil, bounded before the end wall. Head damage is shown by the health bar and hit effects, without redundant hit notifications; tentacle interruption and defeat feedback remain. Rock contour variation is visual; the existing swimming corridor and air vents are unchanged.

## Interface

- The Roost shows a compact upgrade grid without scrolling. Each tile shows current/next stats and its price; click an affordable tile to buy immediately.
- A right-side status panel beneath the catch log groups discovered equipment and eyas hunting status. Each armed eyas has its own ammo count and bullet pips (or a bar for larger magazines), matching the player's ammo display. Lucky feathers and spring coils sit beside the altitude meter; used charges turn gray, and unlimited bounces show one coil with infinity. Catch cards show names, earnings, speed, modifiers, and circumstance icons; the recap preserves these distinctions.
- During the final 10 seconds, large outlined numbers appear at top-center, fading between seconds and turning red for the final three seconds. Notices move below the countdown. It estimates real seconds at the current slow-motion rate, so slow-motion still extends the day and pausing freezes the countdown. It also appears inside grottos; falling turtles can finish landing after sunset as before.
- The speedometer is anchored bottom-left, with a horizontal focus meter below it. The meter turns red when locked and marks the recovery threshold.
- Recent catches show their name, earnings, and applied modifiers in a compact, wrapping top-center panel for 2.5 seconds. Flock combos update the same panel; notices use small text and translucent, content-sized backgrounds. Full catch history stays in the catch log/recap. Eyas calls update the status badge. The moon launch-speed tracker is not displayed.
- Gameplay notices sit along the top-left edge beside the altitude tape. Carrying controls and turtle impact/readiness live in the equipment HUD instead of recurring popups. Bounce/recovery, predator arrival/stoop, and predator missed/gave-up messages are omitted; urgent danger uses a short label and warning icon anchored to the threat or its screen-edge position, without a flashing bottom banner. Achievement and unlock banners queue without replacing an active banner; repeated queued notices are deduplicated.
- Hold right-click to aim after buying Turtle Aim; left-click while aiming cancels the action and brakes without releasing the carried item. Intact turtles can be picked up as soon as they land. Land animals turn back at lake shores; ducks can paddle.
- Holding right-click empty-handed extends the falcon's gold talons, even with no nearby target. Release or brake to retract them.
- Achievement counters include every achievement, including hidden ones. Unachieved hidden achievements show their names and "hidden achievement" as their description; actual descriptions and rewards are revealed afterward. Progression hints still omit undiscovered secrets.
- A buzzard that steals a loaded rifle can turn its remaining ammunition against you. Its shots have hunter-style aiming warnings and can be dodged or parried; defeating it drops the rifle. The first shot unlocks a hidden achievement.
- Cats prefer a pursuing goshawk within pounce range over the player, and can switch targets while crouching. A leap already underway stays committed.

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