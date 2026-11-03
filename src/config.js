
// ---------- Tunables ----------
export const G = 9.81;
export const DRAG = G / (95 * 95);   // base drag; terminal dive speed scales with the Streamlining upgrade
export const BRAKE_DRAG = DRAG * 10;
export const STALL_SPEED = 10;
export const DIVE_SPEED = 40;        // above this (and pointing down) = dive mode
export const SAFE_VSPEED = 14;       // max descent rate on ground contact (m/s)
export const CRASH_REVEAL_DELAY = 0.9;
export const BRAKE_UNLOCK = 0.3;     // after running dry, the meter must refill this far before braking again
export const SHELL_CRACK_SPEED = 65; // m/s impact needed to crack a dropped turtle (~215 m free fall from rest)
export const TURTLE_THROW = 10;      // m/s max extra push toward the cursor when releasing an aimed throw
export const THROW_LOCK_GROUND = 20; // m from the predicted landing spot to lock onto a ground animal
export const THROW_LOCK_AIR = 15;    // m from the predicted arc to lock onto a flying animal
export const TURTLE_HOMING = 5;      // m/s² of sideways correction toward a locked target while falling
export const SHADOW_VISIBLE_ALT = 125; // the bird casts a visibly noticeable shadow only below this height
export const SHADOW_SPOOK_RANGE = 100;
export const STARLING_COMBO_TIME = 2;    // seconds to grab more starlings after the first
export const VIEW_MARGIN = 70;       // px kept between the top of the screen and the bird
export const AIR_FOCUS_DIST = 70;    // metres; closer than this to a flying target and the camera frames the chase
// View height in metres = base + perSpeed·speed + perAlt·altitude, capped at max
export const CAMERA_VIEW = { base: 25, perSpeed: 1.5, perAlt: 0.45, max: 300 };
export const CHASE_ZOOM_MAX = 2.2;   // air-chase zoom never exceeds this × the normal zoom
// Soft ground framing: zoom out by up to (1 - zoomOut) to fit the ground with the bird `top` from the screen
// top, and pull the view toward the ground by `stick` (0 = pure bird-centred, 1 = ground always on the band);
// `fade` sets how far above the band (in band heights) the pull keeps working
export const GROUND_FRAME = { top: 0.2, stick: 0.6, zoomOut: 0.58, fade: 2.6 };
// Below GROUND_SHOW_ALT the ground is always in view (blending in over GROUND_SHOW_FADE m above it)
export const GROUND_SHOW_ALT = 150, GROUND_SHOW_FADE = 40;
// High up the ground isn't framed at all: between `from` and `to` m the ground framing fades out and the view
// tightens on the bird (`zoom` × the normal speed/altitude view)
export const HIGH_CAM = { from: 180, to: 240, zoom: 1.15 };
export const CEILING_MARGIN = 12;    // m of sky shown above the ceiling at most
export const CHASE_MIN_FLY = 0.8;    // s a bird must be airborne before the camera will frame a chase on it
export const TURN_TIME = 1.2;
export const HILL_SCROLL = 0.5;      // px the far hills scroll per metre flown, independent of zoom
export const LENS_R = 38;
export const ABOVE_CEILING_DRAG = 0.35; // thin air above the ceiling: no flapping, but less drag
export const PAUSE_BTN = { x: 10, y: 10, w: 44, h: 44 };
export const DUST_DEVILS_ENABLED = false;
export const DAY_END_HOUR = 20;
export const DUSK_WARN_HOUR = 19.5;
export const CHAIN_TIME = 20, CHAIN_STEP = 0.2, CHAIN_MAX = 2;
export const STARLING_EXTRA = 4;     // $ per extra starling grabbed in a combo
export const BUZZARD_BOUNTY = 80;
// Turtle-only targets: the predators that hunt you
export const HAZARD_BOUNTY = { cat: 200, hunter: 120, hawk: 150, octopus: 450, bullet: 60, satellite: 400 };
export const HAZARD_NAME = { cat: 'Cat', hunter: 'Hunter', hawk: 'Goshawk', octopus: 'Octopus', bullet: 'Bullet', moon: 'The Moon', satellite: 'Satellite' };
// Crossfire: a predator taken out by another predator (hunter shoots the goshawk or a cat, a cat pounces on the goshawk)
export const CROSSFIRE_BONUS = 1;   // +100%
// Achievements: one-off goals, paid once into that day's earnings
export const ACHIEVEMENTS = [
  { id: 'aeschylus', name: 'Aeschylus', desc: 'Hit prey with a falling turtle', reward: 25 },
  { id: 'shellshock', name: 'Shell Shock', desc: 'Take out a predator with a turtle', reward: 60 },
  { id: 'tables', name: 'Turn the Tables', desc: 'Take out a hunter', reward: 50 },
  { id: 'skeet', name: 'Pull!', desc: 'Shoot a turtle out of the air', reward: 50, hidden: true },
  { id: 'drownedTurtle', name: 'Sink or Shell', desc: 'Drop a turtle into a lake', reward: 75, hidden: true },
  { id: 'stoop', name: 'Terminal Velocity', desc: 'Catch prey at 300+ km/h', reward: 60 },
  { id: 'chain', name: 'Chain Reaction', desc: `Reach a ×${CHAIN_MAX.toFixed(1)} chain`, reward: 60 },
  { id: 'below', name: 'From the Deep', desc: 'Catch a duck from underwater', reward: 60 },
  { id: 'buzzsaw', name: 'Buzzsaw', desc: 'Take something out while spinning', reward: 50, hidden: true },
  { id: 'parry', name: 'Parry', desc: 'Deflect a hunter\'s bullet with the buzzsaw spin', reward: 120, hidden: true },
  { id: 'xhawk', name: 'Friendly Fire', desc: 'Lead the goshawk hunting you into a hunter\'s shot', reward: 150 },
  { id: 'xcat', name: 'Wrong Target', desc: 'Get a hunter to shoot a cat', reward: 120 },
  { id: 'cathawk', name: 'Cat Among the Hawks', desc: 'Lure the goshawk into a cat\'s pounce', reward: 150 },
  { id: 'kraken', name: 'Kraken Slayer', desc: 'Beat the octopus in its grotto', reward: 150, hidden: true },
  { id: 'bigday', name: 'Big Day', desc: 'Earn $500 in one day', reward: 100 },
  { id: 'naturalist', name: 'Naturalist', desc: 'Catch every species at least once', reward: 250 },
  { id: 'moon', name: 'Fly Me to the Moon', desc: 'Bounce fast enough to reach the moon', reward: 1000, hidden: true },
  { id: 'satellite', name: 'Space Junk', desc: 'Shoot down the satellite hidden above the ceiling', reward: 300, hidden: true },
];
export const UPGRADE_COSTS = [40, 100, 220, 450];
// Per-tier stat tables (index = tier)
export const STATS = {
  thrust:     [30, 40, 52, 66, 82],             // m/s² while flapping
  flapMax:    [180, 205, 232, 260, 290],        // km/h flapping speed cap
  stream:     [1, 1.15, 1.32, 1.52, 1.75],      // terminal dive speed multiplier
  agility:    [1, 1.2, 1.4, 1.6, 1.85],
  brakeDur:   [2.5, 3.4, 4.4, 5.5, 7.0],        // seconds of braking from a full meter
  brakeRef:   [5.0, 4.2, 3.5, 2.9, 2.4],        // seconds to refill from empty
  noise:      [1, 0.8, 0.62, 0.47, 0.35],
  // Stealth: prey sight, shadow, and how buzzards treat you
  sight:      [1, 0.85, 0.72, 0.6, 0.5],
  shadowAlt:  [75, 60, 48, 38, 30],             // prey only notice your shadow below this height
  steal:      [6, 4.5, 3.5, 2.5, 1.5],          // s a fresh catch can be stolen
  notice:     [150, 120, 95, 75, 55],           // m buzzards notice a prize from
  catchAlt:   [1, 1.25, 1.5, 1.75, 2],          // ground catch height multiplier
  airReach:   [1, 1.15, 1.3, 1.45, 1.6],        // air strike radius multiplier
  startHour:  [8, 7, 6.5, 6],
};
export const AIM_LEVELS = ['Drop only (no aim)', 'Aimed throw (18 m/s push)', 'Homing turtle (locks & homes)', 'Ricochet (bounces to 2 more targets)'];
export const AIM_STATS = { push: [0, 18, 18, 18], homing: [0, 0, 16, 22], lock: [0, 0, 1.6, 2], bounces: [0, 0, 0, 2] };
// Cat Sense: hidden cats within range are marked; tier 2 also shows how far they can leap
export const CATSENSE = { range: [0, 140, 300] };
// Swimming (unlocked once you've been in a lake): breath (s), swim speed (m/s), paddle acceleration (m/s²)
export const SWIM = { breath: [7, 10, 14, 20], speed: [7, 9, 11.5, 14], paddle: [14, 18, 24, 30] };
// Armed Eyases (after finding a rifle): shots each eyas starts the day with, and how far away it shoots from
export const EYAS_GUN = { ammo: [0, 4, 10], range: [0, 70, 110] };
export const RICOCHET_RANGE = 80;
// Hunter rifle per Rifle tier: shots per gun, range (m), hit width (m), radius that spooks animals (m)
export const GUN_LEVELS = ['Straight ahead', 'Double shot', 'Free aim', 'Six-shooter', 'Auto-fire (hold)', 'Bazooka (14 m blast)'];
export const GUN_STATS = { ammo: [1, 2, 2, 6, 30, 8], range: [220, 240, 280, 320, 320, 400], width: [2.5, 2.5, 3, 3, 2.5, 3], spook: [150, 150, 150, 120, 120, 200] };
export const GUN_HUNTER_HIT_RADIUS = 6;
// Springy Legs: bounces per day (tier 3 = unlimited). A bounce reflects you off the ground like a ball: you leave
// at the mirror of your impact angle, at BOUNCE_LIFT × your impact speed (so faster crashes fly higher; at least
// BOUNCE_MIN_UP m/s upward). For the first BOUNCE_LOCK s the arc is uncontrollable; over the next second you
// gradually regain steering (BOUNCE_STEER m/s² toward the cursor), and normal flight returns at the top of the arc.
// Tier 2+: you spin like a buzzsaw instead, taking out anything within SPIN_R m, until you brake
export const BOUNCES = [0, 3, 3, Infinity, Infinity], BOUNCE_LIFT = 0.85, BOUNCE_MIN_UP = 35, BOUNCE_LOCK = 1;
export const BOUNCE_STEER = 6, BOUNCE_DRAG = 0.05, SPIN_R = 5, SPIN_RATE = 18;
// The buzzsaw spin steers mostly by swinging its heading (SPIN_TURN rad/s) toward the cursor; the extra push
// (SPIN_STEER m/s²) stays below gravity so the spin can't climb forever
export const SPIN_STEER = 7, SPIN_TURN = 2.6;
// Moon Springs (Springy Legs tier 4): each bounce in an unbroken buzzsaw chain launches at
// min(MOON_LIFT_MAX, 1 + MOON_GAIN × bounces so far) × your impact speed instead of BOUNCE_LIFT. Leave the ground
// at ESCAPE_V m/s straight up and you break free for the moon (the end goal), a MOONSHOT_T s flight.
export const MOON_GAIN = 0.1, MOON_LIFT_MAX = 1.3, ESCAPE_V = 250, MOONSHOT_T = 7;
// A satellite hides SAT_ABOVE m over the flight ceiling, out of sight unless a bounce takes you up there.
// It drifts at SAT_SPEED and wraps to stay within SAT_WRAP m of you; shoot it, rocket it or buzzsaw it down
export const SAT_ABOVE = 170, SAT_SPEED = 12, SAT_WRAP = 700, SAT_R = 7;
// Thermal Riding: flight ceiling per tier (m)
export const CEILINGS = [500, 650, 800, 1000];

