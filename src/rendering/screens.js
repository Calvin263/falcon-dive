import { HAZARD_NAME, ACHIEVEMENTS, SPECIES } from '../config.js';
import { clamp } from '../core/math.js';

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
      const key = kind + (c.turtleHit ? ':turtle' : '');
      if (!groups.has(key)) groups.set(key, { kind, turtleHit: !!c.turtleHit, count: 0, pts: 0, tags: new Set() });
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
    const ended = { crash: 'Crashed', cat: 'Caught by a cat', hunter: 'Shot by a hunter', hawk: 'Taken by a goshawk', octopus: 'Grabbed by the octopus', drown: 'Drowned' }[r.reason];
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
      viewport.ctx.textAlign = 'left';
      viewport.ctx.fillStyle = '#fff'; viewport.ctx.font = 'bold 16px sans-serif';
      const label = row.s ? `Stolen by a buzzard: ${catchName(g)}` : `${catchName(g)}${g.turtleHit ? ' (turtle strike)' : ''}  ×${g.count}`;
      viewport.ctx.fillText(label, x0 + 62, y + (row.s ? 25 : 19));
      if (row.g && g.tags.size) {
        viewport.ctx.fillStyle = '#9fd8ff'; viewport.ctx.font = '11px sans-serif';
        viewport.ctx.fillText([...g.tags].join(' · '), x0 + 62, y + 34);
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
    viewport.ctx.fillStyle = 'rgba(4,8,16,0.82)';
    viewport.ctx.fillRect(0, 0, viewport.W, viewport.H);
    viewport.ctx.textAlign = 'center'; viewport.ctx.fillStyle = '#ffd34d'; viewport.ctx.font = 'bold 32px sans-serif';
    viewport.ctx.fillText('The Roost', viewport.W / 2, 46);
    viewport.ctx.fillStyle = '#cfe6f7'; viewport.ctx.font = '14px sans-serif';
    viewport.ctx.fillText(`Spend your earnings, then head out for day ${session.progress.day}`, viewport.W / 2, 70);
    viewport.ctx.fillStyle = session.progress.moon ? '#ffd34d' : '#8fa3b8'; viewport.ctx.font = session.progress.moon ? 'bold 12px sans-serif' : '12px sans-serif';
    viewport.ctx.fillText(session.progress.moon ? `🌕 You reached the moon on day ${session.progress.moon}` : '🌕 Goal: bounce high enough to reach the moon', viewport.W / 2, 88);
    viewport.ctx.textAlign = 'right'; viewport.ctx.fillStyle = '#ffd34d'; viewport.ctx.font = 'bold 26px monospace';
    viewport.ctx.fillText(`$${session.progress.money}`, viewport.W - 24, 46);
    viewport.ctx.fillStyle = '#aab'; viewport.ctx.font = '12px sans-serif';
    viewport.ctx.fillText('wallet', viewport.W - 24, 64);

    const list = systems.progression.shopUpgrades();
    const narrow = viewport.W < 520;
    const cols = viewport.W >= 1080 ? 3 : viewport.W >= 720 ? 2 : 1, gap = 10;
    const cw = Math.min(340, (viewport.W - (narrow ? 32 : 40) - (cols - 1) * gap) / cols);
    const rowsN = Math.ceil(list.length / cols), ch = narrow ? 92 : 88, rowStep = ch + gap;
    const gx = (viewport.W - (cols * cw + (cols - 1) * gap)) / 2;
    const gy = narrow ? 104 : 100;
    const footerHeight = narrow ? 112 : 80;
    const listBottom = viewport.H - footerHeight;
    const listHeight = Math.max(0, listBottom - gy);
    const contentHeight = rowsN * rowStep - gap;
    const maxScroll = Math.max(0, contentHeight - listHeight);
    session.shopScroll = clamp(session.shopScroll || 0, 0, maxScroll);
    const offset = session.shopScroll;

    viewport.ctx.save();
    viewport.ctx.beginPath();
    viewport.ctx.rect(0, gy, viewport.W, listHeight);
    viewport.ctx.clip();
    list.forEach((u, i) => {
      const x = gx + (i % cols) * (cw + gap), y = gy + Math.floor(i / cols) * rowStep - offset;
      if (y < gy || y + ch > listBottom) return;
      const t = systems.progression.tier(u.id), costs = systems.progression.upgradeCosts(u), maxed = t >= costs.length, capped = !maxed && t >= systems.progression.upgradeCap(u);
      viewport.ctx.fillStyle = 'rgba(20,32,50,0.95)'; viewport.ctx.fillRect(x, y, cw, ch);
      viewport.ctx.strokeStyle = maxed ? 'rgba(127,214,127,0.6)' : 'rgba(255,255,255,0.2)'; viewport.ctx.lineWidth = 1;
      viewport.ctx.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
      viewport.ctx.textAlign = 'left'; viewport.ctx.fillStyle = '#fff'; viewport.ctx.font = 'bold 15px sans-serif';
      viewport.ctx.fillText(u.name, x + 12, y + 21);
      // Tier pips
      for (let k = 0; k < costs.length; k++) {
        viewport.ctx.fillStyle = k < t ? '#ffd34d' : 'rgba(255,255,255,0.18)';
        viewport.ctx.beginPath(); viewport.ctx.arc(x + cw - 16 - (costs.length - 1 - k) * 14, y + 16, 5, 0, Math.PI * 2); viewport.ctx.fill();
      }
      viewport.ctx.fillStyle = '#9aa7b8'; viewport.ctx.font = '11px sans-serif';
      viewport.ctx.fillText(u.desc, x + 12, y + 40, cw - 24);
      const textW = Math.max(80, cw - 112);
      viewport.ctx.fillStyle = '#e8eef5'; viewport.ctx.font = '12px sans-serif';
      viewport.ctx.fillText(`Now: ${u.stat(t)}`, x + 12, y + 58, textW);
      if (!maxed && !capped) {
        viewport.ctx.fillStyle = capped ? '#9aa7b8' : '#7fd67f';
        viewport.ctx.fillText(`Next: ${u.stat(t + 1)}`, x + 12, y + 76, textW);
      }
      const cost = maxed ? 0 : costs[t];
      drawButton(x + cw - 92, y + 51, 80, 28, maxed ? 'MAXED' : capped ? 'LOCKED' : `$${cost}`, () => systems.progression.buyUpgrade(u.id),
             { enabled: !maxed && !capped && session.progress.money >= cost, primary: !maxed && !capped, font: 'bold 14px monospace', id: u.id });
      if (capped) {
        viewport.ctx.fillStyle = '#ffb36b'; viewport.ctx.font = '10px sans-serif'; viewport.ctx.textAlign = 'right';
        viewport.ctx.fillText(u.capHint, x + cw - 12, y + 76, Math.max(0, cw - 112));
      }
    });
    viewport.ctx.restore();

    const got = ACHIEVEMENTS.filter(a => session.progress.ach[a.id]).length;
    if (narrow) {
      drawButton(16, viewport.H - 102, viewport.W - 32, 40, `Start day ${session.progress.day} →`, systems.session.startDay, { primary: true, font: 'bold 17px sans-serif', id: 'startDay' });
      const utilityY = viewport.H - 50, utilityWidth = (viewport.W - 48) / 2;
      drawButton(16, utilityY, utilityWidth, 32, 'Reset progress',
                 () => { if (session.confirmReset) systems.session.resetProgress(); else session.confirmReset = true; }, { font: '12px sans-serif' });
      drawButton(32 + utilityWidth, utilityY, utilityWidth, 32, `Achievements ${got}/${ACHIEVEMENTS.length}`, () => { session.achView = true; }, { font: 'bold 12px sans-serif' });
      if (maxScroll > 0) {
        viewport.ctx.fillStyle = '#cfe6f7'; viewport.ctx.font = '11px sans-serif'; viewport.ctx.textAlign = 'center';
        viewport.ctx.fillText(`${Math.floor(offset / rowStep) + 1}–${Math.min(rowsN, Math.ceil((offset + listHeight) / rowStep))} of ${rowsN}  ·  scroll to browse`, viewport.W / 2, listBottom - 5);
      }
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
    if (session.achView) drawAchievements();
  }

  function scrollShop(delta) {
    if (session.screen !== 'shop' || session.achView) return;
    const list = systems.progression.shopUpgrades();
    const cols = viewport.W >= 1080 ? 3 : viewport.W >= 720 ? 2 : 1;
    const rows = Math.ceil(list.length / cols), rowStep = (viewport.W < 520 ? 92 : 88) + 10;
    const top = viewport.W < 520 ? 104 : 100;
    const footer = viewport.W < 520 ? 112 : 80;
    const maxScroll = Math.max(0, rows * rowStep - 10 - (viewport.H - footer - top));
    session.shopScroll = clamp((session.shopScroll || 0) + delta, 0, maxScroll);
  }
  function shopMetrics() {
    const narrow = viewport.W < 520;
    const cols = viewport.W >= 1080 ? 3 : viewport.W >= 720 ? 2 : 1;
    const rows = Math.ceil(systems.progression.shopUpgrades().length / cols);
    const top = narrow ? 104 : 100, bottom = viewport.H - (narrow ? 112 : 80);
    const contentHeight = rows * ((narrow ? 92 : 88) + 10) - 10;
    return { top, bottom, rows, contentHeight, scroll: session.shopScroll || 0, maxScroll: Math.max(0, contentHeight - (bottom - top)) };
  }

  // Achievement list over the Roost: earned ones in gold with the day, the rest dimmed
  function drawAchievements() {
    session.uiButtons = [];
    viewport.ctx.fillStyle = 'rgba(0,0,0,0.6)'; viewport.ctx.fillRect(0, 0, viewport.W, viewport.H);
    const cols = viewport.W >= 900 ? 2 : 1, rowH = 46, gap = 10;
    const rows = Math.ceil(ACHIEVEMENTS.length / cols);
    const cw = Math.min(400, (viewport.W - 80 - (cols - 1) * gap) / cols);
    const pw = cols * cw + (cols - 1) * gap + 40, ph = Math.min(viewport.H - 30, 120 + rows * rowH);
    const x0 = (viewport.W - pw) / 2, y0 = (viewport.H - ph) / 2;
    drawPanel(x0, y0, pw, ph);
    const got = ACHIEVEMENTS.filter(a => session.progress.ach[a.id]);
    viewport.ctx.textAlign = 'center'; viewport.ctx.fillStyle = '#ffd34d'; viewport.ctx.font = 'bold 24px sans-serif';
    viewport.ctx.fillText('Achievements', viewport.W / 2, y0 + 36);
    viewport.ctx.fillStyle = '#cfe6f7'; viewport.ctx.font = '13px sans-serif';
    viewport.ctx.fillText(`${got.length} of ${ACHIEVEMENTS.length} earned  ·  $${got.reduce((s, a) => s + a.reward, 0)} in rewards`, viewport.W / 2, y0 + 56);
    const species = Object.keys(SPECIES), caught = species.filter(k => session.progress.caught[k]).length;
    ACHIEVEMENTS.forEach((a, i) => {
      const x = x0 + 20 + (i % cols) * (cw + gap), y = y0 + 70 + Math.floor(i / cols) * rowH;
      const day = session.progress.ach[a.id];
      viewport.ctx.fillStyle = day ? 'rgba(255,211,77,0.12)' : 'rgba(255,255,255,0.04)'; viewport.ctx.fillRect(x, y, cw, rowH - 6);
      viewport.ctx.textAlign = 'left'; viewport.ctx.font = '20px sans-serif';
      viewport.ctx.globalAlpha = day ? 1 : 0.35;
      viewport.ctx.fillText(day ? '🏆' : '🔒', x + 8, y + 27);
      viewport.ctx.globalAlpha = 1;
      viewport.ctx.fillStyle = day ? '#ffd34d' : '#e8eef5'; viewport.ctx.font = 'bold 14px sans-serif';
      viewport.ctx.fillText(a.name, x + 40, y + 17);
      viewport.ctx.fillStyle = '#9aa7b8'; viewport.ctx.font = '11px sans-serif';
      const extra = a.id === 'naturalist' && !day ? `  (${caught}/${species.length})` : '';
      viewport.ctx.fillText(a.desc + extra, x + 40, y + 33, cw - 120);
      viewport.ctx.textAlign = 'right'; viewport.ctx.font = 'bold 13px monospace';
      viewport.ctx.fillStyle = day ? '#7fd67f' : '#ffdd55';
      viewport.ctx.fillText(`$${a.reward}`, x + cw - 10, y + 17);
      if (day) { viewport.ctx.fillStyle = '#9aa7b8'; viewport.ctx.font = '10px sans-serif'; viewport.ctx.fillText(day > 0 ? `day ${day}` : 'earned', x + cw - 10, y + 32); }
    });
    drawButton(viewport.W / 2 - 70, y0 + ph - 44, 140, 32, 'Back', () => { session.achView = false; }, { primary: true });
  }
  return { drawRecap, drawShop, scrollShop, shopMetrics };
}
