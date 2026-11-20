# Engine sound from engine-sim

The Sound toggle plays loops rendered offline with
[engine-sim](https://github.com/ange-yaghi/engine-sim) (MIT), from a model of
the 540 in `camaro_540.mr`. engine-sim itself isn't shipped to the browser.
The site plays 38 short MP3 loops (about 1.1 MB), loaded only when Sound is
turned on.

## The engine model (`camaro_540.mr`)

Values from the Engine Build page:

- 4.500 × 4.250 (540 ci), 6.535" rods, 9.8" deck, 9.4:1
- AFR 2110 heads (117 cc), using AFR's published flow numbers
- Comp custom cam: 242/250 @ .050, .622/.618, 110 LSA, +4
- AFR dual plane, 850 cfm double pumper
- HEI at 15° initial, 36° total
- Hooker long tubes, 3.25" true duals with Magnaflows
- M22 close ratio, 3.91 rear, 275/60R15

Calibrated against the April 2026 dyno pull:

| rpm  | dyno (hp / ft-lb) | sim (hp / ft-lb) |
|------|-------------------|------------------|
| 3800 | 425 / 575         | 507 / 701        |
| 4400 | 520 / 615         | 591 / 705        |
| 5000 | 570 / 595         | 608 / 638        |
| 5400 | 610 / 590         | 606 / 589        |
| 5600 | 515 / 480         | 598 / 561        |

- Peak power and where peak torque falls both match.
- The midrange runs about 15% rich. The dyno shows a steep fall-off above 5400, probably valvetrain or fuel delivery, which engine-sim doesn't model.
- The harmonic cam lobe matches the 0.050" durations exactly, but its seat timing comes out about 10° shorter than the card.
- Idle is about 920 rpm, hunting ±25 rpm.

## How it plays

- **Rendering:** each clip is the engine held on engine-sim's dyno at one rpm (1000–6500 in 500s), at one of three throttles:
  - wide open (`on_*`)
  - light cruise (`mid_*`)
  - closed (`off_*`, overrun)
- **Looping:** `make_loops.py` cuts each clip to a whole number of engine cycles near 1 s and crossfades the seam. It stores two copies back to back, so encoder padding never lands in the loop.
  - Each clip is normalised on its own.
  - Its original level goes in `manifest.json`, and the player applies 40% of that range.
- **Playback (`web/src/audio/enginePlayer.ts`):** blends the nearest rpm and throttle loops and pitch-shifts them to the exact rpm.
- **Drivetrain (`web/src/audio/drivetrain.ts`):** gets rpm, gear and throttle from each scene's drive profile, with shifts, clutch slip pulling away and the rev limiter.

## Regenerating

engine-sim is a Windows/MSVC app. This builds just its simulation core and
script compiler on Linux, with clang, plus a headless renderer (`main.cpp`):

```sh
git clone --recurse-submodules https://github.com/ange-yaghi/engine-sim
cd engine-sim && git checkout 85f7c3b
git apply ../engine-sim-headless.patch     # MSVC-isms; fixed frame stepping
mkdir headless && cp ../main.cpp ../CMakeLists.txt headless/
sudo apt install clang flex bison libboost-filesystem-dev googletest
cmake -S headless -B headless/build -DCMAKE_C_COMPILER=clang -DCMAKE_CXX_COMPILER=clang++ \
      -DFETCHCONTENT_SOURCE_DIR_GOOGLETEST=/usr/src/googletest
make -C headless/build es-render
mkdir work
python3 ../render.py headless/build/es-render ../camaro_540.mr   # ~5 min on 2 cores
python3 ../make_loops.py <repo>/web/public/audio/engine
```

You can also run `es-render` directly:

- `es-render camaro_540.mr dyno <dir> 3000,4000,5000 1.0 2` prints a torque and power line for each rpm, which is useful when changing the model.
- `program` mode drives a free-running engine from a throttle script.