export const PROGRESS_KEY = 'falconDive.progress';
// Sprites shrink as the camera zooms out (down to SPRITE_MIN), so things that look close really are close
export const SPRITE_REF_ZOOM = 5, SPRITE_MIN = 0.4;
// Air strike reach: ~22 px on screen when zoomed in, but never more than AIR_REACH_MAX m however far the camera
// zooms out (so high-altitude strikes need the same precision); widened by Talons. Re-grabbing a falling turtle needs half that.
export const AIR_REACH_MAX = 4.5;

export const SETTINGS_KEY = 'falconDive.settings';
export const DEFAULT_ANIMAL_SIZES = {
  rabbit: 1.6,
  hare: 1.4,
  mouse: 2,
  squirrel: 1,
  turtle: 1.8,
  pigeon: 1.5,
  duck: 1.5,
  swift: 1,
  flock: 1.2,
};

// ---------- Prey species ----------
// scale: on-screen sprite size (deliberately larger than true scale so animals read clearly)
// bounty: base $ value, priced by how common and how hard each animal is
export const SPECIES = {
  rabbit:   { name: 'Rabbit',   air: false, bounty: 5,  weight: 40, catchAlt: 1.5, radius: 6, scale: 1.9 },
  hare:     { name: 'Hare',     air: false, bounty: 15, weight: 20, catchAlt: 1.5, radius: 6, scale: 2.3 },
  mouse:    { name: 'Mouse',    air: false, bounty: 8,  weight: 20, catchAlt: 0.8, radius: 3, scale: 2.15 },
  squirrel: { name: 'Squirrel', air: false, bounty: 22, weight: 12, catchAlt: 1.5, radius: 5, scale: 1.7 },
  turtle:   { name: 'Turtle',   air: false, bounty: 30, weight: 8,  catchAlt: 1.5, radius: 6, scale: 2.45 },
  // minStrike: your own speed needed; minRel: speed relative to the prey needed (both m/s, written as km/h / 3.6)
  pigeon:   { name: 'Pigeon',   air: true,  bounty: 10, weight: 40, minStrike: 90 / 3.6, minRel: 54 / 3.6, alt: [30, 200], speed: 18, scale: 1.45 },
  duck:     { name: 'Duck',     air: true,  bounty: 45, weight: 20, minStrike: 120 / 3.6, minRel: 72 / 3.6, alt: [20, 120], speed: 25, scale: 1.7 },
  swift:    { name: 'Swift',    air: true,  bounty: 35, weight: 15, minStrike: 60 / 3.6, minRel: 36 / 3.6, alt: [40, 250], speed: 22, scale: 2.0 },
  flock:    { name: 'Starling', air: true,  bounty: 8,  weight: 25, minStrike: 0, minRel: 0, alt: [80, 300], speed: 15, scale: 2.7 },
  // Fish live in lakes (air: 'water' keeps them out of the land/air spawn pools); depth is metres below the surface
  trout:    { name: 'Trout',    air: 'water', bounty: 30, weight: 0, depth: [0.6, 3], speed: 2.5, dart: 8, scale: 1.6 },
  pike:     { name: 'Pike',     air: 'water', bounty: 75, weight: 0, depth: [3, 15], speed: 1.6, dart: 6, scale: 2 },
};
export const ICON_SCALE = 2.0;   // sprite scale that maps to 1.0 in catch-card icons
export const FALCON_SCALE = 1.5; // minimum on-screen size of the player

