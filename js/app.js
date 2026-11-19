import { MODES, ROMANS, BASE_NOTES, getChordName, chordType, midiName, DRUM_NAMES, MODIFIERS, modifierById } from "./chords.js";
import { scaleSteps, noteLabel, DURATION_LABELS } from "./rhythm.js";
import { GENRES } from "./ai.js";
import { Oled } from "./display.js";
import { Synth, TIMBRES } from "./audio.js";
import { MidiOut } from "./midi.js";
import { ChordPlayer } from "./engine.js";
import { buildDevice } from "./device.js";

const $ = (id) => document.getElementById(id);
const synth = new Synth();

// ---------- Serial console ----------
const consoleEl = $("console");
let logMidi = false;
function log(msg, cls = "") {
  const line = document.createElement("div");
  if (cls) line.className = cls;
  line.textContent = msg;
  consoleEl.append(line);
  while (consoleEl.childElementCount > 300) consoleEl.firstChild.remove();
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

// ---------- Output: synthesizer + Web MIDI ----------
const midi = new MidiOut(renderMidi);
const out = {
  noteOn(note, vel, ch) {
    if (ch === 9) synth.drum(note, vel); else synth.noteOn(note, vel);
    midi.noteOn(note, vel, ch);
    if (logMidi) log(`NoteOn  ch=${ch + 1} note=${note} (${midiName(note)}) vel=${vel}`, "midi");
  },
  noteOff(note, vel, ch) {
    if (ch !== 9) synth.noteOff(note);
    midi.noteOff(note, vel, ch);
    if (logMidi) log(`NoteOff ch=${ch + 1} note=${note} (${midiName(note)})`, "midi");
  },
};

let scheduled = false;
const player = new ChordPlayer({
  out, log,
  onChange: () => { if (!scheduled) { scheduled = true; requestAnimationFrame(() => { scheduled = false; render(); }); } },
});

// ---------- Device ----------
const dev = buildDevice($("device-root"), {
  onKeyDown: (r) => { synth.ensure(); player.press(r); },
  onKeyUp: (r) => player.release(r),
  onTurn: (enc, d) => { synth.ensure(); player.turn(enc, d); },
  onPush: (enc) => { synth.ensure(); player.push(enc); },
  onLongPress: (enc) => { synth.ensure(); player.longPress(enc); },
  onModDown: (i) => { synth.ensure(); player.pressMod(i); },
  onModUp: (i) => player.releaseMod(i),
  onNoteDown: () => { synth.ensure(); player.pressNote(); },
  onNoteUp: () => player.releaseNote(),
});
const oled = new Oled(dev.canvas);

// ---------- Computer keyboard ----------
const KEYS = ["a", "s", "d", "f", "g", "h", "j"];
const KEYMAP = {};
KEYS.forEach((k, i) => { KEYMAP[k] = ROMANS[i]; KEYMAP[String(i + 1)] = ROMANS[i]; });
const ENCKEYS = { z: ["base", -1], x: ["base", 1], c: ["mode", -1], v: ["mode", 1], b: ["octave", -1], n: ["octave", 1] };
const MODKEYS = { q: 0, w: 1, e: 2 }; // modifiers: hold, then play the chord key
const NOTE_KEY = "r";                 // Note: hold while playing the chord; each press plays the next note
const typing = (e) => e.target.closest("select, input[type=range]");
window.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (KEYMAP[k] && !e.target.closest("select")) {
    e.preventDefault();
    if (!e.repeat) { synth.ensure(); player.press(KEYMAP[k]); }
    return;
  }
  if (k === NOTE_KEY && !typing(e)) { e.preventDefault(); if (!e.repeat) { synth.ensure(); player.pressNote(); } return; }
  if (k in MODKEYS && !typing(e)) { e.preventDefault(); if (!e.repeat) { synth.ensure(); player.pressMod(MODKEYS[k]); } return; }
  if (k === "m" && !typing(e)) { e.preventDefault(); if (!e.repeat) { synth.ensure(); dev.encoders.mode.holdStart(); } return; }
  if (e.repeat || typing(e)) return;
  synth.ensure();
  if (ENCKEYS[k]) { const [enc, d] = ENCKEYS[k]; dev.encoders[enc].spin(d); player.turn(enc, d); }
  else if (k === "k") player.toggleRhythm();
  else if (k === "l") player.nextPattern();
  else if (k === "," || k === ".") player.setBpm(player.bpm + (k === "." ? 5 : -5));
});
window.addEventListener("keyup", (e) => {
  const k = e.key.toLowerCase();
  if (k === "m") { dev.encoders.mode.holdEnd(); return; }
  if (k in MODKEYS) { player.releaseMod(MODKEYS[k]); return; }
  if (k === NOTE_KEY) { player.releaseNote(); return; }
  const r = KEYMAP[k];
  if (r) player.release(r);
});
window.addEventListener("blur", () => {
  player.releaseAll();
  [0, 1, 2].forEach((i) => player.releaseMod(i));
  player.releaseNote();
  Object.values(dev.encoders).forEach((knob) => knob.holdCancel());
});

