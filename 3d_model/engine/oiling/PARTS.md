# Oil pan, windage tray and billet oil pump

Built by `build_oiling.py`, after the block and crank. Collection `BBC_Oiling`. Results are in `oiling_info.json`. Nothing here moves.

## References

- **Pan:** album photos 163, 164, 169, 170 and 340 show it on the block with the engine upside down on the stand. Photos 11 and 12 show it on the bench. It is a black rear-sump pan: a stamped section along the whole block, with a tall flat-sided box welded under its rear half.
  - Drew: the sump is 8" deep.
  - Comparable rear-sump pans for this engine are listed at 8" deep and 6–6.5 qt, and 4.75–5.25" deep at the front.
  - Photos 139, 140 and 143 are the valve covers; 13 and 165 are the old pan. Neither set is used here.
- **Windage tray:** photos 168, 187, 188 and 190. A flat grey plate with four square panels, on the long inner studs of caps 3 and 4.
- **Pump:** Drew: a one-piece billet pump with the pickup integrated into the body.
- **Pump pad:** the rear cap's outlet pocket, dowel and stud, from `../block/refs/bottom.json` (photo 435).

## Parts

| Part | Built | Source |
|---|---|---|
| `OilPan` | 14-gauge sheet (.075") [est].<br>**Rail flange:** .096" thick, out to ±6.00", with a front band under the deck beside the timing chest (the deck is open for |x| < 2.95" there, so the band stops at ±2.90"). The block rail is 4.75–5.95" [meas]; the pan sits a gasket (.06") below it.<br>**Stamped section:** 5.0" deep from the rail, walls at ±5.00", 1.0" bottom radius [est]. It necks in to ±4.55" over the last 1.2" so the front pair of pan bolts (x 4.88") clears the walls.<br>**Sump box:** 8.0" deep from the rail (Drew), ±4.25" wide, from .02" to 11.5" ahead of the rear face [est; about half the block's length in photo 170, narrower than the stamping in photo 169].<br>**Front seal (Drew):** the pan runs forward to y 24.29, under the timing-cover frame (y 24.00–24.30). Its front wall rises to a curved .096" seal lip that follows the frame's lower lobe, which hangs up to 2.35" below the deck, with the gasket squeezed between. The lip's shape is sampled off the built frame, so the front cover is built first.<br>**Rear seal (Drew):** the rear wall rises to a curved lip, an arc about the crank under the #5 cap's seal arc (r 3.10, y 0–.25), gasket between.<br>**Drain:** bung and plug on the box's passenger side [est]. | Photos 163, 169, 170; Drew; listings |
| `OilPanBolts` | 18 rail bolts plus the front pair, in the block's [meas] pattern (`../block/refs/pan_rail.json`). 5/16 flanged heads [est]. | |
| `OilPanDrainPlug` | 1/2" plug, .62" hex [est]. | |
| `WindageTray` | Flat plate .075" [est] at z −4.30 to −4.375, ±4.55" wide, from y 6.55 to 13.95 [est].<br>Four square panels pressed .13" down, each with three drain slots [est; photo 190 shows the panels, the slots are a guess].<br>Holes for the four .50" long studs. | Photos 168, 190 |
| `WindageTrayNuts` | Spacers from the cap nuts down to the tray, and nuts under it [est]. | |
| `OilPump` | One-piece billet pump, black anodized, with the pickup machined into the body (Drew; finish and squared tower from Drew's photo). Sizes [est].<br>**Ear:** on the rear cap's driver-side pad, carrying the 7/16 stud and the dowel hole, from the pad layout [meas].<br>**Outlet nipple:** in the cap's .95" pocket.<br>**Gear section:** 2.4" × 2.05" × 1.55" below the ear, with the cover machined in (no separate cover).<br>**Pickup:** a 1.6" × 1.5" leg down into the box, flaring to a 2.6" × 3.1" square-cornered inlet foot with a .30" deep inlet pocket. | Drew; `../block/refs/bottom.json` |
| `OilPumpHardware` | The pump stud and nut, four socket screws in the gear section, and six button-head screws on the screen plate [est]. | |
| `OilPanGasket` | Blue rubber pan gasket, .060" compressed [est], one piece: the rail bands (x 4.92–5.95") with the pan-bolt holes, the flat front band beside the chest, the curved front seal under the timing cover's lower lobe and the curved rear seal under the #5 cap's seal arc. .002" clear of the block, cover and cap above and the pan below. | Drew |
| `OilFilter`, `OilFilterGasket` | Spin-on filter on the block's filter pad (driver-side rear corner, `../block/refs/bottom.json` "filter_pad"), hanging straight down: rubber gasket .002" off the pad, rolled seam, 3.32" x 5.0" can with a rounded bottom, satin black [est; no brand]. A 3.66" can would sit on the pan bolt at (-5.40, 2.15), 2.0" from the pad centre, so this one is compact; the pan flange and gasket are notched round it (.06" clear). | Drew; photo 431 |
| `OilPickupScreen` | Flat .10" black screen plate bolted over the inlet, perforated with .10" square holes on a .20" grid. Its face is .375" above the sump floor (layout from Drew's photo, sizes [est]). | Drew photo |

## Block changes

The #5 cap's rear end (y 0–.25, ahead of it the pump pad starts at y .275) is now turned to an arc about the crank, r 3.10, tangent to the cap bottom: the curved seal section the pan's rear gasket squeezes against (Drew; `../block/refs/bottom.json`, `rear_cap.seal_arc_*`, length [est]).


The long windage-tray studs on caps 3 and 4 now extend .90" below the cap nuts (`../block/refs/bottom.json`, `windage_studs.extra`; it was 2.5" [est]). Each stud takes a spacer, the tray and a nut, and ends .08" above the pan's front floor at cap 3.

## Checks (`oiling_info.json`)

- **Static clashes:** none against the block, main caps, studs, dowels and plugs, the timing cover, or between these parts (meshes triangulated properly first, so concave lip caps test true). The expected contacts are listed: the pump stud and nut, the screen-plate screws, and the tray nuts on their studs.
- **Rotating clashes:** none, every 10° over 720° against the crank, rods, rod caps and bolts, pistons, cam and flywheel.
- **Rotating clearance:** the lowest rotating point is z −3.98. The tray clears it by .32".
- **Oil volume:** the sump box below the front floor holds about 4.7 qt. The whole pan below the rail is about 24 qt of space, most of it crankcase above any oil level.
- **Weight (steel, from the mesh volume):** pan about 14.7 lb, tray about 1.8 lb.

## Differences from the photos, and not modelled

- **Pan shape:** the oval stiffening emboss on the stamping's floor (photo 170) and any kick-out are not modelled. The box is drawn centred and flat-sided; listings call these pans "kicked-out", and from the photos I can't tell whether this box kicks out to one side.
- **Inside the pan:** no baffles, trap doors or scraper.
- **Pump shape:** finish, squared tower and bolted screen plate follow Drew's installed photo; the dimensions are still estimated.
- **Not modelled:** dipstick tube, pan gasket, the pump's drive shaft and its intermediate shaft to the distributor.
- **Branding:** the box's lettering is left off.
