import { test, expect } from '@playwright/test';

test('sky encounters render their warnings, combat and rewards on both viewports', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  await page.waitForFunction(() => window.__falconDiveDebug?.getMetrics().renders >= 3);

  const fishnado = await page.evaluate(() => {
    const game = window.__falconDiveDebug;
    game.session.paused = true;
    const lake = { x0: 0, w: 200, depth: 12 };
    game.state.fish = Array.from({ length: 4 }, () => ({
      kind: 'trout', lake, x: 100, alt: -2, vx: 1, ph: 0,
      minX: 2, maxX: 198, tAlt: -2, wanderT: 3, fleeT: 0, riseT: 0,
    }));
    game.setBird(100, 350, 20);
    game.bird.vx = 0; game.bird.vy = 0;
    game.cam.x = 100; game.cam.alt = 350; game.cam.zoom = 2; game.cam.zoomY = 2;
    game.sky.spawnFishnado(lake);
    game.sky.update(4);
    const boss = game.state.sky.fishnado;
    boss.mode = 'wind'; boss.aim = 0; boss.t = 1;
    game.bird.carrying = { kind: 'turtle' };
    game.sky.charge(game.bird.carrying);
    game.session.paused = false; game.render(); game.session.paused = true;
    return { mode: boss.mode, charge: game.bird.carrying.chargeUntil, hp: boss.hp };
  });
  expect(fishnado.mode).toBe('wind');
  expect(fishnado.charge).toBeGreaterThan(0);
  expect(fishnado.hp).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('fishnado-warning.png') });

  const pirates = await page.evaluate(() => {
    const game = window.__falconDiveDebug;
    game.session.MAX_ALT = 650;
    game.sky.spawnPirates(100);
    const boss = game.state.sky.pirates;
    game.sky.update(0.01);
    game.bird.alt = boss.alt;
    game.cam.x = 100; game.cam.alt = boss.alt + 10;
    game.session.paused = false; game.render(); game.session.paused = true;
    return { crew: boss.crew.length, balloons: boss.balloons.length, altitude: boss.alt };
  });
  expect(pirates).toEqual({ crew: 2, balloons: 3, altitude: expect.any(Number) });
  await page.screenshot({ path: testInfo.outputPath('balloon-pirates.png') });

  const recap = await page.evaluate(() => {
    const game = window.__falconDiveDebug;
    const boss = game.state.sky.pirates;
    game.sky.hitPart(boss, 'gun', 100);
    game.endDay('sunset');
    game.showRecap();
    game.render();
    return { reason: game.state.recap.reason, catch: game.state.recap.catches.at(-1).targetKind };
  });
  expect(recap).toEqual({ reason: 'sunset', catch: 'pirates' });
  expect(errors).toEqual([]);
});
