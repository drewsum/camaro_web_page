# Camshaft, thrust plate and timing set

Built by `build_cam.py`, after the block, crank and rods. It reads `../block/block_info.json`, `../block/refs/sides.json` for the lifter axes, `../block/refs/front_face.json`, and `../crank/crank_info.json` for the sprocket seat and key. Collection `BBC_Cam_Timing`; `Cam_Library` holds the two chain-link meshes and is hidden. Results and checks are in `cam_info.json`.

## Cam card

COMP Cams 01-000-13, grind 3018B/13145B R 110 + 4, hydraulic roller, zero lash. Source: Drew's album photos 212 and 348.

| | Intake | Exhaust |
|---|---|---|
| Gross valve lift (1.7) | .622 | .619 |
| Lobe lift | .366 | .364 |
| Duration at .006 tappet | 292 | 302 |
| Duration at .050 | 242 | 250 |
| Events at .050 | opens 15 BTDC, closes 47 ABDC | opens 58.8 BBDC, closes 11.2 ATDC |
| Centreline (installed) | 106 ATDC | 113.8 BTDC |

- **Lobe separation:** 110 on the card; 109.9 from the events.
- **From COMP's master lobe catalogue (lobes 3018 and 13145):**
  - .200" durations: 165 intake, 171 exhaust.
  - Tappet lift at TDC with the lobes straight up on 110: .087 intake, .102 exhaust.

## Lift curve

- **Shape:** a smooth (C2) symmetric curve that passes exactly through every point above: lobe lift, the .200, .050 and .006 durations, and the catalogue's TDC lift. The seat ramp closes 7 cam degrees past .006.
- **Checks:** the curve is monotone.
  - Its smallest radius of curvature is .79", well above the .375" roller radius, so the roller never undercuts.
  - Only the shape between the card's points is an estimate.

## How the lobes are phased

Nothing is typed in by hand. Each lobe is worked out as follows:

- **Firing TDC:** each cylinder's firing TDC comes from 1-8-4-3-6-5-7-2 at 90° steps (0 = cylinder 1 firing).
- **Peak lift:** at firing TDC + 360 + 106 for the intake, and firing TDC + 360 − 113.8 for the exhaust.
- **Profile:** ground by kinematic inversion for its own lifter. The lifter axis is the block's: 38° from vertical through the cam centre, with the .11" pair offset (front bore outboard, rear inboard). So the offset follower is accounted for (about 12 crank degrees at this offset).
- **Lobe order front to rear:** 1E 2E 1I 2I 3I 4I 3E 4E 5E 6E 5I 6I 7I 8I 7E 8E, the Chevy V8 order. The script asserts it.

| Lobe | y | Peak (crank deg) | Nose angle at crank 0 (cam deg, from top toward passenger) | Cam deg after #1 intake |
|---|---|---|---|---|
| 1E | 21.25 | 246.2 | 80.3 | 119.4 |
| 2E | 20.25 | 156.2 | 120.9 | 78.9 |
| 1I | 19.45 | 466.0 | 199.8 | 0 |
| 2I | 18.45 | 376.0 | 221.2 | 338.5 |
| 3I | 16.41 | 16.0 | 325.2 | 234.5 |
| 4I | 15.41 | 646.0 | 5.8 | 194.0 |
| 3E | 14.61 | 516.2 | 224.9 | 334.9 |
| 4E | 13.61 | 426.2 | 246.3 | 313.4 |
| 5E | 11.57 | 696.2 | 305.3 | 254.4 |
| 6E | 10.57 | 606.2 | 345.9 | 213.9 |
| 5I | 9.77 | 196.0 | 64.8 | 135.0 |
| 6I | 8.77 | 106.0 | 86.2 | 113.5 |
| 7I | 7.01 | 286.0 | 100.2 | 99.5 |
| 8I | 6.12 | 556.0 | 320.8 | 239.0 |
| 7E | 5.22 | 66.2 | 359.9 | 199.9 |
| 8E | 4.32 | 336.2 | 201.3 | 358.4 |

The absolute nose angles depend on the lifter bank angle. A real core is ground for the real block's angle, which is not measured here (the model's 38° is [derived] from photo 545). The valve events at the crank are what the card fixes, and those match.

## Check against the card

`event_check` takes the finished cam mesh at its driven rotation and turns the crank 0–720° in 0.5° steps. On each block lifter axis it pushes a .375" roller up against the lobe vertices and reads the lift.

- **All 16 lobes:**
  - lift .366 / .364 (.622 / .619 at the valve)
  - IO 15.0 BTDC, IC 47.0 ABDC, EO 58.8 BBDC, EC 11.2 ATDC, all within .01°
  - durations 242 / 250 at .050 and 292 / 302 at .006
