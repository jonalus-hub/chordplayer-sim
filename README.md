# ChordPlayer Simulator

Simulador web del ChordPlayer (Swyng Daccorder), un controlador MIDI de acordes con Raspberry Pi Pico:
siete teclas en zigzag para los siete acordes de la escala, encoders para tónica, modo y octava,
ampliadores de acorde, arpegios editables y recomendaciones de acordes con IA.

**Ábrelo en el navegador: https://jonalus-hub.github.io/chordplayer-sim/**

El sonido sale de un sintetizador del navegador; en Chrome o Edge también puede mandar MIDI a otro
programa (botón "Conectar Web MIDI").

## Ejecutarlo en local

Los scripts son módulos ES, así que hay que servir la carpeta por HTTP:

```bash
python3 -m http.server 8000   # y abre http://localhost:8000
```

## Créditos

- Modelos de acordes entrenados con [Chordonomicon](https://github.com/spyroskantarelis/chordonomicon)
  (Kantarelis et al., 2024, [arXiv:2410.22046](https://arxiv.org/abs/2410.22046)), licencia MIT.
- Pantalla con la fuente Terminus de Dimitar Zhekov, licencia SIL Open Font License 1.1.

## De dónde sale cada parte

| Parte | Fuente |
|---|---|
| Carcasa en barra, OLED a la izquierda, teclas a la derecha | `ChordPlayer_3D/NX V2/Main_ZB.prt` (mayo 2026) |
| Teclas 15×29 mm en zigzag cada 20 mm, filas a ±11 mm, agujeros de la placa | `20260417_Switch_Mount_Plate_V4_7_buttons_with_Feet.stp` |
| Tecla con el grado grabado abajo a la derecha | `Key_V1_Long.stp` |
| 3 encoders KY-040 en columna, cada 25 mm | `20260402_2_Top_Half_RE_Test.stp` |
| OLED 2.42" 128×64 | `NX V2/Pictures/OLED_Top_View_2.png` (medidas del módulo) |
| 3 botones bajo la pantalla (ampliadores Mod 1–3) | Los 3 agujeros redondos de `Main_ZB`; su función la definió el usuario (2026-11-19) |

## Qué simula

| Firmware / proyecto | Web |
|---|---|
| `chords.py`: 7 modos de tríadas y DrumMode (los 7 modos "7th" se han quitado) | `js/chords.js` |
| `code.py`: encoders, teclas polifónicas, notas por pad en DrumMode, `update_display_text()` | `js/engine.js`, `js/display.js` |
| `terminalio.FONT` | `js/font.js` (Terminus 6×12) |
| `nextchord.py` | `js/nextchord.js` (solo para Lydian y Locrian) |
| `rhythm.py` | `js/rhythm.js` (patrones como datos editables) |
| Menú de ajustes y editor de arpegios (propuesta) | `js/arpmenu.js` |
| Modelos `.bin` de `Chord_AI/export_base_models.py` | `models/*.bin.gz` + `js/ai.js` |
| Salida USB-MIDI | Sintetizador Web Audio (`js/audio.js`) + Web MIDI opcional (`js/midi.js`) |
| Carcasa, teclas, encoders | `js/device.js` (geometría en milímetros) |

## Recomendaciones con IA (propuesta)

Los modelos son cadenas de Markov de orden 1 a 3 entrenadas con Chordonomicon, uno por modo y género.
Cada `.bin` ocupa 146 224 bytes y está pensado para que la Pico lo lea con `seek()`. Aquí van comprimidos
con gzip y el navegador los descomprime. Son idénticos byte a byte.

- Contexto: los 3 últimos acordes tocados, como grado relativo a la tónica (`i`, `IV`, `VIIb`…).
  Si no hay datos para el orden 3 se baja al 2 y luego al 1, igual que `test_bin_models.py`.
- Cada predicción se asigna a la tecla que toca ese acorde en el modo actual. Si el acorde no está
  en el modo (por ejemplo `IV` mayor en Aeolian), se muestra pero no se ilumina ninguna tecla.
- Modos con modelo: Ionian, Dorian, Phrygian, Mixolydian y Aeolian.
  Lydian y Locrian no aparecen en el dataset y usan `nextchord.py`.
- Géneros: todos, pop, rock, pop rock, alternative, country, electronic, jazz, metal, punk, rap, reggae, soul.
  En el aparato se cambia pulsando el encoder Modo; la OLED lo muestra 1,5 s en la línea de modo.
- Se ven como LEDs bajo las teclas y como barras bajo los nombres en la OLED (ambas cosas se pueden apagar).

## Ajustes (propuesta)

Se abren manteniendo **cualquier encoder 1 s** (un anillo se va llenando alrededor). El encoder **Base**
(arriba) elige la fila y el **Modo** (medio) cambia su valor al momento, sin clic; en la OLED el valor que
se puede cambiar va entre `< >`. Un toque solo hace falta para abrir el editor (fila Pattern), crear un
patrón (New pattern) o salir (Exit). Mantener 1 s otra vez cierra el menú; fuera del editor también se
cierra solo tras 20 s sin tocar nada.

| Fila | Qué hace |
|---|---|
| Arp | Activa el modo arpegio (en el firmware, el botón GP14) |
| Tempo | 40–300 BPM, de 1 en 1 (en el firmware, el potenciómetro GP28 fija `time_step` en segundos) |
| Pattern | Arpegio activo (Modo lo cambia y suena al momento); un toque lo abre en el editor |
| New pattern | Un toque abre el editor con un patrón nuevo |
| Mod 1–3 | Qué hace cada ampliador |
| Note | Botón Note: **Gate** (la nota suena mientras se pulsa) o **Sustain** (se acumulan mientras se mantiene el acorde) |
| Screen | Pantalla principal: **Chords** (los 7 acordes en zigzag, como el firmware) o **Keys** (teclado) |
| Exit | Cierra |

## Vista de teclado (propuesta)

Con Screen = Keys, la pantalla principal mantiene la línea de tónica, modo y octava, y debajo dibuja un teclado
de 2 octavas con las notas que suenan en negativo (blancas rellenas, negras huecas). La última línea dice qué
acorde suena (`Dm7`, `C + Em`…). El teclado empieza en el Do de la octava elegida y, si un acorde no cabe, se
recoloca en el Do bajo su nota más grave; si aun así algo queda fuera por arriba, el nombre lleva ` >`.
Con el arpegio se ve la nota que suena en cada paso. En DrumMode se ven siempre los nombres de los pads.

## Arpegios editables (propuesta)

Un patrón es una lista de pasos `[nota, duración]`: la nota es la posición en el acorde (1–4, o `-` = silencio)
y la duración va en pulsos al tempo de Ajustes (1/4, 1/2, 3/4, 1, 1.5, 2, 3, 4; 1 = una negra). Máximo 16 pasos.

Al abrir el editor (toque en Pattern o New pattern) se enciende el modo arpegio, así que manteniendo un
acorde se oye cada cambio. En el editor:

- **Base**: paso seleccionado. Pasado el último se llega a las acciones **Add**, **Del**, **Save**, **Back**.
- **Modo**: nota del paso (aquí se edita el orden de las notas).
- **Octava**: duración del paso.
- **Toque sobre un paso**: lo coge para moverlo con Base; otro toque lo suelta.
- **Save**: los 4 presets del firmware no se sobrescriben; al guardarlos se crea `User N`. Los `User N` sí se sobrescriben.
- **Back** o cerrar el menú sin guardar descarta los cambios (el título lleva `*` mientras hay cambios).

Los presets de usuario se guardan en el navegador (`localStorage`); en el aparato irían a un JSON en la flash,
lo que obligaría a que `boot.py` monte la unidad con escritura para el código. Desde el panel web se pueden borrar.

## Ampliadores de acorde (propuesta)

Tres botones bajo la pantalla. Se mantiene uno (o varios) **antes** de tocar la tecla de acorde; si se pulsan
después, el acorde que ya suena no cambia. Cada uno hace lo que diga Ajustes → Mod 1–3 (se guarda en el navegador):

| Opción | Efecto |
|---|---|
| 7th | Séptima del modo (Dm → Dm7, G → G7, C → CM7 en Ionian) |
| add9 | Novena del modo; con 7th se nombra 9 (CM9, Dm9) |
| add6 | Sexta del modo |
| sus2 / sus4 | Segunda o cuarta en lugar de la tercera |
| 5 (red) | Reducido: raíz, quinta y octava, sin tercera |
| maj<>min | Cambia mayor ↔ menor (menor y disminuido pasan a mayor); la IA lo ve como el acorde que suena |
| inv 1 / inv 2 | Primera o segunda inversión |
| bass | Añade la raíz una octava abajo |

Por defecto: Mod 1 = 7th, Mod 2 = add9, Mod 3 = 5. Mientras hay un ampliador pulsado, la cabecera de la OLED
lo dice en el sitio del modo (`+7th+add9`, centrado). El arpegio recorre las notas del acorde ampliado.
Para cambiar qué hace cada uno: Ajustes, Base hasta Mod 1–3 y Modo para elegir la opción.

## Botón Note: arpegio a mano (propuesta)

Un cuarto botón, a la derecha de los ampliadores (en el CAD de mayo de 2026 todavía no tiene agujero).

- Si **Note está pulsado al tocar la tecla de acorde**, solo suena la primera nota (la más grave).
- Después, **cada pulsación de Note toca la nota siguiente**; tras la última vuelve a la primera.
- Si **el acorde ya suena entero** (Note no estaba pulsado al tocarlo), el acorde sigue sonando y cada pulsación de
  Note vuelve a tocar encima una de sus notas, empezando por la primera (se manda otro Note On de esa nota). Con
  varios acordes, Note va con el último tocado; el arpegio automático, si sonaba, también sigue.
- Ajustes → **Note** elige qué pasa con las notas ya tocadas:
  - **Gate** (por defecto): cada nota suena mientras Note está pulsado, así que el ritmo y la duración van a mano.
  - **Sustain**: las notas se acumulan y siguen sonando mientras se mantiene la tecla de acorde; al volver a una
    nota que ya suena, se vuelve a tocar.
- En los dos modos, **soltar la tecla de acorde apaga todas las notas** tocadas con Note.
- Se combina con los ampliadores (Note + 7th recorre las 4 notas) y tiene prioridad sobre el arpegio
  automático para ese acorde. Mientras está pulsado, la cabecera muestra `+Note`.
- En el teclado del ordenador es la `R`.

## Diferencias con el firmware `fw-2026-04-07`

- Sin los 7 modos "7th" (Ionian 7th…Locrian 7th): el encoder Modo recorre los 7 modos y DrumMode, y la
  séptima se añade con el ampliador 7th.

- Las recomendaciones, el género, los LEDs y las barras de la OLED son propuestas: el firmware no llama a `update_chord_history()`.
- Al girar Base, Modo u Octava se cortan todos los acordes y se vuelven a tocar los que siguen pulsados. El firmware solo reengancha el primero, y al cambiar de modo no apaga nada (puede dejar notas colgadas).
- La carcasa no tiene el botón Ritmo (GP14), el botón Patrón (GP15) ni el potenciómetro (GP28) del firmware: sus funciones están en Ajustes.
- El tempo va en BPM (40–300) y `time_step` = 60 / BPM. El firmware lee `time_step` del potenciómetro (0–1 s) y solo lo cambia si el ADC varía más de 10000/65535.
- Un paso con una nota que el acorde no tiene (la 4.ª en una tríada) es silencio y dura lo suyo; el firmware lo salta sin esperar.
- Las notas de los pads de batería se limitan a 0–127.
- La cabecera de la OLED va en una sola línea y sin rótulos (tónica a la izquierda, modo centrado y octava a la derecha), en lugar de `Base: C` y `Mode: Ionian`; las filas de acordes suben 4 px.

## Controles

Ratón o dedo: arrastra un encoder (derecha o arriba = horario), usa la rueda o las flechas; un clic pulsa el eje
y mantenerlo 1 s abre Ajustes. Los ampliadores se mantienen con otro dedo mientras se toca la tecla.

`A S D F G H J` (o `1`–`7`) teclas I–VII · `Z/X` Base · `C/V` Modo · `B/N` Octava · `M` pulsar Modo (género; mantener 1 s = Ajustes) ·
`Q/W/E` mantener Mod 1/2/3 · `R` Note · atajos del simulador: `K` arpegio, `L` patrón siguiente, `,`/`.` tempo.
