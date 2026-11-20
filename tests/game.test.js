import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game.js';
import { createStorage } from '../src/core/storage.js';
import { DEFAULT_ANIMAL_SIZES, SETTINGS_KEY, SPECIES, PROGRESS_KEY, HUNTER_AIM_T, HUNTER_RANGE, ESCAPE_V, G, MOONSHOT_T, GROTTO_L, GROTTO_H, OCTO_START_X, OCTO_HP, DAY_END_HOUR, DAY_LENGTH } from '../src/config.js';

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

test('moon flight requires upward ceiling contact at escape speed, not total speed or upgrades', () => {
  const dt = 1 / 120;
  for (const { altitude, vertical, horizontal = 0, ceilingTier = 0, launches } of [
    { altitude: -1, vertical: ESCAPE_V - 0.01, launches: false },
    { altitude: -1, vertical: ESCAPE_V, launches: true },
    { altitude: -1, vertical: ESCAPE_V + 1, ceilingTier: 3, launches: true },
    { altitude: -10, vertical: ESCAPE_V + 1, launches: false },
    { altitude: 1, vertical: ESCAPE_V + 1, launches: false },
    { altitude: 1, vertical: -ESCAPE_V - 1, launches: false },
    { altitude: -1, vertical: ESCAPE_V - 1, horizontal: ESCAPE_V, launches: false },
  ]) {
    const { session, systems, values } = fixture();
    session.progress.up.ceiling = ceilingTier;
    systems.session.startDay();
    systems.progression.dragBase = () => 0;
    systems.world.windX = () => 0;
    systems.world.updraft = () => 0;
    const initialVertical = vertical + G * dt;
    Object.assign(session.bird, {
      alt: session.MAX_ALT + altitude,
      speed: Math.hypot(horizontal, initialVertical),
      angle: Math.atan2(initialVertical, horizontal),
      bouncing: null,
    });
    const anchor = systems.flight.birdAnchor();
    session.mouse.x = anchor.x + horizontal;
    session.mouse.y = anchor.y - initialVertical * session.cam.zoomY / session.cam.zoom;
    systems.flight.update(dt);
    assert.equal(!!session.state.moonshot, launches, JSON.stringify({ altitude, vertical, horizontal, ceilingTier }));
    if (launches) {
      assert.ok(!session.state.msg.includes('ESCAPE VELOCITY'));
      assert.ok(session.state.moonshot.v0 >= ESCAPE_V);
      systems.flight.update(MOONSHOT_T);
      assert.equal(session.state.moonshot.landed, true);
      assert.equal(session.progress.ach.moon, session.state.day);
      assert.equal(session.progress.moon, session.state.day);
      assert.equal(session.state.lastCatch.targetKind, 'moon');
      assert.equal(JSON.parse(values.get(PROGRESS_KEY)).ach.moon, session.state.day);
    }
  }
});

test('fast spinning ground bounces wait for the ceiling before starting moon flight', () => {
  const { session, systems } = fixture();
  session.progress.up.bounce = 4;
  systems.session.startDay();
  systems.progression.dragBase = () => 0;
  systems.world.windX = () => 0;
  systems.world.updraft = () => 0;
  systems.world.lakeAtX = () => null;
  Object.assign(session.bird, {
    alt: 0.1, speed: ESCAPE_V + 100, angle: -Math.PI / 2,
    bouncing: { spin: true, lockT: 1, v0: ESCAPE_V + 100, chain: 0 },
  });
  session.state.msg = 'Keep this notice';
  systems.flight.update(1 / 120);
  assert.ok(session.bird.vy > ESCAPE_V);
  assert.ok(session.bird.bouncing.spin);
  assert.equal(session.state.moonshot, null);
  assert.equal(session.state.msg, 'Keep this notice');
  for (let frame = 0; frame < 240 && !session.state.moonshot; frame++) systems.flight.update(1 / 120);
  assert.ok(session.bird.alt >= session.MAX_ALT);
  assert.ok(session.state.moonshot.v0 >= ESCAPE_V);
  assert.equal(session.bird.bouncing, null);
});

test('predator arrivals and attack outcomes do not replace retained notices', () => {
  const { session, systems } = fixture();
  session.state.msg = 'Keep this notice';
  session.state.msgT = 2;
  session.state.day = 10;
  session.state.hazards.hawkT = 0;
  session.state.hazards.cats = [];
  session.state.hazards.hunters = [];
  systems.hazards.updateHazards(0.01);
  const hawk = session.state.hazards.hawk;
  assert.equal(hawk.mode, 'stalk');
  Object.assign(hawk, { x: session.bird.x + 60, alt: session.bird.alt, t: 0 });
  systems.hazards.updateHazards(0.01);
  assert.equal(hawk.mode, 'stoop');
  hawk.t = 0;
  systems.hazards.updateHazards(0.01);
  assert.equal(hawk.mode, 'recover');
  Object.assign(hawk, { t: 0, attacks: 100 });
  systems.hazards.updateHazards(0.01);
  assert.equal(hawk.mode, 'leave');
  assert.equal(session.state.msg, 'Keep this notice');
  assert.equal(session.state.msgT, 2);
});

