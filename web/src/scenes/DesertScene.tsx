import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  type DirectionalLight,
  type InstancedMesh,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import CarContactShadows from "../components/CarContactShadows";
import CamaroModel from "../components/CamaroModel";
import { DriveProvider } from "../car/driveClock";
import type { SceneProps } from ".";
import { useCameraStart } from "./useCameraStart";
import { useExposure, useFarPlane } from "./common/renderer";
import { polyHavenHdri, type HdriSky } from "./common/hdri";
import { NearestLights, useSceneSky } from "./common/night";
import SkyReflections from "./common/SkyReflections";
import { GROUND_PERIOD, useSlopeGround } from "./common/slopeGround";
import { Forest, type ForestKind } from "./common/impostors";
import { BlobShadows, type Blob } from "./common/blobShadows";
import { tiledInstances } from "./common/tiles";
import { mulberry32 } from "./common/periodic";
import { crown } from "./capitol/Trees";
import { leafTexture } from "./capitol/textures";
import { FollowWorld, hash, Horizon, mod, newHere, RoadClearance, RoadKit, RoadSurface, smooth, TAU, type RoadStyle } from "./common/roadway";
import { DESERT_LENGTH as L, desertTrack as track } from "./desert/desertTrack";

// Route 66 at sundown: a sun-bleached two-lane running dead straight across
// red desert toward the setting sun, past saguaros, creosote scrub and
// sandstone buttes, with a line of telephone poles alongside, mesas on the
// horizon and an old motel whose neon sign comes on after dark.

const SKY = polyHavenHdri("belfast_sunset_puresky");
const EXPOSURE = 0.8;
const FOG_NEAR = 400;
const FOG_FAR = 2800;

// Built further ahead than the other drives: the views are long out here.
const kit = new RoadKit(track, -300, L + 3000);
const here = newHere();

const ROAD: RoadStyle = { left: -2, width: 8, tile: 20, centre: "dashed-yellow", sunBleached: 0.7, seed: 21 };
const SHOULDERS: [number, number][] = [
  [-3.6, -2],
  [6, 7.6],
];

// ---- Terrain ------------------------------------------------------------------

// Bumps that repeat every lap: k whole cycles per lap along the road.
const wave = (s: number, k: number, u: number, f: number, phase: number) => Math.sin((TAU * k * s) / L + u * f + phase);

// Flat desert floor a little below the road, which runs on a low embankment,
// rolling gently further out and lifting into low ridges toward the edge.
function groundY(s: number, u: number, road: number) {
  const a = Math.abs(u);
  const bank = -0.7 * smooth(7, 11, a);
  const swell = (2.2 * wave(s, 9, u, 0.013, 0.4) + 1.2 * wave(s, 23, u, 0.031, 1.9) + 0.5 * wave(s, 61, u, 0.07, 2.7)) * smooth(10, 60, a);
  // Kept low: anything taller turns into pale blocks where the haze swallows it.
  const ridge = 10 * Math.pow(smooth(300, 900, a), 1.6) * (0.6 + 0.4 * wave(s, 5, u, 0.004, 0.2));
  return road - 0.3 + bank + swell + ridge;
}

const US = [-900, -650, -480, -350, -250, -170, -110, -70, -44, -26, -15, -10, -7, -3.6, 7.6, 10, 14, 22, 36, 58, 90, 140, 210, 300, 420, 560, 720, 900];

function Terrain() {
  const geometries = useMemo(() => {
    const sand = [new Color("#b9805a"), new Color("#c48c62"), new Color("#a8704c"), new Color("#c99a6e")];
    const color = (_y: number, _p: unknown, _u: number, j: number, key: number) => sand[Math.floor(hash(key, j + 13) * sand.length)];
    const split = US.indexOf(-3.6) + 1;
    return [US.slice(0, split), US.slice(split)].map((us) => kit.ribbon({ ds: 10, us, y: (s, p, u) => groundY(s, u, p.y), color }));
  }, []);
  // Bare dry ground everywhere (the "dirt" layer starts on the flat), rock on
  // the steep sides of washes.
  const { material, offset } = useSlopeGround({ dirt: [-1, -0.9], rock: [0.3, 0.55], dirtTint: "#e8b48a", rockTint: "#d08a62" });
  useFrame(() => offset.set(mod(here.lap * track.lapShift.x, GROUND_PERIOD), 0, mod(here.lap * track.lapShift.z, GROUND_PERIOD)));
  return (
    <>
      {geometries.map((g, i) => (
        <mesh key={i} geometry={g} material={material} receiveShadow />
      ))}
    </>
  );
}

