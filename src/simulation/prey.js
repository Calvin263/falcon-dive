import { G, TURTLE_THROW, THROW_LOCK_GROUND, THROW_LOCK_AIR, STARLING_COMBO_TIME, TURN_TIME, STARLING_EXTRA, HAZARD_NAME, STATS, AIM_STATS, SPECIES, ACTIVITY, SPAWN_REACH, SPAWN_KEEP, LAKE_SPACING, GUN_THROW_VY, GUN_REGRAB_T, SUBMERGED_HIDE, SHADOW_REACTORS, IGNORE_DETECTION } from '../config.js';
import { clamp, randDir, wrapAngle } from '../core/math.js';

export function createPrey({ session, viewport, systems }) {
  function pickKind(air) {
    const d = systems.world.daylight(), tw = systems.world.twilight();
    const kinds = Object.keys(SPECIES).filter(k => SPECIES[k].air === air);
    const wt = k => SPECIES[k].weight * ACTIVITY[k](d, tw);
    let r = Math.random() * kinds.reduce((sum, k) => sum + wt(k), 0);
    for (const k of kinds) { r -= wt(k); if (r <= 0) return k; }
    return kinds[0];
  }

  function makeGround(x, kind = pickKind(false)) {
    const dir = randDir();
    const p = { kind, x, vx: dir * (2 + Math.random() * 4), hopT: Math.random() * 10, failCD: 0, alertT: 0, shadowReach: 0 };
    if (kind === 'hare') p.vx = dir * (1 + Math.random() * 2);
    if (kind === 'mouse') {
      p.home = x + randDir() * (20 + Math.random() * 25); p.wanderX = x;
      p.vx = dir * (1 + Math.random()); p.moving = true; p.pauseT = 0;
    }
    if (kind === 'squirrel') { p.wanderX = x; p.vx = dir * 2; }
    if (kind === 'turtle') p.vx = dir * 0.4;
    return p;
  }

  function makeAir(x, kind = pickKind(true)) {
    const s = SPECIES[kind], dir = randDir();
    const alt = s.alt[0] + Math.random() * (s.alt[1] - s.alt[0]);
    const p = { kind, x, alt, baseAlt: alt, vx: dir * s.speed, vy: 0, h: dir > 0 ? 0 : Math.PI,
                flapT: Math.random() * 10, t: Math.random() * 10, spookT: 0, turnT: 0, failCD: 0, alertT: 0, shadowReach: 0 };
    if (kind === 'flock') {
      p.scatterT = 0;
      p.members = Array.from({ length: 24 }, () => ({
        ox: (Math.random() - 0.5) * 30, oy: (Math.random() - 0.5) * 14, ph: Math.random() * 6.28,
        r: 1 + Math.random() * 3, dx: 0, dy: 0, svx: 0, svy: 0, caught: false, x, alt
      }));
    }
    return p;
  }
  const groundGap = () => 150 + Math.random() * 300;
  const airGap = () => 250 + Math.random() * 350;
  function newSpawnWindow(x) {
    return { gLo: x - 150, gHi: x + 150, aLo: x - 300, aHi: x + 300, lakes: new Set() };
  }

  function spawnPreyAhead() {
    let s = session.state.spawn;
    const lo = session.bird.x - SPAWN_REACH, hi = session.bird.x + SPAWN_REACH;
    const keepLo = session.bird.x - SPAWN_KEEP, keepHi = session.bird.x + SPAWN_KEEP;
    // A jump past the whole window (e.g. a teleport) leaves nothing worth keeping; start a fresh window
    if (s.gHi < keepLo || s.gLo > keepHi) s = session.state.spawn = newSpawnWindow(session.bird.x);
    s.gHi = Math.min(s.gHi, keepHi); s.gLo = Math.max(s.gLo, keepLo);
    s.aHi = Math.min(s.aHi, keepHi); s.aLo = Math.max(s.aLo, keepLo);
    const ground = x => { if (!systems.world.lakeAtX(x)) session.prey.push(makeGround(x)); };
    for (; s.gHi < hi; s.gHi += groundGap()) ground(s.gHi);
    for (; s.gLo > lo; s.gLo -= groundGap()) ground(s.gLo);
    for (; s.aHi < hi; s.aHi += airGap()) session.prey.push(makeAir(s.aHi));
    for (; s.aLo > lo; s.aLo -= airGap()) session.prey.push(makeAir(s.aLo));
    // Ducks resting on each lake in reach, ready to take off when they notice you
    for (let i = Math.floor((lo - 1300) / LAKE_SPACING); i <= Math.ceil((hi - 400) / LAKE_SPACING); i++) {
      const l = systems.world.lakeAt(i);
      if (!l.on || s.lakes.has(i) || l.x0 > hi || l.x0 + l.w < lo) continue;
      s.lakes.add(i);
      for (let n = 0; n < 2 + Math.floor(Math.random() * 3); n++) {
        const d = makeAir(l.x0 + l.w * (0.15 + Math.random() * 0.7), 'duck');
        Object.assign(d, { sitting: true, alt: 0.4, lake: l, vx: randDir() * (0.6 + Math.random() * 0.6) });
        session.prey.push(d);
      }
      for (let n = 0; n < 4 + Math.floor(Math.random() * 4); n++) session.state.fish.push(systems.water.makeFish(l, Math.random() < 0.7 ? 'trout' : 'pike'));
    }
    for (const i of s.lakes) {
      const l = systems.world.lakeAt(i);
      if (l.x0 > keepHi || l.x0 + l.w < keepLo) s.lakes.delete(i);
    }
    session.prey = session.prey.filter(p => !p.gone && p.x > keepLo && p.x < keepHi);
    session.state.fish = session.state.fish.filter(f => !f.gone && f.x > keepLo && f.x < keepHi);
  }

  // ---------- Senses ----------
  // Vision cone (world angle, up = positive) plus hearing that depends on how noisy the bird is
  // Flying birds watch forward and down (where they're going and the ground below), so a stoop from above or behind goes unseen
  // Gaze follows the animal's eased facing (turnK), so it sweeps over the top while it turns around
  const forwardDown = (p, tilt) => { const k = turnK(p); return Math.atan2(p.vy, Math.abs(p.vx) * k) - tilt * k; };
  const groundLook = (p, up) => Math.atan2(Math.sin(up), Math.cos(up) * turnK(p));
  const SENSES = {
    rabbit:    { range: 60,  half: 1.0, reaction: 0.45, look: p => groundLook(p, 0.8) },
    hare:      { range: 75,  half: 1.2, reaction: 0.3,  look: p => groundLook(p, 0.9) }, // hare looks ahead; hearing is a simple full-circle radius
    mouse:     { range: 50,  half: 0.9, reaction: 0.5,  look: p => groundLook(p, 0.7) },
    squirrel:  { range: 75,  half: 1.0, reaction: 0.5,  look: p => groundLook(p, 0.8) }, // cone reaches down to the ground so it can see shadows
    turtle:    { range: 35,  half: 0.8, reaction: 0.7,  look: p => groundLook(p, 0.5) },
    pigeon:    { range: 45,  half: 1.4, reaction: 0.25, look: p => forwardDown(p, 0.6) },
    duck:      { range: 70,  half: 1.3, reaction: 0.4,  look: p => (p.sitting ? forwardDown(p, -0.8) : forwardDown(p, 0.6)) }, // resting ducks watch the sky
    swift:     { range: 30,  half: 1.5, reaction: 0.1,  look: p => forwardDown(p, 0.5) },
    flock:     { range: 35,  half: Math.PI, reaction: 0.3, look: () => 0 },
  };
  // Wind roar from a fast stoop: 8 m when gliding, growing to ~30 m at full dive speed
  const diveNoise = () => 8 + Math.max(0, Math.min(1, (session.bird.speed - 42) / 53)) * 22;
  const hearingRange = () => session.state.hearingRadius;
  function updateHearingRange(dt) {
    const target = Math.max(session.bird.mode === 'FLAP' ? 40 : session.bird.mode === 'BRAKE' ? 25 : 0, diveNoise()) * STATS.noise[systems.progression.tier('silent')];
    const duration = target > session.state.hearingRadius ? 0.5 : 0.8;
    session.state.hearingRadius += (target - session.state.hearingRadius) * (1 - Math.exp(-dt / duration));
  }
  const eyeAlt = p => (SPECIES[p.kind].air ? p.alt : 0.3);

  const lookAngle = p => p.lookA ?? SENSES[p.kind].look(p);

  // Gaze turns gradually so vision cones don't snap when an animal changes direction
  function updateLook(p, dt) {
    const target = SENSES[p.kind].look(p);
    if (p.lookA == null) { p.lookA = target; return; }
    const diff = wrapAngle(target - p.lookA), max = (p.spookT > 0 || p.alertT > 0 ? 3 : 1) * dt;
    p.lookA = wrapAngle(p.lookA + Math.max(-max, Math.min(max, diff)));
  }

  // Eased facing in [-1, 1]: animals swing round over ~TURN_TIME instead of flipping instantly
  const turnK = p => p.turn ?? (((p.face ?? p.vx) < 0) ? -1 : 1);
  function updateTurn(p, dt) {
    const v = p.face ?? p.vx;
    const want = v < 0 ? -1 : v > 0 ? 1 : (p.turn ?? 1);
    if (p.turn == null) { p.turn = want; return; }
    const rate = (2 / TURN_TIME) * (p.spookT > 0 || p.alertT > 0 ? 3 : 1);
    p.turn += clamp(want - p.turn, -rate * dt, rate * dt);
  }
  // How much of its intended speed an animal can use while still turning (0 facing away → 1 fully round)
  const turnAlign = (p, vx) => (p.turn == null || !vx ? 1 : clamp(0.5 + 0.5 * p.turn * Math.sign(vx), 0, 1));

  // Idle wandering: reverse direction every few seconds rather than at random each frame
  function wanderFlip(p, dt) {
    p.turnT = (p.turnT ?? 3 + Math.random() * 4) - dt;
    if (p.turnT <= 0) { p.vx *= -1; p.turnT = 3 + Math.random() * 4; }
  }

  const hearingAngle = p => lookAngle(p);
  const hearingHalf = p => Math.PI;

  function sensesInfo(p) {
    if (p.hidden || IGNORE_DETECTION.has(p.kind)) return { reason: null, seen: false, heard: false };
    // Nothing on land or in the air can make out a bird swimming more than a metre down
    if (session.bird.inWater && session.bird.alt < -SUBMERGED_HIDE) return { reason: null, seen: false, heard: false };
    const s = SPECIES[p.kind].air && !p.sitting ? null : p;
    const sn = SENSES[p.kind] ?? { range: 30, half: 0.8, reaction: 0.5, look: () => 0 };
    const range = visionRange(sn);
    const dx = session.bird.x - p.x, dy = session.bird.alt - eyeAlt(p), d = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);
    const seen = d < range && Math.abs(wrapAngle(ang - lookAngle(p))) <= sn.half;
    const heard = d < hearingRange() && Math.abs(wrapAngle(ang - hearingAngle(p))) <= hearingHalf(p);

    // Shadow checks use the animal's forward-facing cone. That keeps the shadow warning fair and avoids
    // shadow-only detection when the shadow falls outside the creature's actual field of view.
    if (s && SHADOW_REACTORS.has(p.kind) && systems.world.daylight() > 0.3 && session.bird.alt < systems.progression.shadowDetectAlt()) {
      const shadowDx = systems.progression.shadowWorldX() - p.x;
      const shadowDy = 0 - eyeAlt(p);
      const shadowAng = Math.atan2(shadowDy, shadowDx);
      const shadowInView = Math.abs(wrapAngle(shadowAng - lookAngle(p))) <= sn.half && Math.abs(shadowDx) < Math.max(20, range * 1.2);
      if (shadowInView) return { reason: 'shadow', seen: true, heard: false };
    }
    if (seen) return { reason: 'sight', seen: true, heard: false };
    if (heard) return { reason: 'sound', seen: false, heard: true };
    return { reason: null, seen: false, heard: false };
  }

  function senses(p) {
    return sensesInfo(p).reason != null;
  }

  // everyone sees less in the dark; Stealth shrinks how far prey can pick you out
  const visionRange = sn => sn.range * (0.45 + 0.55 * systems.world.daylight()) * STATS.sight[systems.progression.tier('stealth')];

  // True once the bird has been noticed for longer than the animal's reaction time
  function sensed(p, dt) {
    const sense = sensesInfo(p);
    const nowShadow = sense.reason === 'shadow';
    if (nowShadow) {
      p.shadowReach = Math.min(systems.progression.shadowMaxReach(p), (p.shadowReach || 0) + dt * (p.kind === 'squirrel' ? 180 : 120));
      p.fleeing = true;
    } else {
      p.shadowReach = Math.max(0, (p.shadowReach || 0) - dt * 65);
    }
    if (sense.reason) {
      p.alertT = Math.max(p.alertT || 0, 0.8);
      p.lastSense = sense.reason;
      p.noticed = true;
    }
    p.aware = sense.reason ? (p.aware || 0) + dt : Math.max(0, (p.aware || 0) - dt * 0.5);
    if (p.aware < SENSES[p.kind].reaction) return false;
    p.aware = 0;
    if (!p.fleeing && sense.reason) p.fleeing = true;
    return true;
  }

  const groundEscapeTime = {
    rabbit: 4.5, hare: 3.2, squirrel: 4.5, turtle: 5.0,
  };
  const airEscapeTime = {
    pigeon: 4.5, duck: 3.5, swift: 3.2, flock: 3.8,
  };

  function updateGroundPrey(p, dt) {
    const hdx = p.x - session.bird.x, hdist = Math.abs(hdx);
    let vx = p.vx;
    switch (p.kind) {
      case 'rabbit':
        p.hopT += dt;
        wanderFlip(p, dt);
        vx = p.vx;
        break;
      case 'hare':
        // Bolts with zig-zag jukes once it sees or hears the bird
        if (!(p.spookT > 0) && sensed(p, dt)) {
          p.spookT = 4; p.alertT = 0.8; p.dir = Math.sign(hdx) || 1; p.jukeT = 0.6 + Math.random() * 0.6;
        }
        if (p.spookT > 0) {
          p.spookT -= dt; p.jukeT -= dt;
          if (p.jukeT <= 0) {
            p.dir = -p.dir;
            const away = p.dir === (Math.sign(p.x - session.bird.x) || 1);
            p.jukeT = away ? 0.6 + Math.random() * 0.6 : 0.2 + Math.random() * 0.25;
          }
          vx = p.dir * 16;
          p.hopT += dt * 2.5;
        } else {
          wanderFlip(p, dt);
          vx = p.vx; p.hopT += dt;
        }
        break;
      case 'mouse': {
        if (p.hidden) {
          p.hideT -= dt;
          if (p.hideT <= 0 && hdist > 60) p.hidden = false;
          return;
        }
        if (!p.fleeing && sensed(p, dt)) { p.fleeing = true; p.alertT = 0.8; }
        if (p.fleeing) {
          const d = p.home - p.x;
          if (Math.abs(d) < 0.5) {
            p.hidden = true; p.fleeing = false; p.hideT = 5; p.x = p.home;
            p.curVx = 0; p.moving = false; p.aware = 0; p.alertT = 0;
            return;
          }
          vx = Math.sign(d) * Math.min(9, Math.abs(d) / dt);
          p.moving = true;
          p.hopT += dt * 4;
          break;
        }
        p.pauseT -= dt;
        if (p.pauseT <= 0) {
          p.moving = !p.moving;
          p.pauseT = p.moving ? 0.3 + Math.random() * 0.8 : 0.5 + Math.random() * 1.5;
          if (p.moving && Math.random() < 0.5) p.vx *= -1;
        }
        if (Math.abs(p.x - p.wanderX) > 10) p.vx = Math.sign(p.wanderX - p.x) * Math.abs(p.vx);
        vx = p.moving ? p.vx : 0;
        if (p.moving) p.hopT += dt;
        break;
      }
      case 'squirrel': {
        if (!p.fleeing && sensed(p, dt)) { p.fleeing = true; p.alertT = 0.8; }
        if (p.fleeing) {
          p.feintT = (p.feintT ?? 0) - dt;
          if (p.feintT <= 0) {
            p.feint = !p.feint;
            p.feintT = p.feint ? 0.12 + Math.random() * 0.1 : 0.55 + Math.random() * 0.35;
            const away = Math.sign(hdx) || Math.sign(p.face || p.vx) || 1;
            p.dir = p.feint ? -away : away;
          }
          vx = p.dir * (p.feint ? 7 : 22);
          p.hopT += dt * (p.feint ? 2 : 4);
        } else {
          if (Math.abs(p.x - p.wanderX) > 10) p.vx = Math.sign(p.wanderX - p.x) * 2;
          else wanderFlip(p, dt);
          vx = p.vx; p.hopT += dt;
        }
        break;
      }
      case 'turtle':
        p.hopT += dt;
        break;
    }
    if (p.fleeing && !p.hidden && p.kind !== 'mouse') {
      const away = Math.sign(p.x - session.bird.x) || (p.face ?? (p.vx || 1));
      p.escapeT = (p.escapeT || 0) + dt;
      const maxEscape = groundEscapeTime[p.kind] ?? 4;
      if (!p.spent && p.escapeT >= maxEscape) {
        p.spent = true;
        p.outran = true;
        p.fadeT = 1.2;
        p.alertT = 0.8;
      }
      if (p.kind !== 'squirrel') {
        const speedBoost = 10 + Math.min(8, p.escapeT * 2);
        vx = away * speedBoost;
        if (p.kind === 'hare') vx += (Math.random() - 0.5) * 2.5;
        p.hopT += dt * 2.4;
      }
    }
    if (p.spent) {
      p.fadeT = (p.fadeT ?? 1.2) - dt;
      if (p.fadeT <= 0) { p.gone = true; return; }
    }
    if (vx !== 0) p.face = vx;
    vx *= turnAlign(p, vx);
    p.curVx = vx;
    p.x += vx * dt;
  }

  function spookAir(p) {
    p.spookT = 3; p.alertT = 0.8;
    p.vx = (Math.sign(p.x - session.bird.x) || 1) * Math.abs(p.vx);
    if (p.kind === 'swift') p.h = Math.atan2(p.alt - session.bird.alt, p.x - session.bird.x);
  }

  // A duck resting on the water bursts into flight, away from the bird
  function duckTakeOff(p) {
    if (!p.sitting) return;
    p.sitting = false; p.alertT = 0.8; p.spookT = 2; p.noticed = true;
    p.vx = (Math.sign(p.x - session.bird.x) || 1) * SPECIES[p.kind].speed * 0.6; p.vy = 8;
  }

  function updateAirPrey(p, dt) {
    const s = SPECIES[p.kind];
    p.t += dt; p.spookT -= dt;
    if (p.spookT > 0 || p.fleeing || p.scatterT > 0) {
      p.escapeT = (p.escapeT || 0) + dt;
      const maxEscape = airEscapeTime[p.kind] ?? 4;
      if (!p.spent && p.escapeT >= maxEscape) {
        p.spent = true;
        p.outran = true;
        p.fadeT = 1.2;
        p.alertT = 0.8;
      }
    }
    p.flapT += dt * (p.kind === 'duck' ? 18 : p.kind === 'swift' ? 9 : 13);
    if (p.sitting) {
      // Paddling on the lake until something gives you away
      p.flapT = 0; p.alt = 0.4; p.vy = 0;
      if (p.x < p.lake.x0 + 5) p.vx = Math.abs(p.vx);
      if (p.x > p.lake.x0 + p.lake.w - 5) p.vx = -Math.abs(p.vx);
      p.x += p.vx * dt;
      if (sensed(p, dt)) duckTakeOff(p);
      return;
    }
    if (p.kind === 'pigeon' || p.kind === 'duck') {
      if (p.spookT <= 0 && sensed(p, dt)) spookAir(p);
      const target = (p.spookT > 0 ? 1.5 : 1) * s.speed;
      p.vx = Math.sign(p.vx) * (Math.abs(p.vx) + (target - Math.abs(p.vx)) * Math.min(1, dt * 2));
      p.vy = p.spookT > 0 ? 4 : (p.baseAlt - p.alt) * 0.5 + Math.sin(p.t * 1.3) * 1.2;
    } else if (p.kind === 'swift') {
      p.turnT -= dt;
      if (p.spookT <= 0 && sensed(p, dt)) { spookAir(p); p.spookT = 1; }
      else if (p.turnT <= 0) { p.h += randDir() * (0.8 + Math.random() * 0.8); p.turnT = 0.4 + Math.random() * 0.6; }
      if ((p.alt < s.alt[0] && Math.sin(p.h) < 0) || (p.alt > s.alt[1] && Math.sin(p.h) > 0)) p.h = -p.h;
      p.vx = Math.cos(p.h) * s.speed;
      p.vy = Math.sin(p.h) * s.speed;
    } else if (p.kind === 'flock') {
      p.vy = (p.baseAlt - p.alt) * 0.3 + Math.sin(p.t * 0.5) * 2;
      if (!p.combo && p.scatterT <= 0 && sensed(p, dt)) {
        p.scatterT = 3; p.alertT = 0.8;
        for (const m of p.members) {
          const a = Math.atan2(m.oy, m.ox) + (Math.random() - 0.5);
          m.svx = Math.cos(a) * 14; m.svy = Math.sin(a) * 14;
        }
      }
      p.scatterT -= dt;
      const damp = 1 - Math.min(1, dt * 0.8), regroup = 1 - Math.min(1, dt * 0.6);
      for (const m of p.members) {
        m.ph += dt * (1.2 + m.r * 0.2);
        m.dx += m.svx * dt; m.dy += m.svy * dt;
        m.svx *= damp; m.svy *= damp;
        if (p.scatterT <= 0) { m.dx *= regroup; m.dy *= regroup; }
        m.x = p.x + m.ox + Math.cos(m.ph) * m.r * 2 + m.dx;
        m.alt = Math.max(2, p.alt + m.oy + Math.sin(m.ph * 1.3) * m.r + m.dy);
      }
      if (p.members.every(m => m.caught)) p.gone = true;
      if (p.combo && !p.spent && (p.combo.t -= dt) <= 0) { p.spent = true; p.fadeT = 1; }
    }
    if (p.spent && (p.fadeT -= dt) <= 0) p.gone = true;
    p.x += (p.vx + systems.world.windX(p.alt)) * dt;
    p.alt = Math.max(3, p.alt + p.vy * dt);
  }

  // Closest approach between a point and the bird's path during this frame
  function sweptDist(px, palt, dt) {
    const x0 = session.bird.x - session.bird.vx * dt, a0 = session.bird.alt - session.bird.vy * dt;
    const sx = session.bird.x - x0, sa = session.bird.alt - a0;
    const len2 = sx * sx + sa * sa || 1;
    const u = Math.max(0, Math.min(1, ((px - x0) * sx + (palt - a0) * sa) / len2));
    return Math.hypot(px - (x0 + sx * u), palt - (a0 + sa * u));
  }

  function award(entry, priced, msg) {
    const e = { ...entry, pts: priced.value, tags: priced.tags, t: session.state.time };
    session.state.score += e.pts;
    session.state.catches++;
    session.state.catchLog.push(e);
    session.state.lastCatch = e;
    session.state.msg = `${msg} +$${e.pts}`;
    session.state.msgTags = priced.tags.join('  ·  ');
    session.state.msgTagsFor = session.state.msg;
    session.state.msgT = 2;
    systems.combat.catchAchievements(e, priced.tags);
    return e;
  }

  // Extra starlings grabbed while a flock combo is open add a flat amount (×3 for turtle hits) and keep the chain alive
  function addStarling(p, turtleHit) {
    const e = p.combo.entry;
    const extra = Math.round(STARLING_EXTRA * (turtleHit ? 3 : 1) * systems.session.chainMult());
    e.count++; e.pts += extra; e.t = session.state.time;
    session.state.score += extra;
    session.state.chainT = session.state.time;
    session.state.msg = `Starlings ×${e.count}! +$${e.pts}`;
    session.state.msgT = 2;
  }

  function checkCatch(p, dt) {
    const s = SPECIES[p.kind];
    // An animal fading out after its flee timer ran out is still on screen and can still be caught
    if (p.spent && !p.outran) return;
    if (p.failCD > 0) { p.failCD -= dt; return; }
    if (!s.air) {
      if (p.hidden) return;
      const dx = p.x - session.bird.x, prevDx = dx + (session.bird.vx - (p.curVx || 0)) * dt;
      const crossed = Math.sign(dx) !== Math.sign(prevDx);
      if (!((Math.abs(dx) < s.radius || crossed) && session.bird.alt < s.catchAlt * STATS.catchAlt[systems.progression.tier('talons')])) return;
      if (p.kind === 'turtle') {
        p.gone = true;
        session.bird.carrying = { kind: 'turtle' };
        session.state.msg = 'Got the turtle! Drop it hard enough to crack the shell';
        session.state.msgT = 3;
        return;
      }
      p.gone = true;
      const minAlt = Math.min(session.bird.passMin, session.bird.alt);
      const priced = systems.session.priceCatch(p.kind, { speed: session.bird.speed, minAlt, catchAlt: s.catchAlt, unseen: !p.noticed });
      award({ kind: p.kind, speed: session.bird.speed, minAlt }, priced, `${s.name}!`);
      return;
    }
    const r = systems.progression.airCatchRadius();
    const strike = session.bird.speed;
    // Points reward the angle of attack: relative speed between you and the prey
    const closing = Math.hypot(session.bird.vx - p.vx - systems.world.windX(p.alt), session.bird.vy - p.vy);
    const targets = p.kind === 'flock' ? p.members.filter(m => !m.caught) : [p];
    for (const tgt of targets) {
      if (sweptDist(tgt.x, tgt.alt, dt) > r) continue;
      if (strike < s.minStrike || closing < s.minRel) {
        if (p.combo) continue;
        p.failCD = 1.5;
        if (p.kind === 'flock') p.scatterT = 0;
        else { spookAir(p); p.spent = true; p.fadeT = 1.5; } // escaped for good: flees and fades out
        session.state.msg = strike < s.minStrike
          ? `Too slow — ${s.name} escaped (${(strike * 3.6).toFixed(0)} km/h, need ${(s.minStrike * 3.6).toFixed(0)})`
          : `Bad angle — ${s.name} escaped (relative ${(closing * 3.6).toFixed(0)} km/h, need ${(s.minRel * 3.6).toFixed(0)})`;
        session.state.msgT = 2;
        return;
      }
      if (p.kind === 'flock') {
        tgt.caught = true;
        if (!p.combo) {
          // First catch scatters the flock for good; grab more before they're gone
          const priced = systems.session.priceCatch('flock', { speed: session.bird.speed, unseen: !p.noticed });
          const entry = award({ kind: 'flock', speed: session.bird.speed, rel: closing, alt: tgt.alt, air: true, count: 1 }, priced, 'Starling! Grab more');
          p.combo = { entry, t: STARLING_COMBO_TIME };
          p.scatterT = Infinity;
          for (const m of p.members) {
            const a = Math.atan2(m.oy + m.dy, m.ox + m.dx) + (Math.random() - 0.5);
            m.svx = Math.cos(a) * 20; m.svy = Math.sin(a) * 20;
          }
        } else {
          addStarling(p, false);
        }
        return;
      }
      p.gone = true;
      const priced = systems.session.priceCatch(p.kind, { speed: session.bird.speed, unseen: !p.noticed });
      award({ kind: p.kind, speed: session.bird.speed, rel: closing, alt: tgt.alt, air: true }, priced, `${s.name}!`);
      return;
    }
  }

  // Release velocity: the bird's own, plus (when aimed) a push toward the cursor
  function throwVelocity(aimed) {
    let vx = session.bird.vx, vy = session.bird.vy;
    if (aimed) {
      const ax = session.cam.x + (session.mouse.x - viewport.W / 2) / session.cam.zoom - session.bird.x;
      const ay = session.cam.alt + (viewport.H / 2 - session.mouse.y) / session.cam.zoomY - session.bird.alt;
      const d = Math.hypot(ax, ay) || 1, push = Math.min(systems.progression.throwPush(), d * 0.2 * systems.progression.throwPush() / TURTLE_THROW);
      vx += (ax / d) * push; vy += (ay / d) * push;
    }
    return { vx, vy };
  }

  function nearestFallingTurtle() {
    let best = null, bestD = Infinity;
    for (const f of session.state.fallers) {
      if (f.done || (f.alt <= 0 && (f.struck || f.hitBuzzard))) continue;
      const d = Math.hypot(f.x - session.bird.x, f.alt - session.bird.alt);
      if (d < bestD) { bestD = d; best = f; }
    }
    return best;
  }

  function grabFallingTurtle(target, dt = 0) {
    if (!target || target.done || session.bird.carrying || session.state.over || session.paused) return;
    if (target.alt <= 0) return;
    // Swept along this frame's path (like air strikes) so a fast pass can't skip over the small grab range
    const d = dt ? sweptDist(target.x, target.alt, dt) : Math.hypot(target.x - session.bird.x, target.alt - session.bird.alt);
    if (d > systems.progression.talonGrabRange()) return;
    target.done = true;
    session.bird.carrying = { kind: 'turtle', midair: true };
    session.state.msg = 'Talon grab! Turtle in hand';
    session.state.msgT = 2;
  }

  function dropTurtle(aimed = false) {
    if (!session.bird.carrying || session.state.over || session.paused || session.state.grotto) return;
    if (session.bird.carrying.kind === 'gun') {
      // Space with the rifle: let it fall; it can be picked up again
      session.state.guns.push({ x: session.bird.x, alt: session.bird.alt, vx: session.bird.vx, vy: session.bird.vy, ammo: session.bird.carrying.ammo, noGrab: GUN_REGRAB_T, near: true });
      session.bird.carrying = null;
      return;
    }
    const { vx, vy } = throwVelocity(aimed);
    const target = aimed && systems.progression.turtleHoming() > 0 ? pickThrowTarget(simulateThrow(session.bird.x, session.bird.alt, vx, vy)) : null;
    session.state.fallers.push({ x: session.bird.x, alt: session.bird.alt, vx, vy, dropAlt: session.bird.alt, spin: 0, target, homing: systems.progression.turtleHoming(), bounces: AIM_STATS.bounces[systems.progression.aimTier()] });
    session.bird.carrying = null;
  }

  // Same integration as a real falling turtle (gravity + drifting toward the wind), sampled for the aim preview
  function simulateThrow(x, alt, vx, vy) {
    const pts = [{ x, alt }], step = 1 / 30;
    for (let i = 0; i < 600 && alt > 0; i++) {
      vy -= G * step;
      vx += (systems.world.windX(alt) - vx) * Math.min(1, step * 0.2);
      x += vx * step; alt += vy * step;
      pts.push({ x, alt: Math.max(0, alt) });
    }
    return pts;
  }

  // Animal the throw is lined up on: a ground animal near the landing spot, or a flier close to the arc
  function pickThrowTarget(path) {
    const end = path[path.length - 1], LA = THROW_LOCK_AIR * (systems.progression.lockScale() || 1), LG = THROW_LOCK_GROUND * (systems.progression.lockScale() || 1);
    let best = null, bestD = Infinity;
    for (const p of session.prey) {
      if (p.gone || p.hidden || p.spent || p.kind === 'turtle') continue;
      let d;
      if (SPECIES[p.kind].air && !p.sitting) {
        d = Infinity;
        for (let i = 0; i < path.length; i += 3) d = Math.min(d, Math.hypot(path[i].x - p.x, path[i].alt - p.alt));
        if (d > LA) continue;
      } else {
        d = Math.abs(p.x - end.x);
        if (d > LG) continue;
      }
      if (d < bestD) { bestD = d; best = p; }
    }
    for (const r of session.state.rivals) {
      if (r.gone || r.mode === 'return' && Math.hypot(r.x - end.x, r.alt - end.alt) > LA) continue;
      const d = Math.hypot(r.x - end.x, r.alt - end.alt);
      const match = d < LA && (Math.abs(r.x - end.x) < LG || d < LA);
      if (!match) continue;
      if (d < bestD) { bestD = d; best = { kind: 'buzzard', x: r.x, alt: r.alt, target: r }; }
    }
    for (const t of hazardTargets()) {
      let d;
      if (t.air) {
        d = Infinity;
        for (let i = 0; i < path.length; i += 3) d = Math.min(d, Math.hypot(path[i].x - t.x, path[i].alt - t.alt));
        if (d > LA) continue;
      } else {
        d = Math.abs(t.x - end.x);
        if (d > LG) continue;
      }
      if (d < bestD) { bestD = d; best = t; }
    }
    return best;
  }

  function isBuzzardTarget(target) {
    return target && target.kind === 'buzzard';
  }

  // Predators as turtle targets (wrappers like the buzzard lock). Cats can't be locked: hitting one is pure skill
  function hazardTargets() {
    const hz = session.state.hazards, out = [];
    for (const h of hz.hunters) if (!h.gone) out.push({ kind: 'hunter', x: h.x, alt: 0, air: false, target: h });
    if (hz.hawk && !hz.hawk.gone) out.push({ kind: 'hawk', x: hz.hawk.x, alt: hz.hawk.alt, air: true, target: hz.hawk });
    return out;
  }

  // Body boxes: a hunter stands ~1.9 m tall, a cat ~0.6 m; the goshawk is hit like a buzzard
  function hazardHitBy(f) {
    const hz = session.state.hazards;
    for (const c of hz.cats) {
      if (!c.gone && Math.abs(c.x - f.x) < 2.5 && f.alt < c.alt + 1.2 && f.alt > c.alt - 0.8) return { kind: 'cat', obj: c };
    }
    for (const h of hz.hunters) {
      if (!h.gone && Math.abs(h.x - f.x) < 2 && f.alt < 2.2) return { kind: 'hunter', obj: h };
    }
    const h = hz.hawk;
    if (h && !h.gone && Math.hypot(h.x - f.x, h.alt - f.alt) < 5) return { kind: 'hawk', obj: h };
    return null;
  }

  function hazardStrike(f, kind, obj) {
    const impact = Math.hypot(f.vx, f.vy);
    const unseen = kind === 'cat' && obj.mode === 'hide';
    // Marked stolen so a buzzard can't steal it back
    award({ kind: 'turtle', speed: impact, turtleHit: true, targetKind: kind, stolen: true },
          systems.session.priceCatch(kind, { impact, unseen }), `TURTLE STRIKE! ${HAZARD_NAME[kind]}`);
    session.state.msgT = 2.5;
    removeHazard(kind, obj);
    f.struck = true;
    f.hitBuzzard = true;
    systems.combat.ricochet(f);
  }

  // Takes a predator out for the day; a downed hunter drops his rifle
  function removeHazard(kind, obj) {
    obj.gone = true;
    const hz = session.state.hazards;
    if (kind === 'hawk') { hz.hawk = null; hz.hawkT = Math.max(hz.hawkT, 45); }
    if (kind === 'hunter') {
      session.state.guns.push({ x: obj.x, alt: 1.5, vx: (Math.random() - 0.5) * 8, vy: GUN_THROW_VY, ammo: systems.combat.gunStat('ammo') });
      session.state.msg += '  ·  His rifle went flying — catch it!';
    }
    for (let i = 0; i < 20; i++) session.particles.push({
      x: obj.x, alt: Math.max(0.5, obj.alt || 1), vx: (Math.random() - 0.5) * 18, vy: Math.random() * 12, life: 1.1
    });
  }
  const facing = p => ((p.turn ?? p.face ?? p.vx) < 0 ? -1 : 1);

  return { facing, SENSES, addStarling, award, checkCatch, diveNoise, dropTurtle, duckTakeOff, eyeAlt, grabFallingTurtle, hazardHitBy, hazardStrike, hazardTargets, hearingAngle, hearingHalf, hearingRange, isBuzzardTarget, lookAngle, makeGround, nearestFallingTurtle, newSpawnWindow, pickThrowTarget, removeHazard, sensed, sensesInfo, simulateThrow, spawnPreyAhead, spookAir, sweptDist, throwVelocity, updateAirPrey, updateGroundPrey, updateHearingRange, updateLook, updateTurn, visionRange };
}
