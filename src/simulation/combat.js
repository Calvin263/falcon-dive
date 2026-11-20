import { G, SHELL_CRACK_SPEED, TURTLE_HOMING, STARLING_COMBO_TIME, CHAIN_MAX, HAZARD_BOUNTY, HAZARD_NAME, ACHIEVEMENTS, STATS, RICOCHET_RANGE, GUN_STATS, GUN_HUNTER_HIT_RADIUS, SAT_R, SPECIES, GUN_GRAB_R, GUN_GRAB_ALT, GUN_AIR_GRAB, GUN_TERMINAL, GUN_REGRAB_SEP, AUTO_FIRE_DT, ROCKET_SPEED, ROCKET_BLAST, ROCKET_FUSE, ROCKET_TURN, ROCKET_LOCK_CONE, ROCKET_SEEK, ROCKET_SEEK_CONE, UNDERWATER_RANGE, TORPEDO_SPEED, GROTTO_L, GROTTO_H } from '../config.js';
import { clamp, randDir, wrapAngle } from '../core/math.js';

export function createCombat({ session, viewport, systems }) {
  const gunStat = k => GUN_STATS[k][systems.progression.tier('rifle')];
  const gunFreeAim = () => systems.progression.tier('rifle') >= 2;
  const gunAuto = () => systems.progression.tier('rifle') === 4;
  const gunBazooka = () => systems.progression.tier('rifle') >= 5;
  const gunAimHeld = () => !!(session.bird.carrying && session.bird.carrying.kind === 'gun' && session.mouse.aiming && session.mouse.throwHeld);

  function aimWorld() {
    return { x: session.cam.x + (session.mouse.x - viewport.W / 2) / session.cam.zoom, alt: session.cam.alt + (viewport.H / 2 - session.mouse.y) / session.cam.zoomY };
  }

  function gunRay() {
    if (!gunFreeAim()) return { ux: Math.cos(session.bird.angle), uy: Math.sin(session.bird.angle) };
    const a = aimWorld(), dx = a.x - session.bird.x, dy = a.alt - session.bird.alt, l = Math.hypot(dx, dy) || 1;
    return { ux: dx / l, uy: dy / l };
  }

  // Everything a bullet or blast can take: [x, alt, hit radius, hit]
  function gunTargets() {
    const out = [], w = gunStat('width');
    if (session.state.grotto) return systems.water.grottoTargets(w);
    if (session.bird.inWater) for (const f of session.state.fish) if (!f.gone && f.lake.x0 === session.bird.inWater.x0) out.push([f.x, f.alt, w * 0.7, { type: 'fish', f }]);
    for (const p of session.prey) {
      if (p.gone || p.hidden || p.spent) continue;
      if (p.kind === 'flock') { for (const m of p.members) if (!m.caught) out.push([m.x, m.alt, w, { type: 'prey', p, m }]); continue; }
      const alt = SPECIES[p.kind].air && !p.sitting ? p.alt : (p.alt ?? 0) + 0.4;
      out.push([p.x, alt, w, { type: 'prey', p, m: p }]);
    }
    for (const r of session.state.rivals) if (!r.gone) out.push([r.x, r.alt, w + 1, { type: 'buzzard', r }]);
    const hz = session.state.hazards;
    for (const c of hz.cats) if (!c.gone) out.push([c.x, c.alt + 0.4, w, { type: 'hz', kind: 'cat', obj: c }]);
    for (const h of hz.hunters) if (!h.gone) out.push([h.x, 1, Math.max(w, GUN_HUNTER_HIT_RADIUS), { type: 'hz', kind: 'hunter', obj: h }]);
    if (hz.hawk) out.push([hz.hawk.x, hz.hawk.alt, w + 1, { type: 'hz', kind: 'hawk', obj: hz.hawk }]);
    // Turtles in flight: skeet
    for (const f of session.state.fallers) if (!f.done && f.alt > 0.5) out.push([f.x, f.alt, w, { type: 'skeet', f }]);
    const sat = session.state.satellite;
    if (sat && !sat.down) out.push([sat.x, sat.alt, w + SAT_R, { type: 'sat', sat }]);
    out.push(...systems.sky.targets());
    return out;
  }

  // First thing along the ray (t = metres along it); stops at the ground (underwater: the surface, lake bed and
  // UNDERWATER_RANGE; in the grotto: its floor and ceiling)
  function gunTrace(ux, uy) {
    let best = null, bestT = gunStat('range');
    const wl = session.bird.inWater;
    if (session.state.grotto) {
      bestT = Math.min(bestT, GROTTO_L);
      if (ux > 0) bestT = Math.min(bestT, Math.max(0, GROTTO_L - session.bird.x) / ux);
      if (ux < 0) bestT = Math.min(bestT, Math.max(0, session.bird.x) / -ux);
      if (uy < 0) bestT = Math.min(bestT, Math.max(0, session.bird.alt) / -uy);
      if (uy > 0) bestT = Math.min(bestT, Math.max(0, GROTTO_H - session.bird.alt) / uy);
    } else if (wl) {
      bestT = Math.min(bestT, UNDERWATER_RANGE);
      if (uy > 0) bestT = Math.min(bestT, Math.max(0, -session.bird.alt) / uy);
      if (uy < 0) bestT = Math.min(bestT, Math.max(0, session.bird.alt + wl.depth) / -uy);
    } else if (uy < 0) bestT = Math.min(bestT, Math.max(0, session.bird.alt) / -uy);
    for (const [x, alt, r, hit] of gunTargets()) {
      const px = x - session.bird.x, py = alt - session.bird.alt, t = px * ux + py * uy;
      if (t > 0 && t < bestT + r && Math.abs(px * uy - py * ux) < r) { bestT = Math.min(bestT, t); best = hit; }
    }
    return { t: bestT, hit: best };
  }

  // Award whatever a bullet or rocket took out
  function takeShot(hit, verb, method = 'gun') {
    const shot = method === 'gun';
    if (hit.type === 'prey') {
      const { p, m } = hit, s = SPECIES[p.kind];
      if (p.kind === 'flock') {
        m.caught = true; p.scatterT = 3; p.alertT = 0.8;
        systems.prey.award({ kind: 'flock', speed: session.bird.speed, air: true, count: 1, shot, method }, systems.session.priceCatch('flock', {}), `${verb} Starling`);
      } else {
        p.gone = true;
        const what = p.kind === 'turtle' ? 'Turtle — shell cracked' : s.name;
        systems.prey.award({ kind: p.kind, speed: session.bird.speed, air: s.air, shot, method }, systems.session.priceCatch(p.kind, { unseen: !p.noticed }), `${verb} ${what}`);
      }
    } else if (hit.type === 'buzzard') {
      const r = hit.r;
      systems.prey.removeHazard('buzzard', r);
      r.mode = 'leave';
      systems.prey.award({ kind: 'turtle', speed: session.bird.speed, targetKind: 'buzzard', stolen: true, shot, method }, systems.session.priceCatch('buzzard', {}), `${verb} Buzzard`);
    } else if (hit.type === 'skeet') {
      hit.f.done = true;
      systems.prey.award({ kind: 'turtle', speed: session.bird.speed, shot, method }, systems.session.priceCatch('turtle', { skeet: shot }), `${verb} Shell shattered`);
    } else if (hit.type === 'fish') {
      const f = hit.f;
      f.gone = true;
      systems.prey.award({ kind: f.kind, speed: session.bird.speed, water: true, shot, method, depth: -f.alt }, systems.session.priceCatch(f.kind, { unseen: !f.spooked }), `${verb} ${SPECIES[f.kind].name}`);
    } else if (hit.type === 'sky') {
      systems.sky.hitPart(hit.part, method, verb === 'BOOM!' ? 3 : 1);
    } else if (hit.type === 'octo') {
      systems.water.octoHit(hit, verb, method);
    } else if (hit.type === 'sat') {
      const s = hit.sat;
      s.down = true; s.vy = 0; s.spinV = randDir() * 2;
      systems.prey.award({ kind: 'satellite', targetKind: 'satellite', speed: session.bird.speed, shot, method }, systems.session.priceCatch('satellite', {}), `${verb} Satellite down`);
      for (let i = 0; i < 30; i++) session.particles.push({ x: s.x, alt: s.alt, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, life: 1.4 });
      session.cam.shake = Math.max(session.cam.shake, 6);
    } else {
      systems.prey.award({ kind: 'turtle', speed: session.bird.speed, targetKind: hit.kind, stolen: true, shot, method }, systems.session.priceCatch(hit.kind, {}), `${verb} ${HAZARD_NAME[hit.kind]}`);
      systems.prey.removeHazard(hit.kind, hit.obj);
    }
  }

  // The bang sends everything nearby running
  function gunSpook(x, r) {
    if (session.state.grotto) return;
    for (const p of session.prey) {
      if (p.gone || p.spent || Math.abs(p.x - x) > r) continue;
      if (SPECIES[p.kind].air) systems.prey.spookAir(p); else { p.fleeing = true; p.alertT = 1; }
    }
  }

  // Identity of whatever a gunTargets() entry stands for, so a rocket can keep following it frame to frame
  const hitKey = h => h.m || h.r || h.obj || h.f || h.part || h.sat;
  // Target closest to the line (x, alt) + t·(ux, uy) within a cone; returns a gunTargets() entry
  function rocketLock(x, alt, ux, uy, maxD, cone) {
    let best = null, bestS = Infinity;
    for (const e of gunTargets()) {
      const dx = e[0] - x, dy = e[1] - alt, d = Math.hypot(dx, dy);
      if (d < 2 || d > maxD || (dx * ux + dy * uy) / d < Math.cos(cone)) continue;
      const s = Math.abs(dx * uy - dy * ux) + d * 0.05;
      if (s < bestS) { bestS = s; best = e; }
    }
    return best;
  }

  function fireGun() {
    const g = session.bird.carrying;
    if (!g || g.kind !== 'gun' || g.ammo <= 0 || session.state.over || session.paused) return;
    const { ux, uy } = gunRay();
    g.ammo--; g.flash = 0.09;
    session.state.rings.push({ x: session.bird.x, alt: session.bird.alt, t: 0, r: 60, kind: 'shot' });
    if (gunBazooka()) {
      const water = !!(session.bird.inWater || session.state.grotto), sp = water ? TORPEDO_SPEED : ROCKET_SPEED;
      const lock = rocketLock(session.bird.x, session.bird.alt, ux, uy, water ? 120 : gunStat('range'), ROCKET_LOCK_CONE);
      session.state.rockets.push({ x: session.bird.x + ux * 2, alt: session.bird.alt + uy * 2, vx: ux * sp, vy: uy * sp, t: 0, water, lake: session.bird.inWater,
                           lock: lock && hitKey(lock[3]) });
      gunSpook(session.bird.x, 60);
    } else {
      const { t, hit } = gunTrace(ux, uy);
      session.state.tracers.push({ x0: session.bird.x, a0: session.bird.alt, x1: session.bird.x + ux * t, a1: session.bird.alt + uy * t, t: 0.25 });
      if (hit) {
        takeShot(hit, 'BANG!');
        const hx = session.bird.x + ux * t, ha = Math.max(0.5, session.bird.alt + uy * t);
        for (let i = 0; i < 16; i++) session.particles.push({ x: hx, alt: ha, vx: (Math.random() - 0.5) * 16, vy: Math.random() * 10, life: 1 });
      }
      gunSpook(session.bird.x, gunStat('spook'));
    }
    if (g.ammo <= 0) {
      session.bird.carrying = null;
      session.mouse.aiming = false; session.mouse.throwHeld = false; session.mouse.steer = null;
      toast(gunBazooka() ? 'Last rocket away — launcher dropped' : 'Out of ammo — gun dropped', 2.5);
    }
  }

  function explodeRocket(r) {
    r.done = true;
    const bx = r.x, ba = r.water ? r.alt : Math.max(0, r.alt);
    session.state.blasts.push({ x: bx, alt: ba, t: 0 });
    session.state.rings.push({ x: bx, alt: ba, t: 0, r: 120, kind: 'shot' });
    session.cam.shake = Math.max(session.cam.shake, 8);
    for (const [x, alt, rad, hit] of gunTargets()) {
      if (Math.hypot(x - bx, alt - ba) > ROCKET_BLAST + rad) continue;
      takeShot(hit, 'BOOM!');
    }
    for (let i = 0; i < 40; i++) session.particles.push({
      x: bx, alt: ba + 1, vx: (Math.random() - 0.5) * 40, vy: Math.random() * 26, life: 1.2
    });
    gunSpook(bx, gunStat('spook'));
  }

  function updateRockets(dt) {
    for (const r of session.state.rockets) {
      r.t += dt;
      // Homing: follow the locked target; if it's gone, seek the best one ahead
      let sp = Math.hypot(r.vx, r.vy) || 1, tg = null;
      if (r.lock) tg = gunTargets().find(e => hitKey(e[3]) === r.lock) || null;
      if (!tg && r.t > 0.15) {
        tg = rocketLock(r.x, r.alt, r.vx / sp, r.vy / sp, r.water ? 80 : ROCKET_SEEK, ROCKET_SEEK_CONE);
        r.lock = tg && hitKey(tg[3]);
      }
      if (tg) {
        const cur = Math.atan2(r.vy, r.vx), want = Math.atan2(tg[1] - r.alt, tg[0] - r.x);
        const ang = cur + clamp(wrapAngle(want - cur), -ROCKET_TURN * dt, ROCKET_TURN * dt);
        r.vx = Math.cos(ang) * sp; r.vy = Math.sin(ang) * sp;
      }
      // Sub-steps so a fast rocket can't skip past a small target
      const steps = Math.ceil(sp * dt / 1.5), targets = gunTargets();
      for (let k = 0; k < steps && !r.done; k++) {
        const h = dt / steps;
        if (!tg && !r.water) r.vy -= G * 0.15 * h;
        r.x += r.vx * h; r.alt += r.vy * h;
        let boom = r.t > ROCKET_FUSE;
        if (session.state.grotto) boom ||= r.alt <= 0 || r.alt >= GROTTO_H || r.x < 0 || r.x > GROTTO_L;
        else if (r.water) boom ||= r.alt >= 0 || !r.lake || r.alt <= -r.lake.depth || r.x < r.lake.x0 || r.x > r.lake.x0 + r.lake.w;
        else boom ||= r.alt <= 0;
        if (!boom) for (const [x, alt, rad] of targets) if (Math.hypot(x - r.x, alt - r.alt) < rad + 1) { boom = true; break; }
        if (boom) explodeRocket(r);
      }
      if (!r.done && Math.random() < 0.6) session.particles.push({ x: r.x, alt: r.alt, vx: -r.vx * 0.05, vy: -r.vy * 0.05 + 1, life: 0.5 });
    }
    session.state.rockets = session.state.rockets.filter(r => !r.done);
    for (const b of session.state.blasts) b.t += dt;
    session.state.blasts = session.state.blasts.filter(b => b.t < 0.6);
  }

  function updateGuns(dt) {
    for (const t of session.state.tracers) t.t -= dt;
    session.state.tracers = session.state.tracers.filter(t => t.t > 0);
    updateRockets(dt);
    const held = session.bird.carrying;
    if (held && held.kind === 'gun') {
      held.flash = Math.max(0, (held.flash || 0) - dt);
      held.cool = (held.cool || 0) - dt;
      if (gunAuto() && gunAimHeld() && held.cool <= 0) { held.cool = AUTO_FIRE_DT; fireGun(); }
    }
    for (const g of session.state.guns) {
      g.noGrab = Math.max(0, (g.noGrab || 0) - dt);
      // A rifle you let go only becomes catchable again once you've separated from it
      if (g.near && Math.hypot(g.x - session.bird.x, g.alt - session.bird.alt) > systems.progression.airCatchRadius() * GUN_REGRAB_SEP) g.near = false;
      if (g.alt > 0) {
        // Tumbling rifles have a lot of drag (terminal ~GUN_TERMINAL m/s), so a stoop can run one down
        const sp = Math.hypot(g.vx, g.vy), k = G / (GUN_TERMINAL * GUN_TERMINAL) * sp;
        g.vx -= g.vx * k * dt; g.vy -= (G + g.vy * k) * dt;
        g.x += g.vx * dt; g.alt += g.vy * dt;
        if (g.alt <= 0) { g.alt = 0; g.vx = 0; g.vy = 0; }
      }
    }
    // Empty talons pick a rifle up; already holding one, flying over another refills your ammo from it
    const holdingGun = session.bird.carrying && session.bird.carrying.kind === 'gun';
    if ((!session.bird.carrying || holdingGun) && !session.state.over && !session.bird.inWater) {
      for (const g of session.state.guns) {
        if (g.noGrab > 0 && g.near) continue;
        if (holdingGun && session.bird.carrying.ammo >= gunStat('ammo')) break;
        // In flight: snatch it like air prey; on the ground: swoop low over it
        const inAir = g.alt > 0.5;
        if (inAir ? systems.prey.sweptDist(g.x, g.alt, dt) > systems.progression.airCatchRadius() * GUN_AIR_GRAB
          : g.alt > 0 || Math.abs(g.x - session.bird.x) > GUN_GRAB_R || session.bird.alt > GUN_GRAB_ALT * STATS.catchAlt[systems.progression.tier('talons')]) continue;
        g.gone = true;
        if (holdingGun) {
          const held = session.bird.carrying, before = held.ammo;
          held.ammo = gunStat('ammo');
          session.state.msg = `Reloaded from a dropped rifle! +${held.ammo - before} ${gunBazooka() ? 'rockets' : 'shots'}`; session.state.msgT = 2; session.state.msgTags = null;
          break;
        }
        session.bird.carrying = { kind: 'gun', ammo: g.ammo };
        const how = gunAuto() ? 'hold right-click to spray' : gunFreeAim() ? 'hold right-click to aim anywhere, release to fire' : 'hold right-click, release to fire straight ahead';
        session.state.msg = `${inAir ? 'Caught it mid-air' : 'Got the ' + (gunBazooka() ? 'bazooka' : 'rifle')}! ${how}`; session.state.msgT = 2; session.state.msgTags = null;
        if (!session.progress.gunFound) {
          session.progress.gunFound = true; systems.progression.saveProgress();
          toast('New upgrade unlocked in the Roost: Rifle', 4);
        }
        break;
      }
    }
    session.state.guns = session.state.guns.filter(g => !g.gone && Math.abs(g.x - session.bird.x) < 3000);
  }

  // Ground impact speed of something released here, from energy: horizontal speed plus vertical gained over the fall
  const predictImpact = (alt, vx, vy) => Math.hypot(vx, Math.sqrt(vy * vy + 2 * G * Math.max(0, alt)));

  // Achievements live in progress.ach (id -> day earned); the reward goes straight into the wallet
  function achieve(id) {
    const a = ACHIEVEMENTS.find(x => x.id === id);
    if (!a || session.progress.ach[id]) return;
    session.progress.ach[id] = session.state.day;
    session.progress.money += a.reward;
    session.state.achToday.push(id);
    systems.progression.saveProgress();
    toast(`🏆 Achievement: ${a.name}  +$${a.reward}`, 4);
  }
  // Toasts queue up so simultaneous achievements don't overwrite each other
  function toast(text, t = 3) {
    if ((session.state.toast?.text === text && session.state.toast.t > 0) || session.state.toastQ.some(notice => notice.text === text)) return;
    if (session.state.toast && session.state.toast.t > 0) session.state.toastQ.push({ text, t });
    else session.state.toast = { text, t };
  }
  function tickToast(dt) {
    if (!session.state.toast) return;
    session.state.toast.t -= dt;
    if (session.state.toast.t <= 0 && session.state.toastQ && session.state.toastQ.length) session.state.toast = session.state.toastQ.shift();
  }
  // Achievements that follow from a scored catch
  function catchAchievements(e, tags) {
    const has = s => tags.some(t => t.startsWith(s));
    if (e.turtleHit && !e.targetKind) achieve('aeschylus');
    if (e.turtleHit && HAZARD_BOUNTY[e.targetKind]) achieve('shellshock');
    if (e.targetKind === 'hunter') achieve('tables');
    if (e.targetKind === 'octopus') achieve('kraken');
    if (e.targetKind === 'satellite') achieve('satellite');
    if (has('Skeet')) achieve('skeet');
    if (has('From below') && e.kind === 'duck') achieve('below');
    if (!e.shot && e.method !== 'buzzsaw' && !e.drowned && !e.turtleHit && !e.targetKind && (e.speed || 0) * 3.6 >= 300) achieve('stoop');
    if (systems.session.chainMult() >= CHAIN_MAX) achieve('chain');
    if (session.state.score >= 500) achieve('bigday');
    if (SPECIES[e.kind] && !e.targetKind && !session.progress.caught[e.kind]) {
      session.progress.caught[e.kind] = session.state.day;
      systems.progression.saveProgress();
      if (Object.keys(SPECIES).every(k => session.progress.caught[k])) achieve('naturalist');
    }
  }

  // A falling turtle that lands on (or passes through) another animal takes it out
  function turtleStrike(p, member, f) {
    if (f.hitBuzzard || f.done || !member || member.caught) return;
    const s = SPECIES[p.kind];
    const impact = Math.hypot(f.vx, f.vy);
    const unseen = !p.noticed;
    if (p.kind === 'flock') {
      member.caught = true;
      p.scatterT = 3;
      p.alertT = 0.8;
      if (!p.combo) {
        const priced = systems.session.priceCatch('flock', { turtleHit: true, impact, unseen });
        const entry = systems.prey.award({ kind: 'flock', speed: impact, rel: impact, alt: member.alt ?? 0, air: true, count: 1, turtleHit: true }, priced, 'TURTLE STRIKE! Starling');
        p.combo = { entry, t: STARLING_COMBO_TIME };
      } else {
        systems.prey.addStarling(p, true);
      }
    } else {
      p.gone = true;
      f.struck = true;
      const priced = systems.session.priceCatch(p.kind, { turtleHit: true, impact, unseen });
      systems.prey.award({ kind: p.kind, speed: impact, turtleHit: true, air: s.air, alt: member.alt ?? 0, minAlt: 0 }, priced, `TURTLE STRIKE! ${s.name}`);
    }
    for (let i = 0; i < 20; i++) session.particles.push({
      x: member.x ?? p.x, alt: Math.max(0.5, member.alt ?? 0.5), vx: (Math.random() - 0.5) * 16, vy: Math.random() * 10, life: 1
    });
    systems.sky.impact(f, member.x ?? p.x, member.alt ?? 0);
    if (p.kind !== 'flock') { f.struck = true; ricochet(f); }
  }

  // Ricochet: after a hit, hop on a ballistic arc toward the nearest other target and keep homing
  function ricochet(f) {
    if (!(f.bounces > 0)) return;
    let best = null, bestD = RICOCHET_RANGE;
    for (const p of session.prey) {
      if (p.gone || p.hidden || p.spent || p.kind === 'turtle' || p.kind === 'flock') continue;
      const alt = SPECIES[p.kind].air && !p.sitting ? p.alt : 0;
      const d = Math.hypot(p.x - f.x, alt - f.alt);
      if (d < bestD) { bestD = d; best = { t: p, x: p.x, alt }; }
    }
    for (const r of session.state.rivals) {
      if (r.gone) continue;
      const d = Math.hypot(r.x - f.x, r.alt - f.alt);
      if (d < bestD) { bestD = d; best = { t: { kind: 'buzzard', x: r.x, alt: r.alt, target: r }, x: r.x, alt: r.alt }; }
    }
    for (const t of systems.prey.hazardTargets()) {
      const d = Math.hypot(t.x - f.x, t.alt - f.alt);
      if (d < bestD) { bestD = d; best = { t, x: t.x, alt: t.alt }; }
    }
    if (!best) return;
    const T = Math.max(0.7, Math.min(1.8, bestD / 30));
    f.vx = (best.x - f.x) / T;
    f.vy = (best.alt - f.alt + 0.5 * G * T * T) / T;
    f.alt = Math.max(f.alt, 0.5);
    f.target = best.t;
    f.bounces--;
    f.struck = false; f.hitBuzzard = false; f.done = false;
    f.ricochets = (f.ricochets || 0) + 1;
    f.bounced = true;
    if (session.state.lastCatch) session.state.lastCatch.tags.push(f.ricochets > 1 ? 'Double ricochet' : 'Ricochet');
  }

  function buzzardStrike(f, r) {
    const impact = Math.hypot(f.vx, f.vy);
    // Marked stolen so a buzzard can't steal it back
    const e = systems.prey.award({ kind: 'turtle', speed: impact, turtleHit: true, buzzard: true, targetKind: 'buzzard', stolen: true },
                    systems.session.priceCatch('buzzard', { impact }), 'TURTLE STRIKE! Buzzard');
    systems.prey.removeHazard('buzzard', r);
    r.mode = 'leave'; r.t = 4; r.alertT = 0.8;
    f.struck = true;
    f.hitBuzzard = true;
    systems.sky.impact(f, f.x, f.alt);
    ricochet(f);
  }

  function updateFallers(dt) {
    for (const f of session.state.fallers) {
      if (f.done) continue;
      f.bounced = false;
      f.vy -= G * dt;
      f.vx += (systems.world.windX(f.alt) - f.vx) * Math.min(1, dt * 0.2);
      // Homing on the locked animal; a homing shell whose target is lost (or that had none) looks for a new one
      const lostTarget = () => !f.target || f.target.gone || f.target.hidden || f.target.spent || !!(f.target.target && f.target.target.gone);
      if (f.homing && !f.struck && f.alt > 2 && lostTarget() && (f.seekT = (f.seekT || 0) - dt) <= 0) {
        f.seekT = 0.25;
        f.target = systems.prey.pickThrowTarget(systems.prey.simulateThrow(f.x, f.alt, f.vx, f.vy));
      }
      if (!lostTarget()) {
        // Buzzard / predator locks hold a reference to the live object; follow it rather than the snapshot
        const tg = f.target.target || f.target;
        const air = f.target.kind === 'buzzard' || f.target.air || (SPECIES[f.target.kind]?.air && !tg.sitting);
        const tAlt = air ? tg.alt : 0, tvx = tg.curVx ?? tg.vx ?? 0;
        const hm = f.homing || TURTLE_HOMING;
        if (air) {
          // Fliers: pursue in both axes, aiming where it will be (gravity included)
          const d = Math.hypot(tg.x - f.x, tAlt - f.alt), T = clamp(d / Math.max(15, Math.hypot(f.vx, f.vy)), 0.3, 2);
          const wx = (tg.x + tvx * T - f.x) / T, wy = (tAlt + (tg.vy || 0) * T - f.alt) / T + 0.5 * G * T;
          f.vx += clamp((wx - f.vx) * 3, -hm, hm) * dt;
          f.vy += clamp((wy - f.vy) * 3, -hm, hm) * dt;
        } else if (f.alt > tAlt) {
          const tRem = (f.vy + Math.sqrt(f.vy * f.vy + 2 * G * (f.alt - tAlt))) / G;
          const wantVx = (tg.x - f.x) / Math.max(0.3, tRem) + tvx;
          f.vx += clamp((wantVx - f.vx) * 3, -hm, hm) * dt;
        }
      }
      f.x += f.vx * dt; f.alt += f.vy * dt; f.spin += dt * 5;

      if (!(f.struck && f.alt > 0 && !f.hitBuzzard)) {
        if (systems.sky.shellHit(f, dt)) continue;
        for (const r of session.state.rivals) {
          if (r.gone) continue;
          if (Math.hypot(r.x - f.x, r.alt - f.alt) < 5) {
            buzzardStrike(f, r);
            break;
          }
        }
        const hit = systems.prey.hazardHitBy(f);
        if (hit) systems.prey.hazardStrike(f, hit.kind, hit.obj);
        for (const p of session.prey) {
          if (p.gone || p.spent || !SPECIES[p.kind].air) continue;
          const targets = p.kind === 'flock' ? p.members.filter(m => !m.caught) : [p];
          for (const t of targets) if (Math.hypot(t.x - f.x, t.alt - f.alt) < 3) turtleStrike(p, t, f);
        }
      }
      if (f.alt > 0) continue;
      const lake = systems.world.lakeAtX(f.x);
      if (lake) {
        systems.sky.ground(f, f.x);
        f.done = true;
        systems.water.splashAt(f.x, lake);
        systems.prey.award({ kind: 'turtle', speed: Math.hypot(f.vx, f.vy), drowned: true, water: true, method: 'water' },
          systems.session.priceCatch('turtle', { drowned: true }), 'Turtle sank!');
        achieve('drownedTurtle');
        continue;
      }
      if (f.struck || f.hitBuzzard) {
        f.done = true;
        const t = systems.prey.makeGround(f.x, 'turtle');
        if (f.chargeUntil != null) t.chargeUntil = f.chargeUntil;
        session.prey.push(t);
        continue;
      }
      for (const p of session.prey) {
        if (p.gone || p.hidden || SPECIES[p.kind].air || p.kind === 'turtle') continue;
        if (Math.abs(p.x - f.x) < 3) turtleStrike(p, p, f);
      }
      f.done = true;
      // A ground hit that ricocheted is airborne again
      if (f.bounced) { f.bounced = false; f.done = false; continue; }
      // A ricochet that missed its next target just lands; the turtle walks off
      if (f.ricochets) { const t = systems.prey.makeGround(f.x, 'turtle'); if (f.chargeUntil != null) t.chargeUntil = f.chargeUntil; session.prey.push(t); continue; }
      const impact = Math.hypot(f.vx, f.vy);
      if (impact >= SHELL_CRACK_SPEED) {
        systems.prey.award({ kind: 'turtle', speed: impact, drop: f.dropAlt }, systems.session.priceCatch('turtle', { impact }), 'Shell cracked!');
        for (let i = 0; i < 25; i++) session.particles.push({
          x: f.x, alt: 0.5, vx: (Math.random() - 0.5) * 20, vy: Math.random() * 12, life: 1.2
        });
      } else {
        const t = systems.prey.makeGround(f.x, 'turtle');
        if (f.chargeUntil != null) t.chargeUntil = f.chargeUntil;
        session.prey.push(t);
        if (!f.struck) {
          session.state.msg = `Hit at ${(impact * 3.6).toFixed(0)} km/h — the turtle walked away (need ${(SHELL_CRACK_SPEED * 3.6).toFixed(0)})`;
          session.state.msgT = 2.5;
        }
      }
    }
    session.state.fallers = session.state.fallers.filter(f => !f.done);
  }
  return { achieve, catchAchievements, fireGun, gunAimHeld, gunAuto, gunBazooka, gunFreeAim, gunRay, gunStat, gunTargets, gunTrace, predictImpact, ricochet, takeShot, tickToast, toast, updateFallers, updateGuns, updateRockets };
}
