// The device drawn to scale (millimetres) from the CAD:
//  - Main_ZB.prt (May 2026): a bar with the OLED on the left and 7 rectangular keys on the right
//  - Switch_Mount_Plate_V4 (April 2026): 150×60 plate, keys in a zigzag every 20 mm, rows at ±11 mm
//  - Key_V1_Long: 15×29 mm key with the degree engraved bottom right
//  - Top_Half_RE_Test (April 2026): 3 KY-040 encoders in a column, 25 mm apart
// The 3 holes under the screen are the chord modifiers (MOD 1–3). The Note button to their
// right is a proposal: the May 2026 CAD has no hole for it yet.
import { ROMANS } from "./chords.js";

const CASE_H = 78;
const PANEL_A = { w: 108, h: CASE_H };   // encoders, OLED and controls
const PANEL_B = { w: 164, h: CASE_H };   // key plate
const WIDE_W = PANEL_A.w + PANEL_B.w;    // 272 mm
const STACK_GAP_PX = 14;

const ENCODERS = [
  { id: "base", label: "Base", x: 15, y: 14 },
  { id: "mode", label: "Mode", x: 15, y: 39 },
  { id: "octave", label: "Oct", x: 15, y: 64 },
];
const KNOB_D = 13;
const OLED = { x: 63, y: 28, w: 62, h: 34, aw: 55, ah: 27.5 };
// Chord modifiers: held down before playing the key
const MODS = [{ x: 40, y: 60 }, { x: 55, y: 60 }, { x: 70, y: 60 }];
const NOTE_BTN = { x: 88, y: 60 };
const MOD_D = 9;

// A button that is held: reports press and release (also with several fingers)
function holdButton(btn, onDown, onUp) {
  let pointer = null;
  btn.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    btn.setPointerCapture(ev.pointerId);
    pointer = ev.pointerId;
    onDown();
  });
  const up = (ev) => { if (pointer !== ev.pointerId) return; pointer = null; onUp(); };
  btn.addEventListener("pointerup", up);
  btn.addEventListener("pointercancel", up);
  btn.addEventListener("lostpointercapture", up);
  btn.addEventListener("keydown", (ev) => { if ((ev.key === "Enter" || ev.key === " ") && !ev.repeat) { ev.preventDefault(); onDown(); } });
  btn.addEventListener("keyup", (ev) => { if (ev.key === "Enter" || ev.key === " ") onUp(); });
}
const PLATE = { x: 82, y: 39, w: 150, h: 60 };
const KEY = { w: 15, h: 29 };
// Ø3.5 holes in the V4 plate (STEP coordinates, y pointing up)
const PLATE_HOLES = [[-71, -15], [-40, -15], [-20, 15], [0, -15], [20, 15], [40, -15], [60, 15], [71, -15]];
const KEYS_PC = ["A", "S", "D", "F", "G", "H", "J"];

const el = (tag, cls, attrs = {}) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "style") Object.entries(v).forEach(([p, val]) => e.style.setProperty(p, val));
    else if (k === "text") e.textContent = v;
    else e.setAttribute(k, v);
  }
  return e;
};
const part = (tag, cls, { x, y, w, h }, attrs = {}) =>
  el(tag, `part ${cls}`, { ...attrs, style: { "--x": x, "--y": y, "--w": w, "--h": h, ...(attrs.style || {}) } });

