// State machine of code.py (fw-2026-04-07), turned from polling into events,
// plus the proposed features of the future device (Markov chain recommendations, genre, LEDs, settings menu,
// editable arpeggios, chord modifiers and the Note button).
import { BASE_NOTES, MODES, ROMANS, chordInfo, applyOctave, DRUM_NOTES, extendChord, extendedName, modifierById } from "./chords.js";
import { getNextChords, chordToFunction } from "./nextchord.js";
import { BUILTIN_PATTERNS, scaleSteps, loadUserPatterns, saveUserPatterns, NOTE_ORDERS, QUANTIZE } from "./rhythm.js";
import { ArpMenu } from "./arpmenu.js";
import { GENRES, modelFile, loadModel, predict, tokenFor, parseToken } from "./ai.js";

const MIDI_VELOCITY = 127;
const DEFAULT_CHANNEL = 0;
const DRUM_CHANNEL = 9;
const MENU_TIMEOUT_MS = 20000; // outside the editor; the editor never closes by itself
const MOD_KEY = "chordplayer.modifiers.v1";
const DEFAULT_MODS = ["7", "9", "5"];

// Other saved settings (proposed): main screen view and Note button mode
const SETTINGS_KEY = "chordplayer.settings.v1";
export const SCREENS = { chords: "Chords", keys: "Keys" };
// gate: each note sounds while Note is held · sustain: notes build up while the chord is held
export const NOTE_MODES = { gate: "Gate", sustain: "Sustain" };



function loadSettings() {
  try {
    const v = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return {
      screen: v.screen in SCREENS ? v.screen : "chords",
      noteMode: v.noteMode in NOTE_MODES ? v.noteMode : "gate",
      noteOrder: v.noteOrder in NOTE_ORDERS ? v.noteOrder : "up",
      quantize: v.quantize in QUANTIZE ? v.quantize : "off",
    };
  } catch {
    return { screen: "chords", noteMode: "gate", noteOrder: "up", quantize: "off" };
  }
}

function loadModAssign() {
  try {
    const v = JSON.parse(localStorage.getItem(MOD_KEY) || "null");
    if (Array.isArray(v) && v.length === 3 && v.every((id) => modifierById(id))) return v;
  } catch { /* no storage */ }
  return [...DEFAULT_MODS];
}
const wrap = (i, n) => ((i % n) + n) % n;
const MIN_OCTAVE = -3, MAX_OCTAVE = 3;
const GATE_MIN_S = 0.01, GATE_FRACTION = 0.5;
const HISTORY = 4;
const MIN_BPM = 40, MAX_BPM = 300, DEFAULT_BPM = 120; // DEFAULT_BPM from code.py
const OVERLAY_MS = 1500;

