import { useLayoutEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Euler,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  type DirectionalLight,
  type Group,
  type InstancedMesh,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { driveState, useDrive } from "../../car/driveClock";
import type { Track, TrackPoint } from "../../car/track";
import { mulberry32 } from "./periodic";
import { preloadPbr, usePbrMaterial } from "./pbr";
import type { HdriSky } from "./hdri";

// Shared machinery for the driving scenes (after the coast, which has its own
// copy): the car stays at the origin facing +Z and the world is moved past it
// along a Track that repeats every lap. Scenery is built in track space from
// S0 to S1 and keyed on (distance mod lap), so a lap's scenery repeats
// exactly and the loop never shows.

export const TAU = Math.PI * 2;
export const UP = new Vector3(0, 1, 0);
export const mod = (a: number, n: number) => ((a % n) + n) % n;
export const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
// Stable [0, 1) per integer pair.
export const hash = (a: number, b: number) => {
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

// Where the car is this frame, shared by everything that follows it.
export interface Here {
  s: number; // metres into the current lap
  lap: number;
  heading: number;
}
export const newHere = (): Here => ({ s: 0, lap: 0, heading: 0 });

export interface RibbonOptions {
  ds: number; // row spacing along the road; must divide the lap length
  us: number[]; // lateral positions of the columns (+ = driver's side)
  y: (s: number, p: TrackPoint, u: number, j: number, key: number) => number;
  uv?: (s: number, u: number) => [number, number];
  color?: (y: number, p: TrackPoint, u: number, j: number, key: number) => Color;
}

export class RoadKit {
  readonly L: number;
  constructor(
    readonly track: Track,
    readonly S0: number,
    readonly S1: number,
  ) {
    this.L = track.length;
  }

  // A grid of rows across the road from S0 to S1, in track space. `key`
  // identifies the row within a lap, for scenery that repeats per lap.
  ribbon({ ds, us, y, uv, color }: RibbonOptions) {
    const { track, S0, S1, L } = this;
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
        // Columns run toward +u and rows toward +s, so this winding faces up.
        if (us[j + 1] >= us[j]) index.push(a, b, a + 1, a + 1, b, b + 1);
        else index.push(a, a + 1, b, a + 1, b + 1, b);
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

  // An instance transform at distance s, offset u from the centreline,
  // turned to follow the road.
  placeAlong(s: number, u: number, y: number, scale: Vector3, extraYaw = 0, tilt?: Euler) {
    const p = this.track.at(s);
    const [x, , z] = this.track.offset(p, u);
    const q = new Quaternion().setFromEuler(new Euler(0, p.heading + extraYaw, 0));
    if (tilt) q.multiply(new Quaternion().setFromEuler(tilt));
    return new Matrix4().compose(new Vector3(x, y, z), q, scale);
  }

  // Distances from S0 to S1 at a fixed spacing (which should divide the lap).
  spotsEvery(spacing: number, phase = 0) {
    const out: number[] = [];
    for (let s = Math.ceil((this.S0 - phase) / spacing) * spacing + phase; s <= this.S1; s += spacing) out.push(s);
    return out;
  }

  // The road's centreline sampled every `step` metres, in track space, for
  // keeping scenery off the road where it doubles back on itself.
  centreline(step = 4) {
    const pts: Vector3[] = [];
    for (let s = this.S0; s <= this.S1; s += step) {
      const p = this.track.at(s);
      pts.push(new Vector3(p.x, p.y, p.z));
    }
    return pts;
  }
}

// Fast "is this point within `clearance` of any part of the road" checks.
export class RoadClearance {
  private cells = new Map<string, Vector3[]>();
  constructor(
    points: Vector3[],
    private readonly cell = 25,
  ) {
    for (const p of points) {
      const k = this.key(p.x, p.z);
      let list = this.cells.get(k);
      if (!list) this.cells.set(k, (list = []));
      list.push(p);
    }
  }
  private key(x: number, z: number) {
    return `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`;
  }
  // Distance in plan from (x, z) to the nearest centreline sample, up to `max`.
  distance(x: number, z: number, max: number) {
    let best = max;
    const r = Math.ceil(max / this.cell);
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    for (let i = -r; i <= r; i++)
      for (let j = -r; j <= r; j++) {
        const list = this.cells.get(`${cx + i},${cz + j}`);
        if (!list) continue;
        for (const p of list) best = Math.min(best, Math.hypot(p.x - x, p.z - z));
      }
    return best;
  }
}

// ---- Following the car --------------------------------------------------------

// Moves the world (and turns the sky and sun with it) so the car's spot on the
// road sits at the origin facing +Z. Runs before other frame callbacks so they
// all see this frame's position.
export function FollowWorld({
  kit,
  here,
  sky,
  sunLight,
  sunDistance = 40,
  children,
}: {
  kit: RoadKit;
  here: Here;
  sky: HdriSky;
  sunLight?: RefObject<DirectionalLight | null>;
  sunDistance?: number;
  children: ReactNode;
}) {
  const drive = useDrive();
  const group = useRef<Group>(null);
  const turn = useMemo(() => new Matrix4(), []);
  useFrame(({ clock, scene }) => {
    const { distance } = driveState(drive, clock.elapsedTime);
    here.lap = Math.floor(distance / kit.L);
    here.s = distance - here.lap * kit.L;
    const p = kit.track.at(here.s);
    here.heading = p.heading;
    group.current?.matrix.makeTranslation(-p.x, -p.y, -p.z).premultiply(turn.makeRotationY(-p.heading));
    scene.environmentRotation.y = sky.rotation.y - p.heading;
    scene.backgroundRotation.y = sky.rotation.y - p.heading;
    sunLight?.current?.position.copy(sky.sun).applyAxisAngle(UP, -p.heading).multiplyScalar(sunDistance);
  }, -1);
  return (
    <group ref={group} matrixAutoUpdate={false}>
      {children}
    </group>
  );
}

// Scenery so far off it has no parallax (a mountain range on the horizon):
// centred on the car and turned with the sky, so it never moves with the laps.
export function Horizon({ sky, here, children }: { sky: HdriSky; here: Here; children: ReactNode }) {
  const group = useRef<Group>(null);
  useFrame(() => {
    if (group.current) group.current.rotation.y = sky.rotation.y - here.heading;
  });
  return <group ref={group}>{children}</group>;
}

// ---- The road itself --------------------------------------------------------------

const ASPHALT = "asphalt_04";
const GRAVEL = "gravel_floor_02";
preloadPbr(ASPHALT);
preloadPbr(GRAVEL, "1k");

export type CentreLine = "double-yellow" | "dashed-yellow" | "none";

export interface RoadStyle {
  left: number; // u of the road's left edge (the car's lane is centred at u = 0)
  width: number; // metres; two lanes centred at 0 and width/2
  tile: number; // metres of road one overlay tile covers; must divide the lap and be a multiple of 4
  centre: CentreLine;
  edgeLines?: boolean;
  seed?: number;
  sunBleached?: number; // 0-1: faded paint and grey, dusty asphalt
}

// One overlay tile of markings and wear at 64 px per metre: edge lines, the
// centre line, darker wheel paths with an oil-drip stripe down each lane, and
// tar-snake crack sealing.
function overlayTexture({ left, width, tile, centre, edgeLines = true, seed = 7, sunBleached = 0 }: RoadStyle) {
  const PX = 64;
  const W = Math.round(width * PX);
  const H = Math.round(tile * PX);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const px = (u: number) => (u - left) * PX;
  const rand = mulberry32(seed);
  const half = width / 2;
  const lanes = [left + half / 2, left + half + half / 2];

  for (const lane of lanes) {
    for (const wheel of [-0.78, 0.78]) {
      const x0 = lane + wheel;
      const grad = g.createLinearGradient(px(x0 - 0.45), 0, px(x0 + 0.45), 0);
      grad.addColorStop(0, "rgba(10,10,10,0)");
      grad.addColorStop(0.5, `rgba(10,10,10,${0.16 * (1 - sunBleached * 0.5)})`);
      grad.addColorStop(1, "rgba(10,10,10,0)");
      g.fillStyle = grad;
      g.fillRect(px(x0 - 0.45), 0, 0.9 * PX, H);
    }
    const drip = g.createLinearGradient(px(lane - 0.35), 0, px(lane + 0.35), 0);
    drip.addColorStop(0, "rgba(14,12,10,0)");
    drip.addColorStop(0.5, "rgba(14,12,10,0.18)");
    drip.addColorStop(1, "rgba(14,12,10,0)");
    g.fillStyle = drip;
    g.fillRect(px(lane - 0.35), 0, 0.7 * PX, H);
  }

  // Tar snakes, drawn shifted a tile up and down so they wrap seamlessly.
  const snakes: [number, number][][] = [];
  const walk = (u: number, v: number, du: number, dv: number, steps: number) => {
    const pts: [number, number][] = [[u, v]];
    let a = Math.atan2(dv, du);
    for (let i = 0; i < steps; i++) {
      a += (rand() - 0.5) * 0.9;
      a += (Math.atan2(dv, du) - a) * 0.35;
      u += Math.cos(a) * 0.12;
      v += Math.sin(a) * 0.12;
      pts.push([u, v]);
    }
    snakes.push(pts);
  };
  for (const u of [left + half - 0.1, left + half + 0.2, left + 0.4, left + width - 0.4])
    walk(u + (rand() - 0.5) * 0.15, rand() * tile, 0, 1, 25 + Math.floor(rand() * 50));
  for (let n = 0; n < 5; n++) {
    const dir = rand() < 0.5 ? 1 : -1;
    walk(dir > 0 ? left + 0.1 + rand() * half : left + width - 0.1 - rand() * half, rand() * tile, dir, (rand() - 0.5) * 0.3, 6 + Math.floor(rand() * 16));
  }
  g.lineCap = g.lineJoin = "round";
  for (const pts of snakes) {
    const w = 0.02 + rand() * 0.03;
    for (const shift of [-tile, 0, tile]) {
      g.strokeStyle = "rgba(12,12,13,0.82)";
      g.lineWidth = w * PX;
      g.beginPath();
      pts.forEach(([u, v], i) => (i ? g.lineTo : g.moveTo).call(g, px(u), (v + shift) * PX));
      g.stroke();
    }
  }

  const fade = 1 - sunBleached * 0.45;
  const line = (u: number, w: number, color: string, dash?: [number, number]) => {
    g.fillStyle = color;
    if (dash) for (let v = 0; v < tile; v += dash[0] + dash[1]) g.fillRect(px(u - w / 2), v * PX, w * PX, dash[0] * PX);
    else g.fillRect(px(u - w / 2), 0, w * PX, H);
    g.globalCompositeOperation = "destination-out";
    for (let n = 0; n < 700; n++) {
      g.fillStyle = `rgba(0,0,0,${0.2 + rand() * 0.5 + sunBleached * 0.2})`;
      g.beginPath();
      g.arc(px(u - w / 2) + rand() * w * PX, rand() * H, 0.4 + rand() * 1.1, 0, Math.PI * 2);
      g.fill();
    }
    g.globalCompositeOperation = "source-over";
  };
  const white = `rgba(238,236,228,${0.9 * fade})`;
  const yellow = `rgba(226,172,38,${0.92 * fade})`;
  if (edgeLines) {
    line(left + 0.2, 0.1, white);
    line(left + width - 0.2, 0.1, white);
  }
  const mid = left + half;
  if (centre === "double-yellow") {
    line(mid - 0.1, 0.1, yellow);
    line(mid + 0.1, 0.1, yellow);
  } else if (centre === "dashed-yellow") {
    line(mid, 0.12, yellow, [3, 9]);
  }

  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 16;
  return t;
}

export interface RoadSurfaceProps {
  kit: RoadKit;
  style: RoadStyle;
  shoulders?: [number, number][]; // gravel strips [u0, u1]
  rails?: number[]; // u of each guardrail
  asphaltBrightness?: number;
  asphaltTint?: string;
  gravelTint?: string;
}

const POST_SPACING = 2.5;

// Asphalt with its markings overlay, gravel shoulders and steel guardrails.
export function RoadSurface({ kit, style, shoulders = [], rails = [], asphaltBrightness = 0.8, asphaltTint = "#ffffff", gravelTint = "#d8cdbb" }: RoadSurfaceProps) {
  const { left, width, tile } = style;
  const { road, gravel, rail } = useMemo(() => {
    const flat = (lift: number) => (_s: number, p: TrackPoint) => p.y + lift;
    return {
      road: kit.ribbon({ ds: 2, us: [left, left + width], y: flat(0), uv: (s, u) => [(u - left) / width, s / tile] }),
      gravel: shoulders.length
        ? mergeGeometries(shoulders.map(([a, b]) => kit.ribbon({ ds: 2, us: [a, b], y: flat(-0.02), uv: (s, u) => [u / 3, s / 3] })))
        : null,
      rail: rails.length
        ? mergeGeometries(rails.map((u) => kit.ribbon({ ds: 2, us: [u, u], y: (_s, p, _u, j) => p.y + (j ? 0.45 : 0.8) })))
        : null,
    };
  }, [kit, left, width, tile, shoulders, rails]);
  const asphalt = usePbrMaterial(ASPHALT, { tile: 4, size: [width, tile], normalScale: 0.8, brightness: asphaltBrightness, tint: asphaltTint });
  // Rougher than scanned: at a low sun or moon the loose stones otherwise glint
  // like a wet road.
  const gravelMat = usePbrMaterial(GRAVEL, { res: "1k", tile: 2, size: [3, 3], tint: gravelTint, roughness: 1.6 });
  const overlay = useMemo(() => overlayTexture(style), [style]);
  return (
    <>
      <mesh geometry={road} receiveShadow material={asphalt} />
      <mesh geometry={road} receiveShadow>
        <meshStandardMaterial map={overlay} transparent depthWrite={false} roughness={0.75} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-2} />
      </mesh>
      {gravel && <mesh geometry={gravel} receiveShadow material={gravelMat} />}
      {rail && (
        <>
          <mesh geometry={rail} castShadow>
            <meshStandardMaterial color="#b9bec2" metalness={0.7} roughness={0.35} side={DoubleSide} />
          </mesh>
          <RailPosts kit={kit} rails={rails} />
        </>
      )}
    </>
  );
}

function RailPosts({ kit, rails }: { kit: RoadKit; rails: number[] }) {
  const posts = useRef<InstancedMesh>(null);
  const spots = useMemo(() => kit.spotsEvery(POST_SPACING), [kit]);
  const { geometry, material } = useMemo(
    () => ({ geometry: new BoxGeometry(0.15, 0.76, 0.15), material: new MeshStandardMaterial({ color: "#8f9497", metalness: 0.5, roughness: 0.5 }) }),
    [],
  );
  useLayoutEffect(() => {
    const one = new Vector3(1, 1, 1);
    let i = 0;
    for (const u of rails) for (const s of spots) posts.current!.setMatrixAt(i++, kit.placeAlong(s, u + Math.sign(u) * 0.12, kit.track.at(s).y + 0.38, one));
    posts.current!.instanceMatrix.needsUpdate = true;
    posts.current!.computeBoundingSphere();
  }, [kit, rails, spots]);
  return <instancedMesh ref={posts} args={[geometry, material, spots.length * rails.length]} castShadow />;
}
