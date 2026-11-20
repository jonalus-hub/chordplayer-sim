// Port of chords.py (firmware fw-2026-04-07): the 7 triad modes and DrumMode, plus (proposed)
// harmonic minor, melodic minor, Phrygian dominant, the two pentatonics and blues.
// The firmware's 7 "7th" modes have been removed: the seventh is played with the 7th modifier.

export const BASE_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const TRIAD_MODES = ["Ionian", "Dorian", "Phrygian", "Lydian", "Mixolydian", "Aeolian", "Locrian"];
// Short names so they fit centred in the OLED header
const EXTRA_SCALES = ["Harmonic minor", "Melodic minor", "Phrygian dom", "Maj pentatonic", "Min pentatonic", "Blues"];
export const MODES = [...TRIAD_MODES, ...EXTRA_SCALES, "DrumMode"];
export const ROMANS = ["I", "II", "III", "IV", "V", "VI", "VII"];

const MIDI_NOTE_MAP = { C: 60, "C#": 61, D: 62, "D#": 63, E: 64, F: 65, "F#": 66, G: 67, "G#": 68, A: 69, "A#": 70, B: 71 };

export const applyOctave = (note, octave) => note + 12 * octave;

const SHAPES = {
  "Major": [0, 4, 7],
  "Minor": [0, 3, 7],
  "Diminished": [0, 3, 6],
  "Augmented": [0, 4, 8],
  "Major 7": [0, 4, 7, 11],
  "Minor 7": [0, 3, 7, 10],
  "Dominant 7": [0, 4, 7, 10],
  "Minor 7♭5": [0, 3, 6, 10],
};

export function getChordNotes(base, type) {
  return (SHAPES[type] || []).map((i) => base + i);
}

// [interval, type] per degree I..VII, as in CHORD_DATABASE
const DB = {
  "Ionian":         [[0, "Major"], [2, "Minor"], [4, "Minor"], [5, "Major"], [7, "Major"], [9, "Minor"], [11, "Diminished"]],
  "Dorian":         [[0, "Minor"], [2, "Minor"], [3, "Major"], [5, "Major"], [7, "Minor"], [9, "Diminished"], [10, "Major"]],
  "Phrygian":       [[0, "Minor"], [1, "Major"], [3, "Major"], [5, "Minor"], [7, "Diminished"], [8, "Major"], [10, "Minor"]],
  "Lydian":         [[0, "Major"], [2, "Major"], [4, "Minor"], [6, "Diminished"], [7, "Major"], [9, "Minor"], [11, "Minor"]],
  "Mixolydian":     [[0, "Major"], [2, "Minor"], [4, "Diminished"], [5, "Major"], [7, "Minor"], [9, "Minor"], [10, "Major"]],
  "Aeolian":        [[0, "Minor"], [2, "Diminished"], [3, "Major"], [5, "Minor"], [7, "Minor"], [8, "Major"], [10, "Major"]],
  "Locrian":        [[0, "Diminished"], [1, "Major"], [3, "Minor"], [5, "Minor"], [6, "Major"], [8, "Major"], [10, "Minor"]],
  // Proposed: other 7-note scales, triads stacked in thirds within the scale
  "Harmonic minor": [[0, "Minor"], [2, "Diminished"], [3, "Augmented"], [5, "Minor"], [7, "Major"], [8, "Major"], [11, "Diminished"]],
  "Melodic minor":  [[0, "Minor"], [2, "Minor"], [3, "Augmented"], [5, "Major"], [7, "Major"], [9, "Diminished"], [11, "Diminished"]],
  "Phrygian dom":   [[0, "Major"], [1, "Major"], [4, "Diminished"], [5, "Minor"], [7, "Diminished"], [8, "Augmented"], [10, "Minor"]],
  // Proposed: 5- and 6-note scales. Keys I–V (I–VI for blues) play a chord on each scale note,
  // with its quality from the parent scale; the remaining keys repeat the first ones an octave up.
  "Maj pentatonic": [[0, "Major"], [2, "Minor"], [4, "Minor"], [7, "Major"], [9, "Minor"], [12, "Major"], [14, "Minor"]],
  "Min pentatonic": [[0, "Minor"], [3, "Major"], [5, "Minor"], [7, "Minor"], [10, "Major"], [12, "Minor"], [15, "Major"]],
  // Blues: I7, bIII, IV7, #IV°, V7, bVII, and I7 an octave up (dominant sevenths sound like blues)
  "Blues":          [[0, "Dominant 7"], [3, "Major"], [5, "Dominant 7"], [6, "Diminished"], [7, "Dominant 7"], [10, "Major"], [12, "Dominant 7"]],
};