// ---- Buttes -----------------------------------------------------------------------

// Banded sandstone: deep red at the base, paler bands up the cliffs, a cap
// rock on top.
const STRATA = ["#8e3f2a", "#a8553a", "#c2794f", "#b5674a", "#d29a6c", "#9c4a33", "#c58a62"].map((c) => new Color(c));

// A butte: a talus skirt, sheer banded cliffs and a flat cap, with the outline
// wobbling the same all the way up so the cliffs read as vertical walls.
function butte(seed: number) {
  const rand = mulberry32(seed);
  const SEG = 28;
  const rings: [number, number][] = [
    [1.7, 0], // r, y as fractions of radius and height
    [1.35, 0.12],
    [1.08, 0.3],
    [1.0, 0.36],
    [1.0, 0.92],
    [0.97, 0.97],
    [0.9, 1],
    [0, 1],
  ];
  const wobble = Array.from({ length: SEG }, () => 0.8 + rand() * 0.35);
  const pos: number[] = [], col: number[] = [], index: number[] = [];
  const c = new Color();
  rings.forEach(([r, y], j) => {
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * TAU;
      const w = wobble[i % SEG];
      pos.push(Math.cos(a) * r * w, y, Math.sin(a) * r * w);
      c.copy(STRATA[Math.floor(y * 9 + rand() * 0.6) % STRATA.length]).multiplyScalar(0.9 + rand() * 0.15);
      col.push(c.r, c.g, c.b);
    }
    if (j === 0) return;
    for (let i = 0; i < SEG; i++) {
      const a = (j - 1) * (SEG + 1) + i, b = a + SEG + 1;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new Float32BufferAttribute(col, 3));
  g.setIndex(index);
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  return flat;
}

const BUTTES_PER_LAP = 9;

function Buttes() {
  const group = useMemo(() => {
    const geometries = [butte(1), butte(2), butte(3)];
    const material = new MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
    // Fogged no more than three quarters of the way: the far ones stand past
    // the fog's end, where full fog would leave flat blocks of fog colour that
    // don't match the sky behind them.
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <fog_fragment>",
        "#ifdef USE_FOG\n  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, min(smoothstep(fogNear, fogFar, vFogDepth), 0.72));\n#endif",
      );
    };
    const matrices: Matrix4[][] = geometries.map(() => []);
    for (let lap = -1; lap <= 2; lap++)
      for (let k = 0; k < BUTTES_PER_LAP; k++) {
        const s = ((k + hash(k, 1) * 0.6) / BUTTES_PER_LAP) * L + lap * L;
        if (s < kit.S0 || s > kit.S1) continue;
        const side = hash(k, 2) < 0.5 ? -1 : 1;
        const u = side * (260 + hash(k, 3) * 420);
        const radius = 50 + hash(k, 4) * 90;
        const height = 45 + hash(k, 5) * 70;
        const p = track.at(s);
        const [x, , z] = track.offset(p, u);
        const m = new Matrix4().compose(
          new Vector3(x, groundY(s, u, p.y) - 4, z),
          new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), hash(k, 6) * TAU),
          new Vector3(radius, height, radius * (0.6 + hash(k, 7) * 0.5)),
        );
        matrices[k % geometries.length].push(m);
      }
    const g = tiledInstances(geometries[0], material, matrices[0], 2000, { castShadow: false, receiveShadow: false });
    geometries.slice(1).forEach((geo, i) => g.add(tiledInstances(geo, material, matrices[i + 1], 2000, { castShadow: false, receiveShadow: false })));
    return g;
  }, []);
  return <primitive object={group} />;
}

// ---- Mesas on the horizon ---------------------------------------------------------

