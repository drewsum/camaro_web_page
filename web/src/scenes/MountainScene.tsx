import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  type DirectionalLight,
  type InstancedMesh,
} from "three";
import CarContactShadows from "../components/CarContactShadows";
import CamaroModel from "../components/CamaroModel";
import { DriveProvider } from "../car/driveClock";
import type { SceneProps } from ".";
import { useCameraStart } from "./useCameraStart";
import { useExposure, useFarPlane } from "./common/renderer";
import { polyHavenHdri, type HdriSky } from "./common/hdri";
import { useSceneSky } from "./common/night";
import SkyReflections from "./common/SkyReflections";
import { GROUND_PERIOD, useSlopeGround } from "./common/slopeGround";
import { Forest, type ForestKind } from "./common/impostors";
import { BlobShadows, type Blob } from "./common/blobShadows";
import { conifer, deciduous } from "./capitol/Trees";
import { barkTexture, leafTexture } from "./capitol/textures";
import { FollowWorld, hash, Horizon, mod, newHere, RoadClearance, RoadKit, RoadSurface, smooth, TAU, type RoadStyle } from "./common/roadway";
import { MOUNTAIN_LENGTH as L, mountainTrack as track } from "./mountain/mountainTrack";

// Over a mountain pass: the road climbs through pine forest, cut into the
// mountainside on the driver's side (+u) with bare rock where it was blasted
// through, and drops away to a ravine on the other (-u) behind a guardrail.
// Two hairpins fold the road back across the ravine, and snow-capped peaks
// stand on the horizon.

const SKY = polyHavenHdri("kloofendal_48d_partly_cloudy_puresky");
const EXPOSURE = 0.85;
const FOG_NEAR = 180;
const FOG_FAR = 2000;

const kit = new RoadKit(track, -300, L + 1700);
const here = newHere();

const ROAD: RoadStyle = { left: -2, width: 8, tile: 20, centre: "double-yellow" };
const SHOULDERS: [number, number][] = [
  [-4.5, -2],
  [6, 7.2],
];
const RAILS = [-4.2];

// ---- Terrain ------------------------------------------------------------------

// Bumps that repeat every lap: k whole cycles per lap along the road.
const roll = (s: number, u: number, seed: number) =>
  0.5 * Math.sin((TAU * 5 * s) / L + u * 0.037 + seed) +
  0.3 * Math.sin((TAU * 11 * s) / L + 1.3 + u * 0.061 + seed) +
  0.2 * Math.sin((TAU * 23 * s) / L - u * 0.023 + seed * 2);

// The mountainside: a grassy ditch beside the shoulder (wide enough for the
// orbiting camera to stay out of the hill), a rock cutting rising 2.5 to
// 4.5 m, then forest climbing at about 25 degrees, steepening higher up.
function hillY(s: number, u: number, road: number) {
  const ditch = -0.5 * smooth(7.2, 8, u) * (1 - smooth(9.5, 10.5, u));
  const cut = (3.5 + roll(s, 0, 3)) * smooth(10.5, 12.8, u);
  const climb = Math.max(0, u - 13.5);
  return road - 0.3 + ditch + cut + climb * (0.42 + 0.0012 * climb) + 6 * roll(s, u, 0) * smooth(13.5, 40, u);
}

// The valley side: a steep embankment below the guardrail, then down into the
// ravine, deep enough to pass well under any other stretch of road.
function valleyY(s: number, u: number, road: number) {
  const d = Math.max(0, -u - 4.5);
  const drop = 0.8 * d + 0.12 * d * Math.min(d, 60) * 0.1 + 0.18 * Math.max(0, d - 60);
  return road - 0.3 - Math.min(140, drop + 3 * smooth(4.5, 9, -u)) + 4 * roll(s, u, 7) * smooth(10, 40, -u);
}

function groundY(s: number, u: number) {
  const road = track.at(s).y;
  if (u >= 7) return hillY(s, u, road);
  if (u <= -4.5) return valleyY(s, u, road);
  return road;
}

const HILL_US = [7, 7.6, 8.2, 9.5, 10.5, 11.6, 12.8, 13.5, 16, 21, 28, 38, 52, 70, 95, 125, 160, 200];
const VALLEY_US = [-4.5, -5.5, -7, -9, -12, -16, -22, -30, -42, -58, -80, -110, -150, -210, -300, -400];

