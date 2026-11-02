import { DAY_END_HOUR, STATS, SPECIES, DAY_LENGTH, AUTO_FIRE_DT, CAT_CELL, HUNTER_CELL, HUNTER_FROM_DAY, DUCK_BELOW_REACH, DUCK_SPLASH_R, FISH_REACH, FISH_SPOOK, GROTTO_L, GROTTO_H, GROTTO_VENTS, VENT_R, VENT_REFILL, OCTO_HP, OCTO_REACH, OCTO_HIT, OCTO_WIND, OCTO_STRIKE, OCTO_RETRACT, OCTO_ATK, OCTO_AGGRO, OCTO_HEAD_R, OCTO_TALON_DMG, OCTO_ROCKET_DMG } from '../config.js';
import { clamp, randDir } from '../core/math.js';

export function createWater({ session, viewport, systems }) {
  function makeFish(l, kind) {
    const s = SPECIES[kind], dmax = Math.min(s.depth[1], l.depth - 0.6);
    const d = s.depth[0] + Math.random() * (dmax - s.depth[0]);
    return { kind, lake: l, x: l.x0 + 4 + Math.random() * (l.w - 8), alt: -d, tAlt: -d, vx: randDir() * s.speed,
             ph: Math.random() * 10, fleeT: 0, riseT: 0, wanderT: 2 + Math.random() * 5, spooked: false };
  }

  function splashAt(x, l) {
    for (let i = 0; i < 30; i++) session.particles.push({ x: x + (Math.random() - 0.5) * 3, alt: 0.2, vx: (Math.random() - 0.5) * 16, vy: 4 + Math.random() * 12, life: 1 });
    for (const f of session.state.fish) {
      if (f.lake.x0 !== l.x0 || Math.abs(f.x - x) > FISH_SPOOK) continue;
      f.fleeT = 2.5; f.riseT = 0; f.spooked = true;
      f.vx = Math.sign(f.x - x || 1) * SPECIES[f.kind].dart;
      f.tAlt = -Math.min(SPECIES[f.kind].depth[1], l.depth - 0.6);
    }
    // Resting ducks on the lake take off at the splash
    for (const p of session.prey) if (p.sitting && p.lake && p.lake.x0 === l.x0 && Math.abs(p.x - x) < DUCK_SPLASH_R) systems.prey.duckTakeOff(p);
  }

  function updateFish(dt) {
    for (const f of session.state.fish) {
      const s = SPECIES[f.kind], l = f.lake, floor = -(l.depth - 0.5);
      f.ph += dt;
      if (f.fleeT > 0) {
        f.fleeT -= dt;
        if (f.fleeT <= 0) f.vx = Math.sign(f.vx) * s.speed;
      } else {
        f.wanderT -= dt;
        if (f.wanderT <= 0) {
          f.wanderT = 3 + Math.random() * 6;
          if (Math.random() < 0.3) f.vx = -f.vx;
          // Trout now and then rise to feed just under the surface, where they're easy to see and reach
          if (f.kind === 'trout' && Math.random() < 0.4) { f.riseT = 3 + Math.random() * 4; f.tAlt = -0.4; }
          else f.tAlt = -(s.depth[0] + Math.random() * (Math.min(s.depth[1], l.depth - 0.6) - s.depth[0]));
        }
        if (f.riseT > 0 && (f.riseT -= dt) <= 0) f.wanderT = 0;
        // A low shadow passing over sends a shallow fish down
        if (session.bird.alt > 0 && session.bird.alt < 25 && Math.abs(session.bird.x + systems.world.shadowOffset(session.bird.alt) - f.x) < 6 && f.alt > -1.5) {
          f.riseT = 0; f.tAlt = -Math.min(s.depth[1], l.depth - 0.6); f.wanderT = 4;
        }
      }
      f.x += f.vx * dt;
      if (f.x < l.x0 + 2 || f.x > l.x0 + l.w - 2) { f.x = clamp(f.x, l.x0 + 2, l.x0 + l.w - 2); f.vx = -f.vx; }
      f.alt += clamp(f.tAlt - f.alt, -1, 1) * dt * (f.fleeT > 0 ? 3 : 1.2);
      f.alt = clamp(f.alt, floor, -0.3);
      // Grab: swept from last frame so a fast plunge can't skip past a fish
      if (session.bird.inWater && !session.bird.carrying && systems.prey.sweptDist(f.x, f.alt, dt) < FISH_REACH * STATS.airReach[systems.progression.tier('talons')]) {
        f.gone = true;
        const priced = systems.session.priceCatch(f.kind, { speed: session.bird.entrySpeed, unseen: !f.spooked });
        systems.prey.award({ kind: f.kind, speed: session.bird.entrySpeed, water: true, depth: -f.alt }, priced, `${s.name}! (${(-f.alt).toFixed(1)} m deep)`);
      }
    }
    session.state.fish = session.state.fish.filter(f => !f.gone);
  }

  // Coming up under a duck resting on the lake: grab it from below
  function catchDuckFromBelow(l, dt) {
    if (session.bird.carrying || session.bird.vy <= 0) return;
    for (const p of session.prey) {
      if (!p.sitting || p.gone || !p.lake || p.lake.x0 !== l.x0) continue;
      if (systems.prey.sweptDist(p.x, 0, dt) > DUCK_BELOW_REACH * STATS.airReach[systems.progression.tier('talons')]) continue;
      p.gone = true;
      const priced = systems.session.priceCatch(p.kind, { below: true, unseen: !p.noticed });
      systems.prey.award({ kind: p.kind, speed: session.bird.speed, water: true, below: true }, priced, `Ambush from below! ${SPECIES[p.kind].name}`);
      session.state.msgT = 2.5;
      // The rest of the raft scatters
      for (const q of session.prey) if (q.sitting && q.lake && q.lake.x0 === l.x0 && Math.abs(q.x - p.x) < DUCK_SPLASH_R) systems.prey.duckTakeOff(q);
      for (let i = 0; i < 14; i++) session.particles.push({ x: p.x, alt: 0.4, vx: (Math.random() - 0.5) * 8, vy: 2 + Math.random() * 6, life: 0.8 });
      return;
    }
  }
  const grottoOpen = l => !!(l && l.grotto && systems.progression.tier('shell') >= 2 && !session.state.grottoCleared[l.x0]);

  function enterGrotto(l) {
    const tents = [];
    for (let k = 0; k < 8; k++) tents.push({ base: Math.PI * (0.55 + 0.9 * k / 7), ph: k * 1.7, len: 6 + (k % 3), mode: 'idle', t: 0, stun: 0 });
    session.state.grotto = { lake: l, t: 0, inks: [], bubbles: [],
                     octo: { x: GROTTO_L - 18, alt: GROTTO_H * 0.55, hp: OCTO_HP, hurtT: 0, atkT: 2.5, tents, frozenT: 0, inked: false } };
    session.bird.x = 3; session.bird.alt = GROTTO_H * 0.45; session.bird.angle = 0; session.bird.speed = Math.min(session.bird.speed, systems.progression.swimSpeed());
    session.bird.breath = Math.max(session.bird.breath, 2);
    session.state.rockets = []; session.state.tracers = [];
    session.mouse.steer = null;
    session.cam.ox = NaN; session.cam.gz = NaN; session.cam.floorPx = NaN; session.cam.lock = null; session.cam.focus = 0; session.cam.pin = null;
    session.state.msg = 'An underwater grotto… something big lives down here'; session.state.msgT = 3; session.state.msgTags = null;
  }

  function exitGrotto() {
    const g = session.state.grotto, l = g.lake;
    session.state.grotto = null;
    session.bird.x = l.x0 + l.w - 4; session.bird.alt = -(l.depth - 2.5); session.bird.angle = Math.PI; session.bird.speed = 3;
    session.bird.breath = g.octo.hp <= 0 ? systems.progression.swimBreath() : Math.max(session.bird.breath, 3);
    session.bird.vx = 0; session.bird.vy = 0;
    session.state.rockets = []; session.state.tracers = [];
    session.mouse.steer = null;
    session.cam.ox = NaN; session.cam.gz = NaN; session.cam.floorPx = NaN; session.cam.pin = null;
  }

  const tentAnchor = (o, k) => ({ x: o.x - 0.6 + (k - 3.5) * 0.35, alt: o.alt - 2.4 });
  // Tentacle tip: idle ones sway; winding up they coil back; striking ones shoot out along the telegraphed line
  function tentTip(o, tn, k) {
    const a = tentAnchor(o, k), g = session.state.grotto;
    if (tn.mode === 'wind' || tn.mode === 'strike' || tn.mode === 'retract') {
      const p = tn.mode === 'wind' ? -0.12 * (1 - tn.t / tn.wind) : tn.mode === 'strike' ? 1 - tn.t / OCTO_STRIKE : tn.t / OCTO_RETRACT;
      const reach = Math.max(3, OCTO_REACH * p);
      return { x: a.x + tn.ux * reach, alt: a.alt + tn.uy * reach };
    }
    const ang = tn.base + 0.35 * Math.sin(g.t * 1.6 + tn.ph);
    return { x: a.x + Math.cos(ang) * tn.len, alt: a.alt + Math.sin(ang) * tn.len };
  }

  function grottoTargets(w) {
    const g = session.state.grotto, o = g.octo, out = [];
    if (o.hp <= 0) return out;
    out.push([o.x, o.alt, OCTO_HEAD_R + w * 0.3, { type: 'octo', part: o }]);
    o.tents.forEach((tn, k) => {
      if (tn.mode !== 'wind' && tn.mode !== 'strike') return;
      const tip = tentTip(o, tn, k);
      out.push([tip.x, tip.alt, 1.2 + w * 0.3, { type: 'octo', part: tn }]);
    });
    return out;
  }

  function octoHit(hit, verb) {
    const g = session.state.grotto;
    if (!g) return;
    const o = g.octo;
    if (o.hp <= 0) return;
    if (hit.part !== o) {
      const tn = hit.part;
      tn.mode = 'retract'; tn.t = OCTO_RETRACT; tn.stun = 2;
      session.state.msg = `${verb} Tentacle hit — attack broken`; session.state.msgT = 1.5; session.state.msgTags = null;
      return;
    }
    octoDamage(verb === 'BOOM!' ? OCTO_ROCKET_DMG : 1, verb);
  }

  function octoDamage(dmg, verb) {
    const g = session.state.grotto, o = g.octo;
    if (o.hp <= 0) return;
    o.hp -= dmg; o.hurtT = 0.35;
    for (let i = 0; i < 10; i++) session.particles.push({ x: o.x, alt: o.alt, vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10, life: 0.7 });
    // Hurt badly: a cloud of ink to hide behind
    if (!o.inked && o.hp <= OCTO_HP / 2) {
      o.inked = true;
      for (let k = 0; k < 4; k++) g.inks.push({ x: o.x - 6 - k * 4, alt: o.alt + (Math.random() - 0.5) * 6, r: 2, t: 0, life: 5 + Math.random() * 2 });
    }
    if (o.hp > 0) {
      session.state.msg = `${verb} Octopus hit! (${Math.max(0, o.hp)}/${OCTO_HP})`; session.state.msgT = 1.5; session.state.msgTags = null;
      return;
    }
    session.state.grottoCleared[g.lake.x0] = true;
    for (const tn of o.tents) tn.mode = 'idle';
    systems.prey.award({ kind: 'turtle', speed: session.bird.speed, targetKind: 'octopus', stolen: true, shot: true, water: true },
          systems.session.priceCatch('octopus', {}), 'The octopus is beaten! Swim back out (left)');
    session.state.msgT = 4;
    for (let i = 0; i < 40; i++) session.particles.push({ x: o.x, alt: o.alt, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20, life: 1.4 });
  }

  function updateGrotto(dt) {
    const g = session.state.grotto, o = g.octo;
    g.t += dt;
    session.state.time += dt;
    session.state.tod = (session.state.tod + dt / DAY_LENGTH) % 1;
    if (systems.session.huntHour() >= DAY_END_HOUR) { exitGrotto(); return; }

    // Steering toward the cursor (held course while free-aiming the rifle), like swimming in a lake
    const { x: bx, y: by } = systems.flight.birdAnchor();
    const hold = systems.combat.gunAimHeld() && session.mouse.steer;
    const smx = hold ? bx + session.mouse.steer.dx : session.mouse.x, smy = hold ? by + session.mouse.steer.dy : session.mouse.y;
    const target = Math.atan2((by - smy) / session.cam.zoomY, (smx - bx) / session.cam.zoom);
    const effort = clamp(Math.hypot(smx - bx, smy - by) / (Math.min(viewport.W, viewport.H) * 0.3), 0.15, 1);
    session.bird.effort = effort;
    let wvx = Math.cos(session.bird.angle) * session.bird.speed, wvy = Math.sin(session.bird.angle) * session.bird.speed;
    session.bird.breath = Math.max(0, session.bird.breath - dt);
    const inVent = GROTTO_VENTS.some(vx => Math.abs(session.bird.x - vx) < VENT_R);
    if (inVent) session.bird.breath = Math.min(systems.progression.swimBreath(), session.bird.breath + VENT_REFILL * dt);
    const sw = systems.progression.swimSpeed() * effort, dvx = Math.cos(target) * sw - wvx, dvy = Math.sin(target) * sw - wvy;
    const dv = Math.hypot(dvx, dvy), a = Math.min(dv, systems.progression.swimPaddle() * dt);
    if (dv > 0) { wvx += dvx / dv * a; wvy += dvy / dv * a; }
    if (inVent) wvy += 4 * dt;
    session.bird.speed = Math.max(0.3, Math.hypot(wvx, wvy)); session.bird.angle = Math.atan2(wvy, wvx);
    session.bird.x += wvx * dt; session.bird.alt += wvy * dt;
    session.bird.vx = wvx; session.bird.vy = wvy;
    session.bird.mode = 'UNDERWATER'; session.bird.flapT += dt * 6;
    if (session.bird.alt < 0.7 || session.bird.alt > GROTTO_H - 0.7) { session.bird.alt = clamp(session.bird.alt, 0.7, GROTTO_H - 0.7); session.bird.angle = Math.atan2(0, wvx || 1); }
    session.bird.x = Math.min(session.bird.x, GROTTO_L - 1);
    if (session.bird.x < 0.5) { exitGrotto(); return; }

    // Out of air down here: you drown (a Lucky Feather gets you a gulp of air)
    if (session.bird.breath <= 0) {
      systems.hazards.killBird('drown', 'Drowned in the grotto!');
      if (!session.state.over) session.bird.breath = 3;
      return;
    }

    // Octopus
    o.hurtT -= dt; o.frozenT -= dt;
    const d = Math.hypot(session.bird.x - o.x, session.bird.alt - o.alt);
    if (o.hp > 0) {
      const enraged = o.hp <= OCTO_HP / 2 ? 1 : 0;
      // It creeps out of its lair toward you (and back when you leave), keeping roughly level with you
      if (o.frozenT <= 0) {
        const wantX = d < OCTO_AGGRO ? clamp(session.bird.x + 16, GROTTO_L - 48, GROTTO_L - 14) : GROTTO_L - 18;
        o.x += clamp(wantX - o.x, -1, 1) * (2.5 + 2 * enraged) * dt;
        o.alt += clamp(clamp(session.bird.alt + 1.5, 4.5, GROTTO_H - 4) - o.alt, -1, 1) * 2 * dt;
      }
      if (o.frozenT <= 0 && d < OCTO_AGGRO && (o.atkT -= dt) <= 0) {
        const ready = o.tents.map((tn, k) => [tn, k]).filter(([tn]) => tn.mode === 'idle' && tn.stun <= 0);
        for (let n = 0; n < 1 + enraged && ready.length; n++) {
          const [tn, k] = ready.splice(Math.floor(Math.random() * ready.length), 1)[0];
          const an = tentAnchor(o, k), lead = 0.35 * (1 - n * 0.6);
          const tx = session.bird.x + session.bird.vx * lead - an.x, ta = session.bird.alt + session.bird.vy * lead - an.alt, l = Math.hypot(tx, ta) || 1;
          tn.mode = 'wind'; tn.wind = OCTO_WIND[enraged]; tn.t = tn.wind; tn.ux = tx / l; tn.uy = ta / l;
        }
        o.atkT = OCTO_ATK[enraged];
      }
      o.tents.forEach((tn, k) => {
        tn.stun -= dt;
        if (tn.mode === 'idle' || (o.frozenT > 0 && tn.mode === 'wind')) return;
        tn.t -= dt;
        if (tn.mode === 'strike' && !(session.bird.invulnT > 0)) {
          // Lashing tentacle: anything along it is grabbed
          const an = tentAnchor(o, k), tip = tentTip(o, tn, k);
          const sx = tip.x - an.x, sy = tip.alt - an.alt, px = session.bird.x - an.x, py = session.bird.alt - an.alt;
          const u = clamp((px * sx + py * sy) / (sx * sx + sy * sy || 1), 0, 1);
          if (Math.hypot(px - sx * u, py - sy * u) < OCTO_HIT) systems.hazards.killBird('octopus', 'Grabbed by the octopus!');
        }
        if (tn.t > 0) return;
        if (tn.mode === 'wind') { tn.mode = 'strike'; tn.t = OCTO_STRIKE; }
        else if (tn.mode === 'strike') { tn.mode = 'retract'; tn.t = OCTO_RETRACT; }
        else tn.mode = 'idle';
      });
      if (session.state.over) return;
      // Talon strike on the head (only while it isn't flinching), then you bounce off
      if (d < OCTO_HEAD_R + 0.8 && session.bird.speed > 4 && o.hurtT <= 0) {
        octoDamage(OCTO_TALON_DMG, 'Talon strike!');
        session.bird.angle = Math.atan2(session.bird.alt - o.alt, session.bird.x - o.x); session.bird.speed = 6;
      } else if (d < OCTO_HEAD_R) {
        session.bird.x = o.x + (session.bird.x - o.x) / (d || 1) * OCTO_HEAD_R; session.bird.alt = clamp(o.alt + (session.bird.alt - o.alt) / (d || 1) * OCTO_HEAD_R, 0.7, GROTTO_H - 0.7);
      }
    }
    for (const k of g.inks) { k.t += dt; k.r = Math.min(9, k.r + dt * 6); k.x -= dt * 1.5; }
    g.inks = g.inks.filter(k => k.t < k.life);
    if (Math.random() < dt * 12) {
      const vx = GROTTO_VENTS[Math.floor(Math.random() * GROTTO_VENTS.length)];
      g.bubbles.push({ x: vx + (Math.random() - 0.5) * VENT_R * 1.4, alt: 0.3, r: 0.15 + Math.random() * 0.3, v: 2 + Math.random() * 2 });
    }
    for (const b of g.bubbles) { b.alt += b.v * dt; b.x += Math.sin(b.alt * 2 + b.r * 9) * dt * 0.6; }
    g.bubbles = g.bubbles.filter(b => b.alt < GROTTO_H);

    // Guns, effects, timers
    for (const t of session.state.tracers) t.t -= dt;
    session.state.tracers = session.state.tracers.filter(t => t.t > 0);
    systems.combat.updateRockets(dt);
    const held = session.bird.carrying;
    if (held && held.kind === 'gun') {
      held.flash = Math.max(0, (held.flash || 0) - dt);
      held.cool = (held.cool || 0) - dt;
      if (systems.combat.gunAuto() && systems.combat.gunAimHeld() && held.cool <= 0) { held.cool = AUTO_FIRE_DT; systems.combat.fireGun(); }
    }
    systems.companions.updateFeathers(dt);
    systems.flight.updateParticles(dt);
    for (const r of session.state.rings) r.t += dt;
    session.state.rings = session.state.rings.filter(r => r.t < 0.8);
    session.state.msgT -= dt;
    systems.combat.tickToast(dt);

    // Camera: the whole tunnel height, following the bird along it (leaning ahead to frame the octopus when close)
    const z = viewport.H / (GROTTO_H * 2.2), half = viewport.W / 2 / z;
    session.cam.zoom = session.cam.zoomY = z;
    const lean = 8 + 14 * clamp(1 - (o.x - session.bird.x - 25) / 40, 0, 1);
    session.cam.x = GROTTO_L < half * 2 ? GROTTO_L / 2 : clamp(session.bird.x + lean, half - 4, GROTTO_L - half + 6);
    session.cam.alt = GROTTO_H / 2;
    session.cam.shake = 0;
  }

  function spawnHazards() {
    const hz = session.state.hazards, dg = systems.hazards.danger();
    const ci = Math.floor(session.bird.x / CAT_CELL);
    for (let i = ci - 8; i <= ci + 8; i++) {
      if (hz.seen.has('c' + i)) continue;
      hz.seen.add('c' + i);
      const x = (i + 0.2 + Math.random() * 0.6) * CAT_CELL;
      if (Math.random() > 0.15 + 0.2 * dg || Math.abs(x) < 250 || systems.world.lakeAtX(x)) continue;
      hz.cats.push({ x, alt: 0, vx: 0, vy: 0, mode: 'hide', t: 0, dir: randDir(), alertT: 0 });
    }
    if (session.state.day >= HUNTER_FROM_DAY) {
      const hi = Math.floor(session.bird.x / HUNTER_CELL);
      for (let i = hi - 2; i <= hi + 2; i++) {
        if (hz.seen.has('h' + i)) continue;
        hz.seen.add('h' + i);
        const x = (i + 0.2 + Math.random() * 0.6) * HUNTER_CELL;
        if (Math.random() > 0.3 + 0.35 * dg || Math.abs(x) < 400 || systems.world.lakeAtX(x)) continue;
        hz.hunters.push({ x, lock: 0, reload: 0, flash: 0, ax: x, aalt: 30, tracking: false, aim: 0, tracer: 0 });
      }
    }
    hz.cats = hz.cats.filter(c => !c.gone && Math.abs(c.x - session.bird.x) < 3000);
    hz.hunters = hz.hunters.filter(h => !h.gone && Math.abs(h.x - session.bird.x) < 3000);
  }
  return { catchDuckFromBelow, enterGrotto, grottoOpen, grottoTargets, makeFish, octoHit, spawnHazards, splashAt, tentAnchor, tentTip, updateFish, updateGrotto };
}
