import { createProgression } from './game/progression.js';
import { createSettings } from './game/settings.js';
import { createInput } from './input.js';
import { createSession } from './game/session.js';
import { createPrey } from './simulation/prey.js';
import { createWorld } from './simulation/world.js';
import { createCombat } from './simulation/combat.js';
import { createHazards } from './simulation/hazards.js';
import { createCompanions } from './simulation/companions.js';
import { createWater } from './simulation/water.js';
import { createFlight } from './simulation/flight.js';
import { createSkyEncounters } from './simulation/sky.js';
import { createRenderer } from './rendering/renderer.js';
import { createSprites } from './rendering/sprites.js';
import { createHud } from './rendering/hud.js';
import { createScreens } from './rendering/screens.js';
import { createStorage } from './core/storage.js';

export function createGame(viewport, { storage = createStorage() } = {}) {
  const session = { timeScale: 1, worldSeed: 0 };
  const systems = {};
  const context = { session, viewport, systems, storage };
  systems.progression = createProgression(context);
  systems.settings = createSettings(context);
  systems.input = createInput(context);
  systems.session = createSession(context);
  systems.prey = createPrey(context);
  systems.world = createWorld(context);
  systems.combat = createCombat(context);
  systems.hazards = createHazards(context);
  systems.companions = createCompanions(context);
  systems.water = createWater(context);
  systems.sky = createSkyEncounters(context);
  systems.flight = createFlight(context);
  systems.renderer = createRenderer(context);
  systems.sprites = createSprites(context);
  systems.hud = createHud(context);
  systems.screens = createScreens(context);
  function initialize() {
    systems.progression.loadProgress();
    systems.settings.loadSettings();
    systems.session.reset();
    if (session.progress.day > 1) systems.session.showShop();
  }
  return { ...context, initialize };
}
