// Settings menu (proposed). Opens by holding any encoder for 1 s.
//
// Root: Arp on/off, Tempo, Pattern, New pattern, Mod 1–3 (what each modifier does),
// Note (Gate or Sustain), Screen, Exit.
//   Base (top) = pick a row · Mode (middle) = change the value right away
//   press: on Pattern opens the editor for that pattern, on New pattern creates one, on Exit closes
// Editor:
//   Base   = selected step (and, past the last one, the Add / Del / Save / Back actions)
//   Mode   = chord note for that step (1–4, or "-" = rest)
//   Octave = step length, in beats (1 = a quarter note at the Settings tempo)
//   press on a step = pick it up to move it with Base; another press drops it
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

  // ---- Root: settings ----
  rootRows() {
    const p = this.p;
    const mods = p.modAssign.map((id, i) => ({
      label: `Mod ${i + 1}`, value: modifierById(id).label,
      step: (d) => p.setModAssign(i, MODIFIERS[wrap(MODIFIERS.findIndex((m) => m.id === id) + d, MODIFIERS.length)].id),
    }));
    return [
      { label: "Arp", value: p.rhythmMode ? "On" : "Off", step: () => p.toggleRhythm() },
      { label: "Tempo", value: `${p.bpm} BPM`, step: (d) => p.setBpm(p.bpm + d) },
      // Mode picks the active arpeggio (heard right away); a press opens it in the editor
      { label: "Pattern", value: p.patterns[p.rhythmIdx].name.slice(0, 8), step: (d) => p.selectPattern(p.rhythmIdx + d), press: () => this.openEditor(p.rhythmIdx) },
      { label: "New pattern", value: "", press: () => this.openEditor(null) },
      ...mods,
      // Note button: Gate = the note sounds while pressed; Sustain = notes build up while the chord is held
      { label: "Note", value: p.noteMode === "sustain" ? "Sustain" : "Gate", step: () => p.setNoteMode(p.noteMode === "sustain" ? "gate" : "sustain") },
      // Main screen: chord names in a zigzag, or a keyboard with the sounding notes
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
    // So changes can be heard while holding a chord
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
      // Firmware presets are never overwritten: a new one is saved
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

  // ---- Inputs ----
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
      e.cursor = e.steps.length; // stays on "Add" to add more
      e.dirty = true;
    } else if (action === "Del") {
      if (e.steps.length <= 1) { this.flash("Min 1 step"); return; }
      e.steps.splice(e.sel, 1);
      e.sel = Math.min(e.sel, e.steps.length - 1);
      e.cursor = e.steps.length + 1; // stays on "Del"
      e.dirty = true;
    } else if (action === "Save") {
      this.save();
    } else if (action === "Back") {
      this.closeEditor();
    }
  }

  // Steps that sound: the editor's while it is open
  liveSteps() { return this.edit ? this.edit.steps : null; }

  // ---- What the OLED shows ----
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
