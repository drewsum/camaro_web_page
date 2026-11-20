import { Track } from "../../car/track";

// A desert two-lane, 6 km a lap: mostly dead straight, with a couple of long,
// lazy bends and gentle dips where it crosses dry washes.
export const DESERT_LENGTH = 6000;

const TAU = Math.PI * 2;

function elevation(s: number) {
  const a = (TAU * s) / DESERT_LENGTH;
  return 600 + 7 * Math.sin(a + 0.6) + 2.5 * Math.sin(4 * a + 1.1) + 0.8 * Math.sin(11 * a + 0.3);
}

export const desertTrack = new Track({
  length: DESERT_LENGTH,
  elevation,
  curves: [
    { start: 800, entry: 200, arc: 400, exit: 200, radius: 2000 },
    { start: 2500, entry: 200, arc: 500, exit: 200, radius: -1800 },
    { start: 4300, entry: 200, arc: 0, exit: 200, radius: 9000 },
  ],
  maxSpeed: 31, // about 70 mph
  maxLateral: 2.5,
  maxAccel: 1.2,
  maxBrake: 2,
});
