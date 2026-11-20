// Recommendations with the Chord_AI Markov models (export_base_models.py).
// Each model is a flat 146,224-byte .bin, designed for the Pico to read with seek():
//   order 1: 26 blocks · order 2: 26² blocks · order 3: 26³ blocks
//   block = 4 × (chord id, percentage); id 255 = empty
// Here they are served compressed (.bin.gz) and decompressed in the browser.

export const VOCAB = [
  "*S*", "*E*",
  "I", "IIb", "II", "IIIb", "III", "IV", "Vb", "V", "VIb", "VI", "VIIb", "VII",
  "i", "iib", "ii", "iiib", "iii", "iv", "vb", "v", "vib", "vi", "viib", "vii",
];

export const GENRES = ["all", "pop", "rock", "pop_rock", "alternative", "country", "electronic", "jazz", "metal", "punk", "rap", "reggae", "soul"];

// Model each device mode uses. Lydian and Locrian are not in the dataset (they fall back to
// nextchord.py). The scales the dataset has no data for borrow the closest model.
const MODEL_FOR = {
  "Ionian": "Ionian", "Dorian": "Dorian", "Phrygian": "Phrygian", "Mixolydian": "Mixolydian", "Aeolian": "Aeolian",
  "Phrygian dom": "Phrygian_dominant",
  "Harmonic minor": "Aeolian", "Melodic minor": "Dorian",
  "Maj pentatonic": "Ionian", "Min pentatonic": "Aeolian", "Blues": "Mixolydian",
};
const BORROWED = new Set(["Harmonic minor", "Melodic minor", "Maj pentatonic", "Min pentatonic", "Blues"]);
export const borrowedModel = (mode) => (BORROWED.has(mode) ? MODEL_FOR[mode] : null);

const N = VOCAB.length;
const BLOCK = 8;
const O2 = N * BLOCK;
const O3 = O2 + N * N * BLOCK;
const DEGREES = ["I", "IIb", "II", "IIIb", "III", "IV", "Vb", "V", "VIb", "VI", "VIIb", "VII"];

export function modelFile(mode, genre) {
  return MODEL_FOR[mode] ? `${MODEL_FOR[mode]}_${genre}.bin` : null;
}

const cache = new Map();

// The web server serves models/<file>.gz. The Claude artifact build (scripts/build_artifact.py)
// ships each model as a base64 JS module (models/<file>.js), because artifacts only publish web types.
const MODULE_MODELS = document.querySelector('meta[name="chordplayer-models"]')?.content === "js";

async function gzBytes(file) {
  if (!MODULE_MODELS) {
    try {
      const r = await fetch(`models/${file}.gz`);
      // Any server that returns the file (and not an HTML error page) will do;
      // if it arrives already decompressed, loadModel notices.
      if (r.ok && !(r.headers.get("content-type") || "").startsWith("text/")) return new Uint8Array(await r.arrayBuffer());
    } catch { /* no .gz server: try the module */ }
  }
  const m = await import(`../models/${file}.js`);
  return Uint8Array.from(atob(m.default), (c) => c.charCodeAt(0));
}

export function loadModel(file) {
  if (!cache.has(file)) {
    const p = gzBytes(file)
      .then((bytes) => {
        // 1f 8b = gzip header; without it, the server already decompressed the file
        if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
        return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer().then((buf) => new Uint8Array(buf));
      })
      .then((data) => {
        if (data.length !== 146224) throw new Error(`model has an unexpected size (${data.length} bytes)`);
        return data;
      });
    p.catch(() => cache.delete(file));
    cache.set(file, p);
  }
  return cache.get(file);
}

function readBlock(data, offset) {
  const out = [];
  for (let i = 0; i < 4; i++) {
    const id = data[offset + i * 2];
    if (id === 255) break;
    out.push({ token: VOCAB[id], pct: data[offset + i * 2 + 1] });
  }
  return out;
}

// Same as LightweightBinaryPredictor: order 3, then order 2 if there is no data, then order 1
export function predict(data, history) {
  const ctx = ["*S*", "*S*", "*S*", ...history].slice(-3);
  const [c3, c2, c1] = ctx.map((t) => VOCAB.indexOf(t));
  const tries = [
    [3, c3 >= 0 && c2 >= 0 && c1 >= 0, O3 + ((c3 * N + c2) * N + c1) * BLOCK],
    [2, c2 >= 0 && c1 >= 0, O2 + (c2 * N + c1) * BLOCK],
    [1, c1 >= 0, c1 * BLOCK],
  ];
  for (const [order, ok, offset] of tries) {
    if (!ok) continue;
    const items = readBlock(data, offset);
    if (items.length) return { order, items, context: ctx };
  }
  return { order: 0, items: [], context: ctx };
}

// Device degree -> model symbol (uppercase = major; diminished counts as minor)
export function tokenFor(interval, quality) {
  const t = DEGREES[interval % 12];
  return quality === "maj" ? t : t.replace(/^[IV]+/, (r) => r.toLowerCase());
}

export function parseToken(token) {
  const m = /^([IViv]+)(b?)$/.exec(token);
  if (!m) return null;
  const interval = DEGREES.indexOf(m[1].toUpperCase() + m[2]);
  if (interval < 0) return null;
  return { interval, quality: m[1] === m[1].toUpperCase() ? "maj" : "min" };
}
