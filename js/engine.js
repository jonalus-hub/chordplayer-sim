// Máquina de estados de code.py (fw-2026-04-07), pasada de "polling" a eventos,
// más las funciones propuestas para el aparato futuro (IA, género, LEDs, menú de ajustes,
// arpegios editables y ampliadores de acorde).
import { BASE_NOTES, MODES, ROMANS, chordInfo, applyOctave, DRUM_NOTES, extendChord, extendedName, modifierById } from "./chords.js";
import { getNextChords, chordToFunction } from "./nextchord.js";
import { BUILTIN_PATTERNS, scaleSteps, loadUserPatterns, saveUserPatterns } from "./rhythm.js";
import { ArpMenu } from "./arpmenu.js";
import { GENRES, modelFile, loadModel, predict, tokenFor, parseToken } from "./ai.js";

const MIDI_VELOCITY = 127;
const DEFAULT_CHANNEL = 0;
const DRUM_CHANNEL = 9;
const MENU_TIMEOUT_MS = 20000; // fuera del editor; el editor no se cierra solo
const MOD_KEY = "chordplayer.modifiers.v1";
const DEFAULT_MODS = ["7", "9", "5"];

// Otros ajustes que se guardan (propuesta): vista de la pantalla principal y modo del botón Note
const SETTINGS_KEY = "chordplayer.settings.v1";
export const SCREENS = { chords: "Chords", keys: "Keys" };
// gate: cada nota suena mientras Note está pulsado · sustain: se acumulan mientras se mantiene el acorde
export const NOTE_MODES = { gate: "Gate", sustain: "Sustain" };

function loadSettings() {
  try {
    const v = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return {
      screen: v.screen in SCREENS ? v.screen : "chords",
      noteMode: v.noteMode in NOTE_MODES ? v.noteMode : "gate",
    };
  } catch {
    return { screen: "chords", noteMode: "gate" };
  }
}

function loadModAssign() {
  try {
    const v = JSON.parse(localStorage.getItem(MOD_KEY) || "null");
    if (Array.isArray(v) && v.length === 3 && v.every((id) => modifierById(id))) return v;
  } catch { /* sin almacenamiento */ }
  return [...DEFAULT_MODS];
}
const wrap = (i, n) => ((i % n) + n) % n;
const MIN_OCTAVE = -3, MAX_OCTAVE = 3;
const GATE_MIN_S = 0.01, GATE_FRACTION = 0.5;
const HISTORY = 4;
const MIN_BPM = 40, MAX_BPM = 300, DEFAULT_BPM = 120; // DEFAULT_BPM de code.py
const OVERLAY_MS = 1500;

export class ChordPlayer {
  constructor({ out, onChange, log }) {
    this.out = out;            // { noteOn(note, vel, ch), noteOff(note, vel, ch) }
    this.onChange = onChange;  // repinta UI
    this.log = log;            // "consola serie"
    this.baseIdx = 0;
    this.modeIdx = 0;
    this.octave = 0;
    this.held = new Map();       // grado -> { drum, note } en orden de pulsación
    this.current = null;         // el que marca el círculo de la OLED
    this.noteStates = new Map(); // nota -> Set(grado), como note_states
    this.chordNotes = {};        // notas realmente enviadas por grado
    this.drumOffsets = Object.fromEntries(ROMANS.map((r) => [r, 0]));
    this.drumLabels = {};        // pad -> número MIDI mientras se reasigna
    this.history = [];           // [{ roman, token, name }]
    this.genreIdx = 0;
    this.reco = { source: "none", items: [] };
    this.recoSeq = 0;
    this.overlay = null;         // { text, until }
    this.rhythmMode = false;
    this.rhythmIdx = 0;
    this.bpm = DEFAULT_BPM;
    this.rhythm = null;
    // Patrones de arpegio: los del firmware + los guardados por el usuario
    this.patterns = [...BUILTIN_PATTERNS.map((p) => ({ ...p, steps: p.steps.map((s) => [...s]) })), ...loadUserPatterns()];
    this.showLeds = true;
    this.showBars = true;
    // Ampliadores: 3 botones bajo la pantalla; se mantienen antes de pulsar el acorde
    this.modHeld = [false, false, false];
    // Botón Note (propuesta): pulsado antes del acorde, el acorde suena nota a nota
    this.noteHeld = false;
    this.noteArp = null;         // { chord, mods, idx, playing, sounding } mientras se toca nota a nota
    this.modAssign = loadModAssign();
    const settings = loadSettings();
    this.screen = settings.screen;        // "chords" (nombres en zigzag) o "keys" (teclado)
    this.noteMode = settings.noteMode;    // "gate" o "sustain" (botón Note)
    this.menu = null;            // ArpMenu mientras está abierto
  }

