// Recomendaciones con los modelos Markov de Chord_AI (export_base_models.py).
// Cada modelo es un .bin plano de 146 224 bytes, pensado para que la Pico lo lea con seek():
//   orden 1: 26 bloques · orden 2: 26² bloques · orden 3: 26³ bloques
//   bloque = 4 × (id de acorde, porcentaje); id 255 = vacío
// Aquí se sirven comprimidos (.bin.gz) y se descomprimen en el navegador.

export const VOCAB = [
  "*S*", "*E*",
  "I", "IIb", "II", "IIIb", "III", "IV", "Vb", "V", "VIb", "VI", "VIIb", "VII",
  "i", "iib", "ii", "iiib", "iii", "iv", "vb", "v", "vib", "vi", "viib", "vii",
];

export const GENRES = ["all", "pop", "rock", "pop_rock", "alternative", "country", "electronic", "jazz", "metal", "punk", "rap", "reggae", "soul"];

// Modos del aparato que tienen modelo (Lydian y Locrian no aparecen en el dataset)
const MODEL_MODES = new Set(["Ionian", "Dorian", "Phrygian", "Mixolydian", "Aeolian"]);

const N = VOCAB.length;
const BLOCK = 8;
const O2 = N * BLOCK;
const O3 = O2 + N * N * BLOCK;
const DEGREES = ["I", "IIb", "II", "IIIb", "III", "IV", "Vb", "V", "VIb", "VI", "VIIb", "VII"];

export function modelFile(mode, genre) {
  return MODEL_MODES.has(mode) ? `${mode}_${genre}.bin` : null;
}

const cache = new Map();

// El servidor sirve models/<file>.gz. La versión de artefacto de Claude (scripts/build_artifact.py)
// lleva cada modelo como módulo JS en base64 (models/<file>.js), porque solo publica tipos web.
const MODULE_MODELS = document.querySelector('meta[name="chordplayer-models"]')?.content === "js";

async function gzBytes(file) {
  if (!MODULE_MODELS) {
    try {
      const r = await fetch(`models/${file}.gz`);
      // Cualquier servidor que dé el archivo (y no una página de error en HTML) vale;
      // si lo manda ya descomprimido, loadModel lo detecta.
      if (r.ok && !(r.headers.get("content-type") || "").startsWith("text/")) return new Uint8Array(await r.arrayBuffer());
    } catch { /* sin servidor de .gz: probar el módulo */ }
  }
  const m = await import(`../models/${file}.js`);
  return Uint8Array.from(atob(m.default), (c) => c.charCodeAt(0));
}

export function loadModel(file) {
  if (!cache.has(file)) {
    const p = gzBytes(file)
      .then((bytes) => {
        // 1f 8b = cabecera gzip; si no está, el servidor ya lo descomprimió
        if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
        return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer().then((buf) => new Uint8Array(buf));
      })
      .then((data) => {
        if (data.length !== 146224) throw new Error(`modelo con tamaño inesperado (${data.length} bytes)`);
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

// Igual que LightweightBinaryPredictor: orden 3, si no hay datos orden 2, y si no orden 1
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

// Grado del aparato -> símbolo del modelo (mayúscula = mayor; disminuidos cuentan como menores)
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
