import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import {
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Matrix4,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
  type InstancedMesh,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GroundGlows, NearestLights } from "../common/night";
import {
  ANCH_N,
  ANCH_S,
  BRIDGE_END,
  BRIDGE_START,
  BX,
  CABLE_X,
  L,
  ROAD_HALF,
  TOWER_N,
  TOWER_S,
  TUNNEL_IN,
  TUNNEL_OUT,
  box,
  cableY,
} from "./layout";

// The bridge in its own frame: x across from the median, y up from the deck,
// z along the course. Mounted at x = BX.

export const ORANGE = new Color("#c8442a"); // International Orange
const CONCRETE = "#bdb7ab";
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export function Instances({
  geometry,
  matrices,
  children,
  castShadow = false,
  receiveShadow = false,
}: {
  geometry: BufferGeometry;
  matrices: Matrix4[];
  children: ReactNode;
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current!;
    matrices.forEach((x, i) => m.setMatrixAt(i, x));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [matrices]);
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, matrices.length]} castShadow={castShadow} receiveShadow={receiveShadow}>
      {children}
    </instancedMesh>
  );
}

// ---- Towers -------------------------------------------------------------------

// Two legs, stepping in at each portal strut, with the vertical recesses of
// the Art Deco design; four portal struts above the roadway, the deck passing
// through the lowest opening, and X-bracing below it down to the pier.
const LEVELS = [0, 56, 94, 122, 146, 160];
const BELOW = [-52, -35, -18, 0];
const STRUTS: [number, number][] = [
  [56, 66],
  [94, 102],
  [122, 129],
  [146, 152],
];
export const TOWER_HEIGHT = 160;
const legW = (y: number) => (y < 0 ? mix(9.6, 7.4, (y + 52) / 52) : mix(7.4, 5.6, y / 160));
const legD = (y: number) => (y < 0 ? mix(18, 16, (y + 52) / 52) : mix(16, 10.4, y / 160));
export const TOWER_HALF_DEPTH = legD(0) / 2;

function towerGeometry() {
  const g: BufferGeometry[] = [];
  const segments = [...BELOW.slice(0, -1).map((y, i) => [y, BELOW[i + 1]]), ...LEVELS.slice(0, -1).map((y, i) => [y, LEVELS[i + 1]])];
  for (const sx of [-1, 1]) {
    const cx = sx * CABLE_X;
    for (const [y0, y1] of segments) {
      const w = legW(y0);
      const d = legD(y0);
      const h = y1 - y0;
      const cy = (y0 + y1) / 2;
      g.push(box(w, h, d - 1.4, cx, cy, 0));
      // Piers at the corners of the up- and downstream faces, leaving the recess between.
      for (const fz of [-1, 1]) for (const fx of [-1, 1]) g.push(box(w * 0.3, h, 0.7, cx + fx * (w / 2 - w * 0.15), cy, fz * (d / 2 - 0.35)));
      g.push(box(0.6, h, d * 0.22, cx + sx * (w / 2 + 0.3), cy, 0)); // rib down the outer face
      if (y1 !== 0) g.push(box(w + 0.5, 0.7, d + 0.5, cx, y1 - 0.35, 0)); // the setback's ledge
    }
    g.push(box(legW(160) * 0.8, 3.6, legD(160) * 0.55, cx, 161.8, 0)); // saddle housing
  }
  for (const [y0, y1] of STRUTS) {
    const inner = CABLE_X - legW(y0) / 2;
    const d = legD(y0) * 0.7;
    const h = y1 - y0;
    const cy = (y0 + y1) / 2;
    g.push(box(2 * inner + 1, h, d, 0, cy, 0));
    const n = Math.round((2 * inner) / 1.7);
    for (let i = 0; i < n; i++) {
      const x = -inner + ((i + 0.5) * 2 * inner) / n;
      for (const fz of [-1, 1]) g.push(box(0.55, h - 1.4, 0.45, x, cy, fz * (d / 2 + 0.22)));
    }
    g.push(box(2 * inner, 0.8, d + 1, 0, y0 + 0.4, 0));
  }
  // Below the deck.
  const yb0 = -46;
  const yb1 = -12;
  const inner = CABLE_X - legW(-30) / 2;
  g.push(box(2 * (CABLE_X - legW(-52) / 2) + 1, 5, 5, 0, -48.5, 0));
  g.push(box(2 * (CABLE_X - legW(-12) / 2) + 1, 4, 5, 0, -12, 0));
  const len = Math.hypot(2 * inner, yb1 - yb0);
  const angle = Math.atan2(yb1 - yb0, 2 * inner);
  for (const fz of [-1, 1]) for (const dir of [-1, 1]) g.push(box(len, 1.8, 1.6, 0, (yb0 + yb1) / 2, fz * (legD(-30) / 2 - 2.5), 0, 0, dir * angle));
  return mergeGeometries(g)!;
}

