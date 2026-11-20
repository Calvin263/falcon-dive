import { test, expect } from '@playwright/test';
import { ACHIEVEMENTS, ESCAPE_V, MOONSHOT_T, GROTTO_L, GROTTO_H, OCTO_START_X, DAY_END_HOUR, DAY_LENGTH } from '../../src/config.js';

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
  const tiles = layout.buttons.filter(button => button.id && button.id !== 'startDay');
  expect(tiles).toHaveLength(18);
  expect(layout.buttons.some(button => button.id === 'buyUpgrade')).toBe(false);
  for (const tile of tiles) {
    expect(tile.x).toBeGreaterThanOrEqual(0);
    expect(tile.x + tile.w).toBeLessThanOrEqual(page.viewportSize().width);
    expect(tile.y).toBeGreaterThanOrEqual(layout.metrics.top);
    expect(tile.y + tile.h).toBeLessThanOrEqual(layout.metrics.bottom);
    const before = await page.evaluate(id => {
      const game = window.__falconDiveDebug;
      return { tier: game.progress.up[id] || 0, money: game.progress.money };
    }, tile.id);
    await page.mouse.click(tile.x + tile.w / 2, tile.y + tile.h / 2);
    const purchase = await page.evaluate(({ id, x, y, h }) => {
      const game = window.__falconDiveDebug;
      const ctx = document.querySelector('#hud-overlay').getContext('2d');
      const original = ctx.fillText;
      const text = [];
      ctx.fillText = function (label, tx, ty, ...args) {
        if (tx >= x && ty > y && ty < y + h) text.push(String(label));
        return original.call(this, label, tx, ty, ...args);
      };
      try { game.render(); } finally { ctx.fillText = original; }
      return { tier: game.progress.up[id], money: game.progress.money, text,
        savedTier: JSON.parse(localStorage.getItem('falconDive.progress')).up[id] };
    }, tile);
    expect(purchase.tier).toBe(before.tier + 1);
    expect(purchase.savedTier).toBe(purchase.tier);
    expect(purchase.money).toBeLessThan(before.money);
    expect(purchase.text.some(label => label.startsWith('Now:'))).toBe(true);
    expect(purchase.text.some(label => label.startsWith('Next:') || label === 'Fully upgraded')).toBe(true);
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

test('left-click cancels turtle and gun aiming without throwing or firing', async ({ page }) => {
  for (const carrying of [{ kind: 'turtle' }, { kind: 'gun', ammo: 6 }]) {
    await page.evaluate(item => {
      const game = window.__falconDiveDebug;
      game.progress.up.aim = 1;
      game.progress.up.rifle = 2;
      game.startDay();
      game.bird.carrying = item;
    }, carrying);
    await page.mouse.move(page.viewportSize().width * 0.7, 150);
    await page.mouse.down({ button: 'right' });
    expect(await page.evaluate(() => window.__falconDiveDebug.session.mouse.aiming)).toBe(true);
    await page.mouse.down({ button: 'left' });
    expect(await page.evaluate(() => ({
      aiming: window.__falconDiveDebug.session.mouse.aiming,
      steer: window.__falconDiveDebug.session.mouse.steer,
      braking: window.__falconDiveDebug.session.mouse.down,
    }))).toEqual({ aiming: false, steer: null, braking: true });
    await page.mouse.up({ button: 'left' });
    await page.mouse.up({ button: 'right' });
    const result = await page.evaluate(() => ({
      carrying: window.__falconDiveDebug.bird.carrying,
      fallers: window.__falconDiveDebug.state.fallers.length,
      tracers: window.__falconDiveDebug.state.tracers.length,
    }));
    expect(result.carrying.kind).toBe(carrying.kind);
    if (carrying.ammo) expect(result.carrying.ammo).toBe(carrying.ammo);
    expect(result.fallers).toBe(0);
    expect(result.tracers).toBe(0);
  }
});

test('hidden achievements show placeholder descriptions until earned, without roost hints', async ({ page }) => {
  const capture = async (achievements, earned = false) => page.evaluate(({ showAchievements, earned }) => {
    const game = window.__falconDiveDebug;
    game.resetProgress();
    if (earned) game.progress.ach.armedBuzzard = 1;
    game.progress.up.bounce = 4;
    game.showShop();
    game.session.achView = showAchievements;
    const ctx = document.querySelector('#hud-overlay').getContext('2d');
    const original = ctx.fillText, text = [];
    ctx.fillText = function (label, ...args) {
      text.push(String(label));
      return original.call(this, label, ...args);
    };
    try { game.render(); } finally { ctx.fillText = original; }
    return text;
  }, { showAchievements: achievements, earned });
  for (const achievements of [false, true]) {
    const text = await capture(achievements);
    const joined = text.join(' ');
    if (!achievements) expect(joined).not.toMatch(/moon|grotto|rifle|bazooka|buzzsaw|parry|satellite|sink or shell|Pull!/i);
    else for (const achievement of ACHIEVEMENTS.filter(a => a.hidden)) {
      expect(text).toContain(achievement.name);
      expect(text).not.toContain(achievement.desc);
    }
    expect(joined).not.toMatch(/Find a hunter/);
    if (achievements) expect(text.filter(label => label === 'hidden achievement')).toHaveLength(ACHIEVEMENTS.filter(a => a.hidden).length);
    expect(joined).toContain(achievements ? `0/${ACHIEVEMENTS.length} earned` : `Achievements 0/${ACHIEVEMENTS.length}`);
  }
  const unlocked = await capture(true, true);
  const achievement = ACHIEVEMENTS.find(a => a.id === 'armedBuzzard');
  expect(unlocked).toContain(achievement.desc);
  expect(unlocked).toContain(`$${achievement.reward}`);
  expect(unlocked.filter(label => label === 'hidden achievement')).toHaveLength(ACHIEVEMENTS.filter(a => a.hidden).length - 1);
});

test('a generated deep basin can be explored on starting breath', async ({ page }, testInfo) => {
  const route = await page.evaluate(async ({ width, height }) => {
    const { createWorld } = await import('/src/simulation/world.js');
    const game = window.__falconDiveDebug;
    game.resetProgress();
    game.startDay();
    game.session.worldSeed = 256;
    const world = createWorld({ session: game.session });
    const lake = Array.from({ length: 60 }, (_, index) => world.lakeAt(index - 30)).find(candidate => candidate.mouth);
    const [shelf, lower, bottom] = lake.vents;
    const { bird, cam, session } = game;
    Object.assign(bird, { x: shelf.x, alt: 1, angle: -Math.PI / 2, speed: 28 });
    Object.assign(cam, { x: shelf.x, alt: 25 });
    const aim = ({ x, alt }) => {
      const angle = Math.atan2(alt - bird.alt, x - bird.x);
      const effort = Math.min(width, height) * 0.3;
      session.mouse.x = width / 2 + (bird.x - cam.x) * cam.zoom + Math.cos(angle) * effort;
      session.mouse.y = height / 2 - (bird.alt - cam.alt) * cam.zoomY - Math.sin(angle) * effort;
      game.step();
    };
    const refill = vent => {
      let minimum = Infinity;
      for (let frame = 0; frame < 360; frame++) {
        aim(vent);
        if (bird.inWater) minimum = Math.min(minimum, bird.breath);
        if (bird.breath >= 6.7 && Math.hypot(bird.x - vent.x, bird.alt - vent.alt) < 1.7) break;
      }
      return { minimum, breath: bird.breath, depth: -bird.alt };
    };
    aim(shelf);
    const surfaceFrame = cam.waterFrame;
    const first = refill(shelf);
    const second = refill(lower);
    const deepest = refill(bottom);
    const diveFrame = cam.waterFrame;
    game.render();
    const canvas = document.querySelector('#game');
    const basinImage = canvas.toDataURL();
    const returnFromBottom = refill(lower);
    const mouth = { x: lake.mouth.x + lake.mouth.direction * 3, alt: lake.mouth.alt };
    for (let frame = 0; frame < 240 && !game.state.grotto; frame++) aim(mouth);
    const entered = !!game.state.grotto;
    if (entered) {
      Object.assign(bird, { x: 0.4, angle: Math.PI, speed: 0.3 });
      game.step(0.01);
    }
    const retreat = entered && !game.state.grotto ? [refill(lower), refill(shelf)] : [];
    return { surfaceFrame, first, second, deepest, returnFromBottom, diveFrame, entered, retreat, basinImage };
  }, page.viewportSize());
  expect(route.surfaceFrame).toBe(0);
  expect(route.diveFrame).toBeGreaterThan(0.9);
  expect(route.first.depth).toBeGreaterThan(8);
  expect(route.second.depth).toBeGreaterThan(19);
  expect(route.deepest.depth).toBeGreaterThan(39);
  expect(route.entered).toBe(true);
  expect(route.retreat).toHaveLength(2);
  for (const [index, stop] of [route.first, route.second, route.deepest, route.returnFromBottom, ...route.retreat].entries()) {
    expect(stop.minimum, `minimum air on leg ${index + 1}`).toBeGreaterThan(0);
    expect(stop.breath, `air after leg ${index + 1}`).toBeGreaterThanOrEqual(6.7);
  }
  await testInfo.attach('generated basin', { body: Buffer.from(route.basinImage.split(',')[1], 'base64'), contentType: 'image/png' });
});

test('grotto has varied contours and a visible sealed end, with an earlier retreating octopus', async ({ page }, testInfo) => {
  const entrance = await page.evaluate(() => {
    const game = window.__falconDiveDebug;
    game.resetProgress();
    game.startDay();
    const lake = { x0: 1000, w: 100, depth: 32, grotto: true, mouth: { x: 1050, alt: -27, direction: 1 } };
    Object.assign(game.bird, { x: lake.mouth.x + 0.5, alt: lake.mouth.alt, inWater: lake, speed: 3, angle: 0, breath: 100 });
    game.step(0.001);
    const o = game.state.grotto.octo;
    const start = o.x;
    o.atkT = 100;
    Object.assign(game.bird, { x: o.x - 20, alt: o.alt, speed: 0.3, invulnT: 100 });
    game.step(0.1);
    game.session.paused = true;
    game.render();
    return { start, retreated: o.x > start };
  });
  expect(entrance.start).toBe(OCTO_START_X);
  expect(entrance.retreated).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('grotto-early-encounter.png') });
  const wall = await page.evaluate(({ length, height }) => {
    const game = window.__falconDiveDebug;
    Object.assign(game.bird, { x: length - 1, alt: height / 2, speed: 0.3 });
    game.state.grotto.octo.x = length - 14;
    game.session.paused = false;
    game.step(0.001);
    game.session.paused = true;
    const ctx = document.querySelector('#game').getContext('2d');
    const originalLine = ctx.lineTo, originalMove = ctx.moveTo;
    const rim = [], contour = [];
    function record(x, y) {
      if (ctx.strokeStyle === '#648084') rim.push({ x, y });
      if (ctx.fillStyle === '#1d2a2c') contour.push({ x, y });
    }
    ctx.lineTo = function (x, y) { record(x, y); return originalLine.call(this, x, y); };
    ctx.moveTo = function (x, y) { record(x, y); return originalMove.call(this, x, y); };
    try { game.render(); } finally { ctx.lineTo = originalLine; ctx.moveTo = originalMove; }
    return { rim, contour };
  }, { length: GROTTO_L, height: GROTTO_H });
  expect(wall.rim.length).toBeGreaterThan(16);
  expect(new Set(wall.rim.map(point => point.x.toFixed(2))).size).toBeGreaterThan(3);
  expect(wall.rim.some(point => point.x > 0 && point.x < page.viewportSize().width && point.y > 0 && point.y < page.viewportSize().height)).toBe(true);
  const surface = wall.contour.slice(1, -1);
  expect(Math.max(...surface.map(point => point.y)) - Math.min(...surface.map(point => point.y))).toBeGreaterThan(10);
  await page.screenshot({ path: testInfo.outputPath('grotto-sealed-end.png') });
});

