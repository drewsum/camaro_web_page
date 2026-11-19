import type { DriveProfile, DriveState } from "../../car/driveClock";

// One quarter-mile pass, repeated: stage, count down on the tree, launch,
// run to the finish, brake through the shutdown area, then fade out and
// start over. Distances are measured from the staged position.
//
// Each run is simulated once at a fine step and looked up by time. The driver
// asks for an acceleration (wide-open throttle, a clutch-in shift, lifting at
// the finish, braking) and the car's actual acceleration follows it with a
// short lag, the way drivetrain wind-up and brake pressure build, so the
// suspension never sees an instant jump.

export const QUARTER_MILE = 402.34;
export const STAGE_TIME = 4.2; // seconds from the start of a cycle to green
export const AMBER_STEP = 0.5; // sportsman tree: ambers 0.5 s apart, then green
export const FADE = 0.8; // seconds of fade at each end of the cycle
const HOLD = 1.6; // stopped before the fade, so the body can settle

const STEP = 1 / 500;
const JERK_LAG = 0.11; // s: how quickly actual acceleration follows the driver
const LAUNCH_RAMP = 0.22; // s from clutch dump to full bite
const LIFT = -0.7; // m/s² off the throttle (drag + engine braking)
const COAST = 0.7; // s between lifting at the finish and braking
const BRAKE_RAMP = 0.6; // s to build to full shutdown braking

export interface Runner {
  topSpeed: number; // m/s the full-throttle curve tends toward
  tau: number; // seconds; smaller = harder launch
  reaction: number; // seconds after green before the car moves
  shifts: number[]; // road speeds (m/s) at which the driver changes up
  shiftTime: number; // s with the clutch in
  brake: number; // m/s² of shutdown braking
}

export interface Leg {
  distance: number;
  speed: number;
  accel: number;
  braking: boolean;
}

interface Run {
  d: Float32Array;
  v: Float32Array;
  a: Float32Array;
  brakeFrom: number; // s after launch when the brake pedal goes down
  finish: number; // s from launch to the quarter-mile line
  trap: number; // m/s at the line
  stopped: number; // s from launch to standstill
}

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

function simulate(r: Runner): Run {
  const d: number[] = [0];
  const v: number[] = [0];
  const a: number[] = [0];
  let dist = 0;
  let speed = 0;
  let acc = 0;
  let gear = 0; // shifts done
  let shiftUntil = -1;
  let finish = -1;
  let trap = 0;
  let stopped = 60;
  for (let t = STEP; t < 60; t += STEP) {
    let target: number;
    if (finish < 0) {
      if (shiftUntil < 0 && gear < r.shifts.length && speed >= r.shifts[gear]) shiftUntil = t + r.shiftTime;
      if (shiftUntil > 0) {
        target = LIFT * 0.6; // clutch in, coasting
        if (t >= shiftUntil) {
          shiftUntil = -1;
          gear++;
        }
      } else target = ((r.topSpeed - speed) / r.tau) * smooth(t / LAUNCH_RAMP);
    } else {
      const brake = r.brake * smooth((t - finish - COAST) / BRAKE_RAMP);
      // Ease off the pedal in the last few m/s so the stop isn't a jolt.
      const ease = 0.35 + 0.65 * smooth(speed / 3);
      target = Math.min(LIFT, -brake * ease);
    }
    acc += (target - acc) * (1 - Math.exp(-STEP / JERK_LAG));
    speed += acc * STEP;
    if (finish >= 0 && speed <= 0) {
      stopped = t;
      d.push(dist);
      v.push(0);
      a.push(0);
      break;
    }
    dist += speed * STEP;
    if (finish < 0 && dist >= QUARTER_MILE) {
      finish = t;
      trap = speed;
    }
    d.push(dist);
    v.push(speed);
    a.push(acc);
  }
  return { d: Float32Array.from(d), v: Float32Array.from(v), a: Float32Array.from(a), brakeFrom: finish + COAST, finish, trap, stopped };
}

const runs = new WeakMap<Runner, Run>();
function runOf(r: Runner) {
  let run = runs.get(r);
  if (!run) {
    run = simulate(r);
    runs.set(r, run);
  }
  return run;
}

// Where the car is t seconds after it moves off.
function runAt(r: Runner, t: number): Leg {
  if (t <= 0) return { distance: 0, speed: 0, accel: 0, braking: false };
  const run = runOf(r);
  const last = run.d.length - 1;
  const x = t / STEP;
  if (x >= last) return { distance: run.d[last], speed: 0, accel: 0, braking: true };
  const i = Math.floor(x);
  const f = x - i;
  const lerp = (arr: Float32Array) => arr[i] + (arr[i + 1] - arr[i]) * f;
  return { distance: lerp(run.d), speed: lerp(run.v), accel: lerp(run.a), braking: t >= run.brakeFrom };
}

// Seconds from moving off to crossing the quarter mile.
export function finishTime(r: Runner) {
  return runOf(r).finish;
}

export function trapSpeed(r: Runner) {
  return runOf(r).trap;
}

export function stoppedAt(r: Runner) {
  return STAGE_TIME + r.reaction + runOf(r).stopped;
}

export class Race {
  readonly cycle: number;
  // The hero car's motion, for the DriveProvider.
  readonly heroProfile: DriveProfile;

  constructor(
    readonly hero: Runner,
    readonly rival: Runner,
  ) {
    this.cycle = Math.max(stoppedAt(hero), stoppedAt(rival)) + HOLD + FADE;
    this.heroProfile = this.profile(hero);
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

  profile(r: Runner): DriveProfile {
    return {
      state: (t: number): DriveState => {
        const l = this.leg(r, t);
        return { distance: l.distance, speed: l.speed, accel: l.accel, curvature: 0, grade: 0, braking: l.braking };
      },
    };
  }
}