// Flat-topped mesas 4 to 9 km off, hazed toward the sky (the scene's fog would
// hide them entirely).
function Mesas({ sky }: { sky: HdriSky }) {
  const { geometry, material } = useMemo(() => {
    const SEG = 480, ROWS = 6;
    const pos: number[] = [], col: number[] = [], haze: number[] = [], index: number[] = [];
    const c = new Color();
    const n = (a: number, k: number) => 0.5 + 0.3 * Math.sin(a * 5 + k) + 0.2 * Math.sin(a * 13.7 + 2 * k);
    for (let j = 0; j <= ROWS; j++) {
      const t = j / ROWS;
      const r = 4000 + 5000 * t;
      for (let i = 0; i <= SEG; i++) {
        const a = (i / SEG) * TAU;
        // Flat tops with sheer sides: the noise squeezed through a steep step.
        const plateau = smooth(0.52, 0.56, n(a, j * 0.7)) * (0.6 + 0.4 * n(a * 2, 3));
        const lift = Math.sin(Math.PI * t);
        const h = -120 + lift * (40 + 420 * plateau);
        pos.push(Math.cos(a) * r, h, Math.sin(a) * r);
        c.copy(STRATA[(i + j) % STRATA.length]).multiplyScalar(0.8);
        col.push(c.r, c.g, c.b);
        haze.push(0.45 + 0.35 * t);
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

// ---- Saguaros and scrub -----------------------------------------------------------

const clearance = new RoadClearance(kit.centreline(5));

function tube(from: Vector3, to: Vector3, r: number) {
  const dir = to.clone().sub(from);
  const len = dir.length();
  const g = new CylinderGeometry(r * 0.92, r, len, 10, 1).translate(0, len / 2, 0);
  g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize()));
  return g.translate(from.x, from.y, from.z);
}

// A saguaro 1 m tall (scaled per plant): a trunk with a rounded top and up to
// three arms that bend up from the trunk.
function saguaro(seed: number) {
  const rand = mulberry32(seed);
  const r = 0.045;
  const parts = [tube(new Vector3(0, -0.05, 0), new Vector3(0, 0.96, 0), r)];
  const cap = (at: Vector3) => {
    const s = new CylinderGeometry(r * 0.2, r * 0.92, r * 0.9, 10, 1).translate(at.x, at.y + r * 0.45, at.z);
    parts.push(s);
  };
  cap(new Vector3(0, 0.96, 0));
  const arms = Math.floor(rand() * 3.2);
  for (let k = 0; k < arms; k++) {
    const a = rand() * TAU;
    const out = new Vector3(Math.cos(a), 0, Math.sin(a));
    const h = 0.4 + rand() * 0.3;
    const reach = 0.12 + rand() * 0.06;
    const top = h + 0.15 + rand() * 0.25;
    const elbow = new Vector3(0, h, 0).addScaledVector(out, reach);
    parts.push(tube(new Vector3(0, h - 0.03, 0), elbow, r * 0.75));
    const tip = elbow.clone().setY(top);
    parts.push(tube(elbow, tip, r * 0.75));
    cap(tip);
  }
  return mergeGeometries(parts.map((p) => p.toNonIndexed()));
}

interface Plant {
  matrix: Matrix4;
  blob: Blob;
}

function scatter(slots: number, chance: number, near: number, far: number, size: () => number, salt: number): Plant[] {
  const out: Plant[] = [];
  const STEP = 10;
  for (let s = Math.ceil(kit.S0 / STEP) * STEP; s <= kit.S1; s += STEP) {
    const key = Math.round(mod(s, L) / STEP);
    for (let j = 0; j < slots; j++) {
      if (hash(key, j + salt) > chance) continue;
      const side = hash(key, j + salt + 7) < 0.5 ? -1 : 1;
      const u = side * (near + Math.pow(hash(key, j + salt + 11), 1.6) * (far - near));
      const ss = s + hash(key, j + salt + 17) * STEP;
      const p = track.at(ss);
      const [x, , z] = track.offset(p, u);
      if (clearance.distance(x, z, near) < near - 0.5) continue;
      const y = groundY(ss, u, p.y);
      const h = size();
      out.push({
        matrix: new Matrix4().compose(
          new Vector3(x, y - 0.1, z),
          new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), hash(key, j + salt + 23) * TAU),
          new Vector3(h, h, h),
        ),
        blob: { position: new Vector3(x, y, z), radius: h * 0.35 },
      });
    }
  }
  return out;
}

function Saguaros() {
  const { group, blobs } = useMemo(() => {
    const rand = mulberry32(5);
    const plants = scatter(3, 0.35, 12, 500, () => 5 + rand() * 7, 100);
    const material = new MeshStandardMaterial({ color: "#5d7342", roughness: 0.75 });
    const shapes = [saguaro(11), saguaro(12), saguaro(13), saguaro(14)];
    const group = tiledInstances(shapes[0], material, plants.filter((_, i) => i % 4 === 0).map((p) => p.matrix), 300);
    shapes.slice(1).forEach((g, k) =>
      group.add(tiledInstances(g, material, plants.filter((_, i) => i % 4 === k + 1).map((p) => p.matrix), 300)),
    );
    return { group, blobs: plants.map((p) => ({ ...p.blob, radius: p.blob.radius * 0.5 })) };
  }, []);
  return (
    <>
      <primitive object={group} />
      <BlobShadows blobs={blobs} opacity={0.35} />
    </>
  );
}

// Creosote and brittlebush: low leaf-card crowns, as impostors past 120 m.
function Scrub() {
  const { kinds, blobs } = useMemo(() => {
    const rand = mulberry32(9);
    const plants = scatter(6, 0.55, 9, 450, () => 1.2 + rand() * 1.8, 300);
    const shapeRand = mulberry32(61);
    const shapes = [0, 1].map((k) => crown(shapeRand, new Vector3(0, 0.42, 0), new Vector3(0.62 + k * 0.12, 0.42, 0.58), 30, 0.5));
    const leaves = [
      new MeshStandardMaterial({ map: leafTexture(71, [58, 84]), alphaTest: 0.45, side: DoubleSide, roughness: 0.9 }),
      new MeshStandardMaterial({ map: leafTexture(72, [44, 66]), alphaTest: 0.45, side: DoubleSide, roughness: 0.9 }),
    ];
    const bark = new MeshStandardMaterial({ color: "#5a4a3a" });
    const kinds: ForestKind[] = shapes.map((leavesGeometry, k) => ({
      leaves: leavesGeometry,
      bark,
      leaf: leaves[k],
      matrices: plants.filter((_, i) => i % 2 === k).map((p) => p.matrix),
      colors: plants.filter((_, i) => i % 2 === k).map(() => new Color(1, 1, 1).multiplyScalar(0.55 + rand() * 0.35)),
    }));
    return { kinds, blobs: plants.map((p) => ({ ...p.blob, radius: p.blob.radius * 1.6 })) };
  }, []);
  return (
    <>
      <Forest kinds={kinds} near={120} />
      <BlobShadows blobs={blobs} opacity={0.4} />
    </>
  );
}

// ---- Telephone line -------------------------------------------------------------------

const POLE_SPACING = 50;
const POLE_U = 15;

function TelephoneLine() {
  const poles = useRef<InstancedMesh>(null);
  const arms = useRef<InstancedMesh>(null);
  const spots = useMemo(() => kit.spotsEvery(POLE_SPACING), []);
  const { pole, arm, wood, wires } = useMemo(() => {
    const base = (s: number) => groundY(s, POLE_U, track.at(s).y);
    const pts: number[] = [];
    for (let i = 0; i < spots.length - 1; i++) {
      const [sa, sb] = [spots[i], spots[i + 1]];
      for (const side of [-0.8, 0.8]) {
        const end = (s: number) => new Vector3(...track.offset(track.at(s), POLE_U + side)).setY(base(s) + 8.3);
        const a = end(sa), b = end(sb);
        for (let k = 0; k < 8; k++) {
          const t0 = k / 8, t1 = (k + 1) / 8;
          const sag = (t: number) => -1.1 * 4 * t * (1 - t);
          const p0 = a.clone().lerp(b, t0), p1 = a.clone().lerp(b, t1);
          pts.push(p0.x, p0.y + sag(t0), p0.z, p1.x, p1.y + sag(t1), p1.z);
        }
      }
    }
    const wires = new BufferGeometry();
    wires.setAttribute("position", new Float32BufferAttribute(pts, 3));
    return {
      pole: new CylinderGeometry(0.1, 0.13, 9, 7).translate(0, 4.2, 0),
      arm: new CylinderGeometry(0.06, 0.06, 2, 5).rotateZ(Math.PI / 2).translate(0, 8.3, 0),
      wood: new MeshStandardMaterial({ color: "#6b5440", roughness: 0.95 }),
      wires,
    };
  }, [spots]);
  useLayoutEffect(() => {
    const one = new Vector3(1, 1, 1);
    spots.forEach((s, i) => {
      const m = kit.placeAlong(s, POLE_U, groundY(s, POLE_U, track.at(s).y), one);
      poles.current!.setMatrixAt(i, m);
      arms.current!.setMatrixAt(i, m);
    });
    for (const m of [poles.current!, arms.current!]) {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
  }, [spots]);
  return (
    <>
      <instancedMesh ref={poles} args={[pole, wood, spots.length]} castShadow />
      <instancedMesh ref={arms} args={[arm, wood, spots.length]} />
      <lineSegments geometry={wires}>
        <lineBasicMaterial color="#2a2522" transparent opacity={0.75} />
      </lineSegments>
    </>
  );
}

// ---- The motel ----------------------------------------------------------------------

const MOTEL_S = 2000;
const MOTEL_U = 34;
const SIGN_U = 11;

function signTexture(lit: boolean) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 768;
  const g = c.getContext("2d")!;
  g.fillStyle = lit ? "#000000" : "#1d5c63";
  g.fillRect(0, 0, 512, 768);
  if (!lit) {
    g.strokeStyle = "#e9e1cf";
    g.lineWidth = 14;
    g.strokeRect(14, 14, 484, 740);
  }
  const neon = (text: string, x: number, y: number, size: number, color: string, glow: string) => {
    g.font = `bold ${size}px 'Brush Script MT', 'Segoe Script', cursive`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    if (lit) {
      g.shadowColor = glow;
      g.shadowBlur = 28;
    }
    g.fillStyle = lit ? color : "#f1e6c9";
    g.fillText(text, x, y);
    g.shadowBlur = 0;
  };
  neon("Desert", 256, 150, 120, "#ff5f8f", "#ff2a6d");
  neon("Rose", 256, 290, 140, "#ff5f8f", "#ff2a6d");
  g.font = "bold 120px 'Arial Black', Impact, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  if (lit) {
    g.shadowColor = "#38f2ff";
    g.shadowBlur = 30;
  }
  g.fillStyle = lit ? "#7af6ff" : "#f1e6c9";
  g.fillText("MOTEL", 256, 470);
  g.shadowBlur = 0;
  g.font = "bold 58px 'Arial', sans-serif";
  if (lit) {
    g.shadowColor = "#ff3b2f";
    g.shadowBlur = 22;
  }
  g.fillStyle = lit ? "#ff6a4a" : "#e65b3b";
  g.fillText("VACANCY", 256, 640);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function Motel({ night }: { night: boolean }) {
  const copies = useMemo(() => {
    const out: { sign: Matrix4; building: Matrix4; light: Vector3 }[] = [];
    for (let lap = -1; lap <= 2; lap++) {
      const s = MOTEL_S + lap * L;
      if (s < kit.S0 || s > kit.S1) continue;
      const one = new Vector3(1, 1, 1);
      const p = track.at(s);
      // Both face the road (turned to face -u).
      const sign = kit.placeAlong(s, SIGN_U, groundY(s, SIGN_U, p.y), one, -Math.PI / 2);
      const building = kit.placeAlong(s + 20, MOTEL_U, groundY(s + 20, MOTEL_U, p.y), one, -Math.PI / 2);
      const [x, , z] = track.offset(p, SIGN_U - 1.5);
      out.push({ sign, building, light: new Vector3(x, groundY(s, SIGN_U, p.y) + 7, z) });
    }
    return out;
  }, []);
  const parts = useMemo(() => {
    const day = signTexture(false);
    const lit = signTexture(true);
    const m = (color: string, roughness = 0.85) => new MeshStandardMaterial({ color, roughness });
    return {
      face: new MeshStandardMaterial({ map: day, emissiveMap: lit, emissive: "#ffffff", emissiveIntensity: 0, roughness: 0.6 }),
      frame: m("#d9d3c4", 0.5),
      steel: new MeshStandardMaterial({ color: "#7d7f80", metalness: 0.6, roughness: 0.45 }),
      stucco: m("#e7d5b5"),
      trim: m("#2f7f86", 0.6),
      roof: m("#8c4a30"),
      door: m("#c9533a", 0.6),
      window: new MeshStandardMaterial({ color: "#1f2a30", emissive: "#ffcf7a", emissiveIntensity: 0, roughness: 0.2, metalness: 0.2 }),
    };
  }, []);
  useLayoutEffect(() => {
    parts.face.emissiveIntensity = night ? 2.2 : 0;
    parts.window.emissiveIntensity = night ? 0.9 : 0;
  }, [night, parts]);
  return (
    <>
      {copies.map(({ sign, building }, k) => (
        <group key={k}>
          <group matrixAutoUpdate={false} matrix={sign}>
            {[-1.1, 1.1].map((x) => (
              <mesh key={x} position={[x, 3.5, 0]} material={parts.steel} castShadow>
                <cylinderGeometry args={[0.12, 0.14, 7, 8]} />
              </mesh>
            ))}
            <mesh position={[0, 8.4, 0]} material={parts.frame} castShadow>
              <boxGeometry args={[3.5, 5.1, 0.35]} />
            </mesh>
            {[-0.18, 0.18].map((zOff, i) => (
              <mesh key={zOff} position={[0, 8.4, zOff]} rotation-y={i === 0 ? Math.PI : 0} material={parts.face}>
                <planeGeometry args={[3.3, 4.9]} />
              </mesh>
            ))}
          </group>
          <group matrixAutoUpdate={false} matrix={building}>
            {/* A row of rooms under a low tiled roof, doors facing the road. */}
            <mesh position={[0, 1.7, 0]} material={parts.stucco} castShadow receiveShadow>
              <boxGeometry args={[34, 3.4, 8]} />
            </mesh>
            <mesh position={[0, 3.55, 0.6]} rotation-x={-0.12} material={parts.roof} castShadow>
              <boxGeometry args={[35, 0.3, 10]} />
            </mesh>
            <mesh position={[0, 3.25, 4.02]} material={parts.trim}>
              <boxGeometry args={[34, 0.3, 0.06]} />
            </mesh>
            {Array.from({ length: 8 }, (_, i) => -14.5 + i * 4.15).map((x) => (
              <group key={x} position={[x, 0, 4.03]}>
                <mesh position={[0, 1.05, 0]} material={parts.door}>
                  <planeGeometry args={[0.95, 2.1]} />
                </mesh>
                <mesh position={[1.5, 1.5, 0]} material={parts.window}>
                  <planeGeometry args={[1.4, 1]} />
                </mesh>
              </group>
            ))}
          </group>
        </group>
      ))}
      {night && <NearestLights spots={copies.map((c) => c.light)} count={1} color="#ff7aa8" intensity={60} distance={30} />}
    </>
  );
}

// ---- Scene ------------------------------------------------------------------------------

function DesertWorld({ lightsOn, domeOn, night = false }: SceneProps) {
  // The sun low and nearly dead ahead along the road.
  const sky = useSceneSky(SKY, 0.25, EXPOSURE, night);
  const sun = useRef<DirectionalLight>(null);
  return (
    <DriveProvider profile={track}>
      <fog attach="fog" args={[sky.fog, FOG_NEAR, FOG_FAR]} />
      <SkyReflections sky={sky} ground="#6e4a35" />
      <directionalLight
        ref={sun}
        intensity={sky.sunIntensity}
        color={sky.sunColor}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-camera-far={140}
      />
      <Horizon sky={sky} here={here}>
        <Mesas sky={sky} />
      </Horizon>
      <FollowWorld kit={kit} here={here} sky={sky} sunLight={sun} sunDistance={60}>
        <RoadSurface kit={kit} style={ROAD} shoulders={SHOULDERS} asphaltBrightness={0.95} asphaltTint="#e6ddd2" gravelTint="#e2b58e" />
        <Terrain />
        <Buttes />
        <Saguaros />
        <Scrub />
        <TelephoneLine />
        <Motel night={night} />
      </FollowWorld>
      <CamaroModel lightsOn={lightsOn} domeOn={domeOn} />
      <CarContactShadows position={[0, 0.01, 0]} opacity={0.45} scale={10} blur={2.2} far={2} />
    </DriveProvider>
  );
}

export default function DesertScene(props: SceneProps) {
  useCameraStart(5.5, 2, -7.5);
  useFarPlane(12000);
  useExposure(EXPOSURE);
  return (
    <>
      <DesertWorld {...props} />
      <OrbitControls makeDefault enablePan={false} enableDamping minDistance={3} maxDistance={14} maxPolarAngle={Math.PI / 2.05} />
    </>
  );
}