function pierGeometry(fender: boolean) {
  const g: BufferGeometry[] = [box(2 * (CABLE_X + 6), 22, 26, 0, -63, 0)];
  if (fender) {
    // The oval fender ring round the south pier, open water inside it.
    const pill = (hx: number, hz: number, r: number) => {
      const s = new Shape();
      s.moveTo(-hx + r, -hz);
      s.lineTo(hx - r, -hz);
      s.absarc(hx - r, -hz + r, r, -Math.PI / 2, 0, false);
      s.lineTo(hx, hz - r);
      s.absarc(hx - r, hz - r, r, 0, Math.PI / 2, false);
      s.lineTo(-hx + r, hz);
      s.absarc(-hx + r, hz - r, r, Math.PI / 2, Math.PI, false);
      s.lineTo(-hx, -hz + r);
      s.absarc(-hx + r, -hz + r, r, Math.PI, Math.PI * 1.5, false);
      return s;
    };
    const ring = pill(46, 26, 22);
    ring.holes.push(pill(43, 23, 19));
    const f = new ExtrudeGeometry(ring, { depth: 9, bevelEnabled: false, curveSegments: 10 });
    f.rotateX(Math.PI / 2);
    f.translate(0, -59, 0);
    g.push(f.toNonIndexed());
    return mergeGeometries(g.map((x) => (x.index ? x.toNonIndexed() : x)))!;
  }
  return g[0];
}

function Towers({ night }: { night: boolean }) {
  const geometry = useMemo(towerGeometry, []);
  const piers = useMemo(() => [pierGeometry(true), pierGeometry(false)], []);
  const material = useMemo(() => new MeshStandardMaterial({ color: ORANGE, roughness: 0.55, metalness: 0.15 }), []);
  useLayoutEffect(() => {
    // Floodlit from below after dark.
    material.emissive.set(night ? "#ff6a3a" : "#000000");
    material.emissiveIntensity = night ? 0.09 : 0;
  }, [material, night]);
  return (
    <>
      {[TOWER_S, TOWER_N].map((s, i) => (
        <group key={s} position-z={s}>
          <mesh geometry={geometry} material={material} castShadow receiveShadow />
          <mesh geometry={piers[i]} receiveShadow>
            <meshStandardMaterial color={CONCRETE} roughness={0.9} />
          </mesh>
        </group>
      ))}
      <Beacons night={night} />
    </>
  );
}

// Red aircraft warning lights on the tower tops, blinking after dark.
function Beacons({ night }: { night: boolean }) {
  const matrices = useMemo(() => {
    const m: Matrix4[] = [];
    for (const s of [TOWER_S, TOWER_N]) for (const sx of [-1, 1]) m.push(new Matrix4().makeTranslation(sx * CABLE_X, 164.2, s));
    return m;
  }, []);
  const geometry = useMemo(() => new SphereGeometry(0.6, 10, 6), []);
  const material = useMemo(() => new MeshStandardMaterial({ color: "#400000", emissive: "#ff1a0a" }), []);
  useFrame(({ clock }) => {
    material.emissiveIntensity = night ? (Math.sin(clock.elapsedTime * 2.2) > 0 ? 12 : 1.5) : 0.6;
  });
  return (
    <Instances geometry={geometry} matrices={matrices}>
      <primitive object={material} attach="material" />
    </Instances>
  );
}