// Spawn-weight multiplier by time of day (d = daylight 0..1, tw = twilight 0..1)
export const ACTIVITY = {
  mouse: (d) => 0.5 + (1 - d) * 1.5,          // nocturnal
  hare: (d) => 0.5 + (1 - d),
  rabbit: (d, tw) => 0.6 + tw * 1.2,          // dawn and dusk
  squirrel: (d) => 0.2 + d,
  turtle: (d) => 0.2 + d,
  pigeon: (d) => 0.15 + d,
  duck: (d, tw) => 0.4 + d * 0.6 + tw * 0.5,
  swift: (d) => 0.1 + d,
  flock: (d, tw) => 0.4 + tw * 2,             // dusk murmurations
};

// Prey live in a window around the bird that works in both directions. Each side has a spawn frontier that
// moves outward as the bird flies; when prey beyond SPAWN_KEEP are culled, the frontier is pulled back
// so that stretch is repopulated on a return visit.
export const SPAWN_REACH = 1500, SPAWN_KEEP = 2500;

export const THERMAL_SPACING = 700;

// ---------- Day/night ----------
export const DAY_LENGTH = 240;

// ---------- Terrain: ridges (background) and lakes ----------
export const RIDGE_SPACING = 1800;

export const LAKE_SPACING = 1300;

