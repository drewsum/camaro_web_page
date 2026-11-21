# Connecting rods, pistons, rings, pins and rod bearings

Built by `build_rods.py`, after `../block/build_block.py` and `../crank/build_crank.py` (it reads `block_info.json` for the bores and stagger and `crank_info.json` for the throws, rod journal and counterweight radius). Collection `BBC_Rods_Pistons`, with `Rods` and `Pistons` inside it; `RP_Library` holds the shared source meshes and is hidden.

## Sources

- **Pistons:** Drew's Mahle box label (album photo 509) gives the part number 928957000 ("MS HVSS BIG BORE CHEVY FT 1270CH"), the pin (0.990 x 2.520, .180 wall), the 1.6 mm circlips, the ring set (4.500 +.005, 1.5 / 1.5 / 3.0 mm, file fit), the oil support rail, and the measured piston-to-wall clearance of .0045".
- **Piston shape:** album photos 372, 428, 456, 459, 470 and 510, for the flat crown with one valve relief, the short coated skirt, the pin-boss windows and the expander. Photo 382 shows Mahle's ring-alignment sheet and the circlips.
- **Rods:** Scat forged H-beam, from the build page and site photos 15 and 20, plus album photos 424, 456, 459, 461 and 512. Cap screws come up through the cap into the rod; the small end is bronze bushed.

| Item | Value | Tag |
|---|---|---|
| Rod length | 6.385" centre to centre | [derived] deck 9.800 - throw 2.125 - compression height 1.270 = 6.405 at zero deck; the 6.385 Scat rod puts the crown .020" below the deck, the usual 540 combination |
| Big end | 2.3247" housing bore, .990" wide, 7/16" cap screws on ±1.42" | bore and width [spec]; bolt centres and ear shape [est] from photos 15, 512 |
| Beam | H section, .94" thick, .17" side plates, .30" web, channels 1.95"-5.35" from the big-end centre on both narrow faces; 1.30" wide at the big end to 1.00" at the small end, concave flare into the bolt ears | [est] from photos 15, 424, 459 |
| Small end | 1.38" OD, .94" thick, bronze bushing 1.115" OD, .16" oil hole on top | [est] photos 15, 424 |
| Rod bearings | upper shell in the rod, lower in the cap; ID 2.2015" (.0025" clearance on the 2.1990" journal), .88" wide | [est] |
| Rod side clearance | .020" total on the 2.000" journal (two .990" rods) | [derived] |
| Piston | 4.4945" (bore 4.499 - .0045 PTW), compression height 1.270" | [spec] |
| Ring grooves (from the crown) | top 1.5 mm at .250"; 2nd 1.5 mm after a .170" land; oil 3.0 mm after a .160" land, deepened .030" for the support rail | widths [spec]; lands and depths [est] |
| Pin bore | breaks into the oil-ring groove (top of the bore .495" above the pin centre; the groove bottom is .424") | [derived]; this is why the set has a support rail |
| Wrist pin | .990" x 2.520", .180" wall, full floating, 1.6 mm wire circlips | [spec] |
| Pin bosses | towers to the crown underside, faces at ±1.38", .53" from the rod | [est] photo 459 |
| Skirt | coated thrust panels below the ring belt; the bottom edge follows the counterweight sweep at BDC with .10" clearance | [est] photo 459; the curve is [derived] from the crank's 3.55" [est] counterweight radius |
| Valve relief | one D-shaped pocket per piston, running along the bank: a 2.40" cutter (2.30" intake valve + .10") centred .05" to the intake side and .86" along the bank. The floor rises at 8.6 deg to a straight edge .19" past centre, so the pocket is ~1.05" wide and 2.4" long, from .33" past centre to near the crown edge. It deepens slightly towards that outer end; .16" deep at the deepest | position and shape [meas] from photos 372 (near TDC, seen from the valley) and 428; depth and lean [est] |
| Ring gaps | bottom oil rail at the front, on the pin line (Mahle sheet, photo 382); top 135 deg, 2nd 315 deg, top rail 180 deg, expander 100 deg, support rail 90 deg (measured from the front towards +X) | only the bottom rail is from the sheet; the rest [est] |

Relief side: big-block heads alternate E-I-E-I front to rear on the left bank and I-E-I-E on the right (one casting, turned round; Drew's photo 334 of the AFR deck, ../heads/PARTS.md), so the intake valve is behind the exhaust on every left cylinder (1, 3, 5, 7) and ahead of it on every right one (2, 4, 6, 8). Until the heads were modelled this followed the small-block E-I-I-E order, which put the relief at the wrong end on 3, 7, 2 and 6. Confirmed for cylinder 1 by Drew's photo of it from the driver's side (PXL_20251220_192618205): the pocket is on the valley side, running from the middle of the crown towards the rear. The relief is always on the intake (valley) side. That gives four piston variants (`Piston_IF`, `Piston_IR`, `Piston_EF`, `Piston_ER` in the library); the right bank uses the mirror of the left.

## Finishes

- **Rods and caps:** shot-peened steel (photo 15).
- **Cap screws:** black oxide.
- **Small-end bushing:** bronze.
- **Rod bearings:** the same shell material as the mains.
- **Pistons:** crown, lands and bosses are bare forged aluminium; the skirt panels carry Mahle's dark coating (photo 510).
- **Rings:** steel; the oil rails are chrome.
- **Pins:** ground steel.

## Motion

Nothing is keyframed except the crank. Each rod and piston has drivers that read `Crankshaft["crank_deg"]`, all of them simple expressions, so they run without Python. With throw angle psi = psi0 - deg, bank angle beta (-45 left, +45 right) and theta = psi - beta:

- **Crank pin (rod location):** R (sin psi, cos psi).
- **Wrist pin (piston location):** s (sin beta, cos beta), where s = R cos theta + sqrt(L^2 - R^2 sin^2 theta).
- **Rod angle:** beta - asin(R sin theta / L).

The cap, bolts, bushing and bearing shells are children of their rod. The pin, clips and rings are children of their piston. Scrubbing the timeline, playing it, or typing a value into `crank_deg` moves the whole rotating assembly.

## Checks (`rods_info.json`)

- **TDC:** every crown reaches 9.780" from the crank axis (.020" below the deck) at its firing order angle. Cylinders 1 and 6 at 0 deg, 8 and 5 at 90, 4 and 7 at 180, 3 and 2 at 270.
- **Clash:** a full revolution in 7.5 deg steps (frames 1-48) found no overlap. Each rod assembly was tested against the crank, the block, the main caps, studs and bearings, the other rod on its throw, and its own piston, pin and rings. Each piston assembly was tested against the bore and the crank.
- **Block change this needed:** the rod big ends sweep 4.21" from the crank axis, past the 3.80" bay roof the block had [est]. The block now has a 4.30" clearance cut in each bay (`rod_sweep_r`), which opens into the cam tunnel as in a real BBC.
- **Polygon allowance:** the block's bore is a 64-sided polygon, so the model's rings sit .0003" inside its flats and the piston .0005" inside the rings. On the drawing, the .0045" wall clearance is mostly taken up by the polygon.

## Not modelled, or not checked

- **Cam:** checked in `../cam` (every 5° over two turns): no contact, closest .230" (rod 3 at 230°). Real 4.25" stroke BBCs are often tighter; the rod ear shape here is [est].
- **Detail:** no bearing tangs and oil holes, rod and piston part numbers, piston oil-drain holes, or the support-rail dimple.
- **Shape:** fillets, and the exact rod beam and piston forging shapes, are estimates from the photos.