test('ceiling escape renders the moon cinematic and persists its landing', async ({ page }, testInfo) => {
  const launch = await page.evaluate(escapeSpeed => {
    const game = window.__falconDiveDebug;
    game.resetProgress();
    game.startDay();
    Object.assign(game.bird, {
      alt: game.session.MAX_ALT - 1,
      speed: escapeSpeed + 100,
      angle: Math.PI / 2,
      bouncing: null,
    });
    game.session.mouse.x = innerWidth / 2;
    game.session.mouse.y = 0;
    game.step(1 / 120);
    game.session.paused = true;
    game.render();
    return { launched: !!game.state.moonshot, speed: game.state.moonshot?.v0, altitude: game.bird.alt, ceiling: game.session.MAX_ALT };
  }, ESCAPE_V);
  expect(launch.launched).toBe(true);
  expect(launch.speed).toBeGreaterThanOrEqual(ESCAPE_V);
  expect(launch.altitude).toBeGreaterThanOrEqual(launch.ceiling);
  await page.screenshot({ path: testInfo.outputPath('ceiling-moon-launch.png') });
  const landed = await page.evaluate(duration => {
    const game = window.__falconDiveDebug;
    game.session.paused = false;
    game.step(duration);
    game.session.paused = true;
    game.render();
    return { landed: game.state.moonshot.landed, day: game.state.day, saved: JSON.parse(localStorage.getItem('falconDive.progress')).ach.moon };
  }, MOONSHOT_T);
  expect(landed.landed).toBe(true);
  expect(landed.saved).toBe(landed.day);
});

