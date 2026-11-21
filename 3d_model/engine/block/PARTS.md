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
| Main caps | [meas] photos 22, 24 and 435, scaled from the 2.9375" saddle: 6.9" wide; the centre hangs 3.1" below the pan face. The outer studs sit on shoulders 1.85" down (photo 435), so the outer studs are shorter than the inner ones (vertical stagger). Four vertical ARP studs each, inner +/-1.95", outer +/-3.00", with nuts and washers; long windage-tray studs on the inner positions of caps 3 and 4. Rear cap (#5, photo 435): runs to the rear face and carries the lower half of the seal bore. Its driver side is full depth and carries the oil-pump pad: a .95" counterbored outlet pocket .35" deep, with the .55" outlet through the cap into the block, a .25" dowel pin and the 7/16 pump stud. On the passenger side the outer stud stands on a full-depth round column. Pad sizes [est]. Its rear end (y 0–.25) is turned to an arc about the crank (r 3.10), the curved section the pan's rear gasket seals against (Drew; length [est]). | Photos 22, 24, 41, 435 |
| Head studs | ARP 235-4713, 7/16" | build doc |

## Decks (head gasket face): the block's own deck, from Drew's photo, with bolt holes from the gasket

The deck started as the Cometic C5333 gasket (the .027" version is on Drew's engine), but the block's machined deck and its water ports differ from the gasket. They are now traced from Drew's photo of the bare left-bank deck, PXL_20251220_223513946 (`refs/deck_block.json`, overlay `refs/deck_block_overlay.png`).

- **Gasket data:** its 2500 px product image (`refs/cometic_C5333_H1177MLS.jpg`) was measured with `refs/export_deck.py`, producing `refs/deck_c5333.json` (98.5 px/in from the 4.840" bore spacing, about ±.02" on positions). It still supplies the bolt-hole positions and the exhaust-side and end outline.
- **Photo:** rectified with a homography fitted to the four bore rims (4.499" bores, 4.840" apart). The rims fit to .011" rms. The gasket's bolt holes then land on the photo's holes, which checks the fit. Traced at 100 px/in, so expect about ±.03".
- **Orientation:** front at left, valley at top (u from the cylinder 1 centre towards the rear, v across the deck towards the valley). The right deck is the left deck turned 180 deg about the vertical (u becomes 14.52 - u from cylinder 2), not its mirror image: BBC heads fit either bank, so the stud and port pattern turns with the head (`deck_pt`, and ../heads/PARTS.md). It was mirrored until the heads were modelled; the turned pattern is not symmetric front to rear, so the right deck's studs, ports and dowels moved.

Per deck:

- **Valley edge:** traced from the photo, v = 3.0–3.5". It bulges out round the valley-side ports and dips beside the lifter bosses. It ends at v = 3.35–3.40" at the front and rear. The gasket's two triangular ears and the two bolt holes in them (v ≈ 3.4") are not on the block.
- **Valley wall:** drops from the deck edge straight into the valley floor, parallel to the bores, with no ledge between the deck and the valley. The edge's bulges run down the wall as flutes (photo above, album 351/352). The wall itself sits at v = 3.0".
- **12 head-stud holes, 7/16-14 blind-tapped:** 4 along the exhaust edge (v ≈ −2.74"), 3 between the bores on the exhaust side (v ≈ −1.25"), 3 on the valley side (v ≈ +1.9 to +2.1") and 2 at v ≈ +2.72" (cylinders 1 and 5).
- **Water ports, all larger than the gasket's holes, modelled as .70" pockets** (the water jacket isn't modelled):
  - 3 exhaust-side triangles between the bores, about 2.3 × .8". The gasket's round holes at v = −2.22" sit inside them, so those are not bolt holes.
  - 3 valley-side kidneys between the bores, about 1.6 × .9", and a rounded triangle behind cylinder 7.
  - At the front: a 1.3" tall slot, a .66" round port and a .32" hole.
  - At the rear: a 1.0 × 1.15" square slot, a small triangle, a .50" round port and a .42" hole.
  - Four .32" steam holes along the exhaust edge (gasket .21–.25").
  - A shallow cast recess at the front, which is not a through port (the gasket's front slot opens onto it).
- **Dowels:** .609" counterbores round the front and rear steam holes on the exhaust edge (u = .42" and 14.91"), where the photo shows counterbore rings. The gasket's dowel hole is inside a triangle port, so it isn't used.
- **China walls and the end strips:** the china-wall tops are one flat plane at z = 10.78". That is where the deck planes reach v = 5.45", the top of the gasket's end ears, which cover the strips. The walls are thin at the top: .40" at the rear (y = 1.90–2.30") and .65" at the front (y = 23.35–24.00"). Their ends lie in the deck planes, so at each end of the left deck a narrow strip of the deck plane runs on up from the deck to the wall top. Those are the light strips in the photo, .43" wide at the rear and .62" at the front. On the right bank (staggered 1" back) the strips start where the walls cross its deck. Below z = 8.90" the front wall keeps its 1.15" thickness behind the timing chest. The valley now ends at the rear wall's inner face, y = 2.30".
  - **How it was measured:** the photo's camera was solved from the deck homography (focal length 1545 px, position (−22.7, 27.1, 21.6)"). Projected from that camera, the rear wall's top edges land on y = 1.9" and 2.3" at z = 10.78". Both strips land on the photo's strips. A render from that camera overlays the photo (`album/renders/photo_cam_model.png`).
  - **Distributor:** the same camera puts the distributor bore on the centreline 3.7" from the rear face, just ahead of the wall, with its boss top about .85" above the valley floor. It was 1.35" [est] before.
- **Spider pillars:** the four lifter-retainer bosses are slim pillars (.60") standing about .9" above the lifter-boss tops, well below the deck.

What differs from the photo:
- The photo shows the spider pillars beside the driver-side lifter bosses. The model keeps them on the centreline, because their positions in plan can't be measured from one view.
- The valley-side lifter bosses are the earlier estimate from photo 545.

## Bellhousing face (crank centreline = 0,0), built

| Feature | X | Y | Source |
|---|---|---|---|
| Lower bolt | ∓7.800 | 0.440 | [forum] |
| Dowel | ∓7.690 | 2.320 | [forum] |
| Upper side bolt | ∓7.800 | 4.200 | [forum] |

## Still to do, and the reference for each

| Feature | Status | Plan |
|---|---|---|
| Front face | Built from `refs/front_face.json`. All values [meas] from Drew's photos 30 and 29 (repo, also in his build album). Photo 30's camera was solved from the 3/8" timing-chain pitch (5 and 8 pitches), the 5.147" cam-to-crank distance and the two deck edges (9.800" planes): rms 12 px. Photo 29 was mapped on the shared holes (residual < .07"). Error about +/-.15". Face coords x across, z above the crank centreline: water inlets 1.80" at (+/-4.91, 7.04), cut 1.20" deep so they stop .31" short of the cylinder 1 bore (at 2.5" they broke into it; the jacket behind isn't modelled); water-pump bolts (3/8-16) at (+/-4.89, 8.21) and (+/-4.88, 5.83); Gen VI 6-bolt cover (1/4-20) at (+/-2.75, 8.01), (+/-4.17, 4.87), (+/-3.23, .30); cover dowels at (+/-3.69, 1.23), pins .30" proud; accessory holes at (+/-5.51, 2.82) on a boss and (+/-5.62, .67); timing chest recessed .85" [est], bare cast iron, with the valley window (1.32" at z 7.60), cam-plate bolts (z 6.74 and 3.44), hex lifter-gallery plugs (+/-1.22, 6.46) and the main-gallery plug (-1.53, 5.57); water-pump leg pockets .40" deep [est]; the machined plate is bare and the cast area outside it sits .12" back [est]; the plate is 6.25" half-wide down to the pan face. Overlay check: the model's features projected through the solved camera land on the photo's holes and edges. Not yet matched: the left leg pocket is the right one mirrored (the real left one is larger), and the cam retainer plate itself is not modelled. | Photos 29, 30; album photos 319-327 and 343-345 for later checks; `refs/front_photo_fit.py` |
| Bellhousing face | Built from `refs/rear_face.json`. GM V8 pattern [spec]: 3/8-16 bolts at (+/-7.800, .440), (+/-7.800, 4.200), (+/-4.100, 7.020); .625" dowel pins at (+/-7.690, 2.320), standing .55" proud [est]. The pattern's (0, 9.220) hole would sit on the block's top edge and is not drilled. The lower ears are 8.35" half-wide and 1.25" deep [est]. One-piece rear seal bore 5.125" (Fel-Pro 2920 OD) x .42" deep, with a 4.30" clearance bore behind it [est]. The rear main cap now runs to the rear face and carries the lower half of the seal bore (photo 435). Machined rear face is bare. Not done: the rear oil-gallery plugs. | jalopyjournal / Chevy Power coordinates; Fel-Pro 2920 specs; album photo 435 |
| Oil pan face and rail | Built. The pan face is one flat plane at the crank centreline (Drew). Rail flange half-widths: outer 5.95", inner 4.75" [meas]. Bolt holes [meas] at x = +/-5.40", y = 2.15, 5.45, 8.20, 10.88, 13.52, 16.11, 18.70, 21.52, plus a front pair at (+/-4.88, 23.58); 5/16-18, .75" deep. Measured from album photo 431: the camera was solved from the stud nuts on caps 1-4 (rms 10 px), the pan plane rectified to a top view, and the holes found automatically. The model's holes projected back onto the photo land on the real ones (`refs/pan_photo_fit.py`). | Album photos 431, 435; `refs/pan_rail.json` |
| Bottom details | Built from `refs/bottom.json`. Rail ears [meas] photo 431: driver side with a .375" hole at (-6.47, 20.81), passenger side with a .85" through hole at (7.03, 20.92). Oil filter pad [meas] position and size, photo 431: driver-side rear corner, 3.9" across, centred at (-7.4, 2.05), facing the pan, with a 13/16" centre thread and an oil port; boss height and ports [est]. Starter pad [est]: passenger-side rear corner, 1.3" tall, three 3/8-16 holes (straight pair at 1.6" from the rear face, offset hole at 2.35"), clear of the lower bellhousing bolts. Oil pump [est]: 7/16 stud into the rear cap, outlet through the cap into the block (O-ring at the joint, photo 22). Windage-tray studs [meas] photo 431: the inner studs on caps 3 and 4 run .90" longer [derived], enough for a spacer, the tray and a nut above the pan's 5" front floor (it was 2.5" [est]; see `../oiling/PARTS.md`). Oil pan, windage tray, pump and pickup are in `../oiling`; the timing cover is in `../front_cover`. | Album photos 22, 431 |
| Sides and valley | Built from `refs/sides.json`. Freeze plugs: 3 per side, 1.75", brass cups set .08" in; y [meas] photo 431 (left 19.1, 14.4, 9.75; right 17.9, 13.25, 8.4); height up the jacket wall [est]. Motor-mount holes: 3 x 3/8-16 per side round the front plug on spot-faced pads [est]. Fuel-pump boss on the passenger side at the front, with a 1.65" opening and 2 x 3/8-16 [est]. 16 lifter bores, .8437" [spec], tilted 30 deg through the cam centre so they open from the valley floor into the cam tunnel [est geometry]. Distributor bore 1.0" at the rear of the valley, down to the cam [est]. Rear oil-gallery plugs on the same gallery lines as the front ones [est]. | Photo 431; online BBC references |
| Lifter valley | Built from `refs/sides.json` ("lifters", "valley"), laid out from album photos 545 (looking down) and 547 (side). Each cylinder's two lifters share one dog-bone boss with a machined top square to the lifter axes, 3.52" along the axis from the cam centre (z 7.92" at the bore; it was 8.10" [est], lowered so the lifters stand .10" above their guide plates as in photo 351, see `../lifters/PARTS.md`), blending into the valley wall. Bores are .8437" [spec], 1.80" apart [meas] (they were 1.3", which left no room for the cam lobes; each lifter now sits over its lobe, y in `refs/sides.json`; cylinders 7/8 are shifted .39" forward to clear the distributor gear, see `../cam/PARTS.md`), and the two bores of a pair are offset across the bank: the forward bore sits ~.22" further outboard, so the boss runs on a slight diagonal [meas] (photos 545, 27), tilted 38 deg from vertical through the cam centre [derived from the boss positions, about 2.3" either side of the centreline], and run from the boss top into the cam tunnel (they start .5" from the cam centre, so the lifter rollers never touch the tunnel edge). Four cam drain windows (1.5" x .5" [meas]) run down the centreline between each left/right pair, open onto the cam lobes. A round lifter-retainer (spider) boss with a 5/16 tapped hole sits 1.05" ahead of each window. The distributor bore at the rear stands on a raised round boss. The lifter galleries (+/-1.22, 6.46) and the main gallery (-1.53, 5.57) are drilled front to rear between the plugs; the lifter galleries break into the lifter bores. Boss radius and height, window depth, and retainer and distributor boss sizes are [est]. Not modelled: the wall ribs and the small casting pads on the valley walls. | Album photos 545, 547 |
| Main caps | [meas] photos 22 and 24, scaled from the 2.9375" saddle: 6.9" wide, hanging 3.1" below the pan face into the pan. Four vertical studs each, inner ±1.95" and outer ±3.00", with nuts and washers. Bulkheads end at the parting line, and the crankcase is open full-width below it (straight 4-bolt, no side bolts). Not done: cap face detail and the rear cap's oil-pump boss. | Photos 22, 24 and 41 |
| Bulkhead thickness, bore length | [est] | Photo 22 |

## Parts (separate meshes)

1. `Block`: the casting, with decks, bores, line bore, cam tunnel, lifter valley, crankcase bays and deck features.
2. `MainCap_1`–`MainCap_5`: line-bored with the block; bare iron.
3. `MainStuds_1`–`MainStuds_5`: ARP 235-5701 studs, washers and nuts, black oxide.

## Reference meshes (not used for geometry)

- `naturally_aspirated_454_cid_v8.glb` and `blown_454_cid_v8.glb`: "454 cid V8" by Jorma Rysky, CC BY 4.0 (https://skfb.ly/p7FsJ, https://skfb.ly/p7Fss).
- The isolated block from the NA model is `Ref454_Block` in `../bbc_block_work.blend`. It is a low-detail shell with no bores or holes, about 23.7 × 17.6 × 10.6 in.


## Finish and materials

From photos 26-29 and 545: everything is iron except the outer faces, which are painted gloss orange.
- **Block_CastIron** (dark grey, rough): valley and its walls, lifter bosses, crankcase, timing chest, cam and lifter bores, the floors of the deck's port pockets, and the main caps.
- **Block_MachinedIron** (bright): the decks, the pan face, the machined front plate, the intake rails and the china-wall tops.
- **Block_ChevyOrange**: the outer faces of the casting: sides, skirts, the rear (bellhousing) face (photo 50), the front water-pump and accessory pockets and the cast area outside the machined plate (photo 30), and the bosses. The rear seal bore and the pocket behind the thrust bearing stay bare iron (photo 435).

The build sorts the faces automatically. Machined faces are found by plane. Any other face is painted if a ray along its normal leaves the block without hitting it, unless it opens into the valley or the crankcase, or faces into the intake area.

## Booleans

All cuts use Blender's MANIFOLD boolean solver (Blender 4.5+). The EXACT solver dropped or inverted some valley bosses and left about 1,100 non-manifold edges. With MANIFOLD the block is fully manifold (0 non-manifold edges, watertight) and builds in about 2 s.

## Rear bulkhead and crank clearance

The rear (thrust) bulkhead is 1.20" thick [est], faced for the flanged #5 thrust bearing, and a 3.60" pocket [est] runs from the seal clearance (0.90" deep) to the bulkhead's rear face, around the crank's thrust collar. The crankshaft and main bearings are built by `../crank/build_crank.py`; see `../crank/PARTS.md`.

Each crankcase bay also has a 4.30" clearance cut about the crank axis (`rod_sweep_r`, [derived]): the rod big ends sweep 4.21" (`../rods/PARTS.md`), past the 3.80" bay roof estimated before. The cut opens the bays into the cam tunnel, as on a real BBC.