function Terrain() {
  const geometries = useMemo(() => {
    const floor = [new Color("#4a5230"), new Color("#535a35"), new Color("#5d5a3a"), new Color("#47502f")];
    const color = (_y: number, _p: unknown, _u: number, j: number, key: number) => floor[Math.floor(hash(key, j + 31) * floor.length)];
    return [
      kit.ribbon({ ds: 4, us: HILL_US, y: (s, p, u) => hillY(s, u, p.y), color }),
      // Listed outward (decreasing u) and wound to match, so it faces up.
      kit.ribbon({ ds: 4, us: VALLEY_US, y: (s, p, u) => valleyY(s, u, p.y), color }),
    ];
  }, []);
  const { material, offset } = useSlopeGround({ dirt: [0.24, 0.42], rock: [0.42, 0.6], dirtTint: "#8f8a78", rockTint: "#9aa3ad" });
  useFrame(() => offset.set(mod(here.lap * track.lapShift.x, GROUND_PERIOD), 0, mod(here.lap * track.lapShift.z, GROUND_PERIOD)));
  return (
    <>
      {geometries.map((g, i) => (
        <mesh key={i} geometry={g} material={material} receiveShadow />
      ))}
    </>
  );
}

// ---- Forest -------------------------------------------------------------------------

const clearance = new RoadClearance(kit.centreline(4));

interface Tree {
  kind: number;
  matrix: Matrix4;
  color: Color;
  blob: Blob;
}

// Pines everywhere off the road, with a few aspens, thinning out on the
// steepest ground and kept clear of every stretch of road (it doubles back).
function plantForest(): Tree[] {
  const out: Tree[] = [];
  const up = new Vector3(0, 1, 0);
  const q = new Quaternion();
  const STEP = 5;
  for (let s = Math.ceil(kit.S0 / STEP) * STEP; s <= kit.S1; s += STEP) {
    const key = Math.round(mod(s, L) / STEP);
    for (let j = 0; j < 18; j++) {
      const r = hash(key, j);
      // Slots 0-7 spread up the mountainside and 8-13 down into the ravine;
      // 14-17 line the road on either side, just past the cutting and the
      // embankment, so the road always runs between trees.
      const edge = j >= 14;
      const side = edge ? (j < 16 ? 1 : -1) : j < 8 ? 1 : -1;
      const u = edge
        ? side > 0
          ? 14 + hash(key, j + 40) * 22
          : -(9 + hash(key, j + 40) * 18)
        : side * (10 + Math.pow(hash(key, j + 40), 1.25) * (side > 0 ? 190 : 150));
      // In clumps, with gaps.
      const clump = 0.5 + 0.5 * Math.sin((TAU * 37 * s) / L + u * 0.09) * Math.sin((TAU * 13 * s) / L - u * 0.05);
      if (r > (edge ? 0.4 + 0.4 * clump : 0.35 + 0.45 * clump)) continue;
      const ss = s + hash(key, j + 80) * STEP;
      const p = track.at(ss);
      const [x, , z] = track.offset(p, u);
      if (clearance.distance(x, z, 10) < 9.5) continue;
      const y = groundY(ss, u);
      // Bare rock where it's too steep to hold a tree.
      const slope = Math.abs(groundY(ss, u + 2) - groundY(ss, u - 2)) / 4;
      if (slope > 1.1) continue;
      const aspen = hash(key, j + 120) < 0.12;
      const h = aspen ? 9 + hash(key, j + 160) * 6 : 14 + hash(key, j + 160) * 14;
      const w = h * (aspen ? 0.6 : 0.42 + hash(key, j + 200) * 0.1);
      q.setFromAxisAngle(up, hash(key, j + 240) * TAU);
      const matrix = new Matrix4().compose(new Vector3(x, y - 0.3, z), q, new Vector3(w, h, w));
      const tint = new Color(1, 1, 1).multiplyScalar(0.6 + hash(key, j + 280) * 0.35);
      const n = new Vector3(Math.cos(p.heading), 0, -Math.sin(p.heading)).multiplyScalar(-(groundY(ss, u + 1) - groundY(ss, u - 1)) / 2).add(up).normalize();
      out.push({
        kind: aspen ? 2 : hash(key, j + 320) < 0.5 ? 0 : 1,
        matrix,
        color: tint,
        blob: { position: new Vector3(x, y, z), radius: w * (aspen ? 0.42 : 0.32), normal: n },
      });
    }
  }
  return out;
}

const trees = plantForest();