// DEFAULT_DRUM_NOTES from code.py (GM, channel 10)
export const DRUM_NOTES = { I: 36, II: 38, III: 42, IV: 46, V: 41, VI: 49, VII: 51 };
export const DRUM_NAMES = { I: "Kick", II: "Snare", III: "Hi-Hat", IV: "Open HH", V: "Tom", VI: "Crash", VII: "Ride" };

const MAJOR_TYPES = new Set(["Major", "Major 7", "Dominant 7", "Augmented"]);
// Types that already carry a seventh, and how far above the root it is
const SEVENTH_OF_TYPE = { "Major 7": 11, "Minor 7": 10, "Dominant 7": 10, "Minor 7♭5": 10 };

// Interval, type and quality (major/minor) of a degree's chord
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
  return mode === "DrumMode" ? "Percussion" : chordInfo(mode, roman).type;
}

// Suffixes from get_chord_name() in code.py: what the OLED shows
const SUFFIX = { "Major": "", "Minor": "m", "Diminished": "°", "Augmented": "+", "Major 7": "M7", "Minor 7": "m7", "Dominant 7": "7", "Minor 7♭5": "m7b5" };

export function getChordName(baseIdx, modeIdx, roman) {
  const mode = MODES[modeIdx];
  if (mode === "DrumMode") return DRUM_NAMES[roman];
  const { interval, type } = chordInfo(mode, roman);
  return BASE_NOTES[(baseIdx + interval) % 12] + SUFFIX[type];
}

export const midiName = (n) => BASE_NOTES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);

// ---------- Chord modifiers (proposed) ----------
// Scale of each mode, for the diatonic notes (the degree's 7th, 6th, 9th)
const SCALES = {
  Ionian: [0, 2, 4, 5, 7, 9, 11], Dorian: [0, 2, 3, 5, 7, 9, 10], Phrygian: [0, 1, 3, 5, 7, 8, 10],
  Lydian: [0, 2, 4, 6, 7, 9, 11], Mixolydian: [0, 2, 4, 5, 7, 9, 10], Aeolian: [0, 2, 3, 5, 7, 8, 10],
  Locrian: [0, 1, 3, 5, 6, 8, 10],
  "Harmonic minor": [0, 2, 3, 5, 7, 8, 11], "Melodic minor": [0, 2, 3, 5, 7, 9, 11], "Phrygian dom": [0, 1, 4, 5, 7, 8, 10],
};
// 5- and 6-note scales take their 7th, 6th and 9th from a parent 7-note scale
const PARENT = { "Maj pentatonic": "Ionian", "Min pentatonic": "Aeolian", "Blues": "Mixolydian" };

export const MODIFIERS = [
  { id: "7", label: "7th", desc: "seventh from the mode" },
  { id: "9", label: "add9", desc: "ninth from the mode" },
  { id: "6", label: "add6", desc: "sixth from the mode" },
  { id: "sus2", label: "sus2", desc: "second instead of the third" },
  { id: "sus4", label: "sus4", desc: "fourth instead of the third" },
  { id: "5", label: "5 (red)", desc: "reduced: root, fifth and octave, no third" },
  { id: "swap", label: "maj<>min", desc: "swaps major ↔ minor" },
  { id: "inv1", label: "inv 1", desc: "first inversion" },
  { id: "inv2", label: "inv 2", desc: "second inversion" },
  { id: "bass", label: "bass", desc: "root an octave below" },
];
export const modifierById = (id) => MODIFIERS.find((m) => m.id === id);