- **Lifter bores:** each lobe sits on its lifter bore's axis in the block (checked against the bore cutters: 0 error in y, offset and angle).

## Parts

| Item | Value | Tag |
|---|---|---|
| Journals | 5 × 1.949", .80" wide, at the main bulkheads. #1 runs forward to its shoulder .005" behind the plate; #5 ends at the rear wall (y 2.30) | dia [meas] build sheet; rest [est] |
| Base circle | 1.170" (nose .951", .02" inside the bearing bore) | [est] |
| Lobes | .58" wide, .025" chamfers, .375" roller (.750" standard wheel) | wheel [spec] COMP; width [est] |
| Distributor gear | 13 teeth, 45° helix, 1.78" OD, .55" wide, at y 3.70 under the distributor bore | position [meas]; gear [est] |
| Step nose | 1.75" through the plate, end play .005" | [est] photo 322 |
| Nose face | 3 tapped holes on r .55, at 150/270/30°; dowel on r .56 at 90°; centre hole | [meas] photos 321/322 (at dot-to-dot the bolts sit at −30/90/−150° and the dowel at −90°, as in photo 321) |
| Thrust plate | .17" plate on the chest floor, two countersunk Torx screws in the block's holes (z 6.74, 3.44; 3.30" apart, GM spec 3.294"), relieved round the three gallery plugs | outline [meas] photo 322; thickness [est] |
| Timing set | 3/8" pitch double roller, 50T cam / 25T crank, 66-link chain, .250" rollers | pitch [spec]; 66 links [spec] (Cloyes BBC chain); 50/25 [derived] (66 pitches at the 5.147" centres) and it overlays photo 321 |
| Cam sprocket | billet, 10 lightening holes (1.78" circle, .60"), raised hub, timing dot on top at crank 0 | [meas] photo 321 |
| Crank sprocket | 25T on the 1.750" seat, y 23.40–24.30; 9 keyways 40° apart, "0" on the crank key; dot on top | keyways [meas] photo 322; spacing [est] |
| Chain plane | y 23.85, .40" between rows | [est]; re-solving photo 321's camera with the sprocket face at the front face gives rms 4.0 px (5.0 px with the old guess of 1.2" proud) |

## Motion

`Crankshaft["crank_deg"]` drives everything; nothing new is keyframed.

- **Camshaft:** `rotation_euler.y = -crank_deg / 2`, so it turns clockwise from the front at half speed.
- **Parented to the cam:** the sprocket, bolts and dowel.
- **Parented to the crank:** the crank sprocket and key.
- **Timing marks:** at crank 0 both dots are on top. At 360 (cylinder 6 firing, cylinder 1 on overlap) they line up dot-to-dot, as in photo 321.
- **Chain (`TimingChain`):** a curve on the pitch line with a geometry-nodes modifier. It places 66 rigid links, alternating inner and outer, each aimed at the next pin, and advances them by crank angle × crank pitch radius.
  - **Sprocket radii:** 66 pitches at 5.147" needs pitch radii .28% under nominal (2.976" / 1.488"). So the cam sprocket's pitch-line speed equals the crank's, and the rollers stay in the teeth of both sprockets.
  - **Phasing:** the crank teeth are phased on the bottom pin. The cam's sit on pin 0 at the top.
  - **Centres:** a chain with perfect seats would put the centres at about 5.13".

## Clash checks

- **Turning parts vs the fixed parts:** cam, sprockets, bolts and chain checked every 15° over 720° against the block, caps, studs, thrust plate, screws and crank. No contact.
- **Cam vs the rods:** checked against all rods, caps and bolts every 5°. No contact. Closest approach is .230" (rod 3 at 230°), from the rod's [est] big-end shape.

## Photo check

`album/renders/timing_blend321.jpg` is the model rendered at crank 360 from photo 321's solved camera, blended 50/50 with the photo. These line up:

- the sprocket and chain path
- the 10 holes
- the bolts and dowel
- the crank sprocket

## What differs from the photos / not modelled

- Lightening holes sit about 5° off the photo's.
- The crank snout in front of the sprocket is longer than the photo's (balancer seat [est] in the crank).
- Not modelled:
  - the chain's slack-side sag
  - the cam bearings
  - the Gen VI fuel-pump eccentric (if this core has one; Drew runs an electric pump)
  - pushrods and the lifter retainer (spider); the lifters and guides are in `../lifters`
- The cam is a union of plain solids: there are no fillets at the lobe roots.
