
export const lerp = (a, b, t) => a + (b - a) * t;
export function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

export const randDir = () => (Math.random() < 0.5 ? -1 : 1);

export function wrapAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
export const mixRGB = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
export const rgb = c => `rgb(${c[0]},${c[1]},${c[2]})`;

export const hash = n => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };
