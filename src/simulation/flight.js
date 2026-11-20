import { LENS_R } from '../config.js';
import { G, BRAKE_DRAG, STALL_SPEED, DIVE_SPEED, SAFE_VSPEED, CRASH_REVEAL_DELAY, BRAKE_UNLOCK, VIEW_MARGIN, AIR_FOCUS_DIST, CAMERA_VIEW, CHASE_ZOOM_MAX, GROUND_FRAME, GROUND_SHOW_ALT, HIGH_CAM, CEILING_MARGIN, CHASE_MIN_FLY, ABOVE_CEILING_DRAG, DAY_END_HOUR, STATS, BOUNCE_LIFT, BOUNCE_MIN_UP, BOUNCE_LOCK, BOUNCE_STEER, BOUNCE_DRAG, SPIN_R, SPIN_RATE, SPIN_STEER, SPIN_TURN, MOON_GAIN, MOON_LIFT_MAX, ESCAPE_V, MOONSHOT_T, SAT_ABOVE, SAT_SPEED, SAT_WRAP, SPECIES, WATER_PLUNGE_VY, WATER_DRAG, WATER_BUOY, BREATHLESS_BUOY, WATER_EXIT_SPEED, WET_TIME, MOON_BOUNTY } from '../config.js';
import { lerp, clamp, randDir, wrapAngle } from '../core/math.js';