test('braking cancels automatic fire and a pending turtle grab', async ({ page }) => {
  const result = await page.evaluate(() => {
    const game = window.__falconDiveDebug;
    const canvas = document.querySelector('#game');
    game.progress.up.rifle = 4;
    game.startDay();
    game.bird.carrying = { kind: 'gun', ammo: 30 };
    const press = button => canvas.dispatchEvent(new MouseEvent('mousedown', { button, clientX: 200, clientY: 150 }));
    const release = button => window.dispatchEvent(new MouseEvent('mouseup', { button }));
    press(2);
    press(0);
    release(0);
    game.step();
    release(2);
    const ammo = game.bird.carrying.ammo;
    game.bird.carrying = null;
    const turtle = { x: game.bird.x + 1, alt: game.bird.alt, vx: 0, vy: 0, spin: 0 };
    game.state.fallers = [turtle];
    press(2);
    const targeted = game.session.mouse.talonTarget === turtle;
    press(0);
    game.step();
    release(2);
    release(0);
    return { ammo, targeted, carrying: game.bird.carrying, target: game.session.mouse.talonTarget };
  });
  expect(result).toEqual({ ammo: 30, targeted: true, carrying: null, target: null });
});

test('empty-handed right-click shows talons without a target and retracts cleanly', async ({ page }, testInfo) => {
  const result = await page.evaluate(() => {
    const game = window.__falconDiveDebug;
    game.startDay();
    game.state.fallers = [];
    const canvas = document.querySelector('#game');
    const ctx = document.querySelector('#hud-overlay').getContext('2d');
    const original = ctx.fillText;
    const text = [];
    const press = button => canvas.dispatchEvent(new MouseEvent('mousedown', { button, clientX: 200, clientY: 150 }));
    const release = button => window.dispatchEvent(new MouseEvent('mouseup', { button }));
    const visible = () => {
      game.render();
      return game.session.mouse.aiming && !game.session.mouse.throwHeld &&
        !game.bird.carrying && !game.session.paused && !game.state.over;
    };
    ctx.fillText = function (label, ...args) {
      text.push(String(label));
      return original.call(this, label, ...args);
    };
    try {
      const idle = visible();
      press(2);
      const held = visible(), target = game.session.mouse.talonTarget;
      release(2);
      const released = visible();
      press(2);
      press(0);
      release(0);
      const braked = visible();
      release(2);
      game.bird.carrying = { kind: 'turtle' };
      press(2);
      const carrying = visible();
      release(2);
      game.bird.carrying = null;
      press(2);
      window.dispatchEvent(new Event('blur'));
      const blurred = visible();
      game.session.paused = false;
      game.state.fallers = [];
      press(2);
      game.render();
      return { idle, held, target, released, braked, carrying, blurred, statusText: text.includes('TALONS OUT') };
    } finally { ctx.fillText = original; }
  });
  expect(result).toEqual({ idle: false, held: true, target: null, released: false, braked: false, carrying: false, blurred: false, statusText: false });
  await page.screenshot({ path: testInfo.outputPath('talons-out.png') });
});

