# Cylinder heads, head gaskets and head studs

Drew's heads are **AFR 2110** (Magnum, 345cc rectangle port, 117cc partial-CNC chambers, assembled). `build_heads.py` builds the aluminium castings and the valvetrain on them (valves, springs, retainers, rocker studs, rockers, guide plates, pushrods). It runs after the block, crank, rods, cam and lifters, and writes `heads_info.json`.

Tags: **[spec]** published by AFR, Cometic or ARP; **[meas]** measured from Drew's photos or the gasket image; **[derived]** worked out from other numbers; **[est]** a placeholder until a reference turns up.

## Parts (separate meshes: castings, gaskets, head studs and dowels in `BBC_Heads`; every valvetrain part, including rocker studs, poly locks and guide plates, in its own top-level collection `BBC_Valvetrain`, so either can be hidden alone)

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

## Layout (rebuilt from the photos, 2026-11-21)

Measured from the album copies in `../album/heads` (1913 x 1440) and Drew's deck drawing; notes in `../album/crops/NOTES_heads.md`.

| Item | Model | Source |
|---|---|---|
| Head studs | 16 per head in three rows. Bottom row (4): below the exhaust ports, nuts on the .65" deck ledge outboard of the exhaust flanges. Middle row (5): above the exhaust ports on a shelf 3.40" up, **outside** the valve cover, with a cast fin above each. Top row (7): inside the rocker box, between the intake runners; the two at the valley-side ends pass through the hollow head dowels [Drew]. No stud runs through a port | [meas] deck drawing, torque-sequence figure, photos 265, 337, 204 |
| Valve-cover rail | a thin (.30") racetrack with rounded ends, 4.00" above the block deck; the exhaust side runs .6" inboard of the middle-row studs, the intake side sits over the intake face. The machined intake face stops 3.55" up (about .5" above the ports); above it the casting steps back .10" (45-degree edge) to an as-cast band that runs up to the rail [Drew's close-up photo]. Seven 1/4-20 cover bolts in small tabs: four on the exhaust side, three on the intake side | [meas] photos 267, 336, 337; height [est] from photo 336 |
| Valves | intake .95" behind the bore centre and .55" towards the valley; exhaust 1.13" ahead and .15" towards the exhaust side. Both stems lean towards the valley (24 and 15 deg) and 4 deg apart along the bank | [meas] photo 334 (deck face scaled from the stud holes); angles [spec] |
| Spring pockets | 1.75" machined pockets just below the box floor (3.50"), seats 2.82" (intake) and 2.86" (exhaust) up the stem; exhaust row against the exhaust-side rail | [meas] photos 267, 336, 337 layout; heights [est] |
| Exhaust ports | 132cc each, oval flange .80" ahead of each bore centre at 2.25" up, on the flange face 2.30" out; header bolts lower-front and upper-rear; spark plug low, behind each port beside the bottom-row stud | [spec] volume and size; [meas] photos 265, 337 |
| Intake ports | 345cc each, 2.435 x 1.765", paired, floor .63" above the deck; face 6.10" from the bore centreline, six manifold bolts, a water port near each end | [spec]; [meas] photos 334, 336 |
| Chamber | 117cc, plug at the exhaust-side edge between the valves | [spec]; photo 334 |

## Valvetrain (Drew's build doc)

| Object | Part | Notes |
|---|---|---|
| `Valve_<cyl><I/E>` (+ `Retainer_`) | 2.300" intake, 1.880" exhaust, 11/32" stems | animated, .61-.63" lift; lengths 5.09" / 5.13" [derived] from the seat height, the 1.900" installed height and the retainer |
| `ValveSpring_<cyl><I/E>` | COMP 26924 | 1.519" OD, 1.900" installed height [spec, build doc]; wire and turns [est]; scaled in z as the valve opens |
| `RockerStuds_L/R`, `PolyLocks_L/R` | 7/16 studs, CSP-PL716K poly locks | each stud leans half as far as its valve, square to the rocker's trunnion [est]; poly lock 9/16 hex with its set screw standing .16" proud, the stud ending under it [est, photo] |
| `Rocker_<cyl><I/E>` (+ `RockerRoller_`) | CSP-S2001NP 1.7 aluminium roller rockers | one shared mesh for all 16 [Drew]: trunnion to roller 1.55", to pushrod cup .91" [est]. Shaped after Drew's valve-cover-off photo: flat side plates .90" across, open .68" over the trunnion for the stud and poly lock, a fork closed over a .50" x .38" roller with its axle ends showing, trunnion caps proud of the sides, a narrower rounded nose over the ball socket with a relief for the pushrod's swing [est] |
| `GuidePlates_L/R` | one per cylinder under the two rocker studs | shape [est] after photo 204 |
| `Pushrod_<cyl><I/E>` | Trick Flow 21418650 (8.650") intake, 21417650 (7.650") exhaust, 3/8" | lengths in `heads_info.json`: exhaust ~7.6" (close), intake ~7.2" (1.4" short), see below |

## Checks (`heads_info.json`)

- **Volumes:** chamber 117.0cc; intake 344.9-345.0cc; exhaust 132.0cc; minimum intake section 3.27 in^2. Each port is sized on its own.
- **Walls:** no port comes within .06" of a stud hole, nut pocket, pushrod slot, plug bore, spring pocket or its lead-in.
- **Fit:** no clash between the heads, gaskets, studs and dowels and the block, timing cover and freeze plugs, nor with the pistons, rods, cam or lifters over two crank turns. The valvetrain parts touch only where they should (stud through the trunnion, roller on tip, spring under retainer, pushrod ball in its socket); over two crank turns the rocker bodies clear the poly locks, studs, springs, retainers, guide plates and heads, and the pushrod shafts clear the rockers by .02" or more; pushrods clear both heads, the lifters and the block.
- All head, gasket, stud and dowel meshes are manifold.

## What differs from the references

- **Pushrod lengths:** the real intake pushrods are 8.65" and the exhausts 7.65". The model's exhausts are ~7.6" but the intakes ~7.2", so the real intake rockers sit higher than the model's. BBC intake and exhaust rockers sit at different heights; the model has them level. Rocker heights, stud angles and guide plates are estimates.
- **Heights:** rail, floor, shelf and spring-seat heights are scaled from oblique photos; a tape measurement of the head height (deck to cover rail) would fix them.
- **Exhaust side:** the real casting is rounded and ribbed between the flanges (photo 265); the model has flat walls and plain flanges. No raised lettering.
- **Rocker box:** the real floor is sculpted round each spring and stud; the model's is flat with round bosses.
- **Rockers:** no lightening pockets, oil holes or engraving; roller and trunnion sizes [est]. No valve locks, seals or shims as separate parts.
- **Valve motion:** keyed every crank degree from each lifter (pushrod, rocker on its trunnion, valve, spring); effective ratio 1.67-1.72.
- **Valve cover bolts** sit .30" in from the rail's outer edge [Drew].
- **Open valves vs chamber wall:** not yet confirmed clear at full lift; closed valves touch only their seats.
- **Front middle-row head stud** (block data, -2.03, -1.25) reaches ~.08" into bore 1 and touches pistons 1 and 8; the other middle-row studs sit at +/-2.39. Pre-existing, in `block/refs/deck_block.json`.
- **Chamber outline** is a convex hull round the seats and plug. No water jacket.

## Photos used (album numbers)

153, 204, 248-250, 259, 265, 266, 269, 284, 332-337, 111, 133.
