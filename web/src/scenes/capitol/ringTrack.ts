import type { DriveProfile, DriveState } from "../../car/driveClock";
import type { TrackPoint } from "../../car/track";
import { groundY, MAP, resample, type Pt } from "./data";

// The drive: counterclockwise around the Square in the general traffic lane,
// stopping for the red light at each corner and rolling through the green
// lights at the four avenues. The loop is closed and the city is static, so
// laps repeat exactly.
//
// Same frame conventions as car/track.ts: heading ψ (0 = +z, + toward +x),
// left normal N = (cos ψ, 0, -sin ψ), lateral offset u along N (+ = left,
// which on this counterclockwise loop is the Capitol side).

// Across the ring roadway (u from its centreline): inner parking [3.6, 6],
// general lane [0.2, 3.6], bus lane [-3.4, 0.2], outer parking [-6, -3.4].
export const RING = { halfWidth: 6, innerParking: 3.6, laneLine: 0.2, outerParking: -3.4, lane: 1.9 };

const STEP = 1;
const MAX_SPEED = 8.9; // 20 mph, the Square's limit
const MAX_LATERAL = 1.6;
const MAX_ACCEL = 1.3;
const MAX_BRAKE = 1.7;
export const RED_WAIT = 7; // seconds stopped at each corner
const STOP_BEFORE_APEX = 17; // metres from the stop position to the corner's apex
const START_CORNER = "South Hamilton Street";

export interface Intersection {
  s: number; // where the side street meets the ring, along the car's lane
  corner: boolean; // corners have a red light for the car
  stop: number; // for corners: where the car waits
  at: Pt; // the junction on the ring's centreline
  dirs: number[]; // headings of the side streets
  names: string[];
}

function chaikin(p: Pt[], rounds: number): Pt[] {
  let pts = p;
  for (let r = 0; r < rounds; r++) {
    const out: Pt[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
      out.push([0.75 * ax + 0.25 * bx, 0.75 * az + 0.25 * bz], [0.25 * ax + 0.75 * bx, 0.25 * az + 0.75 * bz]);
    }
    pts = out;
  }
  return pts;
}

function headings(p: Pt[]) {
  const n = p.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const [ax, az] = p[(i - 1 + n) % n], [bx, bz] = p[(i + 1) % n];
    out[i] = Math.atan2(bx - ax, bz - az);
  }
  // Unwrap so the heading is continuous around the lap.
  for (let i = 1; i < n; i++) {
    while (out[i] - out[i - 1] > Math.PI) out[i] -= 2 * Math.PI;
    while (out[i] - out[i - 1] < -Math.PI) out[i] += 2 * Math.PI;
  }
  return out;
}

// Curvature: the heading's rate of change, wrapped across the lap's seam.
function turnRate(h: Float64Array) {
  const n = h.length;
  return Float64Array.from(h, (_, i) => {
    let d = h[(i + 1) % n] - h[(i - 1 + n) % n];
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d / (2 * STEP);
  });
}

function circularSmooth(a: Float64Array, half: number) {
  const n = a.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let k = -half; k <= half; k++) v += a[(i + k + n) % n];
    out[i] = v / (2 * half + 1);
  }
  return out;
}

// The ring's centreline with its corners rounded, every metre (closed).
export function ringCentre(): Pt[] {
  return resample(chaikin(MAP.ring, 2), STEP, true);
}

export class RingTrack implements DriveProfile {
  readonly length: number;
  readonly lapTime: number;
  readonly intersections: Intersection[];
  private readonly n: number;
  private readonly x: Float64Array;
  private readonly z: Float64Array;
  private readonly y: Float64Array;
  private readonly heading: Float64Array;
  private readonly curv: Float64Array;
  private readonly grade: Float64Array;
  private readonly speed: Float64Array;
  private readonly time: Float64Array; // arrival time at each sample within a lap
  private readonly dwell: Float64Array;

