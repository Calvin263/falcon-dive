export function createViewport(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('A 2D canvas is required');
  const viewport = { canvas, ctx, W: 0, H: 0 };
  viewport.resize = (width = innerWidth, height = innerHeight) => {
    viewport.W = canvas.width = Math.max(1, Math.round(width));
    viewport.H = canvas.height = Math.max(1, Math.round(height));
  };
  viewport.resize();
  return viewport;
}