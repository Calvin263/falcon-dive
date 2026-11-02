---
name: falcon-dive-agent
description: Launch Falcon Dive locally, connect a browser (Playwright) to it, and play or inspect the game as an agent. Use when asked to run, play, test, or automate Falcon Dive.
---

# Falcon Dive — launch, connect, and play as an agent

Rules and physics: [game-mechanics.md](./game-mechanics.md). For validation after code changes also see [../playwright-validation.skill.md](../playwright-validation.skill.md).

## 1) Launch the server

Static server, no build step. Port 8081 by default (`-Port` to change).

```powershell
cd "E:\Repos\Falcon Dive\falcon-dive"
powershell -ExecutionPolicy Bypass -File .\serve.ps1          # http://localhost:8081/
```

Run it as a background process and verify:

```powershell
curl.exe -s -o NUL -w "%{http_code}" http://localhost:8081/    # expect 200
```

Stop it with `Stop-Process -Id <PID>`. VS Code tasks/launch configs are in `E:\Repos\Falcon Dive\.vscode`.

## 2) Connect with Playwright

```javascript
const { chromium } = require('playwright');   // npm i playwright (once)
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', m => m.type() === 'error' && console.error(m.text()));
page.on('pageerror', e => console.error(e));
await page.goto('http://localhost:8081/');
await page.waitForSelector('canvas#game');
await page.mouse.move(640, 360);
```

The integrated browser tools (`openBrowserPage` / `runPlaywrightCode`) work with the same URL.

Gotchas:
- A window `blur` pauses the game. If paused, click the canvas once to resume.
- Clicking after a crash restarts the run.
- Keep the viewport fixed; steering is relative to the bird's on-screen position and the zoom changes with altitude/speed.

## 3) Read game state

Everything is exposed via `window.__falconDiveDebug`:

```javascript
const s = await page.evaluate(() => {
  const { bird, state } = window.__falconDiveDebug.snapshot();
  return { x: bird.x, alt: bird.alt, speed: bird.speed, vy: bird.vy, mode: bird.mode,
           brakeE: bird.brakeE, carrying: !!bird.carrying,
           score: state.score, over: state.over, msg: state.msg };
});
```

Nearby prey:

```javascript
const targets = await page.evaluate(() => {
  const g = window.__falconDiveDebug, b = g.bird;
  return g.prey.filter(p => !p.gone && !p.spent && Math.abs(p.x - b.x) < 400)
    .map(p => ({ kind: p.kind, dx: p.x - b.x, alt: p.alt ?? 0, aware: !!p.aware }));
});
```

## 4) Control the bird

Steering is purely mouse-driven: the bird turns toward the cursor direction relative to its on-screen position (read it from the canvas, usually near the horizontal centre). Put the cursor at `birdScreen + k * (dx, -dalt)` with `k` large (>150 px) for full effort.

| Goal | Action |
|---|---|
| Climb / gain speed | Cursor well above the bird (auto-flap) |
| Dive | Cursor far below the bird, no button; speed builds toward ~95 m/s |
| Pull out / precise strike | `page.mouse.down()` (brake + slow-mo); `page.mouse.up()` to release |
| Drop turtle | `page.keyboard.press('Space')` |
| Aimed throw | `page.mouse.down({ button: 'right' })`, move cursor, `page.mouse.up({ button: 'right' })` |
| Pause / resume | `page.keyboard.press('p')` |
| Restart after crash | `page.mouse.down(); page.mouse.up()` |

Agent loop (every ~50–100 ms): read the snapshot, choose a target, set the cursor, and enforce safety — pull up or hold the brake whenever `alt < 40` and `-bird.vy > 10` (descent > 14 m/s at the ground is a crash).

Hunt strategy:
1. Climb to ~150–250 m until speed is healthy.
2. Pick prey ahead (ground: hare/squirrel for points; air: swift/duck only if you can exceed `minStrike`).
3. Approach from above/behind while gliding (hearing ~8 m); avoid flapping within ~40 m of prey.
4. Dive, then level out below the catch altitude (ground < 1.5 m, mouse < 0.8 m) with vertical speed under 14 m/s — brake if needed.
5. Confirm via `state.score` / `state.msg`, then climb back.
6. Turtles: grab one (fly low over it), climb high, and drop/throw it onto prey from ≥ 215 m for a big bonus.

## 5) Deterministic stepping (testing)

```javascript
await page.evaluate(() => { const g = window.__falconDiveDebug; g.setBird(0, 200, 60); return g.loop(120); });
```

The real-time loop also runs; pause the game (`P`) for exclusive control. `__falconDiveDebug.reset()` starts a new run.

## 6) Success checks

- HTTP 200 on `/`, canvas visible, no console/page errors.
- `state.over === false` while flying; `score` increases after a catch.
- After a crash `state.over === true` and `msg` starts with `CRASHED`.
