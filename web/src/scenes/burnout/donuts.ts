import type { DriveProfile } from "../../car/driveClock";
import { mulberry32 } from "../common/periodic";

// The Camaro's routine in the burnout pen: a never-ending, seeded-random
// string of donuts. It spins a loop or three round one spot, then either
// flicks straight into a donut the other way (a figure eight) or straightens
// up, squirts across the pen and drops into a new donut, either way round.
// Every piece joins the next with the same heading, so the path is smooth.
//
// The path is in the pen's frame: x and z in metres from its centre, the car's
// yaw about +y with 0 facing +z (the car model's nose). A positive yaw step
// turns the nose to the car's left, which is +x when it faces +z.

export const PEN_HALF = 13; // the donuts stay this far inside the pen's centre
export const SPEED = 6.5; // m/s over the ground
export const WHEEL_SPEED = 26; // m/s at the tyre tread: the rear wheels lit up
const DRIFT = 0.95; // rad the nose is swung in toward the donut's centre
const EASE = 0.55; // seconds to swing the tail out (or back in)

interface Circle {
  kind: "circle";
  t0: number;
  t1: number;
  cx: number;
  cz: number;
  r: number;
  dir: 1 | -1; // +1 = angle increasing (x toward z)
  a0: number; // angle at t0
}

interface Line {
  kind: "line";
  t0: number;
  t1: number;
  x: number;
  z: number;
  hx: number; // unit heading
  hz: number;
}

type Piece = Circle | Line;

export interface CarPoseXZ {
  x: number;
  z: number;
  yaw: number;
  drift: number; // 0 = rolling straight, 1 = tail fully out
  curvature: number; // 1/m, + = turning left
}

function circlePoint(c: Circle, t: number) {
  const a = c.a0 + (c.dir * SPEED * (t - c.t0)) / c.r;
  return { a, x: c.cx + c.r * Math.cos(a), z: c.cz + c.r * Math.sin(a) };
}

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

export function makeRoutine(seed: number, minutes = 120) {
  const rand = mulberry32(seed);
  const pieces: Piece[] = [];
  const inside = (x: number, z: number, margin: number) => Math.abs(x) < PEN_HALF - margin && Math.abs(z) < PEN_HALF - margin;
  let c: Circle = { kind: "circle", t0: 0, t1: 0, cx: 0, cz: 0, r: 3.4, dir: 1, a0: 0 };
  while (c.t0 < minutes * 60) {
    // How long to stay on this donut: one to three loops, then on round to
    // an exit point from which the next move stays inside the pen.
    const loops = 1 + rand() * 2;
    const period = (2 * Math.PI * c.r) / SPEED;
    const straight = rand() < 0.3;
    const nextR = 2.9 + rand() * 1.3;
    const len = 7 + rand() * 9;
    const side = rand() < 0.5 ? 1 : -1;
    let found: { t1: number; next: Circle; line?: Line } | null = null;
    for (let k = 0; k < 24 && !found; k++) {
      const t1 = c.t0 + period * (loops + k / 24);
      const p = circlePoint(c, t1);
      // The heading on leaving.
      const hx = -Math.sin(p.a) * c.dir;
      const hz = Math.cos(p.a) * c.dir;
      if (straight) {
        const qx = p.x + hx * len;
        const qz = p.z + hz * len;
        // Into the new donut turning either way: its centre off one side.
        const cx = qx - hz * side * nextR;
        const cz = qz + hx * side * nextR;
        if (!inside(qx, qz, 1.5) || !inside(cx, cz, nextR + 1.5)) continue;
        const a0 = Math.atan2(qz - cz, qx - cx);
        // Which way round keeps the heading: the tangent at a0 must match.
        const dir: 1 | -1 = -Math.sin(a0) * hx + Math.cos(a0) * hz > 0 ? 1 : -1;
        const tl = t1 + len / SPEED;
        found = {
          t1,
          line: { kind: "line", t0: t1, t1: tl, x: p.x, z: p.z, hx, hz },
          next: { kind: "circle", t0: tl, t1: tl, cx, cz, r: nextR, dir, a0 },
        };
      } else {
        // A figure eight: the next donut touches this one where we leave it,
        // on the far side, and goes round the other way.
        const cx = p.x + Math.cos(p.a) * nextR;
        const cz = p.z + Math.sin(p.a) * nextR;
        if (!inside(cx, cz, nextR + 1.5)) continue;
        found = { t1, next: { kind: "circle", t0: t1, t1, cx, cz, r: nextR, dir: (-c.dir) as 1 | -1, a0: p.a + Math.PI } };
      }
    }
    if (!found) {
      // Boxed in: one more loop, then try again from there.
      const t1 = c.t0 + period;
      pieces.push({ ...c, t1 });
      c = { ...c, t0: t1, a0: circlePoint(c, t1).a };
      continue;
    }
    pieces.push({ ...c, t1: found.t1 });
    if (found.line) pieces.push(found.line);
    c = found.next;
  }
  const end = pieces[pieces.length - 1].t1;

  let last = 0;
  function find(t: number) {
    // Usually the same piece as last frame, or the next one.
    if (pieces[last].t0 > t) last = 0;
    while (last < pieces.length - 1 && pieces[last].t1 <= t) last++;
    return pieces[last];
  }

  function pose(time: number): CarPoseXZ {
    const t = ((time % end) + end) % end;
    const p = find(t);
    if (p.kind === "line") {
      const s = SPEED * (t - p.t0);
      return { x: p.x + p.hx * s, z: p.z + p.hz * s, yaw: Math.atan2(p.hx, p.hz), drift: 0, curvature: 0 };
    }
    const { a, x, z } = circlePoint(p, t);
    const yawV = Math.atan2(-Math.sin(a) * p.dir, Math.cos(a) * p.dir);
    // The tail swings out over the first moments of a donut and tucks back in
    // at the end, so the car passes through straight at each change.
    const drift = Math.min(smooth((t - p.t0) / EASE), smooth((p.t1 - t) / EASE));
    // Is the centre off the car's left (+1) or right (-1)? Left is (cos ψ, -sin ψ).
    const left = Math.cos(yawV) * (p.cx - x) - Math.sin(yawV) * (p.cz - z) > 0 ? 1 : -1;
    const wobble = 0.06 * Math.sin(t * 2.3) * drift;
    return { x, z, yaw: yawV + left * (DRIFT * drift + wobble), drift, curvature: (left * drift) / p.r };
  }

  // For the wheels: the rear tyres spin far faster than the car travels;
  // the front ones steer into the turn and the body leans out of it.
  const profile: DriveProfile = {
    state: (t) => {
      const s = pose(t);
      return { distance: WHEEL_SPEED * t, speed: SPEED, accel: 0, curvature: s.curvature * 0.8, grade: 0 };
    },
  };

  return { pose, profile };
}