// ---- Cables and suspenders ----------------------------------------------------

function cableGeometry() {
  const tubes: BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    const pts: Vector3[] = [];
    const span = (a: number, b: number, n: number) => {
      for (let i = pts.length ? 1 : 0; i <= n; i++) {
        const s = a + ((b - a) * i) / n;
        pts.push(new Vector3(sx * CABLE_X, cableY(s), s));
      }
    };
    span(ANCH_S, TOWER_S, 40);
    span(TOWER_S, TOWER_N, 160);
    span(TOWER_N, ANCH_N, 40);
    const curve = new CatmullRomCurve3(pts, false, "centripetal");
    tubes.push(new TubeGeometry(curve, 480, 0.46, 8, false));
  }
  return mergeGeometries(tubes)!;
}

const SUSPENDER_SPACING = 15.24;

function suspenderMatrices() {
  const out: Matrix4[] = [];
  const add = (s: number) => {
    const h = cableY(s) - 0.45;
    if (h < 0.5) return;
    for (const sx of [-1, 1]) for (const dz of [-0.16, 0.16]) out.push(new Matrix4().makeScale(1, h, 1).setPosition(sx * CABLE_X, 0, s + dz));
  };
  for (let s = ANCH_S + 16; s < TOWER_S - 10; s += SUSPENDER_SPACING) add(s);
  for (let s = TOWER_S + 12; s < TOWER_N - 10; s += SUSPENDER_SPACING) add(s);
  for (let s = TOWER_N + 12; s < ANCH_N - 15; s += SUSPENDER_SPACING) add(s);
  return out;
}

function Cables() {
  const geometry = useMemo(cableGeometry, []);
  const rope = useMemo(() => new CylinderGeometry(0.05, 0.05, 1, 5).translate(0, 0.5, 0), []);
  const matrices = useMemo(suspenderMatrices, []);
  return (
    <>
      <mesh geometry={geometry} castShadow>
        <meshStandardMaterial color={ORANGE} roughness={0.5} metalness={0.2} />
      </mesh>
      <Instances geometry={rope} matrices={matrices} castShadow>
        <meshStandardMaterial color={ORANGE} roughness={0.6} />
      </Instances>
    </>
  );
}

// ---- Deck ---------------------------------------------------------------------

const SIDEWALK_IN = ROAD_HALF;
const SIDEWALK_OUT = 13;
const BYPASS_OUT = CABLE_X + legW(0) / 2 + 2.4; // the sidewalk swings round the outside of each leg
const mid = (a: number, b: number) => (a + b) / 2;

// Sidewalk runs between the anchorage pylons and the towers.
const WALKS: [number, number][] = [
  [ANCH_S + 10, TOWER_S - 11],
  [TOWER_S + 11, TOWER_N - 11],
  [TOWER_N + 11, ANCH_N - 10],
];

function steelGeometry() {
  const g: BufferGeometry[] = [];
  const a = ANCH_S - 4;
  const b = ANCH_N + 4;
  for (const sx of [-1, 1]) {
    const x = sx * CABLE_X;
    // Stiffening truss: chords, verticals and alternating diagonals.
    g.push(box(0.7, 0.9, b - a, x, -0.45, mid(a, b)));
    g.push(box(0.7, 0.6, b - a, x, -7.3, mid(a, b)));
    const panel = 7.62;
    const dy = 6.4;
    const len = Math.hypot(panel, dy);
    const ang = Math.atan2(dy, panel);
    let k = 0;
    for (let s = a; s + panel <= b; s += panel, k++) {
      g.push(box(0.45, dy, 0.45, x, -3.9, s));
      g.push(box(0.4, 0.4, len, x, -3.9, s + panel / 2, k % 2 ? ang : -ang));
    }
    // The low rail between the traffic and the sidewalk.
    const rx = sx * (ROAD_HALF + 0.15);
    g.push(box(0.16, 0.14, b - a - 20, rx, 0.8, mid(a, b)));
    g.push(box(0.16, 0.14, b - a - 20, rx, 0.45, mid(a, b)));
    for (let s = a + 10; s < b - 10; s += 3) g.push(box(0.14, 0.9, 0.14, rx, 0.45, s));
    // Top rail of the outer railing, round each leg too.
    for (const [w0, w1] of WALKS) g.push(box(0.22, 0.14, w1 - w0, sx * SIDEWALK_OUT, 1.42, mid(w0, w1)));
    for (const t of [TOWER_S, TOWER_N]) {
      g.push(box(0.22, 0.14, 24, sx * BYPASS_OUT, 1.42, t));
      for (const fz of [-1, 1]) g.push(box(BYPASS_OUT - SIDEWALK_OUT, 0.14, 0.22, sx * mid(SIDEWALK_OUT, BYPASS_OUT), 1.42, t + fz * 12));
    }
  }
  return mergeGeometries(g)!;
}

