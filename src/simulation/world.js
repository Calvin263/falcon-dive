import { hash } from '../core/math.js';
import { createCache } from '../core/cache.js';
import { DUST_DEVILS_ENABLED, THERMAL_SPACING, DAY_LENGTH, RIDGE_SPACING, LAKE_SPACING, CLOUD_BASE } from '../config.js';
import { randDir } from '../core/math.js';

export function createWorld({ session, viewport, systems }) {
  const terrainCache = createCache({ maxEntries: 512 });
  let cachedSeed = session.worldSeed;
  function terrain(kind, index, create) {
    if (cachedSeed !== session.worldSeed) {
      terrainCache.clear();
      cachedSeed = session.worldSeed;
    }
    return terrainCache.getOrCreate(`${kind}:${index}`, create);
  }
  // ---------- Wind & thermals ----------
  // Horizontal wind (m/s, + = rightward). Low and high layers change independently (wind shear),
  // blended between 100 m and 350 m; gusts on top; weaker near the ground
  function windX(alt) {
    const t = session.state.time, w = session.state.wind;
    const gust = Math.sin(t * 0.7) * 1.5 + Math.sin(t * 1.9 + 1) * 0.8;
    const k = Math.min(1, Math.max(0, (alt - 100) / 250));
    const layer = w.x + (w.hx - w.x) * k * k * (3 - 2 * k);
    const storm = session.state.storm.dir * 16 * session.state.storm.k * (1 + 0.3 * Math.sin(t * 3));
    return (layer + gust + storm) * (0.3 + 0.7 * Math.min(1, Math.max(0, alt) / 200));
  }

  function updateWind(dt) {
    const w = session.state.wind;
    w.changeT -= dt;
    if (w.changeT <= 0) { w.target = (Math.random() * 2 - 1) * 10; w.changeT = 20 + Math.random() * 20; }
    w.hchangeT -= dt;
    if (w.hchangeT <= 0) { w.htarget = (Math.random() * 2 - 1) * 14; w.hchangeT = 25 + Math.random() * 25; }
    w.x += (w.target - w.x) * Math.min(1, dt * 0.1);
    w.hx += (w.htarget - w.hx) * Math.min(1, dt * 0.08);
    session.state.cloudOff += windX(CLOUD_BASE) * dt;
    session.state.cirrusOff += windX(480) * dt;
  }
  function thermalCol(i) {
    return terrain('thermal', i, () => ({ x: i * THERMAL_SPACING + wh(i * 3.1) * 400, on: wh(i * 7.7) < 0.6,
             s: 12 + wh(i * 5.3) * 12, w: 30 + wh(i * 2.9) * 20 }));
  }

  // Broad sinking air, roughly between thermals
  function sinkCol(i) {
    return terrain('sink', i, () => ({ x: (i + 0.5) * THERMAL_SPACING + wh(i * 4.1) * 200 - 100, on: wh(i * 6.6) < 0.5,
             s: 2 + wh(i * 8.2) * 3, w: 50 + wh(i * 9.4) * 40 }));
  }

  // Vertical air movement (m/s): thermal lift minus sink, fading in near the ground and out at the ceiling
  function updraft(x, alt) {
    if (alt > session.MAX_ALT) return 0;
    const i0 = Math.floor(x / THERMAL_SPACING);
    let u = 0;
    for (let i = i0 - 1; i <= i0 + 1; i++) {
      const th = thermalCol(i);
      if (th.on) {
        const d = (x - th.x) / th.w;
        if (Math.abs(d) < 3) u += th.s * Math.exp(-d * d);
      }
      const sk = sinkCol(i);
      if (sk.on) {
        const d = (x - sk.x) / sk.w;
        if (Math.abs(d) < 3) u -= sk.s * Math.exp(-d * d);
      }
    }
    u += ridgeLift(x, alt);
    if (DUST_DEVILS_ENABLED) {
      for (const dv of session.state.devils) {
        if (alt > dv.top) continue;
        const d = (x - dv.x) / dv.w;
        if (Math.abs(d) < 3) u += dv.s * Math.exp(-d * d) * devilFade(dv) * (1 - alt / dv.top);
      }
    }
    return u * Math.min(1, Math.max(0, alt) / 15) * Math.min(1, (session.MAX_ALT - alt) / 50);
  }
  const sunPhase = () => ((session.state.tod - 0.15) / 0.7) * Math.PI; // 0 at sunrise (east/left), PI at sunset
  const daylight = () => Math.max(0, Math.min(1, Math.sin(sunPhase()) * 3 + 0.3));
  const twilight = () => Math.max(0, 1 - Math.abs(Math.sin(sunPhase())) * 4); // peaks at sunrise/sunset
  const clockText = () => {
    const h = (session.state.tod * 24 + 1.2) % 24;
    return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
  };
  // Horizontal offset of a shadow cast from this altitude, away from the sun
  function shadowOffset(alt) {
    const ph = sunPhase();
    return (alt * Math.cos(ph)) / Math.max(0.25, Math.sin(ph));
  }

  // ---------- Weather ----------
  function updateWeather(dt) {
    if (!DUST_DEVILS_ENABLED) {
      session.state.devils = [];
      session.state.devilT = Infinity;
      session.state.tod = (session.state.tod + dt / DAY_LENGTH) % 1;
      const s = session.state.storm;
      s.next -= dt;
      if (s.t <= 0 && s.next <= 0) {
        s.t = s.dur = 20 + Math.random() * 15; s.dir = randDir(); s.next = 120 + Math.random() * 120;
        session.state.msg = 'A storm front is rolling in!'; session.state.msgT = 2;
      }
      if (s.t > 0) s.t -= dt;
      s.k = s.t > 0 ? Math.sin(Math.PI * (1 - s.t / s.dur)) : 0;
      s.flash = Math.max(0, s.flash - dt);
      if (s.k > 0.6 && Math.random() < dt * 0.15) s.flash = 0.15;
      return;
    }
    session.state.tod = (session.state.tod + dt / DAY_LENGTH) % 1;
    const s = session.state.storm;
    s.next -= dt;
    if (s.t <= 0 && s.next <= 0) {
      s.t = s.dur = 20 + Math.random() * 15; s.dir = randDir(); s.next = 120 + Math.random() * 120;
      session.state.msg = 'A storm front is rolling in!'; session.state.msgT = 2;
    }
    if (s.t > 0) s.t -= dt;
    s.k = s.t > 0 ? Math.sin(Math.PI * (1 - s.t / s.dur)) : 0;
    s.flash = Math.max(0, s.flash - dt);
    if (s.k > 0.6 && Math.random() < dt * 0.15) s.flash = 0.15;

    // Dust devils: short-lived spinning columns that wander over open ground ahead of you
    session.state.devilT -= dt;
    if (session.state.devilT <= 0) {
      session.state.devilT = 15 + Math.random() * 20;
      const x = session.bird.x + Math.sign(session.bird.vx || 1) * (250 + Math.random() * 350);
      if (!lakeAtX(x)) session.state.devils.push({ x, vx: randDir() * (1 + Math.random() * 2), t: 0,
        life: 12 + Math.random() * 10, s: 20 + Math.random() * 8, w: 6 + Math.random() * 3, top: 100 + Math.random() * 60 });
    }
    for (const dv of session.state.devils) { dv.t += dt; dv.x += (dv.vx + windX(5)) * dt; }
    session.state.devils = session.state.devils.filter(dv => dv.t < dv.life);
  }
  const devilFade = dv => Math.min(1, dv.t / 2, (dv.life - dv.t) / 2);
  function ridgeAt(i) {
    return terrain('ridge', i, () => ({ x: i * RIDGE_SPACING + 600 + wh(i * 1.7 + 3) * 600, on: wh(i * 2.3 + 1) < 0.55,
             h: 60 + wh(i * 3.9 + 2) * 80, w: 220 + wh(i * 5.1 + 4) * 160 }));
  }
  // Wind striking a ridge rises on the windward slope and tumbles into turbulence on the lee side
  function ridgeLift(x, alt) {
    const i0 = Math.floor(x / RIDGE_SPACING);
    let u = 0;
    for (let i = i0 - 1; i <= i0 + 1; i++) {
      const r = ridgeAt(i);
      if (!r.on || alt > r.h * 2.5) continue;
      const dx = x - r.x, reach = r.w * 0.9;
      if (Math.abs(dx) > reach) continue;
      const w = windX(r.h);
      const hFade = 1 - alt / (r.h * 2.5), xFade = 1 - Math.abs(dx) / reach;
      if (Math.sign(dx) === -Math.sign(w)) u += Math.abs(w) * 1.5 * hFade * xFade;
      else u -= Math.abs(w) * 0.5 * hFade * xFade * (0.5 + 0.5 * Math.sin(session.state.time * 5 + x * 0.3));
    }
    return u;
  }
  function lakeAt(i) {
    return terrain('lake', i, () => ({ x0: i * LAKE_SPACING + 400 + wh(i * 6.1 + 5) * 700, w: 150 + wh(i * 7.3 + 6) * 300, on: wh(i * 8.9 + 7) < 0.75,
             depth: 10 + wh(i * 4.3 + 8) * 8, grotto: wh(i * 3.7 + 9) < 0.6 }));
  }
  function lakeAtX(x) {
    const i = Math.floor((x - 400) / LAKE_SPACING);
    for (let index = i; index >= i - 1; index--) {
      const lake = lakeAt(index);
      if (lake.on && x >= lake.x0 && x <= lake.x0 + lake.w) return lake;
    }
    return null;
  }
  function landStep(from, to) {
    const lo = Math.min(from, to), hi = Math.max(from, to);
    let stop = to;
    for (let i = Math.floor((lo - 400) / LAKE_SPACING) - 1; i <= Math.floor((hi - 400) / LAKE_SPACING); i++) {
      const l = lakeAt(i);
      if (!l.on || hi < l.x0 || lo > l.x0 + l.w) continue;
      stop = to > from ? Math.min(stop, l.x0 - 0.1) : Math.max(stop, l.x0 + l.w + 0.1);
    }
    return stop;
  }

  function makeCumulus(x, seed, size = 1) {
    return { x, seed, base: CLOUD_BASE + (systems.world.wh(seed) - 0.5) * 40,
             w: (80 + systems.world.wh(seed + 1) * 90) * size, h: (35 + systems.world.wh(seed + 2) * 45) * size };
  }

  // Cumulus capping each active thermal, plus smaller drifting fair-weather clouds
  function cumulusIn(x0, x1) {
    const out = [];
    for (let i = Math.floor(x0 / THERMAL_SPACING) - 1; i <= Math.ceil(x1 / THERMAL_SPACING) + 1; i++) {
      const th = thermalCol(i);
      if (th.on) out.push(makeCumulus(th.x, i * 1.37));
    }
    const S = 520, off = session.state.cloudOff;
    for (let j = Math.floor((x0 - off) / S) - 1; j <= Math.ceil((x1 - off) / S) + 1; j++) {
      if (systems.world.wh(j * 2.71 + 9) < 0.45) out.push(makeCumulus(j * S + off + systems.world.wh(j * 1.9) * 200, j * 3.3 + 50, 0.6));
    }
    return out;
  }

  function insideCloud(x, alt) {
    return cumulusIn(x - 200, x + 200).some(c =>
      Math.abs(x - c.x) < c.w * 0.4 && alt > c.base && alt < c.base + c.h * 1.2);
  }
  const wh = n => hash(n + session.worldSeed);

  return { wh, clockText, cumulusIn, daylight, devilFade, insideCloud, lakeAt, lakeAtX, landStep, ridgeAt, shadowOffset, sinkCol, sunPhase, thermalCol, twilight, updateWeather, updateWind, updraft, windX, getCacheStats: terrainCache.getStats };
}
