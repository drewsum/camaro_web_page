import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { ContactShadows, Environment, OrbitControls, Sky } from "@react-three/drei";
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  MeshStandardMaterial,
  QuadraticBezierCurve3,
  RepeatWrapping,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
  type ShaderMaterial,
} from "three";
import CamaroModel from "../components/CamaroModel";
import { DriveProvider, driveDistance, useDrive } from "../car/driveClock";
import type { SceneProps } from ".";
import { useCameraStart } from "./useCameraStart";
import { useExposure, useFarPlane } from "./common/renderer";
import { fillInstances, makePeriodicStrip, mulberry32, paintByHeight, Scroll } from "./common/periodic";

// Afternoon cruise down a two-lane California coast road: cliffs dropping to
// the Pacific on the passenger side (-X), golden hills on the driver side (+X).
// The car sits at the origin facing +Z; every scrolling layer is periodic.

const SPEED = 24; // m/s, about 54 mph
const SUN = new Vector3(-0.55, 0.28, 0.78).normalize();
const HAZE = new Color("#c9d6e0");
const FOG_NEAR = 150;
const FOG_FAR = 1300;
const SEA_LEVEL = -35;

// Across X: ocean-side shoulder [-4, -2], road [-2, 6], land-side shoulder [6, 8].
const ROAD_LEFT = -2;
const ROAD_WIDTH = 8;
const NEAR_Z = -150; // how far behind the car the scenery starts
const LENGTH = 1500; // static strips run from NEAR_Z for this far

// ---- Road -----------------------------------------------------------------

const ROAD_TILE = 8; // metres of road per texture repeat

// 32 px per metre: asphalt grain, white edge lines, double yellow centre.
function makeRoadTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#3b3c3e";
  g.fillRect(0, 0, 256, 256);
  const rand = mulberry32(7);
  for (let n = 0; n < 9000; n++) {
    const v = 40 + Math.floor(rand() * 45);
    g.fillStyle = `rgb(${v},${v},${v + 2})`;
    g.fillRect(rand() * 256, rand() * 256, 1 + rand() * 2, 1 + rand() * 2);
  }
  g.fillStyle = "#e9e7df";
  g.fillRect(8, 0, 4, 256);
  g.fillRect(256 - 12, 0, 4, 256);
  g.fillStyle = "#e3b02a";
  g.fillRect(122, 0, 3, 256);
  g.fillRect(131, 0, 3, 256);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(1, LENGTH / ROAD_TILE);
  t.anisotropy = 8;
  return t;
}

function Road() {
  const drive = useDrive();
  const texture = useMemo(makeRoadTexture, []);
  useFrame(({ clock }) => {
    texture.offset.y = -((driveDistance(drive, clock.elapsedTime) % ROAD_TILE) / ROAD_TILE);
  });
  const strip = (x0: number, x1: number, color: string) => (
    <mesh rotation-x={-Math.PI / 2} position={[(x0 + x1) / 2, -0.01, NEAR_Z + LENGTH / 2]} receiveShadow>
      <planeGeometry args={[x1 - x0, LENGTH]} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  );
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[ROAD_LEFT + ROAD_WIDTH / 2, 0, NEAR_Z + LENGTH / 2]} receiveShadow>
        <planeGeometry args={[ROAD_WIDTH, LENGTH]} />
        <meshStandardMaterial map={texture} roughness={0.85} />
      </mesh>
      {strip(-4, ROAD_LEFT, "#8d8474")}
      {strip(ROAD_LEFT + ROAD_WIDTH, 8, "#8d8474")}
    </>
  );
}

// ---- Guardrail and telephone poles ---------------------------------------

const POST_SPACING = 2.5;
const POLE_SPACING = 50;

