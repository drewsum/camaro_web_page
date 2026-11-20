import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  IcosahedronGeometry,
  Matrix4,
  Path,
  PlaneGeometry,
  RepeatWrapping,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  type ShaderMaterial,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mulberry32 } from "../common/periodic";
import { NearestLights } from "../common/night";
import type { HdriSky } from "../common/hdri";
import { Instances } from "./Bridge";
import {
  ANCH_N,
  ASPHALT_HALF,
  BRIDGE_END,
  BRIDGE_START,
  BX,
  CUT_HALF,
  L,
  LANE,
  ROAD_HALF,
  TUNNEL_IN,
  TUNNEL_OUT,
  TUNNEL_TOP,
  WATER,
  box,
  groundY,
  naturalY,
  ridges,
  shoreNorth,
  shoreSouth,
  smoothstep,
} from "./layout";

const S0 = -6000;
const S1 = L + 6000;
const ROAD_FROM = -1300;
const ROAD_TO = L + 1300;
const mid = (a: number, b: number) => (a + b) / 2;

// ---- Terrain ------------------------------------------------------------------

// Rows along the course: close together near it (closer still at the tunnel
// mouths, where the ground climbs steeply over them), sparse far off.
function terrainRows() {
  const portals = [TUNNEL_IN, TUNNEL_OUT, L + TUNNEL_IN, L + TUNNEL_OUT];
  const rows: number[] = [];
  let s = S0;
  while (s < S1) {
    rows.push(s);
    const near = portals.some((p) => Math.abs(s - p) < 40);
    s += near ? 2.5 : s > -1400 && s < L + 1400 ? 10 : 80;
  }
  rows.push(S1);
  return rows;
}

// Out across from the cut's edge, close together near the road.
const COLS = [0, 4, 10, 18, 30, 45, 65, 90, 120, 160, 220, 300, 400, 550, 750, 1000, 1300, 1700, 2100, 2600, 3100, 3600, 4100, 4600, 5100, 5600, 6100, 6600, 7100, 7600, 8500, 10000];

const TINT = {
  seabed: new Color("#4d473f"),
  rock: new Color("#7a6c5b"),
  presidio: new Color("#3b5229"),
  city: new Color("#8c877e"),
  gold: new Color("#9a8148"),
  sage: new Color("#4f6131"),
};
const tmp = new Color();

function tint(x: number, s: number, y: number) {
  if (y < WATER + 1) return tmp.copy(TINT.seabed);
  const marin = s - shoreNorth(x) > shoreSouth(x) - s;
  const land = marin
    ? tmp.copy(TINT.sage).lerp(TINT.gold, smoothstep(-0.6, 0.8, ridges(x * 2.3, s * 2.3, 7)) * smoothstep(-40, 60, y))
    : x < -1500
      ? tmp.copy(TINT.presidio).lerp(TINT.city, smoothstep(-1500, -2600, x))
      : tmp.copy(TINT.presidio).lerp(TINT.gold, 0.25 * smoothstep(-0.5, 1, ridges(x * 3, s * 3, 2)));
  // Bare rock down the cliffs.
  return land.lerp(TINT.rock, 1 - smoothstep(WATER + 8, WATER + 40, y));
}

