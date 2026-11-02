import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => errors.push(request.url()));
  page.errors = errors;
  await page.goto('/');
  await page.waitForFunction(() => window.__falconDiveDebug?.getMetrics().renders >= 3);
  const diagnostics = await page.evaluate(() => window.__falconDiveDebug.getMetrics().diagnostics);
  expect(diagnostics.sampleFrames).toBeGreaterThan(0);
  expect(diagnostics.renderFps).toBeGreaterThan(0);
  expect(diagnostics.scene).toHaveProperty('visibleFlockMembers');
  expect(diagnostics.scene.peak).toHaveProperty('particles');
});

test.afterEach(async ({ page }) => {
  expect(page.errors).toEqual([]);
});

test('draws a responsive, nonblank game and preserves controls', async ({ page }, testInfo) => {
  await expect(page.locator('#game')).toBeVisible();
  const drawing = await page.evaluate(() => {
    const canvas = document.querySelector('#game');
    const ctx = canvas.getContext('2d');
    const colors = new Set();
    for (let row = 1; row < 10; row++) {
      for (let column = 1; column < 10; column++) {
        colors.add([...ctx.getImageData(column * canvas.width / 10, row * canvas.height / 10, 1, 1).data].join(','));
      }
    }
    return { width: canvas.width, height: canvas.height, colors: colors.size };
  });
  const canvasMetrics = await page.evaluate(() => window.__falconDiveDebug.getMetrics().canvas);
  expect(canvasMetrics.resolutionScale).toBe(0.75);
  expect(drawing.width).toBe(Math.round(page.viewportSize().width * 0.75));
  expect(drawing.height).toBe(Math.round(page.viewportSize().height * 0.75));
  expect(canvasMetrics.logicalWidth).toBe(page.viewportSize().width);
  expect(canvasMetrics.logicalHeight).toBe(page.viewportSize().height);
  expect(canvasMetrics.hudWidth).toBe(canvasMetrics.logicalWidth);
  expect(canvasMetrics.hudHeight).toBe(canvasMetrics.logicalHeight);
  expect(await page.locator('#game').evaluate(canvas => canvas.getBoundingClientRect().width)).toBe(page.viewportSize().width);
  expect(await page.locator('#game').evaluate(canvas => canvas.getBoundingClientRect().height)).toBe(page.viewportSize().height);
  expect(drawing.colors).toBeGreaterThan(5);
  await page.mouse.move(page.viewportSize().width - 10, 65);
  await expect.poll(() => page.evaluate(() => window.__falconDiveDebug.bird.angle)).toBeGreaterThan(0.05);
  await page.mouse.down();
  await expect.poll(() => page.evaluate(() => window.__falconDiveDebug.bird.mode)).toBe('BRAKE');
  await page.mouse.up();
  await page.evaluate(() => { window.__falconDiveDebug.bird.carrying = { kind: 'turtle' }; });
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => window.__falconDiveDebug.bird.carrying)).toBeNull();
  expect(await page.evaluate(() => window.__falconDiveDebug.state.fallers.length)).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('hunt.png') });
});

test('falling turtle sprite scale follows camera zoom', async ({ page }) => {
  const scales = await page.evaluate(() => {
    const game = window.__falconDiveDebug;
    const prototype = CanvasRenderingContext2D.prototype;
    const originalScale = prototype.scale;
    function scaleAtZoom(zoom) {
      game.startDay();
      game.cam.x = 0;
      game.cam.alt = 70;
      game.cam.zoom = game.cam.zoomY = zoom;
      game.state.fallers = [{ x: 0, alt: 70, vx: 1, spin: 0 }];
      const calls = [];
      prototype.scale = function (x, y) {
        calls.push([x, y]);
        return originalScale.call(this, x, y);
      };
      try { game.render(); } finally { prototype.scale = originalScale; }
      return calls;
    }
    return [scaleAtZoom(2.5), scaleAtZoom(5)];
  });
  expect(scales[0].some(([x, y]) => Math.abs(x - 1.225) < 0.0005 && Math.abs(y - 1.225) < 0.0005)).toBe(true);
  expect(scales[1].some(([x, y]) => Math.abs(x - 2.45) < 0.0005 && Math.abs(y - 2.45) < 0.0005)).toBe(true);
});

