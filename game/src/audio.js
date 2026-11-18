// All sound is synthesized with WebAudio — no audio files, no network. The engine
// hums with speed, sirens wail while the player is wanted, and a small step
// sequencer plays a laid-back bassline over the city.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.musicTimer = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenHigh = false;
    this.sirenTimer = null;
    this.musicStep = 0;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    // Engine: two detuned saws through a lowpass, pitch follows speed.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const engineOsc2 = this.ctx.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.value = 55.7;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    const engineFilter = this.ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    this.engineOsc.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    engineOsc2.start();
    this.engineOsc2 = engineOsc2;
    // Siren: a square wave that alternates two tones.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'square';
    this.sirenOsc.frequency.value = 720;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.startMusic();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  setEngine(speed01, on) {
    if (!this.ctx) return;
    const target = on ? 0.05 + speed01 * 0.06 : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    const freq = 52 + speed01 * 90;
    this.engineOsc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
    this.engineOsc2.frequency.setTargetAtTime(freq * 1.012, this.ctx.currentTime, 0.1);
  }

  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenTimer) {
      this.sirenGain.gain.setTargetAtTime(0.035, this.ctx.currentTime, 0.1);
      this.sirenTimer = setInterval(() => {
        this.sirenHigh = !this.sirenHigh;
        this.sirenOsc.frequency.setTargetAtTime(this.sirenHigh ? 950 : 700, this.ctx.currentTime, 0.05);
      }, 420);
    } else if (!on && this.sirenTimer) {
      clearInterval(this.sirenTimer);
      this.sirenTimer = null;
      this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    }
  }

  blip(freq, dur, type, vol) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noiseBurst(dur, vol, cutoff) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff || 1800;
    const g = this.ctx.createGain();
    g.gain.value = vol || 0.3;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }

  gunshot() { this.noiseBurst(0.12, 0.35, 2400); this.blip(140, 0.1, 'square', 0.18); }
  pickup() { this.blip(660, 0.09, 'sine', 0.22); setTimeout(() => this.blip(990, 0.12, 'sine', 0.22), 70); }
  crash() { this.noiseBurst(0.3, 0.4, 900); }
  explosion() { this.noiseBurst(0.7, 0.5, 500); this.blip(60, 0.5, 'sine', 0.35); }
  jingle() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 'triangle', 0.22), i * 110)); }
  fail() { [330, 262, 196].forEach((f, i) => setTimeout(() => this.blip(f, 0.2, 'triangle', 0.2), i * 140)); }

  startMusic() {
    if (this.musicTimer) return;
    // A slow 8-step bassline in A minor, one step every 320 ms.
    const bass = [55, 0, 55, 65.41, 55, 0, 49, 61.74];
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.muted) { this.musicStep = (this.musicStep + 1) % 8; return; }
      const f = bass[this.musicStep];
      if (f) this.blip(f, 0.28, 'triangle', 0.09);
      if (this.musicStep % 2 === 0) this.noiseBurst(0.03, 0.04, 6000);
      this.musicStep = (this.musicStep + 1) % 8;
    }, 320);
  }
}
