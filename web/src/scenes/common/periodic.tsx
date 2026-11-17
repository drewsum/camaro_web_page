import { useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferAttribute,
  Matrix4,
  PlaneGeometry,
  type BufferGeometry,
  type Color,
  type Group,
  type InstancedMesh,
} from "three";
import { driveDistance, useDrive } from "../../car/driveClock";

// Building blocks for driving scenes. The car sits at the origin facing +Z
// and the world scrolls toward -Z. Scenery is built to repeat exactly every
// `period` metres and is shifted back by (distance mod period), so the
// endless loop never shows a seam.

// Small seeded PRNG so procedural scenery is the same on every load.
export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Scrolls its children past the car. Children must repeat every `period`
// metres along Z; `start` is where their z = 0 sits when the offset is zero.
export function Scroll({ period, start = 0, children }: { period: number; start?: number; children: ReactNode }) {
  const drive = useDrive();
  const group = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (group.current) group.current.position.z = start - (driveDistance(drive, clock.elapsedTime) % period);
  });
  return <group ref={group}>{children}</group>;
}

interface StripOptions {
  width: number; // across X, from x = 0 to x = width
  cols: number;
  period: number; // metres before the profile repeats along Z
  segment: number; // row spacing along Z; must divide period
  copies: number; // periods laid end to end, from z = 0
  // Height for column i (0..cols) and row k within one period (0..period/segment - 1).
  height: (i: number, k: number) => number;
}

// A heightmapped strip whose rows repeat every `period` metres, so shifting
// it back by one period is invisible.
export function makePeriodicStrip({ width, cols, period, segment, copies, height }: StripOptions) {
  const perPeriod = Math.round(period / segment);
  const rows = perPeriod * copies;
  const length = period * copies;
  const table = Array.from({ length: perPeriod }, (_, k) => Array.from({ length: cols + 1 }, (_, i) => height(i, k)));
  const geo = new PlaneGeometry(width, length, cols, rows);
  geo.rotateX(-Math.PI / 2);
  geo.translate(width / 2, 0, length / 2);
  const pos = geo.attributes.position;
  for (let r = 0; r <= rows; r++) {
    // After the rotation rows run from -Z to +Z, so row r sits at z = r * segment.
    for (let i = 0; i <= cols; i++) pos.setY(r * (cols + 1) + i, table[r % perPeriod][i]);
  }
  geo.computeVertexNormals();
  return geo;
}

// Bakes per-vertex colours from each vertex's height (pair with vertexColors).
// `pick` gets the height and a stable per-vertex random number in [0, 1).
export function paintByHeight(geo: BufferGeometry, seed: number, pick: (y: number, r: number) => Color) {
  const rand = mulberry32(seed);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let v = 0; v < pos.count; v++) pick(pos.getY(v), rand()).toArray(colors, v * 3);
  geo.setAttribute("color", new BufferAttribute(colors, 3));
  return geo;
}

// Lays out instances: `place` fills `m` for instance n and returns false to skip it.
export function fillInstances(mesh: InstancedMesh, count: number, place: (n: number, m: Matrix4) => boolean) {
  const m = new Matrix4();
  let used = 0;
  for (let n = 0; n < count; n++) {
    m.identity();
    if (place(n, m)) mesh.setMatrixAt(used++, m);
  }
  mesh.count = used;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}
