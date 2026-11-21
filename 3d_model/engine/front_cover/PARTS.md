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
| `TimingCoverBolts` | Six flanged 1/4-20 bolts through the lid and frame into the block, and eight lid screws into the frame [est sizes]. The screws are placed automatically on the flange, away from the bolts. | |

## Checks (`front_cover_info.json`)

- **Static clashes:** none against the block, the oil pan and its bolts, or the cam thrust plate.
- **Rotating clashes:** none, every 10° over 720° against the crank, sprockets, chain, cam bolts and cam.
- **Lid clearance:** the inside of the lid clears the timing set by .33".
- **Expected contacts:** the bolts in the block, frame and lid, and the dowels in the frame.

## Differences from the photos, and not modelled

- **Outline:** fitted round the measured bolt pattern; it is not traced from photo 193.
- **Lid screws:** the photo shows about ten; the model has eight.
- **Lid stiffening:** the lid's pressed ribs are not modelled.
- **Not modelled:** the timing pointer, the gaskets, the balancer and the crank bolt. The crank snout ends bare in front of the seal.
