import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => errors.push(request.url()));
  page.errors = errors;
  await page.goto('/');
  await page.waitForFunction(() => window.__falconDiveDebug?.getMetrics().renders >= 3);
});

test.afterEach(async ({ page }) => {
  expect(page.errors).toEqual([]);
});

test('draws a responsive, nonblank game and preserves controls', async ({ page }, testInfo) => {
  await expect(page.locator('canvas')).toBeVisible();
  const drawing = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const colors = new Set();
    for (let row = 1; row < 10; row++) {
      for (let column = 1; column < 10; column++) {
        colors.add([...ctx.getImageData(column * canvas.width / 10, row * canvas.height / 10, 1, 1).data].join(','));
      }
    }
    return { width: canvas.width, height: canvas.height, colors: colors.size };
  });
  expect(drawing.width).toBe(page.viewportSize().width);
  expect(drawing.height).toBe(page.viewportSize().height);
  expect(drawing.colors).toBeGreaterThan(10);
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

test('paused and hidden scenes stop rendering and resume cleanly', async ({ page }) => {
  await page.keyboard.press('p');
  await page.waitForTimeout(100);
  const paused = await page.evaluate(() => ({ time: window.__falconDiveDebug.state.time, renders: window.__falconDiveDebug.getMetrics().renders }));
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
  await page.screenshot({ path: testInfo.outputPath('roost.png') });
  if (initialShop.metrics.maxScroll > 0) {
    await page.mouse.move(page.viewportSize().width / 2, initialShop.metrics.top + 40);
    await page.mouse.wheel(0, 1000);
    await expect.poll(() => page.evaluate(() => window.__falconDiveDebug.session.shopScroll)).toBeGreaterThan(0);
    await page.mouse.wheel(0, 10000);
    await expect.poll(() => page.evaluate(() => window.__falconDiveDebug.session.shopScroll)).toBe(initialShop.metrics.maxScroll);
  }
  await expect.poll(() => page.evaluate(() => window.__falconDiveDebug.buttons.some(button => button.id === 'bounce'))).toBe(true);
  expect(await page.evaluate(() => window.__falconDiveDebug.buyUpgrade('muscles'))).toBe(true);
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