export function buildDevice(root, handlers) {
  const device = el("div", "device", { "data-layout": "wide" });
  const a = el("div", "dev-panel panel-a");
  const b = el("div", "dev-panel panel-b");
  device.append(a, b);
  root.append(device);
  // On touch screens (e.g. a Surface with Windows), a long press or a two-finger tap counts
  // as a right click: without this, holding a key would open the context menu.
  device.addEventListener("contextmenu", (e) => e.preventDefault());
  device.addEventListener("selectstart", (e) => e.preventDefault());
  device.addEventListener("dragstart", (e) => e.preventDefault());

  // ---------- Encoders ----------
  const encoders = {};
  for (const e of ENCODERS) {
    const knob = part("div", "knob", { x: e.x, y: e.y, w: KNOB_D, h: KNOB_D }, {
      tabindex: "0", role: "spinbutton", "aria-label": `Encoder ${e.label}`,
      title: `${e.label} encoder: drag, scroll wheel or arrow keys · click or Enter = press · hold 1 s = menu`,
    });
    knob.append(el("span", "knob-ring"), el("span", "knob-cap"), el("span", "knob-mark"));
    a.append(part("span", "silk", { x: e.x, y: e.y + 9.6, w: 16, h: 3.2 }, { text: e.label }));
    a.append(knob);
    encoders[e.id] = knob;
    attachEncoder(knob, {
      onStep: (d) => handlers.onTurn(e.id, d),
      onPush: () => handlers.onPush(e.id),
      onLongPress: () => handlers.onLongPress(e.id),
    });
  }

  // ---------- OLED ----------
  const glass = part("div", "oled", { x: OLED.x, y: OLED.y, w: OLED.w, h: OLED.h });
  const canvas = el("canvas", "oled-canvas", { width: "128", height: "64", "aria-label": "128×64 OLED screen" });
  canvas.style.setProperty("--aw", OLED.aw);
  canvas.style.setProperty("--ah", OLED.ah);
  glass.append(canvas);
  a.append(glass);

  // ---------- Modifiers (MOD 1–3) and Note button ----------
  const mods = MODS.map((m, i) => {
    const btn = part("button", "mod", { x: m.x, y: m.y, w: MOD_D, h: MOD_D }, { "aria-label": `Modifier ${i + 1}` });
    btn.append(el("span", "mod-num", { text: String(i + 1) }));
    holdButton(btn, () => handlers.onModDown(i), () => handlers.onModUp(i));
    a.append(btn);
    return btn;
  });
  a.append(part("span", "silk", { x: MODS[1].x, y: MODS[1].y + 8.6, w: 40, h: 3.2 }, { text: "Mod" }));
  const noteBtn = part("button", "mod note", { x: NOTE_BTN.x, y: NOTE_BTN.y, w: MOD_D, h: MOD_D }, {
    "aria-label": "Note: hold it while playing a chord and press it for each note", title: "Note: hold it while playing a chord; each press plays the next note",
  });
  noteBtn.append(el("span", "mod-num", { text: "N" }));
  holdButton(noteBtn, handlers.onNoteDown, handlers.onNoteUp);
  a.append(noteBtn, part("span", "silk", { x: NOTE_BTN.x, y: NOTE_BTN.y + 8.6, w: 16, h: 3.2 }, { text: "Note" }));

  // ---------- Plate and keys ----------
  b.append(part("div", "plate", PLATE));
  for (const [hx, hy] of PLATE_HOLES) b.append(part("span", "hole", { x: PLATE.x + hx, y: PLATE.y - hy, w: 3.5, h: 3.5 }));
  const keys = {};
  ROMANS.forEach((r, i) => {
    const x = PLATE.x - 60 + i * 20;
    const y = PLATE.y + (i % 2 ? -11 : 11);
    const key = part("button", "key", { x, y, w: KEY.w, h: KEY.h }, { "aria-label": `Chord ${r}` });
    key.append(el("span", "pc", { text: KEYS_PC[i] }), el("span", "legend", { text: r }));
    b.append(key);
    keys[r] = key;
    key.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      key.setPointerCapture(ev.pointerId);
      handlers.onKeyDown(r);
    });
    const up = () => handlers.onKeyUp(r);
    key.addEventListener("pointerup", up);
    key.addEventListener("pointercancel", up);
    key.addEventListener("lostpointercapture", up);
    key.addEventListener("keydown", (ev) => { if ((ev.key === " " || ev.key === "Enter") && !ev.repeat) { ev.preventDefault(); handlers.onKeyDown(r); } });
    key.addEventListener("keyup", (ev) => { if (ev.key === " " || ev.key === "Enter") handlers.onKeyUp(r); });
  });

  a.append(el("span", "usb", { "aria-hidden": "true" }));

  // ---------- Scale: millimetres -> pixels ----------
  const place = (panel, left, top, mm, dims) => {
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.width = `${dims.w * mm}px`;
    panel.style.height = `${dims.h * mm}px`;
    panel.style.setProperty("--mm", `${mm}px`);
  };
  const layout = () => {
    const W = root.clientWidth;
    if (!W) return;
    if (W >= 620) {
      const mm = W / WIDE_W;
      device.dataset.layout = "wide";
      place(a, 0, 0, mm, PANEL_A);
      place(b, PANEL_A.w * mm, 0, mm, PANEL_B);
      device.style.height = `${CASE_H * mm}px`;
      device.style.setProperty("--mm", `${mm}px`);
    } else {
      // Compact view for phones: the two halves stacked
      const mmA = Math.min(W / PANEL_A.w, 3.4);
      const mmB = W / PANEL_B.w;
      device.dataset.layout = "stacked";
      place(a, (W - PANEL_A.w * mmA) / 2, 0, mmA, PANEL_A);
      place(b, 0, CASE_H * mmA + STACK_GAP_PX, mmB, PANEL_B);
      device.style.height = `${CASE_H * (mmA + mmB) + STACK_GAP_PX}px`;
      device.style.setProperty("--mm", `${mmB}px`);
    }
  };
  new ResizeObserver(layout).observe(root);
  layout();

  return { keys, encoders, mods, noteBtn, canvas };
}