test('rifle-stealing buzzards show a weapon and aim warning, then earn a hidden achievement on firing', async ({ page }, testInfo) => {
  const result = await page.evaluate(() => {
    const game = window.__falconDiveDebug;
    game.startDay();
    Object.assign(game.bird, { x: 0, alt: 220, speed: 0, vx: 0, vy: 0, carrying: { kind: 'gun', ammo: 2 } });
    const buzzard = { x: 1, alt: 220, cx: 1, calt: 220, vx: 0, vy: 0, ang: 0, mode: 'chase', t: 7, flapT: 0 };
    game.state.rivals = [buzzard];
    game.step(0.001);
    const stolen = { carrying: game.bird.carrying, ammo: buzzard.gun?.ammo, mode: buzzard.mode };
    Object.assign(buzzard, { x: game.bird.x + 45, alt: game.bird.alt, aim: 0.5, ax: game.bird.x, aalt: game.bird.alt, tracer: 0 });
    Object.assign(game.cam, { x: game.bird.x, alt: game.bird.alt, zoom: 2.5, zoomY: 2.5 });
    game.session.paused = true;
    const ctx = document.querySelector('#game').getContext('2d');
    const textCtx = document.querySelector('#hud-overlay').getContext('2d');
    const originalRect = ctx.fillRect, originalText = textCtx.fillText;
    let rifle = false;
    const text = [];
    ctx.fillRect = function (x, y, w, h) {
      if (x === 4 && y === -1.4 && w === 13 && h === 1.6) rifle = true;
      return originalRect.call(this, x, y, w, h);
    };
    textCtx.fillText = function (label, ...args) {
      text.push(String(label));
      return originalText.call(this, label, ...args);
    };
    try { game.render(); } finally { ctx.fillRect = originalRect; textCtx.fillText = originalText; }
    return { stolen, rifle, warning: text.includes('Buzzard aiming!'), achievement: !!game.progress.ach.armedBuzzard };
  });
  expect(result).toEqual({ stolen: { carrying: null, ammo: 2, mode: 'armed' }, rifle: true, warning: true, achievement: false });
  await page.screenshot({ path: testInfo.outputPath('armed-buzzard-aiming.png') });
  const shot = await page.evaluate(() => {
    const game = window.__falconDiveDebug, buzzard = game.state.rivals[0];
    game.session.paused = false;
    buzzard.aim = 0.001;
    game.step(0.01);
    game.showRecap();
    game.render();
    return { ammo: buzzard.gun.ammo, reason: game.state.recap.reason,
      earned: game.progress.ach.armedBuzzard,
      saved: JSON.parse(localStorage.getItem('falconDive.progress')).ach.armedBuzzard,
      records: game.state.recap.records.join(' ') };
  });
  expect(shot.ammo).toBe(1);
  expect(shot.reason).toBe('buzzard');
  expect(shot.earned).toBe(shot.saved);
  expect(shot.earned).toBeGreaterThan(0);
  expect(shot.records).toContain('This Was a Mistake');
});

