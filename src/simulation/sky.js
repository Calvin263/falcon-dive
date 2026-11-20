import { SKY, HUNTER_RELOAD } from '../config.js';
import { clamp } from '../core/math.js';

export function createSkyEncounters({ session, systems }) {
  const newState = () => ({
    fishnado: null, pirates: null, fishnadoSeen: false, piratesSeen: false,
    strike: null, strikeT: 5, pirateT: 25,
    earlyStorm: Math.random() < SKY.earlyStormChance, earlyStormAt: 35 + Math.random() * 20,
    piratesEligible: Math.random() < SKY.pirateChance,
  });
  const message = (text, time = 2) => {
    session.state.msg = text; session.state.msgT = time; session.state.msgTags = null;
  };
  const live = o => o && !o.gone;
  const charge = item => {
    if (!item || item.chargeUntil != null) return false;
    item.chargeUntil = session.state.time + SKY.chargeFuse;
    return true;
  };
  function clearCharge(item) {
    if (item) delete item.chargeUntil;
  }
  function chargeFlash(x, alt) {
    session.state.rings.push({ x, alt, t: 0, r: SKY.dischargeRadius, kind: 'shot' });
    for (let i = 0; i < 12; i++) session.particles.push({
      x, alt, vx: (Math.random() - 0.5) * 28, vy: (Math.random() - 0.5) * 28, life: 0.6,
    });
  }
  function ground(item, x) {
    if (item?.chargeUntil == null) return;
    clearCharge(item);
    chargeFlash(x, 0);
  }
  function discharge(item, x, alt, direct = null) {
    if (item?.chargeUntil == null) return false;
    clearCharge(item);
    chargeFlash(x, alt);
    const nearby = systems.combat.gunTargets().filter(([, , , hit]) => hit.type !== 'sky').concat(targets(true));
    for (const [tx, ta, radius, hit] of nearby) {
      if (hit.type !== 'sky' && hit.type !== 'buzzard' && hit.type !== 'hz') continue;
      if (hit.type === 'sky' && hit.part === direct) continue;
      if (Math.hypot(tx - x, ta - alt) > SKY.dischargeRadius + radius) continue;
      if (hit.type === 'sky') hitPart(hit.part, 'electric', 1);
      else {
        const enemy = hit.r || hit.obj;
        if (!enemy?.gone) {
          enemy.frozenT = Math.max(enemy.frozenT || 0, 2);
          if (enemy.aim > 0) enemy.aim = 0;
          enemy.lock = 0; enemy.watch = 0; enemy.tracking = false;
        }
      }
    }
    return true;
  }
  function impact(item, x, alt) {
    if (!discharge(item, x, alt)) return;
    systems.combat.achieve('lightning');
  }

  function updateCharge() {
    const b = session.bird, held = b.carrying;
    if (held?.kind === 'turtle' && held.chargeUntil != null) {
      if (b.inWater || b.alt < 0) {
        ground(held, b.x);
        message('The water grounded your charged turtle!');
      } else if (session.state.time >= held.chargeUntil) {
        clearCharge(held); chargeFlash(b.x, b.alt);
        systems.hazards.killBird('lightning', 'Your turtle discharged!');
      }
    }
    for (const f of session.state.fallers) {
      if (f.done || f.chargeUntil == null) continue;
      if (f.alt <= 0 && systems.world.lakeAtX(f.x)) {
        ground(f, f.x);
      } else if (session.state.time >= f.chargeUntil) discharge(f, f.x, f.alt);
    }
    for (const p of session.prey) {
      if (p.kind !== 'turtle' || p.gone || p.chargeUntil == null || session.state.time < p.chargeUntil) continue;
      discharge(p, p.x, 0);
    }
    for (const r of session.state.rivals) {
      if (!r.turtle || r.turtle.chargeUntil == null || session.state.time < r.turtle.chargeUntil) continue;
      discharge(r.turtle, r.x, r.alt);
      r.turtle = null;
    }
  }

  function updateStrike(dt) {
    const sky = session.state.sky, storm = session.state.storm;
    if (sky.strike) {
      const s = sky.strike;
      s.t -= dt;
      if (s.t <= 0) {
        const held = session.bird.carrying;
        if (held?.kind === 'turtle' && Math.hypot(session.bird.x - s.x, session.bird.alt - s.alt) < SKY.strikeRadius && charge(held)) {
          message('Lightning turtle! Throw it before it discharges!', 3);
        }
        for (const f of session.state.fallers) {
          if (!f.done && Math.hypot(f.x - s.x, f.alt - s.alt) < SKY.strikeRadius) charge(f);
        }
        chargeFlash(s.x, s.alt);
        sky.strike = null;
      }
      return;
    }
    sky.strikeT -= dt;
    if (storm.k < 0.35 || sky.strikeT > 0) return;
    const held = session.bird.carrying;
    const turtle = held?.kind === 'turtle' && held.chargeUntil == null && !session.bird.inWater
      ? session.bird : session.state.fallers.find(f => !f.done && f.alt > 10 && f.chargeUntil == null);
    if (!turtle) return;
    sky.strike = {
      x: turtle.x + (turtle.vx || 0) * SKY.strikeWindup,
      alt: Math.max(10, turtle.alt + (turtle.vy || 0) * SKY.strikeWindup),
      t: SKY.strikeWindup,
    };
    sky.strikeT = SKY.strikeInterval;
    message('Lightning incoming! A turtle is in the strike zone!', 2);
  }

  function spawnFishnado(lake) {
    const sky = session.state.sky;
    if (sky.fishnadoSeen || !lake) return false;
    const fish = session.state.fish.filter(f => !f.gone && f.lake.x0 === lake.x0).slice(0, 6);
    if (!fish.length) return false;
    session.state.fish = session.state.fish.filter(f => !fish.includes(f));
    const x = lake.x0 - 20;
    sky.fishnado = {
      x, alt: Math.min(session.MAX_ALT - 100, 350 + (session.MAX_ALT - 500) * 0.35),
      lake, fish, shots: [], hp: SKY.fishnadoHp, mode: 'forming', t: 4,
      attack: 0, hurtT: 0, gone: false,
    };
    sky.fishnadoSeen = true;
    message('A waterspout is lifting fish into the sky!', 4);
    return true;
  }

  function spawnPirates(x = session.bird.x + 300) {
    const sky = session.state.sky;
    if (sky.piratesSeen || session.MAX_ALT < 650) return false;
    const alt = Math.min(session.MAX_ALT - 100, 520 + (session.MAX_ALT - 650) * 0.4);
    const p = { x, alt, hp: SKY.pirateHp, hurtT: 0, gone: false, balloons: [], crew: [] };
    for (let i = 0; i < 3; i++) p.balloons.push({ kind: 'balloon', owner: p, index: i, hp: SKY.balloonHp, gone: false });
    for (let i = 0; i < 2; i++) {
      const r = { x: x + (i ? 12 : -12), alt, vx: 0, vy: 0, mode: 'pirate', pirate: p,
        flapT: 0, alertT: 0, gun: { ammo: 4 }, aim: 0, lock: 0, watch: 0,
        reload: HUNTER_RELOAD, flash: 0, tracer: 0, tracking: false };
      p.crew.push(r); session.state.rivals.push(r);
    }
    sky.pirates = p; sky.piratesSeen = true;
    message('Balloon pirates ahead! Watch for rifles!', 3);
    return true;
  }

  const balloonPosition = part => ({
    x: part.owner.x + (part.index - 1) * 16,
    alt: part.owner.alt + 24 + (part.index === 1 ? 7 : 0),
  });
  function targets(includeShielded = false) {
    const sky = session.state.sky, out = [], f = sky.fishnado, p = sky.pirates;
    if (live(f) && f.mode !== 'forming' && (includeShielded || f.mode === 'recovery' || f.mode === 'stunned')) {
      out.push([f.x, f.alt, 12, { type: 'sky', part: f }]);
    }
    if (live(f)) for (const shot of f.shots) {
      if (!shot.gone) out.push([shot.x, shot.alt, 3, { type: 'sky', part: shot }]);
    }
    if (live(p)) {
      out.push([p.x, p.alt, 9, { type: 'sky', part: p }]);
      for (const part of p.balloons) if (!part.gone) {
        const pos = balloonPosition(part);
        out.push([pos.x, pos.alt, 7, { type: 'sky', part }]);
      }
    }
    return out;
  }
  function throwTargets() {
    return targets().filter(([, , , hit]) => hit.part.kind !== 'fishShot').map(([x, alt, , hit]) => ({
      kind: 'sky', x, alt, air: true, target: hit.part,
    }));
  }

  function finish(kind, obj, method) {
    if (obj.gone) return;
    obj.gone = true;
    if (kind === 'fishnado') {
      obj.shots = [];
      for (const f of obj.fish) if (!f.gone) session.state.fish.push(f);
    } else {
      for (const r of obj.crew) if (!r.gone) systems.prey.removeHazard('buzzard', r);
    }
    systems.prey.award({ kind, targetKind: kind, stolen: true, method, shot: method === 'gun' },
      systems.session.priceCatch(kind, {}), kind === 'fishnado' ? 'Fishnado defeated!' : 'Balloon pirates defeated!');
    systems.combat.achieve(kind);
    message(kind === 'fishnado' ? 'Fishnado defeated!' : 'Balloon pirates defeated!', 3);
  }
  function retireAll() {
    const sky = session.state.sky, f = sky.fishnado, p = sky.pirates;
    sky.strike = null;
    if (live(f)) {
      f.gone = true; f.shots = [];
      for (const fish of f.fish) if (!fish.gone) session.state.fish.push(fish);
    }
    if (live(p)) {
      p.gone = true;
      for (const r of p.crew) r.gone = true;
    }
  }

  function hitPart(part, method = 'gun', damage = 1) {
    const sky = session.state.sky, f = sky.fishnado, p = sky.pirates;
    if (!part || part.gone) return;
    if (part.kind === 'fishShot') {
      part.gone = true; part.fish.gone = true;
      return;
    }
    if (part.kind === 'balloon') {
      if (!live(part.owner)) return;
      part.hp -= damage; part.hurtT = 0.4;
      if (part.hp <= 0) { part.gone = true; message('Balloon popped!'); }
      return;
    }
    if (part === f) {
      if (!live(f) || (method !== 'electric' && f.mode !== 'recovery' && f.mode !== 'stunned')) return;
      f.hp -= damage; f.hurtT = 0.4;
      if (method === 'electric') { f.mode = 'stunned'; f.t = 3; }
      if (f.hp <= 0) finish('fishnado', f, method);
    } else if (part === p && live(p)) {
      p.hp -= damage; p.hurtT = 0.3;
      if (p.hp <= 0) finish('pirates', p, method);
    }
  }

  function shellHit(shell, dt) {
    const x0 = shell.x - shell.vx * dt, a0 = shell.alt - shell.vy * dt;
    const dx = shell.x - x0, da = shell.alt - a0, len = dx * dx + da * da || 1;
    for (const [x, alt, radius, hit] of targets(shell.chargeUntil != null)) {
      const u = clamp(((x - x0) * dx + (alt - a0) * da) / len, 0, 1);
      if (Math.hypot(x - x0 - u * dx, alt - a0 - u * da) > radius + 1) continue;
      const charged = shell.chargeUntil != null;
      if (charged) {
        discharge(shell, x, alt, hit.part);
        systems.combat.achieve('lightning');
      }
      hitPart(hit.part, charged ? 'electric' : 'turtle', charged ? 2 : 1);
      shell.struck = true;
      systems.combat.ricochet(shell);
      return true;
    }
    return false;
  }

  function launchFish(f) {
    const available = f.fish.filter(fish => !fish.gone && !f.shots.some(s => s.fish === fish && !s.gone));
    const count = f.attack % 2 ? Math.min(3, available.length) : Math.min(1, available.length);
    for (let i = 0; i < count; i++) {
      const angle = f.aim + (i - (count - 1) / 2) * 0.28;
      f.shots.push({ kind: 'fishShot', fish: available[i], x: f.x, alt: f.alt,
        vx: Math.cos(angle) * SKY.fishSpeed, vy: Math.sin(angle) * SKY.fishSpeed, t: 4, gone: false });
    }
    f.attack++;
  }
  function updateFishnado(dt) {
    const f = session.state.sky.fishnado;
    if (!live(f)) return;
    if (Math.abs(f.x - session.bird.x) > SKY.retention) {
      f.gone = true; f.shots = [];
      for (const fish of f.fish) if (!fish.gone) session.state.fish.push(fish);
      return;
    }
    f.hurtT -= dt; f.t -= dt;
    if (f.mode === 'forming') f.x = f.lake.x0 - 20 + (f.lake.w * 0.5 + 20) * clamp(1 - f.t / 4, 0, 1);
    if (f.mode === 'forming' && f.t <= 0) { f.mode = 'recovery'; f.t = 3; }
    else if ((f.mode === 'recovery' || f.mode === 'stunned') && f.t <= 0) {
      if (f.fish.some(fish => !fish.gone)) {
        f.mode = 'wind'; f.t = 1.5;
        f.aim = Math.atan2(session.bird.alt - f.alt, session.bird.x - f.x);
      } else f.t = 3;
    } else if (f.mode === 'wind' && f.t <= 0) {
      launchFish(f); f.mode = 'recovery'; f.t = f.hp <= SKY.fishnadoHp / 2 ? 2 : 3.5;
    }
    for (const shot of f.shots) {
      if (shot.gone) continue;
      const oldX = shot.x, oldAlt = shot.alt;
      shot.x += shot.vx * dt; shot.alt += shot.vy * dt; shot.t -= dt;
      const rx = oldX - (session.bird.x - session.bird.vx * dt);
      const ra = oldAlt - (session.bird.alt - session.bird.vy * dt);
      const dx = (shot.vx - session.bird.vx) * dt, da = (shot.vy - session.bird.vy) * dt;
      const u = clamp(-(rx * dx + ra * da) / (dx * dx + da * da || 1), 0, 1);
      if (!session.bird.inWater && Math.hypot(rx + dx * u, ra + da * u) < 3) {
        shot.gone = true;
        systems.hazards.killBird('fishnado', 'Hit by a flying fish!');
        if (session.state.over) return;
      }
      if (shot.t <= 0 || shot.alt < 0) shot.gone = true;
    }
    f.shots = f.shots.filter(shot => !shot.gone);
  }
  function updatePirates(dt) {
    const p = session.state.sky.pirates;
    if (!live(p)) return;
    if (Math.abs(p.x - session.bird.x) > SKY.retention) {
      p.gone = true;
      for (const r of p.crew) r.gone = true;
      return;
    }
    p.hurtT -= dt;
    for (const b of p.balloons) b.hurtT = (b.hurtT || 0) - dt;
    p.x += systems.world.windX(p.alt) * dt * 0.3;
    const popped = p.balloons.filter(b => b.gone).length;
    p.alt = Math.max(5, p.alt - popped * 2.5 * dt);
    for (const b of p.balloons) Object.assign(b, balloonPosition(b));
    if (p.alt <= 5 || p.crew.every(r => r.gone)) finish('pirates', p, 'talons');
  }
  function lift(x, alt) {
    const f = session.state.sky.fishnado;
    if (!live(f) || alt < 0 || alt > f.alt + 40) return 0;
    return 6 * Math.max(0, 1 - Math.abs(x - f.x) / 55);
  }
  function update(dt) {
    updateCharge();
    if (session.state.over || session.state.sunset) return;
    updateStrike(dt);
    const sky = session.state.sky;
    if (sky.earlyStorm && !sky.fishnadoSeen && session.state.time >= sky.earlyStormAt && session.state.storm.t <= 0) {
      const nearbyLake = session.state.fish.some(f => !f.gone && Math.abs(f.lake.x0 + f.lake.w / 2 - session.bird.x) < 700);
      if (nearbyLake) {
        session.state.storm.next = Math.min(session.state.storm.next, 0);
        sky.earlyStorm = false;
      }
    }
    if (!sky.fishnadoSeen && session.state.storm.k > 0.5) {
      const fish = session.state.fish.find(f => !f.gone && Math.abs(f.lake.x0 + f.lake.w / 2 - session.bird.x) < 700);
      if (fish) spawnFishnado(fish.lake);
    }
    sky.pirateT -= dt;
    if (sky.piratesEligible && !sky.piratesSeen && sky.pirateT <= 0 && session.bird.alt > 350 && session.MAX_ALT >= 650) {
      spawnPirates(session.bird.x + (Math.sign(session.bird.vx) || 1) * 300);
    }
    updateFishnado(dt);
    if (session.state.over) return;
    updatePirates(dt);
    if (!session.bird.carrying && !session.bird.inWater && systems.input.talonsOut()) {
      for (const [x, alt, radius, hit] of targets()) {
        if (systems.prey.sweptDist(x, alt, dt) > radius + 1) continue;
        if (hit.part.hurtT > 0) continue;
        hitPart(hit.part, 'talons', 1);
        session.bird.angle = Math.atan2(session.bird.alt - alt, session.bird.x - x);
        session.bird.speed = 8;
        break;
      }
    }
  }
  return { balloonPosition, charge, discharge, ground, hitPart, impact, lift, newState, retireAll, shellHit, spawnFishnado, spawnPirates, targets, throwTargets, update };
}
