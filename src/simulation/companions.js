import { EYAS_GUN, SPECIES, EYAS, EYAS_SHARE, EYAS_TURN, EYAS_CHASE_T, EYAS_REST_T, EYAS_CATCH_R, EYAS_SPOOK_D, EYAS_DROP, EYAS_HIT, EYAS_GUN_COOL } from '../config.js';
import { clamp, wrapAngle } from '../core/math.js';

export function createCompanions({ session, viewport, systems }) {
  function spawnEyases() {
    session.state.eyases = [];
    const ammo = EYAS_GUN.ammo[systems.progression.tier('eyasgun')];
    for (let i = 0; i < EYAS.count[systems.progression.tier('eyas')]; i++) {
      session.state.eyases.push({ i, x: session.bird.x - 15 - 10 * i, alt: session.bird.alt + 6 + 5 * i, vx: 12, vy: 0, mode: 'follow', t: 2 + i * 1.5,
                          flapT: i * 2, target: null, carry: null, ammo, cool: 0 });
    }
  }
  function eyasShoot(e, x, alt) {
    e.ammo--; e.cool = EYAS_GUN_COOL;
    session.state.tracers.push({ x0: e.x, a0: e.alt, x1: x, a1: alt, t: 0.25 });
    session.state.rings.push({ x: e.x, alt: e.alt, t: 0, r: 40, kind: 'shot' });
    for (let i = 0; i < 8; i++) session.particles.push({ x, alt: Math.max(0.5, alt), vx: (Math.random() - 0.5) * 10, vy: Math.random() * 7, life: 0.7 });
  }
  // Escort duty: interrupt a shooter or a stooping goshawk.
  function eyasGuard(e, range) {
    for (const h of [...session.state.hazards.hunters, ...session.state.rivals.filter(r => r.gun?.ammo > 0)]) {
      const alt = systems.hazards.shotAltitude(h), kind = h.gun ? 'buzzard' : 'hunter';
      if (h.gone || !(h.aim > 0 || h.lock > 0.5) || Math.hypot(h.x - e.x, alt - e.alt) > range * 1.3) continue;
      eyasShoot(e, h.x, alt);
      systems.prey.award({ kind: 'turtle', speed: 0, targetKind: kind, stolen: true, shot: true, eyas: true },
            systems.session.priceCatch(kind, { share: EYAS_SHARE }), `Your eyas shot the ${kind} aiming at you!`);
      systems.prey.removeHazard(kind, h);
      return true;
    }
    const hk = session.state.hazards.hawk;
    if (hk && hk.mode === 'stoop' && Math.hypot(hk.x - e.x, hk.alt - e.alt) < range) {
      eyasShoot(e, hk.x, hk.alt);
      systems.prey.award({ kind: 'turtle', speed: 0, targetKind: 'hawk', stolen: true, shot: true, eyas: true },
            systems.session.priceCatch('hawk', { share: EYAS_SHARE }), 'Your eyas shot the goshawk!');
      systems.prey.removeHazard('hawk', hk);
      return true;
    }
    return false;
  }

  function eyasCanTake(p) {
    if (p.gone || p.spent || p.hidden || p.kind === 'flock' || p.kind === 'turtle') return false;
    const s = SPECIES[p.kind];
    return s.air !== 'water';
  }
  const preyAlt = p => SPECIES[p.kind].air && !p.sitting ? p.alt : (p.alt ?? 0) + 0.4;

  function updateEyases(dt) {
    const t = systems.progression.tier('eyas');
    if (!t || !session.state.eyases) return;
    const dir = Math.sign(session.bird.vx) || 1, bsp = Math.hypot(session.bird.vx, session.bird.vy);
    for (const e of session.state.eyases) {
      e.t -= dt; e.flapT += dt * 11; e.cool = (e.cool || 0) - dt;
      const gunR = EYAS_GUN.range[systems.progression.tier('eyasgun')];
      if (session.state.eyasHunt && e.ammo > 0 && e.cool <= 0 && eyasGuard(e, gunR)) continue;
      if (e.mode === 'chase') {
        const p = e.target;
        if (!p || p.gone || p.spent || p.hidden || e.t <= 0) {
          e.mode = 'follow'; e.t = 2; e.target = null;
        } else if (e.ammo > 0 && e.cool <= 0 && Math.hypot(p.x - e.x, preyAlt(p) - e.alt) < gunR) {
          // Armed: shoot it from range instead of running it down
          const pa = preyAlt(p);
          eyasShoot(e, p.x, pa);
          if (Math.random() < EYAS_HIT) {
            p.gone = true;
            systems.prey.award({ kind: p.kind, speed: 0, air: !!SPECIES[p.kind].air, eyas: true, shot: true },
                  systems.session.priceCatch(p.kind, { share: EYAS_SHARE }), `Your eyas shot a ${SPECIES[p.kind].name}!`);
            e.mode = 'follow'; e.t = EYAS_REST_T * 0.5; e.target = null;
          } else {
            p.eyasSpooked = true; p.noticed = true;
            if (p.sitting) systems.prey.duckTakeOff(p); else if (SPECIES[p.kind].air) systems.prey.spookAir(p); else { p.fleeing = true; p.alertT = 1; }
          }
        } else {
          const pa = preyAlt(p), air = SPECIES[p.kind].air && !p.sitting;
          const pvx = p.curVx ?? p.vx ?? 0, pvy = air ? (p.vy || 0) : 0;
          const d = Math.hypot(p.x - e.x, pa - e.alt), sp = EYAS.speed[t];
          const lead = Math.min(1.5, d / sp);
          const want = Math.atan2(pa + pvy * lead - e.alt, p.x + pvx * lead - e.x), cur = Math.atan2(e.vy, e.vx);
          const ang = cur + clamp(wrapAngle(want - cur), -EYAS_TURN * dt, EYAS_TURN * dt);
          const cs = Math.min(sp, Math.hypot(e.vx, e.vy) + 25 * dt);
          e.vx = Math.cos(ang) * cs; e.vy = Math.sin(ang) * cs;
          if (d < EYAS_SPOOK_D && !p.eyasSpooked) {
            p.eyasSpooked = true; p.noticed = true;
            if (p.sitting) systems.prey.duckTakeOff(p); else if (SPECIES[p.kind].air) systems.prey.spookAir(p); else p.alertT = 0.8;
          }
          // Swept: closest approach of this step's flight segment to the prey
          const sx = e.vx * dt, sy = e.vy * dt, rx = p.x - e.x, ry = pa - e.alt;
          const k = clamp((rx * sx + ry * sy) / (sx * sx + sy * sy || 1), 0, 1);
          if (Math.hypot(rx - sx * k, ry - sy * k) < EYAS_CATCH_R) {
            p.gone = true;
            const priced = systems.session.priceCatch(p.kind, { share: EYAS_SHARE });
            systems.prey.award({ kind: p.kind, speed: cs, air: !!SPECIES[p.kind].air, eyas: true }, priced, `Your eyas caught a ${SPECIES[p.kind].name}!`);
            e.mode = 'follow'; e.t = EYAS_REST_T; e.carry = p.kind; e.target = null;
            for (let i = 0; i < 8; i++) session.particles.push({ x: p.x, alt: pa, vx: (Math.random() - 0.5) * 8, vy: Math.random() * 6, life: 0.7 });
          }
        }
      } else {
        // Formation slot behind and above you; snap back if left far behind (e.g. after a long stoop)
        const gx = session.bird.x - dir * (14 + 9 * e.i), ga = Math.max(session.bird.inWater ? 10 : 3, session.bird.alt + 5 + 4 * e.i);
        const ex = gx - e.x, ea = ga - e.alt;
        if (Math.hypot(ex, ea) > 400) { e.x = gx - dir * 60; e.alt = ga + 20; e.vx = session.bird.vx; e.vy = 0; }
        const maxS = Math.max(EYAS.speed[t], bsp * 1.25 + 10);
        let tvx = (session.bird.inWater ? 0 : session.bird.vx) + ex * 1.5, tvy = (session.bird.inWater ? 0 : session.bird.vy) + ea * 1.5;
        const tl = Math.hypot(tvx, tvy);
        if (tl > maxS) { tvx *= maxS / tl; tvy *= maxS / tl; }
        e.vx += (tvx - e.vx) * Math.min(1, dt * 4); e.vy += (tvy - e.vy) * Math.min(1, dt * 4);
        if (e.t <= 0) e.carry = null;
        if (e.t <= 0 && !session.state.sunset && session.state.eyasHunt) {
          let best = null, bestD = EYAS.range[t];
          for (const p of session.prey) {
            if (!eyasCanTake(p) || session.state.eyases.some(o => o.target === p)) continue;
            const dx = Math.abs(p.x - session.bird.x), dy = session.bird.alt - preyAlt(p);
            if (dx < bestD && dy < EYAS_DROP && dy > -EYAS_DROP * 0.5) { bestD = dx; best = p; }
          }
          if (best) { e.mode = 'chase'; e.t = EYAS_CHASE_T; e.target = best; }
          else e.t = 0.4;
        }
      }
      e.x += e.vx * dt; e.alt = Math.max(0.5, e.alt + e.vy * dt);
    }
  }

  // The eyas call (E): send your eyases out hunting, or call them back to formation (held back, they hold fire too)
  function eyasCall() {
    if (!systems.progression.tier('eyas') || session.state.over || session.paused || session.state.grotto) return;
    session.state.eyasHunt = !session.state.eyasHunt;
    for (const e of session.state.eyases) {
      if (!session.state.eyasHunt && e.mode === 'chase') { e.mode = 'follow'; e.target = null; e.t = 0.5; }
      else if (session.state.eyasHunt) e.t = Math.min(e.t, 0.2);
    }
    session.state.rings.push({ x: session.bird.x, alt: session.bird.alt, t: 0, r: 40, kind: 'screech' });
  }

  function updateFeathers(dt) {
    session.bird.invulnT = Math.max(0, (session.bird.invulnT || 0) - dt);
    for (const f of session.state.featherFx) { f.life -= dt; f.vy -= 3 * dt; f.vx *= 0.97; f.x += f.vx * dt; f.alt += f.vy * dt; f.rot += dt * 4; }
    session.state.featherFx = session.state.featherFx.filter(f => f.life > 0);
  }
  return { eyasCall, spawnEyases, updateEyases, updateFeathers };
}