test('catch cards show circumstance icons and recap keeps different kill methods separate', async ({ page }, testInfo) => {
  const result = await page.evaluate(() => {
    const game = window.__falconDiveDebug;
    game.startDay();
    game.session.paused = true;
    const ctx = document.querySelector('#hud-overlay').getContext('2d');
    const original = ctx.fillText;
    const records = [
      { turtleHit: true, icon: '🐢', label: 'Turtle strike' },
      { method: 'buzzsaw', icon: '✹', label: 'Buzzsaw' },
      { shot: true, icon: '⊕', label: 'Shot' },
      { drowned: true, water: true, icon: '💧', label: 'Drowned' },
      { eyas: true, icon: '🐣', label: 'Eyas' },
      { crossfire: true, by: 'hunter', icon: '🎯', label: 'Shot by hunter' },
      { crossfire: true, by: 'cat', icon: '🐈', label: 'Caught by cat' },
      { method: 'parry', icon: '🛡', label: 'Parry' },
    ];
    const captures = [];
    let text = [];
    ctx.fillText = function (label, x, y, ...args) {
      text.push(String(label));
      return original.call(this, label, x, y, ...args);
    };
    try {
      for (const record of records) {
        game.state.catchLog = [{ kind: 'rabbit', speed: 20, pts: 120, t: 0, tags: ['Fresh +$10'], ...record }];
        text = [];
        game.render();
        captures.push({ icon: record.icon, label: record.label, text });
      }
      game.state.catchLog = records.slice(0, 3).map(record => ({ kind: 'rabbit', speed: 20, pts: 120, t: 0, tags: [], ...record }));
      game.endDay('sunset');
      game.showRecap();
      text = [];
      game.render();
      return { captures, recap: text };
    } finally { ctx.fillText = original; }
  });
  for (const { icon, label, text } of result.captures) {
    expect(text).toContain('Rabbit');
    expect(text).toContain('$120');
    expect(text.some(item => item.includes(icon))).toBe(true);
    expect(text.some(item => item.includes(label))).toBe(true);
    expect(text).toContain('Fresh +$10');
  }
  expect(result.recap.filter(item => item.startsWith('Rabbit') && item.includes('×1'))).toHaveLength(3);
  for (const icon of ['🐢', '✹', '⊕']) expect(result.recap).toContain(icon);
  await page.screenshot({ path: testInfo.outputPath('recap-circumstances.png') });
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
      const readouts = text.filter(item => /^Eyas \d:/.test(item.label));
      expect(readouts.map(item => item.label)).toEqual(ammo.map((n, i) => `Eyas ${i + 1}: ${n}/10`));
      const readout = readouts[0];
      expect(readout.left).toBeGreaterThanOrEqual(0);
      expect(readout.right).toBeLessThanOrEqual(page.viewportSize().width);
      expect(readout.right - readout.left).toBeLessThanOrEqual(154);
      const notices = text.filter(item => /goshawk|Break away|New upgrade|Roost:/.test(item.label));
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
    const world = document.querySelector('#game').getContext('2d');
    const original = ctx.fillText, originalRect = world.fillRect, panels = [];
    let text = [];
    world.fillRect = function (x, y, width, height) {
      if (this.fillStyle === 'rgba(12, 20, 34, 0.45)') panels.push({ x, y, width, height, color: this.fillStyle });
      return originalRect.call(this, x, y, width, height);
    };
    ctx.fillText = function (label, x, y, ...args) {
      const width = this.measureText(label).width;
      const left = this.textAlign === 'center' ? x - width / 2 : this.textAlign === 'right' ? x - width : x;
      text.push({ label: String(label), x, y, left, right: left + width, notice: this.textAlign === 'center' });
      return original.call(this, label, x, y, ...args);
    };
    try {
      game.render();
      const active = text;
      text = [];
      game.state.time = 12.5;
      game.render();
      const expired = text;
      text = [];
      game.state.time = 10;
      game.render();
      return { active, expired, tags, panels };
    } finally { ctx.fillText = original; world.fillRect = originalRect; }
  });
  const heading = result.active.find(item => item.label === 'TURTLE STRIKE! Starling ×3 +$240');
  expect(heading).toBeTruthy();
  expect(heading.x).toBe(page.viewportSize().width / 2);
  expect(result.panels.length).toBeGreaterThan(0);
  for (const panel of result.panels) {
    expect(panel.width).toBeLessThanOrEqual(340);
    expect(panel.x + panel.width).toBeLessThanOrEqual(page.viewportSize().width - 16);
    expect(panel.color).toMatch(/0\.45\)$/);
  }
  expect(result.panels.some(panel => panel.width < 250)).toBe(true);
  const warning = result.active.find(item => item.label.includes('goshawk is hunting'));
  const unlock = result.active.filter(item => /New upgrade|Roost: Rifle/.test(item.label));
  expect(heading.y).toBeGreaterThan(Math.max(warning.y, ...unlock.map(item => item.y)) + 14);
  const modifiers = result.active.filter(item => item.notice && result.tags.some(tag => item.label.includes(tag)));
  expect(modifiers.map(item => item.label).join(' ')).toContain(result.tags.join(' · '));
  for (const line of [heading, ...modifiers]) {
    expect(line.x).toBe(page.viewportSize().width / 2);
    expect(line.left).toBeGreaterThanOrEqual(16);
    expect(line.right).toBeLessThanOrEqual(page.viewportSize().width - 16);
    expect(line.y).toBeLessThan(280);
  }
  const lastModifierY = Math.max(...modifiers.map(item => item.y));
  expect(lastModifierY).toBeGreaterThan(heading.y);
  const ammo = result.active.find(item => item.label.startsWith('Eyas 1:'));
  expect(ammo.y).toBeGreaterThan(lastModifierY + 17);
  expect(result.expired.some(item => item.notice && (item.label.includes('TURTLE STRIKE!') || item.label.includes('Double ricochet')))).toBe(false);
  expect(result.expired.some(item => item.label.includes('goshawk is hunting'))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('recent-catch-feedback.png') });
});