test('pause menu graphics presets update resolution and persist', async ({ page }) => {
  await page.keyboard.press('p');
  for (const [preset, scale] of [['low', 0.5], ['high', 1], ['medium', 0.75]]) {
    const option = await page.evaluate(id => window.__falconDiveDebug.graphicsOptions.find(item => item.id === id), preset);
    await page.mouse.click(option.x + option.width / 2, option.y + option.height / 2);
    const result = await page.evaluate(() => ({
      paused: window.__falconDiveDebug.session.paused,
      canvas: window.__falconDiveDebug.getMetrics().canvas,
      saved: JSON.parse(localStorage.getItem('falconDive.settings')).graphicsPreset,
    }));
    expect(result.paused).toBe(true);
    expect(result.canvas.resolutionScale).toBe(scale);
    expect(result.canvas.width).toBe(Math.round(result.canvas.logicalWidth * scale));
    expect(result.canvas.hudWidth).toBe(result.canvas.logicalWidth);
    expect(result.canvas.hudHeight).toBe(result.canvas.logicalHeight);
    expect(result.saved).toBe(preset);
  }
  await page.reload();
  await page.waitForFunction(() => window.__falconDiveDebug?.getMetrics().renders > 0);
  expect(await page.evaluate(() => window.__falconDiveDebug.getMetrics().canvas.resolutionScale)).toBe(0.75);
});

test('scene diagnostics report visible turtle and predator counts', async ({ page }) => {
  const scene = await page.evaluate(() => {
    const game = window.__falconDiveDebug;
    game.startDay();
    game.cam.x = game.bird.x = 0;
    game.cam.alt = 70;
    game.cam.zoom = game.cam.zoomY = 2.5;
    game.prey.length = 0;
    game.prey.push({ kind: 'turtle', x: 0 });
    game.state.fallers.push({ x: 0, alt: 1 });
    game.bird.carrying = { kind: 'turtle' };
    game.state.hazards.cats.push({ x: 0, alt: 0, mode: 'sit' });
    game.state.hazards.hunters.push({ x: 0 });
    return game.getMetrics().diagnostics.scene;
  });
  expect(scene.visibleTurtles).toBe(1);
  expect(scene.visibleTurtleFallers).toBe(1);
  expect(scene.carriedTurtle).toBe(1);
  expect(scene.cats).toBe(1);
  expect(scene.visibleCats).toBe(1);
  expect(scene.hunters).toBe(1);
  expect(scene.visibleHunters).toBe(1);
});

test('paused and hidden scenes stop rendering and resume cleanly', async ({ page }) => {
  const historyBeforePause = await page.evaluate(() => window.__falconDiveDebug.getMetrics().diagnostics.sampleFrames);
  await page.keyboard.press('p');
  await page.waitForTimeout(100);
  const paused = await page.evaluate(() => ({
    time: window.__falconDiveDebug.state.time,
    renders: window.__falconDiveDebug.getMetrics().renders,
    sampleFrames: window.__falconDiveDebug.getMetrics().diagnostics.sampleFrames,
  }));
  expect(paused.sampleFrames).toBeGreaterThan(0);
  expect(paused.sampleFrames).toBeGreaterThanOrEqual(historyBeforePause);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.__falconDiveDebug.state.time)).toBe(paused.time);
  expect(await page.evaluate(() => window.__falconDiveDebug.getMetrics().renders)).toBe(paused.renders);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__falconDiveDebug.state.time)).toBeGreaterThan(paused.time);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hiddenRenders = await page.evaluate(() => window.__falconDiveDebug.getMetrics().renders);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.__falconDiveDebug.getMetrics().renders)).toBe(hiddenRenders);
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => page.evaluate(() => window.__falconDiveDebug.getMetrics().renders)).toBeGreaterThan(hiddenRenders);
});

test('diagnostics retain a severe main-thread frame gap', async ({ page }) => {
  await page.evaluate(() => {
    const deadline = performance.now() + 1100;
    let iterations = 0;
    while (performance.now() < deadline) iterations++;
    return iterations;
  });
  await expect.poll(() => page.evaluate(() => window.__falconDiveDebug.getMetrics().diagnostics.slowFrames.some(frame => frame.frameGapMs > 1000))).toBe(true);
});