  get mode() { return MODES[this.modeIdx]; }
  get isDrum() { return this.mode === "DrumMode"; }
  get genre() { return GENRES[this.genreIdx]; }

  boot() {
    this.log("Adafruit CircuitPython 10.1.4; Raspberry Pi Pico with rp2040", "sys");
    this.log("Display initialized successfully");
    this.log("Initializing MIDI channels...");
    this.log(`Single MIDI channel ${DEFAULT_CHANNEL} initialized`);
    this.log(`Using SINGLE-CHANNEL mode (all buttons use channel ${DEFAULT_CHANNEL})`);
    this.log("System initialized successfully");
    this.log("Starting main loop");
    this.refreshReco();
    this.onChange();
  }

  notesFor(roman, mods = this.held.get(roman)?.mods ?? []) {
    return extendChord(this.mode, roman, BASE_NOTES[this.baseIdx], mods).map((n) => applyOctave(n, this.octave));
  }

  // Nombre del acorde con los ampliadores con que se pulsó
  chordName(roman) {
    return extendedName(this.baseIdx, this.modeIdx, roman, this.held.get(roman)?.mods ?? []);
  }

  // ---- Ampliadores ----
  activeMods() {
    return [...new Set(this.modAssign.filter((_, i) => this.modHeld[i]))];
  }

  pressMod(i) {
    if (this.modHeld[i]) return;
    this.modHeld[i] = true;
    this.log(`Modifier ${i + 1} (${modifierById(this.modAssign[i]).label}) held`);
    this.onChange();
  }

  // ---- Botón Note (propuesta) ----
  pressNote() {
    if (this.noteHeld) return;
    this.noteHeld = true;
    const a = this.noteArp;
    if (a && !this.isDrum) {
      // Siguiente nota del acorde (al pasar de la última vuelve a la primera)
      if (this.noteMode === "gate") this.noteArpStop();
      a.idx = (a.idx + 1) % this.notesFor(a.chord, a.mods).length;
      this.noteArpPlay();
    } else if (!this.isDrum) {
      // Note con un acorde ya sonando: el acorde sigue y sus notas se vuelven a tocar
      // una a una por encima, empezando por la primera
      const full = this.fullChords();
      const chord = full.includes(this.current) ? this.current : full.at(-1);
      if (chord) {
        this.noteArp = { chord, mods: this.held.get(chord).mods, idx: 0, playing: null, sounding: new Set() };
        this.noteArpPlay();
        this.log(`Chord ${chord}: Note plays its notes one by one on top`);
      }
    }
    this.onChange();
  }

  releaseNote() {
    if (!this.noteHeld) return;
    this.noteHeld = false;
    // Gate: la nota se apaga al soltar Note. Sustain: sigue mientras se mantenga la tecla de acorde
    if (this.noteMode === "gate") this.noteArpStop();
    this.onChange();
  }

  noteArpPlay() {
    const a = this.noteArp;
    const notes = this.notesFor(a.chord, a.mods);
    a.idx %= notes.length;
    const n = notes[a.idx];
    const id = `${a.chord}:note`;
    // En Sustain, al volver a una nota que ya suena se vuelve a tocar
    if (a.sounding.has(n)) this.sendNoteOff(n, id);
    a.playing = n;
    a.sounding.add(n);
    this.sendNoteOn(n, id, true);
  }

  noteArpStop() {
    const a = this.noteArp;
    if (a && a.playing != null) {
      this.sendNoteOff(a.playing, `${a.chord}:note`);
      a.sounding.delete(a.playing);
      a.playing = null;
    }
  }

  // Apaga todas las notas tocadas con Note (en Sustain se acumulan)
  noteArpStopAll() {
    const a = this.noteArp;
    if (!a) return;
    a.sounding.forEach((n) => this.sendNoteOff(n, `${a.chord}:note`));
    a.sounding.clear();
    a.playing = null;
  }

