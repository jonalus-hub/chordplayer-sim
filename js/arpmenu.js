// Menú de ajustes (propuesta). Se abre manteniendo cualquier encoder 1 s.
//
// Raíz: Arp on/off, Tempo, Pattern, New pattern, Mod 1–3 (qué hace cada ampliador),
// Note (Gate o Sustain), Screen, Exit.
//   Base (arriba) = elegir fila · Modo (medio) = cambiar el valor al momento
//   toque: en Pattern abre el editor del patrón elegido, en New pattern crea uno, en Exit cierra
// Editor:
//   Base   = paso seleccionado (y, pasado el último, las acciones Add / Del / Save / Back)
//   Modo   = nota del acorde de ese paso (1–4, o "-" = silencio)
//   Octava = duración del paso, en pulsos (1 = una negra al tempo de Ajustes)
//   toque sobre un paso = cogerlo para moverlo con Base; otro toque lo suelta
import { DURATIONS, DURATION_LABELS, NOTE_VALUES, MAX_STEPS, noteLabel } from "./rhythm.js";
import { MODIFIERS, modifierById } from "./chords.js";

const ACTIONS = ["Add", "Del", "Save", "Back"];
const FLASH_MS = 1200;
const wrap = (i, n) => ((i % n) + n) % n;
const clone = (steps) => steps.map(([i, m]) => [i, m]);

export class ArpMenu {
  constructor(player) {
    this.p = player;
    this.level = "root";
    this.rootIndex = 0;
    this.edit = null;
    this.flashMsg = null;
  }

  // ---- Raíz: ajustes ----
  rootRows() {
    const p = this.p;
    const mods = p.modAssign.map((id, i) => ({
      label: `Mod ${i + 1}`, value: modifierById(id).label,
      step: (d) => p.setModAssign(i, MODIFIERS[wrap(MODIFIERS.findIndex((m) => m.id === id) + d, MODIFIERS.length)].id),
    }));
    return [
      { label: "Arp", value: p.rhythmMode ? "On" : "Off", step: () => p.toggleRhythm() },
      { label: "Tempo", value: `${p.bpm} BPM`, step: (d) => p.setBpm(p.bpm + d) },
      // Modo elige el arpegio activo (suena al momento); un toque lo abre en el editor
      { label: "Pattern", value: p.patterns[p.rhythmIdx].name.slice(0, 8), step: (d) => p.selectPattern(p.rhythmIdx + d), press: () => this.openEditor(p.rhythmIdx) },
      { label: "New pattern", value: "", press: () => this.openEditor(null) },
      ...mods,
      // Botón Note: Gate = la nota suena mientras se pulsa; Sustain = se acumulan mientras se mantiene el acorde
      { label: "Note", value: p.noteMode === "sustain" ? "Sustain" : "Gate", step: () => p.setNoteMode(p.noteMode === "sustain" ? "gate" : "sustain") },
      // Pantalla principal: nombres de acordes en zigzag o teclado con las notas que suenan
      { label: "Screen", value: p.screen === "keys" ? "Keys" : "Chords", step: () => p.setScreen(p.screen === "keys" ? "chords" : "keys") },
      { label: "Exit", value: "", press: () => p.closeMenu() },
    ];
  }

  // ---- Editor ----
  openEditor(presetIdx) {
    const p = this.p;
    const base = presetIdx == null ? { name: "new", steps: [[0, 1], [1, 1], [2, 1]] } : p.patterns[presetIdx];
    this.edit = { presetIdx, name: base.name, steps: clone(base.steps), dirty: presetIdx == null, sel: 0, cursor: 0, moving: false };
    this.level = "edit";
    if (presetIdx != null) p.selectPattern(presetIdx, false);
    // Para oír los cambios al mantener un acorde
    if (!p.rhythmMode) p.setRhythmMode(true);
    p.log(`Editing arpeggio ${base.name}`);
  }

  closeEditor() {
    const e = this.edit;
    if (e.dirty) this.p.log(`Arpeggio ${e.name}: changes discarded`, "prompt");
    this.level = "root";
    this.rootIndex = this.rootRows().findIndex((r) => r.label === "Pattern");
    this.edit = null;
  }

  onAction() { return this.edit.cursor >= this.edit.steps.length ? ACTIONS[this.edit.cursor - this.edit.steps.length] : null; }

  setStep(i, field, value) {
    this.edit.steps[i][field] = value;
    this.edit.dirty = true;
  }