export function createFlight({ session, viewport, systems }) {
  // ---------- Coordinate helpers ----------
  const toScreenX = x => viewport.W / 2 + (x - session.cam.x) * session.cam.zoom;
  const toScreenY = alt => viewport.H / 2 - (alt - session.cam.alt) * session.cam.zoomY;

  // Freeze the bird's current screen position; the camera then zooms/reframes around it (see the camera update)
  function holdCamera() {
    const sx = clamp(toScreenX(session.bird.x), viewport.W * 0.15, viewport.W * 0.85);
    const sy = clamp(toScreenY(session.bird.alt), VIEW_MARGIN, viewport.H - systems.progression.groundPx() - 10);
    session.cam.pin = { sx, sy, k: 1, hold: 0.6 };
  }

  // ---------- Update ----------
  function updateParticles(dt) {
    for (const pt of session.particles) {
      pt.x += pt.vx * dt; pt.alt += pt.vy * dt; pt.vy -= G * dt * 0.5; pt.life -= dt;
    }
    session.particles = session.particles.filter(p => p.life > 0);
  }

  function updateCrash(dt) {
    const crash = session.state.crash;
    crash.t += dt;
    for (const puff of crash.smoke) {
      puff.x += puff.vx * dt;
      puff.alt += puff.vy * dt;
      puff.vx *= Math.exp(-dt * 1.5);
      puff.radius += dt * 5;
      puff.life -= dt;
    }
    crash.smoke = crash.smoke.filter(puff => puff.life > 0);
    updateParticles(dt);
  }   // paid into the day's earnings every time you reach the moon

  function updateSatellite(dt) {
    if (session.state.grotto) return;
    let s = session.state.satellite;
    if (!s) s = session.state.satellite = { x: session.bird.x + randDir() * SAT_WRAP * 0.6, alt: session.MAX_ALT + SAT_ABOVE, vx: randDir() * SAT_SPEED, ph: 0 };
    s.ph += dt;
    if (s.down) {
      // Shot down: tumbles back to earth trailing smoke
      if (s.gone) return;
      s.vy -= G * dt; s.x += s.vx * dt; s.alt += s.vy * dt; s.ph += s.spinV * dt;
      if (Math.random() < 0.7) session.particles.push({ x: s.x, alt: s.alt, vx: (Math.random() - 0.5) * 3, vy: 2, life: 1 });
      if (s.alt <= 0) {
        s.gone = true;
        for (let i = 0; i < 24; i++) session.particles.push({ x: s.x, alt: 0.5, vx: (Math.random() - 0.5) * 24, vy: Math.random() * 14, life: 1.2 });
      }
      return;
    }
    s.alt = session.MAX_ALT + SAT_ABOVE;
    s.x += s.vx * dt;
    if (Math.abs(s.x - session.bird.x) > SAT_WRAP) s.x = session.bird.x - Math.sign(s.x - session.bird.x) * SAT_WRAP;
  }
  function startMoonshot() {
    session.state.moonshot = { t: 0, v: session.bird.vy, v0: session.bird.vy, landed: false };
    session.bird.bouncing = null; session.bird.vx = 0; session.bird.angle = Math.PI / 2;
    session.cam.shake = 14;
  }
  function updateMoonshot(dt) {
    const m = session.state.moonshot;
    m.t += dt;
    m.v += (40 + 160 * m.t) * dt;
    session.bird.alt += m.v * dt; session.bird.vy = m.v; session.bird.vx = 0; session.bird.speed = m.v; session.bird.angle = Math.PI / 2;
    session.bird.spinA = (session.bird.spinA || 0) + SPIN_RATE * 1.5 * dt;
    session.bird.invulnT = 1;
    session.cam.shake = Math.max(0, 14 - m.t * 2);
    session.state.msgT -= dt;
    systems.combat.tickToast(dt);
    if (m.t >= MOONSHOT_T) reachMoon();
  }
  function reachMoon() {
    const m = session.state.moonshot;
    m.landed = true; m.t = 0;
    const first = !session.progress.moon;
    if (first) session.progress.moon = session.state.day;
    // Goes on the score card like any other catch
    systems.prey.award({ kind: 'moon', targetKind: 'moon', speed: m.v0 }, { value: MOON_BOUNTY, tags: [first ? 'First landing' : 'Moon landing'] }, 'Caught the moon!');
    systems.combat.achieve('moon');
    systems.session.endDay('moon');
    session.state.recap.records.unshift(first ? 'First falcon on the moon!' : 'Another moon landing');
  }

  function update(dt) {
    if (session.paused || session.screen !== 'hunt') return;
    if (session.state.over) {
      session.state.overT += dt;
      if (session.state.crash) updateCrash(dt);
      if (session.state.moonshot) session.state.moonshot.t += dt;
      // Linger on the crash, sunset or moon landing for a moment, then show the day's recap
      if (session.state.overT > (session.state.crash ? CRASH_REVEAL_DELAY + 2 : session.state.moonshot ? 4 : 2.5)) systems.session.showRecap();
      return;
    }
    if (session.state.grotto) { systems.water.updateGrotto(dt); return; }
    if (session.state.moonshot) { updateMoonshot(dt); return; }

    // Steering: turn toward the mouse (relative to the lens when the bird is above the screen)
    const { x: bx, y: by } = systems.flight.birdAnchor();
    // Convert screen direction to world direction (vertical axis may be compressed)
    const hold = systems.combat.gunAimHeld() && session.mouse.steer;
    const smx = hold ? bx + session.mouse.steer.dx : session.mouse.x, smy = hold ? by + session.mouse.steer.dy : session.mouse.y;
    const target = Math.atan2((by - smy) / session.cam.zoomY, (smx - bx) / session.cam.zoom); // up = positive
    // Effort 0..1: how far the mouse is toward the screen edge in that direction, so every heading
    // (including straight down) can reach full effort, not just the far corners
    const mdx = smx - bx, mdy = smy - by;
    const mouseDist = Math.hypot(mdx, mdy);
    let edgeDist = Infinity;
    if (mouseDist > 0) {
      const ux = mdx / mouseDist, uy = mdy / mouseDist;
      if (ux > 0) edgeDist = Math.min(edgeDist, (viewport.W - bx) / ux);
      if (ux < 0) edgeDist = Math.min(edgeDist, -bx / ux);
      if (uy > 0) edgeDist = Math.min(edgeDist, (viewport.H - by) / uy);
      if (uy < 0) edgeDist = Math.min(edgeDist, -by / uy);
    }
    const fullEffortDist = Math.max(40, Math.min(edgeDist * 0.8, Math.min(viewport.W, viewport.H) * 0.4));
    const effort = Math.max(0.15, Math.min(1, mouseDist / fullEffortDist));
    session.bird.effort = effort;
    const pointingDown = session.bird.angle < -0.35;
    // Mouse well above the bird = flap automatically (with hysteresis so shallow climbs can glide);
    // holding the button always brakes
    const braking = session.mouse.down && !session.bird.brakeLocked && !session.bird.inWater;
    if (braking) {
      session.bird.brakeE = Math.max(0, session.bird.brakeE - dt / systems.progression.brakeDuration());
      if (session.bird.brakeE === 0) session.bird.brakeLocked = true;
    } else {
      session.bird.brakeE = Math.min(1, session.bird.brakeE + dt / systems.progression.brakeRecharge());
      if (session.bird.brakeLocked && session.bird.brakeE >= BRAKE_UNLOCK) session.bird.brakeLocked = false;
    }
    const flapOn = session.bird.mode === 'FLAP' ? 0.3 : 0.45;
    const flapping = !braking && target > flapOn && target < Math.PI - flapOn;
    const diving = !braking && session.bird.speed > DIVE_SPEED && pointingDown;
    // Tucking only pays off level or descending; it fades out by ~15° nose-up
    const tuck = effort * Math.max(0, Math.min(1, (0.25 - session.bird.angle) / 0.25));
    session.bird.tuck = tuck;

    // Turn rate falls off steeply with speed; braking restores agility
    let turnRate = Math.min(3, Math.max(0.25, 3 * Math.pow(22 / Math.max(session.bird.speed, 22), 1.6)));
    if (!braking && !flapping) turnRate *= 1.3 - tuck * 0.5; // tucked wings turn worse
    if (braking) turnRate *= 4;
    // Ground effect: easier to level out when close to the ground
    if (session.bird.alt < 25 && session.bird.angle < 0) turnRate *= 2;
    turnRate *= STATS.agility[systems.progression.tier('agility')];

    let dragK = braking ? BRAKE_DRAG : systems.progression.dragBase() * (1.6 - tuck * 0.8);
    if (session.bird.carrying) dragK *= 1.3;
    let sink = 0;
    if (session.bird.inWater) {
      // Underwater: heavy drag bleeds off the plunge, then you paddle toward the cursor while your breath lasts;
      // buoyancy is mild until you run out of air, then it carries you up
      let wvx = Math.cos(session.bird.angle) * session.bird.speed, wvy = Math.sin(session.bird.angle) * session.bird.speed;
      systems.water.updateLakeBreath(session.bird.inWater, dt);
      const sp0 = Math.hypot(wvx, wvy), swimTop = systems.progression.swimSpeed();
      if (sp0 > swimTop) {
        const k = Math.max(swimTop / sp0, Math.exp(-WATER_DRAG * dt));
        wvx *= k; wvy *= k;
      }
      if (session.bird.breath > 0) {
        const sw = swimTop * effort, dvx = Math.cos(target) * sw - wvx, dvy = Math.sin(target) * sw - wvy;
        const dv = Math.hypot(dvx, dvy), a = Math.min(dv, systems.progression.swimPaddle() * dt);
        if (dv > 0) { wvx += dvx / dv * a; wvy += dvy / dv * a; }
        wvy += WATER_BUOY * dt;
      } else {
        wvx *= Math.exp(-2 * dt);
        wvy += BREATHLESS_BUOY * dt;
      }
      session.bird.speed = Math.max(0.3, Math.hypot(wvx, wvy));
      session.bird.angle = Math.atan2(wvy, wvx);
    } else if (session.bird.bouncing) {
      // Springy Legs bounce: a ballistic arc, then steering gradually returns over one second
      let bvx = Math.cos(session.bird.angle) * session.bird.speed, bvy = Math.sin(session.bird.angle) * session.bird.speed;
      bvy -= G * dt;
      const lockT = session.bird.bouncing.lockT || 0;
      session.bird.bouncing.lockT = lockT - dt;
      const free = session.bird.bouncing.lockT <= 0;
      const controlDt = Math.max(0, dt - Math.max(lockT, 0));
      const control = free ? clamp((session.bird.bouncing.controlT || 0) + controlDt, 0, 1) : 0;
      session.bird.bouncing.controlT = control;
      const ballisticVy = bvy;
      const steer = session.bird.bouncing.spin ? SPIN_STEER : BOUNCE_STEER;
      bvx += Math.cos(target) * steer * effort * control * dt;
      bvy += Math.sin(target) * steer * effort * control * dt;
      if (session.bird.bouncing.spin && free) {
        // The buzzsaw also swings its heading toward the cursor without gaining speed
        const sp = Math.hypot(bvx, bvy), a = Math.atan2(bvy, bvx);
        let da = target - a; da = Math.atan2(Math.sin(da), Math.cos(da));
        const na = a + clamp(da, -SPIN_TURN * effort * control * dt, SPIN_TURN * effort * control * dt);
        // ...and never faster than it left the ground, so swinging a fall sideways can't build speed
        const cs = Math.min(sp, session.bird.bouncing.v0 || sp);
        bvx = Math.cos(na) * cs; bvy = Math.sin(na) * cs;
        // Steering bends the arc sideways or down, never up: the climb stays ballistic
        bvy = Math.min(bvy, ballisticVy);
      }
      const keep = 1 - Math.min(1, systems.progression.dragBase() * BOUNCE_DRAG * session.bird.speed * dt);
      bvx *= keep; bvy *= keep;
      // Stalled at the top of the arc: start falling (the speed floor below must not keep pointing up)
      if (Math.hypot(bvx, bvy) < 0.5) { bvx = 0; bvy = -0.5; }
      session.bird.speed = Math.max(0.5, Math.hypot(bvx, bvy));
      session.bird.angle = Math.atan2(bvy, bvx);
      if (session.bird.bouncing.spin) {
        session.bird.spinA = (session.bird.spinA || 0) + SPIN_RATE * dt * (bvx >= 0 ? -1 : 1);
        session.bird.invulnT = Math.max(session.bird.invulnT || 0, 0.1);
      }
      // Once the launch is over, braking always recovers and a plain bounce hands control back at the top of the arc
      if (free && (braking || (!session.bird.bouncing.spin && bvy < 0))) {
        session.bird.bouncing = null;
      }
    } else if (session.bird.alt > session.MAX_ALT) {
      // Above the ceiling: free flight under gravity, and the bird turns to face its velocity
      let bvx = Math.cos(session.bird.angle) * session.bird.speed, bvy = Math.sin(session.bird.angle) * session.bird.speed;
      bvy -= G * dt;
      const keep = 1 - Math.min(1, dragK * ABOVE_CEILING_DRAG * session.bird.speed * dt);
      bvx *= keep; bvy *= keep;
      if (Math.hypot(bvx, bvy) < 0.5) { bvx = 0; bvy = -0.5; }
      session.bird.speed = Math.max(0.5, Math.hypot(bvx, bvy));
      session.bird.angle = Math.atan2(bvy, bvx);
    } else {
      const diff = wrapAngle(target - session.bird.angle);
      session.bird.angle = wrapAngle(session.bird.angle + Math.sign(diff) * Math.min(Math.abs(diff), turnRate * dt));

      // Along-path physics
      let accel = -G * Math.sin(session.bird.angle);           // gravity along heading
      accel -= dragK * session.bird.speed * session.bird.speed;
      const thinAir = Math.max(0, Math.min(1, (session.MAX_ALT - session.bird.alt) / 50));
      // Climbing steeply: weaker net thrust and a lower speed ceiling
      const climb = Math.max(0, Math.sin(session.bird.angle));
      const flapMax = systems.progression.flapMaxSpeed() - 20 * climb;
      if (flapping && session.bird.speed < flapMax) {
        const taper = Math.min(1, (flapMax - session.bird.speed) / 5);
        accel += systems.progression.flapThrust() * (1 - 0.4 * climb) * (0.4 + 0.6 * effort) * thinAir * taper * (session.bird.carrying ? 0.6 : 1) * (session.bird.wetT > 0 ? 0.6 : 1);
      }
      session.bird.speed = Math.max(2, session.bird.speed + accel * dt);

      // Stall: sink when too slow; a carried turtle adds weight
      if (session.bird.speed < STALL_SPEED) sink = (STALL_SPEED - session.bird.speed) * 1.2;
      if (session.bird.carrying) sink += 1.5;
    }

    // Air-relative velocity plus wind and thermal lift gives ground velocity
    const vx = Math.cos(session.bird.angle) * session.bird.speed;
    const vy = Math.sin(session.bird.angle) * session.bird.speed - sink;
    systems.world.updateWind(dt);
    const gvx = vx + (session.bird.inWater ? 0 : systems.world.windX(session.bird.alt)), gvy = vy + (session.bird.inWater ? 0 : systems.world.updraft(session.bird.x, session.bird.alt));
    const previousAlt = session.bird.alt;
    session.bird.x += gvx * dt;
    session.bird.alt += gvy * dt;

    session.bird.mode = session.bird.inWater ? 'UNDERWATER' : session.bird.bouncing ? (session.bird.bouncing.spin ? 'SPIN' : 'BOUNCE') : braking ? 'BRAKE' : diving ? 'DIVE' : flapping ? 'FLAP' : session.bird.speed < STALL_SPEED ? 'STALL' : 'GLIDE';
    if (session.bird.wetT > 0) session.bird.wetT -= dt;
    systems.prey.updateHearingRange(dt);
    const prevBeat = Math.floor(session.bird.flapT / (Math.PI * 2));
    session.bird.flapT += dt * (flapping ? 14 : 0);
    // Sound rings: one per wingbeat while flapping, a steady hiss while braking, wind roar in a fast dive
    session.state.ringT = (session.state.ringT || 0) - dt;
    const roar = !flapping && !braking && systems.prey.diveNoise() > 12;
    if ((flapping && Math.floor(session.bird.flapT / (Math.PI * 2)) !== prevBeat) || ((braking || roar) && session.state.ringT <= 0)) {
      session.state.rings.push({ x: session.bird.x, alt: session.bird.alt, t: 0, r: systems.prey.hearingRange(), kind: flapping ? 'flap' : braking ? 'brake' : 'wind' });
      session.state.ringT = roar ? 0.25 : 0.35;
    }
    session.bird.vx = gvx; session.bird.vy = gvy;
    session.state.maxSpeed = Math.max(session.state.maxSpeed, session.bird.speed);

    if (!session.bird.inWater && previousAlt <= session.MAX_ALT && session.bird.alt >= session.MAX_ALT && gvy >= ESCAPE_V) {
      startMoonshot();
      return;
    }

    if (braking && session.bird.speed > 25 && Math.random() < 0.5) {
      session.particles.push({ x: session.bird.x, alt: session.bird.alt, vx: -vx * 0.1, vy: -vy * 0.1, life: 0.6 });
    }

    // Water: plunge in when coming down steeply, float back up and burst out
    const lake = session.bird.inWater || (session.bird.alt <= 0 && -session.bird.vy > WATER_PLUNGE_VY ? systems.world.lakeAtX(session.bird.x) : null);
    if (lake) {
      if (!session.bird.inWater) {
        session.bird.inWater = lake; session.bird.entrySpeed = session.bird.speed; session.bird.breath = systems.progression.swimBreath(); session.bird.bouncing = null;
        systems.water.splashAt(session.bird.x, lake);
        session.cam.shake = 0;
        session.cam.surfaceAlt = session.cam.alt;
        session.cam.pin = null;
        if (!session.progress.swum) {
          session.progress.swum = true; systems.progression.saveProgress();
          systems.combat.toast('New upgrade unlocked in the Roost: Swimming', 4);
        }
      }
      session.bird.x = clamp(session.bird.x, lake.x0 + 0.5, lake.x0 + lake.w - 0.5);
      if (session.bird.alt < -(lake.depth - 0.4)) {
        // Lake bed: stop going down
        session.bird.alt = -(lake.depth - 0.4);
        const wvx = Math.cos(session.bird.angle) * session.bird.speed, wvy = Math.max(0, Math.sin(session.bird.angle) * session.bird.speed);
        session.bird.speed = Math.max(0.3, Math.hypot(wvx, wvy)); session.bird.angle = Math.atan2(wvy, wvx);
      }
      if (systems.water.atGrottoMouth(lake)) {
        systems.water.enterGrotto(lake);
        return;
      }
      if (session.bird.alt > -1.5) systems.water.catchDuckFromBelow(lake, dt);
      if (session.bird.alt >= 0) {
        session.bird.inWater = null;
        session.bird.alt = 0.1;
        session.bird.speed = Math.max(session.bird.speed, WATER_EXIT_SPEED);
        session.bird.angle = Math.cos(session.bird.angle) >= 0 ? 0.5 : Math.PI - 0.5;
        session.bird.wetT = WET_TIME;
        for (let i = 0; i < 18; i++) session.particles.push({ x: session.bird.x, alt: 0.3, vx: (Math.random() - 0.5) * 10, vy: 2 + Math.random() * 8, life: 0.8 });
      }
    }
    // Ground contact (a shallow touch on a lake just skims, like the ground)
    if (!session.bird.inWater && session.bird.alt <= 0) {
      if (-session.bird.vy > SAFE_VSPEED && session.state.bounces > 0) {
        // Springy Legs: bounce off like a ball, mirroring the impact angle; the harder the impact, the higher the launch
        session.state.bounces--;
        const impact = Math.hypot(session.bird.vx, session.bird.vy);
        // Moon Springs: bounces in an unbroken spin chain hit progressively harder
        const chain = session.bird.bouncing && session.bird.bouncing.spin ? (session.bird.bouncing.chain || 0) + 1 : 0;
        const lift = systems.progression.moonSprings() ? Math.min(MOON_LIFT_MAX, 1 + MOON_GAIN * chain) : BOUNCE_LIFT;
        const bvx = session.bird.vx * lift, bvy = Math.max(BOUNCE_MIN_UP, -session.bird.vy * lift);
        session.bird.alt = 0.2; session.bird.speed = Math.hypot(bvx, bvy); session.bird.angle = Math.atan2(bvy, bvx);
        session.bird.vx = bvx; session.bird.vy = bvy;
        session.bird.bouncing = { spin: systems.progression.bounceSpin(), v0: Math.max(session.bird.speed, impact * lift), lockT: BOUNCE_LOCK, chain };
        session.bird.spinA = session.bird.angle;
        session.cam.shake = Math.max(session.cam.shake, 6 + chain * 2);
        session.state.bestLaunch = Math.max(session.state.bestLaunch || 0, bvy);
        for (let i = 0; i < 24; i++) session.particles.push({ x: session.bird.x, alt: 0.3, vx: (Math.random() - 0.5) * 16, vy: Math.random() * 8, life: 0.9 });
      } else if (-session.bird.vy > SAFE_VSPEED) {
        session.state.crash = {
          t: 0,
          smoke: Array.from({ length: 18 }, () => {
            const life = 1.8 + Math.random() * 0.7;
            return { x: session.bird.x + (Math.random() - 0.5) * 5, alt: 1 + Math.random() * 2,
                     vx: (Math.random() - 0.5) * 14, vy: 5 + Math.random() * 10,
                     radius: 2 + Math.random() * 4, life, maxLife: life };
          })
        };
        systems.session.endDay('crash');
        session.state.msg = `CRASHED at ${(session.bird.speed * 3.6).toFixed(0)} km/h — the hunt is over for today`;
        for (let i = 0; i < 40; i++) session.particles.push({
          x: session.bird.x, alt: 0, vx: (Math.random() - 0.5) * 30, vy: Math.random() * 20, life: 1.5
        });
        session.bird.alt = 0;
        return;
      } else {
        session.bird.alt = 0;
        session.bird.bouncing = null;
        if (session.bird.angle < 0) session.bird.angle = 0; // skim along the ground
      }
    }
    // Buzzsaw spin: anything you plough through is taken out
    if (session.bird.bouncing && session.bird.bouncing.spin) {
      for (const [x, alt, , hit] of systems.combat.gunTargets()) {
        if (hit.type === 'fish' || Math.hypot(x - session.bird.x, alt - session.bird.alt) > SPIN_R) continue;
        systems.combat.takeShot(hit, 'BUZZSAW!', 'buzzsaw');
        systems.combat.achieve('buzzsaw');
        for (let i = 0; i < 14; i++) session.particles.push({ x, alt: Math.max(0.5, alt), vx: (Math.random() - 0.5) * 20, vy: Math.random() * 12, life: 0.9 });
      }
    }

    session.state.time += dt;
    // Day clock: warn at dusk; at sunset let any falling turtles land, then end the day
    const hour = systems.session.huntHour();
    if (!session.state.sunset && hour >= DAY_END_HOUR) {
      session.state.sunset = true;
      session.bird.carrying = null;
      session.state.msg = 'Sunset — the hunt is over'; session.state.msgT = 3;
    }
    if (session.state.sunset && !session.state.fallers.length) {
      systems.session.endDay('sunset');
      session.state.msg = 'Sunset — the hunt is over';
      return;
    }
    session.state.fog += ((systems.world.insideCloud(session.bird.x, session.bird.alt) ? 1 : 0) - session.state.fog) * Math.min(1, dt * 3);
    // Lowest altitude in the current low pass; resets once you climb away
    session.bird.passMin = session.bird.alt > 30 ? Infinity : Math.min(session.bird.passMin, session.bird.alt);

    // Wake samples that push the grass aside behind a low-flying bird
    session.state.wakeT -= dt;
    if (session.bird.alt < 6 && session.state.wakeT <= 0) {
      session.state.wake.push({ x: session.bird.x, t: session.state.time, s: (1 - session.bird.alt / 6) * Math.min(1, session.bird.speed / 20) });
      session.state.wakeT = 0.04;
    }
    session.state.wake = session.state.wake.filter(w => session.state.time - w.t < 1.5);

    // Prey
    for (const p of session.prey) {
      if (p.frozenT > 0) {
        // Screeched: frozen in place (fliers just flutter along slowly); can still be caught
        p.frozenT -= dt;
        if (SPECIES[p.kind].air && !p.sitting) p.x += (p.vx || 0) * 0.15 * dt;
        p.curVx = 0;
        if (!session.bird.carrying && !session.bird.inWater && !p.gone) systems.prey.checkCatch(p, dt);
        continue;
      }
      if (SPECIES[p.kind].air) systems.prey.updateAirPrey(p, dt); else systems.prey.updateGroundPrey(p, dt);
      systems.prey.updateTurn(p, dt);
      p.flyT = SPECIES[p.kind].air && !p.sitting ? (p.flyT ?? 0) + dt : 0;
      if (systems.prey.SENSES[p.kind]) systems.prey.updateLook(p, dt);
      p.alertT -= dt;
      if (!session.bird.carrying && !session.bird.inWater && !p.gone) systems.prey.checkCatch(p, dt);
    }
    if (!session.bird.carrying && session.mouse.aiming && session.mouse.talonTarget) {
      systems.prey.grabFallingTurtle(session.mouse.talonTarget, dt);
    }
    systems.combat.updateFallers(dt);
    systems.combat.updateGuns(dt);
    updateSatellite(dt);
    systems.water.updateFish(dt);
    systems.companions.updateEyases(dt);
    systems.companions.updateFeathers(dt);
    systems.world.updateWeather(dt);
    systems.hazards.updateRivals(dt);
    if (session.state.over) return;
    systems.hazards.updateHazards(dt);
    if (session.state.over) return;
    systems.prey.spawnPreyAhead();

    // Particles
    updateParticles(dt);
    for (const r of session.state.rings) r.t += dt;
    session.state.rings = session.state.rings.filter(r => r.t < 0.8);
    session.state.msgT -= dt;
    systems.combat.tickToast(dt);

    // Camera: centred on the bird with a small lead along its velocity. The view height grows with speed and
    // altitude (CAMERA_VIEW), so it isn't tied to keeping the ground on screen.
    const viewH = clamp(CAMERA_VIEW.base + CAMERA_VIEW.perSpeed * session.bird.speed + CAMERA_VIEW.perAlt * session.bird.alt,
                        CAMERA_VIEW.base, CAMERA_VIEW.max);
    const showK = session.bird.inWater || session.bird.alt < 0 ? 0 : systems.progression.groundShowK();
    const highK = session.bird.inWater ? 0 : systems.progression.highCamK();
    const baseZoom = lerp(systems.progression.groundFitZoom(viewport.H / viewH, showK), viewport.H / viewH * HIGH_CAM.zoom, highK);
    if (!Number.isFinite(session.cam.gz)) session.cam.gz = baseZoom;
    session.cam.gz += (baseZoom - session.cam.gz) * Math.min(1, dt * 1.5);
    // Low down, never lag behind the zoom-out needed to keep the ground in view
    if (showK >= 1) session.cam.gz = Math.min(session.cam.gz, systems.progression.groundFit());
    const lead = (v, span) => clamp(v / 50, -1, 1) * span * 0.12 / session.cam.gz;
    let zoom = session.cam.gz, zoomY = session.cam.gz;
    let camX = session.bird.x + lead(session.bird.vx, viewport.W), camAlt = session.bird.alt + lead(session.bird.vy, viewport.H);
    // Soft ground framing: pull the view down so the ground sits on the bottom band, as long as the bird stays
    // at least GROUND_FRAME.top from the top of the screen; blended at GROUND_FRAME.stick (not a hard rule),
    // except below GROUND_SHOW_ALT where it's always applied. Fades out once the ground is too far below.
    const floorAlt = (viewport.H / 2 - systems.progression.groundPx()) / zoomY, maxShift = viewport.H * (0.5 - GROUND_FRAME.top) / zoomY;
    const groundAlt = Math.max(floorAlt, session.bird.alt - maxShift);
    const reach = clamp(GROUND_FRAME.fade - (camAlt - floorAlt) / maxShift, 0, 1) * (1 - highK);
    camAlt = lerp(camAlt, Math.min(camAlt, groundAlt), lerp(GROUND_FRAME.stick * reach, 1, showK));

    // Air chase: frame the bird and ONE locked flying target. Only birds that have been airborne for a moment
    // and are roughly ahead of you qualify, and the lock is kept until lost, so flocks of ducks (or ducks
    // taking off) don't yank the framing around.
    const distTo = p => Math.hypot(p.x - session.bird.x, p.alt - session.bird.alt);
    const aheadCos = p => {
      const d = distTo(p), v = Math.max(1, session.bird.speed);
      return d < 1 ? 1 : ((p.x - session.bird.x) * session.bird.vx + (p.alt - session.bird.alt) * session.bird.vy) / (d * v);
    };
    const airOk = p => !session.bird.inWater && p && SPECIES[p.kind].air === true && !p.gone && !p.spent && !p.sitting && (p.flyT ?? 0) > CHASE_MIN_FLY;
    // High up, birds look tiny: frame chases from further out and zoom in much closer
    const hiK = clamp((session.bird.alt - 120) / 150, 0, 1);
    const focusDist = AIR_FOCUS_DIST * (1 + 0.8 * hiK), chaseMax = CHASE_ZOOM_MAX + 2.3 * hiK, frameK = 0.15 + 0.1 * hiK;
    const prevLock = session.cam.lock;
    let lock = airOk(prevLock) && distTo(prevLock) < focusDist * 1.2 && aheadCos(prevLock) > -0.2 ? prevLock : null;
    if (!lock) {
      let bd = focusDist;
      for (const p of session.prey) {
        if (!airOk(p) || aheadCos(p) < 0.6) continue;
        const d = distTo(p);
        if (d < bd) { bd = d; lock = p; }
      }
    }
    session.cam.lock = lock;
    // Losing the target (usually a catch) would reframe the shot; pin the bird on screen instead
    if (!session.bird.inWater && prevLock && lock !== prevLock && session.cam.focus > 0.1) holdCamera();
    const td = lock ? distTo(lock) : Infinity;
    const want = lock ? Math.min(1, (focusDist - td) / (30 + 30 * hiK)) : 0;
    session.cam.focus += (want - session.cam.focus) * Math.min(1, dt * (want > session.cam.focus ? 1.5 : 1));
    session.cam.tgt = want > 0 ? lock : null;
    if (lock) {
      // Frame closer to the bird than the target so the falcon stays near the centre
      const ox = (lock.x - session.bird.x) * 0.35, oalt = (lock.alt - session.bird.alt) * 0.35;
      const spread = td * 0.65 + (lock.kind === 'flock' ? 15 : 0);
      const k = Math.min(1, dt * 3);
      if (!session.cam.ft) session.cam.ft = { ox, oalt, r: spread };
      session.cam.ft.ox += (ox - session.cam.ft.ox) * k; session.cam.ft.oalt += (oalt - session.cam.ft.oalt) * k; session.cam.ft.r += (spread - session.cam.ft.r) * k;
    }
    if (session.cam.focus > 0.001 && session.cam.ft) {
      const az = Math.min(chaseMax * baseZoom, 10, (Math.min(viewport.W, viewport.H) * frameK) / Math.max(session.cam.ft.r * 2, 6));
      const f = session.cam.focus;
      zoom = lerp(zoom, Math.max(zoom, az), f); zoomY = zoom;
      camX = lerp(camX, session.bird.x + session.cam.ft.ox, f);
      camAlt = lerp(camAlt, session.bird.alt + session.cam.ft.oalt, f);
    }
    // Framing is smoothed as an offset from the bird, so the bird's own motion never lags on screen
    if (!Number.isFinite(session.cam.ox)) { session.cam.ox = camX - session.bird.x; session.cam.oa = camAlt - session.bird.alt; }
    const ks = Math.min(1, dt * 3);
    session.cam.ox += (camX - session.bird.x - session.cam.ox) * ks;
    session.cam.oa += (camAlt - session.bird.alt - session.cam.oa) * ks;
    let cx = session.bird.x + session.cam.ox, ca = session.bird.alt + session.cam.oa;
    // Camera pin: keep the bird at the same screen spot (zooming around it) so the mouse still points the
    // same way; after a short hold, ease back to the normal framing over ~2 s
    if (session.cam.pin) {
      const pin = session.cam.pin;
      pin.hold -= dt;
      if (pin.hold <= 0) pin.k -= dt * 0.4;
      if (pin.k <= 0) session.cam.pin = null;
      else {
        const pinK = pin.k * pin.k * (3 - 2 * pin.k);
        cx = lerp(cx, session.bird.x - (pin.sx - viewport.W / 2) / zoom, pinK);
        ca = lerp(ca, session.bird.alt - (viewport.H / 2 - pin.sy) / zoomY, pinK);
      }
    }
    // Keep the ground band consistent until the bird commits to a dive.
    const floorPx = systems.progression.groundPx();
    session.cam.floorPx = Number.isFinite(session.cam.floorPx) ? session.cam.floorPx + (floorPx - session.cam.floorPx) * Math.min(1, dt * 2) : floorPx;
    ca = Math.max(ca, (viewport.H / 2 - session.cam.floorPx) / zoomY);
    // Bounces can fly far above the ceiling: let the camera follow them up (easing back once they end)
    const liftWant = session.bird.bouncing ? Math.max(0, session.bird.alt + 40 - session.MAX_ALT) : 0;
    session.cam.ceilLift = Number.isFinite(session.cam.ceilLift) ? session.cam.ceilLift + (liftWant - session.cam.ceilLift) * Math.min(1, dt * (liftWant > session.cam.ceilLift ? 20 : 2)) : 0;
    ca = Math.min(ca, session.MAX_ALT + CEILING_MARGIN + session.cam.ceilLift - viewport.H / 2 / zoomY);
    if (!session.bird.inWater || session.bird.alt > -0.75) session.cam.diveFollow = false;
    else if (session.bird.alt <= -3 && session.bird.vy < 0) session.cam.diveFollow = true;
    const waterFrame = lerp(session.cam.waterFrame ?? 0, session.cam.diveFollow ? 1 : 0, Math.min(1, dt * 5));
    session.cam.waterFrame = waterFrame < 0.001 ? 0 : waterFrame;
    if (session.bird.inWater || session.cam.waterFrame) {
      const surfaceAlt = session.bird.inWater ? (session.cam.surfaceAlt ?? ca) : ca;
      const swimZoom = Math.max(zoom, Math.min(viewport.H / 38, viewport.W / 44));
      ca = lerp(surfaceAlt, Math.min(0, session.bird.alt + session.bird.vy * 0.18), waterFrame);
      cx = lerp(cx, session.bird.x + session.bird.vx * 0.25, waterFrame);
      zoom = zoomY = lerp(zoom, swimZoom, waterFrame);
      if (session.bird.inWater && waterFrame > 0) ca = Math.min(ca, session.bird.alt + viewport.H * 0.4 / zoomY);
    }
    session.cam.zoom = zoom; session.cam.zoomY = zoomY; session.cam.alt = ca; session.cam.x = cx;  session.cam.shake = Math.max(0, (session.bird.speed - 50) / 45) * 4 + (braking ? 3 : 0);
  }
  function birdAboveScreen() { return toScreenY(session.bird.alt) < 8; }

  function birdAnchor() {
    const x = toScreenX(session.bird.x);
    if (!systems.flight.birdAboveScreen()) return { x, y: toScreenY(session.bird.alt) };
    return { x: Math.max(LENS_R + 10, Math.min(viewport.W - LENS_R - 10, x)), y: LENS_R + 12 };
  }

  return { birdAnchor, birdAboveScreen, toScreenX, toScreenY, update, updateParticles };
}
