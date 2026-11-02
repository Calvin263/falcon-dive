export function createViewport(canvas, { resolutionScale = 0.75 } = {}) {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('A 2D canvas is required');
  const overlayCanvas = document.createElement('canvas');
  overlayCanvas.id = 'hud-overlay';
  overlayCanvas.setAttribute('aria-hidden', 'true');
  canvas.insertAdjacentElement('afterend', overlayCanvas);
  const overlayCtx = overlayCanvas.getContext('2d');
  if (!overlayCtx) throw new Error('A 2D overlay canvas is required');
  if (!Number.isFinite(resolutionScale) || resolutionScale <= 0 || resolutionScale > 1) {
    throw new RangeError('resolutionScale must be greater than 0 and at most 1');
  }
  const viewport = { canvas, ctx, overlayCanvas, overlayCtx, W: 0, H: 0, resolutionScale };
  viewport.resize = (width = innerWidth, height = innerHeight) => {
    viewport.W = Math.max(1, Math.round(width));
    viewport.H = Math.max(1, Math.round(height));
    canvas.width = Math.max(1, Math.round(viewport.W * viewport.resolutionScale));
    canvas.height = Math.max(1, Math.round(viewport.H * viewport.resolutionScale));
    canvas.style.width = `${viewport.W}px`;
    canvas.style.height = `${viewport.H}px`;
    ctx.setTransform(canvas.width / viewport.W, 0, 0, canvas.height / viewport.H, 0, 0);
    overlayCanvas.width = viewport.W;
    overlayCanvas.height = viewport.H;
    overlayCanvas.style.width = `${viewport.W}px`;
    overlayCanvas.style.height = `${viewport.H}px`;
    overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
  };
  viewport.setResolutionScale = scale => {
    if (!Number.isFinite(scale) || scale <= 0 || scale > 1) {
      throw new RangeError('resolutionScale must be greater than 0 and at most 1');
    }
    if (scale === viewport.resolutionScale) return false;
    viewport.resolutionScale = scale;
    viewport.resize(viewport.W, viewport.H);
    return true;
  };
  viewport.resize();
  return viewport;
}