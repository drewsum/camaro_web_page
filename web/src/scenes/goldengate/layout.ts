import { BoxGeometry, Euler, Matrix4, type BufferGeometry } from "three";

// Northbound over the Golden Gate. The course runs along +Z (course
// coordinate s, in metres) and loops every L metres: out of the Presidio
// tunnel, along the approach, across the bridge, through the Marin
// headlands and into the Waldo tunnel. The loop's seam is at s = 0 (= L),
// deep inside the one tunnel the two ends share, where nothing outside can
// be seen. North is +Z, so west (the Pacific) is +X, the car's left.

export const L = 4200; // a whole number of lane-dash periods (12 m) and wave periods (200 m)
export const SPEED = 20; // m/s, the bridge's 45 mph
export const START = 1150; // course position at load: on the bridge, the south tower ahead

// The road's centre line (the median) sits left of the car, which drives in
// the middle of the three northbound lanes.
export const BX = 4.8;
export const LANE = 3.2;
export const ROAD_HALF = 9.6; // six lanes
export const ASPHALT_HALF = 11;
export const CUT_HALF = 16; // the terrain starts this far either side of the median

// Heights are relative to the road deck. The water is 67 m below it.
export const WATER = -67;

// The bridge, south to north: anchorage, south tower, north tower, anchorage.
export const ANCH_S = 1004;
export const TOWER_S = 1343;
export const TOWER_N = TOWER_S + 1280;
export const ANCH_N = TOWER_N + 343;
export const BRIDGE_START = 930; // where the approach gives way to the anchorage
export const BRIDGE_END = 3040;

export const CABLE_X = 13.7; // each cable's plane, either side of the median
export const CABLE_TOP = 162; // over the saddles on the tower tops
export const CABLE_MID = 3; // lowest point, mid-span
export const CABLE_END = 7; // where it enters the anchorage pylon
const SIDE_SAG = 10;

export function cableY(s: number) {
  if (s <= TOWER_S) {
    const t = (s - ANCH_S) / (TOWER_S - ANCH_S);
    return CABLE_END + (CABLE_TOP - CABLE_END) * t - 4 * SIDE_SAG * t * (1 - t);
  }
  if (s >= TOWER_N) {
    const t = (ANCH_N - s) / (ANCH_N - TOWER_N);
    return CABLE_END + (CABLE_TOP - CABLE_END) * t - 4 * SIDE_SAG * t * (1 - t);
  }
  const u = (s - (TOWER_S + TOWER_N) / 2) / ((TOWER_N - TOWER_S) / 2);
  return CABLE_MID + (CABLE_TOP - CABLE_MID) * u * u;
}

// The tunnel the loop's two ends share, in wrapped course coordinates t:
// the Waldo tunnel's mouth at t = -300 (s = L - 300) and the Presidio
// tunnel's at t = 250.
export const TUNNEL_IN = -300;
export const TUNNEL_OUT = 250;
export const TUNNEL_TOP = 20; // the ground over the bores
const RAMP = 45; // the cutting each side of a tunnel mouth

// s wrapped into [TUNNEL_IN, L + TUNNEL_IN).
export function wrapT(s: number) {
  const m = ((s % L) + L) % L;
  return m >= L + TUNNEL_IN ? m - L : m;
}

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

// ---- Terrain ------------------------------------------------------------------

// Shorelines, as the course position of the water's edge at each x.
export function shoreSouth(x: number) {
  const wiggle = 40 * Math.sin(x / 260) + 25 * Math.sin(x / 97 + 1);
  return 1080 + wiggle + (x < 0 ? 0.13 * x : -0.3 * x - 1.5 * Math.max(0, x - 2600));
}
export function shoreNorth(x: number) {
  const wiggle = 45 * Math.sin(x / 310 + 2) + 20 * Math.sin(x / 83);
  return 2900 + wiggle + (x < 0 ? 0.45 * Math.max(0, -x - 400) : -0.06 * x + 2.5 * Math.max(0, x - 4300));
}

