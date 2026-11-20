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
  SRGBColorSpace,
  Vector3,
  type Group,
  type InstancedMesh,
} from "three";
import CarContactShadows from "../components/CarContactShadows";
import CamaroModel from "../components/CamaroModel";
import { DriveProvider, driveState, useDrive } from "../car/driveClock";
import type { SceneProps } from ".";
import { useCameraStart } from "./useCameraStart";
import { useExposure, useFarPlane } from "./common/renderer";
import { polyHavenHdri, useHdriSky, type HdriSky } from "./common/hdri";
import SkyReflections from "./common/SkyReflections";
import { smooth, TAU } from "./common/roadway";
import { MARKER_SPACING, RUN_LENGTH, speedRun } from "./saltflats/speedRun";

// Bonneville: a land-speed run down a marked course on the salt flats. The
// car launches from the start line, runs up to about 190 mph through the
// timed mile and brakes to a stop, again and again. Nothing but white salt to
// the horizon, cracked into polygons, a mirage shimmering where it meets the
// sky, and mountains that seem to float above it.

const SKY = polyHavenHdri("kloofendal_48d_partly_cloudy_puresky");
const EXPOSURE = 0.7;
const FOG_NEAR = 600;
const FOG_FAR = 6000;

// How far along the course the car is this frame (repeats every RUN_LENGTH).
const here = { course: 0 };

// The course is built from BEHIND to AHEAD past one run, so what's in view is
// always there as the car goes.
const BEHIND = -1500;
const AHEAD = RUN_LENGTH + 3500;

// ---- Salt ---------------------------------------------------------------------------

// Polygonal salt crust (cells with raised ridges between them), broad tonal
// patches, and far off a mirage: the ground turning into a shimmering
// reflection of the sky. Mapped in course coordinates, which repeat every
// RUN_LENGTH, so every pattern here divides it.
const saltHead = /* glsl */ `
  uniform float uCourse;
  uniform float uTime;
  uniform vec3 uHorizon;
  varying vec3 vSaltWorld;
  const float RUN = ${RUN_LENGTH.toFixed(1)};
  vec2 sHash2(vec2 c, float cells) {
    c = mod(c, cells);
    return fract(sin(vec2(dot(c, vec2(127.1, 311.7)), dot(c, vec2(269.5, 183.3)))) * 43758.5453);
  }
  float sNoise(vec2 p, float cell) {
    float cells = RUN / cell;
    vec2 q = p / cell, i = floor(q), f = fract(q);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = sHash2(i, cells).x, b = sHash2(i + vec2(1, 0), cells).x;
    float c = sHash2(i + vec2(0, 1), cells).x, d = sHash2(i + vec2(1, 1), cells).x;
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  // Distance to the nearest edge between Voronoi cells of size \`cell\`.
  float crack(vec2 p, float cell) {
    float cells = RUN / cell;
    vec2 q = p / cell, i = floor(q), f = fract(q);
    float d1 = 8.0, d2 = 8.0;
    for (int y = -1; y <= 1; y++)
      for (int x = -1; x <= 1; x++) {
        vec2 o = vec2(x, y);
        vec2 r = o + sHash2(i + o, cells) * 0.85 - f;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
      }
    return (sqrt(d2) - sqrt(d1)) * cell;
  }
`;

const saltColor = /* glsl */ `
  {
    vec2 p = vec2(vSaltWorld.x, vSaltWorld.z + uCourse);
    float dist = length(vSaltWorld - cameraPosition);
    // Ridges fade out with distance before they can shimmer.
    float detail = 1.0 - smoothstep(30.0, 160.0, dist);
    float ridge = 1.0 - smoothstep(0.0, 0.05, crack(p, 1.6));
    float tone = 0.9 + 0.08 * sNoise(p, 40.0) + 0.04 * sNoise(p, 8.0);
    vec3 salt = vec3(0.93, 0.92, 0.89) * tone;
    salt = mix(salt, vec3(0.78, 0.76, 0.72), ridge * 0.55 * detail);
    // Tyre tracks from earlier runs, faint along the course.
    float tracks = smoothstep(0.6, 0.0, abs(abs(p.x - 0.0) - 0.78)) * 0.06 * (0.6 + 0.4 * sNoise(p, 20.0));
    salt *= 1.0 - tracks;
    diffuseColor.rgb *= salt;
  }
`;

