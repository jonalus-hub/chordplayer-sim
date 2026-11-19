// Web Audio synthesizer that plays the "DAW" at the other end of the USB-MIDI cable.
const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);

export const TIMBRES = {
  epiano: { label: "Electric piano", waves: ["sine", "triangle"], detune: 4, attack: 0.005, decay: 0.9, sustain: 0.35, release: 0.35, cutoff: 3200 },
  pad: { label: "Pad", waves: ["sawtooth", "sawtooth"], detune: 9, attack: 0.25, decay: 0.6, sustain: 0.8, release: 0.9, cutoff: 1500 },
  organ: { label: "Organ", waves: ["square", "sine"], detune: 1200, attack: 0.01, decay: 0.05, sustain: 0.9, release: 0.08, cutoff: 2400 },
  pluck: { label: "Pluck", waves: ["sawtooth", "triangle"], detune: 6, attack: 0.002, decay: 0.25, sustain: 0.0, release: 0.2, cutoff: 2600 },
};

export class Synth {
  constructor() {
    this.ctx = null;
    this.voices = new Map();
    this.timbre = "epiano";
    this.volume = 0.7;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
      this.noise = this.makeNoise();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return true;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  makeNoise() {
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  noteOn(note, velocity = 127) {
    if (!this.ensure()) return;
    this.noteOff(note, true);
    const t = this.ctx.currentTime;
    const p = TIMBRES[this.timbre];
    const vel = (velocity / 127) * 0.16;
    const env = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = p.cutoff;
    filter.Q.value = 0.7;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(vel, t + p.attack);
    env.gain.setTargetAtTime(vel * p.sustain, t + p.attack, p.decay / 3);
    const oscs = p.waves.map((w, i) => {
      const o = this.ctx.createOscillator();
      o.type = w;
      o.frequency.value = mtof(note);
      o.detune.value = i === 0 ? 0 : p.detune;
      const g = this.ctx.createGain();
      g.gain.value = i === 0 ? 0.7 : 0.35;
      o.connect(g).connect(filter);
      o.start(t);
      return o;
    });
    filter.connect(env).connect(this.master);
    this.voices.set(note, { oscs, env, release: p.release });
  }

  noteOff(note, immediate = false) {
    const v = this.voices.get(note);
    if (!v || !this.ctx) return;
    const t = this.ctx.currentTime;
    const rel = immediate ? 0.01 : v.release;
    v.env.gain.cancelScheduledValues(t);
    v.env.gain.setValueAtTime(v.env.gain.value, t);
    v.env.gain.setTargetAtTime(0, t, rel / 4);
    v.oscs.forEach((o) => o.stop(t + rel + 0.05));
    this.voices.delete(note);
  }

  allOff() { [...this.voices.keys()].forEach((n) => this.noteOff(n)); }

  // Simple GM kit for DrumMode (channel 10)
  drum(note, velocity = 127) {
    if (!this.ensure()) return;
    const ctx = this.ctx, t = ctx.currentTime, vel = velocity / 127;
    const out = ctx.createGain();
    out.connect(this.master);
    const tone = (f0, f1, dur, type = "sine", lvl = 1) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(lvl * vel, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(out);
      o.start(t); o.stop(t + dur + 0.05);
    };
    const noise = (dur, hp, lvl = 0.5, bp = false) => {
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = this.noise;
      f.type = bp ? "bandpass" : "highpass";
      f.frequency.value = hp;
      g.gain.setValueAtTime(lvl * vel, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.connect(f).connect(g).connect(out);
      s.start(t); s.stop(t + dur + 0.05);
    };
    switch (note) {
      case 36: tone(150, 40, 0.45, "sine", 1.1); noise(0.02, 3000, 0.15); break;
      case 38: tone(220, 120, 0.15, "triangle", 0.5); noise(0.22, 1500, 0.6); break;
      case 42: noise(0.06, 7000, 0.35); break;
      case 46: noise(0.4, 6500, 0.3); break;
      case 41: tone(130, 70, 0.4, "sine", 0.8); break;
      case 49: noise(1.6, 5000, 0.35); noise(0.6, 3200, 0.15, true); break;
      case 51: noise(0.9, 8000, 0.2); tone(3200, 3000, 0.7, "square", 0.025); break;
      default: tone(400, 200, 0.2);
    }
  }
}
