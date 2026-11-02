import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game.js';
import { createStorage } from '../src/core/storage.js';
import { DEFAULT_ANIMAL_SIZES, SETTINGS_KEY, SPECIES, PROGRESS_KEY } from '../src/config.js';

function fixture(saved = {}) {
  const values = new Map(Object.entries(saved).map(([key, value]) => [key, JSON.stringify(value)]));
  const storage = createStorage(() => ({
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }));
  const game = createGame({ W: 1280, H: 720, canvas: { style: {} } }, { storage });
  game.initialize();
  return { ...game, values };
}

test('games have isolated sessions and initialize without the DOM', () => {
  const first = fixture();
  const second = fixture();
  first.session.progress.money = 123;
  assert.equal(second.session.progress.money, 0);
  assert.notEqual(first.session.prey, second.session.prey);
  assert.ok(first.session.prey.length > 0);
  assert.equal(first.session.screen, 'hunt');
});

test('save migration and returning-player roost remain compatible', () => {
  const game = fixture({
    [PROGRESS_KEY]: { day: 3, money: 50, up: { camo: 2, wary: 1, screech: 1, rifle: 3 } },
    'falconDive.achievements': ['stoop'],
  });
  assert.equal(game.session.screen, 'shop');
  assert.equal(game.session.progress.up.stealth, 2);
  assert.equal(game.session.progress.up.shell, 2);
  assert.equal(game.session.progress.money, 140);
  assert.equal(game.session.progress.up.camo, undefined);
  assert.equal(game.session.progress.ach.stoop, -1);
});

test('upgrade purchases and day earnings persist exactly once', () => {
  const game = fixture();
  game.session.progress.money = 100;
  assert.equal(game.systems.progression.buyUpgrade('muscles'), true);
  assert.equal(game.session.progress.money, 60);
  assert.equal(game.systems.progression.buyUpgrade('muscles'), false);
  game.session.state.score = 25;
  game.systems.session.endDay('sunset');
  game.systems.session.endDay('sunset');
  assert.equal(game.session.progress.money, 85);
  assert.equal(JSON.parse(game.values.get(PROGRESS_KEY)).day, 2);
  game.systems.session.showRecap();
  assert.equal(game.session.screen, 'recap');
  game.systems.session.showShop();
  game.systems.session.startDay();
  assert.equal(game.session.screen, 'hunt');
  assert.equal(game.session.state.day, 2);
});

test('terrain is reused, invalidated by seed, and bounded across long travel', () => {
  const { session, systems } = fixture();
  const first = systems.world.lakeAt(2);
  assert.equal(systems.world.lakeAt(2), first);
  session.worldSeed += 1;
  assert.notEqual(systems.world.lakeAt(2), first);
  for (let index = 0; index < 1500; index++) systems.world.lakeAt(index);
  assert.equal(systems.world.getCacheStats().entries, 512);
});

test('hearing remains omnidirectional and prey reacts after its reaction delay', () => {
  const { session, systems } = fixture();
  session.bird.x = 0;
  session.bird.alt = 10;
  session.state.tod = 0;
  session.state.hearingRadius = 50;
  const hare = { kind: 'hare', x: 10, vx: 2, lookA: 0, alertT: 0 };
  const sense = systems.prey.sensesInfo(hare);
  assert.equal(sense.reason, 'sound');
  systems.prey.sensed(hare, 0.4);
  assert.equal(hare.fleeing, true);
  assert.equal(hare.lastSense, 'sound');
});

test('flight, braking, turtle release, and pause remain wired', () => {
  const { session, systems } = fixture();
  session.mouse.x = 1000;
  session.mouse.y = 100;
  for (let frame = 0; frame < 120; frame++) systems.flight.update(1 / 60);
  assert.ok(session.state.time > 1.9);
  assert.ok(Number.isFinite(session.bird.alt));
  assert.ok(Number.isFinite(session.cam.zoom));
  session.mouse.down = true;
  systems.flight.update(1 / 60);
  assert.equal(session.bird.mode, 'BRAKE');
  assert.ok(session.bird.brakeE < 1);
  session.bird.carrying = { kind: 'turtle' };
  systems.prey.dropTurtle();
  assert.equal(session.bird.carrying, null);
  assert.equal(session.state.fallers.length, 1);
  session.paused = true;
  const time = session.state.time;
  systems.flight.update(1);
  assert.equal(session.state.time, time);
});

test('catch pricing preserves species values and repeat fatigue', () => {
  const { systems } = fixture();
  const first = systems.session.priceCatch('rabbit');
  const second = systems.session.priceCatch('rabbit');
  assert.equal(first.value, SPECIES.rabbit.bounty + 10);
  assert.ok(second.tags.some(tag => tag.startsWith('Repeat')));
});

test('storage handles corrupt data and unavailable browser storage', () => {
  const corrupt = createStorage(() => ({ getItem: () => '{invalid' }));
  assert.equal(corrupt.read('key', 42), 42);
  const blocked = createStorage(() => { throw new Error('blocked'); });
  assert.equal(blocked.read('key'), null);
  assert.equal(blocked.write('key', {}), false);
  const game = createGame({ W: 800, H: 600, canvas: { style: {} } }, { storage: blocked });
  assert.doesNotThrow(() => game.initialize());
});

test('animal size settings save the edited values and reload compatibly', () => {
  const game = fixture();
  game.systems.settings.setAnimalScaleFromClientX('rabbit', 1000);
  const saved = JSON.parse(game.values.get(SETTINGS_KEY)).animalSizes;
  assert.equal(saved.rabbit, 4.5);
  assert.deepEqual(Object.keys(saved), Object.keys(DEFAULT_ANIMAL_SIZES));
  const reloaded = fixture({ [SETTINGS_KEY]: { animalSizes: saved } });
  assert.equal(reloaded.session.settings.animalSizes.rabbit, 4.5);
});