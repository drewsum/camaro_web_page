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
| Valley front wall | 1.15" thick behind the front face (.85" timing-chest recess + .30") | [est]; the window is the only opening into the valley |
| Main caps | [meas] photos 22, 24 and 435, scaled from the 2.9375" saddle: 6.9" wide; the centre hangs 3.1" below the pan face. The outer studs sit on shoulders 1.85" down (photo 435), so the outer studs are shorter than the inner ones (vertical stagger). Four vertical ARP studs each, inner +/-1.95", outer +/-3.00", with nuts and washers; long windage-tray studs on the inner positions of caps 3 and 4. Rear cap (#5, photo 435): runs to the rear face and carries the lower half of the seal bore. Its driver side is full depth and carries the oil-pump pad: a .95" counterbored outlet pocket .35" deep, with the .55" outlet through the cap into the block, a .25" dowel pin and the 7/16 pump stud. On the passenger side the outer stud stands on a full-depth round column. Pad sizes [est]. | Photos 22, 24, 41, 435 |
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

## Bellhousing face (crank centreline = 0,0), built

| Feature | X | Y | Source |
|---|---|---|---|
| Lower bolt | ∓7.800 | 0.440 | [forum] |
| Dowel | ∓7.690 | 2.320 | [forum] |
| Upper side bolt | ∓7.800 | 4.200 | [forum] |

## Still to do, and the reference for each

| Feature | Status | Plan |
|---|---|---|
| Front face | Built from `refs/front_face.json`. All values [meas] from Drew's photos 30 and 29 (repo, also in his build album). Photo 30's camera was solved from the 3/8" timing-chain pitch (5 and 8 pitches), the 5.147" cam-to-crank distance and the two deck edges (9.800" planes): rms 12 px. Photo 29 was mapped on the shared holes (residual < .07"). Error about +/-.15". Face coords x across, z above the crank centreline: water inlets 1.80" at (+/-4.91, 7.04); water-pump bolts (3/8-16) at (+/-4.89, 8.21) and (+/-4.88, 5.83); Gen VI 6-bolt cover (1/4-20) at (+/-2.75, 8.01), (+/-4.17, 4.87), (+/-3.23, .30); cover dowels at (+/-3.69, 1.23), pins .30" proud; accessory holes at (+/-5.51, 2.82) on a boss and (+/-5.62, .67); timing chest recessed .85" [est], painted black, with the valley window (1.32" at z 7.60), cam-plate bolts (z 6.74 and 3.44), hex lifter-gallery plugs (+/-1.22, 6.46) and the main-gallery plug (-1.53, 5.57); water-pump leg pockets .40" deep [est]; the machined plate is bare and the cast area outside it sits .12" back [est]; the plate is 6.25" half-wide down to the pan face. Overlay check: the model's features projected through the solved camera land on the photo's holes and edges. Not yet matched: the left leg pocket is the right one mirrored (the real left one is larger), and the cam retainer plate itself is not modelled. | Photos 29, 30; album photos 319-327 and 343-345 for later checks; `refs/front_photo_fit.py` |
| Bellhousing face | Built from `refs/rear_face.json`. GM V8 pattern [spec]: 3/8-16 bolts at (+/-7.800, .440), (+/-7.800, 4.200), (+/-4.100, 7.020); .625" dowel pins at (+/-7.690, 2.320), standing .55" proud [est]. The pattern's (0, 9.220) hole would sit on the block's top edge and is not drilled. The lower ears are 8.35" half-wide and 1.25" deep [est]. One-piece rear seal bore 5.125" (Fel-Pro 2920 OD) x .42" deep, with a 4.30" clearance bore behind it [est]. The rear main cap now runs to the rear face and carries the lower half of the seal bore (photo 435). Machined rear face is bare. Not done: the rear oil-gallery plugs. | jalopyjournal / Chevy Power coordinates; Fel-Pro 2920 specs; album photo 435 |
| Oil pan face and rail | Built. The pan face is one flat plane at the crank centreline (Drew). Rail flange half-widths: outer 5.95", inner 4.75" [meas]. Bolt holes [meas] at x = +/-5.40", y = 2.15, 5.45, 8.20, 10.88, 13.52, 16.11, 18.70, 21.52, plus a front pair at (+/-4.88, 23.58); 5/16-18, .75" deep. Measured from album photo 431: the camera was solved from the stud nuts on caps 1-4 (rms 10 px), the pan plane rectified to a top view, and the holes found automatically. The model's holes projected back onto the photo land on the real ones (`refs/pan_photo_fit.py`). | Album photos 431, 435; `refs/pan_rail.json` |
| Bottom details | Built from `refs/bottom.json`. Rail ears [meas] photo 431: driver side with a .375" hole at (-6.47, 20.81), passenger side with a .85" through hole at (7.03, 20.92). Oil filter pad [meas] position and size, photo 431: driver-side rear corner, 3.9" across, centred at (-7.4, 2.05), facing the pan, with a 13/16" centre thread and an oil port; boss height and ports [est]. Starter pad [est]: passenger-side rear corner, three 3/8-16 holes (straight pair plus the offset hole). Oil pump [est]: 7/16 stud into the rear cap, outlet through the cap into the block (O-ring at the joint, photo 22). Windage-tray studs [meas] photo 431: the inner studs on caps 3 and 4 run 2.5" longer [est]. | Album photos 22, 431 |
| Sides and valley | Built from `refs/sides.json`. Freeze plugs: 3 per side, 1.75", brass cups set .08" in; y [meas] photo 431 (left 19.1, 14.4, 9.75; right 17.9, 13.25, 8.4); height up the jacket wall [est]. Motor-mount holes: 3 x 3/8-16 per side round the front plug on spot-faced pads [est]. Fuel-pump boss on the passenger side at the front, with a 1.65" opening and 2 x 3/8-16 [est]. 16 lifter bores, .8437" [spec], tilted 30 deg through the cam centre so they open from the valley floor into the cam tunnel [est geometry]. Distributor bore 1.0" at the rear of the valley, down to the cam [est]. Rear oil-gallery plugs on the same gallery lines as the front ones [est]. | Photo 431; online BBC references |
| Lifter retainer bosses, valley shape detail | Lifter bores built (see Sides and valley); the valley is still flat-floored [est] | Photo 27 (the lifters in the valley), album photos 545-547 (bare valley) |
| Main caps | [meas] photos 22 and 24, scaled from the 2.9375" saddle: 6.9" wide, hanging 3.1" below the pan face into the pan. Four vertical studs each, inner ±1.95" and outer ±3.00", with nuts and washers. Bulkheads end at the parting line, and the crankcase is open full-width below it (straight 4-bolt, no side bolts). Not done: cap face detail and the rear cap's oil-pump boss. | Photos 22, 24 and 41 |
| Bulkhead thickness, bore length | [est] | Photo 22 |

## Parts (separate meshes)

1. `Block`: the casting, with decks, bores, line bore, cam tunnel, lifter valley, crankcase bays and deck features.
2. `MainCap_1`–`MainCap_5`: line-bored with the block; bare iron.
3. `MainStuds_1`–`MainStuds_5`: ARP 235-5701 studs, washers and nuts, black oxide.

## Reference meshes (not used for geometry)

- `naturally_aspirated_454_cid_v8.glb` and `blown_454_cid_v8.glb`: "454 cid V8" by Jorma Rysky, CC BY 4.0 (https://skfb.ly/p7FsJ, https://skfb.ly/p7Fss).
- The isolated block from the NA model is `Ref454_Block` in `../bbc_block_work.blend`. It is a low-detail shell with no bores or holes, about 23.7 × 17.6 × 10.6 in.


## Known mesh issue

The EXACT collection boolean leaves non-manifold edges (about 890 before the front face, about 1,140 after), mostly interior faces where cutters meet coplanar surfaces. They don't show in renders. Clean them up before any mesh export that needs a watertight solid (try applying the cutters one at a time).