  constructor() {
    // Centreline, then the lane offset from it.
    const centre = ringCentre();
    let psi = headings(centre);
    let lane: Pt[] = centre.map(([x, z], i) => [x + Math.cos(psi[i]) * RING.lane, z - Math.sin(psi[i]) * RING.lane]);
    lane = resample(lane, STEP, true);
    const n0 = lane.length;

    // Where the side streets join, matched to the lane by nearest point.
    const nearest = (p: Pt) => {
      let best = 0, bd = Infinity;
      lane.forEach(([x, z], i) => {
        const d = (x - p[0]) ** 2 + (z - p[1]) ** 2;
        if (d < bd) (bd = d), (best = i);
      });
      return best;
    };
    psi = headings(lane);
    const k0 = circularSmooth(turnRate(psi), 3);

    const clusters: { at: Pt; dirs: number[]; names: string[] }[] = [];
    for (const j of MAP.joins) {
      const c = clusters.find((c) => Math.hypot(c.at[0] - j.at[0], c.at[1] - j.at[1]) < 30);
      if (c) {
        c.dirs.push(...j.dirs);
        c.names.push(...j.names);
      } else clusters.push({ at: j.at, dirs: [...j.dirs], names: [...j.names] });
    }
    const raw = clusters.map((c) => {
      const i = nearest(c.at);
      // A corner if the lane turns sharply within 30 m.
      let peak = i, kmax = 0;
      for (let d = -30; d <= 30; d++) {
        const ii = (i + d + n0) % n0;
        if (k0[ii] > kmax) (kmax = k0[ii]), (peak = ii);
      }
      const corner = kmax > 0.025;
      return { ...c, i, corner, stopI: corner ? (peak - STOP_BEFORE_APEX + n0) % n0 : i };
    });

    // Start the lap with the car waiting at the red light at South Hamilton
    // Street, looking up the south wing to the dome.
    const corners = raw.filter((r) => r.corner);
    const first = corners.find((r) => r.names.includes(START_CORNER)) ?? corners[0];
    const shift = first ? first.stopI : 0;
    lane = [...lane.slice(shift), ...lane.slice(0, shift)];
    const n = (this.n = n0);
    this.length = n * STEP;

    const x = (this.x = new Float64Array(n + 1));
    const z = (this.z = new Float64Array(n + 1));
    const y = (this.y = new Float64Array(n + 1));
    for (let i = 0; i <= n; i++) {
      const [px, pz] = lane[i % n];
      x[i] = px;
      z[i] = pz;
      y[i] = groundY(px, pz);
    }
    const h = headings(lane);
    const heading = (this.heading = new Float64Array(n + 1));
    for (let i = 0; i < n; i++) heading[i] = h[i];
    // One full turn later: the loop's total heading change.
    heading[n] = h[0] + 2 * Math.PI * Math.round((h[n - 1] - h[0]) / (2 * Math.PI));
    const ks = circularSmooth(turnRate(h), 3);
    this.curv = Float64Array.from({ length: n + 1 }, (_, i) => ks[i % n]);
    const g = new Float64Array(n);
    for (let i = 0; i < n; i++) g[i] = (y[(i + 4) % n] - y[(i - 4 + n) % n]) / (8 * STEP);
    const gs = circularSmooth(g, 4);
    this.grade = Float64Array.from({ length: n + 1 }, (_, i) => gs[i % n]);

    this.intersections = raw
      .map((r) => {
        const s = (((r.i - shift) % n) + n) % n;
        const stop = (((r.stopI - shift) % n) + n) % n;
        return { s, corner: r.corner, stop, at: r.at, dirs: r.dirs, names: r.names };
      })
      .sort((a, b) => a.s - b.s);

    // Speed plan: corner limits and the red lights, then acceleration and
    // braking limits swept both ways around three laps so they wrap.
    const target = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const kk = Math.abs(ks[i]);
      target[i] = Math.min(MAX_SPEED, kk > 1e-5 ? Math.sqrt(MAX_LATERAL / kk) : Infinity);
    }
    const dwell = (this.dwell = new Float64Array(n + 1));
    for (const it of this.intersections) {
      if (!it.corner) continue;
      target[it.stop] = 0;
      dwell[it.stop] = RED_WAIT;
    }
    const v = new Float64Array(3 * n);
    for (let i = 0; i < 3 * n; i++) v[i] = target[i % n];
    for (let i = 1; i < 3 * n; i++) v[i] = Math.min(v[i], Math.sqrt(v[i - 1] ** 2 + 2 * MAX_ACCEL * STEP));
    for (let i = 3 * n - 2; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] ** 2 + 2 * MAX_BRAKE * STEP));
    const speed = (this.speed = v.slice(n, 2 * n + 1));

    const time = (this.time = new Float64Array(n + 1));
    for (let i = 1; i <= n; i++) time[i] = time[i - 1] + dwell[i - 1] + (2 * STEP) / Math.max(0.05, speed[i - 1] + speed[i]);
    this.lapTime = time[n]; // from arriving at the first red light to arriving there again
  }

  // Seconds into the lap when the car first reaches s (arrival, before any wait).
  timeAt(s: number) {
    const f = (((s % this.length) + this.length) % this.length) / STEP;
    const i = Math.min(this.n - 1, Math.floor(f));
    return this.time[i] + this.dwell[i] + (this.time[i + 1] - this.time[i] - this.dwell[i]) * (f - i);
  }

  at(s: number): TrackPoint {
    const lapS = ((s % this.length) + this.length) % this.length;
    const f = lapS / STEP;
    const i = Math.min(this.n - 1, Math.floor(f));
    const t = f - i;
    const lerp = (a: Float64Array) => a[i] + (a[i + 1] - a[i]) * t;
    return { x: lerp(this.x), y: lerp(this.y), z: lerp(this.z), heading: lerp(this.heading), curvature: lerp(this.curv), grade: lerp(this.grade) };
  }

  offset(p: TrackPoint, u: number, up = 0): [number, number, number] {
    return [p.x + Math.cos(p.heading) * u, p.y + up, p.z - Math.sin(p.heading) * u];
  }

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
    const base = lap * this.length;
    const waited = tt - this.time[lo];
    if (waited < this.dwell[lo]) {
      const p = this.at(lo * STEP);
      // Holding the car on the brake at the light.
      return { distance: base + lo * STEP, speed: 0, accel: 0, curvature: p.curvature, grade: p.grade, braking: true };
    }
    const span = this.time[lo + 1] - this.time[lo] - this.dwell[lo];
    const f = Math.min(1, (waited - this.dwell[lo]) / span);
    const s = (lo + f) * STEP;
    const speed = this.speed[lo] + (this.speed[lo + 1] - this.speed[lo]) * f;
    const accel = (Math.max(speed, 0.3) * (this.speed[lo + 1] - this.speed[lo])) / STEP;
    const p = this.at(s);
    return { distance: base + s, speed, accel, curvature: p.curvature, grade: p.grade };
  }
}

export const ringTrack = new RingTrack();
