import { Track } from "../../car/track";

// A mountain pass, 4 km a lap: two tight hairpins doubling back across a
// ravine, joined by long sweepers. The hairpins all turn right, toward the
// valley side (-u), so where the road folds back on itself only the ravine
// lies between the two legs; the mountainside (+u) is always on the outside
// of a hairpin. The left-hand sweepers that balance them are wide enough that
// the slope inside them never pinches the road.
export const MOUNTAIN_LENGTH = 4000;

const TAU = Math.PI * 2;

// A long climb to the pass and back down, with steeper pitches on the way.
function elevation(s: number) {
  const a = (TAU * s) / MOUNTAIN_LENGTH;
  return 900 + 52 * Math.sin(a - 1.2) + 14 * Math.sin(2 * a + 0.4) + 4 * Math.sin(5 * a + 2.1);
}

export const mountainTrack = new Track({
  length: MOUNTAIN_LENGTH,
  elevation,
  curves: [
    { start: 100, entry: 80, arc: 400, exit: 80, radius: 380 },
    { start: 760, entry: 35, arc: 85, exit: 35, radius: -45 },
    { start: 1050, entry: 80, arc: 500, exit: 80, radius: 380 },
    { start: 1850, entry: 35, arc: 85, exit: 35, radius: -45 },
    { start: 2150, entry: 80, arc: 0, exit: 80, radius: 380 },
  ],
  maxSpeed: 22, // about 50 mph
  maxLateral: 3,
  maxAccel: 1.3,
  maxBrake: 2.4,
});
