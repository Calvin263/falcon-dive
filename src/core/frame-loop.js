export function createFrameLoop({
  update,
  render,
  isPaused = () => false,
  onFrame = () => {},
  maxFps = 60,
  requestFrame = callback => requestAnimationFrame(callback),
  cancelFrame = handle => cancelAnimationFrame(handle),
}) {
  if (!Number.isFinite(maxFps) || maxFps <= 0) throw new RangeError('maxFps must be positive');
  const interval = 1000 / maxFps;
  let handle = null;
  let last = null;
  let previousUpdate = null;
  let previousFrame = null;
  let dirty = true;
  let running = false;

  function frame(now) {
    handle = null;
    if (!running) return;
    const frameElapsed = previousFrame === null ? 0 : now - previousFrame;
    previousFrame = now;
    const elapsed = last === null ? interval : now - last;
    if (elapsed + 0.1 >= interval) {
      last = now - Math.max(0, elapsed - interval * Math.floor((elapsed + 0.1) / interval));
      if (!isPaused()) {
        const dt = previousUpdate === null ? interval / 1000 : (now - previousUpdate) / 1000;
        previousUpdate = now;
        update(Math.min(1 / 30, dt));
        dirty = true;
      }
      if (dirty) {
        render();
        dirty = false;
      }
    }
    onFrame(now, frameElapsed);
    if (running && !isPaused()) handle = requestFrame(frame);
  }

  return {
    start() {
      if (running) return;
      running = true;
      last = null;
      previousUpdate = null;
      previousFrame = null;
      dirty = true;
      handle = requestFrame(frame);
    },
    stop() {
      running = false;
      if (handle !== null) cancelFrame(handle);
      handle = null;
      last = null;
      previousUpdate = null;
      previousFrame = null;
    },
    invalidate() {
      dirty = true;
      if (running && handle === null) {
        last = null;
        previousUpdate = null;
        previousFrame = null;
        handle = requestFrame(frame);
      }
    },
  };
}