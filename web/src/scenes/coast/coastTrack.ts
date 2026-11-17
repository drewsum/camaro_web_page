import { Track } from "../../car/track";

// The coast road: about 2.6 km per lap of straights and sweepers. Left
// bends turn inland (the hills are on the inside, so they're gentle enough
// for the terrain not to pinch); right bends turn toward the ocean and can be
// tight. The last bend is sized automatically so each lap ends heading the
// same way it began.
export const COAST_LENGTH = 2600;

const TAU = Math.PI * 2;

// Road height above sea level: rolling climbs and descents, repeating each lap.
function elevation(s: number) {
  const a = (TAU * s) / COAST_LENGTH;
  return 46 + 11 * Math.sin(a + 0.3) + 5 * Math.sin(3 * a + 1.2) + 1.5 * Math.sin(7 * a + 2);
}

export const coastTrack = new Track({
  length: COAST_LENGTH,
  elevation,
  curves: [
    { start: 250, entry: 90, arc: 160, exit: 90, radius: 320 },
    { start: 760, entry: 70, arc: 120, exit: 70, radius: -130 },
    { start: 1120, entry: 100, arc: 220, exit: 100, radius: 420 },
    { start: 1640, entry: 80, arc: 150, exit: 80, radius: -200 },
    { start: 2050, entry: 80, arc: 0, exit: 80, radius: 280 },
  ],
  maxSpeed: 27, // about 60 mph
  maxLateral: 2.8,
  maxAccel: 1.2,
  maxBrake: 2.2,
});