function Woods() {
  const kinds = useMemo(() => {
    const bark = new MeshStandardMaterial({ map: barkTexture(), roughness: 0.95 });
    const leaf = (seed: number, hues: [number, number]) =>
      new MeshStandardMaterial({ map: leafTexture(seed, hues), alphaTest: 0.45, side: DoubleSide, roughness: 0.85 });
    const shapes = [
      { ...conifer(301, 80, 2.3), leaf: leaf(311, [96, 128]) },
      { ...conifer(302, 70, 2.5), leaf: leaf(312, [104, 136]) },
      { ...deciduous(303, 85, 2.9, 4), leaf: leaf(313, [62, 92]) },
    ];
    return shapes.map((k, i): ForestKind => {
      k.leaves.computeBoundingBox();
      const unit = new Matrix4().makeScale(...(Array(3).fill(1 / k.leaves.boundingBox!.max.y) as [number, number, number]));
      const mine = trees.filter((t) => t.kind === i);
      return { wood: k.wood, leaves: k.leaves, bark, leaf: k.leaf, matrices: mine.map((t) => t.matrix.clone().multiply(unit)), colors: mine.map((t) => t.color) };
    });
  }, []);
  const blobs = useMemo(() => trees.map((t) => t.blob), []);
  return (
    <>
      <Forest kinds={kinds} near={120} />
      <BlobShadows blobs={blobs} opacity={0.45} />
    </>
  );
}

// ---- Hairpin chevrons --------------------------------------------------------------

const HAIRPINS = [760, 1850]; // where each hairpin's easement starts (see mountainTrack)

function chevronTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 160;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f2c21b";
  g.fillRect(0, 0, 128, 160);
  g.fillStyle = "#151515";
  g.beginPath();
  // Pointing right (the hairpins all turn right).
  g.moveTo(26, 20);
  g.lineTo(66, 20);
  g.lineTo(106, 80);
  g.lineTo(66, 140);
  g.lineTo(26, 140);
  g.lineTo(66, 80);
  g.closePath();
  g.fill();
  g.strokeStyle = "#151515";
  g.lineWidth = 6;
  g.strokeRect(3, 3, 122, 154);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function Chevrons() {
  const boards = useRef<InstancedMesh>(null);
  const posts = useRef<InstancedMesh>(null);
  const spots = useMemo(() => {
    const out: number[] = [];
    for (let lap = -1; lap <= 2; lap++)
      for (const h of HAIRPINS)
        for (let d = 8; d <= 150; d += 13) {
          const s = h + d + lap * L;
          if (s >= kit.S0 && s <= kit.S1) out.push(s);
        }
    return out;
  }, []);
  const map = useMemo(chevronTexture, []);
  useLayoutEffect(() => {
    const one = new Vector3(1, 1, 1);
    spots.forEach((s, i) => {
      const y = track.at(s).y;
      // On the outside of the bend, facing the oncoming driver.
      boards.current!.setMatrixAt(i, kit.placeAlong(s, 7.4, y + 1.45, one, Math.PI));
      posts.current!.setMatrixAt(i, kit.placeAlong(s, 7.4, y + 0.6, one, Math.PI));
    });
    for (const m of [boards.current!, posts.current!]) {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
  }, [spots]);
  return (
    <>
      <instancedMesh ref={boards} args={[undefined, undefined, spots.length]} castShadow>
        <planeGeometry args={[0.6, 0.75]} />
        <meshStandardMaterial map={map} roughness={0.5} side={DoubleSide} />
      </instancedMesh>
      <instancedMesh ref={posts} args={[undefined, undefined, spots.length]} castShadow>
        <boxGeometry args={[0.07, 1.2, 0.07]} />
        <meshStandardMaterial color="#8a8f93" metalness={0.5} roughness={0.5} />
      </instancedMesh>
    </>
  );
}

// ---- The range on the horizon ---------------------------------------------------------

// A ring of peaks 3.5 to 7 km off, too far for parallax, hazed toward the sky
// colour with distance (the scene's fog would hide them entirely) and white
// above the snow line.
function Range({ sky }: { sky: HdriSky }) {
  const { geometry, material } = useMemo(() => {
    const SEG = 320, ROWS = 7;
    const pos: number[] = [], col: number[] = [], haze: number[] = [], index: number[] = [];
    const rock = new Color("#5f6670"), snow = new Color("#f2f4f8"), c = new Color();
    // Whole numbers of peaks around the ring, so it closes without a seam.
    const ridge = (a: number, k: number) =>
      Math.abs(Math.sin(a * 3 + k)) * 0.5 + Math.abs(Math.sin(a * 7 + 2 * k)) * 0.3 + Math.abs(Math.sin(a * 18 + k * 3)) * 0.2;
    for (let j = 0; j <= ROWS; j++) {
      const t = j / ROWS;
      const r = 3500 + 3500 * t;
      for (let i = 0; i <= SEG; i++) {
        const a = (i / SEG) * TAU;
        // Peaks along the middle rows, falling to the valley floor at the edges.
        const lift = Math.sin(Math.PI * t) ** 1.5;
        const h = -350 + lift * (300 + 900 * ridge(a, j * 0.35) + 250 * ridge(a * 2, 1.7));
        pos.push(Math.cos(a) * r, h, Math.sin(a) * r);
        const snowy = smooth(520, 700, h + 80 * Math.sin(a * 23 + j));
        c.copy(rock).lerp(snow, snowy);
        col.push(c.r, c.g, c.b);
        haze.push(0.28 + 0.3 * t);
      }
    }
    for (let j = 0; j < ROWS; j++)
      for (let i = 0; i < SEG; i++) {
        const a = j * (SEG + 1) + i, b = a + SEG + 1;
        index.push(a, b, a + 1, a + 1, b, b + 1);
      }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
    geometry.setAttribute("color", new BufferAttribute(new Float32Array(col), 3));
    geometry.setAttribute("haze", new BufferAttribute(new Float32Array(haze), 1));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    const material = new MeshStandardMaterial({ vertexColors: true, roughness: 1, fog: false, side: DoubleSide });
    const hazeColor = { value: new Color() };
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uHaze = hazeColor;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float haze;\nvarying float vHaze;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvHaze = haze;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform vec3 uHaze;\nvarying float vHaze;")
        .replace("#include <fog_fragment>", "gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, vHaze);");
    };
    material.userData.haze = hazeColor;
    return { geometry, material };
  }, []);
  useLayoutEffect(() => {
    (material.userData.haze as { value: Color }).value.copy(sky.fog);
  }, [material, sky]);
  return <mesh geometry={geometry} material={material} />;
}

