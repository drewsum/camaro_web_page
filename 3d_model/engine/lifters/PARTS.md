# Lifters and guides

Built by `build_lifters.py`, after the block, crank, rods and cam. It loads `../cam/build_cam.py` for the lobe table, the lifter axes and the event check. Collection `BBC_Lifters`. Results and checks are in `lifter_info.json`.

## What they are

OE-style Gen VI hydraulic roller lifters, no link bars. Album photos 349-352 show each cylinder's pair held square by a stainless dog-bone guide plate on the lifter boss, with a long aluminium retainer (spider) over the guides.

| Part | Built | Source |
|---|---|---|
| Body | .842" [spec], drawn .837" so it never touches the faceted bore mesh. Seat height 2.66" roller centre to pushrod seat [spec, COMP OE-style class]. Two guide flats .700" across from s 2.10" to the top [est; length derived so the flats stay in the guide at full lift]. Seat cup .10" deep [est], oil band [est]. | COMP / Summit listings for Gen VI OE-style lifters |
| Yoke | Roller slot .38" wide; cheeks cut to .66" across below the roller centre [est]. The narrow cheeks are needed: lobe 7I sits .34" from cam journal 4 (cylinders 7/8 were moved forward for the distributor gear), and a full-width body hit the journal. | [est] |
| Roller | .750" [spec, the size the lobes are ground for] x .36" wide on a .24" axle. The width is [derived]: a .750" wheel wider than .36" would have its corners outside the .842" body. The rollers don't spin (Drew: not needed). | |
| Guides | One per cylinder, .09" stainless [est], .62" end radius [est], holes shaped to the flats with .006" clearance. They sit on the boss tops, square to the lifter axes. | Album photos 349-352 |

The lifter tops stand .10" above the guides on the base circle (photo 351) [meas]. With the 2.66" seat height and the .585" base circle that puts the boss tops 3.52" along the lifter axis from the cam centre. The block had them at 8.10" [est]; they are now 7.92" at the bore (`../block/refs/sides.json`).

## Motion

Each lifter only slides along its bore axis (38° bank tilt, .11" pair offset, as the block and cam). The lift is read off the finished cam mesh, not from a formula: `event_check` in `../cam/build_cam.py` pushes a .375" roller against the lobe vertices on every lifter axis every 0.5 crank degree. That lift is keyed as the lifter's location (linear, cyclic), on the crank's timeline: frame = 1 + crank_deg / 7.5, so frames 1-97 are 0-720°. The roller is parented to its lifter.

The keys follow the timeline, not `crank_deg` directly. If the crank's animation is changed, re-run the script.

## Checks (`lifter_info.json`)

- Clash every 5 crank degrees over 720°: lifters, rollers and guides against the block, crank, caps, studs, rods, pistons, thrust plate, chain, the cam (except roller on lobe) and each other: none.
- Roller on the lobe, every 2.5°: no lobe vertex inside any roller (0 penetration); the largest gap is .0008" (mesh faceting).
- Peak lifter travel .366" intake, .364" exhaust (the card's lobe lift).

## What differs from the photos / not modelled

- The spider (lifter retainer) is not modelled: its pillar positions in plan are still unresolved (see `../block/PARTS.md`).
- Pushrods: not yet.
- The real roller is probably smaller than .750" in an OE-style lifter; .750" is kept because the lobes are ground for it.
- The guides are plain plates; the real ones have a formed raised edge (photo 351).
- The body is .005" under size in the model.