test('seconds to sunset follow real-time slow-motion rate and freeze while paused', () => {
  const { session, systems } = fixture();
  const setRemaining = seconds => {
    session.state.tod = systems.progression.todForHour(DAY_END_HOUR - seconds * 24 / DAY_LENGTH);
  };
  session.timeScale = 1;
  setRemaining(10);
  assert.ok(Math.abs(systems.session.daySecondsLeft() - 10) < 1e-9);
  session.timeScale = 0.5;
  assert.ok(Math.abs(systems.session.daySecondsLeft() - 20) < 1e-9);
  setRemaining(5);
  assert.ok(Math.abs(systems.session.daySecondsLeft() - 10) < 1e-9);
  session.paused = true;
  systems.flight.update(1);
  assert.ok(Math.abs(systems.session.daySecondsLeft() - 10) < 1e-9);
  session.paused = false;
  systems.flight.update(0.5);
  assert.ok(Math.abs(systems.session.daySecondsLeft() - 9) < 1e-9);
  assert.ok(!session.state.msg.includes('30 minutes'));
  setRemaining(-1);
  assert.equal(systems.session.daySecondsLeft(), 0);
  systems.flight.update(0.01);
  assert.equal(session.state.over, true);
  assert.equal(session.state.recap.reason, 'sunset');
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

function catEncounter(hawkMode = 'stalk', catMode = 'hide') {
  const game = fixture();
  const { session, systems } = game;
  systems.water.spawnHazards = () => {};
  systems.world.lakeAtX = () => null;
  systems.world.insideCloud = () => false;
  Object.assign(session.bird, { x: 2, alt: 2, vx: 0, vy: 0 });
  const cat = { x: 0, alt: 0, mode: catMode, tgt: 'bird', dir: 1, t: 0, alertT: 0, vx: 0, vy: 0 };
  const hawk = { x: 20, alt: 10, vx: 0, vy: 0, mode: hawkMode, t: 10, flapT: 0, alertT: 0, minD: Infinity, attacks: 0 };
  session.state.hazards.cats = [cat];
  session.state.hazards.hawk = hawk;
  return { ...game, cat, hawk };
}

test('cats prioritize pursuing goshawks over a closer player and can switch during crouch', () => {
  for (const mode of ['stalk', 'stoop']) {
    for (const catMode of ['hide', 'crouch']) {
      const { systems, cat } = catEncounter(mode, catMode);
      systems.hazards.updateHazards(0);
      assert.equal(cat.tgt, 'hawk');
      assert.equal(cat.mode, catMode === 'hide' ? 'crouch' : 'leap');
      if (cat.mode === 'leap') assert.ok(cat.vx > 20);
    }
  }
});

test('cats retain normal targeting for absent, departing, or out-of-range goshawks', () => {
  for (const scenario of ['absent', 'gone', 'high', 'far', 'leave', 'recover']) {
    const { session, systems, cat, hawk } = catEncounter();
    if (scenario === 'absent') session.state.hazards.hawk = null;
    if (scenario === 'gone') hawk.gone = true;
    if (scenario === 'high') hawk.alt = 100;
    if (scenario === 'far') hawk.x = 100;
    if (scenario === 'leave' || scenario === 'recover') hawk.mode = scenario;
    systems.hazards.updateHazards(0);
    assert.equal(cat.tgt, 'bird', scenario);
  }
});

test('a cat can complete a prioritized goshawk leap and earn Cat Among the Hawks', () => {
  const { session, systems, cat, hawk, values } = catEncounter();
  systems.hazards.updateHazards(0);
  cat.t = 0;
  systems.hazards.updateHazards(0);
  assert.equal(cat.mode, 'leap');
  assert.equal(cat.tgt, 'hawk');
  Object.assign(session.bird, { x: 100, alt: 100 });
  for (let frame = 0; frame < 120 && !hawk.gone; frame++) {
    Object.assign(hawk, { x: 20, alt: 10, vx: 0, vy: 0 });
    systems.hazards.updateHazards(1 / 120);
  }
  assert.equal(hawk.gone, true);
  assert.equal(session.state.over, false);
  assert.equal(session.state.lastCatch.by, 'cat');
  assert.equal(session.progress.ach.cathawk, session.state.day);
  assert.equal(JSON.parse(values.get(PROGRESS_KEY)).ach.cathawk, session.state.day);
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

test('secret upgrades and achievements give no advance hints', () => {
  const { session, systems } = fixture();
  const upgrades = systems.progression.shopUpgrades();
  assert.ok(!upgrades.some(u => u.id === 'rifle' || u.id === 'eyasgun'));
  const shell = upgrades.find(u => u.id === 'shell');
  assert.deepEqual(systems.progression.upgradeCosts(shell), [60]);
  assert.ok(!shell.desc.includes('rifle') && !shell.desc.includes('grotto'));
  assert.equal(upgrades.find(u => u.id === 'aim').stat(0), 'Drop only (no aim)');
  const hidden = ['skeet', 'drownedTurtle', 'buzzsaw', 'parry', 'kraken', 'moon', 'satellite'];
  assert.ok(systems.progression.visibleAchievements().filter(a => hidden.includes(a.id)).every(a => a.name && a.desc === 'hidden achievement' && a.reward === null));
  systems.combat.achieve('parry');
  assert.ok(systems.progression.visibleAchievements().some(a => a.id === 'parry'));
  session.progress.gunFound = true;
  assert.deepEqual(systems.progression.upgradeCosts(shell), [60, 200]);
  assert.ok(!shell.stat(2).includes('rifle'));
  session.progress.up.shell = 2;
  assert.equal(shell.stat(2), 'start carrying a loaded rifle');
  assert.ok(systems.progression.shopUpgrades().some(u => u.id === 'rifle'));
});

test('lake depth, grotto presence, and deep routes vary without any fixed spawn slots', () => {
  const { session, systems } = fixture();
  const cases = new Set(), slotTypes = new Set();
  const seeds = [0, 37, 143, 256, 511, 843];
  for (const seed of seeds) {
    session.worldSeed = seed;
    slotTypes.add(`${systems.world.lakeAt(0).on}:${!!systems.world.lakeAt(0).vents}`);
    for (let index = -30; index < 30; index++) {
      const lake = systems.world.lakeAt(index);
      if (!lake.on) continue;
      cases.add(`${!!lake.vents}:${lake.grotto}`);
      if (!lake.vents) {
        assert.equal(lake.grotto, false);
        assert.equal(lake.mouth, undefined);
        assert.equal(systems.water.grottoOpen(lake), false);
        continue;
      }
      assert.ok(lake.depth >= 46);
      assert.equal(lake.vents.length, 3);
      for (const [index, vent] of lake.vents.entries()) {
        assert.equal(systems.world.lakeAtX(vent.x), lake);
        assert.ok(vent.alt > -lake.depth);
        if (index === 0) continue;
        const previous = lake.vents[index - 1];
        assert.ok(vent.alt < previous.alt);
        assert.ok(Math.hypot(vent.x - previous.x, vent.alt - previous.alt) < 24);
      }
      assert.equal(!!lake.mouth, lake.grotto);
      if (lake.mouth) assert.equal(systems.world.lakeAtX(lake.mouth.x), lake);
    }
  }
  assert.deepEqual(cases, new Set(['false:false', 'true:false', 'true:true']));
  assert.ok(slotTypes.size > 1);
  const last = structuredClone(systems.world.lakeAt(0));
  session.worldSeed = 0;
  systems.world.lakeAt(0);
  session.worldSeed = seeds.at(-1);
  assert.deepEqual(systems.world.lakeAt(0), last);
});

test('deep fish spawn only in basins and stay within reach of the bottom air route', () => {
  const { session, systems } = fixture();
  session.worldSeed = 256;
  session.state.fish = [];
  session.state.spawn.lakes.clear();
  const lakes = Array.from({ length: 60 }, (_, index) => systems.world.lakeAt(index - 30));
  const basin = lakes.find(lake => lake.vents);
  session.bird.x = basin.vents.at(-1).x;
  systems.prey.spawnPreyAhead();
  const fish = session.state.fish.filter(item => item.lake === basin && ['anglerfish', 'lanternfish'].includes(item.kind));
  assert.equal(fish.filter(item => item.kind === 'anglerfish').length, 1);
  assert.equal(fish.filter(item => item.kind === 'lanternfish').length, 3);
  for (const item of fish) {
    assert.ok(-item.alt >= SPECIES[item.kind].depth[0] && item.alt > -basin.depth);
    assert.ok(Math.abs(item.x - basin.vents.at(-1).x) < 14);
  }
  const angler = fish.find(item => item.kind === 'anglerfish');
  angler.x = angler.maxX;
  angler.vx = 2;
  systems.water.splashAt(angler.x, basin);
  assert.equal(angler.spooked, false);
  systems.water.updateFish(1 / 60);
  assert.equal(angler.x, angler.maxX);
  assert.ok(angler.vx < 0);
  const score = session.state.score;
  Object.assign(session.bird, { x: angler.x, alt: angler.alt, inWater: basin, entrySpeed: 30, vx: 0, vy: 0 });
  systems.water.updateFish(1 / 60);
  assert.ok(!session.state.fish.includes(angler));
  assert.equal(session.state.lastCatch.kind, 'anglerfish');
  assert.ok(session.state.score > score);
  const shallow = lakes.find(lake => lake.on && !lake.vents);
  session.bird.x = shallow.x0 + shallow.w / 2;
  systems.prey.spawnPreyAhead();
  const shallowFish = session.state.fish.filter(item => item.lake === shallow);
  assert.ok(shallowFish.length > 0);
  assert.ok(shallowFish.every(item => ['trout', 'pike'].includes(item.kind)));
});

test('grottos are random world features independent of gun progression', () => {
  const { session, systems } = fixture();
  session.worldSeed = 256;
  const lakes = Array.from({ length: 60 }, (_, index) => systems.world.lakeAt(index - 30));
  assert.ok(lakes.some(l => l.on && l.grotto));
  assert.ok(lakes.some(l => l.on && !l.grotto));
  const lake = lakes.find(l => l.on && l.grotto);
  assert.equal(systems.water.grottoOpen(lake), true);
  session.state.grottoCleared[lake.x0] = true;
  assert.equal(systems.water.grottoOpen(lake), false);
});

test('generated basin vents refill locally and mouths work in either direction without upgrades', () => {
  const { session, systems } = fixture();
  const lakes = [0, 37, 143, 256, 511, 843].flatMap(seed => {
    session.worldSeed = seed;
    return Array.from({ length: 60 }, (_, index) => systems.world.lakeAt(index - 30));
  });
  for (const direction of [-1, 1]) {
    const lake = lakes.find(candidate => candidate.mouth?.direction === direction);
    assert.ok(lake);
    const { bird } = session;
    Object.assign(bird, lake.vents[1], { breath: 1, inWater: lake });
    systems.water.updateLakeBreath(lake, 0.5);
    assert.equal(bird.breath, systems.progression.swimBreath());
    bird.alt += 4;
    systems.water.updateLakeBreath(lake, 0.5);
    assert.equal(bird.breath, systems.progression.swimBreath() - 0.5);
    Object.assign(bird, lake.mouth, { vx: -direction });
    assert.equal(systems.water.atGrottoMouth(lake), false);
    bird.vx = direction;
    assert.equal(systems.water.atGrottoMouth(lake), true);
    systems.water.enterGrotto(lake);
    Object.assign(bird, { x: 0.4, angle: Math.PI, speed: 0.3 });
    systems.water.updateGrotto(0.01);
    assert.equal(session.state.grotto, null);
    assert.equal(bird.x, lake.mouth.x - direction * 3);
    assert.equal(bird.alt, lake.mouth.alt + 1);
  }
});

function grottoEncounter() {
  const game = fixture();
  const lake = { x0: 1000, w: 100, depth: 32, grotto: true, mouth: { x: 1050, alt: -27, direction: 1 } };
  game.session.bird.inWater = lake;
  game.systems.water.enterGrotto(lake);
  game.session.bird.breath = 100;
  game.session.bird.invulnT = 100;
  game.session.state.grotto.octo.atkT = 100;
  return game;
}

test('octopus starts nearer the entrance and retreats only when approached, pausing while frozen', () => {
  const { session, systems } = grottoEncounter();
  const o = session.state.grotto.octo;
  assert.equal(o.x, OCTO_START_X);
  assert.ok(o.x < GROTTO_L / 2);
  systems.water.updateGrotto(0.1);
  assert.equal(o.x, OCTO_START_X);
  Object.assign(session.bird, { x: o.x - 20, alt: o.alt, speed: 0.3 });
  systems.water.updateGrotto(0.1);
  assert.ok(o.x > OCTO_START_X);
  const x = o.x;
  o.frozenT = 1;
  systems.water.octoHit({ part: o }, 'BANG!');
  systems.water.updateGrotto(0.1);
  assert.equal(o.x, x);
  o.frozenT = 0;
  systems.water.updateGrotto(0.1);
  assert.ok(o.x > x);
});

test('head and tentacle hits recoil the octopus deeper without changing damage or interruption', () => {
  const { session, systems } = grottoEncounter();
  const o = session.state.grotto.octo;
  session.state.msg = 'Keep this notice';
  session.state.msgT = 2;
  systems.water.octoHit({ part: o }, 'BANG!');
  assert.equal(session.state.msg, 'Keep this notice');
  assert.equal(session.state.msgT, 2);
  assert.equal(o.hp, OCTO_HP - 1);
  assert.ok(o.retreatX > o.x);
  const start = o.x;
  systems.water.updateGrotto(0.1);
  assert.ok(o.x > start + 0.5);
  const tn = o.tents[0], x = o.x;
  tn.mode = 'wind';
  tn.ux = -1; tn.uy = 0; tn.wind = 1;
  systems.water.octoHit({ part: tn }, 'BANG!');
  assert.equal(tn.mode, 'retract');
  assert.equal(tn.stun, 2);
  assert.equal(o.hp, OCTO_HP - 1);
  systems.water.updateGrotto(0.1);
  assert.ok(o.x > x + 0.5);
  o.x = GROTTO_L - 14;
  o.retreatX = o.x;
  systems.water.octoHit({ part: o }, 'BOOM!');
  assert.ok(!session.state.msg.includes('Octopus hit'));
  assert.equal(o.hp, OCTO_HP - 5);
  systems.water.updateGrotto(0.1);
  assert.equal(o.x, GROTTO_L - 14);
  assert.ok(o.x + 3.2 < GROTTO_L);
});

test('grotto end wall blocks swimming and gun rays; defeat still awards and permits the left exit', () => {
  const { session, systems, values } = grottoEncounter();
  const g = session.state.grotto, o = g.octo;
  Object.assign(session.bird, { x: GROTTO_L - 0.5, alt: GROTTO_H / 2, speed: 3, angle: 0 });
  systems.water.updateGrotto(0.1);
  assert.equal(session.bird.x, GROTTO_L - 1);
  assert.equal(systems.combat.gunTrace(1, 0).t, 1);
  session.bird.x = 2;
  assert.equal(systems.combat.gunTrace(-1, 0).t, 2);
  o.hp = 1;
  systems.water.octoHit({ part: o }, 'BANG!');
  assert.equal(session.state.grottoCleared[g.lake.x0], true);
  assert.equal(session.state.lastCatch.targetKind, 'octopus');
  assert.equal(session.progress.ach.kraken, session.state.day);
  assert.equal(JSON.parse(values.get(PROGRESS_KEY)).ach.kraken, session.state.day);
  Object.assign(session.bird, { x: 0.4, angle: Math.PI, speed: 0.3 });
  systems.water.updateGrotto(0.01);
  assert.equal(session.state.grotto, null);
  assert.equal(session.bird.inWater, g.lake);
  assert.equal(session.bird.x, g.lake.mouth.x - 3);
  assert.equal(session.bird.alt, g.lake.mouth.alt + 1);
});

test('base turtles drop without aiming and the first aim upgrade adds a push', () => {
  const { session, systems } = fixture();
  Object.assign(session.bird, { vx: 10, vy: -5 });
  session.mouse.x = 1000;
  session.mouse.y = 100;
  assert.deepEqual(systems.prey.throwVelocity(true), { vx: 10, vy: -5 });
  session.progress.up.aim = 1;
  const aimed = systems.prey.throwVelocity(true);
  assert.ok(Math.hypot(aimed.vx - 10, aimed.vy + 5) > 0);
  assert.deepEqual(systems.prey.throwVelocity(false), { vx: 10, vy: -5 });
});

test('talons-out pose is restricted to active empty-handed grabbing', () => {
  const { session, systems } = fixture();
  assert.equal(systems.input.talonsOut(), false);
  session.mouse.aiming = true;
  assert.equal(systems.input.talonsOut(), true);
  for (const carrying of [{ kind: 'turtle' }, { kind: 'gun', ammo: 1 }]) {
    session.bird.carrying = carrying;
    assert.equal(systems.input.talonsOut(), false);
  }
  session.bird.carrying = null;
  session.mouse.throwHeld = true;
  assert.equal(systems.input.talonsOut(), false);
  session.mouse.throwHeld = false;
  session.paused = true;
  assert.equal(systems.input.talonsOut(), false);
  session.paused = false;
  session.screen = 'shop';
  assert.equal(systems.input.talonsOut(), false);
  session.screen = 'hunt';
  session.state.over = true;
  assert.equal(systems.input.talonsOut(), false);
});

test('intact turtles can be picked up immediately after every landing path', () => {
  for (const flags of [{}, { struck: true }, { ricochets: 1 }]) {
    const { session, systems } = fixture();
    systems.world.lakeAtX = () => null;
    session.prey = [];
    Object.assign(session.bird, { x: 0, alt: 1, vx: 0, vy: 0 });
    session.state.fallers = [{ x: 0, alt: 0.01, vx: 0, vy: -1, spin: 0, ...flags }];
    systems.combat.updateFallers(0.1);
    assert.equal(session.state.fallers.length, 0);
    assert.equal(session.prey.length, 1);
    assert.equal(session.prey[0].failCD, 0);
    systems.prey.checkCatch(session.prey[0], 0);
    assert.equal(session.bird.carrying.kind, 'turtle');
  }
});

test('a turtle dropped in water sinks for a special reward and a one-time achievement', () => {
  const { session, systems } = fixture();
  const lake = { x0: -100, w: 200, depth: 12 };
  systems.world.lakeAtX = () => lake;
  session.prey = [];
  const land = () => {
    session.state.fallers.push({ x: 0, alt: 0.01, vx: 0, vy: -2, spin: 0 });
    systems.combat.updateFallers(0.1);
  };
  land();
  assert.equal(session.state.catchLog.length, 1);
  assert.equal(session.state.lastCatch.drowned, true);
  assert.equal(session.state.lastCatch.method, 'water');
  assert.equal(session.state.lastCatch.pts, SPECIES.turtle.bounty * 2 + 10);
  assert.equal(session.progress.ach.drownedTurtle, session.state.day);
  assert.equal(session.progress.money, 75);
  assert.equal(session.prey.length, 0);
  land();
  assert.equal(session.progress.money, 75);
  assert.equal(session.state.catchLog.length, 2);
});

test('a grabbed falling turtle cannot also land or drown in the same frame', () => {
  const { session, systems } = fixture();
  Object.assign(session.bird, { x: 0, alt: 1 });
  const turtle = { x: 0, alt: 1, vx: 0, vy: -10, spin: 0 };
  session.state.fallers = [turtle];
  systems.world.lakeAtX = () => ({ x0: -100, w: 200 });
  systems.prey.grabFallingTurtle(turtle);
  systems.combat.updateFallers(1);
  assert.equal(session.bird.carrying.kind, 'turtle');
  assert.equal(session.state.fallers.length, 0);
  assert.equal(session.state.catchLog.length, 0);
});

test('land prey cannot cross lake shores in either direction, even on a large step', () => {
  const { session, systems } = fixture();
  const lake = Array.from({ length: 60 }, (_, i) => systems.world.lakeAt(i)).find(l => l.on);
  assert.equal(systems.world.landStep(lake.x0 - 1, lake.x0 + lake.w + 1), lake.x0 - 0.1);
  assert.equal(systems.world.landStep(lake.x0 + lake.w + 1, lake.x0 - 1), lake.x0 + lake.w + 0.1);
  for (const direction of [-1, 1]) {
    const x = direction > 0 ? lake.x0 - 0.01 : lake.x0 + lake.w + 0.01;
    const turtle = systems.prey.makeGround(x, 'turtle');
    turtle.vx = direction * 0.4;
    session.bird.x = x - 100;
    systems.prey.updateGroundPrey(turtle, 1);
    assert.equal(systems.world.lakeAtX(turtle.x), null);
    assert.equal(Math.sign(turtle.vx), -direction);
  }
});

test('buzzsaw kills retain their method without becoming gun or skeet kills', () => {
  const { session, systems } = fixture();
  const turtle = { x: 100, alt: 20 };
  systems.combat.takeShot({ type: 'skeet', f: turtle }, 'BUZZSAW!', 'buzzsaw');
  assert.equal(session.state.lastCatch.method, 'buzzsaw');
  assert.equal(session.state.lastCatch.shot, false);
  assert.equal(session.progress.ach.skeet, undefined);
  assert.deepEqual(systems.hud.catchCircumstances(session.state.lastCatch).map(i => i.id), ['buzzsaw']);
  const prey = { kind: 'rabbit' };
  systems.combat.takeShot({ type: 'prey', p: prey, m: prey }, 'SHOT!');
  assert.deepEqual(systems.hud.catchCircumstances(session.state.lastCatch).map(i => i.id), ['gun']);
});

test('catch circumstance icons distinguish companions, crossfire, water, and theft', () => {
  const { systems } = fixture();
  const ids = c => systems.hud.catchCircumstances(c).map(i => i.id);
  assert.deepEqual(ids({ eyas: true, shot: true }), ['gun', 'eyas']);
  assert.deepEqual(ids({ crossfire: true, by: 'hunter' }), ['hunter']);
  assert.deepEqual(ids({ crossfire: true, by: 'cat' }), ['cat']);
  assert.deepEqual(ids({ drowned: true, water: true }), ['water']);
  assert.deepEqual(ids({ turtleHit: true, stolenBy: 'buzzard' }), ['turtle', 'buzzard']);
  assert.deepEqual(ids({ method: 'parry' }), ['parry']);
  assert.deepEqual(ids({ targetKind: 'moon' }), ['moon']);
});

test('hunters can shoot buzzards crossing their line and record the killer', () => {
  const { session, systems } = fixture();
  Object.assign(session.bird, { x: 1000, alt: 300, vx: 0, vy: 0 });
  const buzzard = { x: 50, alt: 20, prevX: 50, prevAlt: 0, gone: false };
  session.state.rivals.push(buzzard);
  const hunter = { x: 0, ax: 100, aalt: 20, aim: 0.05, reload: 0, flash: 0, tracer: 0 };
  systems.hazards.updateHunter(hunter, 0.1);
  assert.equal(buzzard.gone, true);
  assert.equal(session.state.lastCatch.targetKind, 'buzzard');
  assert.equal(session.state.lastCatch.by, 'hunter');
  assert.equal(session.progress.ach.xcat, undefined);
});

function stealRifle(game, ammo = 2) {
  const { session, systems } = game;
  systems.world.thermalCol = () => ({ on: false });
  systems.world.insideCloud = () => false;
  Object.assign(session.bird, { x: 0, alt: 220, vx: 0, vy: 0, carrying: { kind: 'gun', ammo } });
  const buzzard = { x: 1, alt: 220, cx: 1, calt: 220, vx: 0, vy: 0, ang: 0, mode: 'chase', t: 7, flapT: 0 };
  session.state.rivals = [buzzard];
  systems.hazards.updateRivals(0.01);
  return buzzard;
}

test('a rifle thief keeps the stolen ammo and telegraphs its first shot before earning a hidden achievement', () => {
  const game = fixture();
  const { session, systems, values } = game;
  const buzzard = stealRifle(game);
  assert.equal(session.bird.carrying, null);
  assert.deepEqual(buzzard.gun, { ammo: 2 });
  assert.equal(buzzard.mode, 'armed');
  assert.equal(session.progress.ach.armedBuzzard, undefined);
  assert.equal(systems.progression.visibleAchievements().find(a => a.id === 'armedBuzzard').desc, 'hidden achievement');
  Object.assign(buzzard, { x: -85, alt: 220 });
  for (let i = 0; i < 100 && !buzzard.aim; i++) systems.hazards.updateRivals(0.05);
  assert.equal(buzzard.aim, HUNTER_AIM_T);
  assert.equal(buzzard.gun.ammo, 2);
  assert.equal(session.state.over, false);
  session.bird.alt += 50;
  systems.hazards.updateRivals(HUNTER_AIM_T + 0.01);
  assert.equal(buzzard.gun.ammo, 1);
  assert.equal(session.state.over, false);
  assert.ok(buzzard.tracer > 0);
  assert.equal(session.progress.ach.armedBuzzard, session.state.day);
  assert.equal(JSON.parse(values.get(PROGRESS_KEY)).ach.armedBuzzard, session.state.day);
  assert.ok(systems.progression.visibleAchievements().some(a => a.id === 'armedBuzzard'));
  const money = session.progress.money;
  Object.assign(buzzard, { aim: 0.01, ax: 100, aalt: 220 });
  systems.hazards.updateRivals(0.02);
  assert.equal(buzzard.gun.ammo, 0);
  assert.equal(buzzard.mode, 'leave');
  assert.equal(session.progress.money, money);
  systems.hazards.updateRivals(1);
  assert.equal(buzzard.gun.ammo, 0);
});

test('empty rifles and stolen turtles do not arm buzzards', () => {
  for (const carrying of [{ kind: 'gun', ammo: 0 }, { kind: 'turtle' }]) {
    const game = fixture();
    const buzzard = stealRifle(game, 0);
    if (carrying.kind === 'turtle') {
      buzzard.gun = null;
      buzzard.mode = 'chase'; buzzard.t = 7;
      game.session.bird.carrying = carrying;
      game.systems.hazards.updateRivals(0.01);
    }
    assert.equal(buzzard.mode, 'leave');
    assert.equal(game.session.progress.ach.armedBuzzard, undefined);
  }
});

test('buzzard shots use their airborne origin, respect cover and range, and support parries and lucky saves', () => {
  for (const outcome of ['hit', 'water', 'cloud', 'range', 'parry', 'feather']) {
    const game = fixture();
    const { session, systems } = game;
    const buzzard = stealRifle(game, 1);
    Object.assign(buzzard, { x: -85, alt: 220, aim: 0.01, ax: 0, aalt: 220 });
    if (outcome === 'water') session.bird.inWater = {};
    if (outcome === 'cloud') systems.world.insideCloud = () => true;
    if (outcome === 'range') session.bird.x = HUNTER_RANGE + 100;
    if (outcome === 'parry') session.bird.bouncing = { spin: true };
    if (outcome === 'feather') session.state.feathers = 1;
    systems.hazards.updateRivals(0.02);
    assert.equal(buzzard.gun.ammo, 0);
    assert.equal(session.state.over, outcome === 'hit');
    if (outcome === 'hit') assert.equal(session.state.recap.reason, 'buzzard');
    if (outcome === 'parry') {
      assert.equal(session.state.lastCatch.method, 'parry');
      assert.equal(session.state.lastCatch.by, 'buzzard');
    }
    if (outcome === 'feather') assert.equal(session.state.feathers, 0);
  }
});

test('defeating a rifle thief drops its remaining ammo exactly once through gun and turtle strikes', () => {
  for (const method of ['gun', 'turtle']) {
    const game = fixture();
    const { session, systems } = game;
    const buzzard = stealRifle(game, 2);
    if (method === 'gun') systems.combat.takeShot({ type: 'buzzard', r: buzzard }, 'SHOT!');
    else {
      session.state.fallers = [{ x: buzzard.x, alt: buzzard.alt, vx: 0, vy: 0, spin: 0 }];
      systems.combat.updateFallers(0.01);
    }
    assert.equal(buzzard.gone, true);
    assert.equal(session.state.guns.length, 1);
    assert.equal(session.state.guns[0].ammo, 2);
    assert.ok(session.state.guns[0].alt > 200);
    systems.prey.removeHazard('buzzard', buzzard);
    assert.equal(session.state.guns.length, 1);
  }
});

test('buzzard crossfire credits the buzzard rather than granting hunter-only achievements', () => {
  const game = fixture();
  const { session, systems } = game;
  const buzzard = stealRifle(game, 1);
  Object.assign(buzzard, { x: -85, alt: 220, aim: 0.01, ax: 0, aalt: 220 });
  session.state.hazards.hawk = { x: -40, alt: 220, gone: false };
  systems.hazards.updateRivals(0.02);
  assert.equal(session.state.over, false);
  assert.equal(session.state.lastCatch.targetKind, 'hawk');
  assert.equal(session.state.lastCatch.by, 'buzzard');
  assert.equal(session.progress.ach.xhawk, undefined);
  assert.deepEqual(systems.hud.catchCircumstances(session.state.lastCatch).map(i => i.label), ['Shot by buzzard']);
});

test('armed eyases can interrupt a rifle thief and recover the weapon', () => {
  const game = fixture();
  const { session, systems } = game;
  const buzzard = stealRifle(game, 2);
  session.progress.up.eyas = 1;
  session.progress.up.eyasgun = 1;
  systems.companions.spawnEyases();
  Object.assign(buzzard, { x: 25, alt: 220, aim: HUNTER_AIM_T });
  systems.companions.updateEyases(0.01);
  assert.equal(buzzard.gone, true);
  assert.equal(session.state.lastCatch.targetKind, 'buzzard');
  assert.equal(session.state.lastCatch.eyas, true);
  assert.equal(session.state.guns[0].ammo, 2);
  assert.equal(session.progress.ach.armedBuzzard, undefined);
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

test('underwater camera zoom follows a gradual entry transition', () => {
  const { session, systems, viewport } = fixture();
  const lake = systems.world.lakeAt(2);
  const x = lake.x0 + 1;
  Object.assign(session.bird, { x, alt: -4, speed: 5, angle: -Math.PI / 2, inWater: lake, breath: 30 });
  Object.assign(session.cam, {
    x, alt: 120, surfaceAlt: 120, surfaceZoom: 2, zoom: 2, zoomY: 2, gz: 2,
    ox: 0, oa: 124, waterFrame: 0, diveFollow: false,
  });
  session.mouse.x = 640;
  session.mouse.y = 360;

  systems.flight.update(1 / 60);

  assert.equal(session.cam.waterFrame, 1 / 24);
  assert.ok(session.cam.alt > 100);
  const swimZoom = Math.min(viewport.H / 38, viewport.W / 44);
  assert.ok(Math.abs(session.cam.zoom - (2 + (swimZoom - 2) * session.cam.waterFrame)) < 0.001);

  systems.flight.update(1 / 60);

  assert.ok(session.cam.waterFrame < 0.1);
  assert.ok(Math.abs(session.cam.zoom - (2 + (swimZoom - 2) * session.cam.waterFrame)) < 0.001);
});

test('water framing holds at the surface and stays engaged through a shallow ascent', () => {
  const { session, systems } = fixture();
  session.worldSeed = 256;
  const lake = Array.from({ length: 30 }, (_, index) => systems.world.lakeAt(index)).find(candidate => candidate.vents);
  const x = lake.vents[0].x;
  Object.assign(session.cam, { x, alt: 20, surfaceAlt: 20 });
  Object.assign(session.mouse, { x: 640, y: 700 });
  const swimFrame = (alt, angle) => {
    Object.assign(session.bird, { x, inWater: lake, alt, angle, speed: 5 });
    systems.flight.update(1 / 60);
  };
  swimFrame(-1, -Math.PI / 2);
  assert.equal(session.cam.waterFrame, 0);
  assert.equal(session.cam.alt, 20);
  swimFrame(-4, -Math.PI / 2);
  assert.ok(session.cam.alt < 20);
  swimFrame(-1.5, Math.PI / 2);
  assert.equal(session.cam.diveFollow, true);
  swimFrame(-0.4, Math.PI / 2);
  assert.equal(session.cam.diveFollow, false);
  assert.ok(session.cam.waterFrame > 0);

  const beforeExit = { x: session.cam.x, alt: session.cam.alt, zoom: session.cam.zoom };
  swimFrame(0.05, 0);
  assert.equal(session.bird.inWater, null);
  assert.ok(Math.abs(session.cam.x - beforeExit.x) < 1);
  assert.ok(Math.abs(session.cam.alt - beforeExit.alt) < 1);
  assert.ok(Math.abs(session.cam.zoom - beforeExit.zoom) < 1);
  for (let frame = 0; frame < 30; frame++) systems.flight.update(1 / 60);
  assert.equal(session.cam.waterExit, null);
});