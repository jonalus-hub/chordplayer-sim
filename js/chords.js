// Port de chords.py (firmware fw-2026-04-07): 7 modos de tríadas y DrumMode.
// Los 7 modos "7th" del firmware se han quitado: la séptima se toca con el ampliador 7th.

export const BASE_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const TRIAD_MODES = ["Ionian", "Dorian", "Phrygian", "Lydian", "Mixolydian", "Aeolian", "Locrian"];
export const MODES = [...TRIAD_MODES, "DrumMode"];
export const ROMANS = ["I", "II", "III", "IV", "V", "VI", "VII"];

const MIDI_NOTE_MAP = { C: 60, "C#": 61, D: 62, "D#": 63, E: 64, F: 65, "F#": 66, G: 67, "G#": 68, A: 69, "A#": 70, B: 71 };

export const applyOctave = (note, octave) => note + 12 * octave;

const SHAPES = {
  "Major": [0, 4, 7],
  "Minor": [0, 3, 7],
  "Diminished": [0, 3, 6],
  "Major 7": [0, 4, 7, 11],
  "Minor 7": [0, 3, 7, 10],
  "Dominant 7": [0, 4, 7, 10],
  "Minor 7♭5": [0, 3, 6, 10],
};

export function getChordNotes(base, type) {
  return (SHAPES[type] || []).map((i) => base + i);
}

// [intervalo, tipo] por grado I..VII, igual que CHORD_DATABASE
const DB = {
  "Ionian":         [[0, "Major"], [2, "Minor"], [4, "Minor"], [5, "Major"], [7, "Major"], [9, "Minor"], [11, "Diminished"]],
  "Dorian":         [[0, "Minor"], [2, "Minor"], [3, "Major"], [5, "Major"], [7, "Minor"], [9, "Diminished"], [10, "Major"]],
  "Phrygian":       [[0, "Minor"], [1, "Major"], [3, "Major"], [5, "Minor"], [7, "Diminished"], [8, "Major"], [10, "Minor"]],
  "Lydian":         [[0, "Major"], [2, "Major"], [4, "Minor"], [6, "Diminished"], [7, "Major"], [9, "Minor"], [11, "Minor"]],
  "Mixolydian":     [[0, "Major"], [2, "Minor"], [4, "Diminished"], [5, "Major"], [7, "Minor"], [9, "Minor"], [10, "Major"]],
  "Aeolian":        [[0, "Minor"], [2, "Diminished"], [3, "Major"], [5, "Minor"], [7, "Minor"], [8, "Major"], [10, "Major"]],
  "Locrian":        [[0, "Diminished"], [1, "Major"], [3, "Minor"], [5, "Minor"], [6, "Major"], [8, "Major"], [10, "Minor"]],
};

// DEFAULT_DRUM_NOTES de code.py (GM, canal 10)
export const DRUM_NOTES = { I: 36, II: 38, III: 42, IV: 46, V: 41, VI: 49, VII: 51 };
export const DRUM_NAMES = { I: "Kick", II: "Snare", III: "Hi-Hat", IV: "Open HH", V: "Tom", VI: "Crash", VII: "Ride" };

const MAJOR_TYPES = new Set(["Major", "Major 7", "Dominant 7"]);

// Intervalo, tipo y calidad (mayor/menor) del acorde de un grado
export function chordInfo(mode, roman) {
  const row = DB[mode];
  if (!row) return null;
  const [interval, type] = row[ROMANS.indexOf(roman)];
  return { interval, type, quality: MAJOR_TYPES.has(type) ? "maj" : "min" };
}

export function chordFromDatabase(mode, roman, base) {
  if (mode === "DrumMode") return [DRUM_NOTES[roman]];
  const { interval, type } = chordInfo(mode, roman);
  return getChordNotes(MIDI_NOTE_MAP[base] + interval, type);
}

export function chordType(mode, roman) {
  return mode === "DrumMode" ? "Percusión" : chordInfo(mode, roman).type;
}

// Sufijos de get_chord_name() en code.py: lo que pinta la OLED
const SUFFIX = { "Major": "", "Minor": "m", "Diminished": "°", "Major 7": "M7", "Minor 7": "m7", "Dominant 7": "7", "Minor 7♭5": "m7b5" };

export function getChordName(baseIdx, modeIdx, roman) {
  const mode = MODES[modeIdx];
  if (mode === "DrumMode") return DRUM_NAMES[roman];
  const { interval, type } = chordInfo(mode, roman);
  return BASE_NOTES[(baseIdx + interval) % 12] + SUFFIX[type];
}

export const midiName = (n) => BASE_NOTES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);

// ---------- Ampliadores de acorde (propuesta) ----------
// Escala de cada modo, para las notas diatónicas (7.ª, 6.ª, 9.ª del grado)
const SCALES = {
  Ionian: [0, 2, 4, 5, 7, 9, 11], Dorian: [0, 2, 3, 5, 7, 9, 10], Phrygian: [0, 1, 3, 5, 7, 8, 10],
  Lydian: [0, 2, 4, 6, 7, 9, 11], Mixolydian: [0, 2, 4, 5, 7, 9, 10], Aeolian: [0, 2, 3, 5, 7, 8, 10],
  Locrian: [0, 1, 3, 5, 6, 8, 10],
};