function concreteGeometry() {
  const g: BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    for (const [w0, w1] of WALKS) g.push(box(SIDEWALK_OUT - SIDEWALK_IN, 0.25, w1 - w0, sx * mid(SIDEWALK_IN, SIDEWALK_OUT), 0.125, mid(w0, w1)));
    for (const t of [TOWER_S, TOWER_N]) {
      g.push(box(BYPASS_OUT - (CABLE_X + legW(0) / 2), 0.25, 24, sx * mid(CABLE_X + legW(0) / 2, BYPASS_OUT), 0.125, t));
      for (const fz of [-1, 1]) g.push(box(BYPASS_OUT - SIDEWALK_IN, 0.25, 2.2, sx * mid(SIDEWALK_IN, BYPASS_OUT), 0.125, t + fz * 10.9));
    }
  }
  // The deck's underside.
  g.push(box(2 * CABLE_X, 0.3, ANCH_N - ANCH_S, 0, -0.95, mid(ANCH_S, ANCH_N)));
  // Anchorages under each end, and the pylons the cables run down into.
  g.push(box(44, 76, ANCH_S + 18 - BRIDGE_START, 0, -38.7, mid(BRIDGE_START, ANCH_S + 18)));
  g.push(box(44, 76, BRIDGE_END - (ANCH_N - 18), 0, -38.7, mid(ANCH_N - 18, BRIDGE_END)));
  for (const s of [ANCH_S, ANCH_N]) {
    for (const sx of [-1, 1]) {
      const x = sx * 14.6;
      g.push(box(5.5, 16, 16, x, 8, s));
      g.push(box(4.6, 2.4, 13, x, 17.2, s));
      g.push(box(3.4, 1.6, 9, x, 19.2, s));
    }
  }
  return mergeGeometries(g)!;
}

function railingTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  for (let i = 0; i < 4; i++) g.fillRect(i * 32 + 12, 0, 8, 64); // slats every 30 cm
  g.fillRect(0, 56, 128, 8);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function railingGeometry() {
  const planes: BufferGeometry[] = [];
  const H = 1.2;
  const add = (len: number, x: number, z: number, alongX: boolean) => {
    const p = new PlaneGeometry(len, H);
    const uv = p.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (len / 1.2));
    if (!alongX) p.rotateY(Math.PI / 2);
    p.translate(x, 0.25 + H / 2, z);
    planes.push(p);
  };
  for (const sx of [-1, 1]) {
    for (const [w0, w1] of WALKS) add(w1 - w0, sx * SIDEWALK_OUT, mid(w0, w1), false);
    for (const t of [TOWER_S, TOWER_N]) {
      add(24, sx * BYPASS_OUT, t, false);
      for (const fz of [-1, 1]) add(BYPASS_OUT - SIDEWALK_OUT, sx * mid(SIDEWALK_OUT, BYPASS_OUT), t + fz * 12, true);
    }
  }
  return mergeGeometries(planes)!;
}

