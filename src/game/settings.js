import { SETTINGS_KEY, DEFAULT_ANIMAL_SIZES, SPECIES } from '../config.js';
import { clamp } from '../core/math.js';

const GRAPHICS_PRESETS = [
  { id: 'low', label: 'Low 50%', scale: 0.5 },
  { id: 'medium', label: 'Medium 75%', scale: 0.75 },
  { id: 'high', label: 'High 100%', scale: 1 },
];

export function createSettings({ session, viewport, systems, storage }) {
  session.settings = { animalSizes: { ...DEFAULT_ANIMAL_SIZES }, previewKind: 'rabbit', graphicsPreset: 'medium' };
  function loadSettings() {
    session.settings.animalSizes = { ...DEFAULT_ANIMAL_SIZES };
    try {
      const next = storage.read(SETTINGS_KEY);
      if (!next) {
        saveSettings();
        return;
      }
      const graphicsPreset = GRAPHICS_PRESETS.find(option => option.id === next.graphicsPreset);
      if (graphicsPreset) {
        session.settings.graphicsPreset = graphicsPreset.id;
        viewport.setResolutionScale(graphicsPreset.scale);
      }
      const saved = next.animalSizes && typeof next.animalSizes === 'object' ? next.animalSizes :
                    (next.animalScales && typeof next.animalScales === 'object' ? next.animalScales : null);
      if (saved) {
        for (const kind of Object.keys(DEFAULT_ANIMAL_SIZES)) {
          const value = saved[kind];
          if (typeof value === 'number') session.settings.animalSizes[kind] = clamp(value, 0.5, 4.5);
        }
        saveSettings();
        return;
      }
      if (typeof next.animalScale === 'number') {
        const scale = clamp(next.animalScale, 0.5, 4.5);
        for (const kind of Object.keys(DEFAULT_ANIMAL_SIZES)) session.settings.animalSizes[kind] = scale;
      }
      saveSettings();
    } catch {
      saveSettings();
    }
  }
  function saveSettings() {
    storage.write(SETTINGS_KEY, { animalSizes: session.settings.animalSizes, graphicsPreset: session.settings.graphicsPreset });
  }
  function graphicsOptions() {
    const width = 86, height = 32, gap = 10, total = GRAPHICS_PRESETS.length * width + (GRAPHICS_PRESETS.length - 1) * gap;
    const x0 = (viewport.W - total) / 2, y = viewport.H / 2 + 72;
    return GRAPHICS_PRESETS.map((option, index) => ({
      ...option,
      x: x0 + index * (width + gap),
      y,
      width,
      height,
      selected: option.id === session.settings.graphicsPreset,
    }));
  }
  function graphicsPresetAt(x, y) {
    return graphicsOptions().find(option => x >= option.x && x <= option.x + option.width &&
      y >= option.y && y <= option.y + option.height)?.id ?? null;
  }
  function setGraphicsPreset(id) {
    const option = GRAPHICS_PRESETS.find(candidate => candidate.id === id);
    if (!option) return false;
    session.settings.graphicsPreset = option.id;
    viewport.setResolutionScale(option.scale);
    saveSettings();
    return true;
  }
  function setAnimalScale(kind, value) {
    if (!DEFAULT_ANIMAL_SIZES[kind]) return;
    session.settings.animalSizes[kind] = clamp(value, 0.5, 4.5);
    saveSettings();
  }
  function animalSizeFor(kind) { return session.settings.animalSizes[kind] ?? (SPECIES[kind]?.scale ?? 1); }
  function animalScaleFor(kind) { return animalSizeFor(kind); }
  function animalScaleSlider(kind, index) {
    const labelW = 78;
    const panelW = Math.min(viewport.W - 80, 660);
    const panelH = Math.min(viewport.H - 80, 420);
    const x0 = viewport.W / 2 - panelW / 2;
    const y0 = viewport.H / 2 - panelH / 2;
    const x = x0 + 90;
    const y = y0 + 46 + index * 26;
    const w = 160;
    return { kind, x, y, labelW, w };
  }
  function animalScaleHit(x, y) {
    for (const [index, kind] of Object.keys(DEFAULT_ANIMAL_SIZES).entries()) {
      const r = animalScaleSlider(kind, index);
      const hitX = x >= r.x && x <= r.x + r.w && y >= r.y - 8 && y <= r.y + 12;
      if (hitX) return kind;
    }
    return null;
  }
  function setAnimalScaleFromClientX(kind, clientX) {
    const index = Object.keys(DEFAULT_ANIMAL_SIZES).indexOf(kind);
    const r = animalScaleSlider(kind, index);
    const t = clamp((clientX - r.x) / r.w, 0, 1);
    setAnimalScale(kind, 0.5 + t * 4);
  }
  function copyAnimalSizes() {
    const text = `const DEFAULT_ANIMAL_SIZES = ${JSON.stringify(session.settings.animalSizes, null, 2)};`;
    try {
      if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(() => {});
      } else if (document && document.execCommand) {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      }
      systems.combat.toast('Copied sizes', 1.8);
    } catch {
      systems.combat.toast('Copy blocked', 1.8);
    }
  }
  function pauseCopyButtonHit(x, y) {
    const panelW = Math.min(viewport.W - 80, 660);
    const panelH = Math.min(viewport.H - 80, 420);
    const x0 = viewport.W / 2 - panelW / 2;
    const y0 = viewport.H / 2 - panelH / 2;
    const leftW = 320;
    const previewX = x0 + leftW + 18;
    const previewW = panelW - leftW - 36;
    const copyX = previewX + 10;
    const copyY = y0 + panelH - 82;
    const copyW = previewW - 20;
    return x >= copyX && x <= copyX + copyW && y >= copyY && y <= copyY + 26;
  }
  return { animalScaleFor, graphicsOptions, graphicsPresetAt, loadSettings, setAnimalScaleFromClientX, setGraphicsPreset };
}
