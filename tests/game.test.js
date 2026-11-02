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
  const viewport = { W: 1280, H: 720, resolutionScale: 0.75, canvas: { style: {} }, setResolutionScale(scale) { this.resolutionScale = scale; } };
  const game = createGame(viewport, { storage });
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

test('hunter shots hit cats and goshawks that cross the telegraphed line', () => {
  for (const kind of ['cat', 'hawk']) {
    const { session, systems } = fixture();
    Object.assign(session.bird, { x: 1000, alt: 300, vx: 0, vy: 0 });
    const hunter = { x: 0, ax: 100, aalt: 20, aim: 0.05, reload: 0, flash: 0, tracer: 0, watch: 0, lock: 0 };
    const target = { x: 50, alt: 20, prevX: 50, prevAlt: 0, vx: 0, vy: 0, gone: false };
    if (kind === 'cat') session.state.hazards.cats.push({ ...target, mode: 'leap', dir: 1, t: 1, alertT: 0 });
    else session.state.hazards.hawk = target;
    session.state.hazards.hunters.push(hunter);

    systems.hazards.updateHunter(hunter, 0.1);

    assert.equal(session.state.lastCatch.targetKind, kind);
    assert.equal(session.progress.ach[kind === 'cat' ? 'xcat' : 'xhawk'], session.state.day);
  }
});

test('player gun has a wider hit radius for hunters than ordinary targets', () => {
  const { session, systems } = fixture();
  Object.assign(session.bird, { x: 0, alt: 6 });
  session.state.hazards.hunters.push({ x: 50, alt: 1, gone: false });

  const target = systems.combat.gunTrace(1, 0).hit;

  assert.equal(target.kind, 'hunter');
  assert.equal(systems.combat.gunStat('width'), 2.5);
});

test('a crossed predator does not intercept a hunter shot before the bird', () => {
  const { session, systems } = fixture();
  Object.assign(session.bird, { x: 25, alt: 6.2, vx: 0, vy: 0 });
  const hunter = { x: 0, ax: 100, aalt: 20, aim: 0.05, reload: 0, flash: 0, tracer: 0, watch: 0, lock: 0 };
  session.state.hazards.cats.push({ x: 50, alt: 20, prevX: 50, prevAlt: 0, vx: 0, vy: 0, gone: false, mode: 'leap', dir: 1, t: 1, alertT: 0 });
  session.state.hazards.hunters.push(hunter);

  systems.hazards.updateHunter(hunter, 0.1);

  assert.equal(session.state.over, true);
  assert.equal(session.state.crash.killer, 'hunter');
  assert.equal(session.progress.ach.xcat, undefined);
});

test('bounce steering returns gradually after the one-second lockout', () => {
  const steeringAt = (lockT, controlT) => {
    const { session, systems } = fixture();
    const bird = session.bird;
    const { x, y } = systems.flight.birdAnchor();
    bird.alt = 10;
    bird.speed = 100;
    bird.angle = Math.PI / 4;
    bird.bouncing = { spin: false, v0: 100, lockT, controlT };
    session.mouse.x = x;
    session.mouse.y = y + 1000;
    systems.flight.update(0.1);
    return { angle: bird.angle, controlT: bird.bouncing.controlT };
  };
  const locked = steeringAt(0.1, 0);
  const newlyUnlocked = steeringAt(0, 0);
  const fullyRecovered = steeringAt(-0.9, 0.9);
  assert.equal(locked.controlT, 0);
  assert.equal(newlyUnlocked.controlT, 0.1);
  assert.equal(fullyRecovered.controlT, 1);
  assert.ok(fullyRecovered.angle < newlyUnlocked.angle);
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

test('routine catch feedback preserves warnings and still records scores and bonuses', () => {
  const { session, systems } = fixture();
  session.state.msg = 'A goshawk is hunting you!';
  session.state.msgT = 2.5;
  const priced = systems.session.priceCatch('rabbit');
  const entry = systems.prey.award({ kind: 'rabbit', speed: 20 }, priced, 'Rabbit');
  assert.equal(session.state.msg, 'A goshawk is hunting you!');
  assert.equal(session.state.msgT, 2.5);
  assert.equal(session.state.score, priced.value);
  assert.equal(session.state.catchLog[0], entry);
  assert.equal(session.state.lastCatch.label, 'Rabbit');
  assert.deepEqual(entry.tags, priced.tags);
  const flock = { combo: { entry } };
  systems.prey.addStarling(flock, false);
  assert.equal(session.state.msg, 'A goshawk is hunting you!');
  assert.ok(entry.pts > priced.value);
});

test('flock feedback updates its catch count, earnings, and freshness in place', () => {
  const { session, systems } = fixture();
  const entry = systems.prey.award({ kind: 'flock', count: 1, speed: 20 },
    systems.session.priceCatch('flock'), 'Starling');
  session.state.time = 1;
  systems.prey.addStarling({ combo: { entry } }, false);
  assert.equal(session.state.lastCatch, entry);
  assert.equal(entry.count, 2);
  assert.equal(entry.t, 1);
  assert.ok(entry.pts > 0);
  assert.equal(session.state.catchLog.length, 1);
});

test('eyas calls update persistent status without overwriting warnings', () => {
  const { session, systems } = fixture();
  session.progress.up.eyas = 1;
  systems.companions.spawnEyases();
  session.state.msg = 'Watch out!';
  session.state.msgT = 2;
  systems.companions.eyasCall();
  assert.equal(session.state.eyasHunt, false);
  assert.equal(session.state.msg, 'Watch out!');
  assert.equal(session.state.msgT, 2);
});

test('important banners queue through the fade and deduplicate without losing unlocks', () => {
  const { session, systems } = fixture();
  systems.combat.toast('Achievement', 1);
  systems.combat.tickToast(0.7);
  systems.combat.toast('Rifle unlocked', 4);
  systems.combat.toast('Rifle unlocked', 4);
  systems.combat.toast('Swimming unlocked', 4);
  assert.equal(session.state.toast.text, 'Achievement');
  assert.equal(session.state.toastQ.length, 2);
  systems.combat.tickToast(0.4);
  assert.equal(session.state.toast.text, 'Rifle unlocked');
  systems.combat.tickToast(4);
  assert.equal(session.state.toast.text, 'Swimming unlocked');
});

test('graphics quality preset persists and restores the canvas scale', () => {
  const game = fixture();
  assert.equal(game.systems.settings.setGraphicsPreset('low'), true);
  assert.equal(game.viewport.resolutionScale, 0.5);
  assert.equal(JSON.parse(game.values.get(SETTINGS_KEY)).graphicsPreset, 'low');
  assert.equal(game.systems.settings.setGraphicsPreset('ultra'), false);

  const restored = fixture({ [SETTINGS_KEY]: { graphicsPreset: 'high', animalSizes: DEFAULT_ANIMAL_SIZES } });
  assert.equal(restored.viewport.resolutionScale, 1);
  assert.equal(restored.session.settings.graphicsPreset, 'high');
});