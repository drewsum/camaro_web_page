# Timing cover

Built by `build_front_cover.py`, after the cam/timing set and the oil pan. Collection `BBC_FrontCover`. Results are in `front_cover_info.json`.

## References

- **Photo 193:** the lid on the bench. Black stamped steel, with a narrow rounded top, the crank seal near the bottom, and a ring of small screws round the edge.
- **Photo 345:** the two pieces with their gaskets: the frame that bolts to the block, and the lid.
- **Photos 343 and 344:** the frame on the block, with the sprockets showing through.
- **Photos 163 and 169:** the cover on the assembled engine.
- **Block side:** the Gen VI 6-bolt pattern and dowels, [meas] from photos 29 and 30 (`../block/refs/front_face.json`):
  - bolts (1/4-20) at (±2.75, 8.01), (±4.17, 4.87) and (±3.23, .30);
  - dowels at (±3.69, 1.23).

## Parts

| Part | Built | Source |
|---|---|---|
| `TimingCoverFrame` | .30" thick on the block's front face (y 24.00–24.30), black composite.<br>**Outline:** wraps the bolt pattern, the cam (r 3.95) and the crank (r 2.35) [est].<br>**Opening:** clear of the cam sprocket and chain (r 3.25 about the cam) and the crank sprocket and chain (r 1.82). The sprocket tips are at r 3.07, the chain at 3.11, and the chain's low point under the crank at z −1.63.<br>**Holes:** six bolt holes, two dowel holes and eight tapped holes for the lid screws.<br>**Lower lobe:** reaches z −2.35, below the deck. The pan's curved front seal lip and its gasket seal against its underside. | Photos 343, 345; front-face pattern [meas] |
| `TimingCoverLid` | .07" stamped steel, satin black [est thickness].<br>**Flange:** on the frame, round the outline.<br>**Wall:** rises to a flat front face at y 24.90; the cam bolts end at 24.50. | Photos 193, 345 |
| `TimingCoverSeal` | Crank seal in the lid: 3.00" OD, 2.25" ID for the balancer hub, .40" wide [est]. | |
| `BalancerHub` | 8" harmonic balancer hub, satin black like the ring (Drew's photos) [est shape].<br>**Bore:** 1.600" on the crank nose, keyed (slot at the top, like the crank keyway).<br>**Hub:** 2.244" OD through the 2.25" seal (.003" clear), from the sprocket's front face (y 24.32) to 27.15, just past the crank nose; 3.20" nose ahead of the lid with three 3/8-24 pulley holes on a 2.50" circle.<br>**Web and rim:** web at y 25.95–26.45, inner rim 5.90–6.40" dia. | Drew: 8"; the rest [est] |
| `BalancerElastomer` | Black rubber band between the rim and the inertia ring, 6.40–6.56" dia. | [est] |
| `BalancerRing` | Inertia ring, 8.00" OD, 6.56" ID, 2.05" wide (y 25.10–27.15), OD edges chamfered .06".<br>Satin black. | Drew: 8"; the rest [est] |
| `BalancerMarks` | The printed white timing scale on the OD, as in Drew's photos of the damper on the engine: a stripe across the full width at TDC, ticks every 2° from the front edge out to 60° of advance (longer every 10°), and the numbers 0–60 behind the long ticks, reading front to rear. Advance runs clockwise of TDC seen from the front, the way the crank turns. The rest of the OD is bare. TDC is at the top at crank_deg 0 (no timing pointer is modelled). | Drew's photos |
| `BalancerKey` | 3/16" key in the crank keyway, y 24.36–26.95. | [est] |
| `BalancerBolt` | 3/4-16 bolt, 1-1/8" hex, and a 2.20" washer clamping the hub's front face; the shank runs 1.15" into the nose. | [est] |
| `TimingCoverBolts` | Six flanged 1/4-20 bolts through the lid and frame into the block, and eight lid screws into the frame [est sizes]. The screws are placed automatically on the flange, away from the bolts. | |

## Checks (`front_cover_info.json`)

- **Static clashes:** none against the block, the oil pan and its bolts, or the cam thrust plate.
- **Rotating clashes:** none, every 10° over 720° against the crank, sprockets, chain, cam bolts and cam.
- **Lid clearance:** the inside of the lid clears the timing set by .33".
- **Expected contacts:** the bolts in the block, frame and lid, and the dowels in the frame.
- **Balancer:** the parts are in this collection, so hiding the cover hides them, and are parented to `Crankshaft`, so they turn with it. Turning the crank every 15° finds no clash with the block, pan, cover or timing set. The ring clears the lid by .20". Expected contacts: the hub bore and the key on the crank nose.

## Differences from the photos, and not modelled

- **Outline:** fitted round the measured bolt pattern; it is not traced from photo 193.
- **Lid screws:** the photo shows about ten; the model has eight.
- **Lid stiffening:** the lid's pressed ribs are not modelled.
- **Not modelled:** the timing pointer, the gaskets and a crank pulley.
