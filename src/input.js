import { CRASH_REVEAL_DELAY, PAUSE_BTN } from './config.js';

export function createInput({ session, viewport, systems }) {
  // ---------- Input ----------
  session.mouse = { x: viewport.W / 2, y: viewport.H / 2, down: false, sliderDrag: false, sliderKind: null, aiming: false, talonTarget: null, throwHeld: false, steer: null };
  const inPauseBtn = (x, y) =>
    x >= PAUSE_BTN.x && x <= PAUSE_BTN.x + PAUSE_BTN.w && y >= PAUSE_BTN.y && y <= PAUSE_BTN.y + PAUSE_BTN.h;
  const talonsOut = () => session.screen === 'hunt' && !session.paused && !session.state.over &&
    session.mouse.aiming && !session.mouse.throwHeld && !session.bird.carrying;
  function cancelAim() {
    session.mouse.aiming = false;
    session.mouse.throwHeld = false;
    session.mouse.talonTarget = null;
    session.mouse.steer = null;
  }

  session.paused = false;
  function togglePause() { session.paused = !session.paused; session.mouse.down = false; session.mouse.sliderDrag = false; session.mouse.sliderKind = null; cancelAim(); }
  function bindInput(options = {}) {
    viewport.canvas.addEventListener('mousemove', e => {
      session.mouse.x = e.clientX; session.mouse.y = e.clientY;
      if (session.screen !== 'hunt') {
        viewport.canvas.style.cursor = systems.session.uiHit(e.clientX, e.clientY) ? 'pointer' : 'default';
        return;
      }
      if (session.paused && session.mouse.sliderDrag && session.mouse.sliderKind) {
        systems.settings.setAnimalScaleFromClientX(session.mouse.sliderKind, e.clientX);
      }
      if (session.paused) {
        viewport.canvas.style.cursor = inPauseBtn(e.clientX, e.clientY) || systems.settings.graphicsPresetAt(e.clientX, e.clientY) ? 'pointer' : 'crosshair';
        return;
      }
      viewport.canvas.style.cursor = inPauseBtn(e.clientX, e.clientY) ? 'pointer' : 'crosshair';
    }, options);
    viewport.canvas.addEventListener('mousedown', e => {
      if (session.screen !== 'hunt') {
        if (e.button === 0) systems.session.clickUI(e.clientX, e.clientY);
        return;
      }
      if (session.state.crash && session.state.crash.t < CRASH_REVEAL_DELAY) return;
      if (session.state.over) { systems.session.showRecap(); return; }
      if (inPauseBtn(e.clientX, e.clientY)) { togglePause(); return; }
      if (session.paused) {
        const preset = systems.settings.graphicsPresetAt(e.clientX, e.clientY);
        if (preset) { systems.settings.setGraphicsPreset(preset); return; }
        session.paused = false;
        return;
      }
      if (e.button === 2) {
        if (session.mouse.down) return;
        if (session.bird.carrying) {
          // Without the Aimed Throw upgrade, right-click just lets go
          session.mouse.aiming = true;
          session.mouse.throwHeld = true;
          session.mouse.talonTarget = null;
          // Free aim: hold the current course while the cursor aims the gun
          const a = systems.flight.birdAnchor();
          session.mouse.steer = session.bird.carrying.kind === 'gun' && systems.combat.gunFreeAim() ? { dx: session.mouse.x - a.x, dy: session.mouse.y - a.y } : null;
          return;
        }
        session.mouse.aiming = true;
        session.mouse.throwHeld = false;
        session.mouse.talonTarget = systems.prey.nearestFallingTurtle();
        return;
      }
      if (e.button === 0) {
        cancelAim();
        session.mouse.down = true;
      }
    }, options);
    addEventListener('mouseup', e => {
      if (e.button !== 2) {
        session.mouse.down = false;
        session.mouse.sliderDrag = false;
        session.mouse.sliderKind = null;
        return;
      }
      if (session.mouse.aiming) {
        if (session.bird.carrying && session.mouse.throwHeld) {
          if (session.bird.carrying.kind !== 'gun') systems.prey.dropTurtle(true);
          else if (!systems.combat.gunAuto()) systems.combat.fireGun();
        } else if (session.mouse.talonTarget && systems.prey.nearestFallingTurtle() === session.mouse.talonTarget) {
          systems.prey.grabFallingTurtle(session.mouse.talonTarget);
        }
      }
      session.mouse.aiming = false;
      session.mouse.throwHeld = false;
      session.mouse.talonTarget = null;
      session.mouse.steer = null;
      session.mouse.sliderDrag = false;
      session.mouse.sliderKind = null;
    }, options);
    viewport.canvas.addEventListener('contextmenu', e => e.preventDefault(), options);
    addEventListener('keydown', e => {
      if (session.screen !== 'hunt') {
        if (session.screen === 'shop' && session.achView) {
          if (e.key === 'Escape') session.achView = false;
          return;
        }
        if (e.key === 'Enter') { if (session.screen === 'recap') systems.session.showShop(); else systems.session.startDay(); }
        return;
      }
      if ((e.key === 'p' || e.key === 'P' || e.key === 'Escape') && !session.state.over) togglePause();
      if (e.key === ' ') { e.preventDefault(); systems.prey.dropTurtle(); }
      if (e.key === 'e' || e.key === 'E') systems.companions.eyasCall();
    }, options);
    addEventListener('blur', () => { if (!session.state.over) session.paused = true; session.mouse.down = false; cancelAim(); session.mouse.sliderDrag = false; session.mouse.sliderKind = null; }, options);
  }
  return { bindInput, inPauseBtn, talonsOut };
}
