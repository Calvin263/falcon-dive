import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game.js';
import { createStorage } from '../src/core/storage.js';
import { SKY } from '../src/config.js';

function fixture() {
  const values = new Map();
  const storage = createStorage(() => ({
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }));
  const viewport = { W: 1280, H: 720, resolutionScale: 0.75, canvas: { style: {} }, setResolutionScale() {} };
  const game = createGame(viewport, { storage });
  game.initialize();
  game.session.bird.vx = 0;
  game.session.bird.vy = 0;
  return game;
}

function encounter(game) {
  const lake = { x0: 0, w: 200, depth: 12 };
  game.session.state.fish = Array.from({ length: 4 }, () => game.systems.water.makeFish(lake, 'trout'));
  assert.equal(game.systems.sky.spawnFishnado(lake), true);
  return game.session.state.sky.fishnado;
}

test('charged turtle fuse survives drops, re-grabs and ordinary landing', () => {
  const { session, systems } = fixture();
  session.bird.carrying = { kind: 'turtle' };
  assert.equal(systems.sky.charge(session.bird.carrying), true);
  assert.equal(session.bird.carrying.chargeUntil, SKY.chargeFuse);
  systems.prey.dropTurtle();
  const falling = session.state.fallers[0];
  assert.equal(falling.chargeUntil, SKY.chargeFuse);
  systems.prey.grabFallingTurtle(falling);
  assert.equal(session.bird.carrying.chargeUntil, SKY.chargeFuse);
  systems.prey.dropTurtle();
  const landed = session.state.fallers.at(-1);
  landed.alt = 0.1; landed.vx = 0; landed.vy = -1;
  const x = Array.from({ length: 20 }, (_, i) => i * 1000).find(px => !systems.world.lakeAtX(px));
  landed.x = x;
  systems.combat.updateFallers(0.1);
  assert.equal(session.prey.find(p => p.kind === 'turtle' && Math.abs(p.x - x) < 1)?.chargeUntil, SKY.chargeFuse);
});

test('charged turtle expires only at its deadline and uses Lucky Feather', () => {
  const { session, systems } = fixture();
  session.bird.carrying = { kind: 'turtle' };
  session.state.feathers = 1;
  systems.sky.charge(session.bird.carrying);
  session.state.time = SKY.chargeFuse - 0.01;
  systems.sky.update(0);
  assert.equal(session.state.feathers, 1);
  session.state.time = SKY.chargeFuse;
  systems.sky.update(0);
  assert.equal(session.state.feathers, 0);
  assert.equal(session.state.over, false);
  assert.equal(session.bird.carrying.chargeUntil, undefined);
  session.bird.invulnT = 0;
  systems.sky.charge(session.bird.carrying);
  session.state.time += SKY.chargeFuse;
  systems.sky.update(0);
  assert.equal(session.state.recap.reason, 'lightning');
});

test('storm strike telegraphs, charges once, and water grounds a turtle', () => {
  const { session, systems } = fixture();
  session.bird.carrying = { kind: 'turtle' };
  session.state.storm.k = 1;
  session.state.sky.strikeT = 0;
  systems.sky.update(0.01);
  assert.ok(session.state.sky.strike);
  assert.equal(session.bird.carrying.chargeUntil, undefined);
  systems.sky.update(SKY.strikeWindup);
  assert.equal(session.bird.carrying.chargeUntil, SKY.chargeFuse);
  assert.equal(systems.sky.charge(session.bird.carrying), false);
  session.bird.inWater = { x0: 0, w: 200, depth: 12 };
  systems.sky.update(0);
  assert.equal(session.bird.carrying.chargeUntil, undefined);
});

test('Fishnado consumes real lake fish, forms below the starting ceiling and pays once', () => {
  const game = fixture(), { session, systems } = game;
  assert.equal(systems.sky.spawnFishnado({ x0: 0, w: 100, depth: 10 }), false);
  const f = encounter(game);
  assert.equal(session.state.fish.length, 0);
  assert.equal(f.fish.length, 4);
  assert.equal(f.alt, 350);
  assert.ok(f.alt + 32 < session.MAX_ALT);
  systems.sky.update(4);
  assert.equal(f.mode, 'recovery');
  for (let i = 0; i < SKY.fishnadoHp; i++) systems.sky.hitPart(f, 'gun');
  const score = session.state.score;
  assert.ok(f.gone && score > 0);
  assert.equal(session.state.fish.length, 4);
  systems.sky.hitPart(f, 'gun');
  assert.equal(session.state.score, score);
  assert.equal(systems.sky.spawnFishnado(f.lake), false);
});

