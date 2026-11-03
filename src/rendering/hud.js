import { G, DIVE_SPEED, SAFE_VSPEED, CRASH_REVEAL_DELAY, BRAKE_UNLOCK, SHELL_CRACK_SPEED, LENS_R, PAUSE_BTN, DUSK_WARN_HOUR, CHAIN_TIME, ESCAPE_V, SPECIES, HAZARD_NAME, ICON_SCALE, OUTLINE } from '../config.js';
import { wrapText } from './text.js';

export function createHud({ session, viewport, systems }) {
  function drawArrow(tipX, tipY, ux, uy) {
    viewport.ctx.fillStyle = '#d62828'; viewport.ctx.strokeStyle = '#fff'; viewport.ctx.lineWidth = 2;
    viewport.ctx.beginPath();
    viewport.ctx.moveTo(tipX, tipY);
    viewport.ctx.lineTo(tipX - ux * 16 - uy * 9, tipY - uy * 16 + ux * 9);
    viewport.ctx.lineTo(tipX - ux * 16 + uy * 9, tipY - uy * 16 - ux * 9);
    viewport.ctx.closePath(); viewport.ctx.fill(); viewport.ctx.stroke();
  }

  function drawLabel(text, x, y) {
    viewport.ctx.font = 'bold 12px monospace';
    const w = viewport.ctx.measureText(text).width + 10;
    viewport.ctx.fillStyle = 'rgba(0,0,0,0.65)';
    viewport.ctx.fillRect(x - w / 2, y - 9, w, 18);
    viewport.ctx.fillStyle = '#fff'; viewport.ctx.textAlign = 'center';
    viewport.ctx.fillText(text, x, y + 4);
  }

  function drawPreyIndicators() {
    // Arrow over the nearest target; if off-screen, a lens at the screen edge on the line from the bird
    if (session.bird.carrying) return;
    let near = null, best = Infinity;
    for (const p of session.prey) {
      if (p.gone || p.hidden || p.spent) continue;
      const d = Math.hypot(p.x - session.bird.x, (SPECIES[p.kind].air ? p.alt : 0) - session.bird.alt);
      if (d < best) { best = d; near = p; }
    }
    if (!near || best < 40) return;
    const s = SPECIES[near.kind];
    const label = `${best.toFixed(0)} m`;
    const rx = systems.flight.toScreenX(near.x), ry = s.air ? systems.flight.toScreenY(near.alt) : systems.flight.toScreenY(0) - 10;
    if (rx >= 0 && rx <= viewport.W && ry >= 0 && ry <= viewport.H) {
      const awarenessOffset = systems.sprites.preyHasAlert(near) || near.aware > 0 ? 32 : 0;
      drawArrow(rx, ry - (s.air ? 18 : 14) - awarenessOffset, 0, 1);
      return;
    }
    const { x: bx, y: by } = systems.flight.birdAnchor();
    const dx = rx - bx, dy = ry - by, inset = LENS_R + 14;
    let t = 1;
    if (dx > 0) t = Math.min(t, (viewport.W - inset - bx) / dx);
    if (dx < 0) t = Math.min(t, (inset - bx) / dx);
    if (dy > 0) t = Math.min(t, (viewport.H - inset - by) / dy);
    if (dy < 0) t = Math.min(t, (inset - by) / dy);
    const cx = bx + dx * t, cy = by + dy * t;
    const len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    systems.renderer.drawLens(cx, cy, '#bfe3ff', () => {
      if (s.air) {
        systems.sprites.drawSpecies(near.kind, cx, cy, near, systems.settings.animalScaleFor(near.kind) * 0.9);
      } else {
        viewport.ctx.fillStyle = '#5c8a3a';
        viewport.ctx.fillRect(cx - LENS_R, cy + 10, LENS_R * 2, LENS_R);
        systems.sprites.drawSpecies(near.kind, cx, cy + 10, near, systems.settings.animalScaleFor(near.kind) * 0.9);
      }
    });
    drawArrow(cx + ux * (LENS_R + 20), cy + uy * (LENS_R + 20), ux, uy);
    drawLabel(label, cx, cy - LENS_R - 12);
  }

  function drawPausePanel() {
    if (!session.paused) return;
    viewport.ctx.fillStyle = 'rgba(0,0,0,0.38)';
    viewport.ctx.fillRect(0, 0, viewport.W, viewport.H);

    viewport.ctx.fillStyle = '#ffffff';
    viewport.ctx.textAlign = 'center';
    viewport.ctx.font = 'bold 46px sans-serif';
    viewport.ctx.fillText('Paused', viewport.W / 2, viewport.H / 2 - 10);

    viewport.ctx.font = '14px sans-serif';
    viewport.ctx.fillStyle = 'rgba(255,255,255,0.85)';
    viewport.ctx.fillText('Click outside the options or press P / Esc to resume', viewport.W / 2, viewport.H / 2 + 22);

    viewport.ctx.fillStyle = '#ffffff';
    viewport.ctx.font = 'bold 13px sans-serif';
    viewport.ctx.fillText('Graphics resolution', viewport.W / 2, viewport.H / 2 + 60);
    for (const option of systems.settings.graphicsOptions()) {
      viewport.ctx.fillStyle = option.selected ? '#ffd34d' : '#2c4b69';
      viewport.ctx.fillRect(option.x, option.y, option.width, option.height);
      viewport.ctx.strokeStyle = option.selected ? '#fff1b8' : 'rgba(255,255,255,0.5)';
      viewport.ctx.lineWidth = option.selected ? 2 : 1;
      viewport.ctx.strokeRect(option.x + 0.5, option.y + 0.5, option.width - 1, option.height - 1);
      viewport.ctx.fillStyle = option.selected ? '#2a1d00' : '#ffffff';
      viewport.ctx.font = 'bold 11px sans-serif';
      viewport.ctx.fillText(option.label, option.x + option.width / 2, option.y + option.height / 2 + 4);
    }
  }

  function drawHUD() {
    // On the way to the moon only the messages and toasts stay up
    if (session.state.moonshot) { if (session.state.moonshot.landed) drawCatchLog(); drawHudMessages(); return; }
    const noticeBottom = drawHudMessages();
    // Altitude meter (sqrt scale so low altitudes stay readable)
    const mx = 40, top = 80, bottom = viewport.H - 60;
    const altY = a => bottom - Math.sqrt(Math.min(1, Math.max(0, a) / session.MAX_ALT)) * (bottom - top);
    viewport.ctx.fillStyle = 'rgba(0,0,0,0.4)';
    viewport.ctx.fillRect(mx - 30, top - 10, 60, bottom - top + 20);
    viewport.ctx.strokeStyle = '#fff'; viewport.ctx.lineWidth = 2;
    viewport.ctx.beginPath(); viewport.ctx.moveTo(mx + 10, top); viewport.ctx.lineTo(mx + 10, bottom); viewport.ctx.stroke();
    viewport.ctx.font = '10px monospace'; viewport.ctx.fillStyle = '#fff'; viewport.ctx.textAlign = 'right';
    for (const a of [0, 25, 50, 100, 200, 300, 400, 600, 800].filter(a => a < session.MAX_ALT - 60).concat(session.MAX_ALT)) {
      viewport.ctx.fillText(a, mx + 4, altY(a) + 3);
    }
    const ay = altY(session.bird.alt);
    viewport.ctx.fillStyle = '#ffdd55';
    viewport.ctx.beginPath(); viewport.ctx.moveTo(mx + 10, ay); viewport.ctx.lineTo(mx + 22, ay - 6); viewport.ctx.lineTo(mx + 22, ay + 6); viewport.ctx.fill();
    const altLabel = `${session.bird.alt.toFixed(0)} m`;
    viewport.ctx.font = 'bold 13px monospace';
    const altW = viewport.ctx.measureText(altLabel).width + 10;
    viewport.ctx.fillStyle = 'rgba(0,0,0,0.65)';
    viewport.ctx.fillRect(mx + 24, ay - 10, altW, 20);
    viewport.ctx.fillStyle = session.bird.alt > session.MAX_ALT ? '#66ccff' : '#ffdd55'; viewport.ctx.textAlign = 'left';
    viewport.ctx.fillText(altLabel, mx + 29, ay + 4);

    if (session.bird.carrying && session.bird.carrying.kind !== 'gun') {
      // Marker: the lowest altitude from which a release at your current speed would still crack the shell
      const needH = (SHELL_CRACK_SPEED ** 2 - session.bird.vx ** 2 - session.bird.vy ** 2) / (2 * G);
      if (needH > 0) {
        const dy = altY(needH);
        viewport.ctx.strokeStyle = '#7fd67f'; viewport.ctx.lineWidth = 3;
        viewport.ctx.beginPath(); viewport.ctx.moveTo(mx - 4, dy); viewport.ctx.lineTo(mx + 14, dy); viewport.ctx.stroke();
      }
    }

    // Keep flight instruments bottom-left, beside the altitude tape.
    const narrow = viewport.W < 720;
    const SR = narrow ? 44 : 64, scx = narrow ? 140 : 162, scy = viewport.H - SR - 108, gunHeld = session.bird.carrying && session.bird.carrying.kind === 'gun';
    drawSpeedometer(scx, scy, SR);
    const perks = perkRows();
    viewport.ctx.font = 'bold 12px sans-serif';
    const perkLines = perks.map(([text, color]) => [wrapText(viewport.ctx, text, 154), color]);
    const perkHeight = perkLines.reduce((height, [lines]) => height + lines.length * 16 + 10, 0);
    const ammoHeight = gunHeld ? (narrow ? 38 : 142) : 0;
    const logBottom = drawCatchLog(noticeBottom, perkHeight + ammoHeight);
    const panelX = viewport.W - 184, panelY = Math.max(noticeBottom + 12, logBottom + 12);
    if (gunHeld) drawAmmo(panelX, panelY, narrow);
    drawPerks(panelX, panelY + ammoHeight, perkLines);

    // Scale bar
    const barM = systems.renderer.niceStep(100 / session.cam.zoom), barPx = barM * session.cam.zoom;
    viewport.ctx.strokeStyle = '#fff'; viewport.ctx.lineWidth = 2;
    viewport.ctx.beginPath();
    viewport.ctx.moveTo(viewport.W - 20 - barPx, viewport.H - 40); viewport.ctx.lineTo(viewport.W - 20 - barPx, viewport.H - 34);
    viewport.ctx.lineTo(viewport.W - 20, viewport.H - 34); viewport.ctx.lineTo(viewport.W - 20, viewport.H - 40);
    viewport.ctx.stroke();
    viewport.ctx.fillStyle = '#fff'; viewport.ctx.font = '12px monospace'; viewport.ctx.textAlign = 'right';
    viewport.ctx.fillText(`${barM} m`, viewport.W - 20, viewport.H - 44);
  }

  // Notifications share a bounded upper-screen lane, leaving the bird unobscured.
  function drawHudMessages() {
    let y = 52;
    const width = Math.min(600, viewport.W - 32);
    function banner(text, color) {
      viewport.ctx.font = 'bold 13px sans-serif'; viewport.ctx.textAlign = 'center';
      const lines = wrapText(viewport.ctx, text, width - 24);
      const height = lines.length * 17 + 12;
      viewport.ctx.fillStyle = 'rgba(12,20,34,0.9)';
      viewport.ctx.fillRect((viewport.W - width) / 2, y, width, height);
      viewport.ctx.fillStyle = color;
      lines.forEach((line, i) => viewport.ctx.fillText(line, viewport.W / 2, y + 20 + i * 17));
      y += height + 6;
    }
    if ((session.state.msgT > 0 || session.state.over) && (!session.state.crash || session.state.crash.t >= CRASH_REVEAL_DELAY) && !(session.state.moonshot && session.state.over)) {
      banner(session.state.msg, session.state.over ? '#ff7766' : '#fff');
    }
    if (session.state.toast && session.state.toast.t > 0) {
      viewport.ctx.globalAlpha = Math.min(1, session.state.toast.t);
      banner(session.state.toast.text, '#ffd34d');
      viewport.ctx.globalAlpha = 1;
    }
    const caught = session.state.lastCatch;
    const age = caught ? session.state.time - caught.t : Infinity;
    if (caught && age < 4 && !session.state.over) {
      viewport.ctx.globalAlpha = Math.min(1, 4 - age);
      const kind = caught.targetKind || caught.kind;
      const name = SPECIES[kind]?.name || HAZARD_NAME[kind] || 'Buzzard';
      banner(`${caught.label || name}${caught.count > 1 ? ` ×${caught.count}` : ''}  +$${caught.pts}`, '#fff');
      if (caught.tags.length) {
        viewport.ctx.font = '12px sans-serif'; viewport.ctx.textAlign = 'center';
        const lines = wrapText(viewport.ctx, caught.tags.join(' · '), width - 24);
        const height = lines.length * 17 + 12;
        // Join the modifier rows to their catch heading, not to the warning above it.
        y -= 6;
        viewport.ctx.fillStyle = 'rgba(12,20,34,0.9)';
        viewport.ctx.fillRect((viewport.W - width) / 2, y, width, height);
        viewport.ctx.fillStyle = '#ffdd55';
        lines.forEach((line, i) => viewport.ctx.fillText(line, viewport.W / 2, y + 17 + i * 17));
        y += height + 6;
      }
      viewport.ctx.globalAlpha = 1;
    }
    if (y === 52 && !session.state.over && session.bird.carrying) {
      if (session.bird.carrying.kind === 'gun') {
        banner(systems.combat.gunAuto() ? 'Right-click: spray · Space: drop' : systems.combat.gunFreeAim()
          ? 'Right-click: aim, release: fire · Space: drop'
          : 'Right-click, release: fire ahead · Space: drop', '#ffdd55');
      } else {
        const impact = systems.combat.predictImpact(session.bird.alt, session.bird.vx, session.bird.vy);
        const ready = impact >= SHELL_CRACK_SPEED;
        const est = systems.session.priceCatch('turtle', { impact }, true).value;
        banner(ready ? `Turtle ready · ~$${est} · Right-click: ${systems.progression.aimTier() ? 'aim / throw' : 'drop'} · Space: drop`
          : `Turtle: ${(impact * 3.6).toFixed(0)}/${(SHELL_CRACK_SPEED * 3.6).toFixed(0)} km/h impact · Climb or dive faster`, ready ? '#7fd67f' : '#fff');
      }
    }
    return y;
  }

  // Small badges for the whacky upgrades: eyas call state, lucky feathers and bounces left
  function perkRows() {
    const rows = [];
    if (systems.progression.tier('lucky')) rows.push([`Lucky feather ×${session.state.feathers}`, session.state.feathers ? '#fff1b8' : '#9aa7b8']);
    if (systems.progression.tier('bounce')) rows.push([session.state.bounces === Infinity ? 'Springy legs ∞' : `Springy legs ×${session.state.bounces}`, session.state.bounces ? '#b8f1c8' : '#9aa7b8']);
    if (session.progress.moon && systems.progression.moonSprings()) {
      const chain = session.bird.bouncing && session.bird.bouncing.spin ? session.bird.bouncing.chain + 1 : 0;
      rows.push([`🌕 Launch ${Math.round(session.state.bestLaunch * 3.6)}/${Math.round(ESCAPE_V * 3.6)} km/h${chain ? ` · ×${chain}` : ''}`, '#ffe9a8']);
    }
    if (systems.progression.tier('eyas') && session.state.eyases) {
      const hunting = session.state.eyases.filter(e => e.mode === 'chase').length;
      rows.push([session.state.eyasHunt ? `E · Eyases hunting${hunting ? ` (${hunting} out)` : ''}` : 'E · Eyases held back', session.state.eyasHunt ? '#d9a46a' : '#9aa7b8']);
      if (systems.progression.tier('eyasgun') || session.state.eyases.some(e => e.ammo > 0)) {
        rows.push([`Eyas ammo: ${session.state.eyases.map(e => e.ammo).join(' / ')}`, session.state.eyases.some(e => e.ammo > 0) ? '#ffdd55' : '#9aa7b8']);
      }
    }
    return rows;
  }

  function drawPerks(x, y, rows) {
    rows.forEach(([lines, col]) => {
      const height = lines.length * 16 + 6;
      viewport.ctx.fillStyle = 'rgba(0,0,0,0.55)'; viewport.ctx.fillRect(x, y, 170, height);
      viewport.ctx.fillStyle = col; viewport.ctx.font = 'bold 12px sans-serif'; viewport.ctx.textAlign = 'left';
      lines.forEach((text, i) => viewport.ctx.fillText(text, x + 8, y + 15 + i * 16));
      y += height + 4;
    });
  }

  // Weapon and ammunition share the right-side status column.
  function drawAmmo(x, y, compact = false) {
    const g = session.bird.carrying, max = systems.combat.gunStat('ammo'), n = g.ammo, style = systems.renderer.gunStyle();
    if (compact) {
      viewport.ctx.fillStyle = 'rgba(0,0,0,0.55)'; viewport.ctx.fillRect(x, y, 170, 32);
      viewport.ctx.fillStyle = '#ffdd55'; viewport.ctx.font = 'bold 13px monospace'; viewport.ctx.textAlign = 'left';
      viewport.ctx.fillText(`${style === 2 ? 'Rockets' : 'Ammo'}: ${n}/${max}`, x + 8, y + 21);
      return;
    }
    const w = 118, h = 136;
    viewport.ctx.fillStyle = 'rgba(0,0,0,0.55)'; viewport.ctx.fillRect(x, y, w, h);
    viewport.ctx.strokeStyle = n <= Math.max(1, max * 0.2) ? '#ff7766' : 'rgba(255,221,85,0.5)'; viewport.ctx.lineWidth = 1;
    viewport.ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    viewport.ctx.filter = OUTLINE;
    systems.renderer.drawRifle(x + w / 2 - 2, y + 26, 0, 2.4, style, g.flash || 0);
    viewport.ctx.filter = 'none';
    viewport.ctx.fillStyle = '#ffdd55'; viewport.ctx.font = 'bold 26px monospace'; viewport.ctx.textAlign = 'center';
    viewport.ctx.fillText(`${n}`, x + w / 2, y + 74);
    viewport.ctx.fillStyle = '#cfe6f7'; viewport.ctx.font = '10px monospace';
    viewport.ctx.fillText(`/ ${max} ${style === 2 ? 'ROCKETS' : 'SHOTS'}`, x + w / 2, y + 88);
    const by = y + 100;
    if (max <= 8) {
      const rw = style === 2 ? 11 : 7, gap = 4, tot = max * rw + (max - 1) * gap;
      for (let i = 0; i < max; i++) {
        const rx = x + (w - tot) / 2 + i * (rw + gap), on = i < n;
        viewport.ctx.fillStyle = on ? (style === 2 ? '#8a9a52' : '#d9a74a') : 'rgba(255,255,255,0.15)';
        viewport.ctx.fillRect(rx, by + 6, rw, 18);
        if (on) { viewport.ctx.fillStyle = style === 2 ? '#c0392b' : '#b07a2a'; viewport.ctx.fillRect(rx, by, rw, 6); }
      }
    } else {
      viewport.ctx.fillStyle = 'rgba(255,255,255,0.15)'; viewport.ctx.fillRect(x + 12, by + 6, w - 24, 14);
      viewport.ctx.fillStyle = '#d9a74a'; viewport.ctx.fillRect(x + 12, by + 6, (w - 24) * n / max, 14);
    }
  }

  function drawSpeedometer(cx, cy, r) {
    const MAX_KMH = Math.max(360, Math.ceil(systems.progression.topKmh() / 60) * 60), A0 = Math.PI * 0.75, SWEEP = Math.PI * 1.5;
    const ang = kmh => A0 + SWEEP * Math.min(kmh, MAX_KMH) / MAX_KMH;
    const kmh = session.bird.speed * 3.6;

    const focusWidth = r * 2, focusX = cx - r, focusY = cy + r + 68;
    viewport.ctx.fillStyle = 'rgba(0,0,0,0.55)';
    viewport.ctx.fillRect(focusX - 4, focusY - 4, focusWidth + 8, 18);
    viewport.ctx.fillStyle = session.bird.brakeLocked ? '#ff5544' : '#66ccff';
    viewport.ctx.fillRect(focusX, focusY, focusWidth * session.bird.brakeE, 10);
    if (session.bird.brakeLocked) {
      viewport.ctx.strokeStyle = '#ffdd55'; viewport.ctx.lineWidth = 1;
      const unlockX = focusX + focusWidth * BRAKE_UNLOCK;
      viewport.ctx.beginPath(); viewport.ctx.moveTo(unlockX, focusY - 4); viewport.ctx.lineTo(unlockX, focusY + 14); viewport.ctx.stroke();
    }
    viewport.ctx.fillStyle = '#cfe6f7'; viewport.ctx.font = '9px monospace'; viewport.ctx.textAlign = 'center';
    viewport.ctx.fillText('FOCUS', cx, focusY + 26);

    // Wind at the bird's altitude: arrow length and label above the dial
    const w = systems.world.windX(session.bird.alt), wy = cy - r - 24;
    const len = Math.min(40, Math.abs(w) * 4) * Math.sign(w);
    viewport.ctx.strokeStyle = '#cfe6f7'; viewport.ctx.fillStyle = '#cfe6f7'; viewport.ctx.lineWidth = 2;
    viewport.ctx.beginPath(); viewport.ctx.moveTo(cx - len, wy); viewport.ctx.lineTo(cx + len, wy); viewport.ctx.stroke();
    if (Math.abs(len) > 2) {
      const d = Math.sign(len);
      viewport.ctx.beginPath(); viewport.ctx.moveTo(cx + len + d * 6, wy); viewport.ctx.lineTo(cx + len - d * 2, wy - 5); viewport.ctx.lineTo(cx + len - d * 2, wy + 5); viewport.ctx.fill();
    }
    viewport.ctx.font = '11px monospace'; viewport.ctx.textAlign = 'center';
    viewport.ctx.fillText(`wind ${(Math.abs(w) * 3.6).toFixed(0)} km/h`, cx, wy - 9);

    viewport.ctx.fillStyle = 'rgba(0,0,0,0.55)';
    viewport.ctx.beginPath(); viewport.ctx.arc(cx, cy, r + 8, 0, Math.PI * 2); viewport.ctx.fill();

    // Zones: cruise / dive / extreme
    viewport.ctx.lineWidth = 6;
    for (const [a, b, c] of [[0, DIVE_SPEED * 3.6, '#7fd67f'], [DIVE_SPEED * 3.6, 300, '#ffdd55'], [300, MAX_KMH, '#ff5544']]) {
      viewport.ctx.strokeStyle = c;
      viewport.ctx.beginPath(); viewport.ctx.arc(cx, cy, r - 4, ang(a), ang(b)); viewport.ctx.stroke();
    }

    viewport.ctx.strokeStyle = '#fff'; viewport.ctx.fillStyle = '#fff';
    viewport.ctx.font = '10px monospace'; viewport.ctx.textAlign = 'center';
    const labelStep = r < 56 || MAX_KMH > 480 ? 120 : 60;
    for (let v = 0; v <= MAX_KMH; v += 20) {
      const a = ang(v), major = v % 60 === 0;
      const r0 = r - (major ? 18 : 12);
      viewport.ctx.lineWidth = major ? 2 : 1;
      viewport.ctx.beginPath();
      viewport.ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      viewport.ctx.lineTo(cx + Math.cos(a) * (r - 8), cy + Math.sin(a) * (r - 8));
      viewport.ctx.stroke();
      const labelR = r - (r < 56 ? 20 : 28);
      if (v % labelStep === 0) viewport.ctx.fillText(v, cx + Math.cos(a) * labelR, cy + Math.sin(a) * labelR + 3);
    }

    // Session max marker
    const am = ang(session.state.maxSpeed * 3.6);
    viewport.ctx.fillStyle = '#66ccff';
    viewport.ctx.beginPath();
    viewport.ctx.moveTo(cx + Math.cos(am) * (r - 1), cy + Math.sin(am) * (r - 1));
    viewport.ctx.lineTo(cx + Math.cos(am - 0.06) * (r + 8), cy + Math.sin(am - 0.06) * (r + 8));
    viewport.ctx.lineTo(cx + Math.cos(am + 0.06) * (r + 8), cy + Math.sin(am + 0.06) * (r + 8));
    viewport.ctx.fill();

    // Needle
    const a = ang(kmh);
    viewport.ctx.strokeStyle = '#ff6633'; viewport.ctx.lineWidth = 3; viewport.ctx.lineCap = 'round';
    viewport.ctx.beginPath();
    viewport.ctx.moveTo(cx - Math.cos(a) * 10, cy - Math.sin(a) * 10);
    viewport.ctx.lineTo(cx + Math.cos(a) * (r - 14), cy + Math.sin(a) * (r - 14));
    viewport.ctx.stroke(); viewport.ctx.lineCap = 'butt';
    viewport.ctx.fillStyle = '#ddd';
    viewport.ctx.beginPath(); viewport.ctx.arc(cx, cy, 5, 0, Math.PI * 2); viewport.ctx.fill();

    viewport.ctx.fillStyle = '#fff'; viewport.ctx.font = 'bold 22px monospace';
    viewport.ctx.fillText(kmh.toFixed(0), cx, cy + r * 0.45);
    viewport.ctx.font = '10px monospace'; viewport.ctx.fillStyle = '#bbb';
    viewport.ctx.fillText('km/h', cx, cy + r * 0.45 + 13);

    // Mode badge and vertical speed under the dial
    const modeColor = { BRAKE: '#66ccff', DIVE: '#ffdd55', FLAP: '#7fd67f', STALL: '#ff8866' }[session.bird.mode] || '#fff';
    viewport.ctx.font = 'bold 13px sans-serif';
    const mw = viewport.ctx.measureText(session.bird.mode).width + 20;
    viewport.ctx.fillStyle = 'rgba(0,0,0,0.55)';
    viewport.ctx.fillRect(cx - mw / 2, cy + r + 14, mw, 22);
    viewport.ctx.strokeStyle = modeColor; viewport.ctx.lineWidth = 2;
    viewport.ctx.strokeRect(cx - mw / 2, cy + r + 14, mw, 22);
    viewport.ctx.fillStyle = modeColor;
    viewport.ctx.fillText(session.bird.mode, cx, cy + r + 30);

    const vs = session.bird.vy || 0;
    viewport.ctx.font = '12px monospace';
    viewport.ctx.fillStyle = -vs > SAFE_VSPEED ? '#ff8866' : '#fff';
    viewport.ctx.fillText(`V/S ${vs >= 0 ? '▲' : '▼'} ${Math.abs(vs).toFixed(1)} m/s`, cx, cy + r + 54);
  }

  // Round species badge used on catch cards and the day recap
  function drawCatchIcon(targetKind, ix, iy, ir, turtleHit) {
    const water = SPECIES[targetKind]?.air === 'water' || targetKind === 'octopus';
    const air = targetKind === 'cat' || targetKind === 'hunter' || water ? false : SPECIES[targetKind]?.air ?? true;
    const k = ir / 14;
    viewport.ctx.save();
    viewport.ctx.beginPath(); viewport.ctx.arc(ix, iy, ir, 0, Math.PI * 2); viewport.ctx.clip();
    viewport.ctx.fillStyle = water ? '#4a88b8' : '#cfe6f7'; viewport.ctx.fillRect(ix - ir, iy - ir, ir * 2, ir * 2);
    if (targetKind === 'satellite') {
      viewport.ctx.fillStyle = '#0a0d1a'; viewport.ctx.fillRect(ix - ir, iy - ir, ir * 2, ir * 2);
      systems.renderer.drawSatellite(ix, iy + 1 * k, -0.3, 0.42 * k, true);
    } else if (targetKind === 'moon') {
      viewport.ctx.fillStyle = '#0a0d1a'; viewport.ctx.fillRect(ix - ir, iy - ir, ir * 2, ir * 2);
      viewport.ctx.fillStyle = '#fff'; for (const [sx, sy] of [[-9, -8], [8, -10], [10, 7], [-10, 9]]) viewport.ctx.fillRect(ix + sx * k, iy + sy * k, 1.2 * k, 1.2 * k);
      viewport.ctx.fillStyle = '#e8e4d0'; viewport.ctx.beginPath(); viewport.ctx.arc(ix, iy, 9 * k, 0, Math.PI * 2); viewport.ctx.fill();
      viewport.ctx.fillStyle = '#bdb8a2';
      for (const [cx, cy, cr] of [[-3, -3, 2.4], [3, 2, 1.8], [-1, 5, 1.3], [4, -4, 1.1]]) { viewport.ctx.beginPath(); viewport.ctx.arc(ix + cx * k, iy + cy * k, cr * k, 0, Math.PI * 2); viewport.ctx.fill(); }
    } else if (targetKind === 'octopus') {
      viewport.ctx.fillStyle = '#0b2a36'; viewport.ctx.fillRect(ix - ir, iy - ir, ir * 2, ir * 2);
      viewport.ctx.strokeStyle = viewport.ctx.fillStyle = '#b0413e'; viewport.ctx.lineWidth = 2 * k; viewport.ctx.lineCap = 'round';
      for (let t = 0; t < 5; t++) {
        const a = Math.PI * (0.15 + 0.7 * t / 4);
        viewport.ctx.beginPath(); viewport.ctx.moveTo(ix, iy + 2 * k);
        viewport.ctx.quadraticCurveTo(ix + Math.cos(a) * 7 * k, iy + 6 * k, ix + Math.cos(a) * 10 * k, iy + 12 * k); viewport.ctx.stroke();
      }
      viewport.ctx.lineCap = 'butt';
      viewport.ctx.beginPath(); viewport.ctx.ellipse(ix, iy - 2 * k, 6 * k, 7 * k, 0, 0, Math.PI * 2); viewport.ctx.fill();
      viewport.ctx.fillStyle = '#ffe14d';
      for (const ox of [-2.4, 2.4]) { viewport.ctx.beginPath(); viewport.ctx.arc(ix + ox * k, iy, 1.4 * k, 0, Math.PI * 2); viewport.ctx.fill(); }
    } else if (water) {
      viewport.ctx.fillStyle = '#cfe6f7'; viewport.ctx.fillRect(ix - ir, iy - ir, ir * 2, ir * 0.45);
      systems.sprites.drawFish(ix, iy + 2 * k, { kind: targetKind, vx: 1, ph: 0 }, (targetKind === 'pike' ? 1 : 1.3) * k);
    } else if (!air) { viewport.ctx.fillStyle = '#7fae55'; viewport.ctx.fillRect(ix - ir, iy + 11 * k, ir * 2, ir); }
    if (water || targetKind === 'moon' || targetKind === 'satellite') { /* drawn above */ } else if (targetKind === 'buzzard') {
      systems.renderer.drawBuzzard(ix, iy, { flapT: 1.2 }, 0.9 * k);
    } else if (targetKind === 'cat') {
      systems.renderer.drawCat(ix - 2 * k, iy + 11 * k, { mode: 'sit', dir: 1 }, 0.85 * k);
    } else if (targetKind === 'hunter') {
      systems.renderer.drawHunter(ix, iy + 13 * k, { tracking: false, flash: 0 }, 0.6 * k);
    } else if (targetKind === 'bullet') {
      viewport.ctx.fillStyle = '#b07a2a'; viewport.ctx.fillRect(ix - 7 * k, iy - 3 * k, 9 * k, 6 * k);
      viewport.ctx.fillStyle = '#d9a74a';
      viewport.ctx.beginPath(); viewport.ctx.moveTo(ix + 2 * k, iy - 3 * k); viewport.ctx.lineTo(ix + 5 * k, iy - 3 * k);
      viewport.ctx.quadraticCurveTo(ix + 10 * k, iy, ix + 5 * k, iy + 3 * k); viewport.ctx.lineTo(ix + 2 * k, iy + 3 * k); viewport.ctx.fill();
      viewport.ctx.strokeStyle = '#fff'; viewport.ctx.lineWidth = 1.5 * k;
      for (const a of [-0.6, 0, 0.6]) { viewport.ctx.beginPath(); viewport.ctx.moveTo(ix - 9 * k, iy + a * 8 * k); viewport.ctx.lineTo(ix - 13 * k, iy + a * 11 * k); viewport.ctx.stroke(); }
    } else if (targetKind === 'hawk') {
      systems.renderer.drawHawk(ix, iy, { mode: 'stalk', flapT: 1.2, vx: 1, vy: 0 }, 0.85 * k);
    } else {
      systems.sprites.drawSpecies(targetKind, ix, air ? iy : iy + 11 * k, { hopT: 0, vx: 1, flapT: 1.2 }, systems.settings.animalScaleFor(targetKind) / ICON_SCALE * k);
    }
    viewport.ctx.restore();
    viewport.ctx.beginPath(); viewport.ctx.arc(ix, iy, ir, 0, Math.PI * 2);
    viewport.ctx.strokeStyle = 'rgba(255,255,255,0.8)'; viewport.ctx.lineWidth = 1.5; viewport.ctx.stroke();
    if (turtleHit) systems.sprites.drawTurtle(ix + 9 * k, iy + 15 * k, { vx: 1 }, 0.7 * k);
  }

  function catchCircumstances(c) {
    const items = [];
    if (c.turtleHit) items.push({ id: 'turtle', icon: '🐢', label: 'Turtle strike' });
    if (c.drop != null) items.push({ id: 'drop', icon: '🐢', label: 'Shell cracked' });
    if (c.method === 'buzzsaw') items.push({ id: 'buzzsaw', icon: '✹', label: 'Buzzsaw' });
    if (c.method === 'parry') items.push({ id: 'parry', icon: '🛡', label: 'Parry' });
    if ((c.targetKind || c.kind) === 'moon') items.push({ id: 'moon', icon: '🌕', label: 'Moon landing' });
    if (c.shot && !c.crossfire) items.push({ id: 'gun', icon: '⊕', label: 'Shot' });
    if (c.drowned || c.water) items.push({ id: 'water', icon: '💧', label: c.drowned ? 'Drowned' : 'Underwater' });
    if (c.eyas) items.push({ id: 'eyas', icon: '🐣', label: 'Eyas' });
    if (c.crossfire) items.push(c.by === 'cat'
      ? { id: 'cat', icon: '🐈', label: 'Caught by cat' }
      : { id: 'hunter', icon: '🎯', label: 'Shot by hunter' });
    if (c.stolenBy === 'buzzard') items.push({ id: 'buzzard', icon: '🦅', label: 'Stolen by buzzard' });
    return items;
  }

  function drawCatchCircumstances(c, x, y, maxWidth = 154) {
    viewport.ctx.textAlign = 'left'; viewport.ctx.font = '14px sans-serif'; viewport.ctx.fillStyle = '#cfe6f7';
    viewport.ctx.fillText(catchCircumstances(c).map(item => item.icon).join(' '), x, y, maxWidth);
  }

  function drawCatchLog(noticeBottom = 52, statusHeight = 0) {
    const log = session.state.catchLog;
    const right = viewport.W - 14;
    viewport.ctx.textAlign = 'right';
    viewport.ctx.fillStyle = '#ffdd55'; viewport.ctx.font = 'bold 18px sans-serif';
    viewport.ctx.fillText(`DAY ${session.state.day}  ·  TODAY $${session.state.score}`, right, 28);
    // Catch cards stack top-down in a column on the right, newest on top
    const CW = 170, CH = 78, GAP = 6, top = viewport.W < 720 ? Math.max(210, noticeBottom + 12) : 38, x = right - CW;
    const maxCards = Math.max(0, Math.floor(Math.min(viewport.H * 0.5, viewport.H - top - statusHeight - 130) / (CH + GAP)));
    const shown = maxCards ? log.slice(-maxCards).reverse() : [];
    let y = top + shown.length * (CH + GAP);
    if (log.length > shown.length) {
      viewport.ctx.fillStyle = '#ddd'; viewport.ctx.font = 'bold 13px sans-serif'; viewport.ctx.textAlign = 'right';
      viewport.ctx.fillText(`+${log.length - shown.length} more`, right, y + 10);
      y += 18;
    }
    // Chain multiplier below the column, with a bar showing time left to extend it
    const chain = systems.session.chainMult();
    if (chain > 1) {
      const left = 1 - (session.state.time - session.state.chainT) / CHAIN_TIME;
      viewport.ctx.textAlign = 'right';
      viewport.ctx.fillStyle = '#ff9f40'; viewport.ctx.font = 'bold 15px sans-serif';
      viewport.ctx.fillText(`CHAIN ×${chain.toFixed(1)}`, right, y + 12);
      viewport.ctx.fillStyle = 'rgba(0,0,0,0.5)'; viewport.ctx.fillRect(right - 90, y + 18, 90, 5);
      viewport.ctx.fillStyle = '#ff9f40'; viewport.ctx.fillRect(right - 90 * left, y + 18, 90 * left, 5);
      y += 30;
    }

    const bottom = y;
    y = top;
    for (const c of shown) {
      const fresh = session.state.time - c.t < 1.5;
      const targetKind = c.targetKind || c.kind;
      viewport.ctx.fillStyle = 'rgba(0,0,0,0.55)';
      viewport.ctx.fillRect(x, y, CW, CH);
      viewport.ctx.strokeStyle = fresh ? '#ffdd55' : 'rgba(255,255,255,0.35)';
      viewport.ctx.lineWidth = fresh ? 2 : 1;
      viewport.ctx.strokeRect(x + 0.5, y + 0.5, CW - 1, CH - 1);
      // Light badge behind the icon so dark animals (starlings, swifts) stay visible
      drawCatchIcon(targetKind, x + 20, y + 19, 14, c.turtleHit);
      viewport.ctx.textAlign = 'left'; viewport.ctx.fillStyle = '#fff'; viewport.ctx.font = 'bold 12px sans-serif';
      viewport.ctx.fillText(`${SPECIES[targetKind]?.name || HAZARD_NAME[targetKind] || 'Buzzard'}${c.count > 1 ? ` ×${c.count}` : ''}`, x + 40, y + 20, CW - 48);
      if (c.count > 1) {
        viewport.ctx.font = 'bold 12px sans-serif'; viewport.ctx.textAlign = 'left';
        viewport.ctx.strokeStyle = '#000'; viewport.ctx.lineWidth = 3; viewport.ctx.strokeText(`×${c.count}`, x + 3, y + 13);
        viewport.ctx.fillStyle = '#ffdd55'; viewport.ctx.fillText(`×${c.count}`, x + 3, y + 13);
      }
      viewport.ctx.textAlign = 'left';
      viewport.ctx.fillStyle = '#fff'; viewport.ctx.font = 'bold 15px monospace';
      const circumstances = catchCircumstances(c);
      drawCatchCircumstances(c, x + 8, y + 43);
      const iconWidth = viewport.ctx.measureText(circumstances.map(item => item.icon).join(' ')).width;
      viewport.ctx.font = '10px sans-serif';
      viewport.ctx.fillText(circumstances.length ? circumstances.map(item => item.label).join(' · ') : 'Dive catch', x + 12 + iconWidth, y + 43, CW - 20 - iconWidth);
      const sp = ((c.rel ?? c.speed ?? 0) * 3.6).toFixed(0);
      viewport.ctx.fillStyle = '#ccc'; viewport.ctx.font = '10px monospace';
      viewport.ctx.fillText(`${sp} ${c.rel != null ? 'rel km/h' : 'km/h'}${c.depth != null ? ` · ${c.depth.toFixed(1)} m` : ''}`, x + 8, y + 59, CW - 66);
      viewport.ctx.textAlign = 'right';
      viewport.ctx.fillStyle = '#ffdd55'; viewport.ctx.font = 'bold 13px monospace';
      viewport.ctx.fillText(`$${c.pts}`, x + CW - 8, y + 59);
      viewport.ctx.textAlign = 'left'; viewport.ctx.fillStyle = '#b7ccdd'; viewport.ctx.font = '9px sans-serif';
      const tags = c.tags || [];
      let summary = tags.join(' · ');
      for (let count = tags.length; count > 0 && viewport.ctx.measureText(summary).width > CW - 16; count--) {
        summary = `${tags.slice(0, count - 1).join(' · ')}${count > 1 ? ' · ' : ''}+${tags.length - count + 1} modifiers`;
      }
      viewport.ctx.fillText(summary, x + 8, y + 72, CW - 16);
      y += CH + GAP;
    }
    return bottom;
  }

  function drawPauseButton() {
    const { x, y, w, h } = PAUSE_BTN;
    const hover = systems.input.inPauseBtn(session.mouse.x, session.mouse.y);
    viewport.ctx.fillStyle = hover ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.5)';
    viewport.ctx.fillRect(x, y, w, h);
    viewport.ctx.strokeStyle = '#fff'; viewport.ctx.lineWidth = 2;
    viewport.ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    viewport.ctx.fillStyle = '#fff';
    if (session.paused) {
      viewport.ctx.beginPath(); viewport.ctx.moveTo(x + 16, y + 12); viewport.ctx.lineTo(x + 32, y + 22); viewport.ctx.lineTo(x + 16, y + 32); viewport.ctx.fill();
    } else {
      viewport.ctx.fillRect(x + 14, y + 12, 6, 20);
      viewport.ctx.fillRect(x + 24, y + 12, 6, 20);
    }

    // Time of day beside the pause button
    const sunUp = Math.sin(systems.world.sunPhase()) > 0;
    viewport.ctx.fillStyle = 'rgba(0,0,0,0.5)';
    viewport.ctx.fillRect(x + w + 8, y + 8, 78, 28);
    viewport.ctx.fillStyle = sunUp ? '#ffd34d' : '#cfd8ee';
    viewport.ctx.beginPath(); viewport.ctx.arc(x + w + 22, y + 22, 7, 0, Math.PI * 2); viewport.ctx.fill();
    if (!sunUp) { viewport.ctx.fillStyle = 'rgba(0,0,0,0.9)'; viewport.ctx.beginPath(); viewport.ctx.arc(x + w + 25, y + 20, 6, 0, Math.PI * 2); viewport.ctx.fill(); }
    viewport.ctx.fillStyle = '#fff'; viewport.ctx.font = 'bold 14px monospace'; viewport.ctx.textAlign = 'left';
    // Clock pulses orange in the last half hour of the hunt
    if (systems.session.huntHour() >= DUSK_WARN_HOUR) viewport.ctx.fillStyle = `rgba(255,${140 + Math.sin(session.state.time * 8) * 60},60,1)`;
    viewport.ctx.fillText(systems.world.clockText(), x + w + 34, y + 27);
  }

  // Target reticle during an air chase. Colour: green when your own speed meets minStrike, red otherwise.
  // Fill: relative speed toward minRel (angle of attack). Catchable when green and full (it pulses).
  function drawClosingHint() {
    const t = session.cam.tgt;
    if (!t || t.gone || t.spent || session.cam.focus < 0.3 || !SPECIES[t.kind].minStrike) return;
    const s = SPECIES[t.kind];
    const fast = session.bird.speed >= s.minStrike;
    const fill = Math.min(1, Math.hypot(session.bird.vx - t.vx - systems.world.windX(t.alt), session.bird.vy - t.vy) / s.minRel);
    const ready = fast && fill >= 1;
    const x = systems.flight.toScreenX(t.x), y = systems.flight.toScreenY(t.alt);
    const r = 22 + (ready ? Math.sin(session.state.time * 10) * 2 : 0);

    viewport.ctx.lineWidth = 4; viewport.ctx.lineCap = 'round';
    viewport.ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    viewport.ctx.beginPath(); viewport.ctx.arc(x, y, r, 0, Math.PI * 2); viewport.ctx.stroke();
    viewport.ctx.strokeStyle = fast ? '#7fd67f' : '#ff5544';
    viewport.ctx.beginPath(); viewport.ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + fill * Math.PI * 2); viewport.ctx.stroke();
    viewport.ctx.lineCap = 'butt';
  }
  return { catchCircumstances, drawCatchCircumstances, drawCatchIcon, drawClosingHint, drawHUD, drawPauseButton, drawPausePanel, drawPreyIndicators };
}