// ---- Scene ------------------------------------------------------------------------------

function MountainWorld({ lightsOn, domeOn, night = false }: SceneProps) {
  const sky = useSceneSky(SKY, -0.9, EXPOSURE, night);
  const sun = useRef<DirectionalLight>(null);
  return (
    <DriveProvider profile={track} roughness={1.3}>
      <fog attach="fog" args={[sky.fog, FOG_NEAR, FOG_FAR]} />
      <SkyReflections sky={sky} ground="#3d4230" />
      <directionalLight
        ref={sun}
        intensity={sky.sunIntensity}
        color={sky.sunColor}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-camera-far={120}
      />
      <Horizon sky={sky} here={here}>
        <Range sky={sky} />
      </Horizon>
      <FollowWorld kit={kit} here={here} sky={sky} sunLight={sun}>
        <RoadSurface kit={kit} style={ROAD} shoulders={SHOULDERS} rails={RAILS} asphaltBrightness={0.75} />
        <Terrain />
        <Woods />
        <Chevrons />
      </FollowWorld>
      <CamaroModel lightsOn={lightsOn} domeOn={domeOn} />
      <CarContactShadows position={[0, 0.01, 0]} opacity={0.45} scale={10} blur={2.2} far={2} />
    </DriveProvider>
  );
}

// Keeps the orbiting camera out of the hillside, which rises close beside the
// road: the car sits at the origin facing +Z with the road's +u along +X, so
// the ground under the camera is the terrain at (here.s + z, u = x). Runs
// after the orbit controls (priority -1) have moved the camera; a positive
// priority would switch off R3F's own rendering.
function CameraAboveGround() {
  useFrame(({ camera }) => {
    const road = track.at(here.s).y;
    const ground = groundY(here.s + camera.position.z, camera.position.x) - road;
    if (camera.position.y < ground + 1.2) camera.position.y = ground + 1.2;
  });
  return null;
}

export default function MountainScene(props: SceneProps) {
  useCameraStart(7, 3.2, -10.5);
  useFarPlane(9000); // the range on the horizon
  useExposure(EXPOSURE);
  return (
    <>
      <MountainWorld {...props} />
      <CameraAboveGround />
      <OrbitControls makeDefault enablePan={false} enableDamping minDistance={3} maxDistance={18} maxPolarAngle={Math.PI / 2.05} />
    </>
  );
}