// Rolling ridges, roughly -1.5..1.5.
export function ridges(x: number, z: number, seed = 0) {
  let h = 0;
  let a = 1;
  let f = 1 / 900;
  for (let i = 0; i < 5; i++) {
    const c = Math.cos(i * 1.7 + seed);
    const s = Math.sin(i * 1.7 + seed);
    h += a * Math.sin(x * f * c + z * f * s + i * 2.1 + seed) * Math.sin(x * f * s * 1.3 - z * f * c * 1.1 + i * 0.7);
    a *= 0.5;
    f *= 2.03;
  }
  return h;
}

// The land as nature left it, before the road was cut through.
export function naturalY(x: number, s: number) {
  const dS = shoreSouth(x) - s; // inland from the city's shore
  const dN = s - shoreNorth(x); // inland from Marin's
  const seabed = (d: number) => Math.max(-110, -70 + d * 0.08);
  let sf = dS < 0 ? seabed(dS) : -70 + 78 * smoothstep(0, 80, dS) + (18 + 22 * ridges(x, s, 1)) * smoothstep(80, 600, dS);
  // Twin Peaks, off to the south-east.
  sf += 240 * Math.exp(-((x + 3500) ** 2 + (s + 4500) ** 2) / 1300 ** 2) * smoothstep(0, 300, dS);
  // Marin's headlands, rising steeply off the water, lower in the valley the road follows.
  const valley = 0.3 + 0.7 * smoothstep(30, 500, Math.abs(x - BX));
  const marin = dN < 0 ? seabed(dN) : -70 + 92 * smoothstep(0, 60, dN) + (150 + 85 * ridges(x, s, 4)) * smoothstep(40, 900, dN) * valley;
  // Angel Island, out in the bay.
  const r = Math.hypot(x + 6200, s - 5600);
  const island = -95 + 330 * smoothstep(1400, 0, r) ** 1.5 + 25 * ridges(x, s, 9) * smoothstep(1400, 600, r);
  return Math.max(sf, marin, island);
}

// The corridor the road runs in: graded flat on land, a saddle over the
// tunnel, ramps down to each portal, and the ground kept well clear under the
// bridge's ends. `w` is how much of it applies across from the road.
function corridor(t: number, h: number, w: number) {
  const set = (y: number) => mix(h, y, w);
  const under = Math.min(h, mix(h, -14, w));
  if (t < TUNNEL_OUT) return set(TUNNEL_TOP);
  if (t < TUNNEL_OUT + RAMP) return set(mix(TUNNEL_TOP, -0.3, smoothstep(TUNNEL_OUT, TUNNEL_OUT + RAMP, t)));
  if (t < BRIDGE_START) return set(-0.3);
  if (t < BRIDGE_START + 60) return mix(set(-0.3), under, smoothstep(BRIDGE_START, BRIDGE_START + 60, t));
  if (t < ANCH_N - 26) return under;
  if (t < ANCH_N + 34) return mix(under, set(-0.3), smoothstep(ANCH_N - 26, ANCH_N + 34, t));
  if (t < L + TUNNEL_IN - RAMP) return set(-0.3);
  return set(mix(-0.3, TUNNEL_TOP, smoothstep(L + TUNNEL_IN - RAMP, L + TUNNEL_IN, t)));
}

export function groundY(x: number, s: number) {
  const h = naturalY(x, s);
  // Only near the course; far off, the land is left alone.
  const near = smoothstep(-1300, -900, s) * (1 - smoothstep(L + 900, L + 1300, s));
  const w = (1 - smoothstep(CUT_HALF, CUT_HALF + 120, Math.abs(x - BX))) * near;
  if (w <= 0) return h;
  return corridor(wrapT(s), h, w);
}

// ---- Geometry helpers ---------------------------------------------------------

const euler = new Euler();
const rot = new Matrix4();
export function box(w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): BufferGeometry {
  const g = new BoxGeometry(w, h, d);
  if (rx || ry || rz) g.applyMatrix4(rot.makeRotationFromEuler(euler.set(rx, ry, rz)));
  g.translate(x, y, z);
  return g;
}
