import {
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import CarContactShadows from "../components/CarContactShadows";
import {
  AdditiveBlending,
  BoxGeometry,
  ConeGeometry,
  IcosahedronGeometry,
  Object3D,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  QuadraticBezierCurve3,
  RepeatWrapping,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
  type DirectionalLight,
  type Group,
  type InstancedMesh,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import CamaroModel from "../components/CamaroModel";
import {
  constantSpeed,
  DriveProvider,
  driveState,
  useDrive,
} from "../car/driveClock";
import MustangModel from "../components/MustangModel";
import ChargerModel from "../components/ChargerModel";
import type { TrackPoint } from "../car/track";
import type { SceneProps } from ".";
import { useCameraStart } from "./useCameraStart";
import { useExposure, useFarPlane } from "./common/renderer";
import { polyHavenHdri, type HdriSky } from "./common/hdri";
import { GroundGlows, NearestLights, useSceneSky } from "./common/night";
import {
  InstancedModel,
  LodInstancedModel,
  polyHavenModel,
  useModelParts,
  type Level,
} from "./common/polyHaven";
import { mulberry32 } from "./common/periodic";
import SkyReflections from "./common/SkyReflections";
import Optional from "./common/Optional";
import { preloadPbr, usePbrMaterial } from "./common/pbr";
import { GROUND_PERIOD, useSlopeGround } from "./common/slopeGround";
import { COAST_LENGTH as L, coastTrack as track } from "./coast/coastTrack";

// A cruise down a winding two-lane California coast road: cliffs dropping to
// the Pacific on the passenger side (-u), golden hills with scrub on the
// driver side (+u). The road repeats every lap (see coastTrack), and all
// scenery is generated from (distance mod lap), so the loop never shows.
//
// The car stays at the origin facing +Z; each frame the world (and the sky
// with it) is moved so the car's spot on the road lands there.

const SKY = polyHavenHdri("kloofendal_48d_partly_cloudy_puresky");
const EXPOSURE = 0.9;
const SEA = 0;
const FOG_NEAR = 250;
const FOG_FAR = 2200;

// Scenery is built from S0 to S1 along the road; the car is always within
// the first lap, so this covers what's behind it and what's in view ahead.
const S0 = -300;
const S1 = L + 1700;

// Across the road (u, + = driver's side): ocean-side shoulder [-4.5, -2],
// road [-2, 6] (the car drives in the right lane at u = 0), land-side
// shoulder [6, 8.5], then hills; cliff from -4.5 down to the sea.
const ROAD_LEFT = -2;
const ROAD_WIDTH = 8;
const ROAD_TILE = 20; // metres of road one overlay tile covers; must divide the lap (and be a multiple of the 4 m asphalt scan)

const TAU = Math.PI * 2;
const UP = new Vector3(0, 1, 0);
const mod = (a: number, n: number) => ((a % n) + n) % n;
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
// Stable [0, 1) per integer pair, so a lap's scenery repeats exactly.
const hash = (a: number, b: number) => {
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

// Where the car is this frame, shared by everything that follows it.
const here = { s: 0, lap: 0, heading: 0 };

// ---- Terrain shape --------------------------------------------------------

function cliffY(s: number, u: number, road: number, noise = 0) {
  const t = Math.min(1, Math.max(0, (-u - 4.5) / 47.5));
  const recess =
    0.1 * Math.sin((TAU * 5 * s) / L) + 0.07 * Math.sin((TAU * 13 * s) / L + 1);
  const drop = smooth(0.03, 0.7, t + recess);
  return road + (SEA - 5 - road) * drop + noise * 6 * t * (1 - t);
}

function hillY(s: number, u: number, road: number) {
  const r = Math.min(1, Math.max(0, (u - 8.5) / 231));
  const roll =
    0.5 * Math.sin((TAU * 4 * s) / L + u * 0.031) +
    0.3 * Math.sin((TAU * 9 * s) / L + 1.3 + u * 0.05) +
    0.2 * Math.sin((TAU * 17 * s) / L - u * 0.02);
  return (
    road -
    0.4 +
    smooth(0, 0.03, r) * (3.4 + 110 * Math.pow(r, 1.5) + (5 + 28 * r) * roll)
  );
}

// ---- Geometry along the road ---------------------------------------------

interface RibbonOptions {
  ds: number; // row spacing along the road; must divide the lap length
  us: number[]; // lateral positions of the columns
  y: (s: number, p: TrackPoint, u: number, j: number, key: number) => number;
  uv?: (s: number, u: number) => [number, number];
  color?: (
    y: number,
    p: TrackPoint,
    u: number,
    j: number,
    key: number,
  ) => Color;
}

// A grid of rows across the road from S0 to S1, positioned in track space.
// `key` identifies the row within a lap, for scenery that repeats per lap.
function ribbon({ ds, us, y, uv, color }: RibbonOptions) {
  const rows = Math.round((S1 - S0) / ds) + 1;
  const cols = us.length;
  const pos = new Float32Array(rows * cols * 3);
  const uvs = uv ? new Float32Array(rows * cols * 2) : null;
  const tint = color ? new Float32Array(rows * cols * 3) : null;
  for (let r = 0; r < rows; r++) {
    const s = S0 + r * ds;
    const p = track.at(s);
    const key = Math.round(mod(s, L) / ds);
    us.forEach((u, j) => {
      const i = r * cols + j;
      const h = y(s, p, u, j, key);
      const [x, , z] = track.offset(p, u);
      pos.set([x, h, z], i * 3);
      if (uvs && uv) uvs.set(uv(s, u), i * 2);
      if (tint && color) color(h, p, u, j, key).toArray(tint, i * 3);
    });
  }
  const index: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = r * cols + j;
      const b = a + cols;
      // Columns run toward +u (left) and rows toward +s (ahead), so this
      // winding faces up.
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  if (uvs) geo.setAttribute("uv", new BufferAttribute(uvs, 2));
  if (tint) geo.setAttribute("color", new BufferAttribute(tint, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

// The pavement itself is scanned asphalt and gravel (Poly Haven, CC0); the
// markings and wear are drawn on a transparent overlay above it, so they
// stay sharp regardless of the scan's tiling.
const ASPHALT = "asphalt_04";
const GRAVEL = "gravel_floor_02";
preloadPbr(ASPHALT);
preloadPbr(GRAVEL, "1k");

// One road tile (ROAD_WIDTH x ROAD_TILE m) of overlay at 64 px per metre:
// worn white edge lines, the double yellow, darker polished wheel paths with
// an oil-drip stripe down each lane, and tar-snake crack sealing.
function roadOverlayTexture() {
  const PX = 64;
  const W = ROAD_WIDTH * PX;
  const H = ROAD_TILE * PX;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const px = (u: number) => (u - ROAD_LEFT) * PX;
  const rand = mulberry32(7);

  // Lanes are centred at u = 0 (ours) and u = 4.
  for (const lane of [0, 4]) {
    for (const wheel of [-0.78, 0.78]) {
      const x0 = lane + wheel;
      const grad = g.createLinearGradient(px(x0 - 0.45), 0, px(x0 + 0.45), 0);
      grad.addColorStop(0, "rgba(10,10,10,0)");
      grad.addColorStop(0.5, "rgba(10,10,10,0.16)");
      grad.addColorStop(1, "rgba(10,10,10,0)");
      g.fillStyle = grad;
      g.fillRect(px(x0 - 0.45), 0, 0.9 * PX, H);
      for (let n = 0; n < 20; n++) {
        g.fillStyle = `rgba(8,8,8,${0.03 + rand() * 0.06})`;
        g.fillRect(px(x0 + (rand() - 0.5) * 0.7), 0, 1 + rand() * 3, H);
      }
    }
    const drip = g.createLinearGradient(px(lane - 0.35), 0, px(lane + 0.35), 0);
    drip.addColorStop(0, "rgba(14,12,10,0)");
    drip.addColorStop(0.5, "rgba(14,12,10,0.2)");
    drip.addColorStop(1, "rgba(14,12,10,0)");
    g.fillStyle = drip;
    g.fillRect(px(lane - 0.35), 0, 0.7 * PX, H);
    for (let n = 0; n < 60; n++) {
      g.fillStyle = `rgba(12,10,8,${0.04 + rand() * 0.08})`;
      g.beginPath();
      g.ellipse(
        px(lane + (rand() - 0.5) * 0.4),
        rand() * H,
        1.5 + rand() * 3,
        4 + rand() * 14,
        0,
        0,
        Math.PI * 2,
      );
      g.fill();
    }
  }

  // Tar snakes: wandering black crack sealant, mostly along the lanes with a
  // few transverse cracks. Drawn three times (shifted a tile up and down) so
  // they wrap seamlessly.
  const snakes: [number, number][][] = [];
  // Short steps with a wandering heading, so they read as sealed cracks
  // rather than strokes.
  const walk = (
    u: number,
    v: number,
    du: number,
    dv: number,
    steps: number,
  ) => {
    const pts: [number, number][] = [[u, v]];
    let a = Math.atan2(dv, du);
    for (let i = 0; i < steps; i++) {
      a += (rand() - 0.5) * 0.9;
      a += (Math.atan2(dv, du) - a) * 0.35; // pulled back toward the crack's direction
      u += Math.cos(a) * 0.12;
      v += Math.sin(a) * 0.12;
      pts.push([u, v]);
    }
    snakes.push(pts);
  };
  for (const u of [2.2, 1.8, -1.6, 5.6])
    walk(
      u + (rand() - 0.5) * 0.15,
      rand() * ROAD_TILE,
      0,
      1,
      25 + Math.floor(rand() * 50),
    );
  for (let n = 0; n < 5; n++) {
    const dir = rand() < 0.5 ? 1 : -1;
    walk(
      dir > 0 ? -1.9 + rand() * 4 : 5.9 - rand() * 4,
      rand() * ROAD_TILE,
      dir,
      (rand() - 0.5) * 0.3,
      6 + Math.floor(rand() * 16),
    );
  }
  g.lineCap = g.lineJoin = "round";
  for (const pts of snakes) {
    const width = 0.02 + rand() * 0.03;
    for (const shift of [-ROAD_TILE, 0, ROAD_TILE]) {
      g.strokeStyle = "rgba(12,12,13,0.82)";
      g.lineWidth = width * PX;
      g.beginPath();
      pts.forEach(([u, v], i) =>
        (i ? g.lineTo : g.moveTo).call(g, px(u), (v + shift) * PX),
      );
      g.stroke();
    }
  }

  // Paint, then wear: chips and bare patches where tyres cross it.
  const line = (u: number, width: number, color: string) => {
    g.fillStyle = color;
    g.fillRect(px(u - width / 2), 0, width * PX, H);
    // Fine speckled wear: knock back small spots partway, so the asphalt
    // grain shows through the paint.
    g.globalCompositeOperation = "destination-out";
    for (let n = 0; n < 700; n++) {
      g.fillStyle = `rgba(0,0,0,${0.2 + rand() * 0.5})`;
      g.beginPath();
      g.arc(
        px(u - width / 2) + rand() * width * PX,
        rand() * H,
        0.4 + rand() * 1.1,
        0,
        Math.PI * 2,
      );
      g.fill();
    }
    g.globalCompositeOperation = "source-over";
  };
  line(ROAD_LEFT + 0.2, 0.1, "rgba(238,236,228,0.9)");
  line(ROAD_LEFT + ROAD_WIDTH - 0.2, 0.1, "rgba(238,236,228,0.9)");
  line(1.9, 0.1, "rgba(226,172,38,0.92)");
  line(2.1, 0.1, "rgba(226,172,38,0.92)");

  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 16;
  return t;
}

function Road() {
  const { road, shoulders, rail } = useMemo(() => {
    const flat = (lift: number) => (_s: number, p: TrackPoint) => p.y + lift;
    return {
      road: ribbon({
        ds: 2,
        us: [ROAD_LEFT, ROAD_LEFT + ROAD_WIDTH],
        y: flat(0),
        uv: (s, u) => [(u - ROAD_LEFT) / ROAD_WIDTH, s / ROAD_TILE],
      }),
      shoulders: mergeGeometries([
        ribbon({
          ds: 2,
          us: [-4.5, ROAD_LEFT],
          y: flat(-0.02),
          uv: (s, u) => [u / 3, s / 3],
        }),
        ribbon({
          ds: 2,
          us: [ROAD_LEFT + ROAD_WIDTH, 8.5],
          y: flat(-0.02),
          uv: (s, u) => [u / 3, s / 3],
        }),
      ]),
      // Guardrail beam: a vertical strip just inside the ocean-side shoulder.
      rail: ribbon({
        ds: 2,
        us: [-4.2, -4.2],
        y: (_s, p, _u, j) => p.y + (j ? 0.45 : 0.8),
      }),
    };
  }, []);
  // Road UVs span ROAD_WIDTH x ROAD_TILE m; shoulder UVs are metres / 3.
  const asphalt = usePbrMaterial(ASPHALT, {
    tile: 4,
    size: [ROAD_WIDTH, ROAD_TILE],
    normalScale: 0.8,
    brightness: 0.8,
  });
  const gravel = usePbrMaterial(GRAVEL, {
    res: "1k",
    tile: 2,
    size: [3, 3],
    tint: "#d8cdbb",
  });
  const overlay = useMemo(roadOverlayTexture, []);
  return (
    <>
      <mesh geometry={road} receiveShadow material={asphalt} />
      <mesh geometry={road} receiveShadow>
        <meshStandardMaterial
          map={overlay}
          transparent
          depthWrite={false}
          roughness={0.75}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-2}
        />
      </mesh>
      <mesh geometry={shoulders} receiveShadow material={gravel} />
      <mesh geometry={rail} castShadow>
        <meshStandardMaterial
          color="#b9bec2"
          metalness={0.7}
          roughness={0.35}
          side={DoubleSide}
        />
      </mesh>
    </>
  );
}

// An instance transform at distance s, offset u from the road centreline and
// turned to follow it.
function placeAlong(
  s: number,
  u: number,
  y: number,
  scale: Vector3,
  extraYaw = 0,
  tilt?: Euler,
) {
  const p = track.at(s);
  const [x, , z] = track.offset(p, u);
  const q = new Quaternion().setFromEuler(
    new Euler(0, p.heading + extraYaw, 0),
  );
  if (tilt) q.multiply(new Quaternion().setFromEuler(tilt));
  return new Matrix4().compose(new Vector3(x, y, z), q, scale);
}

const POST_SPACING = 2.5;
const POLE_SPACING = 50;
const POLE_U = 11;

function spotsEvery(spacing: number) {
  const out: number[] = [];
  for (let s = Math.ceil(S0 / spacing) * spacing; s <= S1; s += spacing)
    out.push(s);
  return out;
}

const poleBase = (s: number) => hillY(s, POLE_U, track.at(s).y);

function RoadFurniture() {
  const posts = useRef<InstancedMesh>(null);
  const poles = useRef<InstancedMesh>(null);
  const arms = useRef<InstancedMesh>(null);
  const postSpots = useMemo(() => spotsEvery(POST_SPACING), []);
  const poleSpots = useMemo(() => spotsEvery(POLE_SPACING), []);
  const { pole, arm, wood, wires } = useMemo(() => {
    const spans: BufferGeometry[] = [];
    for (let i = 0; i < poleSpots.length - 1; i++) {
      const [sa, sb] = [poleSpots[i], poleSpots[i + 1]];
      for (const side of [-0.95, 0.95]) {
        const end = (s: number) =>
          new Vector3(...track.offset(track.at(s), POLE_U + side)).setY(
            poleBase(s) + 9.3,
          );
        const a = end(sa);
        const b = end(sb);
        const mid = end((sa + sb) / 2).setY((a.y + b.y) / 2 - 1.2);
        // A quadratic's midpoint sits halfway to its control point, so double the sag.
        mid.y -= 1.2;
        spans.push(
          new TubeGeometry(new QuadraticBezierCurve3(a, mid, b), 12, 0.012, 4),
        );
      }
    }
    return {
      pole: new CylinderGeometry(0.11, 0.14, 10, 8).translate(0, 4.6, 0),
      arm: new BoxGeometry(0.12, 0.12, 2.2)
        .rotateY(Math.PI / 2)
        .translate(0, 9.25, 0),
      wood: new MeshStandardMaterial({ color: "#5b4632", roughness: 0.9 }),
      wires: mergeGeometries(spans),
    };
  }, [poleSpots]);
  useLayoutEffect(() => {
    const one = new Vector3(1, 1, 1);
    postSpots.forEach((s, i) =>
      posts.current!.setMatrixAt(
        i,
        placeAlong(s, -4.32, track.at(s).y + 0.38, one),
      ),
    );
    poleSpots.forEach((s, i) => {
      const m = placeAlong(s, POLE_U, poleBase(s), one);
      poles.current!.setMatrixAt(i, m);
      arms.current!.setMatrixAt(i, m);
    });
    for (const m of [posts.current!, poles.current!, arms.current!]) {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
  }, [postSpots, poleSpots]);
  return (
    <>
      <instancedMesh
        ref={posts}
        args={[undefined, undefined, postSpots.length]}
        castShadow
      >
        <boxGeometry args={[0.15, 0.76, 0.15]} />
        <meshStandardMaterial color="#8f9497" metalness={0.5} roughness={0.5} />
      </instancedMesh>
      <instancedMesh
        ref={poles}
        args={[pole, wood, poleSpots.length]}
        castShadow
      />
      <instancedMesh ref={arms} args={[arm, wood, poleSpots.length]} />
      <mesh geometry={wires}>
        <meshStandardMaterial color="#1d1d1d" roughness={0.6} />
      </mesh>
    </>
  );
}

// Cobra-head street lights hung off every fourth utility pole (200 m apart,
// which divides the lap), reaching out over the land-side shoulder.
const LAMP_SPACING = POLE_SPACING * 4;
const LAMP_U = 7;
const LAMP_HEIGHT = 8.2;
const SODIUM = "#ffb766";

function StreetLights({ night }: { night: boolean }) {
  const arms = useRef<InstancedMesh>(null);
  const heads = useRef<InstancedMesh>(null);
  const lenses = useRef<InstancedMesh>(null);
  const spots = useMemo(() => spotsEvery(LAMP_SPACING), []);
  const { lamps, pools, tilts } = useMemo(() => {
    const roadAt = (s: number) =>
      new Vector3(...track.offset(track.at(s), 4.5)).setY(track.at(s).y);
    return {
      lamps: spots.map((s) =>
        new Vector3(...track.offset(track.at(s), LAMP_U)).setY(
          poleBase(s) + LAMP_HEIGHT - 0.3,
        ),
      ),
      // The pool of light lands mostly on the road, inboard of the lamp,
      // tilted to the road's grade so it doesn't sink into a slope.
      pools: spots.map(roadAt),
      tilts: spots.map((s) => {
        const t = roadAt(s + 4)
          .sub(roadAt(s - 4))
          .normalize();
        const n = UP.clone().addScaledVector(t, -t.dot(UP)).normalize();
        return new Quaternion().setFromUnitVectors(UP, n);
      }),
    };
  }, [spots]);
  useLayoutEffect(() => {
    const one = new Vector3(1, 1, 1);
    spots.forEach((s, i) => {
      const base = poleBase(s);
      arms.current!.setMatrixAt(
        i,
        placeAlong(
          s,
          (POLE_U + LAMP_U) / 2,
          base + LAMP_HEIGHT + 0.25,
          one,
          0,
          new Euler(0, 0, 0.08),
        ),
      );
      heads.current!.setMatrixAt(
        i,
        placeAlong(s, LAMP_U + 0.15, base + LAMP_HEIGHT, one),
      );
      lenses.current!.setMatrixAt(
        i,
        placeAlong(s, LAMP_U + 0.1, base + LAMP_HEIGHT - 0.11, one),
      );
    });
    for (const m of [arms.current!, heads.current!, lenses.current!]) {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
  }, [spots]);
  return (
    <>
      <instancedMesh
        ref={arms}
        args={[undefined, undefined, spots.length]}
        castShadow
      >
        <boxGeometry args={[POLE_U - LAMP_U + 0.2, 0.08, 0.08]} />
        <meshStandardMaterial
          color="#9a9fa3"
          metalness={0.6}
          roughness={0.45}
        />
      </instancedMesh>
      <instancedMesh
        ref={heads}
        args={[undefined, undefined, spots.length]}
        castShadow
      >
        <boxGeometry args={[0.8, 0.18, 0.36]} />
        <meshStandardMaterial color="#a7abae" metalness={0.5} roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={lenses} args={[undefined, undefined, spots.length]}>
        <boxGeometry args={[0.6, 0.05, 0.28]} />
        <meshStandardMaterial
          color="#d9d4c8"
          emissive={SODIUM}
          emissiveIntensity={night ? 9 : 0}
          roughness={0.2}
        />
      </instancedMesh>
      {night && (
        <>
          <GroundGlows
            spots={pools}
            tilts={tilts}
            radius={11}
            color={SODIUM}
            opacity={0.2}
          />
          <NearestLights
            spots={lamps}
            count={2}
            kind="spot"
            color={SODIUM}
            intensity={140}
            distance={34}
            angle={1.05}
          />
        </>
      )}
    </>
  );
}

function Terrain() {
  const { cliff, hills } = useMemo(() => {
    const grass = new Color("#8f8a4c");
    const gold = [
      new Color("#94804c"),
      new Color("#877444"),
      new Color("#a08a55"),
      new Color("#7d6f45"),
    ];
    const cliffUs = [-4.5, -6, -9, -13, -18, -24, -30, -37, -44, -52];
    const hillUs = [
      8.5, 10, 13, 18, 26, 36, 50, 66, 85, 108, 135, 165, 200, 240,
    ];
    const cliffRibbon = ribbon({
      ds: 4,
      us: cliffUs,
      y: (s, p, u, j, key) =>
        cliffY(s, u, p.y, j === 0 ? 0 : hash(key, j) - 0.5),
      color: () => grass,
    });
    // Rock all the way down from just below the grassy top, however flat it
    // gets at the waterline; above that, rock only where it's steep.
    const pos = cliffRibbon.getAttribute("position");
    const rockiness = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const row = Math.floor(i / cliffUs.length);
      rockiness[i] = pos.getY(i) < track.at(S0 + row * 4).y - 1.5 ? 1 : 0;
    }
    cliffRibbon.setAttribute("rockiness", new BufferAttribute(rockiness, 1));
    // De-indexed with per-face normals so the rock reads as faceted stone.
    const cliff = cliffRibbon.toNonIndexed();
    cliff.computeVertexNormals();
    const hills = ribbon({
      ds: 10,
      us: hillUs,
      y: (s, p, u) => hillY(s, u, p.y),
      color: (_y, _p, _u, j, key) =>
        gold[Math.floor(hash(key, j + 90) * gold.length)],
    });
    return { cliff, hills };
  }, []);
  // Weathered tan rock on the cliffs, and dry ground where the hills steepen.
  const tints = { rockTint: "#e2d2bc", dirtTint: "#dccdb4" };
  const hillGround = useSlopeGround(tints);
  const cliffGround = useSlopeGround({ ...tints, rockiness: true });
  // The mapping follows the laps the way the ocean's does (see Ocean).
  useFrame(() => {
    for (const { offset } of [hillGround, cliffGround])
      offset.set(
        mod(here.lap * track.lapShift.x, GROUND_PERIOD),
        0,
        mod(here.lap * track.lapShift.z, GROUND_PERIOD),
      );
  });
  return (
    <>
      <mesh
        geometry={cliff}
        material={cliffGround.material}
        receiveShadow
        castShadow
      />
      <mesh geometry={hills} material={hillGround.material} receiveShadow />
    </>
  );
}
// ---- Vegetation and rocks (Poly Haven, CC0) -------------------------------

interface Spot {
  s: number;
  matrix: Matrix4;
}

// The scanned shrubs and boulders are 2k-27k triangles each and there are
// thousands of them, most far off in the haze. Each is drawn in full near
// the camera and from simplified copies further out, and not at all out of
// view or past where the fog has swallowed it.
const SCENERY_LEVELS: Level[] = [
  { ratio: 1, upTo: 90 },
  { ratio: 0.3, upTo: 300 },
  // Dissolving over its last 400 m, so the scrub thins out into the haze
  // rather than popping into view.
  { ratio: 0.12, upTo: FOG_FAR * 0.6, blend: 400 },
];

function ScatteredModel({
  url,
  spots,
}: {
  url: string;
  spots: (modelSize: number) => Spot[];
}) {
  const { parts, bounds } = useModelParts(url);
  const matrices = useMemo(() => {
    const size = bounds.getSize(new Vector3());
    return spots(Math.max(size.x, size.y, size.z)).map((p) => p.matrix);
  }, [spots, bounds]);
  return (
    <LodInstancedModel
      parts={parts}
      bounds={bounds}
      matrices={matrices}
      levels={SCENERY_LEVELS}
    />
  );
}

// Scrub on the hills, densest near the road. Spots come from a 5 m grid keyed
// on (distance mod lap), so every lap gets the same bushes.
function shrubSpots(which: number, of: number, density: number) {
  return (height: number): Spot[] => {
    const out: Spot[] = [];
    for (let s = Math.ceil(S0 / 5) * 5; s <= S1; s += 5) {
      const key = Math.round(mod(s, L) / 5);
      for (let j = 0; j < 3; j++) {
        if (
          hash(key, j) > density ||
          Math.floor(hash(key, j + 30) * of) !== which
        )
          continue;
        const ss = s + hash(key, j + 20) * 5;
        const u = 10.5 + Math.pow(hash(key, j + 10), 1.4) * 150;
        const size = (1.8 + hash(key, j + 40) * 4) / height;
        const y = hillY(ss, u, track.at(ss).y) - 0.15;
        out.push({
          s: ss,
          matrix: placeAlong(
            ss,
            u,
            y,
            new Vector3(size, size, size),
            hash(key, j + 60) * TAU,
          ),
        });
      }
    }
    return out;
  };
}

// Boulders down the cliff face and along the waterline.
function rockSpots(which: number) {
  return (height: number): Spot[] => {
    const out: Spot[] = [];
    for (let s = Math.ceil(S0 / 10) * 10; s <= S1; s += 10) {
      const key = Math.round(mod(s, L) / 10);
      for (let j = 0; j < 3; j++) {
        if (
          hash(key, j + 100) > 0.22 ||
          Math.floor(hash(key, j + 130) * 2) !== which
        )
          continue;
        const ss = s + hash(key, j + 110) * 10;
        const u = -9 - hash(key, j + 120) * 50;
        const size = (1.5 + hash(key, j + 140) * 5) / height;
        const y =
          Math.max(SEA - 1.5, cliffY(ss, u, track.at(ss).y)) -
          size * height * 0.25;
        const tilt = new Euler(
          hash(key, j + 150) * 0.6,
          hash(key, j + 160) * TAU,
          hash(key, j + 170) * 0.6,
        );
        out.push({
          s: ss,
          matrix: placeAlong(
            ss,
            u,
            y,
            new Vector3(size, size * 0.8, size),
            0,
            tilt,
          ),
        });
      }
    }
    return out;
  };
}

const SHRUBS = ["shrub_03", "shrub_03", "shrub_04", "shrub_02"].map(
  polyHavenModel,
);
const ROCKS = ["rock_07", "rock_09"].map(polyHavenModel);

function Vegetation() {
  const shrubs = useMemo(
    () => SHRUBS.map((_, i) => shrubSpots(i, SHRUBS.length, 0.7)),
    [],
  );
  const rocks = useMemo(() => ROCKS.map((_, i) => rockSpots(i)), []);
  return (
    <>
      {SHRUBS.map((url, i) => (
        <ScatteredModel key={`shrub${i}`} url={url} spots={shrubs[i]} />
      ))}
      {ROCKS.map((url, i) => (
        <ScatteredModel key={`rock${i}`} url={url} spots={rocks[i]} />
      ))}
    </>
  );
}

// ---- Ocean ----------------------------------------------------------------

// Integer wavenumbers over OCEAN_PERIOD metres, so the pattern can be shifted
// by whole-lap offsets (mod the period) without a visible jump.
const OCEAN_PERIOD = 200;
const WAVES: [number, number, number][] = [
  // [cycles across X, cycles along Z, amplitude in metres]
  [22, 14, 0.35],
  [15, -24, 0.25],
  [41, 9, 0.12],
  [8, 19, 0.3],
  [63, -37, 0.05],
  [97, 41, 0.03],
];

const oceanVertex = /* glsl */ `
  varying vec3 vTrack;
  varying vec3 vWorld;
  void main() {
    vTrack = position;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

// Waves are evaluated in track space (plus the laps already driven), so they
// stay put on the water as the world moves past.
const oceanFragment = /* glsl */ `
  uniform float uTime;
  uniform vec2 uLapOffset;
  uniform vec3 uSun;
  uniform vec3 uHaze;
  uniform vec3 uDeep;
  uniform vec3 uGlint;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform vec3 uWaves[${WAVES.length}];
  varying vec3 vTrack;
  varying vec3 vWorld;
  const float TAU = 6.2831853;
  void main() {
    vec2 p = vTrack.xz + uLapOffset;
    float dist = length(vWorld - cameraPosition);
    float detail = 1.0 - smoothstep(150.0, 1500.0, dist);
    vec2 grad = vec2(0.0);
    for (int n = 0; n < ${WAVES.length}; n++) {
      vec2 k = uWaves[n].xy * (TAU / ${OCEAN_PERIOD.toFixed(1)});
      float omega = sqrt(9.81 * length(k));
      grad += uWaves[n].z * k * cos(dot(k, p) - omega * uTime);
    }
    vec3 nrm = normalize(vec3(-grad.x * detail * 0.3, 1.0, -grad.y * detail * 0.3));
    vec3 view = normalize(cameraPosition - vWorld);
    float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(nrm, view), 0.0), 5.0);
    vec3 col = mix(uDeep, uHaze * 0.9, fresnel);
    float glint = pow(max(dot(reflect(-view, nrm), uSun), 0.0), 500.0);
    col += uGlint * glint;
    gl_FragColor = vec4(mix(col, uHaze, smoothstep(uFogNear, uFogFar, dist)), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// Deep water and the sun's (or moon's) glint off the swell, by day and night.
const DEEP = {
  day: new Vector3(0.012, 0.07, 0.11),
  night: new Vector3(0.0015, 0.006, 0.012),
};
const GLINT = {
  day: new Vector3(12, 11, 9.6),
  night: new Vector3(1.6, 1.8, 2.4),
};

function Ocean({ sky, night }: { sky: HdriSky; night: boolean }) {
  const material = useRef<ShaderMaterial>(null);
  // Flat, so where the inside of a bend folds the strip over itself the
  // overlapping water is identical and the fold can't be seen.
  const geometry = useMemo(
    () =>
      ribbon({
        ds: 20,
        us: [-30, -60, -120, -250, -500, -1000, -2000, -3500, -5500],
        y: () => SEA,
      }),
    [],
  );
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uLapOffset: { value: [0, 0] },
      uSun: { value: new Vector3() },
      uHaze: { value: sky.horizon },
      uDeep: { value: night ? DEEP.night : DEEP.day },
      uGlint: { value: night ? GLINT.night : GLINT.day },
      uFogNear: { value: FOG_NEAR },
      uFogFar: { value: FOG_FAR },
      uWaves: { value: WAVES.map(([x, z, a]) => new Vector3(x, z, a)) },
    }),
    [sky, night],
  );
  // R3F copies each uniform into the material, so update the material's own.
  useFrame(({ clock }) => {
    const u = material.current?.uniforms;
    if (!u) return;
    u.uTime.value = clock.elapsedTime;
    u.uLapOffset.value = [
      mod(here.lap * track.lapShift.x, OCEAN_PERIOD),
      mod(here.lap * track.lapShift.z, OCEAN_PERIOD),
    ];
    (u.uSun.value as Vector3).copy(sky.sun).applyAxisAngle(UP, -here.heading);
  });
  return (
    <mesh geometry={geometry}>
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={oceanVertex}
        fragmentShader={oceanFragment}
        side={DoubleSide}
      />
    </mesh>
  );
}

// ---- The lighthouse -----------------------------------------------------------

// A white lighthouse with red bands on a rocky islet offshore, off a long
// straight so it stands clear of the bends. After dark its lamp turns, two
// beams sweeping over the sea. Placed once per lap copy of the scenery.
const LIGHTHOUSE_S = 2400;
const LIGHTHOUSE_U = -185;
const TOWER_BASE = 5;
const TOWER_H = 20;
const LANTERN_Y = TOWER_BASE + TOWER_H + 1.6;

const beamVertex = /* glsl */ `
  varying float vAlong;
  void main() {
    vAlong = uv.y; // 1 at the lamp, 0 at the far end
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const beamFragment = /* glsl */ `
  varying float vAlong;
  void main() {
    float a = 0.45 * pow(vAlong, 1.8);
    gl_FragColor = vec4(vec3(1.0, 0.93, 0.78) * a, 1.0);
  }
`;

function lighthouseParts(night: boolean) {
  const m = (color: string, roughness = 0.7) =>
    new MeshStandardMaterial({ color, roughness });
  const beam = new ConeGeometry(16, 300, 20, 1, true);
  beam.translate(0, -150, 0); // apex at the lamp
  beam.rotateZ(Math.PI / 2); // pointing along +x
  return {
    white: m("#eeece6"),
    red: m("#b3262a", 0.6),
    dark: m("#2a2c2e", 0.5),
    rock: new MeshStandardMaterial({
      color: "#6c645a",
      roughness: 0.95,
      flatShading: true,
    }),
    glass: new MeshStandardMaterial({
      color: "#fff4d8",
      emissive: "#ffe2a8",
      emissiveIntensity: night ? 6 : 0.25,
      roughness: 0.1,
      metalness: 0.2,
    }),
    islet: new IcosahedronGeometry(1, 2),
    beam,
    beamMaterial: new ShaderMaterial({
      vertexShader: beamVertex,
      fragmentShader: beamFragment,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    }),
  };
}

function Lighthouse({ night }: { night: boolean }) {
  const parts = useMemo(() => lighthouseParts(night), [night]);
  return (
    <>
      {[LIGHTHOUSE_S - L, LIGHTHOUSE_S].map((s) => {
        const p = track.at(s);
        const [x, , z] = track.offset(p, LIGHTHOUSE_U);
        return (
          <group key={s} position={[x, SEA, z]} rotation-y={p.heading}>
            <Tower parts={parts} night={night} />
          </group>
        );
      })}
    </>
  );
}

function Tower({
  parts,
  night,
}: {
  parts: ReturnType<typeof lighthouseParts>;
  night: boolean;
}) {
  const beams = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (beams.current) beams.current.rotation.y = clock.elapsedTime * 0.55;
  });
  // The tower's radius at a height, for the bands.
  const r = (y: number) => 3 - ((y - TOWER_BASE) / TOWER_H) * 1;
  return (
    <group>
      <mesh
        position={[0, 0, 0]}
        scale={[30, 7, 22]}
        geometry={parts.islet}
        material={parts.rock}
        castShadow
        receiveShadow
      />
      <mesh
        position={[16, 0, 8]}
        scale={[9, 3.5, 7]}
        rotation-y={0.8}
        geometry={parts.islet}
        material={parts.rock}
      />
      <mesh
        position={[-12, 0, -14]}
        scale={[7, 2.5, 6]}
        rotation-y={2.1}
        geometry={parts.islet}
        material={parts.rock}
      />
      <mesh
        position-y={TOWER_BASE + TOWER_H / 2}
        material={parts.white}
        castShadow
      >
        <cylinderGeometry args={[2, 3, TOWER_H, 28]} />
      </mesh>
      {[10, 17].map((y) => (
        <mesh key={y} position-y={y} material={parts.red}>
          <cylinderGeometry
            args={[r(y + 1.5) + 0.03, r(y - 1.5) + 0.03, 3, 28]}
          />
        </mesh>
      ))}
      <mesh position-y={TOWER_BASE + TOWER_H + 0.15} material={parts.dark}>
        <cylinderGeometry args={[3, 3, 0.3, 28]} />
      </mesh>
      <mesh position-y={TOWER_BASE + TOWER_H + 1.1} material={parts.dark}>
        <torusGeometry args={[2.9, 0.05, 6, 32]} />
      </mesh>
      <mesh position-y={LANTERN_Y} material={parts.glass}>
        <cylinderGeometry args={[1.6, 1.6, 2.4, 16]} />
      </mesh>
      <mesh position-y={LANTERN_Y + 2} material={parts.red}>
        <coneGeometry args={[2, 1.6, 16]} />
      </mesh>
      <mesh position-y={LANTERN_Y + 3} material={parts.dark}>
        <sphereGeometry args={[0.3, 10, 8]} />
      </mesh>
      {/* The keeper's house beside it. */}
      <group position={[-8, 5.2, 4]} rotation-y={0.3}>
        <mesh position-y={2} material={parts.white} castShadow>
          <boxGeometry args={[8, 4, 6]} />
        </mesh>
        <mesh
          position-y={5}
          rotation-y={Math.PI / 4}
          scale={[1, 1, 0.75]}
          material={parts.red}
          castShadow
        >
          <coneGeometry args={[5.6, 2.2, 4]} />
        </mesh>
      </group>
      {night && (
        <group ref={beams} position-y={LANTERN_Y}>
          <mesh geometry={parts.beam} material={parts.beamMaterial} />
          <mesh
            geometry={parts.beam}
            material={parts.beamMaterial}
            rotation-y={Math.PI}
          />
          <pointLight color="#ffe2a8" intensity={400} distance={80} decay={2} />
        </group>
      )}
    </group>
  );
}

// ---- Oncoming traffic ---------------------------------------------------------

// Now and then a car comes the other way in the far lane: the Mach 1 (its
// wheels rolling) and the Charger, half a lap apart, each going round the
// lap backward at a steady speed. Each is drawn at the copy of its spot on
// the scenery that's nearest ahead of the Camaro.
const ONCOMING_U = 4; // the far lane's centre
const ONCOMING_SPEED = 23;
const MUSTANG_DRIVE = constantSpeed(ONCOMING_SPEED);

function Oncoming({ phase, children }: { phase: number; children: ReactNode }) {
  const drive = useDrive();
  const group = useRef<Group>(null);
  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const t = clock.elapsedTime - drive.t0;
    // Its copy from 150 m behind the Camaro to a lap ahead of that.
    const s0 = mod(phase - ONCOMING_SPEED * t, L);
    const s = s0 + Math.ceil((here.s - 150 - s0) / L) * L;
    const p = track.at(s);
    const [x, , z] = track.offset(p, ONCOMING_U);
    g.position.set(x, p.y, z);
    g.rotation.set(0, p.heading + Math.PI, 0);
  });
  return <group ref={group}>{children}</group>;
}

function Traffic({ night }: { night: boolean }) {
  return (
    <>
      <Optional>
        <Oncoming phase={L * 0.3}>
          <MustangModel profile={MUSTANG_DRIVE} lightsOn={night} />
        </Oncoming>
      </Optional>
      <Optional>
        <Oncoming phase={L * 0.8}>
          <ChargerModel />
        </Oncoming>
      </Optional>
    </>
  );
}

// ---- Gulls --------------------------------------------------------------------

// A loose flock wheeling over the cliff edge and the water below it, on the
// ocean side of the car, gliding with now and then a few wingbeats. They
// ride along in the car's frame, slowly dropping back and coming round again
// from far ahead.
const GULLS = 16;

function gullWing() {
  const s = new Shape();
  s.moveTo(0.05, 0.16);
  s.lineTo(0.45, 0.12);
  s.lineTo(0.9, -0.04);
  s.lineTo(0.8, -0.16);
  s.lineTo(0.35, -0.12);
  s.lineTo(0.05, -0.14);
  const g = new ShapeGeometry(s);
  g.rotateX(Math.PI / 2); // span along +x, chord along z
  return g;
}

function Gulls() {
  const body = useRef<InstancedMesh>(null);
  const right = useRef<InstancedMesh>(null);
  const left = useRef<InstancedMesh>(null);
  const parts = useMemo(() => {
    const rand = mulberry32(31);
    const birds = Array.from({ length: GULLS }, () => ({
      cx: -16 - rand() * 55,
      cy: 9 + rand() * 22,
      cz: rand() * 240,
      r: 5 + rand() * 12,
      w: (rand() < 0.5 ? -1 : 1) * (0.25 + rand() * 0.3),
      ph: rand() * 100,
    }));
    const wing = gullWing();
    return {
      birds,
      body: new SphereGeometry(0.12, 8, 6).scale(1, 0.85, 3.4),
      right: wing,
      left: wing.clone().scale(-1, 1, 1),
      white: new MeshStandardMaterial({ color: "#f4f4f2", roughness: 0.8 }),
      grey: new MeshStandardMaterial({
        color: "#c9ced2",
        roughness: 0.8,
        side: DoubleSide,
      }),
    };
  }, []);
  const tmp = useMemo(
    () => ({ o: new Object3D(), m: new Matrix4(), flap: new Matrix4() }),
    [],
  );
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const [b, wr, wl] = [body.current, right.current, left.current];
    if (!b || !wr || !wl) return;
    parts.birds.forEach((g, i) => {
      const a = g.w * t + g.ph;
      const cz = mod(g.cz - 2.5 * t, 240) - 80;
      const x = g.cx + g.r * Math.cos(a);
      const z = cz + g.r * Math.sin(a);
      const y = g.cy + 1.2 * Math.sin(0.6 * t + g.ph);
      const vx = -g.r * g.w * Math.sin(a);
      const vz = g.r * g.w * Math.cos(a) - 2.5;
      tmp.o.position.set(x, y, z);
      tmp.o.rotation.set(0, Math.atan2(vx, vz), Math.sign(g.w) * 0.35, "YXZ");
      tmp.o.updateMatrix();
      b.setMatrixAt(i, tmp.o.matrix);
      // Mostly gliding with the wings held up a touch; a few beats now and then.
      const beating = mod(t * 0.22 + g.ph, 1) < 0.25;
      const flap = beating ? 0.6 * Math.sin(t * 11 + g.ph) : 0.12;
      wr.setMatrixAt(
        i,
        tmp.m.copy(tmp.o.matrix).multiply(tmp.flap.makeRotationZ(flap)),
      );
      wl.setMatrixAt(
        i,
        tmp.m.copy(tmp.o.matrix).multiply(tmp.flap.makeRotationZ(-flap)),
      );
    });
    for (const m of [b, wr, wl]) {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
  });
  return (
    <>
      <instancedMesh
        ref={body}
        args={[parts.body, parts.white, GULLS]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={right}
        args={[parts.right, parts.grey, GULLS]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={left}
        args={[parts.left, parts.grey, GULLS]}
        frustumCulled={false}
      />
    </>
  );
}

// ---- Following the car ----------------------------------------------------

// Moves the world (and turns the sky and sun with it) so the car's current
// spot on the road sits at the origin, facing +Z. Runs before the other frame
// callbacks so they all see this frame's position.
function World({
  sky,
  sunLight,
  children,
}: {
  sky: HdriSky;
  sunLight: RefObject<DirectionalLight | null>;
  children: ReactNode;
}) {
  const drive = useDrive();
  const group = useRef<Group>(null);
  const turn = useMemo(() => new Matrix4(), []);
  useFrame(({ clock, scene }) => {
    const { distance } = driveState(drive, clock.elapsedTime);
    here.lap = Math.floor(distance / L);
    here.s = distance - here.lap * L;
    const p = track.at(here.s);
    here.heading = p.heading;
    group.current?.matrix
      .makeTranslation(-p.x, -p.y, -p.z)
      .premultiply(turn.makeRotationY(-p.heading));
    scene.environmentRotation.y = sky.rotation.y - p.heading;
    scene.backgroundRotation.y = sky.rotation.y - p.heading;
    sunLight.current?.position
      .copy(sky.sun)
      .applyAxisAngle(UP, -p.heading)
      .multiplyScalar(40);
  }, -1);
  return (
    <group ref={group} matrixAutoUpdate={false}>
      {children}
    </group>
  );
}

function CoastWorld({ lightsOn, domeOn, night = false }: SceneProps) {
  const sky = useSceneSky(SKY, -0.5, EXPOSURE, night);
  const sun = useRef<DirectionalLight>(null);
  return (
    <DriveProvider profile={track}>
      <fog attach="fog" args={[sky.fog, FOG_NEAR, FOG_FAR]} />
      <SkyReflections sky={sky} ground="#4a4a48" />
      <directionalLight
        ref={sun}
        intensity={sky.sunIntensity}
        color={sky.sunColor}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-camera-far={120}
      />
      <World sky={sky} sunLight={sun}>
        <Road />
        <RoadFurniture />
        <StreetLights night={night} />
        <Terrain />
        <Ocean sky={sky} night={night} />
        <Lighthouse night={night} />
        <Traffic night={night} />
        <Optional>
          <Vegetation />
        </Optional>
      </World>
      {!night && <Gulls />}
      <CamaroModel lightsOn={lightsOn} domeOn={domeOn} />
      <CarContactShadows
        position={[0, 0.01, 0]}
        opacity={0.45}
        scale={10}
        blur={2.2}
        far={2}
      />
    </DriveProvider>
  );
}

export default function CoastScene(props: SceneProps) {
  useCameraStart(5.5, 2, -7.5);
  useFarPlane(9000); // the ocean has to reach the horizon
  useExposure(EXPOSURE);
  return (
    <>
      <CoastWorld {...props} />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        minDistance={3}
        maxDistance={16}
        maxPolarAngle={Math.PI / 2.05}
      />
    </>
  );
}