// ---------- Panel ----------
for (const [id, t] of Object.entries(TIMBRES)) $("timbre").append(new Option(t.label, id));
GENRES.forEach((g, i) => $("genre").append(new Option(g.replace("_", " "), String(i))));
$("genre").addEventListener("change", (e) => player.setGenre(+e.target.value));
$("timbre").addEventListener("change", (e) => { synth.allOff(); synth.timbre = e.target.value; });
$("volume").addEventListener("input", (e) => synth.setVolume(+e.target.value));
$("rhythm-on").addEventListener("change", (e) => { synth.ensure(); player.setRhythmMode(e.target.checked); });
$("rhythm-next").addEventListener("click", () => player.nextPattern());
$("pattern").addEventListener("change", (e) => player.selectPattern(+e.target.value));
$("pattern-delete").addEventListener("click", () => player.deletePattern(player.rhythmIdx));
$("bpm").addEventListener("input", (e) => player.setBpm(+e.target.value));
for (let i = 0; i < 3; i++) {
  const sel = $(`mod-${i}`);
  MODIFIERS.forEach((m) => sel.append(new Option(`${m.label} · ${m.desc}`, m.id)));
  sel.addEventListener("change", (e) => player.setModAssign(i, e.target.value));
}
$("history-clear").addEventListener("click", () => player.clearHistory());
$("screen").addEventListener("change", (e) => player.setScreen(e.target.value));
$("note-mode").addEventListener("change", (e) => player.setNoteMode(e.target.value));
$("reco-leds").addEventListener("change", (e) => player.setHints(e.target.checked, player.showBars));
$("reco-oled").addEventListener("change", (e) => player.setHints(player.showLeds, e.target.checked));
$("log-midi").addEventListener("change", (e) => { logMidi = e.target.checked; });
$("midi-connect").addEventListener("click", () => midi.connect());
$("midi-port").addEventListener("change", (e) => { midi.select(e.target.value); renderMidi(); });

function renderMidi() {
  const state = $("midi-state"), sel = $("midi-port");
  const labels = { off: "disconnected", unsupported: "not available here", denied: "permission denied", ready: "ready" };
  if (midi.status === "ready") {
    const outs = midi.outputs();
    const prev = sel.value;
    sel.replaceChildren(new Option("— choose a port —", ""), ...outs.map((o) => new Option(o.name, o.id)));
    sel.value = outs.some((o) => o.id === prev) ? prev : "";
    sel.hidden = false;
    $("midi-connect").hidden = true;
    state.textContent = midi.port ? "sending" : outs.length ? "choose a port" : "no ports";
    state.className = "chip " + (midi.port ? "ok" : "");
  } else {
    state.textContent = labels[midi.status];
    state.className = "chip " + (midi.status === "off" ? "" : "warn");
  }
}

// ---------- Piano ----------
const LOW = 24, HIGH = 107;
const pianoEl = $("piano");
const keyEls = {};
const isBlack = (n) => [1, 3, 6, 8, 10].includes(n % 12);
(function buildPiano() {
  const whites = [];
  for (let n = LOW; n <= HIGH; n++) if (!isBlack(n)) whites.push(n);
  const w = 100 / whites.length;
  whites.forEach((n) => {
    const el = document.createElement("div");
    el.className = "w";
    if (n % 12 === 0) el.innerHTML = `<small>C${n / 12 - 1}</small>`;
    pianoEl.append(el);
    keyEls[n] = el;
  });
  for (let n = LOW; n <= HIGH; n++) {
    if (!isBlack(n)) continue;
    const el = document.createElement("div");
    el.className = "b";
    const left = whites.indexOf(n - 1);
    el.style.left = `calc(${(left + 1) * w}% - ${w * 0.3}%)`;
    el.style.width = `${w * 0.6}%`;
    pianoEl.append(el);
    keyEls[n] = el;
  }
})();

