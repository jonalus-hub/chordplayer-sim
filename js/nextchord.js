// Port of nextchord.py
export const CHORD_PROGRESSIONS = {
  Ionian: [["I", "IV", "V", "I"], ["I", "V", "vi", "IV"], ["I", "vi", "IV", "V"], ["I", "IV", "vi", "V"], ["I", "ii", "IV", "V"]],
  Dorian: [["i", "IV", "v", "i"], ["i", "ii", "v", "i"], ["i", "IV", "VII", "i"], ["i", "III", "VII", "i"], ["i", "v", "IV", "i"]],
  Phrygian: [["i", "II", "III", "i"], ["i", "II", "iv", "i"], ["i", "III", "iv", "i"], ["i", "II", "VII", "i"], ["i", "iv", "III", "i"]],
  Lydian: [["I", "II", "IV", "I"], ["I", "II", "V", "I"], ["I", "IV", "V", "I"], ["I", "iii", "IV", "I"], ["I", "II", "iii", "IV"]],
  Mixolydian: [["I", "IV", "v", "I"], ["I", "IV", "VII", "I"], ["I", "ii", "IV", "I"], ["I", "V", "vi", "IV"], ["I", "IV", "V", "I"]],
  Aeolian: [["i", "iv", "v", "i"], ["i", "VI", "III", "VII"], ["i", "iv", "VII", "i"], ["i", "III", "VII", "i"], ["i", "VI", "iv", "v"]],
  Locrian: [["i°", "II", "III", "i°"], ["i°", "II", "iv", "i°"], ["i°", "III", "iv", "i°"], ["i°", "II", "VII", "i°"], ["i°", "iv", "III", "i°"]],
  DrumMode: [["I", "II", "III", "IV"], ["I", "III", "II", "IV"], ["I", "IV", "II", "III"]],
};

// chord_to_function() from code.py, extended to lowercase and "°" so that
// the button degrees (always uppercase) match the progressions.
export function chordToFunction(chord) {
  const r = chord.replace("°", "").replace("7", "").toUpperCase();
  const i = ["I", "II", "III", "IV", "V", "VI", "VII"].indexOf(r);
  return i < 0 ? null : i + 1;
}

export function getNextChords(mode, lastChords) {
  const progs = CHORD_PROGRESSIONS[mode];
  if (!progs) return [];
  const out = [];
  const add = (c) => { if (!out.includes(c)) out.push(c); };
  if (!lastChords.length) { progs.forEach((p) => add(p[0])); return out; }
  const last = chordToFunction(lastChords[lastChords.length - 1]);
  for (const p of progs) {
    p.forEach((c, i) => { if (chordToFunction(c) === last && i < p.length - 1) add(p[i + 1]); });
  }
  if (!out.length) {
    for (const p of progs) {
      if (chordToFunction(p[0]) !== last) add(p[0]);
      if (p.length > 1 && chordToFunction(p[1]) !== last) add(p[1]);
    }
  }
  return out;
}
