// Longitudinal weight transfer through each car's springs and shocks.
//
// Speeding up or slowing down moves load between the axles by
//   ΔW = m · a · h / L
// (mass, acceleration, centre-of-gravity height, wheelbase). Each axle's share
// of the sprung mass rides on that axle's springs and dampers, so the front
// and rear each respond as their own mass-spring-damper: under acceleration
// the front rises and the rear squats, under braking the nose dives, and when
// the load changes they overshoot and settle at their own rates. Suspension
// geometry resists part of it (anti-squat at the rear, anti-dive at the
// front), and bump stops limit the travel.

export interface Chassis {
  mass: number; // kg, sprung mass
  frontWeight: number; // fraction of the static weight on the front axle
  cgHeight: number; // m above the ground
  wheelbase: number; // m
  kFront: number; // N/m, both front wheel rates together
  kRear: number; // N/m, both rear wheel rates together
  zeta: number; // damping ratio (0.2-0.3 is a '60s shock, 0.4+ a modern one)
  antiSquat: number; // fraction of rear squat the geometry cancels
  antiDive: number; // fraction of front dive the geometry cancels
  bump: number; // m of compression before the bump stop
  droop: number; // m of extension before the shock tops out
}

// '68 Camaro SS: 3,400 lb, 55/45, coil front, multi-leaf rear.
export const CAMARO_CHASSIS: Chassis = {
  mass: 1560,
  frontWeight: 0.55,
  cgHeight: 0.53,
  wheelbase: 2.743,
  kFront: 50_000,
  kRear: 40_000,
  zeta: 0.3,
  antiSquat: 0.25,
  antiDive: 0.15,
  bump: 0.07,
  droop: 0.08,
};

// '69 Mach 1 428 Cobra Jet: 3,600 lb with the big-block's 59/41 nose-heavy
// split, heavier front coils, staggered rear shocks.
export const MUSTANG_CHASSIS: Chassis = {
  mass: 1630,
  frontWeight: 0.59,
  cgHeight: 0.52,
  wheelbase: 2.743,
  kFront: 56_000,
  kRear: 36_000,
  zeta: 0.27,
  antiSquat: 0.3,
  antiDive: 0.1,
  bump: 0.07,
  droop: 0.08,
};

export interface AxleTravel {
  front: number; // m the body rises at the front axle (- = compressed)
  rear: number; // m the body rises at the rear axle
}

const STEP = 1 / 400;
const SETTLE = 3; // s of history to replay when the clock jumps

interface Axle {
  m: number;
  k: number;
  c: number;
  z: number;
  v: number;
}

// Integrates the two axles against an acceleration history. Call
// `update(t, accelAt)` once a frame with the drive clock; it sub-steps from
// the last time it saw. If time runs backwards or jumps (a scene reset, a
// background tab), it rebuilds the state by replaying the last few seconds,
// which is long enough for any bounce to have died away.
export class Suspension {
  private front: Axle;
  private rear: Axle;
  private t = NaN;

  constructor(readonly chassis: Chassis) {
    const mf = chassis.mass * chassis.frontWeight;
    const mr = chassis.mass - mf;
    const axle = (m: number, k: number): Axle => ({ m, k, c: 2 * chassis.zeta * Math.sqrt(k * m), z: 0, v: 0 });
    this.front = axle(mf, chassis.kFront);
    this.rear = axle(mr, chassis.kRear);
  }

  // Load moved onto the rear axle (N) at a given acceleration.
  private transfer(a: number) {
    const c = this.chassis;
    return (c.mass * a * c.cgHeight) / c.wheelbase;
  }

  private step(a: number, dt: number) {
    const c = this.chassis;
    const dw = this.transfer(a);
    // Upward force on the body at each axle from the change in load.
    const fFront = dw * (dw < 0 ? 1 - c.antiDive : 1);
    const fRear = -dw * (dw > 0 ? 1 - c.antiSquat : 1);
    for (const [ax, f] of [
      [this.front, fFront],
      [this.rear, fRear],
    ] as const) {
      // Semi-implicit Euler: stable at this step for these frequencies.
      ax.v += ((f - ax.k * ax.z - ax.c * ax.v) / ax.m) * dt;
      ax.z += ax.v * dt;
      // Bump stops and topping out: a stiff, lossy stop rather than a wall.
      if (ax.z < -c.bump) {
        ax.z = -c.bump;
        if (ax.v < 0) ax.v *= -0.2;
      } else if (ax.z > c.droop) {
        ax.z = c.droop;
        if (ax.v > 0) ax.v *= -0.2;
      }
    }
  }

  private settle(a: number) {
    const dw = this.transfer(a);
    const c = this.chassis;
    this.front.z = (dw * (dw < 0 ? 1 - c.antiDive : 1)) / this.front.k;
    this.rear.z = (-dw * (dw > 0 ? 1 - c.antiSquat : 1)) / this.rear.k;
    this.front.v = this.rear.v = 0;
  }

  update(t: number, accelAt: (t: number) => number): AxleTravel {
    if (!(t >= this.t) || t - this.t > 0.5) {
      const from = t - SETTLE;
      this.settle(accelAt(from));
      this.t = from;
    }
    while (this.t + STEP <= t) {
      this.t += STEP;
      this.step(accelAt(this.t), STEP);
    }
    return { front: this.front.z, rear: this.rear.z };
  }
}

// Body pitch and heave for a body pivoting at `pivot` metres ahead of the
// rear axle, given how far each axle has risen. Pitch is + nose down.
export function bodyMotion(travel: AxleTravel, wheelbase: number, pivot: number) {
  const pitch = Math.atan((travel.rear - travel.front) / wheelbase);
  const heave = travel.rear + ((travel.front - travel.rear) * pivot) / wheelbase;
  return { pitch, heave };
}
