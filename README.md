# ChordPlayer Simulator

Web simulator of the ChordPlayer (Swyng Daccorder), a MIDI chord controller built on a Raspberry Pi Pico:
seven keys in a zigzag for the seven chords of the scale, encoders for root, mode and octave,
chord modifiers, editable arpeggios and chord recommendations from Markov chains.

**Open it in your browser: https://jonalus-hub.github.io/chordplayer-sim/**

Sound comes from a synthesizer in the browser; in Chrome or Edge it can also send MIDI to other
software (the "Connect Web MIDI" button).

## Running it locally

The scripts are ES modules, so the folder has to be served over HTTP:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Credits

- Chord models trained on [Chordonomicon](https://github.com/spyroskantarelis/chordonomicon)
  (Kantarelis et al., 2024, [arXiv:2410.22046](https://arxiv.org/abs/2410.22046)), MIT license.
- The screen uses the Terminus font by Dimitar Zhekov, SIL Open Font License 1.1.

## Where each part comes from

| Part | Source |
|---|---|
| Bar-shaped case, OLED on the left, keys on the right | `ChordPlayer_3D/NX V2/Main_ZB.prt` (May 2026) |
| 15×29 mm keys in a zigzag every 20 mm, rows at ±11 mm, plate holes | `20260417_Switch_Mount_Plate_V4_7_buttons_with_Feet.stp` |
| Key with the degree engraved bottom right | `Key_V1_Long.stp` |
| 3 KY-040 encoders in a column, 25 mm apart | `20260402_2_Top_Half_RE_Test.stp` |
| 2.42" 128×64 OLED | `NX V2/Pictures/OLED_Top_View_2.png` (module dimensions) |
| 3 buttons under the screen (Mod 1–3 modifiers) | The 3 round holes in `Main_ZB`; their function was defined by the designer (2026-11-19) |

## What it simulates

| Firmware / project | Web |
|---|---|
| `chords.py`: 7 triad modes and DrumMode (the 7 "7th" modes were removed) | `js/chords.js` |
| `code.py`: encoders, polyphonic keys, per-pad notes in DrumMode, `update_display_text()` | `js/engine.js`, `js/display.js` |
| `terminalio.FONT` | `js/font.js` (Terminus 6×12) |
| `nextchord.py` | `js/nextchord.js` (only for Lydian and Locrian) |
| `rhythm.py` | `js/rhythm.js` (patterns as editable data) |
| Settings menu and arpeggio editor (proposed) | `js/arpmenu.js` |
| `.bin` models from `Chord_AI/export_base_models.py` | `models/*.bin.gz` + `js/ai.js` |
| USB-MIDI output | Web Audio synthesizer (`js/audio.js`) + optional Web MIDI (`js/midi.js`) |
| Case, keys, encoders | `js/device.js` (geometry in millimetres) |

## Markov chain recommendations (proposed)

The models are order-1 to order-3 Markov chains trained on Chordonomicon, one per mode and genre.
Each `.bin` is 146,224 bytes and is laid out for the Pico to read with `seek()`. Here they are
gzip-compressed and the browser decompresses them; the bytes are identical.

- Context: the last 3 chords played, as degrees relative to the root (`i`, `IV`, `VIIb`…).
  If order 3 has no data it falls back to order 2 and then 1, like `test_bin_models.py`.
- Each prediction is mapped to the key that plays that chord in the current mode. If the chord is not
  in the mode (for example a major `IV` in Aeolian), it is listed but no key lights up.
- Modes with a model: Ionian, Dorian, Phrygian, Mixolydian and Aeolian.
  Lydian and Locrian are not in the dataset and use `nextchord.py`.
- Genres: all, pop, rock, pop rock, alternative, country, electronic, jazz, metal, punk, rap, reggae, soul.
  On the device it changes with a press of the Mode encoder; the OLED shows it for 1.5 s in place of the mode.
- They show up as LEDs under the keys and as bars under the names on the OLED (both can be turned off).

## Settings (proposed)

They open by holding **any encoder for 1 s** (a ring fills up around it). The **Base** encoder (top)
picks the row and the **Mode** encoder (middle) changes its value right away, with no click; on the OLED
the value that can be changed sits between `< >`. A press is only needed to open the editor (Pattern row),
create a pattern (New pattern) or leave (Exit). Holding for 1 s again closes the menu; outside the editor
it also closes by itself after 20 s untouched.

| Row | What it does |
|---|---|
| Arp | Turns arpeggio mode on (on the firmware, the GP14 button) |
| Tempo | 40–300 BPM, in steps of 1 (on the firmware, the GP28 potentiometer sets `time_step` in seconds) |
| Pattern | Active arpeggio (Mode changes it and it plays right away); a press opens it in the editor |
| New pattern | A press opens the editor with a new pattern |
| Mod 1–3 | What each modifier does |
| Note | Note button: **Gate** (the note sounds while pressed) or **Sustain** (notes build up while the chord is held) |
| Note order | Order Note walks the chord in: **Up** (lowest to highest), **Down** (highest to lowest) or **Random** |
| Screen | Main screen: **Chords** (the 7 chords in a zigzag, like the firmware) or **Keys** (keyboard) |
| Exit | Closes |

## Keyboard view (proposed)

With Screen = Keys, the main screen keeps the root, mode and octave line, and below it draws a 2-octave
keyboard with the sounding notes inverted (white keys filled, black keys hollow). The last line names the
chord that is sounding (`Dm7`, `C + Em`…). The keyboard starts at the C of the chosen octave and, if a chord
does not fit, moves to the C below its lowest note; if something is still off the top, the name gets a ` >`.
With the arpeggio you can see the note of each step. DrumMode always shows the pad names.

## Editable arpeggios (proposed)

A pattern is a list of `[note, length]` steps: the note is the position in the chord (1–4, or `-` = rest)
and the length is in beats at the Settings tempo (1/4, 1/2, 3/4, 1, 1.5, 2, 3, 4; 1 = a quarter note). Up to 16 steps.

Opening the editor (a press on Pattern or New pattern) turns arpeggio mode on, so every change can be heard
while holding a chord. In the editor:

- **Base**: selected step. Past the last one come the actions **Add**, **Del**, **Save**, **Back**.
- **Mode**: the step's note (this is where the note order is edited).
- **Octave**: the step's length.
- **Press on a step**: picks it up to move it with Base; another press drops it.
- **Save**: the 4 firmware presets are never overwritten; saving one creates `User N`. `User N` presets are overwritten.
- **Back**, or closing the menu without saving, discards the changes (the title has a `*` while there are changes).

User presets are stored in the browser (`localStorage`); on the device they would go to a JSON file in flash,
which would require `boot.py` to mount the drive writable for the code. They can be deleted from the web panel.

## Chord modifiers (proposed)

Three buttons under the screen. Hold one (or several) **before** playing the chord key; pressed afterwards,
they do not change the chord that is already sounding. Each one does whatever Settings → Mod 1–3 says (saved in the browser):

| Option | Effect |
|---|---|
| 7th | Seventh from the mode (Dm → Dm7, G → G7, C → CM7 in Ionian) |
| add9 | Ninth from the mode; with 7th it is named 9 (CM9, Dm9) |
| add6 | Sixth from the mode |
| sus2 / sus4 | Second or fourth instead of the third |
| 5 (red) | Reduced: root, fifth and octave, no third |
| maj<>min | Swaps major ↔ minor (minor and diminished become major); the Markov chains see it as the chord that sounds |
| inv 1 / inv 2 | First or second inversion |
| bass | Adds the root an octave below |

Defaults: Mod 1 = 7th, Mod 2 = add9, Mod 3 = 5. While a modifier is held, the OLED header shows it in place
of the mode (`+7th+add9`, centered). The arpeggio walks through the notes of the extended chord.
To change what each one does: Settings, Base down to Mod 1–3 and Mode to pick the option.

## Note button: hand-played arpeggio (proposed)

A fourth button, to the right of the modifiers (the May 2026 CAD has no hole for it yet).

- If **Note is held when the chord key is pressed**, only the first note sounds.
- After that, **each press of Note plays the next note**; after the last one it goes back to the first.
- Settings → **Note order** picks the direction:
  - **Up** (default): from the lowest note to the highest.
  - **Down**: from the highest note to the lowest.
  - **Random**: a random note of the chord on each press, never the same one twice in a row.
- If **the chord is already sounding in full** (Note was not held when it was played), the chord keeps sounding and
  each press of Note plays one of its notes again on top, in the chosen order (another Note On for that note).
  With several chords, Note goes with the last one played; the automatic arpeggio, if running, also keeps going.
- Settings → **Note** picks what happens to the notes already played:
  - **Gate** (default): each note sounds while Note is held, so both rhythm and length are played by hand.
  - **Sustain**: the notes build up and keep sounding while the chord key is held; coming back to a note
    that is already sounding replays it.
- In both modes, **releasing the chord key stops every note** played with Note.
- It combines with the modifiers (Note + 7th walks the 4 notes) and takes priority over the automatic
  arpeggio for that chord. While it is held, the header shows `+Note`.
- On the computer keyboard it is `R`.

## Differences from firmware `fw-2026-04-07`

- No 7 "7th" modes (Ionian 7th…Locrian 7th): the Mode encoder goes through the 7 modes and DrumMode, and the
  seventh is added with the 7th modifier.
- The recommendations, genre, LEDs and OLED bars are proposals: the firmware does not call `update_chord_history()`.
- Turning Base, Mode or Octave stops every chord and replays the ones still held. The firmware only retriggers the first one, and changing mode stops nothing (notes can hang).
- The case has no Rhythm button (GP14), Pattern button (GP15) or potentiometer (GP28) from the firmware: their functions are in Settings.
- The tempo is in BPM (40–300) and `time_step` = 60 / BPM. The firmware reads `time_step` from the potentiometer (0–1 s) and only changes it if the ADC moves by more than 10000/65535.
- A step with a note the chord does not have (the 4th in a triad) is a rest and lasts its length; the firmware skips it without waiting.
- Drum pad notes are clamped to 0–127.
- The OLED header is a single line without labels (root on the left, mode centered and octave on the right), instead of `Base: C` and `Mode: Ionian`; the chord rows move up 4 px.

## Controls

Mouse or finger: drag an encoder (right or up = clockwise), use the scroll wheel or the arrow keys; a click presses the shaft
and holding it for 1 s opens Settings. The modifiers are held with another finger while playing the key.

`A S D F G H J` (or `1`–`7`) keys I–VII · `Z/X` Base · `C/V` Mode · `B/N` Octave · `M` press Mode (genre; hold 1 s = Settings) ·
`Q/W/E` hold Mod 1/2/3 · `R` Note · simulator shortcuts: `K` arpeggio, `L` next pattern, `,`/`.` tempo.
