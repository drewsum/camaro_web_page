# Cylinder heads, head gaskets and head studs

Drew's heads are **AFR 2110** (Magnum, 345cc rectangle port, 117cc partial-CNC chambers, assembled). `build_heads.py` builds the aluminium castings only: no valves, springs, retainers or rockers yet. It runs after the block, crank, rods, cam and lifters, and writes `heads_info.json`.

Tags: **[spec]** published by AFR, Cometic or ARP; **[meas]** measured from Drew's photos or the gasket image; **[derived]** worked out from other numbers; **[est]** a placeholder until a reference turns up.

## Parts (separate meshes, collection `BBC_Heads`)

| Object | What it is |
|---|---|
| `CylinderHead_L`, `CylinderHead_R` | the AFR castings; as-cast A356 with the machined faces (deck, CNC chambers, intake face, exhaust pads, cover rail) in a brighter material |
| `HeadGasket_L`, `HeadGasket_R` | Cometic C5333 MLS, .027" compressed, 4.540" bore, all of the gasket's own holes |
| `HeadStuds_L`, `HeadStuds_R` | ARP 235-4713: 7/16 studs, washers and 12-point nuts, 16 per head |
| `HeadDowels_L`, `HeadDowels_R` | the two hollow deck dowels per bank, in the block's .609" counterbores |

## One casting for both banks

BBC heads fit either bank. The left head is built in deck coordinates (as `../block/refs/deck_c5333.json`: u from the cylinder-1 bore centre towards the rear, v across the deck towards the valley, h up the bore axis from the block deck). The right head is the same mesh turned 180 deg about the vertical. That has two consequences elsewhere in the engine:

- **Block:** the right deck is now the left deck turned round, not mirrored (`deck_pt` in `../block/build_block.py`). The stud pattern is not symmetric front to rear (the exhaust-edge studs sit .37" ahead of each bore on the left deck, so they sit .37" behind on the right), so a mirrored right deck would not take a turned head. The right freeze plugs were lowered to 1.55" up the wall [est] so the bottom-row studs clear them.
- **Valve order:** the left head runs **E-I-E-I** front to rear, so the turned right head runs **I-E-I-E**. Drew's photo 334 (the AFR deck face) shows the same valve order in every chamber, and the NCRS forum confirms big blocks alternate (the small block is E-I-I-E). The cam's lobe order, the lifters' valve labels and the piston reliefs followed the small-block E-I-I-E order, and are now changed to match: lobes 1E 2I 1I 2E 3E 4I 3I 4E ..., reliefs behind on every left cylinder and ahead on every right one.

## Specification