test('recap, roost, persistence, and next-day flow remain playable', async ({ page }, testInfo) => {
  await page.evaluate(() => {
    const game = window.__falconDiveDebug;
    game.state.score = 200;
    game.endDay('sunset');
    game.showRecap();
    game.invalidate();
  });
  await expect.poll(() => page.evaluate(() => window.__falconDiveDebug.screen)).toBe('recap');
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => window.__falconDiveDebug.screen)).toBe('shop');
  await page.evaluate(() => window.__falconDiveDebug.render());
  const initialShop = await page.evaluate(() => ({
    metrics: window.__falconDiveDebug.shopMetrics,
    buttons: window.__falconDiveDebug.buttons.map(({ x, y, w, h, label, id }) => ({ x, y, w, h, label, id })),
  }));
  const start = initialShop.buttons.find(button => button.id === 'startDay');
  const reset = initialShop.buttons.find(button => button.label === 'Reset progress');
  const achievements = initialShop.buttons.find(button => button.label.includes('Achievements'));
  expect(start.y + start.h).toBeLessThanOrEqual(page.viewportSize().height);
  expect(reset.y).toBe(achievements.y);
  expect(reset.x + reset.w).toBeLessThan(achievements.x);
  expect(initialShop.buttons.some(button => button.id === 'muscles')).toBe(true);
  expect(initialShop.metrics.maxScroll).toBe(0);
  expect(initialShop.metrics.top + initialShop.metrics.contentHeight).toBeLessThanOrEqual(initialShop.metrics.bottom);
  await page.screenshot({ path: testInfo.outputPath('roost.png') });
  await expect.poll(() => page.evaluate(() => window.__falconDiveDebug.buttons.some(button => button.id === 'bounce'))).toBe(true);
  const muscles = initialShop.buttons.find(button => button.id === 'muscles');
  await page.mouse.click(muscles.x + muscles.w / 2, muscles.y + muscles.h / 2);
  const buy = await page.evaluate(() => {
    window.__falconDiveDebug.render();
    const { x, y, w, h } = window.__falconDiveDebug.buttons.find(button => button.id === 'buyUpgrade');
    return { x, y, w, h };
  });
  await page.mouse.click(buy.x + buy.w / 2, buy.y + buy.h / 2);
  expect(await page.evaluate(() => window.__falconDiveDebug.progress.up.muscles)).toBe(1);
  await page.reload();
  await page.waitForFunction(() => window.__falconDiveDebug?.screen === 'shop');
  expect(await page.evaluate(() => window.__falconDiveDebug.progress.up.muscles)).toBe(1);
  await page.waitForTimeout(1500);
  const idleRenders = await page.evaluate(() => window.__falconDiveDebug.getMetrics().renders);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__falconDiveDebug.getMetrics().renders)).toBe(idleRenders);
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => window.__falconDiveDebug.screen)).toBe('hunt');
  expect(await page.evaluate(() => window.__falconDiveDebug.state.day)).toBe(2);
});

test('fully unlocked shop exposes every tile without scrolling or overlapping controls', async ({ page }, testInfo) => {
  const layout = await page.evaluate(() => {
    const game = window.__falconDiveDebug;
    game.progress.gunFound = true;
    game.progress.swum = true;
    game.progress.up.eyas = 1;
    game.progress.money = 10000;
    game.showShop();
    game.render();
    return {
      metrics: game.shopMetrics,
      buttons: game.buttons.map(({ x, y, w, h, id }) => ({ x, y, w, h, id })),
    };
  });
  expect(layout.metrics.maxScroll).toBe(0);
  expect(layout.metrics.top + layout.metrics.contentHeight).toBeLessThanOrEqual(layout.metrics.bottom);
  const tiles = layout.buttons.filter(button => button.id && !['startDay', 'buyUpgrade'].includes(button.id));
  expect(tiles).toHaveLength(18);
  for (const tile of tiles) {
    expect(tile.x).toBeGreaterThanOrEqual(0);
    expect(tile.x + tile.w).toBeLessThanOrEqual(page.viewportSize().width);
    expect(tile.y).toBeGreaterThanOrEqual(layout.metrics.top);
    expect(tile.y + tile.h).toBeLessThanOrEqual(layout.metrics.bottom);
    await page.mouse.click(tile.x + tile.w / 2, tile.y + tile.h / 2);
    const selection = await page.evaluate(() => {
      const game = window.__falconDiveDebug;
      const ctx = document.querySelector('#hud-overlay').getContext('2d');
      const original = ctx.fillText;
      const text = [];
      let inShop = false;
      const metrics = game.shopMetrics;
      const detailTop = metrics.top + metrics.rows * (metrics.tileHeight + metrics.gap);
      ctx.fillText = function (label, x, y, ...args) {
        if (label === 'The Roost') inShop = true;
        if (inShop && y > detailTop && y < detailTop + metrics.detailHeight && !String(label).startsWith('Buy $')) {
          text.push({ label: String(label), y, width: this.measureText(label).width });
        }
        return original.call(this, label, x, y, ...args);
      };
      try { game.render(); } finally { ctx.fillText = original; }
      const buy = game.buttons.find(button => button.id === 'buyUpgrade');
      return { id: game.session.shopSelection, buy: buy.enabled, text, buyY: buy.y };
    });
    expect(selection.id).toBe(tile.id);
    expect(selection.buy).toBe(true);
    expect(selection.text.some(item => item.label.startsWith('Now:'))).toBe(true);
    expect(selection.text.some(item => item.label.startsWith('Next:'))).toBe(true);
    for (const text of selection.text) {
      expect(text.y).toBeLessThan(selection.buyY - 5);
      expect(text.width).toBeLessThanOrEqual(page.viewportSize().width - 56);
    }
  }
  for (const [i, a] of layout.buttons.entries()) {
    for (const b of layout.buttons.slice(i + 1)) {
      expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
    }
  }
  await page.mouse.wheel(0, 1000);
  expect(await page.evaluate(() => window.__falconDiveDebug.session.shopScroll)).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('roost-all-upgrades.png') });
});

