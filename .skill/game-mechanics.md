# Falcon Dive — how the game works

Single-file 2D canvas game ([index.html](../index.html)). You are a peregrine falcon flying over an endless side-scrolling landscape, hunting prey for points. There is no win state: score as much as you can before you crash.

Units: metres, seconds, m/s (HUD shows km/h = m/s × 3.6). `alt` = altitude above ground in metres. World x grows to the right.

## Controls

| Input | Effect |
|---|---|
| Mouse position | Steering. The bird turns toward the cursor (relative to the bird's screen position). Distance from the bird = "effort" (0.15–1). |
| Cursor well above the bird | Auto-flap (thrust). Starts when target angle > 0.45 rad, stops < 0.3 rad (hysteresis). |
| Hold left button | Air brake (drag ×10, turn rate ×4, time slows to 0.55×). Meter drains in 2.5 s, refills in 5 s; after running dry it is locked until refilled to 30 %. |
| Right button (hold) while carrying a turtle | Aim the throw (slow-mo); release to throw with up to 10 m/s extra push toward the cursor. |
| Right button near a falling turtle | Hold, then release within 18 m to talon-grab it mid-air. |
| `Space` | Drop the carried turtle (unaimed). |
| `P` / `Esc` / pause button / window blur | Pause. Click while paused to resume. |
| Click after a crash | Restart (`reset()` with a freshly seeded world). |

Flight modes (`bird.mode`): `GLIDE`, `FLAP`, `DIVE` (speed > 40 m/s and pointing down), `BRAKE`, `STALL` (speed < 10 m/s, you sink).

## Flight physics

- Gravity 9.81 m/s² along the heading; quadratic drag giving a terminal dive of ~95 m/s (~340 km/h).
- Tucking (cursor far away, level or down) reduces drag; tucked wings turn worse. Turn rate falls steeply with speed.
- Flapping gives 30 m/s² thrust, capped at 50 m/s and weaker when climbing; carrying a turtle adds drag/weight and cuts thrust.
- Ceiling 500 m: above it there is no flapping, only ballistic flight (the bird falls back).
- Wind (altitude-dependent, changes over time), thermals/updrafts, and ridge lift alter ground velocity.
- **Crash:** touching the ground (`alt <= 0`) with descent rate > 14 m/s ends the run. Slower contact just skims the ground.
- On a crash, smoke puffs rise and expand before the game-over message and dimming appear after 0.9 seconds. Restart clicks are ignored during that initial impact animation; smoke and debris continue animating after game over.
- Start state: x=0, alt=220 m, speed 20 m/s.

## Prey and scoring

Ground prey is caught by flying below its `catchAlt` while passing within its radius (or crossing its x between frames). Air prey is caught by passing within ~`max(3, 22/zoom)` m while meeting speed requirements.

| Prey | Type | Base pts | Notes |
|---|---|---|---|
| Mouse | ground | 80 | Nocturnal; catchAlt 0.8 m; returns to its burrow at 9 m/s, hides for at least 5 seconds, and emerges only when the falcon is more than 60 m away |
| Rabbit | ground | 100 | Dawn/dusk; ignores sight/hearing detection |
| Hare | ground | 200 | Full-circle hearing radius, 75 m sight |
| Squirrel | ground | 250 | Evades with short 0.12-0.22 s feints at 7 m/s, followed by 0.55-0.9 s sprint bursts away from the falcon at 22 m/s |
| Turtle | ground | 300 | Not scored on pickup — you carry it (see below) |
| Pigeon | air | 300 | Own speed ≥ 90 km/h and relative ≥ 54 km/h |
| Duck | air | 400 | ≥ 120 / 72 km/h; also rests on lakes, takes off when alerted |
| Swift | air | 500 | ≥ 60 / 36 km/h; very fast reactions |
| Starling flock | air | 350 | No speed requirement; first catch scatters the flock, grab more within 2 s for +150 each |

Formulas:
- Ground catch: `pts + speed*10 + (1 - minAlt/catchAlt)*200` (fast and low is better).
- Air catch: `pts + closingSpeed*10`.
- Fleeing prey can still be caught, including while it fades out after its flee timer expires (`p.outran`). Most ground prey run at 10–18 m/s; squirrels alternate brief feints with faster sprints.
- After the species-specific escape timer expires, prey fade out over 1.2 seconds and are removed. Continued fleeing does not restart the fade. Squirrels start fading after 4.5 seconds of evasion. Mice instead return to their burrows and hide; generic flee movement and timed fading do not apply to them.
- Idle mice stay near their starting area, keeping their burrows reachable. Burrows remain visible while their mice are hidden; hidden mice cannot be targeted or caught.
- Failing an air catch (too slow / bad angle) makes the prey escape for good (no further catch) and shows a message.
- **Turtle strike** (dropping a turtle onto prey): `2*pts + 500 + impact*5`. The shell cracks at ≥ 65 m/s impact (~215 m free fall). Aimed throws lock onto ground animals within 20 m of the landing spot or fliers within 15 m of the arc, with gentle homing (5 m/s²). Hitting a rival buzzard: `400 + impact*6`. The first turtle strike unlocks the "Aeschylus" achievement (localStorage).

Spawn mix depends on time of day (`ACTIVITY`): mice/hares at night, rabbits and starlings at dusk/dawn, most others by day. Prey spawns ~1500 m ahead and despawns far behind.

## Prey senses (stealth)

Prey notice the falcon by:
- **Vision cone** — per-species range/half-angle/reaction time (hare 75 m, pigeon 45 m, swift 30 m...). Fliers watch forward-and-down, so stoops from above/behind go unseen.
- **Hearing** — a circle around the prey; radius = max(flap 40 m, brake 25 m, dive wind roar 8–30 m). Quiet gliding is only ~8 m.
- The hearing radius eases toward that action-dependent target (0.5-second rise / 0.8-second fall time constants). Detection, hearing-zone visuals and emitted sound rings all use the same smoothed radius.
- **Shadow** — below 75 m altitude in daylight, your shadow on the ground alerts hares, mice and squirrels when it falls inside their vision cone (they must be able to "see" the ground; the squirrel's cone was widened to include it).

Alerted prey flee or spook. Cones are drawn in-game and available via `__falconDiveDebug.sensesFor(p)`. Strategy: approach from above/behind, glide silently, dive late, and level out below the 14 m/s vertical limit.

Alert exclamation marks are red for sight or shadow detection and yellow for sound. They remain visible throughout fleeing, spooking or scattering, fade with escaping prey, and disappear when prey hide or are removed. This includes scattering flocks during a catch combo. Noticing question marks stay white. The nearest-target arrow stays above active warnings so it does not cover them, even after the initial alert timer expires.

## World and hazards

- Procedural world re-seeded on every `reset()`: thermals, sinks, ridges, lakes, cumulus clouds (fog inside), storms, day/night cycle.
- Rival buzzards patrol thermals (can be hit with a turtle).
- Camera auto-zooms with altitude/speed; HUD shows score, speed gauge, brake meter, catch log.

## Debug / automation hook

`window.__falconDiveDebug` (defined in [index.html](../index.html)):

| Member | Purpose |
|---|---|
| `bird`, `prey`, `state` | Live objects (`bird.x/alt/speed/angle/mode/brakeE/carrying`, `state.score/catches/over/msg`) |
| `snapshot()` | Cloned `{bird, state, prey}` |
| `step(dt=1/60)` | Advance one physics step, return snapshot (no-op while paused or over) |
| `loop(frames, dt)` | Step N frames, return an array of snapshots |
| `sensesFor(p)`, `sensed(p)`, `senses` | Inspect prey detection |
| `setBird(x, alt, speed)` | Teleport the bird |
| `reset()` | Start a new run |

The real `requestAnimationFrame` loop keeps running alongside `step`/`loop`. A window blur pauses the game.
