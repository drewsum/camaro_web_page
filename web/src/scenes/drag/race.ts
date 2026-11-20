import type { DriveProfile, DriveState } from "../../car/driveClock";

// One quarter-mile pass, repeated: a burnout in the water box behind the
// line, a creep up through the pre-stage and stage beams, the count down on
// the tree, launch, run to the finish, brake through the shutdown area, then
// fade out and start over. Distances are measured from the staged position.
//
// Each run is simulated once at a fine step and looked up by time. The driver
// asks for an acceleration (wide-open throttle, a clutch-in shift, lifting at
// the finish, braking) and the car's actual acceleration follows it with a
// short lag, the way drivetrain wind-up and brake pressure build, so the
// suspension never sees an instant jump.

export const QUARTER_MILE = 402.34;
export const AMBER_STEP = 0.5; // sportsman tree: ambers 0.5 s apart, then green
export const FADE = 0.8; // seconds of fade at each end of the cycle

// The burnout and staging, before the tree comes down.
export const BOX = 11; // m behind the stage beams: the water box
export const PRE_STAGE = 0.18; // m short of stage where the pre-stage beam breaks
const BURN_FROM = FADE + 0.3;
const BURN = 3.2; // s of wheelspin
const BURN_SPEED = 30; // m/s at the tread, flat out
const ROLL_FROM = BURN_FROM + BURN + 0.7;
const ROLL = 4.6; // s to creep up from the box to stage
const MAX_LAG = 0.5; // the later car's burnout and staging run this much behind
export const STAGE_TIME = ROLL_FROM + ROLL + MAX_LAG + 1.8; // seconds from the start of a cycle to green

// Tread speed through the burnout, `q` seconds after the throttle goes down.
function burnSpeed(q: number) {
  if (q <= 0 || q >= BURN) return 0;
  return BURN_SPEED * smooth(q / 0.6) * smooth((BURN - q) / 0.5);
}

// Tread spun through by `q` seconds into the burnout, from a table.
const SPIN_STEP = 0.002;
const SPIN = (() => {
  const n = Math.ceil(BURN / SPIN_STEP) + 2;
  const table = new Float32Array(n);
  for (let i = 1; i < n; i++) table[i] = table[i - 1] + burnSpeed((i - 0.5) * SPIN_STEP) * SPIN_STEP;
  return table;
})();
const SPIN_TOTAL = SPIN[SPIN.length - 1];
function spunBy(q: number) {
  if (q <= 0) return 0;
  const x = q / SPIN_STEP;
  if (x >= SPIN.length - 1) return SPIN_TOTAL;
  const i = Math.floor(x);
  return SPIN[i] + (SPIN[i + 1] - SPIN[i]) * (x - i);
}
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
  stageLag?: number; // s its burnout and staging run behind the cycle's (at most MAX_LAG)
}

export interface Leg {
  distance: number;
  speed: number;
  accel: number;
  braking: boolean;
  spin: number; // metres of wheelspin at the rear tread so far this cycle
  spinRate: number; // m/s of wheelspin right now
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

function smooth(x: number) {
  return x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
}

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
  const spin = SPIN_TOTAL;
  if (t <= 0) return { distance: 0, speed: 0, accel: 0, braking: false, spin, spinRate: 0 };
  const run = runOf(r);
  const last = run.d.length - 1;
  const x = t / STEP;
  if (x >= last) return { distance: run.d[last], speed: 0, accel: 0, braking: true, spin, spinRate: 0 };
  const i = Math.floor(x);
  const f = x - i;
  const lerp = (arr: Float32Array) => arr[i] + (arr[i + 1] - arr[i]) * f;
  return { distance: lerp(run.d), speed: lerp(run.v), accel: lerp(run.a), braking: t >= run.brakeFrom, spin, spinRate: 0 };
}

// Before the tree drops: sitting in the water box, the burnout (front brakes
// locked, so the brake lamps are lit and the rear squats), then the creep up
// to the beams. `q` is seconds into the cycle, less the car's stage lag.
function preludeAt(q: number): Leg {
  const b = q - BURN_FROM;
  const spinRate = burnSpeed(b);
  if (q < ROLL_FROM) {
    return { distance: -BOX, speed: 0, accel: 2.2 * (spinRate / BURN_SPEED), braking: b > 0 && b < BURN, spin: spunBy(b), spinRate };
  }
  const u = Math.min(1, (q - ROLL_FROM) / ROLL);
  // Smoothstep from the box to the stage beams.
  const distance = -BOX + BOX * smooth(u);
  const speed = u < 1 ? (BOX * 6 * u * (1 - u)) / ROLL : 0;
  const accel = u < 1 ? (BOX * (6 - 12 * u)) / (ROLL * ROLL) : 0;
  return { distance, speed, accel, braking: u >= 1, spin: SPIN_TOTAL, spinRate: 0 };
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

  leg(r: Runner, t: number): Leg {
    const p = this.phase(t);
    const go = p - STAGE_TIME - r.reaction;
    return go > 0 ? runAt(r, go) : preludeAt(p - Math.min(MAX_LAG, r.stageLag ?? 0));
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
        return { distance: l.distance, speed: l.speed, accel: l.accel, curvature: 0, grade: 0, braking: l.braking, spin: l.spin };
      },
    };
  }
}