// Semitones from the degree's root to the note `k` scale steps above (k = 1: 9th, 5: 6th, 6: 7th).
// A root outside the scale (blues bIII, #IV) gets the usual choices: major 9th, major 6th, minor 7th.
function scaleStep(mode, roman, k) {
  const sc = SCALES[mode] || SCALES[PARENT[mode]];
  const d = sc.indexOf(chordInfo(mode, roman).interval % 12);
  if (d < 0) return { 1: 2, 5: 9, 6: 10 }[k];
  return sc[(d + k) % 7] + 12 * Math.floor((d + k) / 7) - sc[d];
}

// Seventh of a degree: the one its type already has, or the one from the scale
const seventhOf = (mode, roman, type) => SEVENTH_OF_TYPE[type] ?? scaleStep(mode, roman, 6);

// (Triad) chord quality after applying maj<>min
function triadQuality(info, mods) {
  const t = info.type;
  const base = t === "Augmented" ? "aug" : t.startsWith("Major") || t === "Dominant 7" ? "maj"
    : t === "Minor 7♭5" || t === "Diminished" ? "dim" : "min";
  if (!mods.includes("swap")) return base;
  return base === "maj" || base === "aug" ? "min" : "maj"; // minor and diminished become major
}

// Chord notes with the held modifiers, applied in order: quality, added notes, inversions
export function extendChord(mode, roman, base, mods = []) {
  if (mode === "DrumMode" || !mods.length) return chordFromDatabase(mode, roman, base);
  const info = chordInfo(mode, roman);
  const root = MIDI_NOTE_MAP[base] + info.interval;
  const q = triadQuality(info, mods);
  let third = q === "maj" || q === "aug" ? 4 : 3;
  const fifth = q === "dim" ? 6 : q === "aug" ? 8 : 7;
  if (mods.includes("sus2")) third = 2;
  if (mods.includes("sus4")) third = 5;
  let notes = mods.includes("5") ? [root, root + 7, root + 12] : [root, root + third, root + fifth];
  const has7 = mods.includes("7") || info.type in SEVENTH_OF_TYPE;
  if (has7 && !mods.includes("5")) notes.push(root + seventhOf(mode, roman, info.type));
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

// Name of the extended chord, e.g. "Dm7", "Cadd9", "G5", "F/A"
export function extendedName(baseIdx, modeIdx, roman, mods = []) {
  const mode = MODES[modeIdx];
  if (mode === "DrumMode" || !mods.length) return getChordName(baseIdx, modeIdx, roman);
  const info = chordInfo(mode, roman);
  const rootName = BASE_NOTES[(baseIdx + info.interval) % 12];
  if (mods.includes("5")) return rootName + "5" + slash(mode, roman, baseIdx, mods);
  const q = triadQuality(info, mods);
  const sus = mods.includes("sus4") ? "sus4" : mods.includes("sus2") ? "sus2" : "";
  let suffix;
  const has7 = mods.includes("7") || info.type in SEVENTH_OF_TYPE;
  if (has7) {
    const sev = seventhOf(mode, roman, info.type);
    if (sus) suffix = (sev === 11 ? "M7" : "7") + sus;
    else if (q === "aug") suffix = sev === 11 ? "+M7" : "+7";
    else if (q === "maj") suffix = sev === 11 ? "M7" : "7";
    else if (q === "min") suffix = sev === 11 ? "mM7" : "m7";
    else suffix = sev === 9 ? "°7" : "m7b5";
    // With a seventh, the ninth is named 9 (CM9, Dm9, G9) instead of add9
    if (mods.includes("9")) suffix = suffix.replace("7", "9");
  } else {
    suffix = sus || (q === "min" ? "m" : q === "dim" ? "°" : q === "aug" ? "+" : "");
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