  save() {
    const p = this.p, e = this.edit;
    let pat = e.presetIdx != null ? p.patterns[e.presetIdx] : null;
    if (!pat || pat.builtin) {
      // Los presets del firmware no se sobrescriben: se guarda uno nuevo
      pat = { name: p.nextUserName(), steps: [], builtin: false };
      p.patterns.push(pat);
      e.presetIdx = p.patterns.length - 1;
      e.name = pat.name;
    }
    pat.steps = clone(e.steps);
    e.dirty = false;
    p.selectPattern(e.presetIdx, false);
    const ok = p.persistPatterns();
    p.log(ok ? `Arpeggio saved as ${pat.name}: ${JSON.stringify(pat.steps)}` : `Arpeggio ${pat.name} saved for this session only (browser storage unavailable)`);
    this.flash(ok ? `Saved ${pat.name}` : "Not stored");
  }

  flash(text) {
    this.flashMsg = { text, until: performance.now() + FLASH_MS };
    setTimeout(() => this.p.onChange(), FLASH_MS + 20);
  }

  // ---- Entradas ----
  turn(enc, d) {
    if (this.level === "root") {
      const rows = this.rootRows();
      if (enc === "base") this.rootIndex = wrap(this.rootIndex + d, rows.length);
      else if (enc === "mode" && rows[this.rootIndex].step) {
        rows[this.rootIndex].step(d);
        this.p.log(`Settings: ${rows[this.rootIndex].label} = ${this.rootRows()[this.rootIndex].value}`);
      }
      return;
    }
    const e = this.edit;
    const n = e.steps.length;
    if (enc === "base") {
      if (e.moving) {
        const to = Math.max(0, Math.min(n - 1, e.sel + d));
        if (to !== e.sel) {
          [e.steps[e.sel], e.steps[to]] = [e.steps[to], e.steps[e.sel]];
          e.sel = e.cursor = to;
          e.dirty = true;
        }
      } else {
        e.cursor = wrap(e.cursor + d, n + ACTIONS.length);
        if (e.cursor < n) e.sel = e.cursor;
      }
    } else if (enc === "mode") {
      const cur = NOTE_VALUES.indexOf(e.steps[e.sel][0]);
      this.setStep(e.sel, 0, NOTE_VALUES[wrap(cur + d, NOTE_VALUES.length)]);
    } else if (enc === "octave") {
      const cur = DURATIONS.indexOf(e.steps[e.sel][1]);
      const next = cur < 0 ? DURATIONS.indexOf(1) : Math.max(0, Math.min(DURATIONS.length - 1, cur + d));
      this.setStep(e.sel, 1, DURATIONS[next]);
    }
  }

  press() {
    const p = this.p;
    if (this.level === "root") {
      this.rootRows()[this.rootIndex].press?.();
      return;
    }
    const e = this.edit;
    const action = this.onAction();
    if (!action) { e.moving = !e.moving; return; }
    if (action === "Add") {
      if (e.steps.length >= MAX_STEPS) { this.flash(`Max ${MAX_STEPS} steps`); return; }
      e.steps.splice(e.sel + 1, 0, [...e.steps[e.sel]]);
      e.sel += 1;
      e.cursor = e.steps.length; // sigue en "Add" para añadir más
      e.dirty = true;
    } else if (action === "Del") {
      if (e.steps.length <= 1) { this.flash("Min 1 step"); return; }
      e.steps.splice(e.sel, 1);
      e.sel = Math.min(e.sel, e.steps.length - 1);
      e.cursor = e.steps.length + 1; // sigue en "Del"
      e.dirty = true;
    } else if (action === "Save") {
      this.save();
    } else if (action === "Back") {
      this.closeEditor();
    }
  }

  // Pasos que suenan: los del editor mientras está abierto
  liveSteps() { return this.edit ? this.edit.steps : null; }

  // ---- Lo que pinta la OLED ----
  view() {
    const flash = this.flashMsg && this.flashMsg.until > performance.now() ? this.flashMsg.text : null;
    if (this.level === "root") {
      const rows = this.rootRows().map((r) => ({ label: r.label, value: r.value, adjustable: !!r.step, opens: !!r.press && !!r.step }));
      return { type: "list", rows, index: this.rootIndex };
    }
    const e = this.edit;
    const st = e.steps[e.sel];
    return {
      type: "edit",
      title: `${e.moving ? "MOVE" : "EDIT"} ${e.name}${e.dirty ? "*" : ""}`,
      steps: e.steps.map(([note, dur]) => ({ note: noteLabel(note), dur })),
      sel: e.sel,
      action: this.onAction(),
      actions: ACTIONS,
      detail: `Note ${noteLabel(st[0])}  Dur ${DURATION_LABELS[st[1]] ?? st[1]}`,
      playing: this.p.rhythm?.stepIdx ?? -1,
      flash,
    };
  }
}
