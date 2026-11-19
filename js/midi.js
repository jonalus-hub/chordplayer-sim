// Optional Web MIDI output: the real ChordPlayer is a USB-MIDI device.
export class MidiOut {
  constructor(onChange) {
    this.access = null;
    this.port = null;
    this.onChange = onChange;
    this.status = "off";
  }

  async connect() {
    if (!navigator.requestMIDIAccess) { this.status = "unsupported"; this.onChange(); return; }
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
      this.access.onstatechange = () => this.onChange();
      this.status = "ready";
    } catch (e) {
      this.status = "denied";
    }
    this.onChange();
  }

  outputs() { return this.access ? [...this.access.outputs.values()] : []; }

  select(id) {
    this.port = this.outputs().find((o) => o.id === id) || null;
    if (this.port) {
      // initialize_midi_channels(): All Notes Off, Program 0, max volume, centered pan
      this.send([0xb0, 123, 0]);
      this.send([0xc0, 0]);
      this.send([0xb0, 7, 127]);
      this.send([0xb0, 10, 64]);
    }
  }

  send(bytes) { try { this.port?.send(bytes); } catch { /* puerto desconectado */ } }
  noteOn(note, vel, ch) { this.send([0x90 | ch, note, vel]); }
  noteOff(note, vel, ch) { this.send([0x80 | ch, note, vel]); }
}