test('sunset countdown shows real seconds at the current slow-motion rate and freezes on pause', async ({ page }, testInfo) => {
  const capture = async (seconds, rate) => page.evaluate(({ seconds, rate, endHour, dayLength }) => {
    const game = window.__falconDiveDebug;
    game.startDay();
    game.session.paused = true;
    game.session.timeScale = rate;
    game.state.tod = (endHour - seconds * 24 / dayLength - 1.2) / 24;
    const ctx = document.querySelector('#hud-overlay').getContext('2d');
    const original = ctx.fillText, text = [];
    ctx.fillText = function (label, ...args) { text.push({ label: String(label), font: this.font, alpha: this.globalAlpha, color: this.fillStyle, x: args[0], y: args[1], width: this.measureText(label).width }); return original.call(this, label, ...args); };
    try { game.render(); } finally { ctx.fillText = original; }
    return text;
  }, { seconds, rate, endHour: DAY_END_HOUR, dayLength: DAY_LENGTH });
  expect((await capture(10.1, 1)).some(item => item.font === 'bold 48px monospace')).toBe(false);
  for (const [seconds, rate, label] of [[9.9, 1, '10'], [4.9, 0.5, '10'], [2.4, 0.5, '5'], [0.9, 1, '1']]) {
    const text = await capture(seconds, rate);
    expect(text.some(item => item.label === 'DAY ENDING')).toBe(false);
    const countdown = text.find(item => item.label === label && item.font === 'bold 48px monospace');
    expect(countdown).toBeTruthy();
    expect(countdown.color).toBe(label === '1' ? '#ff7766' : '#ffd34d');
    expect(countdown.x).toBe(page.viewportSize().width / 2);
    expect(countdown.y).toBe(94);
    expect(countdown.x - countdown.width / 2).toBeGreaterThan(0);
    expect(countdown.x + countdown.width / 2).toBeLessThan(page.viewportSize().width);
  }
  const bright = (await capture(0.9, 1)).find(item => item.font === 'bold 48px monospace');
  const faded = (await capture(0.1, 1)).find(item => item.font === 'bold 48px monospace');
  expect(bright.alpha).toBeGreaterThan(0.85);
  expect(faded.alpha).toBeLessThan(0.25);
  const frozen = await page.evaluate(() => {
    const game = window.__falconDiveDebug, before = game.state.tod;
    game.step(1);
    return before === game.state.tod;
  });
  expect(frozen).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('sunset-countdown.png') });
});

