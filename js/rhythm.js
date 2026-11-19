// Port de rhythm.py, con los patrones como datos editables.
// Un patrón es una lista de pasos [nota, duración]:
//   nota: índice en el acorde (0 = primera nota … 3 = cuarta; -1 = silencio)
//   duración: en pulsos (1 = una negra); dura duración × 60 / BPM segundos

// Presets del firmware (get_rhythm_pattern de rhythm.py)
export const BUILTIN_PATTERNS = [
  { id: "arpeggio_up", name: "arp_up", steps: [[0, 0.5], [1, 1], [2, 1], [3, 1]] },
  { id: "arpeggio_down", name: "arp_down", steps: [[2, 1], [1, 1], [0, 1]] },
  { id: "custom_rhythm", name: "custom", steps: [[0, 0.5], [2, 1], [1, 1]] },
  { id: "drum_rhythm", name: "drum", steps: [[0, 0.5], [2, 0.5], [0, 1]] },
].map((p) => ({ ...p, builtin: true }));

// Valores que recorre el encoder de duración
export const DURATIONS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
export const DURATION_LABELS = { 0.25: "1/4", 0.5: "1/2", 0.75: "3/4", 1: "1", 1.5: "1.5", 2: "2", 3: "3", 4: "4" };
export const NOTE_VALUES = [-1, 0, 1, 2, 3];
export const noteLabel = (i) => (i < 0 ? "-" : String(i + 1));
export const MAX_STEPS = 16;

export function scaleSteps(steps, timeStep) {
  return steps.map(([idx, mult]) => [idx, mult * timeStep]);
}

// Presets del usuario. En el aparato irían a un JSON en la flash;
// aquí se guardan en el navegador (pueden perderse si se borran los datos del sitio).
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