function Guardrail() {
  const posts = useRef<InstancedMesh>(null);
  const count = Math.ceil(900 / POST_SPACING);
  useLayoutEffect(() => {
    fillInstances(posts.current!, count, (n, m) => {
      m.setPosition(-3.62, 0.38, n * POST_SPACING);
      return true;
    });
  }, [count]);
  return (
    <>
      <mesh position={[-3.5, 0.62, NEAR_Z + LENGTH / 2]} castShadow>
        <boxGeometry args={[0.06, 0.32, LENGTH]} />
        <meshStandardMaterial color="#b9bec2" metalness={0.7} roughness={0.35} />
      </mesh>
      <Scroll period={POST_SPACING} start={NEAR_Z}>
        <instancedMesh ref={posts} args={[undefined, undefined, count]} castShadow>
          <boxGeometry args={[0.15, 0.76, 0.15]} />
          <meshStandardMaterial color="#8f9497" metalness={0.5} roughness={0.5} />
        </instancedMesh>
      </Scroll>
    </>
  );
}

function TelephonePoles() {
  const count = Math.ceil((LENGTH - 300) / POLE_SPACING);
  const { pole, arm, wire } = useMemo(() => {
    const wireCurve = (x: number) =>
      new QuadraticBezierCurve3(
        new Vector3(x, 9.3, 0),
        new Vector3(x, 8.0, POLE_SPACING / 2),
        new Vector3(x, 9.3, POLE_SPACING),
      );
    return {
      pole: new CylinderGeometry(0.11, 0.14, 10, 8).translate(0, 4.5, 0),
      arm: new BoxGeometry(2.2, 0.12, 0.12).translate(0, 9.2, 0),
      wire: [-0.95, 0.95].map((x) => new TubeGeometry(wireCurve(x), 16, 0.012, 4)),
    };
  }, []);
  const wood = useMemo(() => new MeshStandardMaterial({ color: "#5b4632", roughness: 0.9 }), []);
  const cable = useMemo(() => new MeshStandardMaterial({ color: "#1d1d1d", roughness: 0.6 }), []);
  return (
    <Scroll period={POLE_SPACING} start={NEAR_Z}>
      {Array.from({ length: count }, (_, n) => (
        <group key={n} position={[10, -0.4, n * POLE_SPACING]}>
          <mesh geometry={pole} material={wood} castShadow />
          <mesh geometry={arm} material={wood} />
          {wire.map((w, i) => (
            <mesh key={i} geometry={w} material={cable} />
          ))}
        </group>
      ))}
    </Scroll>
  );
}

// ---- Cliffs and hills -----------------------------------------------------

const CLIFF_PERIOD = 240;
const CLIFF_SEGMENT = 8;

// Grassy lip at road level dropping through rock to below sea level, 40 m
// wide. Built toward +X; mirrored onto the ocean side.
function makeCliff() {
  const cols = 10;
  const rand = mulberry32(1968);
  const geo = makePeriodicStrip({
    width: 40,
    cols,
    period: CLIFF_PERIOD,
    segment: CLIFF_SEGMENT,
    copies: 7,
    height: (i, k) => {
      if (i === 0) return -0.1;
      const u = i / cols;
      const t = (k * CLIFF_SEGMENT * 2 * Math.PI) / CLIFF_PERIOD;
      const recess = 0.12 * Math.sin(t * 3) + 0.08 * Math.sin(t * 7 + 1);
      const drop = Math.min(1, Math.max(0, (u - 0.05 + recess) / 0.5));
      return -40 * drop * drop * (3 - 2 * drop) + (rand() - 0.5) * 4 * u;
    },
  });
  const grass = new Color("#8d8a4a");
  const rock = [new Color("#7a6550"), new Color("#937a5e"), new Color("#5f5244")];
  return paintByHeight(geo, 2, (y, r) => (y > -1.2 ? grass.clone().offsetHSL(0, 0, (r - 0.5) * 0.06) : rock[Math.floor(r * 3)]));
}

const HILL_COLS = 24;
const HILL_WIDTH = 300;
const HILL_PERIOD = 300;
const HILL_SEGMENT = 10;
const HILL_ROWS = HILL_PERIOD / HILL_SEGMENT;
const HILL_COPIES = 6;