function terrainSide(side: 1 | -1, rows: number[]) {
  const nx = COLS.length;
  const pos = new Float32Array(rows.length * nx * 3);
  const col = new Float32Array(rows.length * nx * 3);
  rows.forEach((s, r) => {
    for (let c = 0; c < nx; c++) {
      const x = BX + side * (CUT_HALF + COLS[c]);
      const y = groundY(x, s);
      const i = (r * nx + c) * 3;
      pos[i] = x;
      pos[i + 1] = y;
      pos[i + 2] = s;
      tint(x, s, y).toArray(col, i);
    }
  });
  const index: number[] = [];
  for (let r = 0; r < rows.length - 1; r++) {
    for (let c = 0; c < nx - 1; c++) {
      const a = r * nx + c;
      const b = a + 1;
      const d = a + nx;
      const e = d + 1;
      if (side > 0) index.push(a, d, b, b, d, e);
      else index.push(a, b, d, b, e, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("color", new BufferAttribute(col, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

// Retaining walls where the road runs in a cutting: from the road up to the
// ground at the cut's edge, wherever that's above the road.
function wallSide(side: 1 | -1, rows: number[]) {
  const pos: number[] = [];
  const index: number[] = [];
  const x = BX + side * CUT_HALF;
  rows.forEach((s, r) => {
    if (s < ROAD_FROM || s > ROAD_TO) return;
    const top = Math.max(-0.3, groundY(x, s));
    pos.push(x, -0.3, s, x, top, s);
    const v = pos.length / 3 - 2;
    if (v >= 2) {
      if (side > 0) index.push(v - 2, v - 1, v, v - 1, v + 1, v);
      else index.push(v - 2, v, v - 1, v - 1, v, v + 1);
    }
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

function Terrain() {
  const { sides, walls } = useMemo(() => {
    const rows = terrainRows();
    return {
      sides: [terrainSide(1, rows), terrainSide(-1, rows)],
      walls: mergeGeometries([wallSide(1, rows), wallSide(-1, rows)])!,
    };
  }, []);
  // The hill over each tunnel, between the cut's edges.
  const roof = useMemo(
    () =>
      mergeGeometries(
        [0, L].map((o) => box(2 * CUT_HALF, 0.6, TUNNEL_OUT - TUNNEL_IN, BX, TUNNEL_TOP - 0.3, o + mid(TUNNEL_IN, TUNNEL_OUT))),
      )!,
    [],
  );
  return (
    <>
      {sides.map((g, i) => (
        <mesh key={i} geometry={g} receiveShadow>
          <meshStandardMaterial vertexColors roughness={0.97} />
        </mesh>
      ))}
      <mesh geometry={walls} receiveShadow castShadow>
        <meshStandardMaterial color="#a9a396" roughness={0.9} side={DoubleSide} />
      </mesh>
      <mesh geometry={roof} receiveShadow>
        <meshStandardMaterial color="#56643a" roughness={0.97} />
      </mesh>
    </>
  );
}

// ---- Road ---------------------------------------------------------------------

const DASH = 12;
// Ranges of course on land, with their copies seen out of the tunnel's far mouths.
const APPROACHES: [number, number][] = [
  [ANCH_N + 20 - L, TUNNEL_IN],
  [TUNNEL_OUT, BRIDGE_START],
  [ANCH_N + 20, L + TUNNEL_IN],
  [L + TUNNEL_OUT, L + BRIDGE_START],
];

function roadTexture() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const g = c.getContext("2d")!;
  const px = (x: number) => ((x + ASPHALT_HALF) / (2 * ASPHALT_HALF)) * c.width;
  g.fillStyle = "#3b3b3d";
  g.fillRect(0, 0, c.width, c.height);
  const rand = mulberry32(5);
  for (let i = 0; i < 9000; i++) {
    const v = 40 + rand() * 40;
    g.fillStyle = `rgba(${v},${v},${v + 2},0.5)`;
    g.fillRect(rand() * c.width, rand() * c.height, 2, 2);
  }
  // Worn darker where the tyres run.
  g.fillStyle = "rgba(20,20,22,0.18)";
  for (let k = -3; k < 3; k++) for (const o of [-0.85, 0.85]) g.fillRect(px((k + 0.5) * LANE + o) - 18, 0, 36, c.height);
  g.fillStyle = "#e9e6dc";
  for (const sx of [-1, 1]) {
    g.fillRect(px(sx * ROAD_HALF) - 6, 0, 12, c.height);
    for (const k of [1, 2]) g.fillRect(px(sx * k * LANE) - 5, 0, 10, c.height / 4); // 3 m dash, 9 m gap
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(1, (ROAD_TO - ROAD_FROM) / DASH);
  t.anisotropy = 16;
  return t;
}

function Road() {
  const texture = useMemo(roadTexture, []);
  const asphalt = useMemo(() => new PlaneGeometry(2 * ASPHALT_HALF, ROAD_TO - ROAD_FROM).rotateX(-Math.PI / 2).translate(BX, 0, mid(ROAD_FROM, ROAD_TO)), []);
  const { verge, barriers } = useMemo(() => {
    const v: BufferGeometry[] = [];
    const b: BufferGeometry[] = [box(0.6, 0.85, ROAD_TO - ROAD_FROM, BX, 0.425, mid(ROAD_FROM, ROAD_TO))]; // the median
    for (const [a, z] of APPROACHES) {
      for (const sx of [-1, 1]) {
        v.push(new PlaneGeometry(CUT_HALF - ASPHALT_HALF, z - a).rotateX(-Math.PI / 2).translate(BX + sx * mid(ASPHALT_HALF, CUT_HALF), -0.06, mid(a, z)));
        b.push(box(0.5, 0.85, z - a, BX + sx * 11.4, 0.425, mid(a, z)));
      }
    }
    return { verge: mergeGeometries(v)!, barriers: mergeGeometries(b)! };
  }, []);
  return (
    <>
      <mesh geometry={asphalt} receiveShadow>
        <meshStandardMaterial map={texture} roughness={0.85} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-2} />
      </mesh>
      <mesh geometry={verge} receiveShadow>
        <meshStandardMaterial color="#5f6044" roughness={1} />
      </mesh>
      <mesh geometry={barriers} castShadow receiveShadow>
        <meshStandardMaterial color="#b4afa4" roughness={0.85} />
      </mesh>
    </>
  );
}

// ---- Tunnels ------------------------------------------------------------------

// Twin arched bores, one each way, meeting at a centre wall on the median.
const BORE_X = 5.8; // each bore's centre from the median
const HW = 5.5;
const SPRING = 4.8;
const RISE = 3.2;
const RANGES = [0, L].map((o) => [o + TUNNEL_IN, o + TUNNEL_OUT] as const);

function boreProfile(cx: number) {
  const p: [number, number][] = [
    [cx - HW, 0],
    [cx - HW, SPRING],
  ];
  for (let i = 1; i < 16; i++) {
    const a = Math.PI * (1 - i / 16);
    p.push([cx + HW * Math.cos(a), SPRING + RISE * Math.sin(a)]);
  }
  p.push([cx + HW, SPRING], [cx + HW, 0]);
  return p;
}

const WALL_DARK = new Color("#4a4a47");
const WALL_TILE = new Color("#cbc5b6");
const CEILING = new Color("#5d5c58");

function boreGeometry() {
  const parts: BufferGeometry[] = [];
  for (const [s0, s1] of RANGES) {
    for (const cx of [-BORE_X, BORE_X]) {
      const prof = boreProfile(BX + cx);
      const pos: number[] = [];
      const col: number[] = [];
      const uv: number[] = [];
      const index: number[] = [];
      let u = 0;
      prof.forEach(([x, y], k) => {
        if (k) u += Math.hypot(x - prof[k - 1][0], y - prof[k - 1][1]);
        const c = y < 1.1 ? WALL_DARK : y <= SPRING + 0.01 ? WALL_TILE : CEILING;
        for (const s of [s0, s1]) {
          pos.push(x, y, s);
          c.toArray(col, col.length);
          uv.push(u / 1.5, s / 1.5);
        }
        if (k) {
          const v = k * 2;
          index.push(v - 2, v - 1, v, v - 1, v + 1, v);
        }
      });
      const g = new BufferGeometry();
      g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
      g.setAttribute("color", new BufferAttribute(new Float32Array(col), 3));
      g.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
      g.setIndex(index);
      g.computeVertexNormals();
      parts.push(g);
    }
  }
  return mergeGeometries(parts)!;
}

// Square tiles on the walls (the vertex colours shade them by zone).
function tileTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = "#b9b6ae";
  g.fillRect(0, 0, 64, 3);
  g.fillRect(0, 0, 3, 64);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// Light fittings in two rows along each bore's crown.
const FIXTURE_SPACING = 6;
function fixtureMatrices() {
  const out: Matrix4[] = [];
  for (const [s0, s1] of RANGES) {
    for (let s = s0 + 3; s < s1; s += FIXTURE_SPACING) {
      for (const cx of [-BORE_X, BORE_X]) for (const dx of [-2.5, 2.5]) out.push(new Matrix4().makeTranslation(BX + cx + dx, 7.45, s));
    }
  }
  return out;
}

// The facade at each mouth: a concrete headwall with the two arches through
// it. The Waldo tunnel's has a rainbow painted round the northbound arch.
function archPath(p: Path | Shape, cx: number, grow: number, reverse: boolean) {
  const hw = HW + grow;
  const sp = SPRING;
  const rise = RISE + grow;
  if (!reverse) {
    p.lineTo(cx - hw, sp);
    p.absellipse(cx, sp, hw, rise, Math.PI, 0, true, 0);
    p.lineTo(cx + hw, 0);
  } else {
    p.lineTo(cx + hw, sp);
    p.absellipse(cx, sp, hw, rise, 0, Math.PI, false, 0);
    p.lineTo(cx - hw, 0);
  }
}

function headwallGeometry() {
  const wall = new Shape();
  wall.moveTo(-30, -0.3);
  wall.lineTo(30, -0.3);
  wall.lineTo(30, TUNNEL_TOP);
  wall.lineTo(-30, TUNNEL_TOP);
  wall.closePath();
  for (const cx of [-BORE_X, BORE_X]) {
    const hole = new Path();
    hole.moveTo(cx - HW, 0);
    archPath(hole, cx, 0, false);
    hole.closePath();
    wall.holes.push(hole);
  }
  const g = new ExtrudeGeometry(wall, { depth: 1.5, bevelEnabled: false, curveSegments: 24 });
  // A coping along the top.
  return mergeGeometries([g.toNonIndexed(), box(61, 0.8, 2.4, 0, TUNNEL_TOP + 0.4, 0.75).toNonIndexed()])!;
}

// Innermost band first: violet inside, red outside.
const RAINBOW = ["#7a4fb6", "#2f7fd0", "#4fae4a", "#f5d12e", "#f08a2a", "#e23b33"];
function rainbowGeometries() {
  return RAINBOW.map((_, k) => {
    const band = new Shape();
    const o1 = 0.3 + (k + 1) * 0.6;
    const o0 = 0.3 + k * 0.6;
    const cx = -BORE_X;
    band.moveTo(cx - HW - o1, 0);
    archPath(band, cx, o1, false);
    band.lineTo(cx + HW + o0, 0);
    archPath(band, cx, o0, true);
    band.closePath();
    return new ShapeGeometry(band, 24);
  });
}

function Tunnels({ night }: { night: boolean }) {
  const bores = useMemo(boreGeometry, []);
  const tiles = useMemo(tileTexture, []);
  const fixtures = useMemo(fixtureMatrices, []);
  const fitting = useMemo(() => box(1.3, 0.12, 0.35, 0, 0, 0), []);
  const headwall = useMemo(headwallGeometry, []);
  const rainbow = useMemo(rainbowGeometries, []);
  const lights = useMemo(() => {
    const out: Vector3[] = [];
    for (const [s0, s1] of RANGES) for (let s = s0 + 8; s < s1; s += 14) out.push(new Vector3(BX - BORE_X, 6.4, s));
    return out;
  }, []);
  // Exits face +s (wall from s - 1.5 to s); entrances face -s.
  const exits = [TUNNEL_OUT - 1.5, L + TUNNEL_OUT - 1.5];
  const entrances = [TUNNEL_IN, L + TUNNEL_IN];
  return (
    <>
      <mesh geometry={bores} receiveShadow castShadow>
        <meshStandardMaterial vertexColors map={tiles} roughness={0.45} side={DoubleSide} />
      </mesh>
      <Instances geometry={fitting} matrices={fixtures}>
        <meshStandardMaterial color="#fff6e6" emissive="#ffe9c8" emissiveIntensity={3} />
      </Instances>
      <NearestLights spots={lights} count={3} color="#ffe4bd" intensity={night ? 70 : 110} distance={24} />
      {[...exits, ...entrances].map((z, i) => (
        <mesh key={i} geometry={headwall} position={[BX, 0, z]} castShadow receiveShadow>
          <meshStandardMaterial color="#b9b3a6" roughness={0.9} />
        </mesh>
      ))}
      {entrances.map((z) =>
        rainbow.map((g, k) => (
          <mesh key={`${z}-${k}`} geometry={g} position={[BX, 0, z - 0.03]}>
            <meshStandardMaterial color={RAINBOW[k]} roughness={0.8} side={DoubleSide} />
          </mesh>
        )),
      )}
    </>
  );
}

// ---- Trees in the Presidio ----------------------------------------------------

function treeMatrices() {
  const rand = mulberry32(41);
  const trunks: Matrix4[] = [];
  const crowns: Matrix4[] = [];
  let tries = 0;
  while (crowns.length < 1100 && tries++ < 20000) {
    const s = -700 + rand() * (BRIDGE_START + 60);
    const dx = (rand() < 0.5 ? -1 : 1) * (CUT_HALF + 6 + rand() ** 1.6 * 900);
    const x = BX + dx;
    if (shoreSouth(x) - s < 90) continue;
    const y = groundY(x, s);
    if (y < WATER + 30) continue;
    // Dense along the road, thinning out.
    if (rand() > 1.1 - Math.abs(dx) / 1000) continue;
    const r = 3 + rand() * 4;
    const h = 2.2 + rand() * 2.5;
    const trunk = 2 + rand() * 4;
    trunks.push(new Matrix4().makeScale(1, trunk, 1).setPosition(x, y - 0.5, s));
    crowns.push(new Matrix4().makeRotationY(rand() * 6.3).scale(new Vector3(r, h, r * (0.7 + rand() * 0.5))).setPosition(x, y + trunk + h * 0.5, s));
  }
  return { trunks, crowns };
}

function Trees() {
  const { trunks, crowns } = useMemo(treeMatrices, []);
  const trunk = useMemo(() => new CylinderGeometry(0.25, 0.35, 1, 5).translate(0, 0.5, 0), []);
  const crown = useMemo(() => new IcosahedronGeometry(1, 1), []);
  return (
    <>
      <Instances geometry={trunk} matrices={trunks} castShadow>
        <meshStandardMaterial color="#4a3a2c" roughness={1} />
      </Instances>
      <Instances geometry={crown} matrices={crowns} castShadow receiveShadow>
        <meshStandardMaterial color="#2c4425" roughness={1} flatShading />
      </Instances>
    </>
  );
}

// ---- The city -----------------------------------------------------------------

// Pale houses over the hills to the south-east, and towers downtown.
const DOWNTOWN = { x: -6800, s: -400 };

function windowTextures() {
  const make = (lit: boolean) => {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 256;
    const g = c.getContext("2d")!;
    g.fillStyle = lit ? "#000000" : "#ffffff";
    g.fillRect(0, 0, 128, 256);
    const rand = mulberry32(lit ? 8 : 3);
    for (let r = 0; r < 20; r++) {
      for (let k = 0; k < 6; k++) {
        if (lit) {
          if (rand() > 0.4) continue;
          g.fillStyle = rand() < 0.7 ? "#ffd59a" : "#cfe3ff";
        } else g.fillStyle = "#4c5258";
        g.fillRect(6 + k * 20, 6 + r * 12.5, 12, 7);
      }
    }
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  };
  return { facade: make(false), lit: make(true) };
}

function cityLayout() {
  const rand = mulberry32(1906);
  const matrices: Matrix4[] = [];
  const colors: Color[] = [];
  const palette = ["#d8d1c2", "#cfc3ae", "#e2ddd3", "#bfb9ae", "#d4c0ac", "#bcc4c8", "#d9cab6", "#a9a49b"].map((c) => new Color(c));
  let tries = 0;
  while (matrices.length < 2600 && tries++ < 40000) {
    const x = -1600 - rand() * 8000;
    const s = -6500 + rand() * 7500;
    const inland = shoreSouth(x) - s;
    if (inland < 60) continue;
    const y = naturalY(x, s);
    if (y < WATER + 8 || y > 120) continue;
    const down = Math.exp(-((x - DOWNTOWN.x) ** 2 + (s - DOWNTOWN.s) ** 2) / 900 ** 2);
    if (rand() > 0.35 + down) continue;
    const tall = rand() < down * 0.8;
    const h = tall ? 40 + rand() * rand() * 220 : 6 + rand() * 12;
    const w = tall ? 18 + rand() * 25 : 8 + rand() * 14;
    const d = tall ? 18 + rand() * 25 : 10 + rand() * 18;
    matrices.push(new Matrix4().makeRotationY(Math.round(rand()) * 0.3).scale(new Vector3(w, h, d)).setPosition(x, y - 2, s));
    colors.push(palette[Math.floor(rand() * palette.length)]);
  }
  return { matrices, colors };
}

function City({ night }: { night: boolean }) {
  const { matrices, colors } = useMemo(cityLayout, []);
  const textures = useMemo(windowTextures, []);
  const geometry = useMemo(() => box(1, 1, 1, 0, 0.5, 0), []);
  return (
    <instancedMesh
      ref={(m) => {
        if (!m) return;
        matrices.forEach((x, i) => {
          m.setMatrixAt(i, x);
          m.setColorAt(i, colors[i]);
        });
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
        m.computeBoundingSphere();
      }}
      args={[geometry, undefined, matrices.length]}
    >
      <meshStandardMaterial map={textures.facade} emissiveMap={textures.lit} emissive="#ffffff" emissiveIntensity={night ? 1.6 : 0} roughness={0.8} />
    </instancedMesh>
  );
}

// ---- An island in the bay -----------------------------------------------------

// A rocky island with a lighthouse and a long pale building along its crest.
const ISLE = { x: -6000, s: 1900 };
function islandGeometry() {
  const rock = new SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = rock.attributes.position;
  const rand = mulberry32(12);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const k = 1 + (rand() - 0.5) * 0.12 * (1 - y);
    // Flattened on top, steep at the water.
    pos.setXYZ(i, pos.getX(i) * k, Math.min(1, y * 1.6), pos.getZ(i) * k);
  }
  rock.computeVertexNormals();
  rock.scale(260, 46, 115);
  return rock;
}

function Island({ night }: { night: boolean }) {
  const rock = useMemo(islandGeometry, []);
  const buildings = useMemo(
    () => mergeGeometries([box(120, 14, 34, 10, 7, 0), box(40, 9, 26, -95, 4.5, 20), box(26, 7, 18, 105, 3.5, -18), box(5, 26, 5, -60, 13, -25)])!,
    [],
  );
  return (
    <group position={[ISLE.x, WATER - 4, ISLE.s]}>
      <mesh geometry={rock}>
        <meshStandardMaterial color="#6e6556" roughness={1} />
      </mesh>
      <mesh geometry={buildings} position-y={46}>
        <meshStandardMaterial color="#e6e0d2" roughness={0.9} emissive="#ffcc88" emissiveIntensity={night ? 0.15 : 0} />
      </mesh>
    </group>
  );
}

// ---- Water --------------------------------------------------------------------

const WAVE_PERIOD = 200; // L is a whole number of these, so the waves carry across the seam
const WAVES: [number, number, number][] = [
  [22, 14, 0.35],
  [15, -24, 0.25],
  [41, 9, 0.12],
  [8, 19, 0.3],
  [63, -37, 0.05],
  [97, 41, 0.03],
];

const waterVertex = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vWorld;
  void main() {
    vLocal = position;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const waterFragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSun;
  uniform vec3 uHaze;
  uniform vec3 uDeep;
  uniform vec3 uGlint;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform vec3 uWaves[${WAVES.length}];
  varying vec3 vLocal;
  varying vec3 vWorld;
  const float TAU = 6.2831853;
  void main() {
    vec2 p = vLocal.xz;
    float dist = length(vWorld - cameraPosition);
    // Fade the ripples out before they shrink to a pixel, or they shimmer into moire.
    float detail = 1.0 - smoothstep(60.0, 700.0, dist);
    vec2 grad = vec2(0.0);
    for (int n = 0; n < ${WAVES.length}; n++) {
      vec2 k = uWaves[n].xy * (TAU / ${WAVE_PERIOD.toFixed(1)});
      float omega = sqrt(9.81 * length(k));
      grad += uWaves[n].z * k * cos(dot(k, p) - omega * uTime);
    }
    vec3 nrm = normalize(vec3(-grad.x * detail * 0.35, 1.0, -grad.y * detail * 0.35));
    vec3 view = normalize(cameraPosition - vWorld);
    float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(nrm, view), 0.0), 5.0);
    vec3 col = mix(uDeep, uHaze * 0.7, fresnel);
    col += uGlint * pow(max(dot(reflect(-view, nrm), uSun), 0.0), 400.0);
    gl_FragColor = vec4(mix(col, uHaze, smoothstep(uFogNear, uFogFar, dist)), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function Water({ sky, night, fogNear, fogFar }: { sky: HdriSky; night: boolean; fogNear: number; fogFar: number }) {
  const material = useRef<ShaderMaterial>(null);
  const geometry = useMemo(() => new PlaneGeometry(40000, 40000).rotateX(-Math.PI / 2).translate(0, WATER, L / 2), []);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSun: { value: sky.sun },
      uHaze: { value: sky.horizon },
      uDeep: { value: night ? new Vector3(0.0015, 0.006, 0.012) : new Vector3(0.006, 0.035, 0.05) },
      uGlint: { value: night ? new Vector3(1.6, 1.8, 2.4) : new Vector3(12, 11, 9.6) },
      uFogNear: { value: fogNear },
      uFogFar: { value: fogFar },
      uWaves: { value: WAVES.map(([x, z, a]) => new Vector3(x, z, a)) },
    }),
    [sky, night, fogNear, fogFar],
  );
  useFrame(({ clock }) => {
    if (material.current) material.current.uniforms.uTime.value = clock.elapsedTime;
  });
  return (
    <mesh geometry={geometry}>
      <shaderMaterial ref={material} uniforms={uniforms} vertexShader={waterVertex} fragmentShader={waterFragment} />
    </mesh>
  );
}

// ---- Fog ----------------------------------------------------------------------

// A bank of sea fog lying offshore to the west, spilling over the headlands.
function fogTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d")!;
  const rand = mulberry32(99);
  for (let i = 0; i < 40; i++) {
    const x = 30 + rand() * 196;
    const y = 50 + rand() * 40;
    const r = 18 + rand() * 30;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, "rgba(255,255,255,0.35)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 128);
  }
  return new CanvasTexture(c);
}

function FogBank() {
  const texture = useMemo(fogTexture, []);
  const banks = useMemo(() => {
    const rand = mulberry32(7);
    return Array.from({ length: 16 }, () => ({
      x: BX + 3500 + rand() * 6000,
      s: -2500 + rand() * 9000,
      y: WATER + 60 + rand() * 80,
      w: 1500 + rand() * 1500,
    }));
  }, []);
  return (
    <>
      {banks.map((b, i) => (
        <sprite key={i} position={[b.x, b.y, b.s]} scale={[b.w, b.w * 0.22, 1]}>
          <spriteMaterial map={texture} transparent opacity={0.8} depthWrite={false} color="#f4f6f8" />
        </sprite>
      ))}
    </>
  );
}

export default function Land({ sky, night, fogNear, fogFar }: { sky: HdriSky; night: boolean; fogNear: number; fogFar: number }) {
  return (
    <>
      <Terrain />
      <Road />
      <Tunnels night={night} />
      <Trees />
      <City night={night} />
      <Island night={night} />
      <Water sky={sky} night={night} fogNear={fogNear} fogFar={fogFar} />
      {!night && <FogBank />}
    </>
  );
}

