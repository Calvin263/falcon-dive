import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameLoop } from '../src/core/frame-loop.js';

function harness(options = {}) {
  let callback;
  let updates = 0;
  let renders = 0;
  const deltas = [];
  const loop = createFrameLoop({
    update: dt => { updates++; deltas.push(dt); },
    render: () => renders++,
    requestFrame: next => { callback = next; return 1; },
    cancelFrame: () => { callback = null; },
    ...options,
  });
  return {
    loop,
    tick(now) { const next = callback; callback = null; next?.(now); },
    get updates() { return updates; },
    get renders() { return renders; },
    get pending() { return !!callback; },
    deltas,
  };
}

test('caps rendering at 60 FPS on a 144 Hz display', () => {
  const game = harness();
  game.loop.start();
  for (let frame = 0; frame < 144; frame++) game.tick(frame * 1000 / 144);
  assert.ok(game.renders >= 59 && game.renders <= 61, `${game.renders} renders`);
  assert.equal(game.updates, game.renders);
});

test('paused scenes render once and sleep until invalidated', () => {
  const game = harness({ isPaused: () => true });
  game.loop.start();
  game.tick(0);
  assert.equal(game.updates, 0);
  assert.equal(game.renders, 1);
  assert.equal(game.pending, false);
  game.loop.invalidate();
  game.tick(100);
  assert.equal(game.renders, 2);
  assert.equal(game.pending, false);
});

test('resume resets timing and stop cancels scheduled work', () => {
  const game = harness();
  game.loop.start();
  game.tick(0);
  game.loop.stop();
  assert.equal(game.pending, false);
  game.loop.start();
  game.tick(100000);
  assert.ok(game.deltas.every(dt => dt <= 1 / 30));
  assert.equal(game.updates, 2);
  game.loop.stop();
});