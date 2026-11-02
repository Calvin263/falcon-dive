import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameLoop } from '../src/core/frame-loop.js';

function harness(options = {}) {
  let callback;
  let updates = 0;
  let renders = 0;
  const deltas = [];
  const frameSamples = [];
  const loop = createFrameLoop({
    update: dt => { updates++; deltas.push(dt); },
    render: () => renders++,
    onFrame: (now, elapsed) => frameSamples.push({ now, elapsed }),
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
    frameSamples,
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

test('reports browser frame gaps independently of the capped render rate', () => {
  const game = harness();
  game.loop.start();
  for (const now of [0, 7, 14, 21, 28]) game.tick(now);
  assert.deepEqual(game.frameSamples.map(sample => sample.elapsed), [0, 7, 7, 7, 7]);
  assert.ok(game.renders < game.frameSamples.length);
  game.loop.stop();
});

test('resuming an idle loop resets its timing baseline without losing stall samples', () => {
  let paused = false;
  const game = harness({ isPaused: () => paused });
  game.loop.start();
  game.tick(0);
  game.tick(17);
  paused = true;
  game.tick(34);
  assert.equal(game.pending, false);
  paused = false;
  game.loop.invalidate();
  game.tick(10000);
  assert.equal(game.frameSamples.at(-1).elapsed, 0);
  assert.equal(game.frameSamples[1].elapsed, 17);
  game.loop.stop();
});