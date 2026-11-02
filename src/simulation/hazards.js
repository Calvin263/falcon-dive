import { G, HAZARD_NAME, STATS, SPECIES, THERMAL_SPACING, RIVAL_SPEED, CAT_REACH, CAT_ALT, CAT_LEAP_T, CAT_LEAP_MAX, CAT_LEAP_VY, CAT_HIT, CAT_STALK_DIST, CAT_STALK_ALT, CAT_STALK_SPEED, HUNTER_RANGE, HUNTER_TRACK, HUNTER_LOCK_DIST, HUNTER_AIM_T, HUNTER_HIT, HUNTER_RELOAD, HUNTER_SEE_ALT, HUNTER_SNAP_LEAD, HUNTER_SNAP_SPREAD, HAWK_SPEED, HAWK_TURN, HAWK_HIT, HAWK_FROM_DAY, HAWK_STOOP_DIST, HAWK_COMMIT, HAWK_ACCEL, LUCKY_INVULN } from '../config.js';
import { clamp, randDir, wrapAngle } from '../core/math.js';

export function createHazards({ session, viewport, systems }) {
  function updateRivals(dt) {
    const i0 = Math.floor(session.bird.x / THERMAL_SPACING);
    for (let i = i0 - 2; i <= i0 + 2; i++) {
      const th = systems.world.thermalCol(i);
      if (!th.on || systems.world.wh(i * 11.1 + 2) > 0.45 || session.state.rivalSeen[i]) continue;
      session.state.rivalSeen[i] = true;
      const alt = 160 + systems.world.wh(i * 12.7) * 160;
      session.state.rivals.push({ cx: th.x, calt: alt, x: th.x, alt, ang: Math.random() * 6.28, mode: 'circle', t: 0, flapT: 0, vx: 1, vy: 0 });
    }
    for (const r of session.state.rivals) {
      r.t -= dt; r.flapT += dt * 6;
      const dx = session.bird.x - r.x, dy = session.bird.alt - r.alt, d = Math.hypot(dx, dy);
      const fresh = session.state.lastCatch && session.state.time - session.state.lastCatch.t < systems.progression.stealWindow() && !session.state.lastCatch.stolen && !session.state.lastCatch.eyas;
      if (r.mode === 'circle' && d < STATS.notice[systems.progression.tier('stealth')] && (session.bird.carrying || fresh)) {
        r.mode = 'chase'; r.t = 7; r.alertT = 0.8;
        session.state.msg = 'A buzzard is after your prize!'; session.state.msgT = 2;
      }
      if (r.mode === 'chase') {
        const cs = rivalChaseSpeed();
        r.vx = dx / (d || 1) * cs; r.vy = dy / (d || 1) * cs;
        if (d < 4) {
          if (session.bird.carrying) {
            session.state.msg = `A buzzard snatched your ${session.bird.carrying.kind === 'gun' ? 'rifle' : 'turtle'}!`;
            session.bird.carrying = null;
          } else if (fresh) {
            const e = session.state.lastCatch;
            e.stolen = true;
            session.state.score -= e.pts;
            session.state.catchLog.splice(session.state.catchLog.indexOf(e), 1);
            session.state.steals.push(e);
            systems.session.breakChain();
            session.state.msg = `A buzzard stole your ${SPECIES[e.kind].name}! -$${e.pts}`;
          }
          session.state.msgT = 2.5;
          r.mode = 'leave'; r.t = 5;
        } else if (r.t <= 0 || !(session.bird.carrying || fresh)) {
          r.mode = 'return';
        }
      } else if (r.mode === 'leave') {
        r.vx = Math.sign(r.x - session.bird.x || 1) * RIVAL_SPEED; r.vy = 4;
        if (r.t <= 0) r.mode = 'return';
      } else if (r.mode === 'return') {
        const ex = r.cx + Math.cos(r.ang) * 35 - r.x, ey = r.calt - r.alt, ed = Math.hypot(ex, ey);
        r.vx = ex / (ed || 1) * RIVAL_SPEED * 0.7; r.vy = ey / (ed || 1) * RIVAL_SPEED * 0.7;
        if (ed < 5) r.mode = 'circle';
      } else {
        r.ang += dt * 0.6;
        const nx = r.cx + Math.cos(r.ang) * 35, na = r.calt + Math.sin(r.ang * 2) * 6;
        r.vx = (nx - r.x) / dt; r.vy = (na - r.alt) / dt;
      }
      r.x += r.vx * dt; r.alt = Math.max(5, r.alt + r.vy * dt);
      r.alertT = (r.alertT || 0) - dt;
    }
    session.state.rivals = session.state.rivals.filter(r => !r.gone && Math.abs(r.x - session.bird.x) < 3000);
  }

  // ---------- Hazards ----------
  // Cats hide in the grass and pounce on slow, low passes; hunters lock on to slow fliers in range; a goshawk
  // stalks you and stoops. Any of them ends the day. They appear and get sharper as the days go on.
  const danger = () => clamp((session.state.day - 1) / 6, 0, 1);
  // The aim trails the bird by speed / HUNTER_TRACK, so a slow flier gets a quick clean lock; anyone else in
  // range still draws a snap shot after hunterSnapTime of watching
  const hunterLockTime = () => 1.2 - 0.4 * danger();
  const hunterSnapTime = () => 1.5 - 0.5 * danger();
  const rivalChaseSpeed = () => 30 + 6 * danger();

  function newHazards() {
    return { cats: [], hunters: [], hawk: null, hawkT: 40 + Math.random() * 20, seen: new Set() };
  }

  function killBird(reason, msg) {
    if (session.state.over || session.bird.invulnT > 0) return;
    if (session.state.feathers > 0) {
      // Lucky Feather: shrug off one fatal attack, a cloud of feathers and a moment of grace
      session.state.feathers--; session.bird.invulnT = LUCKY_INVULN;
      if (reason === 'hawk' && session.state.hazards.hawk) { session.state.hazards.hawk.mode = 'leave'; session.state.hazards.hawk.commit = false; }
      session.state.msg = `Lucky Feather! ${msg.replace(/!$/, '')} — but you slipped away`; session.state.msgT = 2.5; session.state.msgTags = null;
      for (let i = 0; i < 30; i++) session.state.featherFx.push({ x: session.bird.x, alt: session.bird.alt, vx: (Math.random() - 0.5) * 16, vy: (Math.random() - 0.3) * 10, rot: Math.random() * 6, life: 1.6 });
      return;
    }
    session.bird.carrying = null;
    session.state.crash = { t: 0, smoke: [], killer: reason };
    systems.session.endDay(reason);
    session.state.msg = `${msg} — the hunt is over for today`;
    for (let i = 0; i < 35; i++) session.particles.push({
      x: session.bird.x, alt: session.bird.alt, vx: (Math.random() - 0.5) * 24, vy: Math.random() * 14, life: 1.4
    });
  }

  function updateCat(c, dt) {
    c.t -= dt; c.alertT -= dt;
    const dx = session.bird.x - c.x, hawk = session.state.hazards.hawk;
    // A goshawk swooping low is fair game too: the cat goes for whichever is closer
    const hawkIn = hawk && !hawk.gone && hawk.alt < CAT_ALT + 4 && Math.abs(hawk.x - c.x) < CAT_REACH;
    const birdIn = Math.abs(dx) < CAT_REACH && session.bird.alt < CAT_ALT;
    if (c.mode === 'hide') {
      c.dir = Math.sign(dx) || c.dir;
      // Stalk: creep through the grass toward a bird flying low nearby
      c.stalk = Math.abs(dx) < CAT_STALK_DIST && session.bird.alt < CAT_STALK_ALT && Math.abs(dx) > 4;
      if (c.stalk && !systems.world.lakeAtX(c.x + Math.sign(dx) * CAT_STALK_SPEED * dt * 4)) c.x += Math.sign(dx) * CAT_STALK_SPEED * dt;
      if (c.t <= 0 && (birdIn || hawkIn)) {
        c.tgt = hawkIn && (!birdIn || Math.hypot(hawk.x - c.x, hawk.alt) < Math.hypot(dx, session.bird.alt)) ? 'hawk' : 'bird';
        const tx = c.tgt === 'hawk' ? hawk.x : session.bird.x;
        c.mode = 'crouch'; c.t = 0.12; c.dir = Math.sign(tx - c.x) || 1; c.alertT = 0.8;
      }
    } else if (c.mode === 'crouch') {
      if (c.t <= 0) {
        // Leap at where the target will be; the flight time scales with distance so far/high leaps still connect
        const o = c.tgt === 'hawk' && hawk && !hawk.gone ? hawk : session.bird;
        const px = o.x + o.vx * CAT_LEAP_T, pa = Math.max(0, o.alt + o.vy * CAT_LEAP_T);
        const T = clamp(Math.hypot(px - c.x, pa) / 30, 0.3, 0.7);
        const tx = o.x + o.vx * T, ta = Math.max(0, o.alt + o.vy * T);
        c.vx = clamp((tx - c.x) / T, -CAT_LEAP_MAX, CAT_LEAP_MAX);
        c.vy = Math.min(CAT_LEAP_VY, (ta + 0.5 * G * T * T) / T);
        c.dir = Math.sign(c.vx) || c.dir;
        c.mode = 'leap';
      }
    } else if (c.mode === 'leap') {
      c.vy -= G * dt; c.x += c.vx * dt; c.alt += c.vy * dt;
      if (hawk && !hawk.gone && Math.hypot(hawk.x - c.x, hawk.alt - c.alt) < CAT_HIT + 1.5) {
        crossfire('hawk', hawk, 'cat');
        c.vx *= 0.3;
      }
      if (systems.prey.sweptDist(c.x, c.alt, dt) < CAT_HIT) killBird('cat', 'A cat pounced from the grass!');
      if (c.alt <= 0) { c.alt = 0; c.vx = 0; c.mode = 'sit'; c.t = 1.5; }
    } else if (c.mode === 'sit' && c.t <= 0) {
      c.mode = 'hide'; c.t = 1;
    }
  }

  // The hunter's aim trails the bird; fly slowly in range and the lock builds. Then it shoulders the rifle,
  // leads your flight and shows its line for HUNTER_AIM_T before firing: change course or die
  function updateHunter(h, dt) {
    h.reload -= dt; h.flash -= dt; h.tracer -= dt;
    if (h.aim) {
      h.aim -= dt;
      if (h.aim <= 0) fireHunter(h);
      return;
    }
    const d = Math.hypot(session.bird.x - h.x, session.bird.alt - 1.6);
    const sees = d < HUNTER_RANGE && session.bird.alt < HUNTER_SEE_ALT && !systems.world.insideCloud(session.bird.x, session.bird.alt) && !session.bird.inWater;
    if (!sees) {
      h.tracking = false;
      h.lock = Math.max(0, h.lock - dt);
      h.watch = 0;
      return;
    }
    if (!h.tracking) {
      h.tracking = true;
      h.ax = session.bird.x - session.bird.vx * 0.6; h.aalt = session.bird.alt - session.bird.vy * 0.6;
    }
    const k = Math.min(1, dt * HUNTER_TRACK);
    h.ax += (session.bird.x - h.ax) * k; h.aalt += (session.bird.alt - h.aalt) * k;
    const err = Math.hypot(session.bird.x - h.ax, session.bird.alt - h.aalt);
    h.watch = (h.watch || 0) + dt;
    if (h.reload > 0) return;
    if (err < HUNTER_LOCK_DIST) h.lock += dt / hunterLockTime();
    else h.lock = Math.max(0, h.lock - dt * 0.7);
    if (h.lock >= 1 || h.watch >= hunterSnapTime()) {
      // Lead the bird to where it will be when the shot goes off. A clean lock leads perfectly; a snap shot
      // under-leads and scatters, so steady fast flight is often missed but never safe
      const snap = h.lock < 1, lead = HUNTER_AIM_T * (snap ? HUNTER_SNAP_LEAD + 0.15 * danger() : 1);
      const spread = snap ? HUNTER_SNAP_SPREAD : 0;
      h.lock = 0; h.watch = 0; h.aim = HUNTER_AIM_T;
      h.ax = session.bird.x + session.bird.vx * lead + (Math.random() - 0.5) * 2 * spread;
      h.aalt = Math.max(0.5, session.bird.alt + session.bird.vy * lead + (Math.random() - 0.5) * 2 * spread);
    }
  }

  function fireHunter(h) {
    h.aim = 0; h.reload = HUNTER_RELOAD; h.flash = 0.15; h.tracer = 0.3;
    session.state.rings.push({ x: h.x, alt: 1.6, t: 0, r: 60, kind: 'shot' });
    // Gunfire sends nearby prey running
    for (const p of session.prey) {
      if (p.gone || p.spent || Math.abs(p.x - h.x) > 120) continue;
      if (SPECIES[p.kind].air) systems.prey.spookAir(p); else { p.fleeing = true; p.alertT = 1; }
    }
    const ux0 = h.ax - h.x, uy0 = h.aalt - 1.6, len = Math.hypot(ux0, uy0) || 1, ux = ux0 / len, uy = uy0 / len;
    const onLine = (x, alt, r) => {
      const px = x - h.x, py = alt - 1.6, along = px * ux + py * uy;
      return along > 0 && Math.abs(px * uy - py * ux) < r ? along : Infinity;
    };
    // The bullet stops at the first thing on its line: you, the goshawk, or a cat (mid-pounce, usually)
    const hz = session.state.hazards, hits = [];
    if (!systems.world.insideCloud(session.bird.x, session.bird.alt) && !session.bird.inWater) hits.push({ who: 'bird', d: onLine(session.bird.x, session.bird.alt, HUNTER_HIT) });
    if (hz.hawk && !hz.hawk.gone) hits.push({ who: 'hawk', obj: hz.hawk, d: onLine(hz.hawk.x, hz.hawk.alt, HAWK_HIT + 1) });
    for (const c of hz.cats) if (!c.gone && c.mode !== 'hide') hits.push({ who: 'cat', obj: c, d: onLine(c.x, c.alt + 0.4, 1.6) });
    const first = hits.filter(o => o.d < Infinity).sort((a, b) => a.d - b.d)[0];
    if (!first) { session.state.msg = 'A shot whizzed past!'; session.state.msgT = 2; h.tracerLen = 0; return; }
    h.tracerLen = first.d;
    if (first.who !== 'bird') { crossfire(first.who, first.obj, 'hunter'); return; }
    if (session.bird.bouncing && session.bird.bouncing.spin) {
      // Buzzsaw parry: the spin bats the bullet away
      systems.prey.award({ kind: 'turtle', speed: session.bird.speed, targetKind: 'bullet', stolen: true }, systems.session.priceCatch('bullet', {}), 'PARRY! Bullet deflected');
      systems.combat.achieve('parry');
      for (let i = 0; i < 12; i++) session.particles.push({ x: session.bird.x, alt: session.bird.alt, vx: (Math.random() - 0.5) * 24, vy: (Math.random() - 0.5) * 24, life: 0.5 });
      return;
    }
    killBird('hunter', 'Shot by a hunter!');
  }

  // A predator taken out by another predator: pays out like a strike, with a crossfire bonus
  function crossfire(kind, obj, by) {
    const how = by === 'hunter' ? `CROSSFIRE! The hunter shot the ${HAZARD_NAME[kind].toLowerCase()}` : 'CROSSFIRE! A cat snatched the goshawk';
    systems.prey.award({ kind: 'turtle', speed: session.bird.speed, targetKind: kind, stolen: true, crossfire: true },
          systems.session.priceCatch(kind, { crossfire: true }), how);
    session.state.msgT = 2.5;
    systems.prey.removeHazard(kind, obj);
    systems.combat.achieve(by === 'cat' ? 'cathawk' : kind === 'hawk' ? 'xhawk' : 'xcat');
  }

  function spawnHawk() {
    const side = randDir(), hz = session.state.hazards;
    hz.hawk = { x: session.bird.x - side * 220, alt: Math.min(session.MAX_ALT, session.bird.alt + 90), vx: side * 25, vy: 0,
                mode: 'stalk', t: 4 + Math.random() * 2, attacks: 0, flapT: 0, alertT: 0, minD: Infinity };
    session.state.msg = 'A goshawk is hunting you!'; session.state.msgT = 2.5;
  }

  function updateHawk(h, dt) {
    h.t -= dt; h.flapT += dt * 7; h.alertT -= dt;
    const dx = session.bird.x - h.x, dy = session.bird.alt - h.alt, d = Math.hypot(dx, dy);
    const steer = (tx, ty, speed, rate) => {
      const len = Math.hypot(tx, ty) || 1;
      h.vx += (tx / len * speed - h.vx) * Math.min(1, dt * rate);
      h.vy += (ty / len * speed - h.vy) * Math.min(1, dt * rate);
    };
    const hidden = systems.world.insideCloud(session.bird.x, session.bird.alt) || !!session.bird.inWater;
    const bsp = Math.hypot(session.bird.vx, session.bird.vy);
    if (h.mode === 'stalk') {
      // Shadow the bird from above and behind, keeping pace however fast it flies
      const back = -(Math.sign(session.bird.vx) || 1) * 40;
      const gx = session.bird.x + back - h.x, gy = Math.min(session.MAX_ALT, session.bird.alt + 35) - h.alt;
      steer(gx, gy, Math.max(32, bsp + Math.min(30, Math.hypot(gx, gy) * 0.4)), 3);
      if (h.t <= 0 && !hidden && d < HAWK_STOOP_DIST) {
        h.mode = 'stoop'; h.t = 5; h.minD = Infinity; h.alertT = 0.9;
        session.state.msg = 'The goshawk is stooping — break away at the last moment!'; session.state.msgT = 2;
        const len = d || 1, s0 = Math.max(HAWK_SPEED * 0.8, bsp + 10);
        h.vx = dx / len * s0; h.vy = dy / len * s0;
      }
    } else if (h.mode === 'stoop') {
      // Steers toward a lead point until HAWK_COMMIT m out, then commits to a straight strike line:
      // a hard turn, dive or brake after that makes it overshoot; jinking too early just lets it re-aim
      const top = Math.max(HAWK_SPEED + 10 * danger(), bsp + 25);
      let sp = Math.min(top, Math.hypot(h.vx, h.vy) + dt * HAWK_ACCEL);
      if (!h.commit) {
        const lead = d / Math.max(1, sp - bsp * 0.3);
        const lx = session.bird.x + session.bird.vx * lead - h.x, ly = session.bird.alt + session.bird.vy * lead - h.alt;
        const cur = Math.atan2(h.vy, h.vx), want = Math.atan2(ly, lx);
        const turn = (HAWK_TURN + 0.6 * danger()) * dt;
        const ang = cur + clamp(wrapAngle(want - cur), -turn, turn);
        h.vx = Math.cos(ang) * sp; h.vy = Math.sin(ang) * sp;
        if (d < HAWK_COMMIT) {
          // Commit: lock the exact intercept of your current flight line
          h.commit = true; h.alertT = 0.6;
          let ix = session.bird.x, ia = session.bird.alt;
          for (let k = 0; k < 4; k++) {
            const tt = Math.hypot(ix - h.x, ia - h.alt) / sp;
            ix = session.bird.x + session.bird.vx * tt; ia = session.bird.alt + session.bird.vy * tt;
          }
          const len = Math.hypot(ix - h.x, ia - h.alt) || 1;
          h.vx = (ix - h.x) / len * sp; h.vy = (ia - h.alt) / len * sp; h.csp = sp;
        }
      } else {
        const len = Math.hypot(h.vx, h.vy) || 1;
        h.vx = h.vx / len * h.csp; h.vy = h.vy / len * h.csp;
      }
      if (!hidden && (systems.prey.sweptDist(h.x + h.vx * dt, h.alt + h.vy * dt, dt) < HAWK_HIT || d < HAWK_HIT)) {
        killBird('hawk', 'Taken by a goshawk!');
        return;
      }
      h.minD = Math.min(h.minD, d);
      if (h.t <= 0 || hidden || (h.minD < 40 && d > h.minD + 12)) {
        h.mode = 'recover'; h.t = 2; h.attacks++; h.commit = false;
        if (!hidden) { session.state.msg = 'The goshawk missed!'; session.state.msgT = 1.5; }
      }
    } else if (h.mode === 'recover') {
      steer(h.vx, Math.abs(h.vx) * 0.6 + 10, 30, 1.5);
      if (h.t <= 0) {
        if (h.attacks < 3 + Math.round(danger())) { h.mode = 'stalk'; h.t = 1.5 + Math.random() * 1.5; }
        else { h.mode = 'leave'; session.state.msg = 'The goshawk gave up'; session.state.msgT = 1.5; }
      }
    } else {
      steer(-dx, 40, 30, 1);
      if (d > 700) session.state.hazards.hawk = null;
    }
    h.x += h.vx * dt; h.alt = Math.max(3, h.alt + h.vy * dt);
  }

  function updateHazards(dt) {
    const hz = session.state.hazards;
    systems.water.spawnHazards();
    for (const c of hz.cats) { if (c.frozenT > 0) { c.frozenT -= dt; continue; } updateCat(c, dt); if (session.state.over) return; }
    for (const h of hz.hunters) { if (h.frozenT > 0) { h.frozenT -= dt; continue; } updateHunter(h, dt); if (session.state.over) return; }
    if (session.state.day >= HAWK_FROM_DAY && !hz.hawk && !session.state.sunset) {
      hz.hawkT -= dt;
      if (hz.hawkT <= 0) { spawnHawk(); hz.hawkT = 60 - 30 * danger() + Math.random() * 20; }
    }
    if (hz.hawk) updateHawk(hz.hawk, dt);
  }
  return { danger, killBird, newHazards, updateHazards, updateRivals };
}