// Endless encoder: 20 detents per turn like the KY-040.
// Drag (right/up = clockwise), scroll wheel, arrow keys; click or Enter = press the shaft;
// hold for 1 s (without turning) = long press.
export const HOLD_MS = 1000;

function attachEncoder(knob, { onStep, onPush, onLongPress, detents = 20 }) {
  const stepDeg = 360 / detents;
  const PX_PER_STEP = 14;
  let rot = 0, drag = null, wheelAcc = 0, hold = null;
  // spin() only turns the drawing (for when the computer keyboard is used)
  knob.spin = (d) => {
    rot += d * stepDeg;
    knob.style.setProperty("--rot", `${rot}deg`);
  };
  const turn = (d) => { knob.spin(d); onStep(d); };

  // Press: short if released within 1 s; long if held for 1 s
  const holdCancel = () => {
    if (!hold) return;
    clearTimeout(hold.timer);
    knob.classList.remove("holding");
    hold = null;
  };
  knob.holdStart = () => {
    holdCancel();
    knob.classList.add("holding");
    hold = { fired: false };
    hold.timer = setTimeout(() => {
      hold.fired = true;
      knob.classList.remove("holding");
      onLongPress();
    }, HOLD_MS);
  };
  knob.holdEnd = () => {
    if (!hold) return;
    const short = !hold.fired;
    holdCancel();
    if (short) {
      knob.classList.add("pushed");
      setTimeout(() => knob.classList.remove("pushed"), 140);
      onPush();
    }
  };
  knob.holdCancel = holdCancel;

  knob.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    knob.focus({ preventScroll: true, focusVisible: false });
    knob.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, acc: 0 };
    knob.classList.add("grab");
    knob.holdStart();
  });
  knob.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const d = (e.clientX - drag.x) - (e.clientY - drag.y);
    drag.x = e.clientX; drag.y = e.clientY;
    drag.acc += d;
    // Turning while pressed does not count as a press
    while (drag.acc >= PX_PER_STEP) { drag.acc -= PX_PER_STEP; holdCancel(); turn(1); }
    while (drag.acc <= -PX_PER_STEP) { drag.acc += PX_PER_STEP; holdCancel(); turn(-1); }
  });
  const end = (e) => {
    if (!drag) return;
    drag = null;
    knob.classList.remove("grab");
    if (e.type === "pointerup") knob.holdEnd(); else holdCancel();
  };
  knob.addEventListener("pointerup", end);
  knob.addEventListener("pointercancel", end);
  knob.addEventListener("wheel", (e) => {
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    // Mouse: each notch is one detent. Trackpad: small deltas add up.
    if (Math.abs(dy) >= 40) { wheelAcc = 0; turn(dy < 0 ? 1 : -1); return; }
    wheelAcc += dy;
    if (wheelAcc <= -40) { wheelAcc = 0; turn(1); }
    else if (wheelAcc >= 40) { wheelAcc = 0; turn(-1); }
  }, { passive: false });
  knob.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); turn(1); }
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); turn(-1); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); if (!e.repeat) knob.holdStart(); }
  });
  knob.addEventListener("keyup", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); knob.holdEnd(); }
  });
  knob.addEventListener("blur", () => { if (!drag) holdCancel(); });
}
