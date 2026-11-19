import { useMemo } from "react";
import {
  BufferGeometry,
  Color,
  DoubleSide,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Group,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from "three";
import { mulberry32 } from "./periodic";
import { tiledInstances } from "./tiles";
import { conifer, crown, deciduous } from "../capitol/Trees";
import { barkTexture, leafTexture } from "../capitol/textures";

// Farmland around an otherwise empty field, so the ground doesn't run
// straight out to a bare horizon: a ring of low hills rising into the haze,
// woodlots, hedgerows and lone trees, bushes, a farmstead, a power line and
// some round hay bales. Kept cheap: the trees and bushes are a few hundred
// leaf cards at most, instanced in tiles (culled block by block), and the
// hills are a single ring of a few thousand triangles.

export interface CountrysideProps {
  seed: number;
  centre: [number, number]; // x, z the hills ring and the tree placement are centred on
  hills: { from: number; to: number; height: number };
  trees: { from: number; to: number; woodlots: number; hedgerows: number; singles: number };
  clear: (x: number, z: number) => boolean; // true where nothing may stand (the show, the strip)
  farm: { x: number; z: number; rotation: number };
  powerLine: { from: [number, number]; to: [number, number] };
  bales: { x: number; z: number; spread: number; count: number };
}

// ---- Noise ------------------------------------------------------------------

function hash2(x: number, y: number, s: number) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function noise(x: number, y: number, s: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const fbm = (x: number, y: number, s: number) => 0.55 * noise(x, y, s) + 0.3 * noise(x * 2.1, y * 2.1, s + 7) + 0.15 * noise(x * 4.3, y * 4.3, s + 13);
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Ground height: flat inside the ring, rolling hills rising toward its edge.
function heightAt(p: CountrysideProps, x: number, z: number) {
  const { from, to, height } = p.hills;
  const r = Math.hypot(x - p.centre[0], z - p.centre[1]);
  const rise = smoothstep(from, from + (to - from) * 0.65, r);
  if (rise <= 0) return 0;
  const n = fbm(x / 320, z / 320, p.seed);
  return rise * height * (0.2 + 1.2 * n * n);
}

// ---- Hills --------------------------------------------------------------------

const MEADOW = ["#56702f", "#4b6528", "#66793a", "#7d7f44", "#5d6b33", "#8a8450"].map((c) => new Color(c));

function hillsGeometry(p: CountrysideProps) {
  const SEGMENTS = 256, ROWS = 16;
  const { from, to } = p.hills;
  const pos: number[] = [], col: number[] = [], index: number[] = [];
  const c = new Color();
  for (let j = 0; j <= ROWS; j++) {
    const r = from * Math.pow(to / from, j / ROWS);
    for (let i = 0; i <= SEGMENTS; i++) {
      const a = (i / SEGMENTS) * Math.PI * 2;
      const x = p.centre[0] + Math.cos(a) * r, z = p.centre[1] + Math.sin(a) * r;
      // Sunk a little so the flat inner edge stays under the field.
      pos.push(x, heightAt(p, x, z) - 0.4, z);
      // A patchwork of meadows and stubble, darker in the hollows.
      const field = Math.floor(fbm(x / 180, z / 180, p.seed + 40) * MEADOW.length * 1.3) % MEADOW.length;
      c.copy(MEADOW[field]).multiplyScalar(0.82 + 0.3 * fbm(x / 60, z / 60, p.seed + 50));
      col.push(c.r, c.g, c.b);
    }
  }
  for (let j = 0; j < ROWS; j++)
    for (let i = 0; i < SEGMENTS; i++) {
      const a = j * (SEGMENTS + 1) + i, b = a + SEGMENTS + 1;
      index.push(a, a + 1, b, a + 1, b + 1, b);
    }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new Float32BufferAttribute(col, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

// ---- Trees ----------------------------------------------------------------------

// The Square's leaf-card trees, with fewer and bigger cards: these are only
// ever seen from 70 m or more. Planted with a scale in metres of height.
const BROADLEAF_KINDS = 3;
// Instances are grouped in square tiles this many metres across, each culled
// as a whole: big enough to keep the draw calls down, small enough to skip
// what's behind the camera.
const TILE = 320;

interface Planted {
  matrix: Matrix4;
  color: Color;
}

function treeSpots(p: CountrysideProps) {
  const rand = mulberry32(p.seed * 31 + 7);
  const broadleaf: Planted[] = [], conifer: Planted[] = [], shrubs: Matrix4[] = [];
  const up = new Vector3(0, 1, 0), q = new Quaternion();
  const plant = (x: number, z: number, coniferous: boolean, scale = 1) => {
    if (p.clear(x, z)) return;
    const r = Math.hypot(x - p.centre[0], z - p.centre[1]);
    if (r < p.trees.from || r > p.hills.to * 0.8) return;
    const h = (coniferous ? 11 + rand() * 9 : 8 + rand() * 8) * scale;
    const w = h * (0.8 + rand() * 0.4);
    q.setFromAxisAngle(up, rand() * Math.PI * 2);
    const m = new Matrix4().compose(new Vector3(x, heightAt(p, x, z) - 0.2, z), q, new Vector3(w, h, w));
    // A little lighter or darker, yellower or bluer, than its neighbours.
    const tint = new Color(1, 1, 1).lerp(new Color().setHSL(0.2 + rand() * 0.14, 0.5, 0.45), 0.35).multiplyScalar(0.55 + rand() * 0.35);
    (coniferous ? conifer : broadleaf).push({ matrix: m, color: tint });
  };
  const shrub = (x: number, z: number) => {
    if (p.clear(x, z)) return;
    const s = 1.4 + rand() * 2;
    q.setFromAxisAngle(up, rand() * Math.PI * 2);
    shrubs.push(new Matrix4().compose(new Vector3(x, heightAt(p, x, z) - 0.1, z), q, new Vector3(s, s * (0.8 + rand() * 0.4), s)));
  };
  const around = (min: number, max: number) => {
    const a = rand() * Math.PI * 2, r = min + rand() * (max - min);
    return [p.centre[0] + Math.cos(a) * r, p.centre[1] + Math.sin(a) * r];
  };
  // Woodlots: clumps of trees with shrubs along their edges.
  for (let k = 0; k < p.trees.woodlots; k++) {
    const [cx, cz] = around(p.trees.from + 30, p.trees.to);
    const size = 20 + rand() * 45, pines = rand() < 0.3 ? 0.8 : rand() * 0.25;
    const count = Math.round(size * (0.5 + rand() * 0.4));
    for (let n = 0; n < count; n++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * size;
      plant(cx + Math.cos(a) * d, cz + Math.sin(a) * d * 0.7, rand() < pines);
    }
    for (let n = 0; n < 6; n++) {
      const a = rand() * Math.PI * 2;
      shrub(cx + Math.cos(a) * (size + 3), cz + Math.sin(a) * (size * 0.7 + 3));
    }
  }
  // Hedgerows: broken lines of trees and bushes along old field edges.
  for (let k = 0; k < p.trees.hedgerows; k++) {
    const [x0, z0] = around(p.trees.from, p.trees.to);
    const a = rand() * Math.PI, len = 150 + rand() * 300;
    for (let s = 0; s < len; s += 5 + rand() * 6) {
      if (noise(s / 40, k, p.seed + 9) < 0.35) continue; // gaps
      const x = x0 + Math.cos(a) * s + (rand() - 0.5) * 3, z = z0 + Math.sin(a) * s + (rand() - 0.5) * 3;
      if (rand() < 0.55) plant(x, z, rand() < 0.1, 0.85);
      else shrub(x, z);
    }
  }
  // Lone field trees, and copses up on the hills.
  for (let k = 0; k < p.trees.singles; k++) {
    const [x, z] = around(p.trees.from, p.trees.to);
    plant(x, z, rand() < 0.15, 1.15);
  }
  for (let k = 0; k < Math.round(p.trees.woodlots * 0.8); k++) {
    const [cx, cz] = around(p.hills.from, p.hills.to * 0.6);
    for (let n = 0; n < 30; n++) plant(cx + (rand() - 0.5) * 90, cz + (rand() - 0.5) * 60, rand() < 0.4, 1.2);
  }
  return { broadleaf, conifer, shrubs };
}

function Trees({ spots }: { spots: ReturnType<typeof treeSpots> }) {
  const groups = useMemo(() => {
    const bark = new MeshStandardMaterial({ map: barkTexture(), roughness: 0.95 });
    const leaf = (seed: number, hues: [number, number]) =>
      new MeshStandardMaterial({ map: leafTexture(seed, hues), alphaTest: 0.45, side: DoubleSide, roughness: 0.85 });
    const kinds = [
      ...Array.from({ length: BROADLEAF_KINDS }, (_, i) => ({ ...deciduous(70 + i, 85, 2.9, 4), leafMat: leaf(80 + i, [70 + i * 10, 104 + i * 8]) })),
      { ...conifer(90, 70, 2.3), leafMat: leaf(95, [118, 148]) },
    ];
    const planted: Planted[][] = kinds.map(() => []);
    spots.broadleaf.forEach((t, n) => planted[n % BROADLEAF_KINDS].push(t));
    planted[BROADLEAF_KINDS] = spots.conifer;
    const group = new Group();
    kinds.forEach((k, i) => {
      if (!planted[i].length) return;
      k.leaves.computeBoundingBox();
      const unit = new Matrix4().makeScale(...(Array(3).fill(1 / k.leaves.boundingBox!.max.y) as [number, number, number]));
      const matrices = planted[i].map((t) => t.matrix.clone().multiply(unit));
      const colors = planted[i].map((t) => t.color);
      group.add(
        tiledInstances(k.wood!, bark, matrices, TILE, { castShadow: false, receiveShadow: false }),
        tiledInstances(k.leaves, k.leafMat, matrices, TILE, { castShadow: false, receiveShadow: false, colors }),
      );
    });
    return group;
  }, [spots]);
  return <primitive object={groups} />;
}

// Bushes: just a low crown of leaf cards, a few dozen triangles each.
function Bushes({ matrices }: { matrices: Matrix4[] }) {
  const group = useMemo(() => {
    const rand = mulberry32(61);
    const g = new Group();
    const material = new MeshStandardMaterial({ map: leafTexture(66, [88, 120]), alphaTest: 0.45, side: DoubleSide, roughness: 0.9 });
    const kinds = [0, 1].map((k) => crown(rand, new Vector3(0, 0.42, 0), new Vector3(0.62 + k * 0.1, 0.42, 0.55), 34, 0.55));
    kinds.forEach((geometry, k) => {
      const mine = matrices.filter((_, n) => n % kinds.length === k);
      if (mine.length) g.add(tiledInstances(geometry, material, mine, TILE, { castShadow: false, receiveShadow: false }));
    });
    return g;
  }, [matrices]);
  return <primitive object={group} />;
}

// ---- Farm and clutter ------------------------------------------------------------

function prism(w: number, h: number, l: number) {
  // A gable roof: triangular cross-section w wide and h tall, l long (along z).
  const g = new CylinderGeometry(1, 1, l, 3, 1).rotateX(Math.PI / 2).rotateZ(Math.PI / 2);
  // Unit triangle has its apex at y = 1 and base at y = -0.5, half width √3/2.
  g.scale(w / Math.sqrt(3), h / 1.5, 1).translate(0, h / 3, 0);
  return g;
}

function Farm({ x, z, rotation, y }: { x: number; z: number; rotation: number; y: number }) {
  const parts = useMemo(() => {
    const m = (color: string, roughness = 0.9) => new MeshStandardMaterial({ color, roughness });
    return {
      barn: m("#8a2f24"),
      trim: m("#e9e4d8"),
      roof: m("#4a4c4f", 0.7),
      silo: m("#b9b6ad", 0.5),
      house: m("#efece4"),
      barnRoof: prism(13, 5, 23),
      houseRoof: prism(10, 3.5, 13),
    };
  }, []);
  return (
    <group position={[x, y, z]} rotation-y={rotation}>
      {/* Barn */}
      <mesh position-y={3.5} material={parts.barn}>
        <boxGeometry args={[12, 7, 22]} />
      </mesh>
      <mesh position-y={7} material={parts.roof} geometry={parts.barnRoof} />
      <mesh position={[0, 2.6, 11.05]} material={parts.trim}>
        <boxGeometry args={[4.5, 5.2, 0.1]} />
      </mesh>
      {/* Silos */}
      {[
        [9, -4, 3, 16],
        [9, 3.5, 2.4, 13],
      ].map(([sx, sz, r, h]) => (
        <group key={sx + sz} position={[sx, 0, sz]}>
          <mesh position-y={h / 2} material={parts.silo}>
            <cylinderGeometry args={[r, r, h, 16]} />
          </mesh>
          <mesh position-y={h} material={parts.roof}>
            <sphereGeometry args={[r, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
        </group>
      ))}
      {/* Farmhouse */}
      <group position={[-22, 0, 8]} rotation-y={0.2}>
        <mesh position-y={3} material={parts.house}>
          <boxGeometry args={[9, 6, 12]} />
        </mesh>
        <mesh position-y={6} material={parts.roof} geometry={parts.houseRoof} />
      </group>
    </group>
  );
}

// Wooden poles with a cross-arm every 45 m, three sagging wires between them.
function PowerLine({ p }: { p: CountrysideProps }) {
  const { poles, wires } = useMemo(() => {
    const [ax, az] = p.powerLine.from, [bx, bz] = p.powerLine.to;
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 45));
    const dir = new Vector3(bx - ax, 0, bz - az).normalize();
    const side = new Vector3(-dir.z, 0, dir.x);
    const heading = Math.atan2(dir.x, dir.z);
    const tops: Vector3[][] = [];
    const poles: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i <= n; i++) {
      const x = ax + ((bx - ax) * i) / n, z = az + ((bz - az) * i) / n;
      if (p.clear(x, z)) continue;
      const y = heightAt(p, x, z);
      poles.push({ x, y, z });
      tops.push([-1.1, 0, 1.1].map((o) => new Vector3(x, y + 9.4, z).addScaledVector(side, o)));
    }
    const pts: number[] = [];
    for (let i = 0; i + 1 < tops.length; i++) {
      for (let w = 0; w < 3; w++) {
        const a = tops[i][w], b = tops[i + 1][w];
        if (a.distanceTo(b) > 60) continue;
        for (let k = 0; k < 8; k++) {
          const t0 = k / 8, t1 = (k + 1) / 8;
          const sag = (t: number) => -1.2 * 4 * t * (1 - t);
          const p0 = a.clone().lerp(b, t0), p1 = a.clone().lerp(b, t1);
          pts.push(p0.x, p0.y + sag(t0), p0.z, p1.x, p1.y + sag(t1), p1.z);
        }
      }
    }
    const wires = new BufferGeometry();
    wires.setAttribute("position", new Float32BufferAttribute(pts, 3));
    return { poles: poles.map((q) => ({ ...q, heading })), wires };
  }, [p]);
  const wood = useMemo(() => new MeshStandardMaterial({ color: "#5b4a3a", roughness: 1 }), []);
  return (
    <>
      {poles.map((q, i) => (
        <group key={i} position={[q.x, q.y, q.z]} rotation-y={q.heading}>
          <mesh position-y={5} material={wood}>
            <cylinderGeometry args={[0.12, 0.16, 10, 6]} />
          </mesh>
          <mesh position-y={9.3} material={wood}>
            <boxGeometry args={[2.6, 0.15, 0.15]} />
          </mesh>
        </group>
      ))}
      <lineSegments geometry={wires}>
        <lineBasicMaterial color="#55575a" transparent opacity={0.7} />
      </lineSegments>
    </>
  );
}

// Round bales left in a mown field.
function Bales({ p }: { p: CountrysideProps }) {
  const mesh = useMemo(() => {
    const rand = mulberry32(p.seed + 99);
    const { x, z, spread, count } = p.bales;
    const geometry = new CylinderGeometry(0.75, 0.75, 1.25, 14).rotateZ(Math.PI / 2).translate(0, 0.72, 0);
    const material = new MeshStandardMaterial({ color: "#c2a35c", roughness: 1 });
    const matrices: Matrix4[] = [];
    for (let n = 0; n < count; n++) {
      const bx = x + (rand() - 0.5) * spread, bz = z + (rand() - 0.5) * spread;
      if (p.clear(bx, bz)) continue;
      matrices.push(new Matrix4().compose(new Vector3(bx, heightAt(p, bx, bz) - 0.05, bz), new Quaternion().setFromEuler(new Euler(0, rand() * Math.PI, 0)), new Vector3(1, 1, 1)));
    }
    return tiledInstances(geometry, material, matrices, 200, { castShadow: false, receiveShadow: false });
  }, [p]);
  return <primitive object={mesh} />;
}

// ---- All together ----------------------------------------------------------------

// Pass a constant config: everything is built once from it.
export default function Countryside({ config: props }: { config: CountrysideProps }) {
  const hills = useMemo(() => hillsGeometry(props), [props]);
  const spots = useMemo(() => treeSpots(props), [props]);
  return (
    <>
      {/* Everything here is far beyond the sun's shadow map around the cars. */}
      <mesh geometry={hills}>
        <meshStandardMaterial vertexColors roughness={1} />
      </mesh>
      <Trees spots={spots} />
      <Farm {...props.farm} y={heightAt(props, props.farm.x, props.farm.z)} />
      <PowerLine p={props} />
      <Bales p={props} />
      <Bushes matrices={spots.shrubs} />
    </>
  );
}

