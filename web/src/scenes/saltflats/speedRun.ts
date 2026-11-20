import type { DriveProfile, DriveState } from "../../car/driveClock";

// A land-speed run, over and over: wait at the start line, launch, pull up
// through the gears to about 190 mph, hold it through the timed mile, then
// brake to a stop. Each run covers exactly RUN_LENGTH metres, so every run
// starts on the same line of the course, which repeats every RUN_LENGTH.

export const MARKER_SPACING = 1600; // course markers every "mile"
export const RUN_LENGTH = 4 * MARKER_SPACING;
export const TOP_SPEED = 85; // m/s

interface Phase {
  duration: number;
  accel: number; // m/s², constant through the phase
  braking?: boolean;
}

// Hard off the line, easing as the speed and drag build.
const climb: [number, number, number][] = [
  // [from, to, accel]
  [0, 40, 4.5],
  [40, 70, 2],
  [70, TOP_SPEED, 0.8],
];
const BRAKE = 3;
const WAIT = 5;

function phases(): Phase[] {
  const out: Phase[] = [{ duration: WAIT, accel: 0, braking: true }];
  let used = 0;
  for (const [a, b, acc] of climb) {
    out.push({ duration: (b - a) / acc, accel: acc });
    used += (b * b - a * a) / (2 * acc);
  }
  const stopping = (TOP_SPEED * TOP_SPEED) / (2 * BRAKE);
  out.push({ duration: (RUN_LENGTH - used - stopping) / TOP_SPEED, accel: 0 });
  out.push({ duration: TOP_SPEED / BRAKE, accel: -BRAKE, braking: true });
  return out;
}

const PHASES = phases();
export const RUN_TIME = PHASES.reduce((a, p) => a + p.duration, 0);

export const speedRun: DriveProfile = {
  state(t: number): DriveState {
    const run = Math.floor(t / RUN_TIME);
    let tt = t - run * RUN_TIME;
    let distance = 0;
    let speed = 0;
    for (const p of PHASES) {
      if (tt <= p.duration) {
        const d = speed * tt + 0.5 * p.accel * tt * tt;
        return {
          distance: run * RUN_LENGTH + distance + d,
          speed: speed + p.accel * tt,
          accel: p.accel,
          curvature: 0,
          grade: 0,
          braking: p.braking,
        };
      }
      distance += speed * p.duration + 0.5 * p.accel * p.duration * p.duration;
      speed += p.accel * p.duration;
      tt -= p.duration;
    }
    return { distance: (run + 1) * RUN_LENGTH, speed: 0, accel: 0, curvature: 0, grade: 0, braking: true };
  },
};
