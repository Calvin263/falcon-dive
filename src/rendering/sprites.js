import { createCache } from '../core/cache.js';
import { SPECIES, OUTLINE, ANIM_STEPS, ANIM_PERIOD } from '../config.js';

export function createSprites({ session, viewport, systems }) {
  function drawLeporid(x, y, p, s, body, earH) {
    const hop = Math.abs(Math.sin(p.hopT * 6)) * 4;
    viewport.ctx.save();
    viewport.ctx.translate(x, y);
    viewport.ctx.scale(systems.prey.facing(p) * s, s);
    viewport.ctx.translate(0, -hop);
    viewport.ctx.fillStyle = body;
    viewport.ctx.beginPath(); viewport.ctx.ellipse(0, -5, 8, 5, 0, 0, Math.PI * 2); viewport.ctx.fill();
    viewport.ctx.beginPath(); viewport.ctx.ellipse(7, -9, 4, 3.5, 0, 0, Math.PI * 2); viewport.ctx.fill();
    viewport.ctx.fillRect(6, -10 - earH, 2, earH);
    viewport.ctx.fillStyle = '#fff';
    viewport.ctx.beginPath(); viewport.ctx.arc(-8, -5, 2.5, 0, Math.PI * 2); viewport.ctx.fill();
    viewport.ctx.restore();
  }

  function drawMouse(x, y, p, s) {
    const bob = p.moving ? Math.abs(Math.sin(p.hopT * 18)) * 0.8 : 0;
    viewport.ctx.save();
    viewport.ctx.translate(x, y - bob);
    viewport.ctx.scale(systems.prey.facing(p) * s, s);
    viewport.ctx.strokeStyle = '#8a7f78'; viewport.ctx.lineWidth = 1;
    viewport.ctx.beginPath(); viewport.ctx.moveTo(-5, -2); viewport.ctx.quadraticCurveTo(-9, -4, -12, -1); viewport.ctx.stroke();
    viewport.ctx.fillStyle = '#8a8580';
    viewport.ctx.beginPath(); viewport.ctx.ellipse(0, -2.5, 5, 2.5, 0, 0, Math.PI * 2); viewport.ctx.fill();
    viewport.ctx.beginPath(); viewport.ctx.ellipse(5, -3, 2.6, 2, 0, 0, Math.PI * 2); viewport.ctx.fill();
    viewport.ctx.fillStyle = '#c9a9a0';
    viewport.ctx.beginPath(); viewport.ctx.arc(4, -5.2, 1.5, 0, Math.PI * 2); viewport.ctx.fill();
    viewport.ctx.restore();
  }

  function drawSquirrel(x, y, p, s) {
    const hop = Math.abs(Math.sin(p.hopT * 8)) * 3;
    viewport.ctx.save();
    viewport.ctx.translate(x, y - hop);
    viewport.ctx.scale(systems.prey.facing(p) * s, s);
    viewport.ctx.fillStyle = '#b5653a';
    viewport.ctx.beginPath(); viewport.ctx.ellipse(-7, -11, 4, 7.5, -0.4, 0, Math.PI * 2); viewport.ctx.fill();
    viewport.ctx.fillStyle = '#9a5530';
    viewport.ctx.beginPath(); viewport.ctx.ellipse(0, -5, 6, 4, 0, 0, Math.PI * 2); viewport.ctx.fill();
    viewport.ctx.beginPath(); viewport.ctx.ellipse(6, -8, 3.2, 3, 0, 0, Math.PI * 2); viewport.ctx.fill();
    viewport.ctx.beginPath(); viewport.ctx.moveTo(5, -10); viewport.ctx.lineTo(6, -13.5); viewport.ctx.lineTo(7.5, -10.5); viewport.ctx.fill();
    viewport.ctx.restore();
  }

  function drawTurtle(x, y, p, s, rot = 0) {
    const step = Math.sin((p.hopT || 0) * 6);
    viewport.ctx.save();
    viewport.ctx.translate(x, y);
    viewport.ctx.rotate(rot);
    viewport.ctx.scale(systems.prey.facing(p) * s, s);
    viewport.ctx.fillStyle = '#7a9a3a';
    viewport.ctx.fillRect(-6 + step, -3, 3, 3); viewport.ctx.fillRect(3 - step, -3, 3, 3);
    viewport.ctx.beginPath(); viewport.ctx.arc(9, -4, 2.5, 0, Math.PI * 2); viewport.ctx.fill();
    viewport.ctx.fillStyle = '#4e6b2f';
    viewport.ctx.beginPath(); viewport.ctx.ellipse(0, -3, 8.5, 6, 0, Math.PI, 0); viewport.ctx.fill();
    viewport.ctx.strokeStyle = '#7f9c4a'; viewport.ctx.lineWidth = 1;
    viewport.ctx.beginPath(); viewport.ctx.moveTo(-4, -3); viewport.ctx.lineTo(-2, -7); viewport.ctx.lineTo(2, -7); viewport.ctx.lineTo(4, -3); viewport.ctx.stroke();
    viewport.ctx.restore();
  }

  function drawPigeon(x, y, p, s, duck = false) {
    const f = Math.sin(p.flapT || 0);
    viewport.ctx.save();
    viewport.ctx.translate(x, y);
    viewport.ctx.scale(systems.prey.facing(p) * s, s);
    viewport.ctx.fillStyle = duck ? '#7a5a3a' : '#8d97a5';
    viewport.ctx.beginPath(); viewport.ctx.moveTo(-7, 0); viewport.ctx.lineTo(-13, -2); viewport.ctx.lineTo(-13, 2); viewport.ctx.fill();
    viewport.ctx.beginPath(); viewport.ctx.ellipse(0, 0, duck ? 9 : 8, duck ? 4.5 : 4, 0, 0, Math.PI * 2); viewport.ctx.fill();
    viewport.ctx.fillStyle = duck ? '#2e6b3a' : '#6e7886';
    viewport.ctx.beginPath(); viewport.ctx.arc(duck ? 9 : 8, -2, 3, 0, Math.PI * 2); viewport.ctx.fill();
    viewport.ctx.fillStyle = duck ? '#e0a030' : '#444';
    const bx = duck ? 11.5 : 10.5;
    viewport.ctx.beginPath(); viewport.ctx.moveTo(bx, -2.5); viewport.ctx.lineTo(bx + (duck ? 3.5 : 2.5), -1.5); viewport.ctx.lineTo(bx, -0.5); viewport.ctx.fill();
    viewport.ctx.fillStyle = duck ? '#5a4630' : '#737d8b';
    viewport.ctx.beginPath(); viewport.ctx.moveTo(4, -1); viewport.ctx.lineTo(-3, -1 - f * 10); viewport.ctx.lineTo(-6, -1); viewport.ctx.closePath(); viewport.ctx.fill();
    viewport.ctx.restore();
  }

  function drawSwift(x, y, p, s) {
    const w = 0.55 + 0.45 * Math.sin(p.flapT || 0);
    viewport.ctx.save();
    viewport.ctx.translate(x, y);
    viewport.ctx.scale(systems.prey.facing(p) * s, s);
    viewport.ctx.fillStyle = '#2a2a30';
    viewport.ctx.beginPath(); viewport.ctx.ellipse(0, 0, 6, 2, 0, 0, Math.PI * 2); viewport.ctx.fill();
    viewport.ctx.beginPath(); viewport.ctx.moveTo(-5, 0); viewport.ctx.lineTo(-11, -2.5); viewport.ctx.lineTo(-8.5, 0); viewport.ctx.lineTo(-11, 2.5); viewport.ctx.fill();
    for (const sgn of [-1, 1]) {
      viewport.ctx.beginPath(); viewport.ctx.moveTo(2, 0);
      viewport.ctx.quadraticCurveTo(-2, sgn * 7 * w, -10, sgn * 9 * w);
      viewport.ctx.quadraticCurveTo(-3, sgn * 3 * w, -1, 0);
      viewport.ctx.fill();
    }
    viewport.ctx.restore();
  }

  function drawStarling(x, y, flap, s, dir) {
    viewport.ctx.save();
    viewport.ctx.translate(x, y);
    viewport.ctx.scale(dir < 0 ? -s : s, s);
    viewport.ctx.fillStyle = '#26262c';
    viewport.ctx.beginPath(); viewport.ctx.ellipse(0, 0, 3.2, 1.6, 0, 0, Math.PI * 2); viewport.ctx.fill();
    viewport.ctx.beginPath(); viewport.ctx.moveTo(1, 0); viewport.ctx.lineTo(-2, -4 * Math.sin(flap)); viewport.ctx.lineTo(-3, 0); viewport.ctx.fill();
    viewport.ctx.restore();
  }

  // y is the ground line for ground species, the body centre for flying ones
  function drawFish(x, y, f, s) {
    const pike = f.kind === 'pike', L = pike ? 11 : 7, Hh = pike ? 2 : 2.4;
    const wag = Math.sin((f.ph || 0) * (f.fleeT > 0 ? 18 : 6)) * 0.35;
    viewport.ctx.save();
    viewport.ctx.translate(x, y);
    viewport.ctx.scale((f.vx < 0 ? -1 : 1) * s, s);
    viewport.ctx.fillStyle = pike ? '#5d6b3a' : '#8a9a8c';
    viewport.ctx.beginPath(); viewport.ctx.moveTo(-L + 1, 0); viewport.ctx.lineTo(-L - 4, -3 + wag * 4); viewport.ctx.lineTo(-L - 4, 3 + wag * 4); viewport.ctx.fill();
    viewport.ctx.beginPath(); viewport.ctx.ellipse(0, 0, L, Hh, 0, 0, Math.PI * 2); viewport.ctx.fill();
    viewport.ctx.fillStyle = pike ? '#c9c79a' : '#e0b0b0';
    viewport.ctx.beginPath(); viewport.ctx.ellipse(0, Hh * 0.45, L * 0.75, Hh * 0.35, 0, 0, Math.PI * 2); viewport.ctx.fill();
    viewport.ctx.fillStyle = pike ? 'rgba(220,220,150,0.7)' : 'rgba(40,40,40,0.6)';
    for (let i = 0; i < 4; i++) viewport.ctx.fillRect(-L * 0.6 + i * L * 0.35, -Hh * 0.6, pike ? 1 : 0.8, pike ? Hh : 0.8);
    viewport.ctx.fillStyle = '#111';
    viewport.ctx.beginPath(); viewport.ctx.arc(L * 0.7, -0.5, 0.6, 0, Math.PI * 2); viewport.ctx.fill();
    viewport.ctx.restore();
  }

  function drawSpecies(kind, x, y, p, s) {
    switch (kind) {
      case 'rabbit': return drawLeporid(x, y, p, s, '#8b6b4a', 8);
      case 'hare': return drawLeporid(x, y, p, s, '#b08a5a', 13);
      case 'mouse': return drawMouse(x, y, p, s);
      case 'squirrel': return drawSquirrel(x, y, p, s);
      case 'turtle': return drawTurtle(x, y, p, s);
      case 'pigeon': return drawPigeon(x, y, p, s);
      case 'duck': return drawPigeon(x, y, p, s, true);
      case 'swift': return drawSwift(x, y, p, s);
      case 'trout': case 'pike': return drawFish(x, y, { kind, vx: p.vx ?? 1, ph: 0 }, s);
      case 'flock':
        for (let i = 0; i < 5; i++) {
          drawStarling(x + ((i % 3) - 1) * 9 * s, y + (i < 3 ? -4 : 5) * s, (p.flapT || 0) + i, s, p.vx ?? 1);
        }
    }
  }

  function drawAlert(x, y, ch = '!', alpha = 1, reason = 'sound') {
    const palette = { sight: '#d62828', sound: '#ffdd55', shadow: '#d62828' };
    viewport.ctx.globalAlpha = alpha;
    viewport.ctx.font = 'bold 18px sans-serif'; viewport.ctx.textAlign = 'center';
    viewport.ctx.strokeStyle = '#000'; viewport.ctx.lineWidth = 3; viewport.ctx.strokeText(ch, x, y);
    viewport.ctx.fillStyle = ch === '!' ? palette[reason] || '#ffdd55' : '#fff'; viewport.ctx.fillText(ch, x, y);
    viewport.ctx.globalAlpha = 1;
  }

  // "!" when spooked, a fading-in "?" while the animal is noticing you
  function preyHasAlert(p) {
    if (p.hidden || p.gone) return false;
    if (p.spent) return (p.fadeT ?? 0) > 0;
    return p.alertT > 0 || p.fleeing || p.spookT > 0 || p.scatterT > 0;
  }

  function drawAwareness(p, x, y) {
    if (p.hidden || p.gone) return;
    const reason = p.lastSense || 'sound';
    const alertAlpha = p.spent ? Math.max(0, Math.min(1, p.fadeT ?? 1)) : 1;
    if (preyHasAlert(p)) drawAlert(x, y, '!', alertAlpha, reason);
    else if (p.aware > 0 && systems.prey.SENSES[p.kind]) drawAlert(x, y, '?', Math.min(1, 0.3 + p.aware / systems.prey.SENSES[p.kind].reaction), reason);
  }

  function drawPrey(p) {
    const s = SPECIES[p.kind];
    const sx = systems.flight.toScreenX(p.x);
    if (p.kind === 'mouse') {
      const hx = systems.flight.toScreenX(p.home), gy = systems.flight.toScreenY(0);
      if (hx >= -20 && hx <= viewport.W + 20) {
        viewport.ctx.fillStyle = '#6b4f30';
        viewport.ctx.beginPath(); viewport.ctx.ellipse(hx, gy, 14, 4.5, 0, Math.PI, 0); viewport.ctx.fill();
        viewport.ctx.fillStyle = '#2b1d10';
        viewport.ctx.beginPath(); viewport.ctx.ellipse(hx, gy - 0.5, 7, 2.5, 0, 0, Math.PI * 2); viewport.ctx.fill();
      }
    }
    if (sx < -150 || sx > viewport.W + 150) return;
    if (p.hidden) return;
    systems.renderer.drawPreySenseIndicators(p);
    if (!s.air) {
      const gy = systems.flight.toScreenY(0);
      viewport.ctx.globalAlpha = p.spent ? Math.max(0, Math.min(1, p.fadeT)) : 1;
      drawSprite(p.kind, sx, gy, p, systems.settings.animalScaleFor(p.kind));
      viewport.ctx.globalAlpha = 1;
      drawAwareness(p, sx, gy - 34);
      return;
    }
    if (p.kind === 'flock') {
      viewport.ctx.globalAlpha = p.spent ? Math.max(0, p.fadeT) : 1;
      for (const m of p.members) {
        if (!m.caught) drawStarlingSprite(systems.flight.toScreenX(m.x), systems.flight.toScreenY(m.alt), m.ph * 6, systems.settings.animalScaleFor(p.kind), p.vx);
      }
      viewport.ctx.globalAlpha = 1;
    } else {
      viewport.ctx.globalAlpha = p.spent ? Math.max(0, Math.min(1, p.fadeT)) : 1;
      drawSprite(p.kind, sx, systems.flight.toScreenY(p.alt), p, systems.settings.animalScaleFor(p.kind));
      viewport.ctx.globalAlpha = 1;
    }
    drawAwareness(p, sx, systems.flight.toScreenY(p.alt) - 20);
  }

  // ---------- Sprite cache ----------
  // Outlined animal sprites are pre-rendered per animation frame; a canvas filter on every draw is far too slow
  const spriteCache = createCache({
    maxEntries: 768,
    maxWeight: 32 * 1024 * 1024,
    weightOf: image => image.width * image.height * 4,
  });
  function quantize(v, period) {
    if (!period) return [0, 0];
    const i = Math.floor(((((v || 0) % period) + period) % period) / period * ANIM_STEPS);
    return [i, ((i + 0.5) / ANIM_STEPS) * period];
  }
  function renderSprite(s, drawFn) {
    const size = Math.ceil(64 * s) + 8;
    const raw = document.createElement('canvas');
    raw.width = raw.height = size;
    const saved = viewport.ctx;
    try {
      viewport.ctx = raw.getContext('2d');
      viewport.ctx.translate(size / 2, size / 2);
      drawFn();
    } finally {
      viewport.ctx = saved;
    }
    const out = document.createElement('canvas');
    out.width = out.height = size;
    const o = out.getContext('2d');
    o.filter = OUTLINE;
    o.drawImage(raw, 0, 0);
    return out;
  }
  function cached(key, s, drawFn) {
    return spriteCache.getOrCreate(key, () => renderSprite(s, drawFn));
  }
  function drawSprite(kind, x, y, p, s) {
    const [hPer, fPer] = ANIM_PERIOD[kind] || [0, 0];
    const [hi, hopT] = quantize(p.hopT, hPer), [fi, flapT] = quantize(p.flapT, fPer);
    const dir = systems.prey.facing(p), moving = p.moving ? 1 : 0;
    const img = cached(`${kind}|${dir}|${s}|${hi}|${fi}|${moving}`, s,
      () => drawSpecies(kind, 0, 0, { hopT, flapT, vx: dir, face: dir, moving: !!moving }, s));
    // Mid-turn the sprite narrows (edge-on) before it flips; everything shrinks with the zoom-out
    const k = systems.progression.spriteK(), sw = img.width * k * Math.max(0.2, Math.min(1, Math.abs(p.turn ?? 1))), sh = img.height * k;
    viewport.ctx.drawImage(img, Math.round(x - sw / 2), Math.round(y - sh / 2), Math.round(sw), Math.round(sh));
  }
  function drawStarlingSprite(x, y, flap, s, dir) {
    const [fi, f] = quantize(flap, ANIM_PERIOD.star[1]);
    const d = dir < 0 ? -1 : 1;
    const img = cached(`star|${d}|${s}|${fi}`, s, () => drawStarling(0, 0, f, s, d));
    const k = systems.progression.spriteK(), w = img.width * k, h = img.height * k;
    viewport.ctx.drawImage(img, Math.round(x - w / 2), Math.round(y - h / 2), Math.round(w), Math.round(h));
  }
  return { cached, drawAlert, drawFish, drawPrey, drawSpecies, drawTurtle, preyHasAlert, getCacheStats: spriteCache.getStats, clearCache: spriteCache.clear };
}