// ---------- Recommendations ----------
const GENRE_LABEL = (g) => (g === "all" ? "all genres" : g.replace("_", " "));
function renderReco(p) {
  const r = p.reco;
  const src = $("reco-source");
  if (p.isDrum) { src.textContent = "DrumMode"; src.className = "chip"; }
  else if (r.source === "ai") { src.textContent = `AI · ${r.file} · order ${r.order || "—"}`; src.className = "chip ok"; }
  else if (r.source === "nextchord") { src.textContent = "nextchord.py"; src.className = "chip"; }
  else if (r.source === "error") { src.textContent = "model not available"; src.className = "chip warn"; }
  else if (r.loading) { src.textContent = "loading…"; src.className = "chip"; }

  $("genre").value = String(p.genreIdx);
  $("genre").disabled = r.source === "nextchord" || p.isDrum;

  $("history").replaceChildren(...(p.history.length
    ? p.history.map((h) => Object.assign(document.createElement("span"), { className: "hchip", textContent: `${h.name} · ${h.token}` }))
    : [Object.assign(document.createElement("span"), { className: "muted", textContent: "empty: the AI suggests how to start" })]));

  const list = $("predictions");
  const items = p.isDrum ? [] : r.items;
  const max = Math.max(1, ...items.map((i) => i.pct || 0));
  list.replaceChildren(...items.map((i) => {
    const li = document.createElement("li");
    li.className = i.roman ? "" : "off";
    const where = i.end ? "end of the song" : i.roman ? `key ${i.roman}` : `not in ${BASE_NOTES[p.baseIdx]} ${p.mode}`;
    const pct = i.pct == null ? "" : `${i.pct}%`;
    li.innerHTML = `<span class="tok"></span><span class="nm"></span><span class="bar"><i></i></span><span class="pct"></span><span class="where"></span>`;
    li.querySelector(".tok").textContent = i.token;
    li.querySelector(".nm").textContent = i.end ? "" : i.name;
    li.querySelector(".bar i").style.width = i.pct == null ? "60%" : `${(i.pct / max) * 100}%`;
    li.querySelector(".pct").textContent = pct;
    li.querySelector(".where").textContent = where;
    return li;
  }));

  const hint = $("reco-hint");
  if (p.isDrum) hint.textContent = "No recommendations in DrumMode.";
  else if (r.source === "nextchord") hint.textContent = `${p.mode} has no Chord_AI model (it is not in the dataset), so the fixed progressions from nextchord.py are used.`;
  else if (r.source === "ai") hint.textContent = `Markov chain trained on Chordonomicon (${GENRE_LABEL(p.genre)}). Context: ${r.context.join(" → ")}. On the device, pressing the Mode encoder changes the genre.`;
  else if (r.source === "error") hint.textContent = `Could not load models/${r.file}.gz (${r.error}).`;
  else hint.textContent = "";
}

// With a modifier or Note held, the OLED header shows which one in place of the mode (proposed)
function modOverlay(p) {
  const parts = p.activeMods().map((m) => modifierById(m).label);
  if (p.noteHeld) parts.push("Note");
  return parts.length && !p.isDrum ? `+${parts.join("+")}` : null;
}