export class ChordPlayer {
  constructor({ out, onChange, log }) {
    this.out = out;            // { noteOn(note, vel, ch), noteOff(note, vel, ch) }
    this.onChange = onChange;  // repaints the UI
    this.log = log;            // "serial console"
    this.baseIdx = 0;
    this.modeIdx = 0;
    this.octave = 0;
    this.held = new Map();       // degree -> { drum, note, mods, manual } in press order
    this.current = null;         // the one circled on the OLED
    this.noteStates = new Map(); // note -> Set(degree), like note_states
    this.chordNotes = {};        // notes actually sent, per degree
    this.drumOffsets = Object.fromEntries(ROMANS.map((r) => [r, 0]));
    this.drumLabels = {};        // pad -> MIDI number while it is being reassigned
    this.history = [];           // [{ roman, token, name }]
    this.genreIdx = 0;
    this.reco = { source: "none", items: [] };
    this.recoSeq = 0;
    this.overlay = null;         // { text, until }
    this.rhythmMode = false;
    this.rhythmIdx = 0;
    this.bpm = DEFAULT_BPM;
    this.rhythm = null;
    // Arpeggio patterns: the firmware's + the ones saved by the user
    this.patterns = [...BUILTIN_PATTERNS.map((p) => ({ ...p, steps: p.steps.map((s) => [...s]) })), ...loadUserPatterns()];
    this.showLeds = true;
    this.showBars = true;
    // Modifiers: 3 buttons under the screen, held before pressing the chord
    this.modHeld = [false, false, false];
    // Note button (proposed): held before the chord, the chord plays note by note
    this.noteHeld = false;
    this.noteArp = null;         // { chord, mods, idx, playing, sounding } while playing note by note
    this.modAssign = loadModAssign();
    const settings = loadSettings();
    this.screen = settings.screen;        // "chords" (names in a zigzag) or "keys" (keyboard)
    this.noteMode = settings.noteMode;    // "gate" or "sustain" (Note button)
    this.noteOrder = settings.noteOrder;  // "up", "down" or "random" (Note button)
    this.quantize = settings.quantize;    // "off" or "pattern" (arpeggio)
    this.menu = null;            // ArpMenu while it is open
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

  // Chord name with the modifiers it was pressed with
  chordName(roman) {
    return extendedName(this.baseIdx, this.modeIdx, roman, this.held.get(roman)?.mods ?? []);
  }

  // ---- Modifiers ----
  activeMods() {
    return [...new Set(this.modAssign.filter((_, i) => this.modHeld[i]))];
  }

  // In the arpeggio editor, Mod 1–3 and Note are its Add / Del / Save / Back soft keys
  softKeys() { return this.menu?.level === "edit"; }

  pressMod(i) {
    if (this.softKeys()) { this.menu.softKey(i, true); this.touchMenu(); this.onChange(); return; }
    if (this.modHeld[i]) return;
    this.modHeld[i] = true;
    this.log(`Modifier ${i + 1} (${modifierById(this.modAssign[i]).label}) held`);
    this.onChange();
  }

  // ---- Note button (proposed) ----
  pressNote() {
    if (this.softKeys()) { this.menu.softKey(3, true); this.touchMenu(); this.onChange(); return; }
    if (this.noteHeld) return;
    this.noteHeld = true;
    const a = this.noteArp;
    if (a && !this.isDrum) {
      // Next note of the chord (after the last one it goes back to the first)
      if (this.noteMode === "gate") this.noteArpStop();
      a.idx = this.nextNoteIdx(a.idx, this.notesFor(a.chord, a.mods).length);
      this.noteArpPlay();
    } else if (!this.isDrum) {
      // Note with a chord already sounding: the chord keeps going and its notes are played
      // again one by one on top, starting from the first
      const full = this.fullChords();
      const chord = full.includes(this.current) ? this.current : full.at(-1);
      if (chord) {
        const mods = this.held.get(chord).mods;
        this.noteArp = { chord, mods, idx: this.firstNoteIdx(this.notesFor(chord, mods).length), playing: null, sounding: new Set() };
        this.noteArpPlay();
        this.log(`Chord ${chord}: Note plays its notes one by one on top`);
      }
    }
    this.onChange();
  }

  releaseNote() {
    if (this.menu?.edit) this.menu.softKey(3, false);
    if (!this.noteHeld) { this.onChange(); return; }
    this.noteHeld = false;
    // Gate: the note stops when Note is released. Sustain: it lasts while the chord key is held
    if (this.noteMode === "gate") this.noteArpStop();
    this.onChange();
  }

  noteArpPlay() {
    const a = this.noteArp;
    const notes = this.notesFor(a.chord, a.mods);
    a.idx %= notes.length;
    const n = notes[a.idx];
    const id = `${a.chord}:note`;
    // In Sustain, coming back to a note that is already sounding replays it
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

  // Stops every note played with Note (in Sustain they build up)
  noteArpStopAll() {
    const a = this.noteArp;
    if (!a) return;
    a.sounding.forEach((n) => this.sendNoteOff(n, `${a.chord}:note`));
    a.sounding.clear();
    a.playing = null;
  }

  releaseMod(i) {
    if (this.menu?.edit) this.menu.softKey(i, false);
    if (!this.modHeld[i]) { this.onChange(); return; }
    this.modHeld[i] = false;
    this.onChange();
  }

  saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ screen: this.screen, noteMode: this.noteMode, noteOrder: this.noteOrder, quantize: this.quantize })); } catch { /* this session only */ }
  }

  setScreen(screen) {
    this.screen = screen in SCREENS ? screen : "chords";
    this.saveSettings();
    this.log(`Screen set to ${SCREENS[this.screen]}`);
    this.onChange();
  }

  setQuantize(q) {
    this.quantize = q in QUANTIZE ? q : "off";
    this.saveSettings();
    this.log(`Arpeggio quantize set to ${QUANTIZE[this.quantize]}`);
    this.onChange();
  }

  get quantized() { return this.quantize === "pattern"; }

  setNoteOrder(order) {
    this.noteOrder = order in NOTE_ORDERS ? order : "up";
    this.saveSettings();
    this.log(`Note order set to ${NOTE_ORDERS[this.noteOrder]}`);
    this.onChange();
  }

  // First note Note plays: the lowest (Up), the highest (Down) or any (Random)
  firstNoteIdx(n) {
    if (this.noteOrder === "down") return n - 1;
    if (this.noteOrder === "random") return Math.floor(Math.random() * n);
    return 0;
  }

  // Next note: one up or one down (wrapping), or a random one that is not the current note
  nextNoteIdx(idx, n) {
    if (this.noteOrder === "down") return (idx - 1 + n) % n;
    if (this.noteOrder === "random") {
      if (n < 2) return 0;
      const r = Math.floor(Math.random() * (n - 1));
      return r >= idx ? r + 1 : r;
    }
    return (idx + 1) % n;
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
    try { localStorage.setItem(MOD_KEY, JSON.stringify(this.modAssign)); } catch { /* this session only */ }
    this.log(`Modifier ${i + 1} set to ${modifierById(id).label}`);
    this.onChange();
  }

  drumNote(roman) {
    return Math.max(0, Math.min(127, DRUM_NOTES[roman] + this.drumOffsets[roman]));
  }

  heldChords() { return [...this.held].filter(([, e]) => !e.drum).map(([r]) => r); }
  // Chords sounding in full (not the ones played note by note with Note)
  fullChords() { return [...this.held].filter(([, e]) => !e.drum && !e.manual).map(([r]) => r); }
  heldPads() { return [...this.held].filter(([, e]) => e.drum).map(([r]) => r); }

  // ---- Reference-counted MIDI (send_note_on / send_note_off) ----
  // restrike: sends Note On again even if the note is already sounding (Note on top of a chord)
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

  // After turning an encoder: stop what is sounding and replay what is still held
  retune() {
    Object.keys(this.chordNotes).forEach((r) => this.stopChord(r));
    // Note by note: if Note is still held, replay the same position with the new notes
    if (this.noteArp) {
      this.noteArpStopAll();
      if (this.noteMode === "gate" && this.noteHeld && !this.isDrum && this.held.has(this.noteArp.chord)) this.noteArpPlay();
    }
    const chords = this.fullChords();
    // Quantized: the pattern keeps its place in the cycle and picks up the new notes
    if (this.rhythm && this.quantized && this.rhythmMode && !this.isDrum) return;
    const was = this.rhythm?.chord;
    this.stopRhythm();
    if (this.isDrum || !chords.length) return;
    if (this.rhythmMode) this.startRhythm(chords.includes(was) ? was : chords.at(-1));
    else chords.forEach((r) => this.playChord(r));
  }

  // ---- Chord keys (polyphonic, like handle_chord_buttons) ----
  press(roman) {
    if (this.held.has(roman)) return;
    if (this.isDrum) {
      const note = this.drumNote(roman);
      this.out.noteOn(note, MIDI_VELOCITY, DRUM_CHANNEL);
      this.held.set(roman, { drum: true, note });
    } else {
      // Any chord key ends the previous chord played note by note
      if (this.noteArp) { this.noteArpStopAll(); this.noteArp = null; }
      // Modifiers only count if they were already held when the key was pressed
      const mods = this.activeMods();
      const manual = this.noteHeld;
      this.held.set(roman, { drum: false, mods, manual });
      this.addHistory(roman, mods);
      if (mods.length) this.log(`Chord ${roman} + ${mods.map((m) => modifierById(m).label).join(" + ")}: ${this.chordName(roman)}`);
      if (manual) {
        // With Note held only the first note sounds; the rest, one per press of Note
        this.noteArp = { chord: roman, mods, idx: this.firstNoteIdx(this.notesFor(roman, mods).length), playing: null, sounding: new Set() };
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
      // Releasing the chord key stops every note played with Note (in Gate and in Sustain)
      this.noteArpStopAll();
      this.noteArp = null;
    }
    // Full chord (with or without Note notes on top): stop it, or move the arpeggio to another one
    if (!e.drum && !e.manual) {
      if (this.rhythmMode) {
        const chords = this.fullChords();
        const r = this.rhythm;
        if (r && this.quantized) {
          // Quantized: nothing is cut. A queued chord that is released is dropped; with every key
          // released the pattern plays to its end and then stops (unless a chord comes in time)
          if (r.next === roman) r.next = null;
          if (!chords.length) { r.next = null; r.ending = true; }
          else if (r.chord === roman && !r.next) this.startRhythm(chords.at(-1));
        } else if (!chords.length) this.stopRhythm();
        else if (r && r.chord === roman) this.startRhythm(chords.at(-1));
      } else {
        this.stopChord(roman);
      }
    }
    if (this.current === roman) this.current = [...this.held.keys()].at(-1) ?? null;
    this.onChange();
  }

  releaseAll() { [...this.held.keys()].forEach((r) => this.release(r)); }

  // ---- Encoders (KY-040: turn = ±1 detent, press = SW) ----
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
        // DrumMode: with a pad held, the octave encoder changes its note
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

  // Proposed: short press on Mode = next genre; with the menu open, press = select
  push(enc) {
    if (this.menu) { this.menu.press(); this.touchMenu(); this.onChange(); return; }
    if (enc === "mode") {
      this.setGenre((this.genreIdx + 1) % GENRES.length);
    } else {
      this.log(`Encoder ${enc}: SW has no function assigned`, "prompt");
    }
  }

  // Proposed: holding any encoder for 1 s opens or closes the menu
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

  // ---- Settings menu (proposed, see arpmenu.js) ----
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

  // The list closes by itself after 20 s untouched; the editor does not
  touchMenu() {
    clearTimeout(this.menuTimer);
    if (this.menu && this.menu.level !== "edit") this.menuTimer = setTimeout(() => this.closeMenu(), MENU_TIMEOUT_MS);
  }

  menuView() { return this.menu ? this.menu.view() : null; }

  // Steps of the arpeggio that sounds (the editor's if it is open)
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

  // ---- History and recommendations ----
  addHistory(roman, mods = []) {
    const info = chordInfo(this.mode, roman);
    // With maj<>min the sounding chord changes quality, and the model sees it that way
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

  // Maps a model symbol to the key that plays it in the current mode (or null if none)
  mapToken({ token, pct }) {
    if (token === "*E*") return { token, pct, end: true, roman: null, name: "fin" };
    const t = parseToken(token);
    if (!t) return { token, pct, roman: null, name: token };
    const roman = ROMANS.find((r) => {
      const i = chordInfo(this.mode, r);
      return i.interval % 12 === t.interval && i.quality === t.quality;
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
        const txt = items.map((i) => `${i.token} ${i.pct}%${i.roman ? "" : " (not in mode)"}`).join(", ");
        this.log(`Markov chains [${file}, order ${p.order}]: ${txt || "no data"}`);
      }
    } catch (err) {
      if (seq !== this.recoSeq) return;
      this.reco = { source: "error", file, error: String(err.message || err), items: [] };
      this.log(`Could not load models/${file}: ${this.reco.error}`, "sys");
    }
    this.onChange();
  }

  // degree -> intensity 0..1 for LEDs and bars
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

  // ---- Rhythm mode (start_rhythm / process_rhythm / stop_rhythm) ----
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
    // Quantized, the new pattern starts on the next cycle (tick() picks it up)
    if (restart && this.rhythm && !this.quantized) { const c = this.rhythm.chord; this.stopRhythm(); this.startRhythm(c); }
    this.onChange();
  }

  // Tempo in BPM: a step of length 1 lasts one beat, time_step = 60 / BPM
  get timeStep() { return 60 / this.bpm; }

  setBpm(bpm) {
    this.bpm = Math.round(Math.max(MIN_BPM, Math.min(MAX_BPM, bpm)));
    this.onChange();
  }

  startRhythm(chord) {
    const old = this.rhythm;
    const mods = this.held.get(chord)?.mods ?? [];
    if (old && old.chord === chord) { old.next = null; old.ending = false; return; }
    // Quantized: queue the chord; it starts when the running pattern ends
    if (old && this.quantized) {
      old.next = chord;
      old.nextMods = mods;
      old.ending = false;
      this.onChange();
      return;
    }
    this.stopRhythm();
    const r = { chord, mods, step: 0, steps: null, note: null, owner: null, timer: null, gate: null, stepIdx: -1, next: null, nextMods: null, ending: false };
    this.rhythm = r;
    const tick = () => {
      if (this.rhythm !== r) return;
      // Not quantized: steps are read live. Quantized: they are fixed for the whole cycle
      if (!r.steps || !this.quantized) r.steps = this.activeSteps();
      if (r.step >= r.steps.length) {
        // A full pattern has played
        r.step = 0;
        if (this.quantized) {
          if (r.next) {
            r.chord = r.next; r.mods = r.nextMods; r.next = null; r.nextMods = null;
            this.current = this.held.has(r.chord) ? r.chord : this.current;
          } else if (r.ending) {
            this.rhythm = null;
            this.onChange();
            return;
          }
          r.steps = this.activeSteps();
        }
      }
      const [idx, mult] = r.steps[r.step++];
      const delay = mult * this.timeStep;
      const notes = this.notesFor(r.chord, r.mods);
      r.stepIdx = r.step - 1;
      this.onChange();
      // idx -1 = rest; a note the chord does not have (the 4th in a triad) is silent too
      if (idx >= 0 && idx < notes.length) {
        const playing = notes[idx];
        const owner = r.chord;
        r.note = playing;
        r.owner = owner;
        this.sendNoteOn(playing, owner);
        r.gate = setTimeout(() => {
          this.sendNoteOff(playing, owner);
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
    if (r.note != null) this.sendNoteOff(r.note, r.owner);
    this.rhythm = null;
  }

  activeNotes() { return new Set(this.noteStates.keys()); }
}
