import { HAZARD_NAME, ACHIEVEMENTS, SPECIES } from '../config.js';

export function createScreens({ session, viewport, systems }) {
  // ---------- Recap & Roost screens ----------
  function drawPanel(x, y, w, h) {
    viewport.ctx.fillStyle = 'rgba(12,20,34,0.94)';
    viewport.ctx.fillRect(x, y, w, h);
    viewport.ctx.strokeStyle = 'rgba(255,211,77,0.6)'; viewport.ctx.lineWidth = 2;
    viewport.ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }
  function drawButton(x, y, w, h, label, onClick, { enabled = true, primary = false, font = 'bold 15px sans-serif', id } = {}) {
    session.uiButtons.push({ x, y, w, h, onClick, enabled, label, id });
    const hover = enabled && session.mouse.x >= x && session.mouse.x <= x + w && session.mouse.y >= y && session.mouse.y <= y + h;
    viewport.ctx.fillStyle = !enabled ? '#333a44' : primary ? (hover ? '#ffe07a' : '#ffd34d') : (hover ? '#41698f' : '#2c4b69');
    viewport.ctx.fillRect(x, y, w, h);
    viewport.ctx.strokeStyle = enabled ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)'; viewport.ctx.lineWidth = 1;
    viewport.ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    viewport.ctx.fillStyle = !enabled ? '#7a828c' : primary ? '#2a1d00' : '#fff';
    viewport.ctx.font = font; viewport.ctx.textAlign = 'center';
    viewport.ctx.fillText(label, x + w / 2, y + h / 2 + 5, w - 8);
  }

  function groupCatches(catches) {
    const groups = new Map();
    for (const c of catches) {
      const kind = c.targetKind || c.kind;
      const key = `${kind}:${systems.hud.catchCircumstances(c).map(item => item.id).join(':')}`;
      if (!groups.has(key)) groups.set(key, { ...c, kind, count: 0, pts: 0, tags: new Set() });
      const g = groups.get(key);
      g.count += c.count || 1;
      g.pts += c.pts;
      for (const t of c.tags || []) {
        const name = t.split(' ')[0];
        if (name !== 'Repeat' && name !== 'Turtle') g.tags.add(name);
      }
    }
    return [...groups.values()].sort((a, b) => b.pts - a.pts);
  }
  const catchName = g => g.kind === 'buzzard' ? 'Buzzard' : HAZARD_NAME[g.kind] ?? SPECIES[g.kind].name;

  function drawRecap() {
    const r = session.state.recap;
    viewport.ctx.fillStyle = 'rgba(0,0,0,0.55)';
    viewport.ctx.fillRect(0, 0, viewport.W, viewport.H);
    const groups = groupCatches(r.catches);
    const rowH = 40, pw = Math.min(viewport.W - 40, 640);
    const fixedH = 250 + r.records.length * 22;
    const maxRows = Math.max(1, Math.floor((viewport.H - 40 - fixedH) / rowH));
    const rows = [...groups.map(g => ({ g })), ...r.steals.map(s => ({ s }))].slice(0, maxRows);
    const ph = fixedH + Math.max(1, rows.length) * rowH;
    const x0 = (viewport.W - pw) / 2, y0 = Math.max(20, (viewport.H - ph) / 2);
    drawPanel(x0, y0, pw, ph);

    viewport.ctx.textAlign = 'center';
    const ended = { crash: 'Crashed', cat: 'Caught by a cat', hunter: 'Shot by a hunter', buzzard: 'Shot by a buzzard', hawk: 'Taken by a goshawk', octopus: 'Grabbed by the octopus', drown: 'Drowned', lightning: 'Electrocuted by a turtle', fishnado: 'Hit by a flying fish' }[r.reason];
    viewport.ctx.fillStyle = r.reason === 'moon' ? '#ffd34d' : ended ? '#ff7766' : '#ffd34d';
    viewport.ctx.font = 'bold 28px sans-serif';
    viewport.ctx.fillText(r.reason === 'moon' ? `Day ${r.day} — 🌕 Reached the moon at ${r.clock}` : `Day ${r.day} — ${ended ? `${ended} at ${r.clock}` : 'Sunset'}`, viewport.W / 2, y0 + 42);
    const count = r.catches.reduce((n, c) => n + (c.count || 1), 0);
    viewport.ctx.fillStyle = '#cfe6f7'; viewport.ctx.font = '14px sans-serif';
    viewport.ctx.fillText(`${count} catch${count === 1 ? '' : 'es'}  ·  top speed ${r.topSpeed} km/h  ·  best chain ×${r.bestChain.toFixed(1)}`, viewport.W / 2, y0 + 68);

    let y = y0 + 92;
    if (!rows.length) {
      viewport.ctx.fillStyle = '#aab'; viewport.ctx.font = 'italic 15px sans-serif';
      viewport.ctx.fillText('No catches today. The early bird gets the rabbit…', viewport.W / 2, y + 24);
    }
    for (const row of rows) {
      const g = row.g || { kind: row.s.targetKind || row.s.kind, turtleHit: row.s.turtleHit, count: row.s.count || 1, pts: row.s.pts };
      viewport.ctx.globalAlpha = row.s ? 0.55 : 1;
      systems.hud.drawCatchIcon(g.kind, x0 + 36, y + rowH / 2, 15, g.turtleHit);
      systems.hud.drawCatchCircumstances(row.s || g, x0 + pw - 145, y + 14, 60);
      viewport.ctx.textAlign = 'left';
      viewport.ctx.fillStyle = '#fff'; viewport.ctx.font = 'bold 16px sans-serif';
      const label = row.s ? `Stolen by a buzzard: ${catchName(g)}` : `${catchName(g)}${g.turtleHit ? ' (turtle strike)' : ''}  ×${g.count}`;
      viewport.ctx.fillText(label, x0 + 62, y + (row.s ? 25 : 19), pw - 220);
      if (row.g && g.tags.size) {
        viewport.ctx.fillStyle = '#9fd8ff'; viewport.ctx.font = '11px sans-serif';
        viewport.ctx.fillText([...g.tags].join(' · '), x0 + 62, y + 34, pw - 220);
      }
      viewport.ctx.textAlign = 'right';
      viewport.ctx.font = 'bold 17px monospace';
      viewport.ctx.fillStyle = row.s ? '#ff8877' : '#ffdd55';
      const amt = row.s ? `-$${g.pts}` : `$${g.pts}`;
      viewport.ctx.fillText(amt, x0 + pw - 24, y + 26);
      if (row.s) {
        const aw = viewport.ctx.measureText(amt).width;
        viewport.ctx.strokeStyle = '#ff8877'; viewport.ctx.lineWidth = 1.5;
        viewport.ctx.beginPath(); viewport.ctx.moveTo(x0 + pw - 24 - aw, y + 21); viewport.ctx.lineTo(x0 + pw - 24, y + 21); viewport.ctx.stroke();
      }
      viewport.ctx.globalAlpha = 1;
      y += rowH;
    }
    if (!rows.length) y += rowH;

    y += 8;
    viewport.ctx.strokeStyle = 'rgba(255,255,255,0.25)'; viewport.ctx.lineWidth = 1;
    viewport.ctx.beginPath(); viewport.ctx.moveTo(x0 + 20, y); viewport.ctx.lineTo(x0 + pw - 20, y); viewport.ctx.stroke();
    const shown = Math.round(r.earned * Math.min(1, session.uiT / 1.2));
    viewport.ctx.textAlign = 'left'; viewport.ctx.fillStyle = '#fff'; viewport.ctx.font = 'bold 20px sans-serif';
    viewport.ctx.fillText('Day earnings', x0 + 24, y + 34);
    viewport.ctx.textAlign = 'right'; viewport.ctx.fillStyle = '#ffd34d'; viewport.ctx.font = 'bold 28px monospace';
    viewport.ctx.fillText(`$${shown}`, x0 + pw - 24, y + 36);
    viewport.ctx.textAlign = 'left'; viewport.ctx.fillStyle = '#cfe6f7'; viewport.ctx.font = '14px sans-serif';
    viewport.ctx.fillText(`Wallet: $${r.walletBefore + shown}`, x0 + 24, y + 60);
    y += 72;
    viewport.ctx.fillStyle = '#7fd67f'; viewport.ctx.font = 'bold 14px sans-serif';
    for (const rec of r.records) { viewport.ctx.fillText(`★ ${rec}`, x0 + 24, y + 10); y += 22; }

    drawButton(viewport.W / 2 - 110, y0 + ph - 54, 220, 38, 'Go to the roost →', systems.session.showShop, { primary: true });
  }

  function drawShop() {
    viewport.ctx.fillStyle = '#080f1c';
    viewport.ctx.fillRect(0, 0, viewport.W, viewport.H);
    if (session.achView) {
      drawAchievements();
      return;
    }
    viewport.ctx.textAlign = 'left'; viewport.ctx.fillStyle = '#ffd34d'; viewport.ctx.font = 'bold 28px sans-serif';
    viewport.ctx.fillText('The Roost', 16, 36);
    viewport.ctx.textAlign = 'center';
    viewport.ctx.fillStyle = '#cfe6f7'; viewport.ctx.font = '14px sans-serif';
    viewport.ctx.fillText(`Click an upgrade to buy · Next hunt: day ${session.progress.day}`, viewport.W / 2, 70);
    if (session.progress.moon) {
      viewport.ctx.fillStyle = '#ffd34d'; viewport.ctx.font = 'bold 12px sans-serif';
      viewport.ctx.fillText(`🌕 You reached the moon on day ${session.progress.moon}`, viewport.W / 2, 88);
    }
    viewport.ctx.textAlign = 'right'; viewport.ctx.fillStyle = '#ffd34d'; viewport.ctx.font = 'bold 26px monospace';
    viewport.ctx.fillText(`$${session.progress.money}`, viewport.W - 24, 32);
    viewport.ctx.fillStyle = '#aab'; viewport.ctx.font = '12px sans-serif';
    viewport.ctx.fillText('wallet', viewport.W - 24, 48);

    const list = systems.progression.shopUpgrades();
    const narrow = viewport.W < 520;
    const { cols, top: gy, tileHeight: ch, gap } = shopMetrics();
    const cw = Math.min(280, (viewport.W - 32 - (cols - 1) * gap) / cols);
    const rowStep = ch + gap;
    const gx = (viewport.W - (cols * cw + (cols - 1) * gap)) / 2;
    session.shopScroll = 0;
    list.forEach((u, i) => {
      const x = gx + (i % cols) * (cw + gap), y = gy + Math.floor(i / cols) * rowStep;
      const t = systems.progression.tier(u.id), costs = systems.progression.upgradeCosts(u), maxed = t >= costs.length;
      const enabled = !maxed && t < systems.progression.upgradeCap(u) && session.progress.money >= costs[t];
      const hover = session.mouse.x >= x && session.mouse.x <= x + cw && session.mouse.y >= y && session.mouse.y <= y + ch;
      session.uiButtons.push({ x, y, w: cw, h: ch, label: u.name, id: u.id, enabled, onClick: () => systems.progression.buyUpgrade(u.id) });
      viewport.ctx.fillStyle = hover && enabled ? '#2c4b69' : 'rgba(20,32,50,0.95)'; viewport.ctx.fillRect(x, y, cw, ch);
      viewport.ctx.strokeStyle = hover && enabled ? '#ffd34d' : maxed ? '#7fd67f' : 'rgba(255,255,255,0.2)'; viewport.ctx.lineWidth = 1;
      viewport.ctx.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
      viewport.ctx.textAlign = 'left'; viewport.ctx.fillStyle = '#fff'; viewport.ctx.font = 'bold 13px sans-serif';
      viewport.ctx.fillText(u.name, x + 8, y + 16, cw - 16);
      viewport.ctx.font = `${narrow ? 10 : 11}px sans-serif`; viewport.ctx.fillStyle = '#cfe6f7';
      viewport.ctx.fillText(`Now: ${u.stat(t)}`, x + 8, y + 30, cw - 16);
      viewport.ctx.fillStyle = '#7fd67f';
      viewport.ctx.fillText(maxed ? 'Fully upgraded' : `Next: ${u.stat(t + 1)}`, x + 8, y + 43, cw - 16);
      if (ch >= 94) {
        viewport.ctx.fillStyle = '#9aa7b8';
        viewport.ctx.fillText(u.desc, x + 8, y + 59, cw - 16);
      }
      viewport.ctx.font = '11px sans-serif'; viewport.ctx.fillStyle = '#cfe6f7';
      viewport.ctx.fillText(`${t}/${costs.length}`, x + 8, y + ch - 8);
      viewport.ctx.textAlign = 'right';
      viewport.ctx.fillStyle = maxed ? '#7fd67f' : !enabled ? '#9aa7b8' : '#ffd34d';
      viewport.ctx.fillText(maxed ? 'MAX' : `Buy $${costs[t]}`, x + cw - 8, y + ch - 8);
    });

    const got = ACHIEVEMENTS.filter(a => session.progress.ach[a.id]).length;
    if (narrow) {
      drawButton(16, viewport.H - 102, viewport.W - 32, 40, `Start day ${session.progress.day} →`, systems.session.startDay, { primary: true, font: 'bold 17px sans-serif', id: 'startDay' });
      const utilityY = viewport.H - 50, utilityWidth = (viewport.W - 48) / 2;
      drawButton(16, utilityY, utilityWidth, 32, session.confirmReset ? 'Click again to wipe' : 'Reset progress',
                 () => { if (session.confirmReset) systems.session.resetProgress(); else session.confirmReset = true; }, { font: '12px sans-serif' });
      drawButton(32 + utilityWidth, utilityY, utilityWidth, 32, `Achievements ${got}/${ACHIEVEMENTS.length}`, () => { session.achView = true; }, { font: 'bold 12px sans-serif' });
    } else {
      drawButton(viewport.W / 2 - 120, viewport.H - 62, 240, 42, `Start day ${session.progress.day} →`, systems.session.startDay, { primary: true, font: 'bold 17px sans-serif', id: 'startDay' });
      drawButton(16, viewport.H - 50, 150, 30, session.confirmReset ? 'Click again to wipe' : 'Reset progress',
                 () => { if (session.confirmReset) systems.session.resetProgress(); else session.confirmReset = true; }, { font: '12px sans-serif' });
      drawButton(viewport.W - 196, viewport.H - 50, 180, 30, `🏆 Achievements ${got}/${ACHIEVEMENTS.length}`, () => { session.achView = true; }, { font: 'bold 13px sans-serif' });
    }
    if (!narrow && session.progress.best.earned > 0) {
      viewport.ctx.textAlign = 'right'; viewport.ctx.fillStyle = '#9aa7b8'; viewport.ctx.font = '12px sans-serif';
      viewport.ctx.fillText(`Best day $${session.progress.best.earned}  ·  top speed ${session.progress.best.speed} km/h`, viewport.W - 16, viewport.H - 58);
    }
  }

  function shopMetrics() {
    const narrow = viewport.W < 520;
    const cols = viewport.W >= 1080 ? 4 : viewport.W >= 520 || viewport.H < 740 ? 3 : 2;
    const rows = Math.ceil(systems.progression.shopUpgrades().length / cols);
    const top = 100, bottom = viewport.H - (narrow ? 112 : 80), gap = 6;
    const tileHeight = Math.min(110, Math.floor((bottom - top) / rows) - gap);
    const contentHeight = rows * (tileHeight + gap);
    return { top, bottom, rows, cols, tileHeight, gap, contentHeight, scroll: 0, maxScroll: 0 };
  }

  function drawAchievements() {
    session.uiButtons = [];
    const list = systems.progression.visibleAchievements();
    const cols = viewport.W >= 900 ? 2 : 1, gap = 10;
    const rows = Math.ceil(list.length / cols);
    const rowH = Math.min(46, Math.floor((viewport.H - 150) / rows));
    const cw = Math.min(400, (viewport.W - 80 - (cols - 1) * gap) / cols);
    const pw = cols * cw + (cols - 1) * gap + 40, ph = Math.min(viewport.H - 30, 120 + rows * rowH);
    const x0 = (viewport.W - pw) / 2, y0 = (viewport.H - ph) / 2;
    drawPanel(x0, y0, pw, ph);
    const got = ACHIEVEMENTS.filter(a => session.progress.ach[a.id]);
    viewport.ctx.textAlign = 'center'; viewport.ctx.fillStyle = '#ffd34d'; viewport.ctx.font = 'bold 24px sans-serif';
    viewport.ctx.fillText('Achievements', viewport.W / 2, y0 + 36);
    viewport.ctx.fillStyle = '#cfe6f7'; viewport.ctx.font = '13px sans-serif';
    viewport.ctx.fillText(`${got.length}/${ACHIEVEMENTS.length} earned  ·  $${got.reduce((s, a) => s + a.reward, 0)} in rewards`, viewport.W / 2, y0 + 56);
    const species = Object.keys(SPECIES), caught = species.filter(k => session.progress.caught[k]).length;
    list.forEach((a, i) => {
      const x = x0 + 20 + (i % cols) * (cw + gap), y = y0 + 70 + Math.floor(i / cols) * rowH;
      const day = session.progress.ach[a.id];
      viewport.ctx.fillStyle = day ? 'rgba(255,211,77,0.12)' : 'rgba(255,255,255,0.04)'; viewport.ctx.fillRect(x, y, cw, rowH - 6);
      viewport.ctx.textAlign = 'left'; viewport.ctx.font = '20px sans-serif';
      viewport.ctx.globalAlpha = day ? 1 : 0.35;
      viewport.ctx.fillText(day ? '🏆' : '🔒', x + 8, y + rowH / 2 + 5);
      viewport.ctx.globalAlpha = 1;
      viewport.ctx.fillStyle = day ? '#ffd34d' : '#e8eef5'; viewport.ctx.font = 'bold 14px sans-serif';
      const secret = a.hidden && !day;
      viewport.ctx.fillText(a.name, x + 40, y + 14, cw - (secret ? 50 : 110));
      viewport.ctx.fillStyle = '#9aa7b8'; viewport.ctx.font = '11px sans-serif';
      const extra = a.id === 'naturalist' && !day ? `  (${caught}/${species.length})` : '';
      viewport.ctx.fillText(a.desc + extra, x + 40, y + rowH - 10, cw - (secret ? 50 : 120));
      viewport.ctx.textAlign = 'right'; viewport.ctx.font = 'bold 13px monospace';
      viewport.ctx.fillStyle = day ? '#7fd67f' : '#ffdd55';
      if (!secret) viewport.ctx.fillText(`$${a.reward}`, x + cw - 10, y + 14);
      if (day) { viewport.ctx.fillStyle = '#9aa7b8'; viewport.ctx.font = '10px sans-serif'; viewport.ctx.fillText(day > 0 ? `day ${day}` : 'earned', x + cw - 10, y + rowH - 10); }
    });
    drawButton(viewport.W / 2 - 70, y0 + ph - 44, 140, 32, 'Back', () => { session.achView = false; }, { primary: true });
  }
  return { drawRecap, drawShop, shopMetrics };
}
