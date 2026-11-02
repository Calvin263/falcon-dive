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
const frameHistory = [];
let lastRecordedRender = 0;
let lastSceneLoad = null;

function getSceneLoad() {
  const visibleMin = session.cam.x - viewport.W / (2 * session.cam.zoom) - 150;
  const visibleMax = session.cam.x + viewport.W / (2 * session.cam.zoom) + 150;
  const screenX = x => viewport.W / 2 + (x - session.cam.x) * session.cam.zoom;
  const screenY = alt => viewport.H / 2 - (alt - session.cam.alt) * session.cam.zoomY;
  const groundY = screenY(0);
  const groundVisible = groundY >= -5 && groundY <= viewport.H + 40;
  let visiblePreyObjects = 0;
  let visibleFlockMembers = 0;
  for (const prey of session.prey) {
    if (prey.gone || prey.x < visibleMin || prey.x > visibleMax) continue;
    visiblePreyObjects++;
    if (prey.kind === 'flock') {
      for (const member of prey.members) {
        if (!member.caught && member.x >= visibleMin && member.x <= visibleMax) visibleFlockMembers++;
      }
    }
  }
  const cats = session.state.hazards.cats;
  const hunters = session.state.hazards.hunters;
  return {
    preyObjects: session.prey.length,
    visiblePreyObjects,
    visibleFlockMembers,
    visibleTurtles: groundVisible ? session.prey.filter(prey => prey.kind === 'turtle' && prey.x >= visibleMin && prey.x <= visibleMax && !prey.hidden && !prey.gone).length : 0,
    visibleTurtleFallers: session.state.fallers.filter(faller => {
      const x = screenX(faller.x), y = screenY(faller.alt);
      return x >= -32 && x <= viewport.W + 32 && y >= -32 && y <= viewport.H + 32;
    }).length,
    carriedTurtle: session.bird.carrying?.kind === 'turtle' ? 1 : 0,
    cats: cats.length,
    visibleCats: cats.filter(cat => {
      const x = screenX(cat.x), y = screenY(cat.mode === 'hide' ? 0 : cat.alt);
      return x >= -40 && x <= viewport.W + 40 &&
        (cat.mode === 'hide' ? groundY >= -36 && groundY <= viewport.H + 4 : y >= -40 && y <= viewport.H + 40);
    }).length,
    hunters: hunters.length,
    visibleHunters: groundY >= -40 && groundY <= viewport.H + 4
      ? hunters.filter(hunter => { const x = screenX(hunter.x); return x >= -60 && x <= viewport.W + 60; }).length
      : 0,
    particles: session.particles.length,
    fallers: session.state.fallers.length,
    rings: session.state.rings.length,
    tracers: session.state.tracers.length,
    rockets: session.state.rockets.length,
    blasts: session.state.blasts.length,
    eyases: session.state.eyases.length,
    grassVisible: groundVisible,
  };
}

game.initialize();
systems.input.bindInput(options);

const loop = createFrameLoop({
  isPaused: () => session.screen === 'hunt' ? session.paused : session.uiT >= 1.3,
  onFrame(_now, frameGapMs) {
    if (session.paused) return;
    const rendered = metrics.renders !== lastRecordedRender;
    if (rendered || lastSceneLoad === null) lastSceneLoad = getSceneLoad();
    frameHistory.push({ frameGapMs, updateMs: metrics.updateMs, renderMs: metrics.renderMs, rendered, scene: lastSceneLoad });
    lastRecordedRender = metrics.renders;
    if (frameHistory.length > 180) frameHistory.shift();
  },
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

function summarize(values) {
  if (!values.length) return { p50: 0, p95: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p50: Number(sorted[Math.floor((sorted.length - 1) * 0.5)].toFixed(2)),
    p95: Number(sorted[Math.floor((sorted.length - 1) * 0.95)].toFixed(2)),
    max: Number(sorted.at(-1).toFixed(2)),
  };
}

function getMetrics() {
  const samples = frameHistory.filter(sample => sample.frameGapMs > 0);
  const renderSamples = samples.filter(sample => sample.rendered);
  const updateSamples = samples.filter(sample => sample.updateMs > 0);
  const frameTime = samples.reduce((sum, sample) => sum + sample.frameGapMs, 0);
  const renderCount = renderSamples.length;
  const scene = getSceneLoad();
  const sceneKeys = Object.keys(scene);
  return {
    ...metrics,
    canvas: {
      width: viewport.canvas.width,
      height: viewport.canvas.height,
      logicalWidth: viewport.W,
      logicalHeight: viewport.H,
      resolutionScale: viewport.resolutionScale,
    },
    diagnostics: {
      sampleFrames: samples.length,
      rafFps: frameTime ? Number((samples.length * 1000 / frameTime).toFixed(1)) : 0,
      renderFps: frameTime ? Number((renderCount * 1000 / frameTime).toFixed(1)) : 0,
      frameGapMs: summarize(samples.map(sample => sample.frameGapMs)),
      renderCpuMs: summarize(renderSamples.map(sample => sample.renderMs)),
      updateCpuMs: summarize(updateSamples.map(sample => sample.updateMs)),
      slowFrames: frameHistory.filter(sample => sample.frameGapMs > 22.2).slice(-8).map(({ frameGapMs, updateMs, renderMs, scene: load }) => ({
        frameGapMs: Number(frameGapMs.toFixed(2)), updateMs, renderMs, scene: load,
      })),
      scene: {
        ...scene,
        peak: Object.fromEntries(sceneKeys.map(key => [key, frameHistory.reduce((peak, sample) => Math.max(peak, Number(sample.scene[key]) || 0), Number(scene[key]) || 0)])),
      },
      sprites: systems.sprites.getCacheStats(),
      terrain: systems.world.getCacheStats(),
    },
  };
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
  getMetrics,
  invalidate: () => loop.invalidate(),
});
render();
if (!document.hidden) loop.start();