test('speedometer stays bottom-left and horizontal focus shows energy and lock state', async ({ page }, testInfo) => {
  const capture = async (energy, locked) => page.evaluate(({ energy, locked }) => {
    const game = window.__falconDiveDebug;
    game.startDay();
    game.session.paused = true;
    game.bird.brakeE = energy;
    game.bird.brakeLocked = locked;
    const ctx = document.querySelector('#game').getContext('2d');
    const textCtx = document.querySelector('#hud-overlay').getContext('2d');
    const originals = { arc: ctx.arc, fillRect: ctx.fillRect, moveTo: ctx.moveTo, lineTo: ctx.lineTo };
    const originalText = textCtx.fillText;
    const arcs = [], fills = [], text = [], points = [];
    ctx.arc = function (x, y, r, ...args) {
      arcs.push({ x, y, r });
      return originals.arc.call(this, x, y, r, ...args);
    };
    ctx.fillRect = function (x, y, w, h) {
      fills.push({ x, y, w, h, color: this.fillStyle });
      return originals.fillRect.call(this, x, y, w, h);
    };
    textCtx.fillText = function (label, x, y, ...args) {
      text.push({ label: String(label), x, y });
      return originalText.call(this, label, x, y, ...args);
    };
    ctx.moveTo = function (x, y) {
      points.push({ kind: 'move', x, y, color: this.strokeStyle });
      return originals.moveTo.call(this, x, y);
    };
    ctx.lineTo = function (x, y) {
      points.push({ kind: 'line', x, y, color: this.strokeStyle });
      return originals.lineTo.call(this, x, y);
    };
    try { game.render(); } finally { Object.assign(ctx, originals); textCtx.fillText = originalText; }
    return { arcs, fills, text, points };
  }, { energy, locked });
  const { width, height } = page.viewportSize();
  const radius = width < 720 ? 44 : 64;
  for (const [energy, locked] of [[1, false], [0.5, false], [0, true], [0.2, true]]) {
    const drawing = await capture(energy, locked);
    const dial = drawing.arcs.find(arc => arc.r === radius + 8);
    expect(dial.x - dial.r).toBeGreaterThanOrEqual(80);
    expect(dial.x + dial.r).toBeLessThan(width / 2);
    expect(dial.y).toBe(height - radius - 108);
    const focus = drawing.fills.find(fill => fill.h === 10 && fill.color === (locked ? '#ff5544' : '#66ccff'));
    expect(focus).toBeTruthy();
    expect(focus.w).toBeCloseTo(radius * 2 * energy);
    expect(focus.x).toBe(dial.x - radius);
    expect(focus.y).toBe(height - 40);
    const label = drawing.text.find(item => item.label === 'FOCUS');
    expect(label.y).toBe(height - 14);
    expect(label.x).toBe(dial.x);
    if (locked) {
      const marker = drawing.points.find(point => point.kind === 'move' && point.color === '#ffdd55' && point.y === focus.y - 4);
      expect(marker).toBeTruthy();
      expect(marker.x).toBeGreaterThan(focus.x);
      expect(marker.x).toBeLessThan(focus.x + radius * 2);
      expect(drawing.points.some(point => point.kind === 'line' && point.x === marker.x && point.y === focus.y + 14)).toBe(true);
    }
  }
  await page.screenshot({ path: testInfo.outputPath('bottom-left-instruments.png') });
});