const mirage = /* glsl */ `
  {
    float dist = length(vSaltWorld - cameraPosition);
    vec2 p = vec2(vSaltWorld.x, vSaltWorld.z + uCourse);
    float shimmer = 0.9 + 0.1 * sin(p.x * 0.013 + uTime * 2.3 + 3.0 * sNoise(p + vec2(uTime * 6.0, 0.0), 50.0));
    float m = smoothstep(500.0, 2600.0, dist);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, uHorizon * shimmer, m * 0.92);
  }
`;

function Salt({ sky }: { sky: HdriSky }) {
  const { material, uniforms } = useMemo(() => {
    const uniforms = { uCourse: { value: 0 }, uTime: { value: 0 }, uHorizon: { value: new Color() } };
    const material = new MeshStandardMaterial({ color: "#ffffff", roughness: 0.82, metalness: 0, fog: false });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vSaltWorld;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSaltWorld = (modelMatrix * vec4(position, 1.0)).xyz;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\n" + saltHead)
        .replace("#include <color_fragment>", "#include <color_fragment>\n" + saltColor)
        .replace("#include <fog_fragment>", mirage);
    };
    return { material, uniforms };
  }, []);
  useLayoutEffect(() => {
    uniforms.uHorizon.value.copy(sky.fog);
  }, [sky, uniforms]);
  useFrame(({ clock }) => {
    uniforms.uCourse.value = here.course;
    uniforms.uTime.value = clock.elapsedTime;
  });
  return (
    <mesh rotation-x={-Math.PI / 2} material={material} receiveShadow>
      <planeGeometry args={[16000, 16000, 1, 1]} />
    </mesh>
  );
}

// ---- Mountains floating on the mirage ------------------------------------------------