// ---------- Clouds ----------
export const CLOUD_BASE = 300;

// ---------- Hunter's rifle ----------
// Pick it up off the ground like a turtle; right-click fires. The base rifle shoots along your heading (hold to see
// the line, release to fire). Free aim holds your course while right-click is down so the cursor can aim anywhere.
// Auto-fire sprays while held; the Bazooka fires rockets that take everything in a blast. The bang spooks animals.
export const GUN_GRAB_R = 7, GUN_GRAB_ALT = 6;
export const GUN_AIR_GRAB = 1.6;   // × the air-catch radius for snatching a falling rifle
export const GUN_THROW_VY = 44;    // a shot hunter's rifle flies ~50 m up (with drag) before tumbling back down
export const GUN_TERMINAL = 28;    // m/s
export const GUN_REGRAB_T = 1.5;   // a rifle you just let go can't be re-caught for this long...
export const GUN_REGRAB_SEP = 2;   // ...unless it's been this many catch radii away from you first
export const AUTO_FIRE_DT = 0.11, ROCKET_SPEED = 110, ROCKET_BLAST = 14, ROCKET_FUSE = 3.5;
// Bazooka rockets lock onto the target nearest the aim line and steer toward it; if it's gone they seek a new one ahead
export const ROCKET_TURN = 4, ROCKET_LOCK_CONE = 0.5, ROCKET_SEEK = 160, ROCKET_SEEK_CONE = 0.9;
// Underwater: bullets only carry this far (and never leave the water); rockets become slow torpedoes
export const UNDERWATER_RANGE = 40, TORPEDO_SPEED = 45;

