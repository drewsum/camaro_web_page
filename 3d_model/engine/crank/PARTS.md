# Crankshaft and main bearings

Built by `build_crank.py`, after the block (it reads `../block/block_info.json` for the main positions, the bank stagger and the main bore). Collection `BBC_Crank`.

| Item | Value | Source |
|---|---|---|
| Crank | Scat forged steel, internally balanced | Drew's build page |
| Stroke | 4.250" (throw 2.125") | [spec] build page, `engineGeometry.ts` |
| Main journals | 2.7488", at y = 22.27, 17.43, 12.59, 7.75, 2.91 | [spec] BBC; positions from the block |
| Rod journals | 2.1990" x 2.000" long, at y = 19.85, 15.01, 10.17, 5.33 | [spec]; length [derived] from the 1.000" bank stagger |
| Main journal lengths | bulkhead + .05" each side (1.20, 1.10, 1.10, 1.10); #5 1.336" between thrust faces (.006" end play) | [est] |
| Cheeks and counterweights | 8 counterweights, 3.55" radius, opposite their throws; hub 1.60", pin boss 1.45" | [est], awaiting a photo of the crank |
| Nose | 1.750" sprocket seat to y 24.30, 1.600" balancer seat to 27.10, keyway, 3/4" bolt hole | [est] |
| Tail | 3.40" thrust collar, 4.250" seal flange from y .85 to -.40, 6 x 7/16" flywheel holes on 3.58", 1.094" pilot bore | flange OD [derived] from the Fel-Pro 2920 seal ID; the rest [est] |
| Main bearings | upper shells in the saddles, lower in the caps; ID 2.7513" (.0025" clearance), 0.90" wide on 1-4; #5 flanged thrust, 1.33" over the flanges, 3.55" flange OD; upper shells grooved and drilled | [est] |

## Rotation

`Crankshaft` has its origin on the crank axis. Its custom property `crank_deg` drives `rotation_euler.y` through a driver (`-deg` in radians): 0 = cylinder 1 at TDC firing, positive = clockwise seen from the front. It is keyframed 0 to 720 over frames 1-97 with a Cycles modifier, so playback turns it continuously. The bearings are static.

## Throw angles

Worked out in the script from the 1-8-4-3-6-5-7-2 firing order (90 degrees apart, banks at +/-45 degrees) and checked against both cylinders on each throw. Angle from vertical, positive towards the passenger side, at crank_deg 0:

| Throw | Cylinders | Angle |
|---|---|---|
| 1 (front) | 1, 2 | -45 (up the left bank) |
| 2 | 3, 4 | -135 |
| 3 | 5, 6 | +45 |
| 4 (rear) | 7, 8 | +135 |

Throws 1 and 4 are 180 degrees apart, 2 and 3 are 180 apart, and the pairs are 90 apart: the standard cross-plane V8. Turning the model, the companion pairs reach TDC together every 90 degrees: 1/6, 8/5, 4/7, 3/2.

## Checks

- Clash check: the crank is turned through 360 degrees in 15-degree steps and tested against the block, the caps, the studs and the bearings. No contact.
- The rear bulkhead was made 1.20" (it was 1.60" [est]) so the thrust flanges sit on its faces, and the block got a 3.60" pocket behind the thrust bearing for the collar.

## Not modelled yet

Fillet radii, counterweight drilling and knife-edging, the real counterweight shapes and angles (Scat's are not simply opposite each throw), and the bearing locating tangs. The rods and pistons are in `../rods` (see `../rods/PARTS.md`).