function Mountains({ sky }: { sky: HdriSky }) {
  const { geometry, material } = useMemo(() => {
    const SEG = 400, ROWS = 6;
    const pos: number[] = [], col: number[] = [], haze: number[] = [], index: number[] = [];
    const rock = new Color("#6d6a73"), c = new Color();
    // Whole numbers of bumps around the ring, so it closes without a seam.
    const ridge = (a: number, k: number) =>
      0.55 * Math.abs(Math.sin(a * 3 + k)) + 0.3 * Math.abs(Math.sin(a * 7 + 2 * k)) + 0.15 * Math.abs(Math.sin(a * 16 + 3 * k));
    for (let j = 0; j <= ROWS; j++) {
      const t = j / ROWS;
      const r = 9000 + 5000 * t;
      for (let i = 0; i <= SEG; i++) {
        const a = (i / SEG) * TAU;
        // Ranges on either side and far ahead, open salt in between.
        const there = 0.25 + 0.75 * smooth(0.2, 0.6, Math.abs(Math.sin(a * 1.5 + 0.4)));
        const h = -60 + Math.sin(Math.PI * t) * there * (180 + 700 * ridge(a, j * 0.3));
        pos.push(Math.cos(a) * r, h, Math.sin(a) * r);
        c.copy(rock).multiplyScalar(0.85 + 0.2 * ridge(a * 3, 1));
        col.push(c.r, c.g, c.b);
        // Lost in the mirage at the foot, clearer up the slopes.
        haze.push(0.3 + 0.25 * t + 0.45 * (1 - smooth(-40, 260, h)));
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
        .replace("#include <fog_fragment>", "gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, clamp(vHaze, 0.0, 1.0));");
    };
    material.userData.haze = hazeColor;
    return { geometry, material };
  }, []);
  useLayoutEffect(() => {
    (material.userData.haze as { value: Color }).value.copy(sky.fog);
  }, [material, sky]);
  return <mesh geometry={geometry} material={material} rotation-y={sky.rotation.y} />;
}

// ---- The course ------------------------------------------------------------------------

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const markerTexture = (label: string) =>
  canvasTexture(256, 256, (g) => {
    g.fillStyle = "#f4f1e8";
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = "#1a1a1a";
    g.lineWidth = 14;
    g.strokeRect(7, 7, 242, 242);
    g.fillStyle = "#1a1a1a";
    g.font = `bold ${label.length > 2 ? 64 : 150}px 'Arial Black', Impact, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(label, 128, 136);
  });

const bannerTexture = (text: string, bg: string) =>
  canvasTexture(1024, 128, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, 1024, 128);
    g.fillStyle = "#ffffff";
    g.font = "bold 84px 'Arial Black', Impact, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 512, 68);
  });

// Repeats of a course position (0 to RUN_LENGTH) that fall within view.
function repeats(z: number) {
  const out: number[] = [];
  for (let k = -1; k <= 2; k++) {
    const zz = z + k * RUN_LENGTH;
    if (zz >= BEHIND && zz <= AHEAD) out.push(zz);
  }
  return out;
}

function Cones() {
  const mesh = useRef<InstancedMesh>(null);
  const spots = useMemo(() => {
    const out: Vector3[] = [];
    for (let z = Math.ceil(BEHIND / 100) * 100; z <= AHEAD; z += 100) for (const x of [-9, 9]) out.push(new Vector3(x, 0, z));
    return out;
  }, []);
  useLayoutEffect(() => {
    const m = new Matrix4();
    spots.forEach((p, i) => mesh.current!.setMatrixAt(i, m.makeTranslation(p.x, 0.35, p.z)));
    mesh.current!.instanceMatrix.needsUpdate = true;
    mesh.current!.computeBoundingSphere();
  }, [spots]);
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, spots.length]} castShadow>
      <coneGeometry args={[0.18, 0.7, 12]} />
      <meshStandardMaterial color="#ff6a1a" roughness={0.6} />
    </instancedMesh>
  );
}

function Markers() {
  const boards = useMemo(() => {
    const out: { z: number; label: string }[] = [];
    for (let k = 0; k < RUN_LENGTH / MARKER_SPACING; k++)
      for (const z of repeats(k * MARKER_SPACING)) out.push({ z, label: k === 0 ? "START" : String(k) });
    return out;
  }, []);
  const textures = useMemo(() => Object.fromEntries(["START", "1", "2", "3"].map((l) => [l, markerTexture(l)])), []);
  return (
    <>
      {boards.map(({ z, label }) => (
        <group key={z} position={[-15, 0, z]} rotation-y={Math.PI / 2 - 0.35}>
          {[-0.9, 0.9].map((x) => (
            <mesh key={x} position={[x, 1.6, 0]} castShadow>
              <boxGeometry args={[0.12, 3.2, 0.12]} />
              <meshStandardMaterial color="#d8d8d8" roughness={0.6} />
            </mesh>
          ))}
          <mesh position={[0, 3.4, 0.07]}>
            <planeGeometry args={[2.2, 2.2]} />
            <meshStandardMaterial map={textures[label]} roughness={0.7} side={DoubleSide} />
          </mesh>
        </group>
      ))}
    </>
  );
}

// The timed mile: between markers 2 and 3, with a banner arch at each end
// and the timing lights' tripods either side of the course.
function TimedMile() {
  const start = useMemo(() => bannerTexture("TIMED MILE", "#c8242b"), []);
  const finish = useMemo(() => bannerTexture("END OF TIMED MILE", "#1d3f8f"), []);
  const arches = useMemo(() => {
    const out: { z: number; map: CanvasTexture }[] = [];
    for (const z of repeats(2 * MARKER_SPACING)) out.push({ z, map: start });
    for (const z of repeats(3 * MARKER_SPACING)) out.push({ z, map: finish });
    return out;
  }, [start, finish]);
  return (
    <>
      {arches.map(({ z, map }) => (
        <group key={z} position={[0, 0, z]}>
          {[-13, 13].map((x) => (
            <group key={x} position={[x, 0, 0]}>
              <mesh position={[0, 3.5, 0]} castShadow>
                <cylinderGeometry args={[0.15, 0.18, 7, 10]} />
                <meshStandardMaterial color="#c9ccd0" metalness={0.6} roughness={0.35} />
              </mesh>
              {/* A timing light on its tripod, aimed across the course. */}
              <mesh position={[Math.sign(-x) * 1.2, 1.1, 0]} castShadow>
                <boxGeometry args={[0.35, 0.25, 0.25]} />
                <meshStandardMaterial color="#222" roughness={0.4} />
              </mesh>
              <mesh position={[Math.sign(-x) * 1.2, 0.5, 0]}>
                <cylinderGeometry args={[0.03, 0.18, 1, 3]} />
                <meshStandardMaterial color="#555" />
              </mesh>
            </group>
          ))}
          <mesh position={[0, 6.6, 0]} rotation-y={Math.PI}>
            <planeGeometry args={[26, 3.2]} />
            <meshStandardMaterial map={map} roughness={0.8} side={DoubleSide} />
          </mesh>
        </group>
      ))}
    </>
  );
}

// The pits at the start: support trucks, a trailer, canopies and flags.
function Pits() {
  const spots = useMemo(() => repeats(-40), []);
  const parts = useMemo(() => {
    const m = (color: string, roughness = 0.6, metalness = 0) => new MeshStandardMaterial({ color, roughness, metalness });
    return { trailer: m("#e8e6e1", 0.4, 0.3), stripe: m("#c8242b"), canopy: m("#2050a8", 0.8), frame: m("#bbbbbb", 0.4, 0.6), truck: m("#d9d4c7", 0.4, 0.4), dark: m("#202020", 0.7) };
  }, []);
  return (
    <>
      {spots.map((z) => (
        <group key={z} position={[-34, 0, z]}>
          <mesh position={[0, 1.9, 0]} material={parts.trailer} castShadow receiveShadow>
            <boxGeometry args={[2.6, 3, 14]} />
          </mesh>
          <mesh position={[1.31, 2.2, 0]} material={parts.stripe}>
            <boxGeometry args={[0.02, 0.4, 14]} />
          </mesh>
          {[-4, 4].map((dz) => (
            <mesh key={dz} position={[0, 0.45, dz]} rotation-z={Math.PI / 2} material={parts.dark}>
              <cylinderGeometry args={[0.45, 0.45, 2.4, 14]} />
            </mesh>
          ))}
          <mesh position={[0, 1.6, 9.6]} material={parts.truck} castShadow>
            <boxGeometry args={[2.4, 2.4, 3.6]} />
          </mesh>
          {/* A pop-up canopy beside the trailer. */}
          <group position={[6, 0, 2]}>
            <mesh position={[0, 2.7, 0]} material={parts.canopy} castShadow>
              <coneGeometry args={[3.4, 0.9, 4, 1]} />
            </mesh>
            {[
              [-2.3, -2.3],
              [2.3, -2.3],
              [-2.3, 2.3],
              [2.3, 2.3],
            ].map(([x, zz]) => (
              <mesh key={`${x}${zz}`} position={[x, 1.15, zz]} material={parts.frame}>
                <cylinderGeometry args={[0.04, 0.04, 2.3, 6]} />
              </mesh>
            ))}
          </group>
          {/* Flags on tall poles. */}
          {[-8, -5].map((dz, i) => (
            <group key={dz} position={[4, 0, dz]}>
              <mesh position={[0, 3, 0]} material={parts.frame}>
                <cylinderGeometry args={[0.04, 0.05, 6, 6]} />
              </mesh>
              <mesh position={[0, 5.3, 0.7]} material={i ? parts.stripe : parts.canopy}>
                <boxGeometry args={[0.02, 1, 1.4]} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
    </>
  );
}

function Course() {
  const group = useRef<Group>(null);
  const drive = useDrive();
  useFrame(({ clock }) => {
    const { distance } = driveState(drive, clock.elapsedTime);
    here.course = ((distance % RUN_LENGTH) + RUN_LENGTH) % RUN_LENGTH;
    if (group.current) group.current.position.z = -here.course;
  }, -1);
  const line = useMemo(() => new MeshStandardMaterial({ color: "#151515", roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), []);
  const startLines = useMemo(() => repeats(0), []);
  return (
    <group ref={group}>
      {/* The black guide line drivers follow down the course. */}
      <mesh rotation-x={-Math.PI / 2} position={[-3.2, 0.005, (BEHIND + AHEAD) / 2]} material={line}>
        <planeGeometry args={[0.3, AHEAD - BEHIND]} />
      </mesh>
      {startLines.map((z) => (
        <mesh key={z} rotation-x={-Math.PI / 2} position={[0, 0.006, z + 2.6]} material={line}>
          <planeGeometry args={[14, 0.5]} />
        </mesh>
      ))}
      <Cones />
      <Markers />
      <TimedMile />
      <Pits />
    </group>
  );
}

// ---- Scene ------------------------------------------------------------------------------

function SaltFlatsWorld({ lightsOn, domeOn }: SceneProps) {
  const sky = useHdriSky(SKY, -1.15, EXPOSURE);
  return (
    <DriveProvider profile={speedRun} roughness={0.6}>
      <fog attach="fog" args={[sky.fog, FOG_NEAR, FOG_FAR]} />
      <SkyReflections sky={sky} ground="#d9d6cf" />
      <directionalLight
        position={sky.sun.clone().multiplyScalar(40)}
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
      <Salt sky={sky} />
      <Mountains sky={sky} />
      <Course />
      <CamaroModel lightsOn={lightsOn} domeOn={domeOn} />
      <CarContactShadows position={[0, 0.01, 0]} opacity={0.4} scale={10} blur={2.2} far={2} />
    </DriveProvider>
  );
}

export default function SaltFlatsScene(props: SceneProps) {
  useCameraStart(6.5, 2.4, -9);
  useFarPlane(16000);
  useExposure(EXPOSURE);
  return (
    <>
      <SaltFlatsWorld {...props} />
      <OrbitControls makeDefault enablePan={false} enableDamping minDistance={3} maxDistance={18} maxPolarAngle={Math.PI / 2.05} />
    </>
  );
}
