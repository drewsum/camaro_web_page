# Gen VI big-block Chevy cylinder block: parts breakdown and spec sheet

The block in Drew's 540 is GM **P/N 19170540**, the bare block of the ZZ502 crate engine the build started from (build doc, parts list). The machine shop bored it .030" over, to a 4.4990" average (build sheet). The front face is cast **"MK VI"** (photo 29).

`build_block.py` builds the block from this file. Every number has a source tag:

- **[spec]**: published by GM, a block maker or a gasket maker.
- **[meas]**: measured, from Drew's build sheet, the gasket image or his photos.
- **[derived]**: worked out from other numbers.
- **[forum]**: a single secondhand source.
- **[est]**: a placeholder until a reference is found. It is listed under "Still to do".

## Axes and origin

- **Origin:** the crankshaft centreline, at the rear (bellhousing) face.
- **Directions:** +Y is forward, +X is the passenger side (right bank, cylinders 2-4-6-8), +Z is up.
- **Units:** the model is in metres (1 Blender unit = 1 m). This file and the script use inches.

## Block-level dimensions

| Item | Value | Source |
|---|---|---|
| Deck height | 9.800" | [spec] GM, Dart, Edelbrock |
| Bank angle | 90° | [spec] |
| Bore spacing | 4.840" | [spec] |
| Finished bore | 4.4990" average; taper ≤ .0005" | [meas] build sheet |
| Main bearing housing bore | 2.9375" | [spec] |
| Main journal | 2.750" nominal; 2.7427–2.7434" measured | [spec] / [meas] |
| Cam bearing housing bore | 2.120" | [spec] |
| Cam journal | 1.949" | [meas] build sheet |
| Rear cam plug | 2.218" | [spec] Dart notes |
| Lifter bore | .8437" (.8437–.8440" measured) | [spec] / [meas] |
| Crank-to-cam centre distance | 5.147" | [derived] Cloyes: 5.551" for Merlin blocks with the cam raised about .40" |
| Bank stagger (left bank forward) | 1.000" | [derived] BBC rod big-end width .990–.991" + .021" side clearance |
| Cylinder 1 to front face | 3.65" | [meas] the gasket front edge sits flush with the front face (photo 38) |
| Length, front face to bellhousing face | 24.0" | [forum]; the model comes out 24.01" |
| Width across the deck edges | 19" | [forum]; the model comes out 19.35" |
| Rear main seal | 1-piece; Gen VI pan and 6-bolt front cover | [spec] |
| Main caps | 4-bolt, ARP 235-5701 studs, 110 ft-lb | [spec] / build doc |
| Head studs | ARP 235-4713, 7/16" | build doc |

## Decks (head gasket face): measured from the gasket Drew used

- **Source:** Cometic C5333 (the .027" version is on Drew's engine). Its 2500 px product image (`refs/cometic_C5333_H1177MLS.jpg`) was measured with `refs/export_deck.py`, producing `refs/deck_c5333.json`.
- **Scale:** the four bore centres, 4.840" apart: 98.5 px/in, ±1.7 px spread between bores. Expect about ±.02" on positions.
- **Orientation:** the product image is the left-bank deck seen square-on, front at left, valley at top. Photo 38 confirms it: the triangle cut-out and rivet are at the front on the valley side, and the long slot is at the front on the exhaust side. The right bank is the mirror image.

Per deck:

- **17 head-stud holes, 7/16-14 blind-tapped:**
  - 4 along the exhaust edge, v ≈ −2.74";
  - 3 + 3 between the bores on the exhaust side, v ≈ −2.21" and −1.25";
  - 3 on the valley side, v ≈ +1.9 to +2.1";
  - 4 staggered intake-side holes, v ≈ +2.7 to +3.4", two of them on raised tabs.
- **One locating dowel:** a .609" counterbore around the stud at u = 12.07", v = −2.21". This is the hollow head dowel (Pioneer 839005).
- **10 coolant openings:**
  - a 0.21–0.25" steam hole beside each exhaust-edge stud;
  - larger ports at the front (a .76" slot, a .66" and a .27" hole);
  - larger ports at the rear (.68", .67" and .43").
  - The outlines are taken from the gasket. The ports are modelled as pockets, because the water jacket isn't modelled.
- **Not on the deck:** the two triangular gasket ears overhang the lifter valley. Photo 38 shows the valley through them.

## Bellhousing face (crank centreline = 0,0), not built yet

| Feature | X | Y | Source |
|---|---|---|---|
| Lower bolt | ∓7.800 | 0.440 | [forum] |
| Dowel | ∓7.690 | 2.320 | [forum] |
| Upper side bolt | ∓7.800 | 4.200 | [forum] |

## Still to do, and the reference for each

| Feature | Status | Plan |
|---|---|---|
| Front face: water-pump inlet ports, 6-bolt cover pattern, two dowels | Not built | Photo 29 shows it nearly square-on, but has no in-plane scale. Get a Gen VI front cover gasket or water-pump gasket image and scale from it. |
| Bellhousing flange and starter bosses | Not built | Forum coordinates above, plus photo 22 and online rear-face photos |
| Block ends below the crank | Built: from the mid-plane of cap 1 forward and of cap 5 back, the block stops at the parting line, where the pan's end seals meet the block. There is no material below it (Drew). | Drew |
| Pan rail outline and bolt pattern | Rail height [meas] z = −2.25": the caps stand about .85" proud of it in photos 22, 24 and 41. The outline is [est]. | GM 19213986 one-piece pan gasket image (Drew's part) |
| Side profile: jacket wall, skirt, freeze plugs (3 per side), oil filter pad, fuel pump pad, motor mount bosses | [est] simple section | Photos 22 and 26, plus bare-block photos online |
| Lifter bores (16, .8437"), lifter retainer bosses, valley shape | Flat-floored valley [est] | Photo 27 (the lifters in the valley), plus cam position |
| Main caps | [meas] photos 22 and 24, scaled from the 2.9375" saddle: 6.9" wide and 3.1" deep below the parting line, so they hang into the pan. Four vertical studs each, inner ±1.95" and outer ±3.00", with nuts and washers. Bulkheads end at the parting line, and the crankcase is open full-width below it (straight 4-bolt, no side bolts). Not done: cap face detail and the rear cap's oil-pump boss. | Photos 22, 24 and 41 |
| Bulkhead thickness, bore length | [est] | Photo 22 |

## Parts (separate meshes)

1. `Block`: the casting, with decks, bores, line bore, cam tunnel, lifter valley, crankcase bays and deck features.
2. `MainCap_1`–`MainCap_5`: line-bored with the block; bare iron.
3. `MainStuds_1`–`MainStuds_5`: ARP 235-5701 studs, washers and nuts, black oxide.

## Reference meshes (not used for geometry)

- `naturally_aspirated_454_cid_v8.glb` and `blown_454_cid_v8.glb`: "454 cid V8" by Jorma Rysky, CC BY 4.0 (https://skfb.ly/p7FsJ, https://skfb.ly/p7Fss).
- The isolated block from the NA model is `Ref454_Block` in `../bbc_block_work.blend`. It is a low-detail shell with no bores or holes, about 23.7 × 17.6 × 10.6 in.