// ---------- Render ----------
let lit = new Set();
function render() {
  const p = player;
  const levels = p.isDrum ? new Map() : p.recoLevels();
  const showOled = p.showBars;
  const showLeds = p.showLeds;
  $("reco-oled").checked = showOled;
  $("reco-leds").checked = showLeds;
  oled.render({
    baseIdx: p.baseIdx, modeIdx: p.modeIdx, octave: p.octave, current: p.current,
    overlay: p.overlay?.text, modText: modOverlay(p), labels: p.drumLabels, bars: showOled ? levels : new Map(),
    menu: p.menuView(),
    screen: p.screen,
    notes: p.activeNotes(),
    keysLabel: p.heldChords().map((r) => p.chordName(r)).join(" + "),
  });
  $("screen").value = p.screen;
  $("note-mode").value = p.noteMode;

  for (const r of ROMANS) {
    const k = dev.keys[r];
    k.classList.toggle("down", p.held.has(r));
    k.style.setProperty("--glow", showLeds ? (levels.get(r) || 0).toFixed(2) : "0");
    k.title = `${r} · ${getChordName(p.baseIdx, p.modeIdx, r)}`;
  }
  dev.encoders.base.setAttribute("aria-valuetext", BASE_NOTES[p.baseIdx]);
  dev.encoders.mode.setAttribute("aria-valuetext", p.mode);
  dev.encoders.octave.setAttribute("aria-valuetext", String(p.octave));
  dev.noteBtn.classList.toggle("down", p.noteHeld);
  dev.mods.forEach((btn, i) => {
    btn.classList.toggle("down", p.modHeld[i]);
    btn.title = `Modifier ${i + 1}: ${modifierById(p.modAssign[i]).label} (${modifierById(p.modAssign[i]).desc})`;
    const sel = $(`mod-${i}`);
    if (sel.value !== p.modAssign[i]) sel.value = p.modAssign[i];
  });

  // What is sounding
  const chords = p.heldChords();
  if (p.isDrum && p.current) {
    $("now-chord").textContent = DRUM_NAMES[p.current];
    $("now-meta").textContent = `Pad ${p.current} · channel 10 · GM note ${p.drumNote(p.current)}`;
    $("now-notes").textContent = p.heldPads().map((r) => `${r}: ${p.drumNote(r)}`).join("  ") || " ";
  } else if (chords.length) {
    $("now-chord").textContent = chords.map((r) => p.chordName(r)).join(" + ");
    const cur = chords.includes(p.current) ? p.current : chords.at(-1);
    $("now-meta").textContent = `Degree ${chords.join(" + ")} of ${BASE_NOTES[p.baseIdx]} ${p.mode} · ${chordType(p.mode, cur)}${p.rhythmMode ? ` · arpeggiated (${p.patterns[p.rhythmIdx].name})` : ""}`;
    const notes = [...p.activeNotes()].sort((a, b) => a - b);
    $("now-notes").textContent = notes.length ? notes.map((n) => `${midiName(n)} (${n})`).join("  ") : " ";
  } else {
    $("now-chord").textContent = "—";
    $("now-meta").textContent = `${BASE_NOTES[p.baseIdx]} ${p.mode} · octave ${p.octave > 0 ? "+" : ""}${p.octave}`;
    $("now-notes").textContent = " ";
  }

  const active = p.activeNotes();
  for (const n of lit) if (!active.has(n)) keyEls[n]?.classList.remove("on");
  for (const n of active) keyEls[n]?.classList.add("on");
  lit = active;

  renderReco(p);

  // Arpeggio
  const sel = $("pattern");
  const sig = p.patterns.map((x) => x.name).join("|");
  if (sel.dataset.sig !== sig) {
    sel.replaceChildren(...p.patterns.map((x, i) => new Option(x.builtin ? `${x.name} (firmware)` : x.name, String(i))));
    sel.dataset.sig = sig;
  }
  sel.value = String(p.rhythmIdx);
  $("pattern-delete").hidden = p.patterns[p.rhythmIdx].builtin;
  const raw = p.activeSteps();
  const stepsEl = $("rhythm-steps");
  if (stepsEl.childElementCount !== raw.length) stepsEl.replaceChildren(...raw.map(() => document.createElement("span")));
  [...stepsEl.children].forEach((s, i) => {
    const [note, mult] = raw[i];
    s.textContent = noteLabel(note);
    s.title = `Step ${i + 1}: note ${noteLabel(note)}, length ${DURATION_LABELS[mult] ?? mult}`;
    s.classList.toggle("hit", !!(p.rhythm && p.rhythm.stepIdx === i));
    s.classList.toggle("rest", note < 0);
    s.style.width = `${mult * 28}px`;
  });
  $("bpm").value = String(p.bpm);
  $("bpm-val").textContent = `${p.bpm} BPM`;
  $("rhythm-on").checked = p.rhythmMode;

  const a = $("audio-state");
  const running = synth.ctx && synth.ctx.state === "running";
  a.textContent = running ? "audio on" : "audio waiting";
  a.className = "chip " + (running ? "ok" : "");
}

player.boot();
renderMidi();
document.addEventListener("pointerdown", () => { synth.ensure(); setTimeout(render, 50); }, { once: true });
