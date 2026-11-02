import { createGame } from './game.js';
import { createDebug } from './debug.js';
import { createFrameLoop } from './core/frame-loop.js';
import { createViewport } from './core/viewport.js';

const viewport = createViewport(document.getElementById('game'));
const game = createGame(viewport);
const { session, systems } = game;
const controller = new AbortController();
const options = { signal: controller.signal };
const metrics = { updates: 0, renders: 0, updateMs: 0, renderMs: 0 };

game.initialize();
systems.input.bindInput(options);

const loop = createFrameLoop({
  isPaused: () => session.screen === 'hunt' ? session.paused : session.uiT >= 1.3,
  update(dt) {
    const started = performance.now();
    const slow = !session.paused && !session.state.over &&
      (session.bird.mode === 'BRAKE' || (session.mouse.aiming && session.bird.carrying));
    session.timeScale += ((slow ? 0.55 : 1) - session.timeScale) * Math.min(1, dt * 6);
    systems.flight.update(dt * session.timeScale);
    if (session.screen !== 'hunt') session.uiT += dt;
    metrics.updates++;
    metrics.updateMs = performance.now() - started;
  },
  render,
});

function render() {
  const started = performance.now();
  systems.renderer.draw();
  metrics.renders++;
  metrics.renderMs = performance.now() - started;
}

addEventListener('resize', () => { viewport.resize(); loop.invalidate(); }, options);
for (const event of ['mousemove', 'mousedown', 'mouseup', 'keydown', 'blur', 'focus', 'wheel', 'touchstart', 'touchmove', 'touchend']) {
  addEventListener(event, () => loop.invalidate(), options);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) loop.stop();
  else loop.start();
}, options);
addEventListener('pagehide', event => {
  loop.stop();
  if (!event.persisted) controller.abort();
}, options);
addEventListener('pageshow', () => { if (!document.hidden) loop.start(); }, options);

window.__falconDiveDebug = Object.assign(createDebug(game), {
  getMetrics: () => ({ ...metrics, sprites: systems.sprites.getCacheStats(), terrain: systems.world.getCacheStats() }),
  invalidate: () => loop.invalidate(),
});
render();
if (!document.hidden) loop.start();