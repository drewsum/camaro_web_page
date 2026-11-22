# Cylinder heads, head gaskets and head studs

Drew's heads are **AFR 2110** (Magnum, 345cc rectangle port, 117cc partial-CNC chambers, assembled). `build_heads.py` builds the aluminium castings and the valvetrain on them (valves, springs, retainers, rocker studs, rockers, guide plates, pushrods). It runs after the block, crank, rods, cam and lifters, and writes `heads_info.json`.

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

## Layout (rebuilt from the photos, 2026-11-21)

Measured from the album copies in `../album/heads` (1913 x 1440) and Drew's deck drawing; notes in `../album/crops/NOTES_heads.md`.

| Item | Model | Source |
|---|---|---|
| Head studs | 16 per head in three rows. Bottom row (4): below the exhaust ports, nuts on the .65" deck ledge outboard of the exhaust flanges. Middle row (5): above the exhaust ports on a shelf 3.40" up, **outside** the valve cover, with a cast fin above each. Top row (7): inside the rocker box; the two at cylinders 3 and 7 rise through intake ports 2 and 4 on bosses | [meas] deck drawing, torque-sequence figure, photos 265, 337, 204 |
| Valve-cover rail | a thin (.30") racetrack with rounded ends, 4.00" above the block deck; the exhaust side runs .6" inboard of the middle-row studs, the intake side is flush with the intake face. Seven 1/4-20 cover bolts in small tabs: four on the exhaust side, three on the intake side | [meas] photos 267, 336, 337; height [est] from photo 336 |
| Valves | intake .95" behind the bore centre and .55" towards the valley; exhaust 1.13" ahead and .15" towards the exhaust side. Both stems lean towards the valley (24 and 15 deg) and 4 deg apart along the bank | [meas] photo 334 (deck face scaled from the stud holes); angles [spec] |
| Spring pockets | 1.75" machined pockets just below the box floor (3.50"), seats 2.82" (intake) and 2.86" (exhaust) up the stem; exhaust row against the exhaust-side rail | [meas] photos 267, 336, 337 layout; heights [est] |
| Exhaust ports | 132cc each, oval flange .80" ahead of each bore centre at 2.25" up, on the flange face 2.30" out; header bolts lower-front and upper-rear; spark plug low, behind each port beside the bottom-row stud | [spec] volume and size; [meas] photos 265, 337 |
| Intake ports | 345cc each, 2.435 x 1.765", paired, floor .63" above the deck; face 6.10" from the bore centreline, six manifold bolts, a water port near each end | [spec]; [meas] photos 334, 336 |
| Chamber | 117cc, plug at the exhaust-side edge between the valves | [spec]; photo 334 |

## Valvetrain (Drew's build doc)

| Object | Part | Notes |
|---|---|---|
| `Valves_L/R` | 2.300" intake, 1.880" exhaust, 11/32" stems | drawn closed; lengths 5.09" / 5.13" [derived] from the seat height, the 1.900" installed height and the retainer |
| `ValveSprings_L/R` | COMP 26924 | 1.519" OD, 1.900" installed height [spec, build doc]; wire and turns [est] |
| `Retainers_L/R` | COMP 749 | shape [est] |
| `RockerStuds_L/R`, `PolyLocks_L/R` | 7/16 studs, CSP-PL716K poly locks | each stud leans half as far as its valve [est] |
| `RockerArms_L/R`, `RockerRollers_L/R` | CSP-S2001NP 1.7 aluminium roller rockers | block shapes, orange as in photo 204; ratio 1.7 by construction |
| `GuidePlates_L/R` | one per cylinder under the two rocker studs | shape [est] after photo 204 |
| `Pushrods_L/R` | Trick Flow 21418650 (8.650") intake, 21417650 (7.650") exhaust, 3/8" | the model's run 7.68-7.79" intake and 7.97-8.04" exhaust: the intake side is about an inch short, see below |

## Checks (`heads_info.json`)

- **Volumes:** chamber 117.0cc; intake 344.9-345.0cc; exhaust 132.0cc; minimum intake section 3.27 in^2. Each port is sized on its own.
- **Walls:** no port comes within .06" of a stud hole, nut pocket, pushrod slot, plug bore, spring pocket or its lead-in.
- **Fit:** no clash between the heads, gaskets, studs and dowels and the block, timing cover and freeze plugs, nor with the pistons, rods, cam or lifters over two crank turns. The valvetrain parts touch only where they should (stud in rocker, roller on tip, spring under retainer); pushrods clear both heads, the lifters and the block.
- All head, gasket, stud and dowel meshes are manifold.

## What differs from the references

- **Pushrod lengths:** the real intake pushrods are 8.65" and the exhausts 7.65". The model's are all 7.6-7.9", so the real intake rockers sit about an inch higher than the model's. BBC intake and exhaust rockers sit at different heights; the model has them level. Rocker heights, stud angles and guide plates are estimates.
- **Heights:** rail, floor, shelf and spring-seat heights are scaled from oblique photos; a tape measurement of the head height (deck to cover rail) would fix them.
- **Exhaust side:** the real casting is rounded and ribbed between the flanges (photo 265); the model has flat walls and plain flanges. No raised lettering.
- **Rocker box:** the real floor is sculpted round each spring and stud; the model's is flat with round bosses.
- **Rockers and springs** are simplified shapes; no valve locks, seals or shims as separate parts. Valves are closed at every crank angle (no valve motion yet).
- **Chamber outline** is a convex hull round the seats and plug. No water jacket.

## Photos used (album numbers)

153, 204, 248-250, 259, 265, 266, 269, 284, 332-337, 111, 133.
