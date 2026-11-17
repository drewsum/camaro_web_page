import type { DriveProfile, DriveState } from "./driveClock";

// A winding, rolling road that repeats every `length` metres: after one lap
// the heading and elevation are back where they started and the road has only
// shifted sideways, so scenery built from (distance mod length) tiles with no
// seam. Also plans how a driver would take it: easing off for tight corners
// and climbs, braking before bends and accelerating out of them.
//
// Path frame at distance s: heading ψ (radians, 0 = +Z, + = turned toward +X),
// tangent T = (sin ψ, 0, cos ψ), left normal N = (cos ψ, 0, -sin ψ). Lateral
// offset u is measured along N, so + is the driver's (left) side.

export interface Curve {
  start: number; // metres along the lap where the easement begins
  entry: number; // length of the clothoid easing in
  arc: number; // length at full curvature
  exit: number; // length easing out
  radius: number; // metres; + turns left, - turns right
}

export interface TrackOptions {
  curves: Curve[]; // the last one's arc is adjusted so each lap's heading change is zero
  length: number;
  elevation: (s: number) => number; // metres; must repeat every `length`
  maxSpeed: number; // m/s
  maxLateral: number; // m/s² the driver is comfortable with in corners
  maxAccel: number; // m/s²
  maxBrake: number; // m/s²
}

export interface TrackPoint {
  x: number;
  y: number;
  z: number;
  heading: number;
  curvature: number;
  grade: number;
}

const STEP = 1; // metres between samples

export class Track implements DriveProfile {
  readonly length: number;
  readonly lapTime: number;
  readonly lapShift: { x: number; z: number }; // how far one lap moves the road sideways
  private readonly n: number;
  private readonly x: Float64Array;
  private readonly z: Float64Array;
  private readonly heading: Float64Array;
  private readonly curv: Float64Array;
  private readonly elev: (s: number) => number;
  private readonly speed: Float64Array;
  private readonly time: Float64Array; // seconds to reach each sample within a lap

  constructor(o: TrackOptions) {
    this.length = o.length;
    this.elev = o.elevation;
    const n = (this.n = Math.round(o.length / STEP));
    const curves = o.curves.map((c) => ({ ...c }));

    // Close the heading: stretch the last curve's arc to cancel the others.
    const turn = (c: Curve) => (c.entry / 2 + c.arc + c.exit / 2) / c.radius;
    const last = curves[curves.length - 1];
    const others = curves.slice(0, -1).reduce((a, c) => a + turn(c), 0);
    last.arc = -others * last.radius - last.entry / 2 - last.exit / 2;
    if (last.arc < 0 || last.start + last.entry + last.arc + last.exit > o.length) {
      throw new Error("Track: the last curve can't close the lap's heading");
    }

    const curv = (this.curv = new Float64Array(n + 1));
    for (const c of curves) {
      const k = 1 / c.radius;
      for (let i = 0; i <= n; i++) {
        const t = i * STEP - c.start;
        if (t < 0 || t > c.entry + c.arc + c.exit) continue;
        if (t < c.entry) curv[i] += (k * t) / c.entry;
        else if (t < c.entry + c.arc) curv[i] += k;
        else curv[i] += (k * (c.entry + c.arc + c.exit - t)) / c.exit;
      }
    }

    // Integrate heading and position (midpoint rule).
    const heading = (this.heading = new Float64Array(n + 1));
    const x = (this.x = new Float64Array(n + 1));
    const z = (this.z = new Float64Array(n + 1));
    for (let i = 1; i <= n; i++) {
      heading[i] = heading[i - 1] + ((curv[i - 1] + curv[i]) / 2) * STEP;
      const mid = (heading[i - 1] + heading[i]) / 2;
      x[i] = x[i - 1] + Math.sin(mid) * STEP;
      z[i] = z[i - 1] + Math.cos(mid) * STEP;
    }
    this.lapShift = { x: x[n], z: z[n] };

    // Speed plan: corner and grade limits, then acceleration and braking
    // limits swept forwards and backwards around the lap (three laps so the
    // sweeps wrap).
    const target = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const corner = Math.abs(curv[i]) > 1e-6 ? Math.sqrt(o.maxLateral / Math.abs(curv[i])) : Infinity;
      const climb = Math.max(0, this.gradeAt(i * STEP));
      target[i] = Math.min(o.maxSpeed * (1 - 1.5 * climb), corner);
    }
    const v = new Float64Array(3 * n);
    for (let i = 0; i < 3 * n; i++) v[i] = target[i % n];
    for (let i = 1; i < 3 * n; i++) v[i] = Math.min(v[i], Math.sqrt(v[i - 1] ** 2 + 2 * o.maxAccel * STEP));
    for (let i = 3 * n - 2; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] ** 2 + 2 * o.maxBrake * STEP));
    const speed = (this.speed = v.slice(n, 2 * n + 1));

    const time = (this.time = new Float64Array(n + 1));
    for (let i = 1; i <= n; i++) time[i] = time[i - 1] + (2 * STEP) / (speed[i - 1] + speed[i]);
    this.lapTime = time[n];
  }

  // Index and fraction for a distance within one lap.
  private locate(s: number): [number, number] {
    const f = s / STEP;
    const i = Math.min(this.n - 1, Math.max(0, Math.floor(f)));
    return [i, f - i];
  }

  gradeAt(s: number) {
    return (this.elev(s + 0.5) - this.elev(s - 0.5)) / 1;
  }

  // Position and orientation at any distance, including beyond one lap.
  at(s: number): TrackPoint {
    const lap = Math.floor(s / this.length);
    const [i, f] = this.locate(s - lap * this.length);
    const lerp = (a: Float64Array) => a[i] + (a[i + 1] - a[i]) * f;
    return {
      x: lerp(this.x) + lap * this.lapShift.x,
      y: this.elev(s),
      z: lerp(this.z) + lap * this.lapShift.z,
      heading: lerp(this.heading),
      curvature: lerp(this.curv),
      grade: this.gradeAt(s),
    };
  }

  // World position of a point offset sideways (+u = driver's side) and up.
  offset(p: TrackPoint, u: number, up = 0): [number, number, number] {
    return [p.x + Math.cos(p.heading) * u, p.y + up, p.z - Math.sin(p.heading) * u];
  }

  // DriveProfile: where the car is t seconds into the drive.
  state(t: number): DriveState {
    const lap = Math.floor(t / this.lapTime);
    const tt = t - lap * this.lapTime;
    let lo = 0;
    let hi = this.n;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.time[mid] <= tt) lo = mid;
      else hi = mid;
    }
    const f = (tt - this.time[lo]) / (this.time[lo + 1] - this.time[lo]);
    const s = (lo + f) * STEP;
    const speed = this.speed[lo] + (this.speed[lo + 1] - this.speed[lo]) * f;
    // v dv/ds, from the neighbouring samples.
    const accel = (speed * (this.speed[lo + 1] - this.speed[lo])) / STEP;
    const p = this.at(s);
    return { distance: lap * this.length + s, speed, accel, curvature: p.curvature, grade: p.grade };
  }
}
