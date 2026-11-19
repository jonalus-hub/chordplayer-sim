// OLED 2.42" 128x64 (SSD1306/SSD1309, 1 bit) con el layout de update_display_text()
import { BASE_NOTES, MODES, getChordName } from "./chords.js";
import { drawText } from "./font.js";

export const WIDTH = 128, HEIGHT = 64;

// CHORD_POSITIONS de code.py (zigzag I..VII, igual que las teclas), subidas 4 px porque
// la cabecera ocupa una sola línea en lugar de dos (propuesta)
export const CHORD_POSITIONS = [
  { chord: "I", x: 5, y: 48 }, { chord: "II", x: 23, y: 31 }, { chord: "III", x: 41, y: 48 },
  { chord: "IV", x: 59, y: 31 }, { chord: "V", x: 77, y: 48 }, { chord: "VI", x: 95, y: 31 },
  { chord: "VII", x: 113, y: 48 },
];

export class Oled {
  constructor(canvas) {
    this.canvas = canvas;
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    this.ctx = canvas.getContext("2d", { willReadFrequently: true });
    this.scratch = document.createElement("canvas");
    this.scratch.width = WIDTH;
    this.scratch.height = HEIGHT;
    this.sctx = this.scratch.getContext("2d", { willReadFrequently: true });
    this.color = [214, 240, 255];
    this.last = null;
  }

  text(str, x, y) {
    return drawText(this.sctx, str, x, y);
  }