test('resource icons gray out used charges and eyas ammo uses bullet pips or a magazine bar', async ({ page }, testInfo) => {
  for (const unlimited of [false, true]) {
    const drawing = await page.evaluate(unlimited => {
      const game = window.__falconDiveDebug;
      game.resetProgress();
      Object.assign(game.progress.up, { lucky: 2, bounce: unlimited ? 3 : 1, eyas: 3, eyasgun: unlimited ? 2 : 1 });
      game.startDay();
      game.session.paused = true;
      game.state.feathers = 1;
      game.state.bounces = unlimited ? Infinity : 1;
      game.state.eyases.forEach((eyas, i) => { eyas.ammo = i === 0 ? 2 : 0; });
      const ctx = document.querySelector('#game').getContext('2d'), overlay = document.querySelector('#hud-overlay').getContext('2d');
      const originalEllipse = ctx.ellipse, originalStroke = ctx.stroke, originalRect = ctx.fillRect, originalText = overlay.fillText;
      const feathers = [], coils = [], ammo = [], text = [];
      ctx.ellipse = function (x, y, rx, ry, ...args) {
        if (x === 132 && rx === 5 && ry === 10) feathers.push({ y, color: this.fillStyle });
        return originalEllipse.call(this, x, y, rx, ry, ...args);
      };
      ctx.stroke = function (...args) {
        if (this.strokeStyle === '#b8f1c8' || this.strokeStyle === '#687381') coils.push(this.strokeStyle);
        return originalStroke.apply(this, args);
      };
      ctx.fillRect = function (x, y, w, h) {
        if (x > innerWidth - 184 && (h === 12 || h === 10)) ammo.push({ x, y, w, h });
        return originalRect.call(this, x, y, w, h);
      };
      overlay.fillText = function (label, x, y, ...args) { text.push({ label: String(label), x, y }); return originalText.call(this, label, x, y, ...args); };
      try { game.render(); } finally { ctx.ellipse = originalEllipse; ctx.stroke = originalStroke; ctx.fillRect = originalRect; overlay.fillText = originalText; }
      return { feathers, coils, ammo, text };
    }, unlimited);
    expect(drawing.feathers.map(feather => feather.color)).toEqual(['#fff1b8', '#687381']);
    expect(drawing.coils).toEqual(unlimited ? ['#b8f1c8'] : ['#b8f1c8', '#687381', '#687381']);
    expect(drawing.text.some(item => item.label === '∞')).toBe(unlimited);
    expect(drawing.text.some(item => /Lucky feather|Springy legs|Eyas ammo:/.test(item.label))).toBe(false);
    const max = unlimited ? 10 : 4;
    expect(drawing.text.filter(item => /^Eyas \d:/.test(item.label)).map(item => item.label)).toEqual([`Eyas 1: 2/${max}`, `Eyas 2: 0/${max}`, `Eyas 3: 0/${max}`]);
    expect(drawing.ammo.filter(rect => rect.h === 12)).toHaveLength(unlimited ? 0 : 12);
    expect(drawing.ammo.filter(rect => rect.h === 10)).toHaveLength(unlimited ? 6 : 0);
    for (const feather of drawing.feathers) expect(feather.y).toBeLessThan(page.viewportSize().height - 60);
  }
  await page.screenshot({ path: testInfo.outputPath('resource-icons-and-eyas-ammo.png') });
});

test('carrying status stays in the equipment HUD without a recurring top popup', async ({ page }) => {
  for (const carrying of [{ kind: 'turtle' }, { kind: 'gun', ammo: 2 }]) {
    const text = await page.evaluate(carrying => {
      const game = window.__falconDiveDebug;
      game.resetProgress();
      game.startDay();
      game.session.paused = true;
      game.bird.carrying = carrying;
      game.bird.alt = 150;
      game.state.msgT = 0;
      game.state.toast = null;
      const ctx = document.querySelector('#hud-overlay').getContext('2d');
      const original = ctx.fillText, text = [];
      ctx.fillText = function (label, x, y, ...args) {
        text.push({ label: String(label), x, y });
        return original.call(this, label, x, y, ...args);
      };
      try { game.render(); } finally { ctx.fillText = original; }
      return text;
    }, carrying);
    const controls = text.filter(item => /Right-click|Space:|Turtle ready|Turtle impact/.test(item.label));
    expect(controls.length).toBeGreaterThanOrEqual(2);
    expect(text.some(item => item.x === 90 && /Right-click|Space:|Turtle/.test(item.label))).toBe(false);
    for (const control of controls) expect(control.x).toBe(page.viewportSize().width - 176);
  }
});

