import { SHELL_CRACK_SPEED, CHAIN_TIME, CHAIN_STEP, CHAIN_MAX, BUZZARD_BOUNTY, HAZARD_BOUNTY, CROSSFIRE_BONUS, ACHIEVEMENTS, STATS, BOUNCES, CEILINGS, SPECIES, LUCKY } from '../config.js';
import { clamp } from '../core/math.js';

export function createSession({ session, viewport, systems }) {
  // ---------- State ----------

  function reset() {
    // New world layout each run, re-rolled until no thermal (and its buzzard) sits right at the start
    for (let tries = 0; tries < 30; tries++) {
      session.worldSeed = Math.random() * 1000;
      if (![-1, 0, 1].some(i => { const th = systems.world.thermalCol(i); return th.on && Math.abs(th.x) < 350; })) break;
    }
    session.bird = { x: 0, alt: 220, speed: 20, angle: 0, flapT: 0, mode: 'GLIDE', passMin: Infinity, carrying: null,
             brakeE: 1, brakeLocked: false };
    session.prey = [];
    session.particles = [];
    session.cam = { x: 0, alt: 220, zoom: 2.5, zoomY: 2.5, gz: NaN, ox: NaN, oa: NaN, focus: 0, ft: null, shake: 0, lock: null, pin: null };
    session.state = { score: 0, catches: 0, over: false, msg: '', msgT: 0, msgTags: '', maxSpeed: 0, spawn: systems.prey.newSpawnWindow(0),
              hearingRadius: 8, crash: null,
              catchLog: [], time: 0, wake: [], wakeT: 0, fallers: [], rings: [], guns: [], tracers: [], rockets: [], blasts: [], fish: [],
              wind: { x: (Math.random() * 2 - 1) * 6, target: 0, changeT: 0, hx: (Math.random() * 2 - 1) * 10, htarget: 0, hchangeT: 0 },
              cloudOff: 0, cirrusOff: 0, fog: 0,
              tod: systems.progression.todForHour(STATS.startHour[systems.progression.tier('early')]), storm: { t: 0, dur: 1, next: 90 + Math.random() * 90, dir: 1, k: 0, flash: 0 },
              devils: [], devilT: 15, rivals: [], rivalSeen: {}, hazards: systems.hazards.newHazards(), lastCatch: null,
              day: session.progress.day, dayCounts: {}, chainN: 0, chainT: -Infinity, bestChain: 1, steals: [],
              duskWarned: false, sunset: false, overT: 0, recap: null, eyases: [], featherFx: [], feathers: 0, bounces: 0, eyasHunt: true, achToday: [], toastQ: [], moonshot: null, bestLaunch: 0, satellite: null,
              grotto: null, grottoCleared: {}, inks: [] };
    systems.prey.spawnPreyAhead();
  }

  // ---------- Day flow ----------
  // 'hunt' → (sunset or crash) → 'recap' → 'shop' → next day's 'hunt'
  session.screen = 'hunt';
  session.uiButtons = [];
  session.uiT = 0;
  session.shopScroll = 0;
  session.confirmReset = false;
  session.achView = false;
  const huntHour = () => session.state.tod * 24 + 1.2;

  function endDay(reason) {
    if (session.state.over) return;
    session.state.over = true;
    session.state.overT = 0;
    session.mouse.down = false; session.mouse.aiming = false; session.mouse.throwHeld = false; session.mouse.talonTarget = null;
    const earned = Math.max(0, session.state.score);
    const records = [];
    if (earned > session.progress.best.earned) {
      if (session.progress.best.earned > 0) records.push(`Best day ever: $${earned}`);
      session.progress.best.earned = earned;
    }
    const topSpeed = Math.round(session.state.maxSpeed * 3.6);
    if (topSpeed > session.progress.best.speed) {
      if (session.progress.best.speed > 0) records.push(`Top speed record: ${topSpeed} km/h`);
      session.progress.best.speed = topSpeed;
    }
    session.state.recap = { day: session.state.day, reason, clock: systems.world.clockText(), earned, walletBefore: session.progress.money,
                    catches: session.state.catchLog.slice(), steals: session.state.steals.slice(), topSpeed, bestChain: session.state.bestChain, records };
    for (const id of session.state.achToday) {
      const a = ACHIEVEMENTS.find(x => x.id === id);
      records.push(`Achievement: ${a.name} — ${a.desc}  (+$${a.reward})`);
    }
    session.progress.money += earned;
    session.progress.day = session.state.day + 1;
    systems.progression.saveProgress();
  }
  function showRecap() {
    if (!session.state.recap) return;
    session.screen = 'recap'; session.uiT = 0; session.paused = false;
  }
  function showShop() {
    session.screen = 'shop'; session.uiT = 0; session.shopScroll = 0; session.confirmReset = false; session.achView = false;
  }
  function startDay() {
    session.MAX_ALT = CEILINGS[systems.progression.tier('ceiling')];
    reset();
    // Starting rifle in the talons; Packed Lunch's turtle only when there's no rifle to carry
    // Head Start: a loaded rifle (tier 2) or a turtle (tier 1) in the talons
    const armed = systems.progression.tier('shell') >= 2;
    if (armed) session.bird.carrying = { kind: 'gun', ammo: systems.combat.gunStat('ammo') };
    else if (systems.progression.tier('shell')) session.bird.carrying = { kind: 'turtle' };
    session.state.feathers = LUCKY[systems.progression.tier('lucky')];
    session.state.bounces = BOUNCES[systems.progression.tier('bounce')];
    systems.companions.spawnEyases();
    session.screen = 'hunt'; session.paused = false;
    session.mouse.down = false;
    viewport.canvas.style.cursor = 'crosshair';
  }
  function resetProgress() {
    session.progress = systems.progression.freshProgress();
    systems.progression.saveProgress();
    session.confirmReset = false;
  }

  function uiHit(x, y) {
    return session.uiButtons.find(b => b.enabled !== false && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  }
  function clickUI(x, y) {
    const b = uiHit(x, y);
    if (b) b.onClick();
  }

  // ---------- Scoring ----------
  // $ = (bounty × repeat fatigue × (1 + bonuses) + first-of-species) × chain. dry = preview only (no side effects)
  function priceCatch(kind, o = {}, dry = false) {
    const n = session.state.dayCounts[kind] || 0;
    const tags = [];
    let base = kind === 'buzzard' ? BUZZARD_BOUNTY : HAZARD_BOUNTY[kind] ?? SPECIES[kind].bounty;
    if (o.turtleHit && SPECIES[kind]) { base *= 3; tags.push('Turtle ×3'); }
    const fatigue = Math.max(0.4, 0.8 ** n);
    if (fatigue < 1) tags.push(`Repeat ×${fatigue.toFixed(2)}`);
    let bonus = 0;
    if (o.speed != null) {
      const kmh = o.speed * 3.6;
      const sp = kmh >= 300 ? ['Stoop', 1] : kmh >= 220 ? ['Blistering', 0.5] : kmh >= 150 ? ['Fast', 0.25] : null;
      if (sp) { bonus += sp[1]; tags.push(`${sp[0]} +${sp[1] * 100}%`); }
    }
    if (o.minAlt != null) {
      // Skim: pull out within the lowest 30% of the species' base catch height
      const skim = 0.5 * clamp(1 - o.minAlt / (0.3 * o.catchAlt), 0, 1);
      if (skim >= 0.05) { bonus += skim; tags.push(`Skim +${Math.round(skim * 100)}%`); }
    }
    if (o.unseen) { bonus += 0.5; tags.push('Unseen +50%'); }
    if (o.skeet) { bonus += 1; tags.push('Skeet +100%'); }
    if (o.crossfire) { bonus += CROSSFIRE_BONUS; tags.push(`Crossfire +${CROSSFIRE_BONUS * 100}%`); }
    if (o.below) { bonus += 1; tags.push('From below +100%'); }
    if (o.impact != null) {
      const imp = Math.max(0, Math.floor((o.impact - SHELL_CRACK_SPEED) * 3.6 / 10)) * 0.05;
      if (imp > 0) { bonus += imp; tags.push(`Impact +${Math.round(imp * 100)}%`); }
    }
    const fresh = n === 0 ? 10 : 0;
    if (fresh) tags.push('Fresh +$10');
    const chainN = session.state.time - session.state.chainT <= CHAIN_TIME ? session.state.chainN + 1 : 0;
    const chain = Math.min(CHAIN_MAX, 1 + CHAIN_STEP * chainN);
    if (chain > 1) tags.push(`Chain ×${chain.toFixed(1)}`);
    if (o.share) tags.push(`Eyas share ×${o.share}`);
    if (!dry) {
      session.state.dayCounts[kind] = n + 1;
      session.state.chainN = chainN; session.state.chainT = session.state.time;
      session.state.bestChain = Math.max(session.state.bestChain, chain);
    }
    return { value: Math.round((base * fatigue * (1 + bonus) + fresh) * chain * (o.share ?? 1)), tags };
  }
  const chainMult = () => session.state.time - session.state.chainT <= CHAIN_TIME ? Math.min(CHAIN_MAX, 1 + CHAIN_STEP * session.state.chainN) : 1;
  function breakChain() { session.state.chainN = 0; session.state.chainT = -Infinity; }
  return { breakChain, chainMult, clickUI, endDay, huntHour, priceCatch, reset, resetProgress, showRecap, showShop, startDay, uiHit };
}