test('eyas ammo stays visible and notices wrap above the flight area', async ({ page }, testInfo) => {
  const checkHud = async (ammo, carrying) => page.evaluate(({ ammo, carrying }) => {
    const game = window.__falconDiveDebug;
    game.progress.up.eyas = 3;
    game.progress.up.eyasgun = 2;
    game.progress.up.lucky = 1;
    game.progress.up.bounce = 1;
    game.startDay();
    game.session.paused = true;
    game.state.eyases.forEach((eyas, i) => { eyas.ammo = ammo[i]; });
    game.bird.carrying = carrying ? { kind: 'gun', ammo: 1 } : null;
    game.state.msg = 'A goshawk is hunting you! Break away from its dive.';
    game.state.msgT = 3;
    game.state.toast = { text: 'New upgrade unlocked in the Roost: Armed Eyases', t: 4 };
    const ctx = document.querySelector('#hud-overlay').getContext('2d');
    const original = ctx.fillText;
    const text = [];
    ctx.fillText = function (label, x, y, ...args) {
      const width = this.measureText(label).width;
      const left = this.textAlign === 'center' ? x - width / 2 : this.textAlign === 'right' ? x - width : x;
      text.push({ label: String(label), x, y, left, right: left + width });
      return original.call(this, label, x, y, ...args);
    };
    try { game.render(); } finally { ctx.fillText = original; }
    return text;
  }, { ammo, carrying });
  for (const carrying of [false, true]) {
    for (const ammo of [[4, 10, 2], [0, 0, 0]]) {
      const text = await checkHud(ammo, carrying);
      const readout = text.find(item => item.label.startsWith('Eyas ammo:'));
      expect(readout.label).toBe(`Eyas ammo: ${ammo.join(' / ')}`);
      expect(readout.left).toBeGreaterThanOrEqual(0);
      expect(readout.right).toBeLessThanOrEqual(page.viewportSize().width);
      expect(readout.right - readout.left).toBeLessThanOrEqual(154);
      const notices = text.filter(item => /goshawk|Break away|New upgrade|Roost:|Right-click|Space:/.test(item.label));
      expect(notices.length).toBeGreaterThanOrEqual(2);
      expect(readout.y).toBeGreaterThan(Math.max(...notices.map(notice => notice.y)) + 17);
      for (const notice of notices) {
        expect(notice.y).toBeLessThan(200);
        expect(notice.left).toBeGreaterThanOrEqual(16);
        expect(notice.right).toBeLessThanOrEqual(page.viewportSize().width - 16);
      }
    }
  }
  await page.screenshot({ path: testInfo.outputPath('hud-notices-ammo.png') });
});

test('recent catch names and all modifiers wrap separately from warnings and expire', async ({ page }, testInfo) => {
  const result = await page.evaluate(() => {
    const game = window.__falconDiveDebug;
    game.startDay();
    game.session.paused = true;
    game.progress.up.eyas = 1;
    game.progress.up.eyasgun = 1;
    game.state.eyases = [{ ammo: 4, mode: 'follow' }];
    game.state.time = 10;
    game.state.msg = 'A goshawk is hunting you!';
    game.state.msgT = 3;
    game.state.toast = { text: 'New upgrade unlocked in the Roost: Rifle', t: 4 };
    const tags = ['Turtle ×3', 'Stoop +100%', 'Unseen +50%', 'Fresh +$10', 'Chain ×2.0', 'Eyas share ×0.5', 'Double ricochet'];
    const caught = { kind: 'flock', label: 'TURTLE STRIKE! Starling', pts: 240, count: 3, speed: 20, tags, t: 10 };
    game.state.lastCatch = caught;
    game.state.catchLog = [caught];
    const ctx = document.querySelector('#hud-overlay').getContext('2d');
    const original = ctx.fillText;
    let text = [];
    ctx.fillText = function (label, x, y, ...args) {
      const width = this.measureText(label).width;
      const left = this.textAlign === 'center' ? x - width / 2 : this.textAlign === 'right' ? x - width : x;
      text.push({ label: String(label), y, left, right: left + width });
      return original.call(this, label, x, y, ...args);
    };
    try {
      game.render();
      const active = text;
      text = [];
      game.state.time = 14;
      game.render();
      const expired = text;
      text = [];
      game.state.time = 10;
      game.render();
      return { active, expired, tags };
    } finally { ctx.fillText = original; }
  });
  const heading = result.active.find(item => item.label === 'TURTLE STRIKE! Starling ×3 +$240');
  expect(heading).toBeTruthy();
  const warning = result.active.find(item => item.label.includes('goshawk is hunting'));
  const unlock = result.active.filter(item => /New upgrade|Roost: Rifle/.test(item.label));
  expect(heading.y).toBeGreaterThan(Math.max(warning.y, ...unlock.map(item => item.y)) + 17);
  const modifiers = result.active.filter(item => result.tags.some(tag => item.label.includes(tag)));
  expect(modifiers.map(item => item.label).join(' ')).toContain(result.tags.join(' · '));
  for (const line of [heading, ...modifiers]) {
    expect(line.left).toBeGreaterThanOrEqual(16);
    expect(line.right).toBeLessThanOrEqual(page.viewportSize().width - 16);
    expect(line.y).toBeLessThan(280);
  }
  const lastModifierY = Math.max(...modifiers.map(item => item.y));
  expect(lastModifierY).toBeGreaterThan(heading.y);
  const ammo = result.active.find(item => item.label.startsWith('Eyas ammo:'));
  expect(ammo.y).toBeGreaterThan(lastModifierY + 17);
  expect(result.expired.some(item => item.label.includes('TURTLE STRIKE!') || item.label.includes('Double ricochet'))).toBe(false);
  expect(result.expired.some(item => item.label.includes('goshawk is hunting'))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('recent-catch-feedback.png') });
});