| Item | Value | Tag |
|---|---|---|
| Material | A356 aluminium | [spec] |
| Deck thickness | .750" | [spec]; the water jacket is not modelled, only .60" deep pockets under the deck's water holes |
| Valves | 2.300" intake, 1.880" exhaust, 11/32" stems | [spec] |
| Valve angles | intake 24 deg incline and 4 deg cant; exhaust 15 deg and 4 deg; the stems splay (intake tops lean to the valley, exhaust tops to the exhaust side, both lean away from the bore centre along the bank) | [spec] angles; directions [spec] (Dufur, inthegaragemedia) |
| Seats | intake 2.450 x 2.000"; exhaust 2.000 x 1.580" | [spec] |
| Valve positions | .90" either side of the bore centre along the bank (over the lifters); intake .48" towards the valley, exhaust .87" towards the exhaust side, so the seat rings clear (2.25" apart) and both stay inside the bore | [derived]; photo 334 suggests the valves sit further apart along the bank and closer across it |
| Chamber | 117cc | [spec]; the model is 117.0cc, tuned by the chamber wall height (.447") |
| Chamber shape | the hull of the two seat rings and the plug pocket, clipped to a 4.48" circle, with a bowl round each valve down to its seat | [est] shape, after photos 248, 259, 284, 334 |
| Intake port | 345cc; 2.435" tall x 1.765" wide at the face, 13/32" corner radius; 3.263 in^2 minimum section | [spec]; the model is 341-349cc (pairs differ by 8cc, as real BBC left/right ports do) and 3.27 in^2 at the pinch |
| Intake ports at the face | in pairs, 2.07" apart within a pair, pair centres 3.60" and 13.28" (9.68" apart), port centre 2.35" above the block deck | spacing [meas] photo 335 (perspective fit); pair centres [derived], placed so the pushrods and the valley studs clear; height [est] |
| Exhaust port | 132cc; 1.720" tall x 1.920" wide, raised .375" | [spec]; the model is 131.7-132.3cc |
| Exhaust ports at the face | about evenly spaced, one over each exhaust valve (u -0.70, 4.20, 9.00, 13.90), centre 2.60" up, on .20" machined pads with two 3/8-16 header bolts each | spacing [meas] photo 337; height and bolt positions [est] |
| Spark plugs | 14 mm x .750" reach, gasket seat; the tips sit on the exhaust side of each chamber, and the plugs angle back towards their intake valves and leave the head low between the exhaust ports | [spec] thread; layout [meas] photos 265, 266, 337; positions [est] |
| Intake face | perpendicular to the deck at v = 5.45", where the deck plane meets the china-wall top plane; 3.90" tall, the cover rail stepping in .40" above it | [derived] / [meas] photo 335 (face ~1.6 port heights) |
| Valve-cover rail | 4.65" above the block deck, .45" wide, with a .07" outward lip .22" deep round the top (the cover-gasket land). The BBC seven-bolt cover pattern, 1/4-20: four along the exhaust side (u -1.30, 4.45, 10.15, 15.95), three along the intake side (1.80, 8.45, 13.30), each in a .64" lug cast on the inside of the wall, .85" deep with a tapered foot | height [meas] photo 335; seven bolts [spec]; positions and lug sizes [est] |
| Rocker box floor | 3.75" on the exhaust side to 3.95" on the intake side | [est] |
| Spring pockets | 1.75" machined pockets square to each stem, 3.15" along it from the valve face, with a .05" spot-faced step .06" over the pocket and a machined cone lead-in (.35" wider at .70" above the seat) where the pocket breaks the floor. Under each seat a round boss flares into the floor (.12" over the pocket at the seat, .42" at its foot, 1.25" long), and the guide boss stands up in the middle | [spec] diameter; the rest [est] from Drew's photo of the head with the springs in. The floor can't be cast down round the bosses as on some heads: the port roofs run within .1" of the seat plane 1.2" off the stem |
| Rocker-stud bosses | 7/16 tapped, at the 1.7 ratio point between the valve tip and the pushrod cup | [est]; the rockers come later |
| Pushrod slots | each slot covers the pushrod line from both banks' lifters (the right head is the same casting), cups just outside each pair of intake ports for the intakes and over the lifters for the exhausts | [est]; checked with a 3/8" pushrod on every line |
| Studs | 16 per head, on 16 of the gasket's 17 holes: four bottom-row studs end on the exhaust-side lip (socket pockets under the exhaust ports); the other twelve stand on bosses in the rocker box: the stacked pair between each pair of bores on the exhaust side, three between the bores and two at the bores on the valley side, and the one at cylinder 3's position that rises through intake port 2 on a .80" boss (the BBC "hidden" head-bolt boss). The valley-side hole at cylinder 7's position has no stud | count [meas] Drew's photo of the block with the ARP studs in; positions from the gasket; which of the two intake-port holes is used [est] |
| Head gasket | Cometic C5333 MLS, .027" | [meas] block PARTS.md; outline and holes from the gasket image |

## Checks (`heads_info.json`)

- **Volumes:** chamber 117.0cc; intake 344.9-345.1cc (each port sized on its own: port 2 loses volume to the stud boss); exhaust 131.7-132.3cc; minimum intake section 3.27 in^2.
- **Walls:** no port comes within .06" of a stud hole, nut pocket, pushrod slot, plug bore, spring pocket or spring-pocket lead-in.
- **Fit:** no clash between the heads, gaskets, studs and dowels and the block, timing cover and freeze plugs; none with the pistons, rods, cam or lifters over two crank turns (15 deg steps). Expected contacts (studs in the block and heads, dowels) are listed in the script.
- **Pushrods:** a 3/8" pushrod on every lifter-to-cup line, both banks, clears both heads.
- All parts are manifold.

## What differs from the references

- **Valve spacing:** photo 334 shows the valves further apart along the bank and closer across it than the model. They are kept over the lifters (±.90") and inside the bore with seat clearance; the piston reliefs (.86" along the bank) agree with that.
- **Chamber outline:** a convex hull round the seats and plug, a little more angular than the CNC chambers in photos 248 and 284.
- **Exhaust side:** the real casting has rounded port bosses running into each other (photo 337); the model has flat rectangular pads.
- **Head studs:** which intake-port boss carries the 16th stud (cylinder 3 or 7) wasn't visible in the photo; the model uses cylinder 3's. The intake-side pushrod cup at the rear was moved .15" rearward so port 4 clears it at full volume.
- **Pushrod routing and the rocker-stud bosses** are estimates until the rockers are modelled.
- **No water jacket**, valve guides or seat inserts as separate parts.
- Drew's originals for the head photos weren't reachable (photos.drewsum.com didn't resolve), so the measurements came from the album's 332 x 250 thumbnails.

## Photos used (album numbers)

153, 204, 248-250, 259, 265, 266, 269, 284, 332-337, 111, 133.
