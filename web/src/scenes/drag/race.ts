import type { DriveProfile, DriveState } from "../../car/driveClock";

// One quarter-mile pass, repeated: stage, count down on the tree, launch,
// run to the finish, brake through the shutdown area, then fade out and
// start over. Distances are measured from the staged position.

export const QUARTER_MILE = 402.34;
export const STAGE_TIME = 4.2; // seconds from the start of a cycle to green
export const AMBER_STEP = 0.5; // sportsman tree: ambers 0.5 s apart, then green
export const FADE = 0.8; // seconds of fade at each end of the cycle
const SHUTDOWN_DECEL = 4.2; // m/s²
const HOLD = 1.2; // stopped before the fade

export interface Runner {
  topSpeed: number; // m/s the launch curve tends toward
  tau: number; // seconds; smaller = harder launch
  reaction: number; // seconds after green before the car moves
}

interface Leg {
  distance: number;
  speed: number;
  accel: number;
}

// Speed approaches topSpeed exponentially until the finish line, then the
// car brakes at a steady rate.
function runAt(r: Runner, t: number): Leg {
  if (t <= 0) return { distance: 0, speed: 0, accel: 0 };
  const finish = finishTime(r);
  if (t < finish) {
    const e = Math.exp(-t / r.tau);
    return {
      distance: r.topSpeed * (t - r.tau * (1 - e)),
      speed: r.topSpeed * (1 - e),
      accel: (r.topSpeed / r.tau) * e,
    };
  }
  const v0 = r.topSpeed * (1 - Math.exp(-finish / r.tau));
  const dt = Math.min(t - finish, v0 / SHUTDOWN_DECEL);
  const stopped = t - finish >= v0 / SHUTDOWN_DECEL;
  return {
    distance: QUARTER_MILE + v0 * dt - 0.5 * SHUTDOWN_DECEL * dt * dt,
    speed: v0 - SHUTDOWN_DECEL * dt,
    accel: stopped ? 0 : -SHUTDOWN_DECEL,
  };
}

// Seconds from moving off to crossing the quarter mile (solved numerically).
export function finishTime(r: Runner) {
  let lo = 0;
  let hi = 60;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const d = r.topSpeed * (mid - r.tau * (1 - Math.exp(-mid / r.tau)));
    if (d < QUARTER_MILE) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function trapSpeed(r: Runner) {
  return r.topSpeed * (1 - Math.exp(-finishTime(r) / r.tau));
}

export function stoppedAt(r: Runner) {
  return STAGE_TIME + r.reaction + finishTime(r) + trapSpeed(r) / SHUTDOWN_DECEL;
}

export class Race {
  readonly cycle: number;
  constructor(
    readonly hero: Runner,
    readonly rival: Runner,
  ) {
    this.cycle = Math.max(stoppedAt(hero), stoppedAt(rival)) + HOLD + FADE;
  }

  // Seconds into the current cycle.
  phase(t: number) {
    return ((t % this.cycle) + this.cycle) % this.cycle;
  }

  leg(r: Runner, t: number) {
    return runAt(r, this.phase(t) - STAGE_TIME - r.reaction);
  }

  // 1 = black. Fades in at the start of a cycle and out at the end.
  fade(t: number) {
    const p = this.phase(t);
    return Math.max(0, 1 - p / FADE, (p - (this.cycle - FADE)) / FADE);
  }

  // The hero car's motion, for the DriveProvider.
  readonly heroProfile: DriveProfile = {
    state: (t: number): DriveState => {
      const l = this.leg(this.hero, t);
      return { distance: l.distance, speed: l.speed, accel: l.accel, curvature: 0, grade: 0 };
    },
  };
}
