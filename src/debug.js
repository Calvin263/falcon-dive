

export function createDebug({ session, viewport, systems }) {
  return {
    get bird() { return session.bird; },
    get prey() { return session.prey; },
    get state() { return session.state; },
    get senses() { return { SENSES: systems.prey.SENSES, hearingRange: systems.prey.hearingRange, visionRange: systems.prey.visionRange, shadowWorldX: systems.progression.shadowWorldX, shadowMaxReach: systems.progression.shadowMaxReach, shadowInFront: systems.progression.shadowInFront }; },
    snapshot() {
      return {
        bird: { ...session.bird },
        state: { ...session.state, wind: { ...session.state.wind }, storm: { ...session.state.storm } },
        prey: session.prey.map(p => ({ ...p, lookA: p.lookA, aware: p.aware, alertT: p.alertT, lastSense: p.lastSense, shadowReach: p.shadowReach }))
      };
    },
    sensesFor(p) { return systems.prey.sensesInfo(p); },
    sensed(p, dt = 1 / 60) { return systems.prey.sensed(p, dt); },
    get sky() { return systems.sky; },
    step(dt = 1 / 60) { systems.flight.update(dt); return this.snapshot(); },
    render() { systems.renderer.draw(); },
    loop(frames = 60, dt = 1 / 60) {
      const out = [];
      for (let i = 0; i < frames; i++) {
        systems.flight.update(dt);
        out.push(this.snapshot());
      }
      return out;
    },
    reset: systems.session.reset,
    get cam() { return session.cam; },
    get progress() { return session.progress; },
    get screen() { return session.screen; },
    get session() { return session; },
    get buttons() { return session.uiButtons; },
    get shopMetrics() { return systems.screens.shopMetrics(); },
    get graphicsOptions() { return systems.settings.graphicsOptions(); },
    priceCatch: systems.session.priceCatch, endDay: systems.session.endDay, showRecap: systems.session.showRecap, showShop: systems.session.showShop, startDay: systems.session.startDay, buyUpgrade: systems.progression.buyUpgrade, resetProgress: systems.session.resetProgress, saveProgress: systems.progression.saveProgress,
    setBird(x = session.bird.x, alt = session.bird.alt, speed = session.bird.speed) {
      session.bird.x = x; session.bird.alt = alt; session.bird.speed = speed; session.bird.vx = session.bird.vx ?? 0; session.bird.vy = session.bird.vy ?? 0;
      return session.bird;
    }
  };}
