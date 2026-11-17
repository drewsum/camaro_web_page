import raw from "./capitolSquare.json";

// Map data for the Capitol Square scene, made by scripts/capitol-square.mjs
// from OpenStreetMap and USGS elevation. Metres, x east, z south, y up, with
// the Capitol at the origin.

export type Pt = [number, number]; // x, z

export interface Building {
  id: number;
  kind: string;
  name?: string;
  h: number; // metres from the ground to the roof
  min?: number;
  pts: Pt[];
}

export interface Join {
  at: Pt; // where a side street meets the ring
  names: string[];
  dirs: number[]; // headings of the side streets leaving the ring (0 = +z, + toward +x)
}

interface CapitolData {
  grid: { x0: number; z0: number; step: number; n: number; h: number[] };
  ring: Pt[]; // the Square's one-way loop, counterclockwise seen from above
  joins: Join[];
  roads: { name: string; kind: string; width: number; lanes: number; oneway: boolean; pts: Pt[] }[];
  capitol: Pt[];
  buildings: Building[];
  green: { kind: "lawn" | "bed" | "park"; pts: Pt[] }[];
  trees: [number, number, number][]; // x, z, 1 = conifer
}

export const MAP = raw as unknown as CapitolData;
export const EXTENT = 420; // metres of city mapped around the Capitol

const { x0, z0, step, n, h } = MAP.grid;

// Ground height, interpolated over the grid's triangles exactly as the
// terrain mesh draws them (each cell split from (i+1, j) to (i, j+1)), so
// anything placed with it sits right on the visible ground.
export function groundY(x: number, z: number) {
  const fx = Math.min(n - 1.001, Math.max(0, (x - x0) / step));
  const fz = Math.min(n - 1.001, Math.max(0, (z - z0) / step));
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const u = fx - i;
  const v = fz - j;
  const at = (a: number, b: number) => h[(j + b) * n + i + a];
  return u + v <= 1
    ? at(0, 0) + (at(1, 0) - at(0, 0)) * u + (at(0, 1) - at(0, 0)) * v
    : at(1, 1) + (at(0, 1) - at(1, 1)) * (1 - u) + (at(1, 0) - at(1, 1)) * (1 - v);
}

export const GRID = { x0, z0, step, n, h };

// ---- Polyline helpers -----------------------------------------------------

export function polylineLength(p: Pt[], closed = false) {
  let len = 0;
  const m = closed ? p.length : p.length - 1;
  for (let i = 0; i < m; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    len += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return len;
}

// Points every `ds` metres along a polyline.
export function resample(p: Pt[], ds: number, closed = false): Pt[] {
  const out: Pt[] = [];
  const pts = closed ? [...p, p[0]] : p;
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    let d = carry;
    while (d < len) {
      const t = d / len;
      out.push([ax + (bx - ax) * t, az + (bz - az) * t]);
      d += ds;
    }
    carry = d - len;
  }
  if (!closed) out.push(pts[pts.length - 1]);
  return out;
}

// Distance from a point to a segment.
export function segmentDistance(px: number, pz: number, a: Pt, b: Pt) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz || 1e-9;
  const t = Math.min(1, Math.max(0, ((px - a[0]) * dx + (pz - a[1]) * dz) / l2));
  return Math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t);
}

// Signed area (positive when counterclockwise in x-z seen from +y... i.e.
// clockwise on a north-up map, since z points south).
export function signedArea(p: Pt[]) {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, z1] = p[i], [x2, z2] = p[(i + 1) % p.length];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}

// Same [0, 1) for the same inputs, for stable per-object variety.
export function hash(a: number, b = 0) {
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return v - Math.floor(v);
}