// ---------- Rivals ----------
// Buzzards circle some thermals. Make a kill or carry a turtle nearby and they give chase;
// if one reaches you it steals the turtle or your most recent catch. Outfly them in a dive.
export const RIVAL_SPEED = 24;
export const CAT_CELL = 220, CAT_REACH = 32, CAT_ALT = 18, CAT_LEAP_T = 0.45, CAT_LEAP_MAX = 40, CAT_LEAP_VY = 34, CAT_HIT = 3;
export const CAT_STALK_DIST = 120, CAT_STALK_ALT = 45, CAT_STALK_SPEED = 4;
export const HUNTER_CELL = 900, HUNTER_RANGE = 230, HUNTER_TRACK = 4, HUNTER_LOCK_DIST = 10, HUNTER_FROM_DAY = 2;
export const HUNTER_AIM_T = 0.7, HUNTER_HIT = 3, HUNTER_RELOAD = 1.5;   // s of visible aim before the shot; m from the shot line that kills; s between shots
export const HUNTER_SEE_ALT = 190, HUNTER_SNAP_LEAD = 0.4, HUNTER_SNAP_SPREAD = 7;   // snap shots: share of the full lead, ± m scatter
export const HAWK_SPEED = 70, HAWK_TURN = 2.4, HAWK_HIT = 3, HAWK_FROM_DAY = 3;
export const HAWK_STOOP_DIST = 110, HAWK_COMMIT = 45, HAWK_ACCEL = 35;

// ---------- Whacky upgrades: Eyases, Screech, Lucky Feather ----------
// Eyases (young hawks) fly in loose formation behind you, peel off after prey near you and bring you a share
export const EYAS = { count: [0, 1, 2, 3], speed: [0, 32, 35, 39], range: [0, 160, 190, 220] };
export const EYAS_SHARE = 0.5, EYAS_TURN = 3.2, EYAS_CHASE_T = 8, EYAS_REST_T = 4, EYAS_CATCH_R = 2.2, EYAS_SPOOK_D = 30, EYAS_DROP = 160;
// Lucky Feather: survive this many fatal attacks (cat / hunter / goshawk) per day
export const LUCKY = [0, 1, 2], LUCKY_INVULN = 2.5;

