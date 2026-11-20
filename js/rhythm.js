// Port of rhythm.py, with the patterns as editable data.
// A pattern is a list of steps [note, length]:
//   note: index into the chord (0 = first note … 3 = fourth; -1 = rest)
//   length: in beats (1 = a quarter note); it lasts length × 60 / BPM seconds

// Firmware presets (get_rhythm_pattern in rhythm.py)
export const BUILTIN_PATTERNS = [
  { id: "arpeggio_up", name: "arp_up", steps: [[0, 0.5], [1, 1], [2, 1], [3, 1]] },
  { id: "arpeggio_down", name: "arp_down", steps: [[2, 1], [1, 1], [0, 1]] },
  { id: "custom_rhythm", name: "custom", steps: [[0, 0.5], [2, 1], [1, 1]] },
  { id: "drum_rhythm", name: "drum", steps: [[0, 0.5], [2, 0.5], [0, 1]] },
].map((p) => ({ ...p, builtin: true }));

// Values the length encoder steps through
export const DURATIONS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
export const DURATION_LABELS = { 0.25: "1/4", 0.5: "1/2", 0.75: "3/4", 1: "1", 1.5: "1.5", 2: "2", 3: "3", 4: "4" };
export const NOTE_VALUES = [-1, 0, 1, 2, 3];
export const noteLabel = (i) => (i < 0 ? "-" : String(i + 1));
export const MAX_STEPS = 16;

// Order in which the Note button walks the chord: low to high, high to low, or a random note each press
export const NOTE_ORDERS = { up: "Up", down: "Down", random: "Random" };

// Arpeggio quantize: off = a new chord restarts the pattern at once;
// pattern = the running pattern finishes first, then the new chord starts on the next cycle
export const QUANTIZE = { off: "Off", pattern: "Pattern" };

export function scaleSteps(steps, timeStep) {
  return steps.map(([idx, mult]) => [idx, mult * timeStep]);
}

// User presets. On the device they would go to a JSON file in flash;
// here they are kept in the browser (they can be lost if the site data is cleared).
const STORE_KEY = "chordplayer.arpeggios.v1";

export function loadUserPatterns() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
    return raw
      .filter((p) => p && typeof p.name === "string" && Array.isArray(p.steps) && p.steps.length)
      .map((p) => ({ name: p.name.slice(0, 12), steps: p.steps.slice(0, MAX_STEPS).map(([i, m]) => [Number(i), Number(m)]), builtin: false }));
  } catch {
    return [];
  }
}

export function saveUserPatterns(patterns) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(patterns.map(({ name, steps }) => ({ name, steps }))));
    return true;
  } catch {
    return false;
  }
}