test('Fishnado locks attack aim, fires bounded fish, and charged hit interrupts it', () => {
  const game = fixture(), { session, systems } = game;
  const f = encounter(game);
  systems.sky.update(4);
  session.bird.x = 200; session.bird.alt = f.alt;
  systems.sky.update(3);
  assert.equal(f.mode, 'wind');
  const aim = f.aim;
  session.bird.alt += 100;
  assert.equal(f.aim, aim);
  systems.sky.update(1.5);
  assert.equal(f.shots.length, 1);
  assert.ok(f.shots.length <= f.fish.length);
  f.mode = 'wind'; f.t = 1;
  const shell = { x: f.x, alt: f.alt, vx: 0, vy: 0, chargeUntil: 5, bounces: 0 };
  assert.equal(systems.sky.shellHit(shell, 0), true);
  assert.equal(f.mode, 'stunned');
  assert.equal(f.hp, SKY.fishnadoHp - 2);
  assert.equal(shell.chargeUntil, undefined);
});

test('pirates require the ceiling upgrade and balloons lower the ship', () => {
  const { session, systems } = fixture();
  assert.equal(systems.sky.spawnPirates(100), false);
  session.MAX_ALT = 650;
  assert.equal(systems.sky.spawnPirates(100), true);
  const p = session.state.sky.pirates, alt = p.alt;
  assert.ok(p.alt + 31 < session.MAX_ALT);
  systems.sky.hitPart(p.balloons[0], 'gun', SKY.balloonHp);
  assert.equal(p.balloons[0].gone, true);
  systems.sky.update(1);
  assert.ok(p.alt < alt);
  assert.equal(p.crew.length, 2);
  for (let i = 0; i < SKY.pirateHp; i++) systems.sky.hitPart(p, 'gun');
  const score = session.state.score;
  assert.ok(p.gone && score > 0);
  assert.equal(session.state.guns.length, 2);
  systems.sky.hitPart(p, 'gun');
  assert.equal(session.state.score, score);
  assert.equal(session.state.guns.length, 2);
});

test('retreat retires each encounter without paying or respawning', () => {
  const game = fixture(), { session, systems } = game;
  const f = encounter(game);
  session.MAX_ALT = 650;
  systems.sky.spawnPirates(100);
  const p = session.state.sky.pirates;
  session.bird.x = SKY.retention + 500;
  systems.sky.update(0.01);
  assert.ok(f.gone && p.gone);
  assert.equal(session.state.score, 0);
  assert.equal(systems.sky.spawnPirates(0), false);
  assert.equal(systems.sky.spawnFishnado(f.lake), false);
});

test('pause freezes the charged turtle deadline and normal flight advances it', () => {
  const { session, systems } = fixture();
  session.bird.carrying = { kind: 'turtle' };
  systems.sky.charge(session.bird.carrying);
  session.paused = true;
  systems.flight.update(1);
  assert.equal(session.state.time, 0);
  assert.equal(session.bird.carrying.chargeUntil, SKY.chargeFuse);
  session.paused = false;
  systems.flight.update(0.1);
  assert.equal(session.state.time, 0.1);
  assert.equal(session.bird.carrying.chargeUntil, SKY.chargeFuse);
});

test('buzzard theft and dropping a stolen charged turtle preserve its original deadline', () => {
  const { session, systems } = fixture();
  const r = { x: session.bird.x, alt: session.bird.alt, vx: 0, vy: 0, mode: 'chase', t: 1, flapT: 0, alertT: 0 };
  session.state.rivals.push(r);
  session.bird.carrying = { kind: 'turtle' };
  systems.sky.charge(session.bird.carrying);
  systems.hazards.updateRivals(0.01);
  assert.equal(session.bird.carrying, null);
  assert.equal(r.turtle.chargeUntil, SKY.chargeFuse);
  systems.prey.removeHazard('buzzard', r);
  assert.equal(session.state.fallers.at(-1).chargeUntil, SKY.chargeFuse);
});

test('a fast Fishnado projectile hits across the full relative path', () => {
  const game = fixture(), { session, systems } = game;
  const f = encounter(game);
  systems.sky.update(4);
  f.mode = 'recovery'; f.t = 10;
  session.bird.x = 150; session.bird.alt = f.alt;
  f.shots.push({ kind: 'fishShot', fish: f.fish[0], x: 100, alt: f.alt, vx: 100, vy: 0, t: 3, gone: false });
  systems.sky.update(1);
  assert.equal(session.state.recap.reason, 'fishnado');
});

test('normal storm and ceiling conditions can spawn both encounters', () => {
  const game = fixture(), { session, systems } = game;
  const lake = { x0: 0, w: 200, depth: 12 };
  session.state.fish = [systems.water.makeFish(lake, 'trout')];
  session.state.storm.k = 0.8;
  session.state.sky.pirateT = 0;
  session.state.sky.piratesEligible = true;
  session.bird.alt = 450;
  systems.sky.update(0.01);
  assert.ok(session.state.sky.fishnado);
  assert.equal(session.state.sky.pirates, null);
  session.MAX_ALT = 650;
  systems.sky.update(0.01);
  assert.ok(session.state.sky.pirates);
});