test('urgent threat labels follow predators and stay within screen edges without flashing banners', async ({ page }, testInfo) => {
  for (const position of ['onscreen', 'left', 'right', 'above', 'below']) {
    const drawing = await page.evaluate(position => {
      const game = window.__falconDiveDebug;
      game.startDay();
      game.session.paused = true;
      Object.assign(game.cam, { x: 0, alt: 200, zoom: 1, zoomY: 1 });
      const x = position === 'left' ? -10000 : position === 'right' ? 10000 : 0;
      const alt = position === 'above' ? 10000 : position === 'below' ? -10000 : 200;
      game.state.rivals = [{ x, alt, mode: 'armed', gun: { ammo: 2 }, aim: 0.5, ax: 0, aalt: 200, vx: 1, vy: 0, flapT: 0 }];
      const ctx = document.querySelector('#hud-overlay').getContext('2d');
      const original = ctx.fillText, text = [];
      ctx.fillText = function (label, x, y, ...args) {
        text.push({ label: String(label), x, y, width: this.measureText(label).width });
        return original.call(this, label, x, y, ...args);
      };
      try { game.render(); } finally { ctx.fillText = original; }
      return text;
    }, position);
    const warning = drawing.find(item => item.label === 'Buzzard aiming!');
    expect(warning).toBeTruthy();
    expect(drawing.some(item => item.label === '!')).toBe(true);
    expect(warning.x).toBeGreaterThanOrEqual(8);
    expect(warning.x + warning.width).toBeLessThanOrEqual(page.viewportSize().width - 8);
    expect(warning.y).toBeGreaterThanOrEqual(8);
    expect(warning.y).toBeLessThanOrEqual(page.viewportSize().height - 8);
    if (position === 'left') expect(warning.x).toBeLessThan(50);
    if (position === 'right') expect(warning.x).toBeGreaterThan(page.viewportSize().width - 150);
    if (position === 'above') expect(warning.y).toBeLessThan(60);
    if (position === 'below') expect(warning.y).toBeGreaterThan(page.viewportSize().height - 50);
    expect(drawing.some(item => /BUZZARD AIMING|HUNTER AIMING|GOSHAWK STRIKING/.test(item.label))).toBe(false);
  }
  await page.screenshot({ path: testInfo.outputPath('edge-threat-warning.png') });
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
      game.progress.moon = 1;
      game.state.bestLaunch = 230;
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
        if (w === 170 && h === 78) cards.push({ x, y, w, h });
        return originalRect.call(this, x, y, w, h);
      };
      try { game.render(); } finally { textCtx.fillText = originalText; ctx.fillRect = originalRect; }
      return { text, cards };
    }, armed);
    expect(drawing.cards.length).toBeGreaterThan(0);
    expect(drawing.text.some(item => item.label.includes('Launch'))).toBe(false);
    expect(drawing.cards.length).toBeLessThan(30);
    const cardBottom = Math.max(...drawing.cards.map(card => card.y + card.h));
    const statuses = drawing.text.filter(item => /E · Eyases|Eyas \d:|^Ammo:|^\/ 1 SHOTS$/.test(item.label));
    for (const status of statuses) {
      expect(status.x).toBeGreaterThanOrEqual(page.viewportSize().width - 184);
      expect(status.x + status.width).toBeLessThanOrEqual(page.viewportSize().width - 14);
      expect(status.y).toBeGreaterThan(cardBottom + 17);
      expect(status.y).toBeLessThan(page.viewportSize().height - 60);
    }
    for (const prefix of ['E · Eyases', 'Eyas 1:', 'Eyas 2:', 'Eyas 3:']) {
      expect(statuses.some(item => item.label.startsWith(prefix))).toBe(true);
    }
    const chain = drawing.text.find(item => item.label.startsWith('CHAIN'));
    expect(statuses.find(item => item.label.startsWith('E · Eyases')).y).toBeGreaterThan(chain.y + 17);
  }
  await page.screenshot({ path: testInfo.outputPath('right-side-statuses.png') });
});

test('achievements replace the shop without leaving text or buttons underneath', async ({ page }, testInfo) => {
  const capture = () => page.evaluate(() => {
    const game = window.__falconDiveDebug;
    const ctx = document.querySelector('#hud-overlay').getContext('2d');
    const original = ctx.fillText, text = [];
    ctx.fillText = function (label, ...args) {
      text.push(String(label));
      return original.call(this, label, ...args);
    };
    try { game.render(); } finally { ctx.fillText = original; }
    return { text, buttons: game.buttons.map(({ label, x, y, w, h }) => ({ label, x, y, w, h })) };
  });
  const click = ({ x, y, w, h }) => page.mouse.click(x + w / 2, y + h / 2);
  await page.evaluate(() => window.__falconDiveDebug.showShop());
  const shop = await capture();
  expect(shop.text).toContain('The Roost');
  await click(shop.buttons.find(button => button.label.includes('Achievements')));
  const achievements = await capture();
  expect(achievements.text).toContain('Achievements');
  expect(achievements.text).not.toContain('The Roost');
  expect(achievements.text.join(' ')).not.toMatch(/Flight Muscles|Next hunt|wallet|Start day/);
  expect(achievements.buttons.map(button => button.label)).toEqual(['Back']);
  await page.screenshot({ path: testInfo.outputPath('achievements.png') });
  await click(achievements.buttons[0]);
  const restored = await capture();
  expect(restored.text).toContain('The Roost');
  expect(restored.buttons).toEqual(shop.buttons);
  await click(restored.buttons.find(button => button.label.includes('Achievements')));
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => window.__falconDiveDebug.screen)).toBe('shop');
  expect((await capture()).buttons.map(button => button.label)).toEqual(['Back']);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__falconDiveDebug.buttons.some(button => button.id === 'startDay'))).toBe(true);
});