export const MODIFIERS = [
  { id: "7", label: "7th", desc: "séptima del modo" },
  { id: "9", label: "add9", desc: "novena del modo" },
  { id: "6", label: "add6", desc: "sexta del modo" },
  { id: "sus2", label: "sus2", desc: "segunda en lugar de la tercera" },
  { id: "sus4", label: "sus4", desc: "cuarta en lugar de la tercera" },
  { id: "5", label: "5 (red)", desc: "reducido: raíz, quinta y octava, sin tercera" },
  { id: "swap", label: "maj<>min", desc: "cambia mayor ↔ menor" },
  { id: "inv1", label: "inv 1", desc: "primera inversión" },
  { id: "inv2", label: "inv 2", desc: "segunda inversión" },
  { id: "bass", label: "bass", desc: "raíz una octava abajo" },
];
export const modifierById = (id) => MODIFIERS.find((m) => m.id === id);

// Semitonos desde la raíz del grado hasta la nota `k` pasos de escala por encima
function scaleStep(mode, roman, k) {
  const sc = SCALES[mode];
  const d = ROMANS.indexOf(roman);
  return sc[(d + k) % 7] + 12 * Math.floor((d + k) / 7) - sc[d];
}

// Calidad del acorde (de tríada) tras aplicar maj<>min
function triadQuality(info, mods) {
  const base = info.type.startsWith("Major") || info.type === "Dominant 7" ? "maj" : info.type.startsWith("Minor 7♭5") || info.type === "Diminished" ? "dim" : "min";
  if (!mods.includes("swap")) return base;
  return base === "maj" ? "min" : "maj"; // menor y disminuido pasan a mayor
}

// Notas del acorde con los ampliadores pulsados, en el orden: calidad, añadidos, inversiones
export function extendChord(mode, roman, base, mods = []) {
  if (mode === "DrumMode" || !mods.length) return chordFromDatabase(mode, roman, base);
  const info = chordInfo(mode, roman);
  const root = MIDI_NOTE_MAP[base] + info.interval;
  const q = triadQuality(info, mods);
  let third = q === "maj" ? 4 : 3;
  const fifth = q === "dim" ? 6 : 7;
  if (mods.includes("sus2")) third = 2;
  if (mods.includes("sus4")) third = 5;
  let notes = mods.includes("5") ? [root, root + 7, root + 12] : [root, root + third, root + fifth];
  if (mods.includes("7") && !mods.includes("5")) notes.push(root + scaleStep(mode, roman, 6));
  if (mods.includes("6")) notes.push(root + scaleStep(mode, roman, 5));
  if (mods.includes("9")) notes.push(root + 12 + scaleStep(mode, roman, 1));
  if (mods.includes("bass")) notes.push(root - 12);
  notes = [...new Set(notes)].sort((a, b) => a - b);
  for (const [id, n] of [["inv1", 1], ["inv2", 2]]) {
    if (!mods.includes(id)) continue;
    for (let i = 0; i < n; i++) notes.push(notes.shift() + 12);
  }
  return notes;
}

// Nombre del acorde ampliado, p. ej. "Dm7", "Cadd9", "G5", "F/A"
export function extendedName(baseIdx, modeIdx, roman, mods = []) {
  const mode = MODES[modeIdx];
  if (mode === "DrumMode" || !mods.length) return getChordName(baseIdx, modeIdx, roman);
  const info = chordInfo(mode, roman);
  const rootName = BASE_NOTES[(baseIdx + info.interval) % 12];
  if (mods.includes("5")) return rootName + "5" + slash(mode, roman, baseIdx, mods);
  const q = triadQuality(info, mods);
  const sus = mods.includes("sus4") ? "sus4" : mods.includes("sus2") ? "sus2" : "";
  let suffix;
  const has7 = mods.includes("7");
  if (has7) {
    const sev = scaleStep(mode, roman, 6);
    if (sus) suffix = (sev === 11 ? "M7" : "7") + sus;
    else if (q === "maj") suffix = sev === 11 ? "M7" : "7";
    else if (q === "min") suffix = sev === 11 ? "mM7" : "m7";
    else suffix = sev === 9 ? "°7" : "m7b5";
    // Con séptima, la novena se nombra 9 (CM9, Dm9, G9) en lugar de add9
    if (mods.includes("9")) suffix = suffix.replace("7", "9");
  } else {
    suffix = sus || (q === "min" ? "m" : q === "dim" ? "°" : "");
  }
  let name = rootName + suffix;
  if (mods.includes("6")) name += "6";
  if (mods.includes("9") && !has7) name += "add9";
  return name + slash(mode, roman, baseIdx, mods);
}

function slash(mode, roman, baseIdx, mods) {
  if (!mods.includes("inv1") && !mods.includes("inv2")) return "";
  const notes = extendChord(mode, roman, BASE_NOTES[baseIdx], mods);
  return "/" + BASE_NOTES[((notes[0] % 12) + 12) % 12];
}