  releaseMod(i) {
    if (!this.modHeld[i]) return;
    this.modHeld[i] = false;
    this.onChange();
  }

  saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ screen: this.screen, noteMode: this.noteMode })); } catch { /* solo esta sesión */ }
  }

  setScreen(screen) {
    this.screen = screen in SCREENS ? screen : "chords";
    this.saveSettings();
    this.log(`Screen set to ${SCREENS[this.screen]}`);
    this.onChange();
  }

  setNoteMode(mode) {
    this.noteArpStopAll();
    if (!this.noteArp || !this.held.has(this.noteArp.chord)) this.noteArp = null;
    this.noteMode = mode in NOTE_MODES ? mode : "gate";
    this.saveSettings();
    this.log(`Note button set to ${NOTE_MODES[this.noteMode]}`);
    this.onChange();
  }

  setModAssign(i, id) {
    this.modAssign[i] = id;
    try { localStorage.setItem(MOD_KEY, JSON.stringify(this.modAssign)); } catch { /* solo esta sesión */ }
    this.log(`Modifier ${i + 1} set to ${modifierById(id).label}`);
    this.onChange();
  }

  drumNote(roman) {
    return Math.max(0, Math.min(127, DRUM_NOTES[roman] + this.drumOffsets[roman]));
  }

  heldChords() { return [...this.held].filter(([, e]) => !e.drum).map(([r]) => r); }
  // Acordes que suenan enteros (no los que se tocan nota a nota con Note)
  fullChords() { return [...this.held].filter(([, e]) => !e.drum && !e.manual).map(([r]) => r); }
  heldPads() { return [...this.held].filter(([, e]) => e.drum).map(([r]) => r); }

  // ---- MIDI con conteo de referencias (send_note_on / send_note_off) ----
  // restrike: vuelve a mandar Note On aunque la nota ya suene (Note tocando encima de un acorde)
  sendNoteOn(note, button, restrike = false) {
    if (!this.noteStates.has(note)) {
      this.noteStates.set(note, new Set());
      this.out.noteOn(note, MIDI_VELOCITY, DEFAULT_CHANNEL);
    } else if (restrike) {
      this.out.noteOn(note, MIDI_VELOCITY, DEFAULT_CHANNEL);
    }
    this.noteStates.get(note).add(button);
  }

  sendNoteOff(note, button) {
    const s = this.noteStates.get(note);
    if (!s) return;
    s.delete(button);
    if (!s.size) {
      this.out.noteOff(note, 0, DEFAULT_CHANNEL);
      this.noteStates.delete(note);
    }
  }

  playChord(roman) {
    const notes = this.notesFor(roman);
    this.chordNotes[roman] = notes;
    notes.forEach((n) => this.sendNoteOn(n, roman));
  }

  stopChord(roman) {
    (this.chordNotes[roman] || []).forEach((n) => this.sendNoteOff(n, roman));
    delete this.chordNotes[roman];
  }

  // Tras girar un encoder: apaga lo que suena y vuelve a tocar lo que sigue pulsado
  retune() {
    Object.keys(this.chordNotes).forEach((r) => this.stopChord(r));
    // Nota a nota: si Note sigue pulsado, vuelve a tocar la misma posición con las notas nuevas
    if (this.noteArp) {
      this.noteArpStopAll();
      if (this.noteMode === "gate" && this.noteHeld && !this.isDrum && this.held.has(this.noteArp.chord)) this.noteArpPlay();
    }
    const chords = this.fullChords();
    const was = this.rhythm?.chord;
    this.stopRhythm();
    if (this.isDrum || !chords.length) return;
    if (this.rhythmMode) this.startRhythm(chords.includes(was) ? was : chords.at(-1));
    else chords.forEach((r) => this.playChord(r));
  }

  // ---- Teclas de acorde (polifónicas, como handle_chord_buttons) ----
  press(roman) {
    if (this.held.has(roman)) return;
    if (this.isDrum) {
      const note = this.drumNote(roman);
      this.out.noteOn(note, MIDI_VELOCITY, DRUM_CHANNEL);
      this.held.set(roman, { drum: true, note });
    } else {
      // Cualquier tecla de acorde termina el acorde anterior tocado nota a nota
      if (this.noteArp) { this.noteArpStopAll(); this.noteArp = null; }
      // Los ampliadores cuentan solo si ya estaban pulsados al tocar la tecla
      const mods = this.activeMods();
      const manual = this.noteHeld;
      this.held.set(roman, { drum: false, mods, manual });
      this.addHistory(roman, mods);
      if (mods.length) this.log(`Chord ${roman} + ${mods.map((m) => modifierById(m).label).join(" + ")}: ${this.chordName(roman)}`);
      if (manual) {
        // Con Note pulsado solo suena la primera nota; las demás, con cada pulsación de Note
        this.noteArp = { chord: roman, mods, idx: 0, playing: null, sounding: new Set() };
        this.noteArpPlay();
        this.log(`Chord ${roman} note by note: press Note for each next note`);
      } else if (this.rhythmMode) this.startRhythm(roman);
      else this.playChord(roman);
    }
    this.current = roman;
    this.onChange();
  }

  release(roman) {
    const e = this.held.get(roman);
    if (!e) return;
    this.held.delete(roman);
    if (e.drum) {
      this.out.noteOff(e.note, 0, DRUM_CHANNEL);
      delete this.drumLabels[roman];
    } else if (this.noteArp && this.noteArp.chord === roman) {
      // Soltar la tecla de acorde apaga todas las notas tocadas con Note (en Gate y en Sustain)
      this.noteArpStopAll();
      this.noteArp = null;
    }
    // Acorde entero (con o sin notas de Note encima): apagarlo o pasar el arpegio a otro
    if (!e.drum && !e.manual) {
      if (this.rhythmMode) {
        const chords = this.fullChords();
        if (!chords.length) this.stopRhythm();
        else if (this.rhythm && this.rhythm.chord === roman) this.startRhythm(chords.at(-1));
      } else {
        this.stopChord(roman);
      }
    }
    if (this.current === roman) this.current = [...this.held.keys()].at(-1) ?? null;
    this.onChange();
  }

  releaseAll() { [...this.held.keys()].forEach((r) => this.release(r)); }

  // ---- Encoders (KY-040: girar = ±1 detent, pulsar = SW) ----
  turn(enc, d) {
    if (this.menu) { this.menu.turn(enc, d); this.touchMenu(); this.onChange(); return; }
    if (enc === "base") {
      this.baseIdx = (this.baseIdx + d + 12) % 12;
      this.log(`Base note set to ${BASE_NOTES[this.baseIdx]}`);
      this.retune();
    } else if (enc === "mode") {
      this.modeIdx = (this.modeIdx + d + MODES.length) % MODES.length;
      this.log(`Mode set to ${this.mode}`);
      this.retune();
    } else if (enc === "octave") {
      const pads = this.isDrum ? this.heldPads() : [];
      if (pads.length) {
        // DrumMode: con un pad pulsado, el encoder de octava cambia su nota
        for (const r of pads) {
          this.drumOffsets[r] += d;
          const n = this.drumNote(r);
          const off = this.drumOffsets[r];
          this.log(`Drum pad ${r}: note -> ${n} (offset ${off >= 0 ? "+" : ""}${off})`);
          this.drumLabels[r] = String(n);
          this.out.noteOn(n, MIDI_VELOCITY, DRUM_CHANNEL);
          this.out.noteOff(n, 0, DRUM_CHANNEL);
        }
        this.onChange();
        return;
      }
      const next = this.octave + d;
      if (next < MIN_OCTAVE || next > MAX_OCTAVE) return;
      this.octave = next;
      this.log(`Octave set to ${this.octave}`);
      this.retune();
    }
    this.refreshReco();
    this.onChange();
  }

  // Propuesta: toque corto en Modo = género siguiente; con el menú abierto, toque = elegir
  push(enc) {
    if (this.menu) { this.menu.press(); this.touchMenu(); this.onChange(); return; }
    if (enc === "mode") {
      this.setGenre((this.genreIdx + 1) % GENRES.length);
    } else {
      this.log(`Encoder ${enc}: SW sin función asignada`, "prompt");
    }
  }

  // Propuesta: mantener cualquier encoder 1 s abre o cierra el menú
  longPress(enc) {
    if (this.menu) this.closeMenu(); else this.openMenu(enc);
  }

  setGenre(i, flash = true) {
    this.genreIdx = wrap(i, GENRES.length);
    this.log(`Genre set to ${this.genre}`);
    if (flash) this.flash(`Genre: ${this.genre.replace("_", " ")}`);
    this.refreshReco();
    this.onChange();
  }

  // ---- Menú de arpegios (propuesta, ver arpmenu.js) ----
  openMenu(enc) {
    this.menu = new ArpMenu(this);
    this.log(`Arpeggio menu opened (encoder ${enc} held 1 s)`);
    this.touchMenu();
    this.onChange();
  }

  closeMenu() {
    if (!this.menu) return;
    clearTimeout(this.menuTimer);
    if (this.menu.edit) this.menu.closeEditor();
    this.menu = null;
    this.log("Arpeggio menu closed");
    this.onChange();
  }

  // La lista se cierra sola tras 20 s sin tocar nada; el editor no
  touchMenu() {
    clearTimeout(this.menuTimer);
    if (this.menu && this.menu.level !== "edit") this.menuTimer = setTimeout(() => this.closeMenu(), MENU_TIMEOUT_MS);
  }

  menuView() { return this.menu ? this.menu.view() : null; }

  // Pasos del arpegio que suena (los del editor si está abierto)
  activeSteps() { return this.menu?.liveSteps() ?? this.patterns[this.rhythmIdx].steps; }

  nextUserName() {
    const nums = this.patterns.filter((p) => !p.builtin).map((p) => parseInt(p.name.replace(/\D/g, ""), 10) || 0);
    return `User ${Math.max(0, ...nums) + 1}`;
  }

  persistPatterns() { return saveUserPatterns(this.patterns.filter((p) => !p.builtin)); }

  deletePattern(i) {
    const pat = this.patterns[i];
    if (!pat || pat.builtin) return;
    this.patterns.splice(i, 1);
    if (this.rhythmIdx >= this.patterns.length || this.rhythmIdx === i) this.rhythmIdx = 0;
    else if (this.rhythmIdx > i) this.rhythmIdx -= 1;
    this.persistPatterns();
    this.log(`Arpeggio ${pat.name} deleted`);
    this.onChange();
  }

  setHints(leds, bars) {
    this.showLeds = leds;
    this.showBars = bars;
    this.onChange();
  }

  flash(text) {
    this.overlay = { text, until: performance.now() + OVERLAY_MS };
    clearTimeout(this.overlayTimer);
    this.overlayTimer = setTimeout(() => { this.overlay = null; this.onChange(); }, OVERLAY_MS);
    this.onChange();
  }

  // ---- Historial y recomendaciones ----
  addHistory(roman, mods = []) {
    const info = chordInfo(this.mode, roman);
    // Con maj<>min el acorde que suena cambia de calidad, y así lo ve el modelo
    const quality = mods.includes("swap") ? (info.quality === "maj" ? "min" : "maj") : info.quality;
    const name = BASE_NOTES[(this.baseIdx + info.interval) % 12] + (quality === "min" ? "m" : "");
    this.history.push({ roman, token: tokenFor(info.interval, quality), name });
    if (this.history.length > HISTORY) this.history.shift();
    this.refreshReco(true);
  }

  clearHistory() {
    this.history = [];
    this.log("Chord history cleared", "prompt");
    this.refreshReco();
    this.onChange();
  }

  // Pasa un símbolo del modelo a la tecla que lo toca en el modo actual (o null si no hay)
  mapToken({ token, pct }) {
    if (token === "*E*") return { token, pct, end: true, roman: null, name: "fin" };
    const t = parseToken(token);
    if (!t) return { token, pct, roman: null, name: token };
    const roman = ROMANS.find((r) => {
      const i = chordInfo(this.mode, r);
      return i.interval === t.interval && i.quality === t.quality;
    }) ?? null;
    const name = BASE_NOTES[(this.baseIdx + t.interval) % 12] + (t.quality === "min" ? "m" : "");
    return { token, pct, roman, name };
  }

  async refreshReco(logIt = false) {
    const seq = ++this.recoSeq;
    if (this.isDrum) { this.reco = { source: "none", items: [] }; return; }
    const file = modelFile(this.mode, this.genre);
    if (!file) {
      const items = getNextChords(this.mode, this.history.map((h) => h.roman)).map((c) => {
        const f = chordToFunction(c);
        return { token: c, pct: null, roman: f ? ROMANS[f - 1] : null, name: c };
      });
      this.reco = { source: "nextchord", items };
      if (logIt) this.log(`Next recommended chords: ${items.map((i) => i.token).join(", ")}`);
      return;
    }
    this.reco = { ...this.reco, loading: true, file };
    try {
      const data = await loadModel(file);
      if (seq !== this.recoSeq) return;
      const p = predict(data, this.history.map((h) => h.token));
      const items = p.items.map((it) => this.mapToken(it));
      this.reco = { source: "ai", file, order: p.order, context: p.context, items };
      if (logIt) {
        const txt = items.map((i) => `${i.token} ${i.pct}%${i.roman ? "" : " (fuera)"}`).join(", ");
        this.log(`AI [${file}, orden ${p.order}]: ${txt || "sin datos"}`);
      }
    } catch (err) {
      if (seq !== this.recoSeq) return;
      this.reco = { source: "error", file, error: String(err.message || err), items: [] };
      this.log(`No se pudo cargar models/${file}: ${this.reco.error}`, "sys");
    }
    this.onChange();
  }

  // grado -> intensidad 0..1 para LEDs y barras
  recoLevels() {
    const out = new Map();
    const items = this.reco.items.filter((i) => i.roman);
    if (!items.length) return out;
    if (this.reco.source !== "ai") { items.forEach((i) => out.set(i.roman, 0.75)); return out; }
    const sums = new Map();
    items.forEach((i) => sums.set(i.roman, (sums.get(i.roman) || 0) + i.pct));
    const max = Math.max(...sums.values());
    sums.forEach((v, r) => out.set(r, v / max));
    return out;
  }

  // ---- Modo ritmo (start_rhythm / process_rhythm / stop_rhythm) ----
  setRhythmMode(on) {
    if (on === this.rhythmMode) return;
    Object.keys(this.chordNotes).forEach((r) => this.stopChord(r));
    this.stopRhythm();
    this.rhythmMode = on;
    this.log(`Rhythm mode: ${on ? "ON" : "OFF"}`);
    this.retune();
    this.onChange();
  }

  toggleRhythm() { this.setRhythmMode(!this.rhythmMode); }

  nextPattern() { this.selectPattern(this.rhythmIdx + 1); }

  selectPattern(i, restart = true) {
    this.rhythmIdx = wrap(i, this.patterns.length);
    this.log(`Rhythm pattern: ${this.patterns[this.rhythmIdx].name}`);
    if (restart && this.rhythm) { const c = this.rhythm.chord; this.stopRhythm(); this.startRhythm(c); }
    this.onChange();
  }

  // Tempo en BPM: un paso de duración 1 dura un pulso, time_step = 60 / BPM
  get timeStep() { return 60 / this.bpm; }

  setBpm(bpm) {
    this.bpm = Math.round(Math.max(MIN_BPM, Math.min(MAX_BPM, bpm)));
    this.onChange();
  }

  startRhythm(chord) {
    if (this.rhythm && this.rhythm.chord === chord) return;
    this.stopRhythm();
    const r = { chord, step: 0, note: null, timer: null, gate: null, stepIdx: -1 };
    this.rhythm = r;
    const tick = () => {
      if (this.rhythm !== r) return;
      const pattern = scaleSteps(this.activeSteps(), this.timeStep);
      if (r.step >= pattern.length) r.step = 0;
      const [idx, delay] = pattern[r.step++];
      const notes = this.notesFor(chord);
      r.stepIdx = r.step - 1;
      this.onChange();
      // idx -1 = silencio; una nota que el acorde no tiene (4.ª en una tríada) tampoco suena
      if (idx >= 0 && idx < notes.length) {
        const playing = notes[idx];
        r.note = playing;
        this.sendNoteOn(playing, chord);
        r.gate = setTimeout(() => {
          this.sendNoteOff(playing, chord);
          if (r.note === playing) r.note = null;
          this.onChange();
        }, Math.max(GATE_MIN_S, delay * GATE_FRACTION) * 1000);
      }
      r.timer = setTimeout(tick, Math.max(10, delay * 1000));
    };
    tick();
  }

  stopRhythm() {
    const r = this.rhythm;
    if (!r) return;
    clearTimeout(r.timer);
    clearTimeout(r.gate);
    if (r.note != null) this.sendNoteOff(r.note, r.chord);
    this.rhythm = null;
  }

  activeNotes() { return new Set(this.noteStates.keys()); }
}
