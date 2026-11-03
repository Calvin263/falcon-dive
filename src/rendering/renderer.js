import { DIVE_SPEED, CRASH_REVEAL_DELAY, THROW_LOCK_AIR, SHADOW_VISIBLE_ALT, HILL_SCROLL, LENS_R, DUST_DEVILS_ENABLED, HAZARD_BOUNTY, HAZARD_NAME, CATSENSE, SPIN_R, MOONSHOT_T, SPECIES, FALCON_SCALE, THERMAL_SPACING, RIDGE_SPACING, LAKE_SPACING, ROCKET_BLAST, CAT_REACH, CAT_ALT, HUNTER_AIM_T, HUNTER_RANGE, GROTTO_L, GROTTO_H, GROTTO_VENTS, VENT_R, OCTO_HP, OCTO_REACH, OCTO_HEAD_R, OUTLINE, SIGHT_COLOR, HEARING_COLOR, NO_SENSE_RANGE, IGNORE_DETECTION, GUN_MUZZLE, GRASS_COLORS, EYAS_S, HAZARD_SCALE } from '../config.js';
import { clamp, wrapAngle, mixRGB, rgb, hash } from '../core/math.js';

export function createRenderer({ session, viewport, systems }) {
  const textCalls = [];
  let textCallCount = 0;
  const textStyles = ['font', 'textAlign', 'textBaseline', 'direction', 'fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin', 'miterLimit', 'globalAlpha', 'shadowColor', 'shadowBlur', 'shadowOffsetX', 'shadowOffsetY', 'filter'];

  function recordText(ctx, method, args) {
    let call = textCalls[textCallCount];
    if (!call) call = textCalls[textCallCount] = { args: [], transform: {}, styles: {} };
    textCallCount++;
    call.method = method;
    call.args.length = args.length;
    for (let i = 0; i < args.length; i++) call.args[i] = args[i];
    Object.assign(call.transform, ctx.getTransform());
    for (const style of textStyles) call.styles[style] = ctx[style];
  }

  function drawTextOverlay() {
    const { overlayCtx, canvas, W, H } = viewport;
    overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
    overlayCtx.globalAlpha = 1;
    overlayCtx.globalCompositeOperation = 'source-over';
    overlayCtx.filter = 'none';
    overlayCtx.clearRect(0, 0, W, H);
    const scaleX = canvas.width / W, scaleY = canvas.height / H;
    for (let i = 0; i < textCallCount; i++) {
      const call = textCalls[i], matrix = call.transform;
      overlayCtx.save();
      overlayCtx.setTransform(matrix.a / scaleX, matrix.b / scaleX, matrix.c / scaleY,
        matrix.d / scaleY, matrix.e / scaleX, matrix.f / scaleY);
      for (const style of textStyles) overlayCtx[style] = call.styles[style];
      overlayCtx[call.method](...call.args);
      overlayCtx.restore();
    }
  }

  function roundedRectPath(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    viewport.ctx.beginPath();
    viewport.ctx.moveTo(x + rr, y);
    viewport.ctx.lineTo(x + w - rr, y);
    viewport.ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    viewport.ctx.lineTo(x + w, y + h - rr);
    viewport.ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    viewport.ctx.lineTo(x + rr, y + h);
    viewport.ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    viewport.ctx.lineTo(x, y + rr);
    viewport.ctx.quadraticCurveTo(x, y, x + rr, y);
    viewport.ctx.closePath();
  }

  function drawSenseCone(p, angle, half, range, fill, stroke) {
    const sx = systems.flight.toScreenX(p.x);
    const sy = systems.flight.toScreenY(systems.prey.eyeAlt(p));
    const radius = Math.max(2, Math.abs(systems.flight.toScreenX(p.x + range) - sx));
    const fullCircle = half >= Math.PI;

    if (fullCircle) {
      const radiusY = Math.max(2, Math.abs(systems.flight.toScreenY(systems.prey.eyeAlt(p) + range) - sy));
      viewport.ctx.beginPath();
      viewport.ctx.ellipse(sx, sy, radius, radiusY, 0, 0, Math.PI * 2);
      viewport.ctx.closePath();
      viewport.ctx.fillStyle = fill; viewport.ctx.fill();
      return;
    }

    const points = [{ x: sx, y: sy }];
    for (let i = 0; i <= 20; i++) {
      const a = angle - half + ((2 * half * i) / 20);
      const wx = p.x + Math.cos(a) * range;
      const wy = systems.prey.eyeAlt(p) + Math.sin(a) * range;
      points.push({ x: systems.flight.toScreenX(wx), y: systems.flight.toScreenY(wy) });
    }
    viewport.ctx.beginPath();
    viewport.ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) viewport.ctx.lineTo(points[i].x, points[i].y);
    viewport.ctx.closePath();
    viewport.ctx.fillStyle = fill; viewport.ctx.fill();
    viewport.ctx.strokeStyle = stroke; viewport.ctx.lineWidth = 1.2; viewport.ctx.stroke();
  }

  function drawShadowGroundWarning(p) {
    // Shadow warnings are no longer rendered as a black line; the alert itself will stay red/yellow only.
    return;
  }

  function drawPreySenseIndicators(p) {
    if (p.hidden || p.gone || p.alertT > 0 || p.fleeing || p.spent) return;
    if (NO_SENSE_RANGE.has(p.kind) || IGNORE_DETECTION.has(p.kind)) return;
    const sn = systems.prey.SENSES[p.kind];
    if (!sn) return;
    const d = Math.hypot(session.bird.x - p.x, session.bird.alt - systems.prey.eyeAlt(p));
    const look = systems.prey.lookAngle(p);
    const visionRangePx = Math.min(200, systems.prey.visionRange(sn));
    if (d < visionRangePx + 20) {
      const t = clamp(1 - d / visionRangePx, 0, 1);
      const fill = `${SIGHT_COLOR}${Math.round(20 + t * 55).toString(16).padStart(2, '0')}`;
      const stroke = `${SIGHT_COLOR}${Math.round(50 + t * 65).toString(16).padStart(2, '0')}`;
      drawSenseCone(p, look, sn.half, Math.min(visionRangePx, systems.prey.visionRange(sn)), fill, stroke);
    }
    const hearDir = systems.prey.hearingAngle(p);
    if (d < systems.prey.hearingRange() + 30) {
      const hr = Math.min(systems.prey.hearingRange(), 120);
      const t = clamp(1 - d / hr, 0, 1);
      const fill = `${HEARING_COLOR}${Math.round(18 + t * 68).toString(16).padStart(2, '0')}`;
      const stroke = `${HEARING_COLOR}${Math.round(52 + t * 60).toString(16).padStart(2, '0')}`;
      drawSenseCone(p, hearDir, systems.prey.hearingHalf(p), hr, fill, stroke);
    }
  }

  function drawBackground() {
    const groundY = systems.flight.toScreenY(0);
    const t = Math.min(1, Math.max(0, session.bird.alt) / session.MAX_ALT);
    const d = systems.world.daylight(), tw = systems.world.twilight();
    let top = mixRGB([8, 12, 30], [40 - t * 32, 100 - t * 80, 180 - t * 115], d);
    let bottom = mixRGB([25, 35, 65], [191 - t * 70, 227 - t * 55, 255 - t * 25], d);
    bottom = mixRGB(bottom, [250, 150, 90], tw * 0.6);
    top = mixRGB(top, [90, 70, 110], tw * 0.3);
    // Far above the ceiling (big bounces) the sky drains toward space
    const space = clamp((session.cam.alt - session.MAX_ALT) / 1500, 0, 1);
    top = mixRGB(top, [2, 3, 10], space); bottom = mixRGB(bottom, [10, 14, 34], space * 0.8);
    const sky = viewport.ctx.createLinearGradient(0, 0, 0, Math.max(groundY, 1));
    sky.addColorStop(0, rgb(top));
    sky.addColorStop(1, rgb(bottom));
    viewport.ctx.fillStyle = sky;
    viewport.ctx.fillRect(0, 0, viewport.W, viewport.H);

    // Stars fade in at night
    if (d < 0.7 || space > 0) {
      viewport.ctx.fillStyle = `rgba(255,255,255,${Math.max((0.7 - d) / 0.7, space) * 0.8})`;
      for (let i = 0; i < 140; i++) {
        const sx = hash(i * 1.1) * viewport.W, sy = hash(i * 2.3) * (groundY - 120);
        viewport.ctx.fillRect(sx, sy, hash(i * 3.7) < 0.15 ? 2 : 1, 1);
      }
    }

    // Moon arcs across the far sky at night (screen space, rising on the left); the sun is off-screen
    const horizon = groundY - 60, arcH = Math.max(100, horizon - 70);
    const ph = systems.world.sunPhase();
    const sunPos = a => [viewport.W * (0.05 + 0.9 * (1 - Math.cos(a)) / 2), horizon - Math.sin(a) * arcH];
    const mp = ph - Math.PI;
    if (Math.sin(mp) > -0.15) {
      const [mx, my] = sunPos(mp);
      viewport.ctx.fillStyle = '#e8ecf5';
      viewport.ctx.beginPath(); viewport.ctx.arc(mx, my, 16, 0, Math.PI * 2); viewport.ctx.fill();
      viewport.ctx.fillStyle = rgb(top);
      viewport.ctx.beginPath(); viewport.ctx.arc(mx + 6, my - 3, 14, 0, Math.PI * 2); viewport.ctx.fill();
    }

    // Sky grid: spacing adapts to zoom like the grass ruler
    const gx = niceStep(160 / session.cam.zoom), gy = niceStep(120 / session.cam.zoomY);
    const skyBottom = systems.flight.toScreenY(0);
    viewport.ctx.lineWidth = 1;
    viewport.ctx.strokeStyle = 'rgba(210,235,255,0.18)';
    viewport.ctx.beginPath();
    for (let m = Math.floor((session.cam.x - viewport.W / 2 / session.cam.zoom) / gx) * gx; m <= session.cam.x + viewport.W / 2 / session.cam.zoom; m += gx) {
      const x = Math.round(systems.flight.toScreenX(m)) + 0.5;
      viewport.ctx.moveTo(x, 0); viewport.ctx.lineTo(x, skyBottom);
    }
    const topAlt = session.cam.alt + viewport.H / 2 / session.cam.zoomY;
    for (let a = gy; a <= topAlt; a += gy) {
      const y = Math.round(systems.flight.toScreenY(a)) + 0.5;
      viewport.ctx.moveTo(0, y); viewport.ctx.lineTo(viewport.W, y);
    }
    viewport.ctx.stroke();

    // Cirrus: thin high streaks near and above the ceiling
    {
      const S = 380, off = session.state.cirrusOff, half = viewport.W / 2 / session.cam.zoom + 300;
      for (let j = Math.floor((session.cam.x - half - off) / S); j <= Math.ceil((session.cam.x + half - off) / S); j++) {
        if (systems.world.wh(j * 5.5) > 0.6) continue;
        const x = j * S + off + systems.world.wh(j * 1.3) * 150, alt = 470 + systems.world.wh(j * 2.2) * 60;
        const len = 150 + systems.world.wh(j * 3.7) * 200, thick = 3 + systems.world.wh(j * 4.9) * 4;
        const sx = systems.flight.toScreenX(x), sy = systems.flight.toScreenY(alt);
        if (sy < -40 || sy > viewport.H) continue;
        viewport.ctx.fillStyle = 'rgba(255,255,255,0.22)';
        viewport.ctx.beginPath(); viewport.ctx.ellipse(sx, sy, len / 2 * session.cam.zoom, thick * session.cam.zoomY + 1, -0.04, 0, Math.PI * 2); viewport.ctx.fill();
        viewport.ctx.fillStyle = 'rgba(255,255,255,0.14)';
        viewport.ctx.beginPath(); viewport.ctx.ellipse(sx + len * 0.2 * session.cam.zoom, sy - thick * 2 * session.cam.zoomY, len * 0.3 * session.cam.zoom, thick * 0.6 * session.cam.zoomY + 1, -0.04, 0, Math.PI * 2); viewport.ctx.fill();
      }
    }

    // Parallax hills: a distant layer scrolling at a fixed screen rate, so zooming doesn't slide them
    viewport.ctx.fillStyle = rgb(mixRGB([40, 50, 70], [143, 169, 184], d));
    viewport.ctx.beginPath(); viewport.ctx.moveTo(0, viewport.H);
    for (let sx = 0; sx <= viewport.W; sx += 20) {
      const wx = (sx - viewport.W / 2 + session.cam.x * HILL_SCROLL) / 200;
      viewport.ctx.lineTo(sx, groundY - 80 - Math.sin(wx) * 40 - Math.sin(wx * 2.3) * 20);
    }
    viewport.ctx.lineTo(viewport.W, viewport.H); viewport.ctx.fill();

    // Low haze over the horizon
    const haze = viewport.ctx.createLinearGradient(0, groundY - 140, 0, groundY);
    haze.addColorStop(0, 'rgba(225,238,248,0)');
    haze.addColorStop(1, 'rgba(225,238,248,0.45)');
    viewport.ctx.fillStyle = haze;
    viewport.ctx.fillRect(0, groundY - 140, viewport.W, 140);

    // Ridges just behind the play plane (wind rising over them gives lift on the windward side)
    const half = viewport.W / 2 / session.cam.zoom;
    for (let i = Math.floor((session.cam.x - half - 400) / RIDGE_SPACING) - 1; i <= Math.ceil((session.cam.x + half + 400) / RIDGE_SPACING) + 1; i++) {
      const r = systems.world.ridgeAt(i);
      if (!r.on) continue;
      const g = viewport.ctx.createLinearGradient(0, systems.flight.toScreenY(r.h), 0, groundY);
      g.addColorStop(0, rgb(mixRGB([35, 45, 40], [120, 140, 105], d)));
      g.addColorStop(1, rgb(mixRGB([25, 35, 30], [80, 105, 70], d)));
      viewport.ctx.fillStyle = g;
      viewport.ctx.beginPath();
      viewport.ctx.moveTo(systems.flight.toScreenX(r.x - r.w), groundY + 1);
      for (let k = 0; k <= 40; k++) {
        const f = k / 40 * 2 - 1;
        const hgt = r.h * Math.pow((1 + Math.cos(Math.PI * f)) / 2, 1.3) * (0.92 + 0.08 * hash(i * 13 + k));
        viewport.ctx.lineTo(systems.flight.toScreenX(r.x + f * r.w), systems.flight.toScreenY(hgt));
      }
      viewport.ctx.lineTo(systems.flight.toScreenX(r.x + r.w), groundY + 1);
      viewport.ctx.fill();
    }

    // Cumulus: flat grey bases, bright puffy tops
    for (const c of systems.world.cumulusIn(session.cam.x - half - 200, session.cam.x + half + 200)) drawCumulus(c);

    // Ceiling
    const ceilY = systems.flight.toScreenY(session.MAX_ALT);
    if (ceilY > -5) {
      viewport.ctx.strokeStyle = 'rgba(255,255,255,0.5)'; viewport.ctx.lineWidth = 1;
      viewport.ctx.setLineDash([8, 8]);
      viewport.ctx.beginPath(); viewport.ctx.moveTo(0, ceilY); viewport.ctx.lineTo(viewport.W, ceilY); viewport.ctx.stroke();
      viewport.ctx.setLineDash([]);
      viewport.ctx.fillStyle = 'rgba(255,255,255,0.7)'; viewport.ctx.font = '11px monospace'; viewport.ctx.textAlign = 'center';
      viewport.ctx.fillText(`ceiling ${session.MAX_ALT} m`, viewport.W / 2, ceilY - 4);
    }

    // Ground
    const groundGradient = viewport.ctx.createLinearGradient(0, groundY, 0, viewport.H);
    groundGradient.addColorStop(0, '#5f8d32');
    groundGradient.addColorStop(1, '#395c26');
    viewport.ctx.fillStyle = groundGradient;
    viewport.ctx.fillRect(0, groundY, viewport.W, viewport.H - groundY);
    viewport.ctx.fillStyle = 'rgba(255,255,255,0.06)';
    const step = niceStep(30 / session.cam.zoom);
    for (let m = Math.floor((session.cam.x - viewport.W / session.cam.zoom) / step) * step; m < session.cam.x + viewport.W / session.cam.zoom; m += step) {
      const x = systems.flight.toScreenX(m);
      const p = (Math.sin(m * 0.27 + session.state.time * 0.4) + 1) * 0.5;
      viewport.ctx.fillStyle = `rgba(255,255,255,${0.02 + p * 0.06})`;
      viewport.ctx.fillRect(x, groundY, 2, 6);
    }
    viewport.ctx.fillStyle = '#4a7230';
    drawDustDevils();

    // Lakes
    for (let i = Math.floor((session.cam.x - half - 400) / LAKE_SPACING) - 1; i <= Math.ceil((session.cam.x + half) / LAKE_SPACING) + 1; i++) {
      const l = systems.world.lakeAt(i);
      if (!l.on) continue;
      const x0 = systems.flight.toScreenX(l.x0), x1 = systems.flight.toScreenX(l.x0 + l.w);
      if (x1 < 0 || x0 > viewport.W) continue;
      const wg = viewport.ctx.createLinearGradient(0, groundY, 0, viewport.H);
      wg.addColorStop(0, rgb(mixRGB([30, 50, 80], [90, 150, 200], d)));
      wg.addColorStop(1, rgb(mixRGB([15, 25, 45], [40, 90, 140], d)));
      viewport.ctx.fillStyle = wg;
      viewport.ctx.fillRect(x0, groundY - 1, x1 - x0, viewport.H - groundY + 1);
      // Lake bed
      const bedY = systems.flight.toScreenY(-l.depth);
      if (bedY < viewport.H) { viewport.ctx.fillStyle = rgb(mixRGB([40, 34, 22], [104, 88, 58], d)); viewport.ctx.fillRect(x0, bedY, x1 - x0, viewport.H - bedY); }
      // Octopus Grotto: a dark cave mouth at the bottom of the far end, with a pair of eyes in the gloom
      if (systems.water.grottoOpen(l)) {
        const cx = systems.flight.toScreenX(l.x0 + l.w), cy = bedY, rw = 7 * session.cam.zoom, rh = 5 * session.cam.zoomY;
        viewport.ctx.fillStyle = '#05080c';
        viewport.ctx.beginPath(); viewport.ctx.ellipse(cx, cy, rw, rh, 0, Math.PI, Math.PI * 1.5); viewport.ctx.lineTo(cx, cy); viewport.ctx.closePath(); viewport.ctx.fill();
        viewport.ctx.strokeStyle = rgb(mixRGB([30, 26, 18], [80, 66, 44], d)); viewport.ctx.lineWidth = Math.max(2, 0.6 * session.cam.zoom);
        viewport.ctx.beginPath(); viewport.ctx.ellipse(cx, cy, rw, rh, 0, Math.PI, Math.PI * 1.5); viewport.ctx.stroke();
        if (Math.sin(session.state.time * 0.9 + i) > -0.6) {
          viewport.ctx.fillStyle = '#ffe14d';
          for (const ox of [-0.38, -0.22]) { viewport.ctx.beginPath(); viewport.ctx.arc(cx + ox * rw, cy - rh * 0.42, Math.max(1.2, 0.25 * session.cam.zoom), 0, Math.PI * 2); viewport.ctx.fill(); }
        }
      }
      // Fish: the deeper, the fainter; feeding trout dimple the surface
      for (const f of session.state.fish) {
        if (f.lake.x0 !== l.x0) continue;
        const fx = systems.flight.toScreenX(f.x);
        if (fx < -30 || fx > viewport.W + 30) continue;
        viewport.ctx.globalAlpha = clamp(1 - (-f.alt) / (l.depth + 1), 0.12, 0.9) * (0.4 + 0.6 * d);
        systems.sprites.drawFish(fx, systems.flight.toScreenY(f.alt), f, systems.settings.animalScaleFor(f.kind) * Math.max(0.6, Math.min(1.6, session.cam.zoom / 8)));
        viewport.ctx.globalAlpha = 1;
        if (f.alt > -0.8 && Math.sin(f.ph * 2.5) > 0.6) {
          viewport.ctx.strokeStyle = 'rgba(255,255,255,0.6)'; viewport.ctx.lineWidth = 1;
          const r = 4 + (Math.sin(f.ph * 2.5) - 0.6) * 20;
          viewport.ctx.beginPath(); viewport.ctx.ellipse(fx, groundY + 1, r, r * 0.25, 0, 0, Math.PI * 2); viewport.ctx.stroke();
        }
      }
      viewport.ctx.fillStyle = '#7a6a4a';
      viewport.ctx.fillRect(x0 - 3, groundY - 1, 3, 6); viewport.ctx.fillRect(x1, groundY - 1, 3, 6);
      viewport.ctx.strokeStyle = 'rgba(255,255,255,0.35)'; viewport.ctx.lineWidth = 1;
      for (let k = 0; k < 12; k++) {
        const sx = x0 + ((hash(i * 9 + k) * (x1 - x0) + session.state.time * 8 * (k % 2 ? 1 : -1)) % (x1 - x0) + (x1 - x0)) % (x1 - x0);
        const sy = groundY + 4 + hash(i * 7 + k) * Math.min(40, viewport.H - groundY - 8);
        viewport.ctx.beginPath(); viewport.ctx.moveTo(sx, sy); viewport.ctx.lineTo(sx + 10, sy); viewport.ctx.stroke();
      }
    }

    // Bird's shadow, cast away from the sun; spreads and fades with height
    if (!session.state.over && d > 0.15 && session.bird.alt >= 0 && session.bird.alt < SHADOW_VISIBLE_ALT) {
      const fade = (1 - session.bird.alt / SHADOW_VISIBLE_ALT) * Math.min(1, d * 1.5);
      const sx = systems.flight.toScreenX(session.bird.x + systems.world.shadowOffset(session.bird.alt));
      const w = 16 * (1 + session.bird.alt / 40), h = 4 + session.bird.alt / 20;
      viewport.ctx.fillStyle = `rgba(0,0,0,${0.3 * fade})`;
      viewport.ctx.beginPath(); viewport.ctx.ellipse(sx, groundY + 1, w * 1.4, h * 1.4, 0, 0, Math.PI * 2); viewport.ctx.fill();
      viewport.ctx.fillStyle = `rgba(0,0,0,${0.55 * fade})`;
      viewport.ctx.beginPath(); viewport.ctx.ellipse(sx, groundY + 1, w, h, 0, 0, Math.PI * 2); viewport.ctx.fill();
    }
  }

  // Sun direction marker on the screen edge, along the line from the bird toward the sun
  function drawSunIndicator() {
    const ph = systems.world.sunPhase();
    if (Math.sin(ph) <= 0) return;
    const { x: bx, y: by } = systems.flight.birdAnchor();
    const ux = -Math.cos(ph), uy = -Math.sin(ph), inset = 26;
    let t = Infinity;
    if (ux > 0) t = Math.min(t, (viewport.W - inset - bx) / ux);
    if (ux < 0) t = Math.min(t, (inset - bx) / ux);
    if (uy < 0) t = Math.min(t, (inset - by) / uy);
    if (uy > 0) t = Math.min(t, (viewport.H - inset - by) / uy);
    const x = bx + ux * t, y = by + uy * t;
    viewport.ctx.strokeStyle = '#ffd34d'; viewport.ctx.fillStyle = '#ffd34d'; viewport.ctx.lineWidth = 2;
    viewport.ctx.globalAlpha = 0.85;
    viewport.ctx.beginPath(); viewport.ctx.arc(x, y, 8, 0, Math.PI * 2); viewport.ctx.fill();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      viewport.ctx.beginPath(); viewport.ctx.moveTo(x + Math.cos(a) * 11, y + Math.sin(a) * 11); viewport.ctx.lineTo(x + Math.cos(a) * 16, y + Math.sin(a) * 16); viewport.ctx.stroke();
    }
    viewport.ctx.globalAlpha = 1;
  }

  function drawCumulus(c) {
    const left = systems.flight.toScreenX(c.x - c.w * 0.7), right = systems.flight.toScreenX(c.x + c.w * 0.7);
    if (right < 0 || left > viewport.W) return;
    const path = new Path2D();
    const n = 7;
    for (let j = 0; j < n; j++) {
      const f = j / (n - 1) - 0.5;
      const pr = c.h * (0.45 + hash(c.seed + j * 0.37) * 0.4) * (1 - Math.abs(f) * 0.8);
      const sx = systems.flight.toScreenX(c.x + f * c.w * 0.85), sy = systems.flight.toScreenY(c.base + pr * 0.85);
      const rx = pr * 1.3 * session.cam.zoom, ry = pr * session.cam.zoomY;
      path.moveTo(sx + rx, sy);
      path.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2);
    }
    const top = systems.flight.toScreenY(c.base + c.h * 1.6), baseY = systems.flight.toScreenY(c.base);
    viewport.ctx.save();
    viewport.ctx.clip(path);
    const g = viewport.ctx.createLinearGradient(0, top, 0, baseY);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.65, 'rgba(242,246,251,0.93)');
    g.addColorStop(1, 'rgba(185,197,214,0.93)');
    viewport.ctx.fillStyle = g;
    // Only fill above the base, which gives the flat cumulus underside
    viewport.ctx.fillRect(left, top, right - left, baseY - top);
    viewport.ctx.restore();
  }

  function niceStep(minMetres) {
    for (const s of [0.5, 1, 2, 5, 10, 25, 50, 100, 250]) if (s >= minMetres) return s;
    return 500;
  }

  

  // Gun sprite pointing along +x: 0 = hunter's rifle, 1 = auto-fire (drum mag), 2 = bazooka. flash draws the muzzle blast
  const gunStyle = () => systems.combat.gunBazooka() ? 2 : systems.combat.gunAuto() ? 1 : 0;
  function drawRifle(x, y, ang, s, style = 0, flash = 0) {
    viewport.ctx.save();
    viewport.ctx.translate(x, y);
    viewport.ctx.rotate(ang);
    if (Math.abs(wrapAngle(ang)) > Math.PI / 2) viewport.ctx.scale(1, -1);
    viewport.ctx.scale(s, s);
    if (style === 2) {
      viewport.ctx.fillStyle = '#4d5a32';
      viewport.ctx.fillRect(-14, -3, 30, 6);
      viewport.ctx.fillStyle = '#39432a';
      viewport.ctx.fillRect(-16, -3.6, 3, 7.2); viewport.ctx.fillRect(13, -3.6, 3, 7.2);
      viewport.ctx.fillStyle = '#2a2a2e';
      viewport.ctx.fillRect(-3, 3, 2.5, 4); viewport.ctx.fillRect(4, 3, 2.5, 3);
      viewport.ctx.fillStyle = '#c9b458';
      viewport.ctx.fillRect(-1, -5, 5, 2);
    } else {
      // Wooden stock and fore-end, steel receiver and barrel
      viewport.ctx.fillStyle = '#7a4e2a';
      viewport.ctx.beginPath(); viewport.ctx.moveTo(-14, -1.6); viewport.ctx.lineTo(-3, -1.8); viewport.ctx.lineTo(-3, 2.2); viewport.ctx.lineTo(-9, 2.4); viewport.ctx.lineTo(-14, 4); viewport.ctx.closePath(); viewport.ctx.fill();
      viewport.ctx.fillRect(3, -0.6, 8, 2.6);
      viewport.ctx.fillStyle = '#2a2a2e';
      viewport.ctx.fillRect(-3, -2, 7, 3.6);
      viewport.ctx.fillRect(4, -1.4, 13, 1.6);
      viewport.ctx.fillRect(-1, 1.6, 1.6, 2.4);
      if (style === 1) {
        viewport.ctx.beginPath(); viewport.ctx.arc(3, 4.2, 3, 0, Math.PI * 2); viewport.ctx.fill();
        viewport.ctx.fillStyle = '#55555c';
        viewport.ctx.beginPath(); viewport.ctx.arc(3, 4.2, 1.2, 0, Math.PI * 2); viewport.ctx.fill();
      } else {
        viewport.ctx.fillStyle = '#1b1b1f';
        viewport.ctx.fillRect(-1.5, -4, 5, 1.6);
      }
    }
    if (flash > 0) {
      const m = GUN_MUZZLE[style], f = 1 + flash * 8;
      viewport.ctx.fillStyle = style === 2 ? '#ffb347' : '#ffe066';
      viewport.ctx.beginPath();
      viewport.ctx.moveTo(m, 0); viewport.ctx.lineTo(m + 3 * f, -2.5 * f); viewport.ctx.lineTo(m + 2 * f, 0); viewport.ctx.lineTo(m + 3 * f, 2.5 * f); viewport.ctx.closePath(); viewport.ctx.fill();
      viewport.ctx.beginPath(); viewport.ctx.arc(m + 1, 0, 1.6 * f, 0, Math.PI * 2); viewport.ctx.fill();
    }
    viewport.ctx.restore();
  }

  function drawGunStuff() {
    const guns = session.state.grotto ? [] : session.state.guns;
    viewport.ctx.filter = OUTLINE;
    for (const g of guns) {
      const x = systems.flight.toScreenX(g.x), y = systems.flight.toScreenY(g.alt) - 3;
      if (x < -40 || x > viewport.W + 40) continue;
      drawRifle(x, y, g.alt > 0 ? session.state.time * 6 : 0, 1.6, gunStyle());
    }
    // Rockets in flight
    for (const r of session.state.rockets) {
      const x = systems.flight.toScreenX(r.x), y = systems.flight.toScreenY(r.alt);
      viewport.ctx.save(); viewport.ctx.translate(x, y); viewport.ctx.rotate(Math.atan2(-r.vy * session.cam.zoomY, r.vx * session.cam.zoom));
      viewport.ctx.fillStyle = '#4d5a32'; viewport.ctx.fillRect(-6, -2, 10, 4);
      viewport.ctx.fillStyle = '#c0392b'; viewport.ctx.beginPath(); viewport.ctx.moveTo(4, -2); viewport.ctx.lineTo(8, 0); viewport.ctx.lineTo(4, 2); viewport.ctx.fill();
      viewport.ctx.fillStyle = '#ffb347'; viewport.ctx.beginPath(); viewport.ctx.moveTo(-6, -1.5); viewport.ctx.lineTo(-11 - Math.random() * 4, 0); viewport.ctx.lineTo(-6, 1.5); viewport.ctx.fill();
      viewport.ctx.restore();
    }
    viewport.ctx.filter = 'none';
    for (const b of session.state.blasts) {
      const k = b.t / 0.6, r = ROCKET_BLAST * session.cam.zoom * (0.4 + 0.6 * Math.sqrt(k));
      const x = systems.flight.toScreenX(b.x), y = systems.flight.toScreenY(b.alt);
      viewport.ctx.fillStyle = `rgba(255,${150 + 80 * (1 - k)},60,${0.75 * (1 - k)})`;
      viewport.ctx.beginPath(); viewport.ctx.arc(x, y, r, 0, Math.PI * 2); viewport.ctx.fill();
      viewport.ctx.strokeStyle = `rgba(255,255,220,${1 - k})`; viewport.ctx.lineWidth = 3;
      viewport.ctx.beginPath(); viewport.ctx.arc(x, y, r * 1.1, 0, Math.PI * 2); viewport.ctx.stroke();
    }
    for (const tr of session.state.tracers) {
      viewport.ctx.strokeStyle = `rgba(255,230,140,${tr.t / 0.25})`; viewport.ctx.lineWidth = systems.combat.gunAuto() ? 2 : 3;
      viewport.ctx.beginPath(); viewport.ctx.moveTo(systems.flight.toScreenX(tr.x0), systems.flight.toScreenY(tr.a0)); viewport.ctx.lineTo(systems.flight.toScreenX(tr.x1), systems.flight.toScreenY(tr.a1)); viewport.ctx.stroke();
    }
    if (systems.combat.gunAimHeld() && !session.state.over) {
      const { ux, uy } = systems.combat.gunRay(), { t, hit } = systems.combat.gunTrace(ux, uy);
      const x0 = systems.flight.toScreenX(session.bird.x), y0 = systems.flight.toScreenY(session.bird.alt);
      const x1 = systems.flight.toScreenX(session.bird.x + ux * t), y1 = systems.flight.toScreenY(session.bird.alt + uy * t);
      viewport.ctx.strokeStyle = hit ? 'rgba(255,40,30,0.9)' : 'rgba(255,120,100,0.5)'; viewport.ctx.lineWidth = hit ? 2.5 : 1.5;
      viewport.ctx.setLineDash(hit ? [] : [6, 6]);
      viewport.ctx.beginPath(); viewport.ctx.moveTo(x0, y0); viewport.ctx.lineTo(x1, y1); viewport.ctx.stroke();
      viewport.ctx.setLineDash([]);
      if (systems.combat.gunBazooka()) {
        viewport.ctx.strokeStyle = 'rgba(255,150,60,0.8)'; viewport.ctx.lineWidth = 2;
        viewport.ctx.beginPath(); viewport.ctx.ellipse(x1, y1, ROCKET_BLAST * session.cam.zoom, ROCKET_BLAST * session.cam.zoomY, 0, 0, Math.PI * 2); viewport.ctx.stroke();
      }
      if (hit) {
        const r = 14 + Math.sin(session.state.time * 10) * 2;
        viewport.ctx.lineWidth = 2.5;
        viewport.ctx.beginPath(); viewport.ctx.arc(x1, y1, r, 0, Math.PI * 2);
        viewport.ctx.moveTo(x1 - r - 6, y1); viewport.ctx.lineTo(x1 - r + 4, y1); viewport.ctx.moveTo(x1 + r - 4, y1); viewport.ctx.lineTo(x1 + r + 6, y1);
        viewport.ctx.moveTo(x1, y1 - r - 6); viewport.ctx.lineTo(x1, y1 - r + 4); viewport.ctx.moveTo(x1, y1 + r - 4); viewport.ctx.lineTo(x1, y1 + r + 6);
        viewport.ctx.stroke();
      }
    }
  }

  // Screen angle the carried gun points: along the aim while held, otherwise along the flight
  function carriedGunAngle() {
    const { ux, uy } = systems.combat.gunAimHeld() ? systems.combat.gunRay() : { ux: Math.cos(session.bird.angle), uy: Math.sin(session.bird.angle) };
    return Math.atan2(-uy * session.cam.zoomY, ux * session.cam.zoom);
  }

  // Carried item: the gun is gripped in the talons just under the body; a turtle hangs lower
  function drawCarried(x, y, s) {
    if (!session.bird.carrying) return;
    if (session.bird.carrying.kind === 'gun') {
      const ang = carriedGunAngle(), gx = x, gy = y + 7.5 * s;
      // Legs from the body down to the grip
      viewport.ctx.strokeStyle = '#e0b030'; viewport.ctx.lineWidth = 1.6 * s; viewport.ctx.lineCap = 'round';
      for (const o of [-2, 2]) {
        const lx = gx + Math.cos(ang) * o * s, ly = gy + Math.sin(ang) * o * s;
        viewport.ctx.beginPath(); viewport.ctx.moveTo(x + o * s * 0.6, y + 1.5 * s); viewport.ctx.lineTo(lx, ly); viewport.ctx.stroke();
      }
      viewport.ctx.lineCap = 'butt';
      drawRifle(gx, gy, ang, 1.05 * s, gunStyle(), session.bird.carrying.flash || 0);
    } else {
      systems.sprites.drawTurtle(x, y + 15 * s, { vx: session.bird.vx }, SPECIES.turtle.scale * s / FALCON_SCALE);
    }
  }

  function drawFallers() {
    drawGunStuff();
    const aiming = systems.progression.aimTier() > 0 && session.mouse.aiming && session.bird.carrying && session.bird.carrying.kind !== 'gun' && session.mouse.throwHeld && !session.state.over;
    if (aiming) {
      const { vx, vy } = systems.prey.throwVelocity(true);
      const path = systems.prey.simulateThrow(session.bird.x, session.bird.alt, vx, vy);
      const guided = systems.progression.turtleHoming() > 0;
      let target = guided ? systems.prey.pickThrowTarget(path) : null;
      if (guided && !target) {
        const end = path[path.length - 1];
        let best = null, bestD = Infinity;
        for (const r of session.state.rivals) {
          if (r.gone) continue;
          const d = Math.hypot(r.x - end.x, r.alt - end.alt);
          if (d < bestD) { bestD = d; best = { kind: 'buzzard', x: r.x, alt: r.alt, target: r }; }
        }
        if (best && bestD < THROW_LOCK_AIR * systems.progression.lockScale() + 10) target = best;
      }
      viewport.ctx.setLineDash([4, 6]); viewport.ctx.strokeStyle = 'rgba(255,80,60,0.6)'; viewport.ctx.lineWidth = 2;
      viewport.ctx.beginPath();
      path.forEach((pt, i) => (i ? viewport.ctx.lineTo : viewport.ctx.moveTo).call(viewport.ctx, systems.flight.toScreenX(pt.x), systems.flight.toScreenY(pt.alt)));
      viewport.ctx.stroke();
      viewport.ctx.setLineDash([]);
      const end = path[path.length - 1], lx = systems.flight.toScreenX(end.x), gy = systems.flight.toScreenY(0);
      viewport.ctx.strokeStyle = 'rgba(255,80,60,0.9)';
      viewport.ctx.beginPath(); viewport.ctx.ellipse(lx, gy, 12, 4, 0, 0, Math.PI * 2); viewport.ctx.stroke();
      viewport.ctx.beginPath(); viewport.ctx.moveTo(lx - 6, gy - 6); viewport.ctx.lineTo(lx + 6, gy + 6); viewport.ctx.moveTo(lx + 6, gy - 6); viewport.ctx.lineTo(lx - 6, gy + 6); viewport.ctx.stroke();
      if (target) {
        const isAir = systems.prey.isBuzzardTarget(target) || target.air || SPECIES[target.kind]?.air;
        const tx = systems.flight.toScreenX(target.x), ty = isAir ? systems.flight.toScreenY(target.alt) : gy - (target.kind === 'hunter' ? 25 * hazardScale() : 10);
        const r = 16 + Math.sin(session.state.time * 10) * 2;
        viewport.ctx.strokeStyle = '#ff5544'; viewport.ctx.lineWidth = 3;
        viewport.ctx.beginPath(); viewport.ctx.arc(tx, ty, r, 0, Math.PI * 2); viewport.ctx.stroke();
        viewport.ctx.beginPath(); viewport.ctx.moveTo(tx - r - 6, ty); viewport.ctx.lineTo(tx - r + 4, ty); viewport.ctx.moveTo(tx + r - 4, ty); viewport.ctx.lineTo(tx + r + 6, ty); viewport.ctx.stroke();
        if (systems.prey.isBuzzardTarget(target) || HAZARD_NAME[target.kind]) {
          viewport.ctx.beginPath(); viewport.ctx.arc(tx, ty, r + 8, 0, Math.PI * 2); viewport.ctx.stroke();
        }
      }
    }
    viewport.ctx.filter = OUTLINE;
    const turtleScale = SPECIES.turtle.scale * systems.progression.spriteK();
    for (const f of session.state.fallers) systems.sprites.drawTurtle(systems.flight.toScreenX(f.x), systems.flight.toScreenY(f.alt), { vx: f.vx }, turtleScale, f.spin);
    viewport.ctx.filter = 'none';
  }
  function drawDustDevils() {
    if (!DUST_DEVILS_ENABLED) return;
    for (const dv of session.state.devils) {
      const f = systems.world.devilFade(dv);
      if (f <= 0.05) continue;
      const bx = systems.flight.toScreenX(dv.x), gy = systems.flight.toScreenY(0);
      const radius = Math.max(10, dv.w * session.cam.zoom * 2.2);
      const twist = session.state.time * 15 + dv.x * 0.7;
      viewport.ctx.save();
      viewport.ctx.translate(bx, gy - 2);
      viewport.ctx.lineCap = 'round';
      viewport.ctx.globalAlpha = 0.7 * f;
      viewport.ctx.strokeStyle = 'rgba(235, 179, 96, 0.95)';
      viewport.ctx.lineWidth = Math.max(2, 4 * f);
      for (let k = 0; k < 8; k++) {
        const ang = twist + k * 0.9;
        const rr = radius * (0.18 + k * 0.1);
        const x = Math.cos(ang) * rr * 0.7;
        const y = -Math.sin(ang) * rr * 0.8 - (k * 2.5);
        viewport.ctx.beginPath();
        viewport.ctx.moveTo(0, 0);
        viewport.ctx.quadraticCurveTo(x * 0.55, -4 - k * 1.5, x, y);
        viewport.ctx.stroke();
      }
      viewport.ctx.fillStyle = `rgba(194, 112, 52, ${0.45 * f})`;
      viewport.ctx.beginPath(); viewport.ctx.ellipse(0, 2, radius * 1.2, radius * 0.38, 0, 0, Math.PI * 2); viewport.ctx.fill();
      viewport.ctx.beginPath(); viewport.ctx.ellipse(0, 6, radius * 0.8, radius * 0.24, Math.sin(twist) * 0.7, 0, Math.PI * 2); viewport.ctx.fill();
      viewport.ctx.restore();
    }
  }

  function drawGrass() {
    const BLADE_M = 0.12;
    const keep = Math.min(1, BLADE_M * session.cam.zoom / 5.5);
    const groundY = systems.flight.toScreenY(0);
    if (groundY < -5 || groundY > viewport.H + 40) return;
    const stride = Math.max(1, Math.floor(1 / keep));
    const wind = systems.world.windX(2) * 0.06;
    const t = session.state.time;
    const i0 = Math.floor((session.cam.x - (viewport.W / 2 + 30) / session.cam.zoom) / BLADE_M / stride) * stride;
    const i1 = Math.ceil((session.cam.x + (viewport.W / 2 + 30) / session.cam.zoom) / BLADE_M);
    const lakes = [];
    for (let index = Math.floor((i0 * BLADE_M - 400) / LAKE_SPACING) - 1; index <= Math.ceil((i1 * BLADE_M - 400) / LAKE_SPACING); index++) {
      const lake = systems.world.lakeAt(index);
      if (lake.on) lakes.push(lake);
    }
    const paths = GRASS_COLORS.map(() => new Path2D());
    for (let i = i0; i <= i1; i += stride) {
      if (hash(i) > keep * stride) continue;
      const r2 = hash(i + 0.37), r3 = hash(i + 0.71), r4 = hash(i + 1.23);
      const wx = (i + r2 * stride) * BLADE_M;
      if (lakes.some(lake => wx >= lake.x0 && wx <= lake.x0 + lake.w)) continue;
      const sx = systems.flight.toScreenX(wx);
      const h = 10 + r3 * 16 + r4 * 8;
      const tuft = Math.sin(t * 1.6 + wx * 0.45) * 0.22 + Math.sin(t * 0.7 + wx * 0.07) * 0.18 + wind;
      let bend = tuft;
      for (const w of session.state.wake) {
        const dxPx = (wx - w.x) * session.cam.zoom;
        if (dxPx > 90 || dxPx < -90) continue;
        const inf = Math.exp(-((dxPx / 28) ** 2)) * w.s * (1 - (t - w.t) / 1.5);
        bend += (Math.sign(dxPx) || 1) * inf * 1.4 + Math.sin(t * 18 + i) * inf * 0.2;
      }
      bend = Math.max(-1.4, Math.min(1.4, bend));
      const p = paths[Math.floor(r4 * (paths.length - 0.01))];
      const sway = Math.sin(bend) * h * 0.3;
      p.moveTo(sx, groundY + 2);
      p.quadraticCurveTo(sx + sway * 0.7, groundY - h * 0.35, sx + Math.sin(bend) * h * 0.9, groundY - h);
      p.moveTo(sx, groundY + 3);
      p.quadraticCurveTo(sx - sway * 0.4, groundY - h * 0.25, sx + Math.sin(bend + 0.6) * h * 0.7, groundY - h * 0.9);
    }
    viewport.ctx.lineWidth = 2; viewport.ctx.lineCap = 'round';
    paths.forEach((p, k) => { viewport.ctx.strokeStyle = GRASS_COLORS[k]; viewport.ctx.stroke(p); });
    viewport.ctx.lineCap = 'butt';
  }

  function drawLens(cx, cy, bg, drawContent) {
    viewport.ctx.save();
    viewport.ctx.beginPath(); viewport.ctx.arc(cx, cy, LENS_R, 0, Math.PI * 2); viewport.ctx.clip();
    viewport.ctx.fillStyle = bg; viewport.ctx.fillRect(cx - LENS_R, cy - LENS_R, LENS_R * 2, LENS_R * 2);
    drawContent();
    viewport.ctx.restore();
    viewport.ctx.beginPath(); viewport.ctx.arc(cx, cy, LENS_R, 0, Math.PI * 2);
    viewport.ctx.strokeStyle = 'rgba(0,0,0,0.6)'; viewport.ctx.lineWidth = 5; viewport.ctx.stroke();
    viewport.ctx.strokeStyle = '#fff'; viewport.ctx.lineWidth = 2; viewport.ctx.stroke();
  }

  function birdScreenAngle() {
    return Math.atan2(Math.sin(session.bird.angle) * session.cam.zoomY, Math.cos(session.bird.angle) * session.cam.zoom);
  }

  function drawBirdLens() {
    if (!systems.flight.birdAboveScreen()) return;
    const { x, y } = systems.flight.birdAnchor();
    drawLens(x, y, '#9cc8ef', () => {
      if (session.bird.carrying) {
        if (session.bird.carrying.kind === 'gun') drawRifle(x, y + 14, 0, 1.4, gunStyle());
        else systems.sprites.drawTurtle(x, y + 18, { vx: session.bird.vx }, 1.2);
      }
      drawBirdSprite(x, y, birdScreenAngle(), 1.8);
    });
    const label = `+${(session.bird.alt - session.MAX_ALT).toFixed(0)} m`;
    viewport.ctx.font = 'bold 12px monospace';
    const w = viewport.ctx.measureText(label).width + 10;
    viewport.ctx.fillStyle = 'rgba(0,0,0,0.65)';
    viewport.ctx.fillRect(x - w / 2, y + LENS_R + 6, w, 18);
    viewport.ctx.fillStyle = '#66ccff'; viewport.ctx.textAlign = 'center';
    viewport.ctx.fillText(label, x, y + LENS_R + 19);
  }

  function drawBird() {
    const sx = systems.flight.toScreenX(session.bird.x), sy = systems.flight.toScreenY(session.bird.alt);
    viewport.ctx.filter = OUTLINE;
    const sprite = FALCON_SCALE * systems.progression.spriteK();
    if (session.bird.invulnT > 0) viewport.ctx.globalAlpha = 0.45 + 0.45 * Math.sin(session.state.time * 30);
    if (session.bird.carrying) drawCarried(sx, sy, sprite);
    // Player sprite shrinks with the zoom-out like everything else; the buzzsaw spin tumbles it end over end
    const spinning = session.bird.bouncing && session.bird.bouncing.spin;
    drawBirdSprite(sx, sy, spinning ? session.bird.spinA : birdScreenAngle(), sprite);
    viewport.ctx.filter = 'none'; viewport.ctx.globalAlpha = 1;
    if (spinning) {
      const r = Math.max(22, SPIN_R * session.cam.zoom);
      viewport.ctx.strokeStyle = 'rgba(255,240,200,0.8)'; viewport.ctx.lineWidth = 3;
      for (let k = 0; k < 3; k++) {
        const a0 = -session.bird.spinA + k * Math.PI * 2 / 3;
        viewport.ctx.beginPath(); viewport.ctx.arc(sx, sy, r, a0, a0 + 1.2); viewport.ctx.stroke();
      }
    }

    // Speed streaks
    if (session.bird.speed > DIVE_SPEED) {
      viewport.ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      for (let i = 0; i < 4; i++) {
        const ox = (Math.random() - 0.5) * 30, oy = (Math.random() - 0.5) * 30;
        viewport.ctx.beginPath();
        viewport.ctx.moveTo(sx + ox, sy + oy);
        viewport.ctx.lineTo(sx + ox - session.bird.vx * session.cam.zoom * 0.08, sy + oy + session.bird.vy * session.cam.zoomY * 0.08);
        viewport.ctx.stroke();
      }
    }
  }

  // Breath left underwater: a row of bubbles above the bird
  function drawBreath(x, y) {
    const n = 7, k = (session.bird.breath ?? systems.progression.swimBreath()) / systems.progression.swimBreath(), lit = Math.ceil(k * n);
    for (let i = 0; i < n; i++) {
      const bx = x + (i - (n - 1) / 2) * 9;
      viewport.ctx.beginPath(); viewport.ctx.arc(bx, y, 3.5, 0, Math.PI * 2);
      viewport.ctx.fillStyle = i < lit ? (k < 0.3 ? '#ff9a7a' : '#bfe8ff') : 'rgba(255,255,255,0.12)';
      viewport.ctx.fill();
      viewport.ctx.strokeStyle = 'rgba(255,255,255,0.7)'; viewport.ctx.lineWidth = 1; viewport.ctx.stroke();
    }
    if (k <= 0) {
      viewport.ctx.fillStyle = '#ff9a7a'; viewport.ctx.font = 'bold 11px sans-serif'; viewport.ctx.textAlign = 'center';
      viewport.ctx.fillText('out of breath!', x, y - 9);
    }
  }
  function eyasSprite(f, carry, armed) {
    const fi = Math.round((clamp(f, -1, 1) + 1) * 5), fq = fi / 5 - 1;
    return systems.sprites.cached(`eyas|${fi}|${carry ? 1 : 0}|${armed ? 1 : 0}`, EYAS_S, () => {
      viewport.ctx.save();
      viewport.ctx.scale(EYAS_S, EYAS_S);
      if (armed) drawRifle(1, 4.5, 0, 0.55, 0);
      viewport.ctx.fillStyle = '#9a6a3c';
      viewport.ctx.beginPath(); viewport.ctx.moveTo(3, -1); viewport.ctx.lineTo(-3, -2 - fq * 11); viewport.ctx.lineTo(-10, -1 - fq * 8); viewport.ctx.lineTo(-5, 1); viewport.ctx.closePath(); viewport.ctx.fill();
      viewport.ctx.fillStyle = '#7a4e2a';
      viewport.ctx.beginPath(); viewport.ctx.ellipse(0, 0, 8.5, 3.2, 0, 0, Math.PI * 2); viewport.ctx.fill();
      viewport.ctx.fillStyle = '#f0dcb4';
      viewport.ctx.beginPath(); viewport.ctx.ellipse(1, 1.4, 5, 1.5, 0, 0, Math.PI * 2); viewport.ctx.fill();
      viewport.ctx.fillStyle = '#7a4e2a';
      viewport.ctx.beginPath(); viewport.ctx.moveTo(-7, 0); viewport.ctx.lineTo(-14, -2.5); viewport.ctx.lineTo(-14, 2.5); viewport.ctx.fill();
      viewport.ctx.beginPath(); viewport.ctx.arc(8, -1, 2.8, 0, Math.PI * 2); viewport.ctx.fill();
      viewport.ctx.fillStyle = '#ffe14a';
      viewport.ctx.beginPath(); viewport.ctx.moveTo(10.5, -1.5); viewport.ctx.lineTo(13, 0); viewport.ctx.lineTo(10.5, 0.6); viewport.ctx.fill();
      if (carry) { viewport.ctx.fillStyle = '#6b5a48'; viewport.ctx.beginPath(); viewport.ctx.ellipse(0, 5.5, 3.5, 2, 0, 0, Math.PI * 2); viewport.ctx.fill(); }
      viewport.ctx.restore();
    });
  }
  function drawEyases() {
    if (!session.state.eyases) return;
    const k = systems.progression.spriteK();
    for (const e of session.state.eyases) {
      const x = systems.flight.toScreenX(e.x), y = systems.flight.toScreenY(e.alt);
      if (x < -40 || x > viewport.W + 40 || y < -40 || y > viewport.H + 40) continue;
      const f = e.mode === 'chase' ? 0.25 + 0.3 * Math.sin(e.flapT * 1.4) : Math.sin(e.flapT);
      const ang = Math.atan2(e.vy * session.cam.zoomY, e.vx * session.cam.zoom);
      const img = eyasSprite(f, e.carry, e.ammo > 0);
      viewport.ctx.save();
      viewport.ctx.translate(x, y);
      viewport.ctx.rotate(-ang * (e.mode === 'chase' ? 1 : 0.4));
      viewport.ctx.scale(k, k * (Math.cos(ang) < 0 ? -1 : 1));
      viewport.ctx.drawImage(img, -img.width / 2, -img.height / 2);
      viewport.ctx.restore();
    }
  }

  function drawFeatherFx() {
    for (const f of session.state.featherFx) {
      viewport.ctx.save();
      viewport.ctx.translate(systems.flight.toScreenX(f.x), systems.flight.toScreenY(f.alt)); viewport.ctx.rotate(f.rot);
      viewport.ctx.globalAlpha = Math.min(1, f.life);
      viewport.ctx.fillStyle = '#fff4d6';
      viewport.ctx.beginPath(); viewport.ctx.ellipse(0, 0, 5, 1.6, 0, 0, Math.PI * 2); viewport.ctx.fill();
      viewport.ctx.restore();
    }
    viewport.ctx.globalAlpha = 1;
  }

  function drawBirdSprite(sx, sy, screenAngle, sprite) {
    // Wing shape depends on mode
    const effort = session.bird.tuck ?? 0.5;
    let span, sweep;
    if (session.bird.mode === 'DIVE') { span = 12 - effort * 7; sweep = -16; }   // tucked
    else if (session.bird.mode === 'SPIN') { span = 6; sweep = -20; }           // balled up
    else if (session.bird.mode === 'BRAKE') { span = 20; sweep = 4; }            // flared
    else if (session.bird.mode === 'FLAP') { span = 16 + Math.sin(session.bird.flapT) * 10; sweep = -6; }
    else { span = 18 - effort * 6; sweep = -6 - effort * 4; }
    span = Math.round(span * 2) / 2;
    sweep = Math.round(sweep * 2) / 2;
    const talons = systems.input.talonsOut();
    const image = systems.sprites.cached(`falcon|${span}|${sweep}|${talons ? 1 : 0}`, 2, () => {
      viewport.ctx.save();
      viewport.ctx.scale(2, 2);
      drawBirdShape(span, sweep, talons);
      viewport.ctx.restore();
    });
    viewport.ctx.save();
    viewport.ctx.filter = 'none';
    viewport.ctx.translate(sx, sy);
    viewport.ctx.rotate(-screenAngle);
    viewport.ctx.scale(sprite / 2, sprite / 2);
    viewport.ctx.drawImage(image, -image.width / 2, -image.height / 2);
    viewport.ctx.restore();
  }

  function drawBirdShape(span, sweep, talons) {
    viewport.ctx.fillStyle = '#4a4a52';
    // wings
    viewport.ctx.beginPath();
    viewport.ctx.moveTo(4, 0); viewport.ctx.lineTo(sweep, -span); viewport.ctx.lineTo(-6, 0);
    viewport.ctx.lineTo(sweep, span); viewport.ctx.closePath(); viewport.ctx.fill();
    if (talons) {
      viewport.ctx.strokeStyle = '#f2c230'; viewport.ctx.lineWidth = 2; viewport.ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        viewport.ctx.beginPath();
        viewport.ctx.moveTo(2, side * 2);
        viewport.ctx.lineTo(9, side * 8);
        viewport.ctx.lineTo(15, side * 8);
        viewport.ctx.stroke();
        viewport.ctx.strokeStyle = '#fff1b8'; viewport.ctx.lineWidth = 1.4;
        for (const toe of [-1, 0, 1]) {
          viewport.ctx.beginPath();
          viewport.ctx.moveTo(14, side * 8);
          viewport.ctx.lineTo(18, side * 8 + toe * 3);
          viewport.ctx.lineTo(19, side * 8 + toe * 3 - side * 2);
          viewport.ctx.stroke();
        }
        viewport.ctx.strokeStyle = '#f2c230'; viewport.ctx.lineWidth = 2;
      }
      viewport.ctx.lineCap = 'butt';
    }
    // body
    viewport.ctx.fillStyle = '#2f2f36';
    viewport.ctx.beginPath(); viewport.ctx.ellipse(0, 0, 12, 4, 0, 0, Math.PI * 2); viewport.ctx.fill();
    // tail
    viewport.ctx.beginPath(); viewport.ctx.moveTo(-10, 0); viewport.ctx.lineTo(-18, -4); viewport.ctx.lineTo(-18, 4); viewport.ctx.fill();
    // head + beak
    viewport.ctx.fillStyle = '#1c1c22';
    viewport.ctx.beginPath(); viewport.ctx.arc(11, 0, 3.5, 0, Math.PI * 2); viewport.ctx.fill();
    viewport.ctx.fillStyle = '#f2c230';
    viewport.ctx.beginPath(); viewport.ctx.moveTo(14, -1); viewport.ctx.lineTo(18, 1); viewport.ctx.lineTo(14, 2); viewport.ctx.fill();
  }

  function drawThermals() {
    const half = viewport.W / 2 / session.cam.zoom;
    const i0 = Math.floor((session.cam.x - half) / THERMAL_SPACING) - 1, i1 = Math.ceil((session.cam.x + half) / THERMAL_SPACING) + 1;
    for (let i = i0; i <= i1; i++) {
      const th = systems.world.thermalCol(i);
      if (!th.on) continue;
      // Faint warm column, plus rising motes whose speed matches the thermal's strength
      const cx = systems.flight.toScreenX(th.x), cw = th.w * session.cam.zoom * 1.6;
      const col = viewport.ctx.createLinearGradient(cx - cw, 0, cx + cw, 0);
      col.addColorStop(0, 'rgba(255,225,170,0)');
      col.addColorStop(0.5, 'rgba(255,225,170,0.12)');
      col.addColorStop(1, 'rgba(255,225,170,0)');
      viewport.ctx.fillStyle = col;
      const top = systems.flight.toScreenY(session.MAX_ALT), bottom = systems.flight.toScreenY(0);
      viewport.ctx.fillRect(cx - cw, top, cw * 2, bottom - top);
      viewport.ctx.fillStyle = '#fff0c8';
      for (let k = 0; k < 40; k++) {
        const alt = ((k * 37.7) % session.MAX_ALT + session.state.time * th.s * 3) % session.MAX_ALT;
        const x = th.x + Math.sin(k * 2.3 + session.state.time * 0.8) * th.w * 0.7;
        viewport.ctx.globalAlpha = 0.6 * Math.min(1, alt / 30) * Math.min(1, (session.MAX_ALT - alt) / 60);
        viewport.ctx.fillRect(systems.flight.toScreenX(x) - 2, systems.flight.toScreenY(alt) - 2, 4, 4);
      }
      viewport.ctx.globalAlpha = 1;
    }
    // Sinking air: cool motes drifting down
    viewport.ctx.fillStyle = '#bed7ff';
    for (let i = i0; i <= i1; i++) {
      const sk = systems.world.sinkCol(i);
      if (!sk.on) continue;
      for (let k = 0; k < 20; k++) {
        const alt = session.MAX_ALT - ((k * 41.3) % session.MAX_ALT + session.state.time * sk.s * 3) % session.MAX_ALT;
        const x = sk.x + Math.sin(k * 1.7 + session.state.time * 0.5) * sk.w * 0.8;
        viewport.ctx.globalAlpha = 0.45 * Math.min(1, alt / 30) * Math.min(1, (session.MAX_ALT - alt) / 60);
        viewport.ctx.fillRect(systems.flight.toScreenX(x) - 1.5, systems.flight.toScreenY(alt) - 1.5, 3, 3);
      }
    }
    viewport.ctx.globalAlpha = 1;
  }

  function drawSoundRings() {
    for (const r of session.state.rings) {
      const k = r.t / 0.8;
      const rad = r.r * Math.sqrt(k);
      viewport.ctx.beginPath();
      viewport.ctx.ellipse(systems.flight.toScreenX(r.x), systems.flight.toScreenY(r.alt), Math.max(1, rad * session.cam.zoom), Math.max(1, rad * session.cam.zoomY), 0, 0, Math.PI * 2);
      viewport.ctx.strokeStyle = r.kind === 'brake' ? `rgba(140,210,255,${0.25 * (1 - k)})`
        : r.kind === 'wind' ? `rgba(220,230,255,${0.12 * (1 - k)})`
        : r.kind === 'shot' ? `rgba(255,190,120,${0.6 * (1 - k)})`
        : r.kind === 'screech' ? `rgba(255,120,200,${0.8 * (1 - k)})`
        : `rgba(255,255,255,${0.3 * (1 - k)})`;
      viewport.ctx.lineWidth = r.kind === 'screech' ? 4 : 1;
      viewport.ctx.stroke();
    }
  }

  function drawDetectionZones() {
    const hear = systems.prey.hearingRange();
    for (const p of session.prey) {
      const sn = systems.prey.SENSES[p.kind];
      if (!sn || IGNORE_DETECTION.has(p.kind) || p.gone || p.hidden || p.spent || p.fleeing || p.spookT > 0 || p.scatterT > 0) continue;
      const a = Math.max(0, 1 - Math.abs(p.x - session.bird.x) / 400);
      if (a <= 0.02) continue;
      const ex = systems.flight.toScreenX(p.x), ey = systems.flight.toScreenY(systems.prey.eyeAlt(p));

      // Vision cone (red); the gap is the blind spot
      const dir = systems.prey.lookAngle(p), range = systems.prey.visionRange(sn);
      viewport.ctx.beginPath();
      if (sn.half < Math.PI) viewport.ctx.moveTo(ex, ey);
      const N = 24;
      for (let i = 0; i <= N; i++) {
        const ang = dir - sn.half + (2 * sn.half * i) / N;
        const alt = Math.max(0, systems.prey.eyeAlt(p) + Math.sin(ang) * range);
        viewport.ctx.lineTo(systems.flight.toScreenX(p.x + Math.cos(ang) * range), systems.flight.toScreenY(alt));
      }
      viewport.ctx.closePath();
      viewport.ctx.fillStyle = `rgba(255,60,60,${0.1 * a})`; viewport.ctx.fill();
      viewport.ctx.strokeStyle = `rgba(255,90,90,${0.5 * a})`; viewport.ctx.lineWidth = 1.5;
      viewport.ctx.setLineDash([6, 6]); viewport.ctx.stroke();

      // Hearing ring (orange); grows when you flap or brake
      viewport.ctx.beginPath();
      viewport.ctx.ellipse(ex, ey, hear * session.cam.zoom, hear * session.cam.zoomY, 0, 0, Math.PI * 2);
      viewport.ctx.strokeStyle = `rgba(255,170,60,${0.7 * a})`;
      viewport.ctx.setLineDash([2, 5]); viewport.ctx.stroke();
      viewport.ctx.setLineDash([]);
    }
  }

  function drawDevils() {
    if (!DUST_DEVILS_ENABLED) return;
    for (const dv of session.state.devils) {
      const f = systems.world.devilFade(dv);
      if (f <= 0) continue;
      const bx = systems.flight.toScreenX(dv.x), gy = systems.flight.toScreenY(0);
      if (bx < -200 || bx > viewport.W + 200) continue;
      viewport.ctx.fillStyle = `rgba(190,160,110,${0.35 * f})`;
      viewport.ctx.beginPath(); viewport.ctx.ellipse(bx, gy - 2, (dv.w * 1.5) * session.cam.zoom + 6, 5, 0, 0, Math.PI * 2); viewport.ctx.fill();
      for (let k = 0; k < 60; k++) {
        const a = k / 60, alt = a * dv.top;
        const rr = dv.w * (0.3 + a * 1.2);
        const ang = dv.t * 7 + k * 0.9;
        viewport.ctx.fillStyle = `rgba(200,170,120,${0.5 * f * (1 - a * 0.7)})`;
        viewport.ctx.fillRect(systems.flight.toScreenX(dv.x + Math.cos(ang) * rr) - 2, systems.flight.toScreenY(alt) - 2, 4, 4);
      }
    }
  }

  function drawBuzzard(x, y, r, s) {
    const f = Math.sin(r.flapT) * (r.mode === 'chase' ? 1 : 0.35);
    viewport.ctx.save();
    viewport.ctx.translate(x, y);
    viewport.ctx.scale((r.vx < 0 ? -1 : 1) * s, s);
    viewport.ctx.fillStyle = '#6b4a2e';
    viewport.ctx.beginPath(); viewport.ctx.moveTo(4, -1); viewport.ctx.lineTo(-6, -2 - f * 16); viewport.ctx.lineTo(-16, -1 - f * 12); viewport.ctx.lineTo(-8, 1); viewport.ctx.closePath(); viewport.ctx.fill();
    viewport.ctx.fillStyle = '#5a3d25';
    viewport.ctx.beginPath(); viewport.ctx.ellipse(0, 0, 13, 4.5, 0, 0, Math.PI * 2); viewport.ctx.fill();
    viewport.ctx.fillStyle = '#c9b08a';
    viewport.ctx.beginPath(); viewport.ctx.ellipse(1, 2, 8, 2, 0, 0, Math.PI * 2); viewport.ctx.fill();
    viewport.ctx.fillStyle = '#5a3d25';
    viewport.ctx.beginPath(); viewport.ctx.moveTo(-12, 0); viewport.ctx.lineTo(-20, -4); viewport.ctx.lineTo(-20, 4); viewport.ctx.fill();
    viewport.ctx.beginPath(); viewport.ctx.arc(12, -1, 4, 0, Math.PI * 2); viewport.ctx.fill();
    viewport.ctx.fillStyle = '#e8c040';
    viewport.ctx.beginPath(); viewport.ctx.moveTo(15, -2); viewport.ctx.lineTo(19, 0); viewport.ctx.lineTo(15, 1); viewport.ctx.fill();
    viewport.ctx.restore();
  }

  function drawRivals() {
    viewport.ctx.filter = OUTLINE;
    for (const r of session.state.rivals) {
      if (r.gone) continue;
      const x = systems.flight.toScreenX(r.x), y = systems.flight.toScreenY(r.alt);
      if (x < -60 || x > viewport.W + 60 || y < -60 || y > viewport.H + 60) continue;
      const scale = 1.5 * systems.progression.spriteK();
      if (r.gun) {
        const angle = r.tracking || r.aim > 0
          ? Math.atan2(-(r.aalt - r.alt) * session.cam.zoomY, (r.ax - r.x) * session.cam.zoom)
          : r.vx < 0 ? Math.PI : 0;
        drawRifle(x, y + 7 * scale, angle, scale, 0, r.flash || 0);
      }
      drawBuzzard(x, y, r, scale);
    }
    viewport.ctx.filter = 'none';
    for (const r of session.state.rivals) if (!r.gone && r.alertT > 0) systems.sprites.drawAlert(systems.flight.toScreenX(r.x), systems.flight.toScreenY(r.alt) - 24);
  }
  // Hunters and cats shrink with the camera like every other sprite
  const hazardScale = () => HAZARD_SCALE * systems.progression.spriteK();

  function drawCat(x, y, c, s) {
    const crouch = c.mode === 'crouch', leap = c.mode === 'leap';
    viewport.ctx.save();
    viewport.ctx.translate(x, y);
    viewport.ctx.scale(c.dir * s, s);
    if (leap) viewport.ctx.rotate(-Math.atan2(c.vy, Math.abs(c.vx) + 1) * 0.6);
    viewport.ctx.fillStyle = '#3b3530';
    const bh = crouch ? 4 : 6;
    viewport.ctx.beginPath(); viewport.ctx.ellipse(0, -bh, leap ? 12 : 10, crouch ? 3.5 : 4.5, 0, 0, Math.PI * 2); viewport.ctx.fill();
    viewport.ctx.beginPath(); viewport.ctx.arc(10, -bh - 3, 4.5, 0, Math.PI * 2); viewport.ctx.fill();
    viewport.ctx.beginPath(); viewport.ctx.moveTo(7, -bh - 6); viewport.ctx.lineTo(8.5, -bh - 11); viewport.ctx.lineTo(11, -bh - 6.5);
    viewport.ctx.moveTo(10.5, -bh - 6.5); viewport.ctx.lineTo(13.5, -bh - 10.5); viewport.ctx.lineTo(14, -bh - 5); viewport.ctx.fill();
    viewport.ctx.strokeStyle = '#3b3530'; viewport.ctx.lineWidth = 2.2; viewport.ctx.lineCap = 'round';
    viewport.ctx.beginPath(); viewport.ctx.moveTo(-9, -bh); viewport.ctx.quadraticCurveTo(-17, -bh - (leap ? 2 : 10), -15, -bh - (leap ? 0 : 14)); viewport.ctx.stroke();
    if (!leap) {
      viewport.ctx.beginPath(); viewport.ctx.moveTo(-6, -bh + 2); viewport.ctx.lineTo(-6, 0); viewport.ctx.moveTo(6, -bh + 2); viewport.ctx.lineTo(6, 0); viewport.ctx.stroke();
    } else {
      viewport.ctx.beginPath(); viewport.ctx.moveTo(8, -bh + 1); viewport.ctx.lineTo(16, -bh + 3); viewport.ctx.moveTo(-7, -bh + 1); viewport.ctx.lineTo(-15, -bh + 4); viewport.ctx.stroke();
    }
    viewport.ctx.fillStyle = '#e8d040';
    viewport.ctx.beginPath(); viewport.ctx.arc(12, -bh - 3.5, 1.2, 0, Math.PI * 2); viewport.ctx.fill();
    viewport.ctx.restore();
  }

  function drawHunter(x, y, h, s) {
    viewport.ctx.save();
    viewport.ctx.translate(x, y);
    viewport.ctx.scale(s, s);
    const face = h.tracking ? Math.sign(systems.flight.toScreenX(h.ax) - x) || 1 : 1;
    viewport.ctx.fillStyle = '#4a5a32';
    viewport.ctx.fillRect(-4, -14, 3, 14); viewport.ctx.fillRect(1, -14, 3, 14);
    viewport.ctx.fillRect(-5, -28, 10, 15);
    viewport.ctx.fillStyle = '#e0b48a';
    viewport.ctx.beginPath(); viewport.ctx.arc(0, -32, 4, 0, Math.PI * 2); viewport.ctx.fill();
    viewport.ctx.fillStyle = '#e06a1a';
    viewport.ctx.fillRect(-6, -36, 12, 3); viewport.ctx.fillRect(-4, -39, 8, 3);
    // Rifle points at the current aim
    const ang = h.tracking ? Math.atan2(systems.flight.toScreenY(h.aalt) - (y - 26 * s), systems.flight.toScreenX(h.ax) - x) : face > 0 ? -0.5 : Math.PI + 0.5;
    viewport.ctx.translate(0, -25);
    viewport.ctx.rotate(ang);
    viewport.ctx.fillStyle = '#2a1d12';
    viewport.ctx.fillRect(-4, -1.5, 22, 3);
    if (h.flash > 0) {
      viewport.ctx.fillStyle = '#ffd36b';
      viewport.ctx.beginPath(); viewport.ctx.moveTo(18, 0); viewport.ctx.lineTo(28, -5); viewport.ctx.lineTo(30, 0); viewport.ctx.lineTo(28, 5); viewport.ctx.fill();
    }
    viewport.ctx.restore();
  }

  // Satellite sprite centred on (x, y): gold-foil body, two solar panels, a dish and a blinking beacon
  function drawSatellite(x, y, rot, s, blink) {
    viewport.ctx.save();
    viewport.ctx.translate(x, y); viewport.ctx.rotate(rot); viewport.ctx.scale(s, s);
    viewport.ctx.strokeStyle = '#8a8f99'; viewport.ctx.lineWidth = 1.2;
    viewport.ctx.beginPath(); viewport.ctx.moveTo(-17, 0); viewport.ctx.lineTo(17, 0); viewport.ctx.stroke();
    for (const dx of [-1, 1]) {
      const px0 = dx < 0 ? -30 : 13;
      viewport.ctx.fillStyle = '#23407a'; viewport.ctx.fillRect(px0, -5, 17, 10);
      viewport.ctx.strokeStyle = '#7fa3d8'; viewport.ctx.lineWidth = 0.6;
      for (let i = 1; i < 4; i++) { const px = px0 + i * 17 / 4; viewport.ctx.beginPath(); viewport.ctx.moveTo(px, -5); viewport.ctx.lineTo(px, 5); viewport.ctx.stroke(); }
      viewport.ctx.beginPath(); viewport.ctx.moveTo(px0, 0); viewport.ctx.lineTo(px0 + 17, 0); viewport.ctx.stroke();
    }
    viewport.ctx.fillStyle = '#d6a83a'; viewport.ctx.fillRect(-7, -6, 14, 12);
    viewport.ctx.fillStyle = '#f2d27a'; viewport.ctx.fillRect(-7, -6, 14, 3);
    viewport.ctx.strokeStyle = '#ccc'; viewport.ctx.lineWidth = 1;
    viewport.ctx.beginPath(); viewport.ctx.moveTo(0, -6); viewport.ctx.lineTo(0, -10); viewport.ctx.stroke();
    viewport.ctx.fillStyle = '#e8e8e8';
    viewport.ctx.beginPath(); viewport.ctx.arc(0, -11, 3.5, Math.PI, 0); viewport.ctx.fill();
    if (blink) { viewport.ctx.fillStyle = '#ff4d4d'; viewport.ctx.beginPath(); viewport.ctx.arc(5, 7.5, 1.6, 0, Math.PI * 2); viewport.ctx.fill(); }
    viewport.ctx.restore();
  }
  function drawSatelliteWorld() {
    const s = session.state.satellite;
    if (!s || s.gone || session.state.grotto) return;
    const x = systems.flight.toScreenX(s.x), y = systems.flight.toScreenY(s.alt), k = hazardScale();
    if (x < -60 || x > viewport.W + 60 || y < -60 || y > viewport.H + 60) return;
    drawSatellite(x, y, s.down ? s.ph : Math.sin(s.ph * 0.4) * 0.08, k, !s.down && (s.ph % 1.2) < 0.25);
  }

  function drawHawk(x, y, h, s) {
    const stoop = h.mode === 'stoop';
    const f = stoop ? 0.15 : Math.sin(h.flapT);
    viewport.ctx.save();
    viewport.ctx.translate(x, y);
    viewport.ctx.rotate(Math.atan2(-h.vy, h.vx) * (stoop ? 1 : 0.4));
    viewport.ctx.scale(s, s * (Math.abs(Math.atan2(-h.vy, h.vx)) > Math.PI / 2 ? -1 : 1));
    viewport.ctx.fillStyle = '#4e5660';
    viewport.ctx.beginPath(); viewport.ctx.moveTo(4, -1); viewport.ctx.lineTo(-4, -2 - f * 14); viewport.ctx.lineTo(-13, -1 - f * 10); viewport.ctx.lineTo(-6, 1); viewport.ctx.closePath(); viewport.ctx.fill();
    viewport.ctx.fillStyle = '#3e454e';
    viewport.ctx.beginPath(); viewport.ctx.ellipse(0, 0, 11, 3.8, 0, 0, Math.PI * 2); viewport.ctx.fill();
    viewport.ctx.fillStyle = '#d9d9d0';
    viewport.ctx.beginPath(); viewport.ctx.ellipse(1, 1.8, 7, 1.8, 0, 0, Math.PI * 2); viewport.ctx.fill();
    viewport.ctx.fillStyle = '#3e454e';
    viewport.ctx.beginPath(); viewport.ctx.moveTo(-10, 0); viewport.ctx.lineTo(-19, -3); viewport.ctx.lineTo(-19, 3); viewport.ctx.fill();
    viewport.ctx.beginPath(); viewport.ctx.arc(10, -1, 3.4, 0, Math.PI * 2); viewport.ctx.fill();
    viewport.ctx.fillStyle = '#ff7a1a';
    viewport.ctx.beginPath(); viewport.ctx.arc(11, -1.6, 1.1, 0, Math.PI * 2); viewport.ctx.fill();
    viewport.ctx.fillStyle = '#e8c040';
    viewport.ctx.beginPath(); viewport.ctx.moveTo(13, -2); viewport.ctx.lineTo(16, 0); viewport.ctx.lineTo(13, 0.8); viewport.ctx.fill();
    viewport.ctx.restore();
  }

  // Hunters stand behind the grass; cats only show when they break cover (hidden ones just show ears and eyes)
  function drawHazardsBehind() {
    const gy = systems.flight.toScreenY(0);
    viewport.ctx.filter = OUTLINE;
    for (const h of session.state.hazards.hunters) {
      const x = systems.flight.toScreenX(h.x);
      if (x < -60 || x > viewport.W + 60) continue;
      drawHunter(x, gy, h, hazardScale());
    }
    viewport.ctx.filter = 'none';
  }

  function drawHazardsFront() {
    const hz = session.state.hazards, gy = systems.flight.toScreenY(0);
    for (const c of hz.cats) {
      const x = systems.flight.toScreenX(c.x);
      if (x < -40 || x > viewport.W + 40) continue;
      if (c.mode === 'hide') {
        // Eyes open now and then (more often while stalking); the rest of the time the cat is almost invisible
        c.ph ??= Math.random() * 100;
        const blink = Math.sin(session.state.time * 1.3 + c.ph) + 0.5 * Math.sin(session.state.time * 3.1 + c.ph * 2);
        const eyesOpen = blink > (c.stalk ? 0.4 : 1.1);
        if (gy > viewport.H + 4) continue;
        // Cat Sense: mark hidden cats nearby (tier 2 also draws the area it can leap into)
        const cs = systems.progression.tier('catsense');
        if (cs && Math.abs(c.x - session.bird.x) < CATSENSE.range[cs] && !session.state.over) {
          const pulse = 0.5 + 0.5 * Math.sin(session.state.time * 5 + c.ph);
          if (cs > 1) {
            viewport.ctx.strokeStyle = `rgba(255,70,50,${0.25 + 0.2 * pulse})`; viewport.ctx.lineWidth = 1.5; viewport.ctx.setLineDash([5, 5]);
            viewport.ctx.beginPath(); viewport.ctx.ellipse(x, gy, CAT_REACH * session.cam.zoom, CAT_ALT * session.cam.zoomY, 0, Math.PI, Math.PI * 2); viewport.ctx.stroke();
            viewport.ctx.setLineDash([]);
          }
          const mx = x + c.dir * 11 * hazardScale(), my = gy - 22;
          viewport.ctx.strokeStyle = `rgba(255,70,50,${0.5 + 0.4 * pulse})`; viewport.ctx.lineWidth = 2;
          viewport.ctx.beginPath(); viewport.ctx.arc(mx, gy - 6, 9 + 2 * pulse, 0, Math.PI * 2); viewport.ctx.stroke();
          viewport.ctx.fillStyle = `rgba(255,90,70,${0.6 + 0.4 * pulse})`;
          viewport.ctx.beginPath(); viewport.ctx.moveTo(mx - 5, my - 7); viewport.ctx.lineTo(mx + 5, my - 7); viewport.ctx.lineTo(mx, my); viewport.ctx.fill();
        }
        // Ear tips poke out of the grass; the eyes glint only when open
        const ex = x + c.dir * 11 * hazardScale(), ey = gy - 4 * hazardScale();
        viewport.ctx.save(); viewport.ctx.translate(ex, ey); viewport.ctx.scale(1.3 * systems.progression.spriteK(), 1.3 * systems.progression.spriteK());
        viewport.ctx.fillStyle = '#4a5a2a';
        viewport.ctx.beginPath();
        viewport.ctx.moveTo(-5, 1); viewport.ctx.lineTo(-3, -8); viewport.ctx.lineTo(-0.5, 0);
        viewport.ctx.moveTo(0.5, 0); viewport.ctx.lineTo(3.5, -8); viewport.ctx.lineTo(5.5, 1); viewport.ctx.fill();
        if (eyesOpen) {
          viewport.ctx.fillStyle = 'rgba(255,225,74,0.25)';
          viewport.ctx.beginPath(); viewport.ctx.arc(0.25, 1, 5, 0, Math.PI * 2); viewport.ctx.fill();
          viewport.ctx.fillStyle = '#ffe14a';
          viewport.ctx.beginPath(); viewport.ctx.arc(-2, 1, 1.4, 0, Math.PI * 2); viewport.ctx.moveTo(3.9, 1); viewport.ctx.arc(2.5, 1, 1.4, 0, Math.PI * 2); viewport.ctx.fill();
        }
        viewport.ctx.restore();
        continue;
      }
      viewport.ctx.filter = OUTLINE;
      drawCat(x, systems.flight.toScreenY(c.alt), c, hazardScale());
      viewport.ctx.filter = 'none';
      if (c.alertT > 0) systems.sprites.drawAlert(x, systems.flight.toScreenY(c.alt) - 30, '!', 1, 'sight');
    }
    for (const h of [...hz.hunters, ...session.state.rivals.filter(r => r.gun)]) {
      if (h.gone) continue;
      if (session.state.over && !(h.tracer > 0)) continue;
      const originAlt = systems.hazards.shotAltitude(h);
      const x = systems.flight.toScreenX(h.x), y = h.gun ? systems.flight.toScreenY(originAlt) : gy - 25 * hazardScale();
      // The shot line, extended well past the aim point
      const shotEnd = (n = h.gun ? HUNTER_RANGE : 600) => {
        const dx = h.ax - h.x, dy = h.aalt - originAlt, len = Math.hypot(dx, dy) || 1;
        return [systems.flight.toScreenX(h.x + dx / len * n), systems.flight.toScreenY(originAlt + dy / len * n)];
      };
      if (h.tracer > 0) {
        const [ex, ey] = shotEnd(h.tracerLen || (h.gun ? HUNTER_RANGE : 600));
        viewport.ctx.strokeStyle = `rgba(255,230,140,${h.tracer / 0.3})`; viewport.ctx.lineWidth = 3;
        viewport.ctx.beginPath(); viewport.ctx.moveTo(x, y); viewport.ctx.lineTo(ex, ey); viewport.ctx.stroke();
        continue;
      }
      if (h.aim > 0) {
        // About to fire: solid, pulsing laser line along the shot
        const [ex, ey] = shotEnd(), k = 1 - h.aim / HUNTER_AIM_T;
        viewport.ctx.strokeStyle = `rgba(255,30,20,${0.55 + 0.35 * Math.sin(session.state.time * 30)})`; viewport.ctx.lineWidth = 2 + 2 * k;
        viewport.ctx.beginPath(); viewport.ctx.moveTo(x, y); viewport.ctx.lineTo(ex, ey); viewport.ctx.stroke();
        const ax = systems.flight.toScreenX(h.ax), ay = systems.flight.toScreenY(h.aalt);
        viewport.ctx.lineWidth = 2;
        viewport.ctx.beginPath(); viewport.ctx.arc(ax, ay, 14 - 6 * k, 0, Math.PI * 2); viewport.ctx.stroke();
        continue;
      }
      if (!h.tracking || h.reload > 0) continue;
      // Sight line: faint while tracking, brighter as the lock builds
      viewport.ctx.strokeStyle = `rgba(255,40,30,${0.12 + 0.6 * h.lock})`; viewport.ctx.lineWidth = 1 + h.lock * 1.5;
      viewport.ctx.setLineDash([6, 6]);
      viewport.ctx.beginPath(); viewport.ctx.moveTo(x, y); viewport.ctx.lineTo(systems.flight.toScreenX(h.ax), systems.flight.toScreenY(h.aalt)); viewport.ctx.stroke();
      viewport.ctx.setLineDash([]);
      if (h.lock > 0.05) {
        const ax = systems.flight.toScreenX(h.ax), ay = systems.flight.toScreenY(h.aalt), r = 18 - h.lock * 8;
        viewport.ctx.strokeStyle = `rgba(255,40,30,${0.4 + 0.6 * h.lock})`; viewport.ctx.lineWidth = 2;
        viewport.ctx.beginPath(); viewport.ctx.arc(ax, ay, r, 0, Math.PI * 2);
        viewport.ctx.moveTo(ax - r - 5, ay); viewport.ctx.lineTo(ax - r + 4, ay); viewport.ctx.moveTo(ax + r - 4, ay); viewport.ctx.lineTo(ax + r + 5, ay);
        viewport.ctx.moveTo(ax, ay - r - 5); viewport.ctx.lineTo(ax, ay - r + 4); viewport.ctx.moveTo(ax, ay + r - 4); viewport.ctx.lineTo(ax, ay + r + 5);
        viewport.ctx.stroke();
      }
    }
    const h = hz.hawk;
    if (h) {
      const x = systems.flight.toScreenX(h.x), y = systems.flight.toScreenY(h.alt);
      viewport.ctx.filter = OUTLINE;
      if (x > -60 && x < viewport.W + 60 && y > -60 && y < viewport.H + 60) drawHawk(x, y, h, 1.7 * systems.progression.spriteK());
      viewport.ctx.filter = 'none';
      if (h.alertT > 0) systems.sprites.drawAlert(x, y - 26, '!', 1, 'sight');
    }
  }

  // Edge-of-screen marker for an off-screen goshawk, and a banner when something is about to get you
  function drawHazardWarnings() {
    if (session.state.over) return;
    const h = session.state.hazards.hawk;
    if (h && h.mode !== 'leave') {
      const x = systems.flight.toScreenX(h.x), y = systems.flight.toScreenY(h.alt);
      if (x < 0 || x > viewport.W || y < 0 || y > viewport.H) {
        const { x: bx, y: by } = systems.flight.birdAnchor();
        const dx = x - bx, dy = y - by, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
        let t = Infinity;
        if (ux > 0) t = Math.min(t, (viewport.W - 30 - bx) / ux);
        if (ux < 0) t = Math.min(t, (30 - bx) / ux);
        if (uy > 0) t = Math.min(t, (viewport.H - 30 - by) / uy);
        if (uy < 0) t = Math.min(t, (30 - by) / uy);
        const cx = bx + ux * t, cy = by + uy * t;
        viewport.ctx.fillStyle = h.mode === 'stoop' ? '#ff4433' : 'rgba(255,140,60,0.85)';
        viewport.ctx.beginPath(); viewport.ctx.arc(cx, cy, 14, 0, Math.PI * 2); viewport.ctx.fill();
        viewport.ctx.save(); viewport.ctx.translate(cx, cy); viewport.ctx.scale(0.8, 0.8);
        drawHawk(0, 0, { ...h, vx: 1, vy: 0, mode: 'stalk' }, 0.9);
        viewport.ctx.restore();
      }
    }
    let warn = null;
    const nearest = threats => threats.reduce((best, threat) => !best || Math.abs(threat.x - session.bird.x) < Math.abs(best.x - session.bird.x) ? threat : best, null);
    const cat = nearest(session.state.hazards.cats.filter(c => !c.gone && c.mode !== 'sit' && Math.abs(c.x - session.bird.x) < CAT_REACH * 1.4));
    if (systems.progression.tier('catsense') && !session.bird.inWater && session.bird.alt < CAT_ALT * 1.4 && cat) warn = { threat: cat, text: 'Cat nearby' };
    if (h && h.mode === 'stoop') warn = { threat: h, text: h.commit ? 'Goshawk striking!' : 'Goshawk stooping' };
    const hs = session.state.hazards.hunters;
    const tracking = nearest(hs.filter(x => !x.gone && x.tracking && x.reload <= 0 && x.lock > 0.35));
    const aiming = nearest(hs.filter(x => !x.gone && x.aim > 0));
    const buzzard = nearest(session.state.rivals.filter(r => !r.gone && r.gun && r.aim > 0));
    if (tracking) warn = { threat: tracking, text: 'Hunter tracking' };
    if (aiming) warn = { threat: aiming, text: 'Hunter aiming!' };
    if (buzzard) warn = { threat: buzzard, text: 'Buzzard aiming!' };
    if (!warn) return;
    viewport.ctx.font = 'bold 11px sans-serif'; viewport.ctx.textAlign = 'left';
    const tw = viewport.ctx.measureText(warn.text).width + 30;
    const tx = clamp(systems.flight.toScreenX(warn.threat.x), 12, viewport.W - 12);
    const ty = clamp(systems.flight.toScreenY(warn.threat.alt ?? 1.6), 12, viewport.H - 12);
    const x = clamp(tx - tw / 2, 8, viewport.W - tw - 8);
    const y = ty < 48 ? ty + 20 : ty - 36;
    viewport.ctx.strokeStyle = '#ff7766'; viewport.ctx.lineWidth = 1;
    viewport.ctx.beginPath(); viewport.ctx.moveTo(tx, ty);
    viewport.ctx.lineTo(clamp(tx, x + 8, x + tw - 8), ty < 48 ? y : y + 22); viewport.ctx.stroke();
    viewport.ctx.fillStyle = 'rgba(90,10,10,0.65)';
    viewport.ctx.fillRect(x, y, tw, 22);
    viewport.ctx.fillStyle = '#ff7766';
    viewport.ctx.beginPath(); viewport.ctx.arc(x + 11, y + 11, 7, 0, Math.PI * 2); viewport.ctx.fill();
    viewport.ctx.fillStyle = '#270707'; viewport.ctx.textAlign = 'center';
    viewport.ctx.fillText('!', x + 11, y + 15);
    viewport.ctx.textAlign = 'left';
    viewport.ctx.fillStyle = '#fff';
    viewport.ctx.fillText(warn.text, x + 24, y + 15);
  }

  // Storm darkening, rain and lightning; plus night and golden-hour tints over the world
  function drawAtmosphere() {
    const d = systems.world.daylight(), tw = systems.world.twilight(), s = session.state.storm;
    if (d < 1) { viewport.ctx.fillStyle = `rgba(8,12,35,${0.3 * (1 - d)})`; viewport.ctx.fillRect(0, 0, viewport.W, viewport.H); }
    if (tw > 0) { viewport.ctx.fillStyle = `rgba(255,140,60,${0.1 * tw})`; viewport.ctx.fillRect(0, 0, viewport.W, viewport.H); }
    if (s.k > 0.01) {
      viewport.ctx.fillStyle = `rgba(25,30,45,${0.4 * s.k})`;
      viewport.ctx.fillRect(0, 0, viewport.W, viewport.H);
      const slant = systems.world.windX(session.bird.alt) / 25;
      viewport.ctx.strokeStyle = `rgba(200,210,230,${0.45 * s.k})`; viewport.ctx.lineWidth = 1;
      viewport.ctx.beginPath();
      for (let i = 0; i < Math.round(260 * s.k); i++) {
        const y = (hash(i * 1.3) * viewport.H + session.state.time * 900) % viewport.H;
        const x = ((hash(i * 2.9) * viewport.W + y * slant) % viewport.W + viewport.W) % viewport.W;
        viewport.ctx.moveTo(x, y); viewport.ctx.lineTo(x + slant * 14, y + 14);
      }
      viewport.ctx.stroke();
    }
    if (s.flash > 0) { viewport.ctx.fillStyle = `rgba(255,255,255,${s.flash * 4})`; viewport.ctx.fillRect(0, 0, viewport.W, viewport.H); }
  }

  function drawCrashSmoke() {
    if (!session.state.crash) return;
    viewport.ctx.save();
    for (const puff of session.state.crash.smoke) {
      const age = puff.maxLife - puff.life;
      viewport.ctx.globalAlpha = Math.min(1, age / 0.12) * Math.max(0, puff.life / puff.maxLife) * 0.65;
      viewport.ctx.fillStyle = '#aaa49b';
      viewport.ctx.beginPath();
      viewport.ctx.ellipse(systems.flight.toScreenX(puff.x), systems.flight.toScreenY(puff.alt), puff.radius * session.cam.zoom, puff.radius * session.cam.zoomY, 0, 0, Math.PI * 2);
      viewport.ctx.fill();
    }
    viewport.ctx.restore();
  }

  // ---------- Grotto drawing ----------
  function drawGrottoScene() {
    const g = session.state.grotto, o = g.octo, z = session.cam.zoom;
    const sx = systems.flight.toScreenX, sy = systems.flight.toScreenY;
    const bg = viewport.ctx.createLinearGradient(0, sy(GROTTO_H), 0, sy(0));
    bg.addColorStop(0, '#0b2a36'); bg.addColorStop(1, '#06161e');
    viewport.ctx.fillStyle = bg; viewport.ctx.fillRect(-20, -20, viewport.W + 40, viewport.H + 40);
    // Daylight leaking in from the lake behind the entrance
    const ex = sx(0), lg = viewport.ctx.createRadialGradient(ex, sy(GROTTO_H / 2), 10, ex, sy(GROTTO_H / 2), 40 * z);
    lg.addColorStop(0, 'rgba(120,200,220,0.45)'); lg.addColorStop(1, 'rgba(120,200,220,0)');
    viewport.ctx.fillStyle = lg; viewport.ctx.fillRect(-20, -20, viewport.W + 40, viewport.H + 40);
    // Back-wall rock texture
    viewport.ctx.fillStyle = 'rgba(30,60,70,0.35)';
    for (let k = 0; k < 40; k++) {
      const x = systems.world.wh(k * 1.3 + 2) * GROTTO_L, a = 1 + systems.world.wh(k * 2.1 + 3) * (GROTTO_H - 2), r = 0.6 + systems.world.wh(k * 3.7 + 1) * 1.6;
      viewport.ctx.beginPath(); viewport.ctx.ellipse(sx(x), sy(a), r * z, r * 0.7 * z, 0, 0, Math.PI * 2); viewport.ctx.fill();
    }
    // Bumpy floor and ceiling, and the far wall
    const x0 = session.cam.x - viewport.W / 2 / z - 4, x1 = session.cam.x + viewport.W / 2 / z + 4;
    for (const [base, dir, col] of [[0, -1, '#1d2a2c'], [GROTTO_H, 1, '#162123']]) {
      viewport.ctx.fillStyle = col; viewport.ctx.beginPath();
      viewport.ctx.moveTo(sx(x0), dir < 0 ? viewport.H + 20 : -20);
      for (let x = Math.floor(x0); x <= x1; x += 1.5) {
        const ripple = 0.25 + 0.35 * systems.world.wh(Math.floor(x / 1.5) * 1.7 + base + g.lake.x0);
        const alcove = 1.4 * (1 + Math.sin(x * 0.09 + base + g.lake.x0)) / 2;
        viewport.ctx.lineTo(sx(x), sy(base - dir * (ripple - alcove)));
      }
      viewport.ctx.lineTo(sx(x1), dir < 0 ? viewport.H + 20 : -20); viewport.ctx.closePath(); viewport.ctx.fill();
    }
    const wall = [];
    for (let alt = -3; alt <= GROTTO_H + 3; alt += 1) {
      wall.push([sx(GROTTO_L + 0.8 * systems.world.wh(alt * 3.1 + g.lake.x0)), sy(alt)]);
    }
    viewport.ctx.fillStyle = '#263b3d'; viewport.ctx.beginPath();
    viewport.ctx.moveTo(viewport.W + 20, wall[0][1]);
    for (const [x, y] of wall) viewport.ctx.lineTo(x, y);
    viewport.ctx.lineTo(viewport.W + 20, wall[wall.length - 1][1]); viewport.ctx.closePath(); viewport.ctx.fill();
    viewport.ctx.strokeStyle = '#648084'; viewport.ctx.lineWidth = Math.max(2, z * 0.3);
    viewport.ctx.beginPath();
    wall.forEach(([x, y], i) => { if (i) viewport.ctx.lineTo(x, y); else viewport.ctx.moveTo(x, y); });
    viewport.ctx.stroke();
    viewport.ctx.strokeStyle = '#111e21'; viewport.ctx.lineWidth = Math.max(1, z * 0.15);
    for (let alt = 1; alt < GROTTO_H; alt += 3) {
      viewport.ctx.beginPath(); viewport.ctx.moveTo(sx(GROTTO_L + 0.8), sy(alt));
      viewport.ctx.lineTo(sx(GROTTO_L + 2.5), sy(alt + 0.5));
      viewport.ctx.lineTo(sx(GROTTO_L + 4), sy(alt - 0.3)); viewport.ctx.stroke();
    }
    // Bubble vents: a dark crack in the floor with a column of air bubbles (refills breath)
    for (const vx of GROTTO_VENTS) {
      viewport.ctx.fillStyle = '#05090a';
      viewport.ctx.beginPath(); viewport.ctx.ellipse(sx(vx), sy(0.2), VENT_R * 0.6 * z, 0.35 * z, 0, 0, Math.PI * 2); viewport.ctx.fill();
      const cg = viewport.ctx.createLinearGradient(0, sy(0), 0, sy(GROTTO_H));
      cg.addColorStop(0, 'rgba(180,240,255,0.18)'); cg.addColorStop(1, 'rgba(180,240,255,0)');
      viewport.ctx.fillStyle = cg; viewport.ctx.fillRect(sx(vx - VENT_R), sy(GROTTO_H), VENT_R * 2 * z, sy(0) - sy(GROTTO_H));
    }
    viewport.ctx.strokeStyle = 'rgba(210,245,255,0.7)'; viewport.ctx.lineWidth = 1;
    for (const b of g.bubbles) { viewport.ctx.beginPath(); viewport.ctx.arc(sx(b.x), sy(b.alt), Math.max(1.5, b.r * z), 0, Math.PI * 2); viewport.ctx.stroke(); }

    // Octopus
    if (o.hp > 0 || o.hurtT > -1) {
      const fade = o.hp > 0 ? 1 : clamp(1 + o.hurtT, 0, 1);
      viewport.ctx.globalAlpha = fade;
      const body = o.hurtT > 0 ? '#ff8a80' : o.hp <= OCTO_HP / 2 ? '#b0413e' : '#8e3b6e';
      o.tents.forEach((tn, k) => {
        const an = systems.water.tentAnchor(o, k), tip = systems.water.tentTip(o, tn, k);
        if (tn.mode === 'wind' && o.hp > 0) {
          // Telegraph: where it's about to lash
          const p = 1 - tn.t / tn.wind;
          viewport.ctx.strokeStyle = `rgba(255,60,40,${0.25 + 0.6 * p})`; viewport.ctx.lineWidth = 1.5 + 2 * p; viewport.ctx.setLineDash([8, 6]);
          viewport.ctx.beginPath(); viewport.ctx.moveTo(sx(an.x), sy(an.alt)); viewport.ctx.lineTo(sx(an.x + tn.ux * OCTO_REACH), sy(an.alt + tn.uy * OCTO_REACH)); viewport.ctx.stroke();
          viewport.ctx.setLineDash([]);
        }
        const mx = (an.x + tip.x) / 2 + Math.sin(g.t * 2 + tn.ph) * 1.2, ma = (an.alt + tip.alt) / 2 + Math.cos(g.t * 2 + tn.ph) * 1.2;
        viewport.ctx.strokeStyle = body; viewport.ctx.lineCap = 'round';
        viewport.ctx.lineWidth = Math.max(3, 0.9 * z);
        viewport.ctx.beginPath(); viewport.ctx.moveTo(sx(an.x), sy(an.alt)); viewport.ctx.quadraticCurveTo(sx(mx), sy(ma), sx(tip.x), sy(tip.alt)); viewport.ctx.stroke();
        viewport.ctx.lineWidth = Math.max(1.5, 0.4 * z);
        viewport.ctx.beginPath(); viewport.ctx.moveTo(sx(mx), sy(ma)); viewport.ctx.lineTo(sx(tip.x), sy(tip.alt)); viewport.ctx.stroke();
        if (tn.stun > 0) { viewport.ctx.fillStyle = '#ffe680'; viewport.ctx.beginPath(); viewport.ctx.arc(sx(tip.x), sy(tip.alt), 3, 0, Math.PI * 2); viewport.ctx.fill(); }
      });
      viewport.ctx.lineCap = 'butt';
      // Mantle and head
      const hx = sx(o.x), hy = sy(o.alt), r = OCTO_HEAD_R * z, puls = 1 + 0.05 * Math.sin(g.t * 3);
      viewport.ctx.fillStyle = body;
      viewport.ctx.beginPath(); viewport.ctx.ellipse(hx + 0.6 * z, hy - r * 0.55, r * 1.05 * puls, r * 1.35 * puls, -0.25, 0, Math.PI * 2); viewport.ctx.fill();
      viewport.ctx.beginPath(); viewport.ctx.ellipse(hx, hy, r, r * 0.8, 0, 0, Math.PI * 2); viewport.ctx.fill();
      viewport.ctx.fillStyle = 'rgba(255,255,255,0.12)';
      viewport.ctx.beginPath(); viewport.ctx.ellipse(hx + 0.2 * z, hy - r * 1.1, r * 0.4, r * 0.6, -0.3, 0, Math.PI * 2); viewport.ctx.fill();
      // Eyes, tracking you
      const la = Math.atan2(-(session.bird.alt - o.alt), session.bird.x - o.x);
      for (const ox of [-0.9, 0.9]) {
        const ex2 = hx + ox * z - 0.6 * z, ey = hy - 0.2 * z;
        viewport.ctx.fillStyle = o.frozenT > 0 ? '#bfe7ff' : '#ffe14d';
        viewport.ctx.beginPath(); viewport.ctx.ellipse(ex2, ey, 0.55 * z, 0.45 * z, 0, 0, Math.PI * 2); viewport.ctx.fill();
        viewport.ctx.fillStyle = '#111';
        viewport.ctx.fillRect(ex2 + Math.cos(la) * 0.2 * z - 0.35 * z, ey + Math.sin(la) * 0.15 * z - 0.08 * z, 0.7 * z, 0.16 * z);
      }
      viewport.ctx.globalAlpha = 1;
    }
    // Ink clouds
    for (const k of g.inks) {
      const a = Math.min(1, k.t * 2) * Math.min(1, (k.life - k.t) / 1.5) * 0.85;
      const ig = viewport.ctx.createRadialGradient(sx(k.x), sy(k.alt), 0, sx(k.x), sy(k.alt), k.r * z);
      ig.addColorStop(0, `rgba(5,5,12,${a})`); ig.addColorStop(1, 'rgba(5,5,12,0)');
      viewport.ctx.fillStyle = ig; viewport.ctx.beginPath(); viewport.ctx.arc(sx(k.x), sy(k.alt), k.r * z, 0, Math.PI * 2); viewport.ctx.fill();
    }

    drawGunStuff();
    drawSoundRings();
    viewport.ctx.fillStyle = '#9fd';
    for (const p of session.particles) viewport.ctx.fillRect(sx(p.x), sy(p.alt), 3, 3);
    drawCrashSmoke();
    drawFeatherFx();
    if (!session.state.over) { drawBird(); drawBreath(sx(session.bird.x), sy(session.bird.alt) - 26); }
    viewport.ctx.fillStyle = 'rgba(30,90,120,0.18)'; viewport.ctx.fillRect(-20, -20, viewport.W + 40, viewport.H + 40);

    // Boss bar
    if (o.hp > 0) {
      const bw = Math.min(360, viewport.W * 0.5), bx = (viewport.W - bw) / 2, by = 70;
      viewport.ctx.fillStyle = 'rgba(0,0,0,0.55)'; viewport.ctx.fillRect(bx - 4, by - 4, bw + 8, 22);
      viewport.ctx.fillStyle = '#b0413e'; viewport.ctx.fillRect(bx, by, bw * o.hp / OCTO_HP, 14);
      viewport.ctx.fillStyle = '#fff'; viewport.ctx.font = 'bold 12px sans-serif'; viewport.ctx.textAlign = 'center';
      viewport.ctx.fillText(`OCTOPUS  ${o.hp}/${OCTO_HP}  ·  $${HAZARD_BOUNTY.octopus}`, viewport.W / 2, by + 11);
    }
  }

  function draw() {
    session.uiButtons = [];
    viewport.ctx.save();
    if (!session.state.over && !session.paused && session.cam.shake > 0) {
      viewport.ctx.translate((Math.random() - 0.5) * session.cam.shake, (Math.random() - 0.5) * session.cam.shake);
    }
    if (session.state.grotto) {
      drawGrottoScene();
      viewport.ctx.restore();
    } else if (session.state.moonshot) {
      drawMoonshotScene();
      viewport.ctx.restore();
    } else {
      drawWorldScene();
      viewport.ctx.restore();
      drawAtmosphere();
      // Whiteout while flying through a cloud
      if (session.state.fog > 0.01) {
        viewport.ctx.fillStyle = `rgba(236,241,247,${0.7 * session.state.fog})`;
        viewport.ctx.fillRect(0, 0, viewport.W, viewport.H);
      }
    }
    if (session.timeScale < 0.98) {
      const v = viewport.ctx.createRadialGradient(viewport.W / 2, viewport.H / 2, Math.min(viewport.W, viewport.H) * 0.35, viewport.W / 2, viewport.H / 2, Math.max(viewport.W, viewport.H) * 0.75);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, `rgba(0,10,30,${(1 - session.timeScale) * 0.9})`);
      viewport.ctx.fillStyle = v;
      viewport.ctx.fillRect(0, 0, viewport.W, viewport.H);
    }
    if (session.state.crash && session.state.crash.t >= CRASH_REVEAL_DELAY) {
      viewport.ctx.fillStyle = `rgba(0,0,0,${Math.min(1, (session.state.crash.t - CRASH_REVEAL_DELAY) / 0.5) * 0.35})`;
      viewport.ctx.fillRect(0, 0, viewport.W, viewport.H);
    }
    const worldCtx = viewport.ctx, hudCtx = viewport.overlayCtx;
    hudCtx.setTransform(1, 0, 0, 1, 0, 0);
    hudCtx.globalAlpha = 1;
    hudCtx.globalCompositeOperation = 'source-over';
    hudCtx.filter = 'none';
    hudCtx.setLineDash([]);
    hudCtx.clearRect(0, 0, viewport.W, viewport.H);
    textCallCount = 0;
    if (viewport.resolutionScale < 1) {
      worldCtx.fillText = function (...args) { recordText(this, 'fillText', args); };
      worldCtx.strokeText = function (...args) { recordText(this, 'strokeText', args); };
    }
    try {
      if (session.screen === 'hunt' && !session.state.grotto && !session.state.moonshot) {
        systems.hud.drawPreyIndicators();
        systems.hud.drawClosingHint();
        drawBirdLens();
        drawSunIndicator();
      }
      if (session.screen === 'hunt') {
        systems.hud.drawHUD();
        if (!session.state.grotto && !session.state.moonshot) drawHazardWarnings();
        if (session.paused) systems.hud.drawPausePanel();
        if (!session.state.over) systems.hud.drawPauseButton();
      } else if (session.screen === 'recap') {
        systems.screens.drawRecap();
      } else {
        systems.screens.drawShop();
      }
    } finally {
      if (viewport.resolutionScale < 1) {
        delete worldCtx.fillText;
        delete worldCtx.strokeText;
      }
    }
    if (viewport.resolutionScale < 1) drawTextOverlay();
  }

  // The flight to the moon (screen space): the sky drains to black, the Earth drops away and the moon swells
  // overhead; once landed, the falcon stands on the surface with the Earth hanging in the sky
  function drawMoonshotScene() {
    const m = session.state.moonshot;
    const p = m.landed ? 1 : clamp(m.t / MOONSHOT_T, 0, 1);
    const dark = Math.sqrt(p);
    const sky = viewport.ctx.createLinearGradient(0, 0, 0, viewport.H);
    sky.addColorStop(0, rgb(mixRGB([40, 100, 180], [2, 3, 10], dark)));
    sky.addColorStop(1, rgb(mixRGB([191, 227, 255], [8, 10, 24], dark)));
    viewport.ctx.fillStyle = sky; viewport.ctx.fillRect(0, 0, viewport.W, viewport.H);
    // Stars streak past during the climb, then hold still
    const streak = m.landed ? 0 : Math.min(60, m.v / 12);
    viewport.ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.9, dark * 1.2)})`; viewport.ctx.lineWidth = 1.2;
    viewport.ctx.beginPath();
    for (let i = 0; i < 160; i++) {
      const sx = hash(i * 1.7) * viewport.W;
      const sy = m.landed ? hash(i * 2.9) * viewport.H * 0.7 : ((hash(i * 2.9) * viewport.H + m.t * m.v * 0.6 * (0.5 + hash(i * 4.1))) % viewport.H);
      viewport.ctx.moveTo(sx, sy); viewport.ctx.lineTo(sx, sy - 1 - streak * hash(i * 5.3));
    }
    viewport.ctx.stroke();
    const moonDisc = (cx, cy, r) => {
      const g = viewport.ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
      g.addColorStop(0, '#f4f2ea'); g.addColorStop(1, '#b9b6ad');
      viewport.ctx.fillStyle = g; viewport.ctx.beginPath(); viewport.ctx.arc(cx, cy, r, 0, Math.PI * 2); viewport.ctx.fill();
      viewport.ctx.fillStyle = 'rgba(120,118,110,0.35)';
      for (let i = 0; i < 14; i++) {
        const a = hash(i * 7.1) * Math.PI * 2, d = Math.sqrt(hash(i * 3.3)) * r * 0.8, cr = r * (0.04 + 0.1 * hash(i * 9.7));
        viewport.ctx.beginPath(); viewport.ctx.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, cr, cr * 0.8, 0, 0, Math.PI * 2); viewport.ctx.fill();
      }
    };
    if (!m.landed) {
      // The Earth sinks below the screen
      const er = viewport.W * 2, ey = viewport.H * 0.85 + er + Math.pow(p, 0.6) * viewport.H * 0.9;
      viewport.ctx.fillStyle = '#2f6fb3'; viewport.ctx.beginPath(); viewport.ctx.arc(viewport.W / 2, ey, er, 0, Math.PI * 2); viewport.ctx.fill();
      viewport.ctx.fillStyle = '#4f8f45'; viewport.ctx.beginPath(); viewport.ctx.ellipse(viewport.W * 0.3, ey - er + 30, viewport.W * 0.25, 40, 0, 0, Math.PI * 2); viewport.ctx.fill();
      viewport.ctx.strokeStyle = 'rgba(160,210,255,0.6)'; viewport.ctx.lineWidth = 8; viewport.ctx.beginPath(); viewport.ctx.arc(viewport.W / 2, ey, er + 4, 0, Math.PI * 2); viewport.ctx.stroke();
      // The moon grows overhead until it fills the view
      const k = Math.pow(p, 2.5);
      moonDisc(viewport.W / 2, viewport.H * 0.14 - k * viewport.H * 0.2, 14 + k * viewport.H * 1.2);
      // The falcon: a spinning buzzsaw with a contrail
      const bx = viewport.W / 2, by = viewport.H * 0.62;
      const trail = viewport.ctx.createLinearGradient(0, by, 0, viewport.H);
      trail.addColorStop(0, 'rgba(255,240,200,0.8)'); trail.addColorStop(1, 'rgba(255,240,200,0)');
      viewport.ctx.fillStyle = trail; viewport.ctx.fillRect(bx - 6, by, 12, viewport.H - by);
      drawBirdSprite(bx, by, session.bird.spinA, 1.6);
      viewport.ctx.strokeStyle = 'rgba(255,240,200,0.8)'; viewport.ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const a = session.bird.spinA + i * Math.PI * 2 / 3;
        viewport.ctx.beginPath(); viewport.ctx.arc(bx, by, 30, a, a + 1.2); viewport.ctx.stroke();
      }
      viewport.ctx.textAlign = 'center'; viewport.ctx.fillStyle = '#fff'; viewport.ctx.font = 'bold 16px monospace';
      viewport.ctx.fillText(`${Math.round(m.v * 3.6).toLocaleString()} km/h  ·  ${Math.round(session.bird.alt).toLocaleString()} m`, viewport.W / 2, viewport.H - 30);
    } else {
      // Landed: the Earth hangs in the black sky over a grey horizon
      viewport.ctx.fillStyle = '#2f6fb3'; viewport.ctx.beginPath(); viewport.ctx.arc(viewport.W * 0.78, viewport.H * 0.2, 38, 0, Math.PI * 2); viewport.ctx.fill();
      viewport.ctx.fillStyle = '#4f8f45'; viewport.ctx.beginPath(); viewport.ctx.ellipse(viewport.W * 0.78 - 10, viewport.H * 0.2 - 6, 16, 10, 0.4, 0, Math.PI * 2); viewport.ctx.fill();
      viewport.ctx.fillStyle = 'rgba(2,3,10,0.55)'; viewport.ctx.beginPath(); viewport.ctx.arc(viewport.W * 0.78 + 14, viewport.H * 0.2, 36, -Math.PI / 2, Math.PI / 2); viewport.ctx.fill();
      const gr = viewport.W * 2.5;
      moonDisc(viewport.W / 2, viewport.H * 0.72 + gr, gr);
      const gy = viewport.H * 0.72 + 2;
      // The flag
      viewport.ctx.strokeStyle = '#ddd'; viewport.ctx.lineWidth = 3;
      viewport.ctx.beginPath(); viewport.ctx.moveTo(viewport.W / 2 + 50, gy); viewport.ctx.lineTo(viewport.W / 2 + 50, gy - 90); viewport.ctx.stroke();
      viewport.ctx.fillStyle = '#ffd34d'; viewport.ctx.fillRect(viewport.W / 2 + 51, gy - 90, 54, 32);
      viewport.ctx.fillStyle = '#5a3a1a'; viewport.ctx.font = 'bold 18px sans-serif'; viewport.ctx.textAlign = 'center';
      viewport.ctx.fillText('🦅', viewport.W / 2 + 78, gy - 67);
      drawBirdSprite(viewport.W / 2 - 10, gy - 14, 0, 1.8);
      viewport.ctx.globalAlpha = clamp(m.t, 0, 1);
      viewport.ctx.fillStyle = '#ffd34d'; viewport.ctx.font = 'bold 40px sans-serif';
      viewport.ctx.fillText('You reached the moon!', viewport.W / 2, viewport.H * 0.32);
      viewport.ctx.fillStyle = '#cfe6f7'; viewport.ctx.font = '16px sans-serif';
      viewport.ctx.fillText(`Day ${session.state.day}  ·  one small stoop for a falcon`, viewport.W / 2, viewport.H * 0.32 + 32);
      viewport.ctx.globalAlpha = 1;
      // White flash on arrival
      if (m.t < 0.6) { viewport.ctx.fillStyle = `rgba(255,255,255,${1 - m.t / 0.6})`; viewport.ctx.fillRect(0, 0, viewport.W, viewport.H); }
    }
  }

  function drawWorldScene() {
    drawBackground();
    drawSatelliteWorld();
    drawThermals();
    drawDetectionZones();
    session.prey.forEach(systems.sprites.drawPrey);
    drawHazardsBehind();
    drawGrass();
    drawHazardsFront();
    drawFallers();
    drawRivals();
    drawSoundRings();
    viewport.ctx.fillStyle = '#ccc';
    for (const p of session.particles) viewport.ctx.fillRect(systems.flight.toScreenX(p.x), systems.flight.toScreenY(p.alt), 3, 3);
    drawCrashSmoke();
    drawEyases();
    drawFeatherFx();
    if (!session.state.over) drawBird();
    if (session.bird.inWater) {
      // Water over the submerged bird
      const l = session.bird.inWater, gy = systems.flight.toScreenY(0);
      viewport.ctx.fillStyle = 'rgba(40,90,140,0.35)';
      viewport.ctx.fillRect(systems.flight.toScreenX(l.x0), gy, systems.flight.toScreenX(l.x0 + l.w) - systems.flight.toScreenX(l.x0), systems.flight.toScreenY(-l.depth) - gy);
      if (!session.state.over) drawBreath(systems.flight.toScreenX(session.bird.x), systems.flight.toScreenY(session.bird.alt) - 26);
    }
  }
  return { draw, drawBuzzard, drawCat, drawHawk, drawHunter, drawLens, drawPreySenseIndicators, drawRifle, drawSatellite, gunStyle, niceStep, };
}