function hillHeights() {
  const rand = mulberry32(540);
  return Array.from({ length: HILL_ROWS }, (_, k) =>
    Array.from({ length: HILL_COLS + 1 }, (_, i) => {
      if (i === 0) return -0.4;
      const u = i / HILL_COLS;
      const t = (k / HILL_ROWS) * 2 * Math.PI;
      const rolling = 0.5 * Math.sin(2 * t + i * 0.55) + 0.3 * Math.sin(3 * t + i * 1.1 + 1.3) + 0.2 * Math.sin(5 * t - i * 0.8);
      return Math.min(1, u * 6) * (2 + 8 * u + 90 * u * u + (6 + 25 * u) * rolling + 3 * rand());
    }),
  );
}

function Hills() {
  const oaks = useRef<InstancedMesh>(null);
  const { heights, hills, oak } = useMemo(() => {
    const heights = hillHeights();
    const gold = [new Color("#b39a5c"), new Color("#a68d50"), new Color("#c2a96a")];
    const hills = paintByHeight(
      makePeriodicStrip({
        width: HILL_WIDTH,
        cols: HILL_COLS,
        period: HILL_PERIOD,
        segment: HILL_SEGMENT,
        copies: HILL_COPIES,
        height: (i, k) => heights[k][i],
      }),
      11,
      (_, r) => gold[Math.floor(r * 3)],
    );
    return { heights, hills, oak: new IcosahedronGeometry(1, 0) };
  }, []);
  useLayoutEffect(() => {
    const rand = mulberry32(99);
    // Decide per (column, row) once so every period gets the same trees.
    const chosen = heights.map((row) => row.map(() => rand()));
    const perCopy = HILL_ROWS * (HILL_COLS + 1);
    const scale = new Vector3();
    fillInstances(oaks.current!, perCopy * HILL_COPIES, (n, m) => {
      const c = Math.floor(n / perCopy);
      const k = Math.floor((n % perCopy) / (HILL_COLS + 1));
      const i = n % (HILL_COLS + 1);
      const r = chosen[k][i];
      if (i < 3 || r > 0.14) return false;
      const s = 0.8 + r * 10;
      scale.set(2.6 * s, 1.5 * s, 2.6 * s);
      m.makeScale(scale.x, scale.y, scale.z);
      m.setPosition((i * HILL_WIDTH) / HILL_COLS, heights[k][i] + 0.6 * s, (c * HILL_ROWS + k) * HILL_SEGMENT);
      return true;
    });
  }, [heights]);
  return (
    <group position-x={8}>
      <mesh geometry={hills} receiveShadow>
        <meshStandardMaterial vertexColors roughness={1} flatShading />
      </mesh>
      <instancedMesh ref={oaks} args={[oak, undefined, HILL_ROWS * (HILL_COLS + 1) * HILL_COPIES]} castShadow>
        <meshStandardMaterial color="#4a5528" roughness={0.95} flatShading />
      </instancedMesh>
    </group>
  );
}

function Landscape() {
  const cliff = useMemo(makeCliff, []);
  return (
    <>
      <Scroll period={CLIFF_PERIOD} start={NEAR_Z}>
        <mesh geometry={cliff} position-x={-4} scale-x={-1} receiveShadow>
          <meshStandardMaterial vertexColors roughness={1} flatShading />
        </mesh>
      </Scroll>
      <Scroll period={HILL_PERIOD} start={NEAR_Z}>
        <Hills />
      </Scroll>
    </>
  );
}

// ---- Ocean ----------------------------------------------------------------