test('right-side statuses stay below a busy catch log and inside the viewport', async ({ page }, testInfo) => {
  for (const armed of [false, true]) {
    const drawing = await page.evaluate(armed => {
      const game = window.__falconDiveDebug;
      Object.assign(game.progress.up, { eyas: 3, eyasgun: 2, bounce: 4, lucky: 2 });
      game.startDay();
      game.session.paused = true;
      game.bird.carrying = armed ? { kind: 'gun', ammo: 1 } : null;
      game.state.time = 10;
      game.state.chainN = 3;
      game.state.chainT = 10;
      game.state.catchLog = Array.from({ length: 30 }, () => ({ kind: 'rabbit', pts: 20, speed: 20, t: 0 }));
      game.state.msg = 'A goshawk is hunting you!';
      game.state.msgT = 3;
      game.state.toast = { text: 'New upgrade unlocked in the Roost: Rifle', t: 4 };
      const ctx = document.querySelector('#game').getContext('2d');
      const textCtx = document.querySelector('#hud-overlay').getContext('2d');
      const originalText = textCtx.fillText, originalRect = ctx.fillRect;
      const text = [], cards = [];
      textCtx.fillText = function (label, x, y, ...args) {
        text.push({ label: String(label), x, y, width: this.measureText(label).width });
        return originalText.call(this, label, x, y, ...args);
      };
      ctx.fillRect = function (x, y, w, h) {
        if (w === 92 && h === 50) cards.push({ x, y, w, h });
        return originalRect.call(this, x, y, w, h);
      };
      try { game.render(); } finally { textCtx.fillText = originalText; ctx.fillRect = originalRect; }
      return { text, cards };
    }, armed);
    expect(drawing.cards.length).toBeGreaterThan(0);
    expect(drawing.cards.length).toBeLessThan(30);
    const cardBottom = Math.max(...drawing.cards.map(card => card.y + card.h));
    const statuses = drawing.text.filter(item => /Lucky feather|Springy legs|Launch|E · Eyases|Eyas ammo:|^Ammo:|^\/ 1 SHOTS$/.test(item.label));
    for (const status of statuses) {
      expect(status.x).toBeGreaterThanOrEqual(page.viewportSize().width - 184);
      expect(status.x + status.width).toBeLessThanOrEqual(page.viewportSize().width - 14);
      expect(status.y).toBeGreaterThan(cardBottom + 17);
      expect(status.y).toBeLessThan(page.viewportSize().height - 60);
    }
    for (const prefix of ['Lucky feather', 'Springy legs', 'E · Eyases', 'Eyas ammo:']) {
      expect(statuses.some(item => item.label.startsWith(prefix))).toBe(true);
    }
    const chain = drawing.text.find(item => item.label.startsWith('CHAIN'));
    expect(statuses.find(item => item.label.startsWith('Lucky feather')).y).toBeGreaterThan(chain.y + 17);
  }
  await page.screenshot({ path: testInfo.outputPath('right-side-statuses.png') });
});