  ring(cx, cy, rx, ry) {
    // Anillo punteado, como los segmentos de chord_indicators
    const c = this.sctx;
    const steps = 20;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      c.fillRect(Math.round(cx + rx * Math.cos(a)), Math.round(cy + ry * Math.sin(a)), 1, 1);
    }
  }

  // Texto "en negativo": recorta los píxeles de lo que ya está pintado
  cutText(str, x, y) {
    const c = this.sctx;
    c.globalCompositeOperation = "destination-out";
    const w = drawText(c, str, x, y);
    c.globalCompositeOperation = "source-over";
    return w;
  }

  // Contorno de 1 px
  box(x, y, w, h) {
    const c = this.sctx;
    c.fillRect(x, y, w, 1); c.fillRect(x, y + h - 1, w, 1);
    c.fillRect(x, y, 1, h); c.fillRect(x + w - 1, y, 1, h);
  }

  // Menú de arpegios (propuesta)
  renderMenu(menu) {
    if (menu.type === "edit") this.renderEditor(menu); else this.renderList(menu);
  }

  // Lista de ajustes: 5 filas de 12 px sin título, la elegida en negativo.
  // Si el valor de la fila elegida se cambia con el encoder Modo, va entre < >.
  renderList(menu) {
    const c = this.sctx;
    const ROWS = 5, TOP = 2, ROW_H = 12;
    const n = menu.rows.length;
    const first = Math.max(0, Math.min(menu.index - 2, n - ROWS));
    menu.rows.slice(first, first + ROWS).forEach((row, k) => {
      const i = first + k;
      const top = TOP + k * ROW_H;
      const y = top + ROW_H / 2;
      const sel = i === menu.index;
      const value = sel && row.adjustable ? `<${row.value}>` : row.opens ? `${row.value} >` : row.value;
      const vx = WIDTH - 4 - value.length * 6;
      if (sel) {
        c.fillRect(0, top, WIDTH - 2, ROW_H);
        this.cutText(row.label, 2, y);
        if (value) this.cutText(value, vx, y);
      } else {
        this.text(row.label, 2, y);
        if (value) this.text(value, vx, y);
      }
    });
    // Barra de scroll
    if (n > ROWS) {
      const h = Math.max(4, Math.round((ROWS / n) * (HEIGHT - TOP)));
      const y = TOP + Math.round((first / (n - ROWS)) * (HEIGHT - TOP - h));
      c.fillRect(WIDTH - 1, y, 1, h);
    }
  }

  // Editor: pasos como cajas de ancho proporcional a la duración, con la nota dentro
  renderEditor(menu) {
    const c = this.sctx;
    this.text(menu.title.slice(0, 15), 2, 6);
    const pos = `${menu.sel + 1}/${menu.steps.length}`;
    this.text(pos, WIDTH - 2 - pos.length * 6, 6);
    c.fillRect(0, 13, WIDTH, 1);

    const n = menu.steps.length;
    const GAP = 1, X0 = 2, AVAIL = WIDTH - 4 - GAP * (n - 1);
    const MIN_W = Math.min(7, Math.floor(AVAIL / n)); // con 16 pasos no caben de 7 px
    const total = menu.steps.reduce((a, st) => a + st.dur, 0);
    const extra = AVAIL - MIN_W * n;
    let x = X0;
    const TOP = 16, H = 19;
    menu.steps.forEach((st, i) => {
      const w = i === n - 1 ? X0 + AVAIL + GAP * (n - 1) - x : Math.round(MIN_W + (st.dur / total) * extra);
      const lx = x + Math.floor((w - 6) / 2);
      if (i === menu.sel) {
        c.fillRect(x, TOP, w, H);
        if (w >= 6) this.cutText(st.note, lx, TOP + H / 2);
      } else {
        this.box(x, TOP, w, H);
        if (w >= 6) this.text(st.note, lx, TOP + H / 2);
      }
      // Paso que está sonando
      if (i === menu.playing) c.fillRect(x, TOP + H + 2, w, 2);
      x += w + GAP;
    });

    // Nota y duración del paso elegido, o un aviso
    this.text(menu.flash || menu.detail, 2, 45);

    // Acciones
    const slot = WIDTH / menu.actions.length;
    menu.actions.forEach((a, i) => {
      const ax = Math.round(i * slot + (slot - a.length * 6) / 2);
      if (a === menu.action) {
        c.fillRect(Math.round(i * slot) + 1, 52, Math.round(slot) - 2, 12);
        this.cutText(a, ax, 58);
      } else {
        this.text(a, ax, 58);
      }
    });
  }

  // Vista "Keys" (propuesta): teclado de 2 octavas con las notas que suenan en negativo.
  // La ventana empieza en el Do de la octava elegida y se recoloca si un acorde no cabe.
  renderKeyboard(notes, octave, label) {
    const c = this.sctx;
    const isBlack = (n) => [1, 3, 6, 8, 10].includes(((n % 12) + 12) % 12);
    const sorted = [...notes].sort((a, b) => a - b);
    let start = 60 + 12 * octave;
    if (sorted.length && (sorted[0] < start || sorted.at(-1) > start + 24)) start = 12 * Math.floor(sorted[0] / 12);
    const end = start + 24;
    const W = 8, X0 = 3, TOP = 15, H = 35, BW = 5, BH = 21;
    const whiteX = {};
    let wi = 0;
    for (let n = start; n <= end; n++) {
      if (isBlack(n)) continue;
      const x = X0 + wi * W;
      whiteX[n] = x;
      if (notes.has(n)) c.fillRect(x, TOP, W + 1, H); else this.box(x, TOP, W + 1, H);
      wi++;
    }
    for (let n = start; n <= end; n++) {
      if (!isBlack(n)) continue;
      const x = whiteX[n - 1] + W - Math.floor(BW / 2);
      c.clearRect(x - 1, TOP, BW + 2, BH + 1);   // hueco entre la negra y las blancas
      c.fillRect(x, TOP, BW, BH);
      if (notes.has(n)) c.clearRect(x + 1, TOP + 1, BW - 2, BH - 2);
    }
    const beyond = sorted.length && sorted.at(-1) > end ? " >" : "";
    if (label) this.text((label + beyond).slice(0, 21), 2, 57);
  }

  // state: { baseIdx, modeIdx, octave, current, overlay, labels, bars, menu, screen, notes, keysLabel }
  render(state) {
    this.last = state;
    const { baseIdx, modeIdx, octave, current, overlay, labels = {}, bars = new Map(), menu } = state;
    const c = this.sctx;
    c.clearRect(0, 0, WIDTH, HEIGHT);
    c.fillStyle = "#fff";
    if (menu) { this.renderMenu(menu); this.blit(); return; }
    // Cabecera en una línea, solo el contenido: tónica a la izquierda, modo centrado y
    // octava a la derecha. Un aviso (género) o los ampliadores pulsados ocupan el sitio del modo.
    const base = BASE_NOTES[baseIdx];
    const oct = octave > 0 ? `+${octave}` : `${octave}`;
    this.text(base, 2, 6);
    this.text(oct, WIDTH - 2 - oct.length * 6, 6);
    const left = 2 + base.length * 6 + 6;
    const right = WIDTH - 2 - oct.length * 6 - 6;
    const mid = (overlay || state.modText || MODES[modeIdx]).slice(0, Math.floor((right - left) / 6));
    const mx = Math.max(left, Math.min(right - mid.length * 6, Math.round((WIDTH - mid.length * 6) / 2)));
    this.text(mid, mx, 6);
    const drum = MODES[modeIdx] === "DrumMode";
    if (state.screen === "keys" && !drum) {
      this.renderKeyboard(state.notes || new Set(), octave, state.keysLabel);
      this.blit();
      return;
    }
    for (const pos of CHORD_POSITIONS) {
      const name = labels[pos.chord] ?? getChordName(baseIdx, modeIdx, pos.chord);
      const label = drum ? name.slice(0, 4) : name;
      const w = this.text(label, pos.x, pos.y);
      if (current === pos.chord) this.ring(pos.x + w / 2 - 0.5, pos.y - 0.5, w / 2 + 4, 7);
      // Propuesta: barra bajo los acordes recomendados, larga según la probabilidad
      const level = bars.get(pos.chord);
      if (level) c.fillRect(pos.x, pos.y + 6, Math.max(2, Math.round(Math.max(w, 10) * level)), 1);
    }
    this.blit();
  }

  blit() {
    // 1 bit por píxel, como la pantalla real
    const src = this.sctx.getImageData(0, 0, WIDTH, HEIGHT);
    const out = this.ctx.createImageData(WIDTH, HEIGHT);
    const [r, g, b] = this.color;
    for (let i = 0; i < src.data.length; i += 4) {
      const on = src.data[i + 3] > 110;
      out.data[i] = on ? r : 4;
      out.data[i + 1] = on ? g : 6;
      out.data[i + 2] = on ? b : 9;
      out.data[i + 3] = 255;
    }
    this.ctx.putImageData(out, 0, 0);
  }
}
