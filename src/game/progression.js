import { G, DRAG, SHADOW_SPOOK_RANGE, GROUND_FRAME, GROUND_SHOW_ALT, GROUND_SHOW_FADE, HIGH_CAM, UPGRADE_COSTS, STATS, AIM_LEVELS, AIM_STATS, CATSENSE, SWIM, EYAS_GUN, GUN_LEVELS, GUN_STATS, BOUNCES, CEILINGS, PROGRESS_KEY, SPRITE_REF_ZOOM, SPRITE_MIN, AIR_REACH_MAX, EYAS, LUCKY } from '../config.js';
import { lerp, clamp } from '../core/math.js';

export function createProgression({ session, viewport, systems, storage }) {
  session.MAX_ALT = 500;
  const shadowWorldX = () => session.bird.x + systems.world.shadowOffset(session.bird.alt);
  const shadowMaxReach = p => p.kind === 'squirrel' ? SHADOW_SPOOK_RANGE * 1.35 : p.kind === 'mouse' ? SHADOW_SPOOK_RANGE * 1.1 : SHADOW_SPOOK_RANGE;
  const shadowInFront = p => {
    const dx = shadowWorldX() - p.x;
    return (dx * (systems.prey.facing(p) || 1) > 0 && Math.abs(dx) < SHADOW_SPOOK_RANGE);
  };
  const groundShowK = () => clamp((GROUND_SHOW_ALT + GROUND_SHOW_FADE - session.bird.alt) / GROUND_SHOW_FADE, 0, 1);
  const highCamK = () => clamp((session.bird.alt - HIGH_CAM.from) / (HIGH_CAM.to - HIGH_CAM.from), 0, 1);
  const groundFit = () => (viewport.H * (1 - GROUND_FRAME.top) - groundPx()) / Math.max(1, session.bird.alt);
  function groundFitZoom(z, showK = 0) {
    const fit = groundFit();
    return lerp(Math.max(Math.min(z, fit), z * GROUND_FRAME.zoomOut), Math.min(z, fit), showK);
  }
  const groundPx = () => Math.max(90, viewport.H * 0.15);

  // ---------- Progression ----------
  // A day runs from the Early Riser start hour to 20:00; clockText() maps tod -> hour as tod * 24 + 1.2
  const todForHour = h => (h - 1.2) / 24;
  const fmtHour = h => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
  const topKmh = (t = tier('stream')) => Math.round(Math.sqrt(G / (DRAG / STATS.stream[t] ** 2 * 0.8)) * 3.6);
  const UPGRADES = [
    { id: 'muscles', name: 'Flight Muscles', desc: 'Faster acceleration and flapping speed',
      stat: t => `${STATS.thrust[t]} m/s² · ${STATS.flapMax[t]} km/h` },
    { id: 'stream', name: 'Streamlining', desc: 'Less drag: higher top dive speed', stat: t => `top ${topKmh(t)} km/h` },
    { id: 'ceiling', name: 'Thermal Riding', desc: 'Ride the thermals higher: a taller sky for longer, faster dives', costs: [80, 200, 400],
      stat: t => `ceiling ${CEILINGS[t]} m` },
    { id: 'agility', name: 'Agility', desc: 'Turn faster at every speed', stat: t => `turning ×${STATS.agility[t]}` },
    { id: 'focus', name: 'Focus', desc: 'Bigger brake / slow-mo meter, faster refill',
      stat: t => `${STATS.brakeDur[t]} s · refill ${STATS.brakeRef[t]} s` },
    { id: 'silent', name: 'Silent Feathers', desc: 'Make less noise flapping, braking, diving', stat: t => `noise ×${STATS.noise[t]}` },
    { id: 'stealth', name: 'Stealth', desc: 'Prey and buzzards spot you later; less gets stolen',
      stat: t => `sight ×${STATS.sight[t]} · shadow <${STATS.shadowAlt[t]} m · steal ${STATS.steal[t]} s` },
    { id: 'catsense', name: 'Cat Sense', desc: 'Spot cats hiding in the grass, and get warned before one pounces', costs: [70, 180],
      stat: t => t ? `marks hidden cats within ${CATSENSE.range[t]} m${t > 1 ? ' · shows leap reach' : ' · pounce warning'}` : 'cats stay hidden' },
    { id: 'talons', name: 'Talons', desc: 'Bigger catch window; longer turtle re-grab',
      stat: t => `ground ×${STATS.catchAlt[t]} · air reach ×${STATS.airReach[t]}` },
    { id: 'aim', name: 'Turtle Aim', desc: 'Stronger throws, then turtles that home and ricochet', costs: [60, 160, 350], stat: t => AIM_LEVELS[t] },
    { id: 'early', name: 'Early Riser', desc: 'Start hunting earlier in the day', costs: [75, 180, 350],
      stat: t => `start ${fmtHour(STATS.startHour[t])}` },
    // Second tier only opens once you've found a hunter's rifle (cap)
    { id: 'shell', name: 'Head Start', desc: 'Start each day with a turtle, then with a loaded rifle (opens lake grottos)', costs: [60, 200],
      cap: () => session.progress.gunFound ? 2 : 1, capHint: 'Find a hunter\'s rifle to unlock',
      stat: t => ['start empty-handed', 'start carrying a turtle', 'start carrying a loaded rifle'][t] },
    { id: 'swim', name: 'Swimming', desc: 'Hold your breath longer and swim faster underwater', costs: [50, 130, 260],
      locked: () => !session.progress.swum, stat: t => `${SWIM.breath[t]} s breath · ${SWIM.speed[t]} m/s` },
    { id: 'rifle', name: 'Rifle', desc: 'More shots, free aim, auto-fire, then a homing bazooka',
      costs: [40, 90, 160, 280, 450], locked: () => !session.progress.gunFound,
      stat: t => `${GUN_LEVELS[t]} · ${GUN_STATS.ammo[t]} ${t >= 5 ? 'rockets' : 'shots'}` },
    { id: 'eyas', name: 'Eyas Brood', desc: 'Young hawks hunt nearby prey for a 50% share · E: call them off / send them out', costs: [120, 260, 480],
      stat: t => t ? `${EYAS.count[t]} eyas${t > 1 ? 'es' : ''} · ${Math.round(EYAS.speed[t] * 3.6)} km/h · ${EYAS.range[t]} m` : 'hunting alone' },
    { id: 'eyasgun', name: 'Armed Eyases', desc: 'Your eyases carry rifles: they shoot prey, and hunters aiming at you', costs: [180, 380],
      locked: () => !session.progress.gunFound || !tier('eyas'),
      stat: t => t ? `${EYAS_GUN.ammo[t]} shots each · ${EYAS_GUN.range[t]} m` : 'unarmed' },
    { id: 'lucky', name: 'Lucky Feather', desc: 'Survive a fatal attack (cat, hunter, goshawk, octopus) each day', costs: [150, 400],
      stat: t => `${LUCKY[t]} save${LUCKY[t] === 1 ? '' : 's'} per day` },
    { id: 'bounce', name: 'Springy Legs', desc: 'Crash into the ground and you spring back up — the faster you hit, the higher you fly',
      costs: [100, 260, 500, 1200],
      stat: t => [
        'crashes end the day',
        `${BOUNCES[1]} bounces per day`,
        `${BOUNCES[2]} bounces · buzzsaw spin (brake to stop)`,
        'unlimited bounces · buzzsaw spin',
        'moon springs: every bounce in a spin chain hits harder',
      ][t] },
  ];
  const shopUpgrades = () => UPGRADES.filter(u => !u.locked || !u.locked());
  const upgradeCosts = u => u.costs || UPGRADE_COSTS;
  // Highest tier you can currently buy (some upgrades open later tiers once something is found)
  const upgradeCap = u => u.cap ? u.cap() : upgradeCosts(u).length;
  const bounceSpin = () => tier('bounce') >= 2;
  const moonSprings = () => tier('bounce') >= 4;
  const freshProgress = () => ({ day: 1, money: 0, up: {}, best: { earned: 0, speed: 0 }, ach: {}, caught: {} });
  session.progress = freshProgress();
  function loadProgress() {
    try {
      const saved = storage.read(PROGRESS_KEY);
      if (saved && typeof saved === 'object') {
        session.progress = { ...freshProgress(), ...saved, up: { ...(saved.up || {}) }, best: { ...freshProgress().best, ...(saved.best || {}) },
                     ach: { ...(saved.ach || {}) }, caught: { ...(saved.caught || {}) } };
        // Camouflage + Buzzard Wariness merged into Stealth: keep the higher tier
        const up = session.progress.up;
        if (up.camo || up.wary) {
          up.stealth = Math.max(up.stealth || 0, up.camo || 0, up.wary || 0);
          delete up.camo; delete up.wary;
        }
        // The starting rifle moved from Rifle tier 3 to Head Start tier 2
        if ((up.rifle || 0) >= 3 && (up.shell || 0) < 2) up.shell = 2;
        // Screech became the eyas call (E): refund what was spent on it
        if (up.screech) {
          session.progress.money += [0, 90, 310][up.screech] || 0;
          delete up.screech;
        }
      }
      // Achievements used to live in their own key (no rewards then): carry them over as already earned
      const legacy = storage.read('falconDive.achievements');
      if (legacy) for (const id of Array.isArray(legacy) ? legacy : Object.keys(legacy)) session.progress.ach[id] = session.progress.ach[id] || -1;
    } catch { /* storage unavailable or corrupt */ }
  }
  function saveProgress() {
    storage.write(PROGRESS_KEY, session.progress);
  }
  const tier = id => session.progress.up[id] || 0;
  function buyUpgrade(id) {
    const u = UPGRADES.find(x => x.id === id);
    if (!u || (u.locked && u.locked())) return false;
    const t = tier(id), costs = upgradeCosts(u);
    if (t >= upgradeCap(u) || session.progress.money < costs[t]) return false;
    session.progress.money -= costs[t];
    session.progress.up[id] = t + 1;
    saveProgress();
    return true;
  }

  // Upgrade-driven flight and stealth stats
  const dragBase = () => DRAG / STATS.stream[tier('stream')] ** 2;
  const flapThrust = () => STATS.thrust[tier('muscles')];
  const flapMaxSpeed = () => STATS.flapMax[tier('muscles')] / 3.6;
  const brakeDuration = () => STATS.brakeDur[tier('focus')];
  const brakeRecharge = () => STATS.brakeRef[tier('focus')];
  const shadowDetectAlt = () => STATS.shadowAlt[tier('stealth')];
  const spriteK = () => clamp(session.cam.zoom / SPRITE_REF_ZOOM, SPRITE_MIN, 1);
  const airCatchRadius = () => clamp(22 / session.cam.zoom, 3, AIR_REACH_MAX) * STATS.airReach[tier('talons')];
  const talonGrabRange = () => airCatchRadius() * 0.5;
  const stealWindow = () => STATS.steal[tier('stealth')];
  const aimTier = () => tier('aim');
  const throwPush = () => AIM_STATS.push[aimTier()];
  const turtleHoming = () => AIM_STATS.homing[aimTier()];
  const lockScale = () => AIM_STATS.lock[aimTier()];
  const swimBreath = () => SWIM.breath[tier('swim')];
  const swimSpeed = () => SWIM.speed[tier('swim')];
  const swimPaddle = () => SWIM.paddle[tier('swim')];
  return { aimTier, airCatchRadius, bounceSpin, brakeDuration, brakeRecharge, buyUpgrade, dragBase, flapMaxSpeed, flapThrust, freshProgress, groundFit, groundFitZoom, groundPx, groundShowK, highCamK, loadProgress, lockScale, moonSprings, saveProgress, shadowDetectAlt, shadowInFront, shadowMaxReach, shadowWorldX, shopUpgrades, spriteK, stealWindow, swimBreath, swimPaddle, swimSpeed, talonGrabRange, throwPush, tier, todForHour, topKmh, turtleHoming, upgradeCap, upgradeCosts };
}
