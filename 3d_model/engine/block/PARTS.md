# Gen VI big-block Chevy cylinder block: parts breakdown and spec sheet

The block in Drew's 540: GM **P/N 19170540**, the bare block of the **ZZ502** crate engine the build started from (photo 14), bored from 4.470" to **4.500"**. The front face is cast **"MK VI"** (photo 29). This is the reference for `build_block.py`. Nothing gets modelled that isn't in this file, and every number here has a source.

**Confidence tags:**
- **[spec]**: published by GM or by a block or gasket maker.
- **[forum]**: a single secondhand source; verify before relying on it.
- **[measure]**: still unknown. It comes from a scan, a photo measurement or a tape measure.

## Axes and origin (model space, inches in this file, metres in Blender)

- **Origin:** the crankshaft centreline, at the rear face of the block (the bellhousing flange plane).
- **+Y:** forward, towards the timing cover. **+X:** passenger side (right bank, cylinders 2-4-6-8). **+Z:** up.
- **Banks:** each cylinder axis sits 45° from vertical and passes through the crank centreline.
- **Deck:** the deck plane is 9.800" from the crank centreline, measured along the bore axis.

## Block-level facts

| Item | Value | Source |
|---|---|---|
| Part number | 19170540 (ZZ502 bare block, Mark IV/Gen VI) | [spec] Chevrolet Performance / crate engine spec sheets |
| Deck height | 9.800" (Edelbrock note: castings run .005–.010" tall for machining) | [spec] |
| Bank angle | 90° | [spec] |
| Bore spacing | 4.840" | [spec] |
| Bore | 4.470" as delivered, 4.500" as built; Siamese cylinders | [spec] / Drew |
| Main bearing bore (line-honed) | 2.9375" | [spec] |
| Main journal | 2.750" | [spec] |
| Main caps | 4-bolt; ARP main studs; outer bolts straight (this block), 110 ft-lb | [spec] / Drew |
| Cam bearing bore | 2.120" | [spec] |
| Cam plug (rear) | 2-7/32" (2.218") | [spec] Dart notes for the standard BBC cam bore |
| Lifter bore | .8437" | [spec] |
| Lifters | Hydraulic roller with retainer provisions | [spec] / Drew (photo 27) |
| Rear main seal | 1-piece; Gen VI oil pan and Gen VI 6-bolt front cover | [spec] |
| Head bolt pattern | Mark IV = Gen V = Gen VI; blind-tapped holes, extra inner bosses (4 in the valley) | [spec] Car Tech / Cometic |
| Coolant ports at the deck | Gen VI-specific (gaskets differ from Mark IV) | [spec] Car Tech |
| Fuel pump pad | Machined (added on 19170540) | [spec]; check against Drew's block |
| Other bosses | Distributor-area bolt boss (like 8.1L); two clutch pivot bosses | [spec] |
| Cylinder numbering | Left bank 1-3-5-7 front to rear, right bank 2-4-6-8; left bank is the forward bank | [spec] |
| Bare block size | About 24" front face to bellhousing face; about 13.5" from manifold rail to the bottom of the front main cap; about 19" across the deck edges | [forum] |
| Weight | About 269 lb bare | [spec] |

## Bellhousing face (Chevy V8 pattern; crank centreline = 0,0)

| Feature | X | Y | Source |
|---|---|---|---|
| Lower bolt | ∓7.800 | 0.440 | [forum] |
| Dowel | ∓7.690 | 2.320 | [forum] |
| Upper side bolt | ∓7.800 | 4.200 | [forum] |
| Remaining bolts, top-centre | — | — | [measure] |

## Still to establish, and from what

| Feature | Plan |
|---|---|
| Head bolt and stud holes, coolant ports, dowels on the deck | A flat scan of a Gen VI head gasket, or a photo of one scaled to the 4.840" bore spacing |
| Front face: 6-bolt cover pattern, water pump bolts and ports, cam and crank bores, oil pump drive | A Gen VI front cover gasket and water pump gaskets, scanned or scaled; photos 29 and 38 |
| Pan rail outline and bolt pattern | A Gen VI one-piece pan gasket, scanned or scaled; photo 22 |
| Cylinder bank stagger, the cylinder-1 offset from the front face, the cam height above the crank | Measure on a reference drawing or photo; confirm against the timing set |
| Main cap web positions and cap shapes, oil filter pad, side bosses, motor-mount bosses, freeze plugs (3 per side) | Photos 22, 26 and 38, plus online bare-block photos |
| Intake manifold rail angle and bolt pattern | An intake gasket (rectangular port), scaled |

## Parts (separate meshes)

1. **Block casting:** the outer skin, water jacket outline, valley and skirts.
2. **Cylinder bores:** eight, at 4.500".
3. **Decks:** the two machined surfaces, with head-stud, coolant and dowel holes.
4. **Main bulkheads and caps:** five; four-bolt where applicable; studs as separate meshes.
5. **Cam tunnel:** five bearing bores and the thrust plate pad on the front face.
6. **Lifter bores:** sixteen, with lifter-retainer bosses.
7. **Front face:** cover, water pump, timing and oil pump features.
8. **Rear face:** bellhousing flange, dowels, rear main seal housing, cam plug.
9. **Pan rail:** bolt pattern.
10. **Side features:** oil filter pad, freeze plugs, fuel pump pad, mount bosses, drain plugs, main oil gallery plugs.

## Reference meshes (not used for geometry)

- `naturally_aspirated_454_cid_v8.glb` and `blown_454_cid_v8.glb`: "454 cid V8" by Jorma Rysky, CC BY 4.0 (https://skfb.ly/p7FsJ, https://skfb.ly/p7Fss).
- In `bbc_block_work.blend`, the isolated block from the NA model is `Ref454_Block`.
- That block is a low-detail shell, about 23.7 × 17.6 × 10.6 in, with no bores or holes. Use it only as a rough size check.