test('a rare early storm starts through the normal weather system when lake fish are nearby', () => {
  const { session, systems } = fixture();
  const lake = { x0: 0, w: 200, depth: 12 };
  session.state.fish = [systems.water.makeFish(lake, 'trout')];
  session.state.sky.earlyStorm = true;
  session.state.sky.earlyStormAt = 40;
  session.state.time = 40;
  session.state.storm.t = 0;
  session.state.storm.next = 100;
  systems.sky.update(0.01);
  assert.equal(session.state.storm.next, 0);
  systems.world.updateWeather(0.01);
  assert.ok(session.state.storm.t > 0);
  assert.equal(session.state.sky.earlyStorm, false);
  systems.world.updateWeather(session.state.storm.dur * 0.25);
  systems.sky.update(0.01);
  assert.ok(session.state.sky.fishnado);
});

test('sky gun and rocket damage honor target liveness and exposed phases', () => {
  const game = fixture(), { session, systems } = game;
  const f = encounter(game);
  systems.sky.update(4);
  assert.ok(systems.combat.gunTargets().some(([, , , hit]) => hit.part === f));
  systems.combat.takeShot({ type: 'sky', part: f }, 'BOOM!');
  assert.equal(f.hp, SKY.fishnadoHp - 3);
  f.mode = 'wind';
  assert.ok(!systems.combat.gunTargets().some(([, , , hit]) => hit.part === f));
  systems.combat.takeShot({ type: 'sky', part: f }, 'BANG!');
  assert.equal(f.hp, SKY.fishnadoHp - 3);
  session.MAX_ALT = 650;
  systems.sky.spawnPirates(100);
  const p = session.state.sky.pirates;
  p.crew[0].gun.ammo = 0;
  systems.prey.removeHazard('buzzard', p.crew[0]);
  assert.equal(session.state.guns.length, 0);
});

test('charged splash interrupts a shielded Fishnado once and local lift is bounded', () => {
  const game = fixture(), { session, systems } = game;
  const f = encounter(game);
  systems.sky.update(4);
  f.mode = 'wind'; f.t = 1;
  const shell = { chargeUntil: session.state.time + 1 };
  assert.equal(systems.sky.discharge(shell, f.x + 15, f.alt), true);
  assert.equal(f.mode, 'stunned');
  assert.equal(f.hp, SKY.fishnadoHp - 1);
  assert.equal(systems.sky.discharge(shell, f.x, f.alt), false);
  assert.equal(f.hp, SKY.fishnadoHp - 1);
  assert.equal(systems.sky.lift(f.x, f.alt), 6);
  assert.equal(systems.sky.lift(f.x + 100, f.alt), 0);
});

test('charged splash stuns a nearby armed buzzard without paying an extra bounty', () => {
  const { session, systems } = fixture();
  const rival = { x: 10, alt: 200, vx: 0, vy: 0, mode: 'armed', t: 1, flapT: 0,
    aim: 0.5, lock: 1, watch: 1, tracking: true, gun: { ammo: 2 } };
  session.state.rivals.push(rival);
  const turtle = { chargeUntil: 5 };
  systems.sky.discharge(turtle, 0, 200);
  assert.equal(rival.frozenT, 2);
  assert.equal(rival.aim, 0);
  assert.equal(session.state.score, 0);
  systems.hazards.updateRivals(0.1);
  assert.equal(rival.x, 10);
  assert.equal(rival.gun.ammo, 2);
});

test('talons can damage exposed bosses and sunset retires attacks and crew', () => {
  const game = fixture(), { session, systems } = game;
  const f = encounter(game);
  systems.sky.update(4);
  session.bird.x = f.x; session.bird.alt = f.alt;
  session.mouse.aiming = true;
  systems.sky.update(0.01);
  assert.equal(f.hp, SKY.fishnadoHp - 1);
  session.MAX_ALT = 650;
  systems.sky.spawnPirates(f.x);
  const p = session.state.sky.pirates;
  f.shots.push({ kind: 'fishShot', fish: f.fish[0], x: f.x, alt: f.alt, vx: 1, vy: 0, t: 1 });
  systems.session.endDay('sunset');
  assert.ok(f.gone && p.gone && p.crew.every(r => r.gone));
  assert.deepEqual(f.shots, []);
  assert.equal(session.state.fish.length, 4);
  assert.equal(session.state.score, 0);
});

test('both encounters can be defeated with repeated talon strikes', () => {
  const game = fixture(), { session, systems } = game;
  const f = encounter(game);
  systems.sky.update(4);
  session.mouse.aiming = true;
  for (let i = 0; i < SKY.fishnadoHp; i++) {
    session.bird.x = f.x; session.bird.alt = f.alt;
    f.mode = 'recovery'; f.t = 10;
    systems.sky.update(0.5);
  }
  assert.equal(f.gone, true);
  session.MAX_ALT = 650;
  systems.sky.spawnPirates(100);
  const p = session.state.sky.pirates;
  for (let i = 0; i < SKY.pirateHp; i++) {
    session.bird.x = p.x; session.bird.alt = p.alt;
    systems.sky.update(0.5);
  }
  assert.equal(p.gone, true);
  assert.equal(session.state.catchLog.filter(c => c.targetKind === 'fishnado').length, 1);
  assert.equal(session.state.catchLog.filter(c => c.targetKind === 'pirates').length, 1);
});