// Armed eyas shot: a tracer from the eyas; prey can be missed (and then bolts), predators going for you never are
export const EYAS_HIT = 0.8, EYAS_GUN_COOL = 1.2;

// ---------- Fishing ----------
// Hit a lake steeply (descending faster than WATER_PLUNGE_VY) and you plunge in instead of crashing: the faster
// the entry, the deeper you go. Water drag bleeds off the plunge quickly; after that you swim toward the cursor
// at up to swimSpeed() (Swimming upgrade) for as long as your breath lasts, then buoyancy takes you up. Grab any fish you pass,
// or come up under a resting duck for a big bonus (nothing sees you more than SUBMERGED_HIDE m down).
export const WATER_PLUNGE_VY = 3, WATER_DRAG = 5, WATER_BUOY = 3;
export const BREATHLESS_BUOY = 16, SUBMERGED_HIDE = 1, DUCK_BELOW_REACH = 2.2, DUCK_SPLASH_R = 35;
export const WATER_EXIT_SPEED = STALL_SPEED + 4, WET_TIME = 2.5, FISH_REACH = 1.6, FISH_SPOOK = 25;

// ---------- Octopus Grotto ----------
// With a starting rifle (Rifle tier 3+), some lakes hide a cave mouth in the lake bed at their far end. Swim in and you
// enter a flooded tunnel (its own little scene, in local coordinates: x 0..GROTTO_L, floor 0, ceiling GROTTO_H) with an
// octopus at the end. Bubble vents refill your breath. The octopus lashes tentacles at you: each one telegraphs
// its strike line, then lashes out; shoot a tentacle to break the attack, shoot (or talon-strike) the head to hurt it.
// Swim back out the left end to return to the lake. The day clock keeps running down there.
export const GROTTO_L = 170, GROTTO_H = 16, GROTTO_VENTS = [12, 45, 78, 108, 132], VENT_R = 2.5, VENT_REFILL = 15;
export const OCTO_HP = 14, OCTO_REACH = 26, OCTO_HIT = 1.4, OCTO_WIND = [0.85, 0.6], OCTO_STRIKE = 0.2, OCTO_RETRACT = 0.7;
export const OCTO_ATK = [1.9, 1.15], OCTO_AGGRO = 50, OCTO_HEAD_R = 3.2, OCTO_TALON_DMG = 2, OCTO_ROCKET_DMG = 4;

// ---------- Moonshot (end goal) ----------
export const MOON_BOUNTY = 500;

// ---------- Draw ----------
export const OUTLINE = 'drop-shadow(1px 0 0 #000) drop-shadow(-1px 0 0 #000) drop-shadow(0 1px 0 #000) drop-shadow(0 -1px 0 #000)';
export const SIGHT_COLOR = '#ff4d4d';
export const HEARING_COLOR = '#ffbf40';
export const SHADOW_REACTORS = new Set(['hare', 'mouse', 'squirrel']);
export const NO_SENSE_RANGE = new Set(['rabbit', 'turtle']);
export const IGNORE_DETECTION = new Set(['rabbit', 'turtle']);
export const ANIM_STEPS = 12;
// Animation period of [hopT, flapT] for each sprite (0 = not animated by that value)
export const ANIM_PERIOD = { rabbit: [Math.PI / 6, 0], hare: [Math.PI / 6, 0], mouse: [Math.PI / 18, 0], squirrel: [Math.PI / 8, 0],
  turtle: [Math.PI / 3, 0], pigeon: [0, Math.PI * 2], duck: [0, Math.PI * 2], swift: [0, Math.PI * 2], star: [0, Math.PI * 2] };
export const GUN_MUZZLE = [17, 15, 16];
export const GRASS_COLORS = ['#2d5a1d', '#3d7726', '#5ca032', '#82bf56'];

// Young hawks: small rufous-brown buteo-ish birds, carrying their catch for a while (and a rifle once armed).
// Each pose is rendered once into the sprite cache (outlined there), so drawing them each frame is cheap
export const EYAS_S = 0.75 * FALCON_SCALE;

// ---------- Hazard drawing ----------
export const HAZARD_SCALE = 1.5;