function Deck() {
  const steel = useMemo(steelGeometry, []);
  const concrete = useMemo(concreteGeometry, []);
  const railing = useMemo(railingGeometry, []);
  const texture = useMemo(railingTexture, []);
  return (
    <>
      <mesh geometry={steel} castShadow receiveShadow>
        <meshStandardMaterial color={ORANGE} roughness={0.55} metalness={0.15} />
      </mesh>
      <mesh geometry={concrete} castShadow receiveShadow>
        <meshStandardMaterial color={CONCRETE} roughness={0.92} />
      </mesh>
      <mesh geometry={railing} castShadow receiveShadow>
        <meshStandardMaterial color={ORANGE} map={texture} alphaTest={0.5} side={DoubleSide} roughness={0.6} />
      </mesh>
    </>
  );
}

// ---- Street lights ------------------------------------------------------------

// Lamps along both railings over the bridge, and on the barriers along the
// approaches. Each arm reaches in over the road.
const REACH = 3.2;
const LAMP_Y = 8.2;

interface Lamp {
  x: number;
  s: number;
  dir: 1 | -1; // which way the arm reaches, across
}

function lamps(): Lamp[] {
  const out: Lamp[] = [];
  const both = (s: number, x: number) => {
    out.push({ x, s, dir: -1 });
    out.push({ x: -x, s, dir: 1 });
  };
  for (let s = ANCH_S + 30; s < ANCH_N - 20; s += 46) {
    if (Math.abs(s - TOWER_S) < 16 || Math.abs(s - TOWER_N) < 16) continue;
    both(s, SIDEWALK_OUT - 0.15);
  }
  // The approaches, and the copies of them seen from inside the tunnel.
  const approaches: [number, number][] = [
    [TUNNEL_OUT + 30, BRIDGE_START - 10],
    [BRIDGE_END + 20, L + TUNNEL_IN - 20],
  ];
  for (const [a, b] of approaches) for (let s = a; s < b; s += 50) both(s, 11.4);
  return out;
}

function lampGeometry(dir: 1 | -1) {
  return mergeGeometries([
    box(0.22, LAMP_Y + 0.2, 0.22, 0, (LAMP_Y + 0.2) / 2, 0),
    box(REACH, 0.14, 0.14, (dir * REACH) / 2, LAMP_Y + 0.25, 0, 0, 0, dir * 0.08),
  ])!;
}

function Lamps({ night }: { night: boolean }) {
  const list = useMemo(lamps, []);
  const parts = useMemo(
    () =>
      ([-1, 1] as const).map((dir) => {
        const mine = list.filter((l) => l.dir === dir);
        return {
          dir,
          post: lampGeometry(dir),
          head: box(0.9, 0.26, 0.45, dir * REACH, LAMP_Y + 0.12, 0),
          matrices: mine.map((l) => new Matrix4().makeTranslation(l.x, 0, l.s)),
        };
      }),
    [list],
  );
  const spots = useMemo(() => list.map((l) => new Vector3(l.x + l.dir * REACH, LAMP_Y - 0.2, l.s)), [list]);
  const pools = useMemo(() => list.map((l) => new Vector3(l.x + l.dir * (REACH + 1.5), 0.02, l.s)), [list]);
  return (
    <>
      {parts.map((p) => (
        <group key={p.dir}>
          <Instances geometry={p.post} matrices={p.matrices} castShadow>
            <meshStandardMaterial color={ORANGE} roughness={0.6} side={DoubleSide} />
          </Instances>
          <Instances geometry={p.head} matrices={p.matrices}>
            <meshStandardMaterial color={night ? "#3a2a12" : "#77736a"} emissive="#ffb35c" emissiveIntensity={night ? 4 : 0} />
          </Instances>
        </group>
      ))}
      {night && (
        <>
          <NearestLights spots={spots} count={6} kind="spot" color="#ffb868" intensity={700} distance={40} angle={1.05} />
          <GroundGlows spots={pools} radius={9} color="#ffb060" opacity={0.4} />
        </>
      )}
    </>
  );
}

export default function Bridge({ night }: { night: boolean }) {
  return (
    <group position-x={BX}>
      <Towers night={night} />
      <Cables />
      <Deck />
      <Lamps night={night} />
    </group>
  );
}