// Waves are built from integer wavenumbers over OCEAN_PERIOD metres, so the
// pattern repeats exactly along Z and can scroll by (distance mod period).
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
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const oceanFragment = /* glsl */ `
  uniform float uTime;
  uniform float uOffset;
  uniform vec3 uSun;
  uniform vec3 uHaze;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform vec3 uWaves[${WAVES.length}];
  varying vec3 vWorld;
  const float TAU = 6.2831853;
  void main() {
    vec2 p = vec2(vWorld.x, vWorld.z + uOffset);
    float dist = length(vWorld - cameraPosition);
    // Fade the ripples out with distance so far water doesn't shimmer.
    float detail = 1.0 - smoothstep(80.0, 700.0, dist);
    vec2 grad = vec2(0.0);
    for (int n = 0; n < ${WAVES.length}; n++) {
      vec2 k = uWaves[n].xy * (TAU / ${OCEAN_PERIOD.toFixed(1)});
      float omega = sqrt(9.81 * length(k));
      grad += uWaves[n].z * k * cos(dot(k, p) - omega * uTime);
    }
    vec3 nrm = normalize(vec3(-grad.x * detail * 0.35, 1.0, -grad.y * detail * 0.35));
    vec3 view = normalize(cameraPosition - vWorld);
    float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(nrm, view), 0.0), 5.0);
    vec3 deep = vec3(0.02, 0.11, 0.17);
    vec3 sky = vec3(0.55, 0.7, 0.85);
    vec3 col = mix(deep, sky, fresnel);
    float glint = pow(max(dot(reflect(-view, nrm), uSun), 0.0), 400.0);
    col += vec3(1.0, 0.88, 0.7) * glint * 8.0;
    gl_FragColor = vec4(mix(col, uHaze, smoothstep(uFogNear, uFogFar, dist)), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function Ocean() {
  const drive = useDrive();
  const material = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uOffset: { value: 0 },
      uSun: { value: SUN },
      uHaze: { value: HAZE },
      uFogNear: { value: FOG_NEAR },
      uFogFar: { value: FOG_FAR },
      uWaves: { value: WAVES.map(([x, z, a]) => new Vector3(x, z, a)) },
    }),
    [],
  );
  // R3F copies each uniform into the material, so update the material's own.
  useFrame(({ clock }) => {
    const u = material.current?.uniforms;
    if (!u) return;
    u.uTime.value = clock.elapsedTime;
    u.uOffset.value = driveDistance(drive, clock.elapsedTime) % OCEAN_PERIOD;
  });
  return (
    <mesh rotation-x={-Math.PI / 2} position={[-2020, SEA_LEVEL, 1500]}>
      <planeGeometry args={[4000, 5000]} />
      <shaderMaterial ref={material} uniforms={uniforms} vertexShader={oceanVertex} fragmentShader={oceanFragment} />
    </mesh>
  );
}

// ---- Scene ----------------------------------------------------------------

export default function CoastScene({ lightsOn, domeOn }: SceneProps) {
  useCameraStart(5.5, 2, -7.5);
  useFarPlane(6000); // the ocean has to reach the horizon
  useExposure(0.45); // the physical sky is far brighter than the studio
  const sunPosition = useMemo(() => SUN.clone().multiplyScalar(1000), []);
  return (
    <DriveProvider speed={SPEED}>
      <fog attach="fog" args={[HAZE, FOG_NEAR, FOG_FAR]} />
      <Sky sunPosition={sunPosition} turbidity={5} rayleigh={1.2} mieCoefficient={0.004} mieDirectionalG={0.85} />
      <Environment resolution={256} environmentIntensity={0.6}>
        <Sky sunPosition={sunPosition} turbidity={5} rayleigh={1.2} mieCoefficient={0.004} mieDirectionalG={0.85} />
      </Environment>
      <hemisphereLight args={["#cfe0f0", "#8a7a55", 0.5]} />
      <directionalLight position={SUN.clone().multiplyScalar(60)} intensity={2.6} color="#ffe6c4" />
      <Road />
      <Guardrail />
      <TelephonePoles />
      <Landscape />
      <Ocean />
      <CamaroModel lightsOn={lightsOn} domeOn={domeOn} />
      <ContactShadows position={[0, 0.01, 0]} opacity={0.65} scale={12} blur={2.2} far={3} />
      <OrbitControls makeDefault enablePan={false} enableDamping minDistance={3} maxDistance={14} maxPolarAngle={Math.PI / 2.05} />
    </DriveProvider>
  );
}
