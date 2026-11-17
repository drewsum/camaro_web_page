import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, OrbitControls } from "@react-three/drei";
import { Bloom, EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { BackSide, CanvasTexture, Color, PlaneGeometry, RepeatWrapping, SRGBColorSpace, type ShaderMaterial } from "three";
import CamaroModel from "../components/CamaroModel";
import { DriveProvider, driveDistance, useDrive } from "../car/driveClock";
import type { SceneProps } from ".";
import { useCameraStart } from "./useCameraStart";
import { makePeriodicStrip, mulberry32, Scroll } from "./common/periodic";

// Night cruise through an endless synthwave landscape. The car sits at the
// origin facing +Z and the world scrolls toward -Z. Every scrolling layer is
// periodic and offset by (distance mod period), so the loop has no seam.

const SPEED = 25; // m/s, about 55 mph
const HORIZON = new Color("#3d0c52");
const FOG_NEAR = 60;
const FOG_FAR = 420;

const GRID_CELL = 4; // metres
const ROAD_WIDTH = 9;
const DASH_PERIOD = 12; // metres: 3 m dash, 9 m gap
const RIDGE_PERIOD = 250; // metres before the mountain profile repeats
const RIDGE_SEGMENT = 10;

// ---- Sky and sun ----------------------------------------------------------

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyFragment = /* glsl */ `
  uniform vec3 uHorizon;
  varying vec3 vDir;
  void main() {
    float h = max(vDir.y, 0.0);
    vec3 top = vec3(0.012, 0.004, 0.04);
    vec3 glow = vec3(0.9, 0.12, 0.45);
    vec3 col = mix(uHorizon, top, pow(h, 0.45));
    col += glow * exp(-h * 18.0) * 0.35;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const sunVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Yellow-to-pink disc with horizontal slits across the lower half that widen
// toward the horizon.
const sunFragment = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    if (length(p) > 1.0) discard;
    if (vUv.y < 0.55) {
      float band = fract(vUv.y * 16.0);
      if (band < (0.55 - vUv.y) * 1.3) discard;
    }
    vec3 col = mix(vec3(1.0, 0.12, 0.5), vec3(1.0, 0.82, 0.25), smoothstep(0.1, 0.95, vUv.y));
    gl_FragColor = vec4(col * 2.2, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function Sky() {
  const uniforms = useMemo(() => ({ uHorizon: { value: HORIZON } }), []);
  return (
    <>
      <mesh>
        <sphereGeometry args={[800, 32, 16]} />
        <shaderMaterial side={BackSide} depthWrite={false} uniforms={uniforms} vertexShader={skyVertex} fragmentShader={skyFragment} />
      </mesh>
      <mesh position={[0, 40, 600]} rotation-y={Math.PI}>
        <planeGeometry args={[200, 200]} />
        <shaderMaterial vertexShader={sunVertex} fragmentShader={sunFragment} />
      </mesh>
    </>
  );
}

// ---- Grid floor -----------------------------------------------------------

const gridVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

// Lines a few centimetres wide in world space but never thinner than ~1.5 px;
// they fade out where cells shrink below a pixel to avoid moire.
const gridFragment = /* glsl */ `
  uniform float uOffset;
  uniform float uCell;
  uniform vec3 uHorizon;
  uniform float uFogNear;
  uniform float uFogFar;
  varying vec3 vWorld;
  void main() {
    vec2 p = vec2(vWorld.x, vWorld.z + uOffset) / uCell;
    vec2 d = abs(fract(p - 0.5) - 0.5);
    vec2 fw = fwidth(p);
    vec2 l = 1.0 - smoothstep(vec2(0.012), vec2(0.012) + fw * 1.5, d);
    float line = max(l.x, l.y) * clamp(1.0 - max(fw.x, fw.y) * 1.5, 0.0, 1.0);
    vec3 col = mix(vec3(0.008, 0.0, 0.02), vec3(1.0, 0.18, 0.85) * 2.5, line);
    float fog = smoothstep(uFogNear, uFogFar, length(vWorld.xz - cameraPosition.xz));
    gl_FragColor = vec4(mix(col, uHorizon, fog), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function Grid() {
  const drive = useDrive();
  const material = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uOffset: { value: 0 },
      uCell: { value: GRID_CELL },
      uHorizon: { value: HORIZON },
      uFogNear: { value: FOG_NEAR },
      uFogFar: { value: FOG_FAR },
    }),
    [],
  );
  // R3F copies each uniform into the material, so update the material's own.
  useFrame(({ clock }) => {
    if (material.current) material.current.uniforms.uOffset.value = driveDistance(drive, clock.elapsedTime) % GRID_CELL;
  });
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0, 200]}>
      <planeGeometry args={[1400, 1400]} />
      <shaderMaterial ref={material} uniforms={uniforms} vertexShader={gridVertex} fragmentShader={gridFragment} />
    </mesh>
  );
}

// ---- Road -----------------------------------------------------------------

const ROAD_LENGTH = 900;

// One dash period of road, tiled along its length. Lit material so the
// headlight beams show on it; the lines glow through the emissive map.
function makeRoadTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 512;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0d0612";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#29e3ff";
  g.fillRect(6, 0, 4, c.height);
  g.fillRect(c.width - 10, 0, 4, c.height);
  g.fillStyle = "#ffd23a";
  g.fillRect(c.width / 2 - 2, 0, 4, c.height / 4);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(1, ROAD_LENGTH / DASH_PERIOD);
  t.anisotropy = 8;
  return t;
}

function Road() {
  const drive = useDrive();
  const texture = useMemo(makeRoadTexture, []);
  useFrame(({ clock }) => {
    // The plane's V axis runs toward -Z, so scrolling the road backward
    // past the car means a negative offset.
    texture.offset.y = -((driveDistance(drive, clock.elapsedTime) % DASH_PERIOD) / DASH_PERIOD);
  });
  return (
    // Centred a quarter-width toward +X (driver side) so the car is in the right lane.
    <mesh rotation-x={-Math.PI / 2} position={[ROAD_WIDTH / 4, 0.005, ROAD_LENGTH / 2 - 200]} receiveShadow>
      <planeGeometry args={[ROAD_WIDTH, ROAD_LENGTH]} />
      <meshStandardMaterial map={texture} emissiveMap={texture} emissive="#ffffff" emissiveIntensity={1.2} roughness={0.6} metalness={0.1} />
    </mesh>
  );
}

// ---- Mountains ------------------------------------------------------------

// A low-poly ridge 100 m wide, peaking mid-way across. Mirror with scale-x
// for the other side.
function makeRidge(seed: number) {
  const rand = mulberry32(seed);
  const cols = 10;
  return makePeriodicStrip({
    width: 100,
    cols,
    period: RIDGE_PERIOD,
    segment: RIDGE_SEGMENT,
    copies: 4,
    height: (i) => Math.pow(Math.sin((Math.PI * i) / cols), 0.9) * (8 + 32 * rand()),
  });
}

function Mountains() {
  const [left, right] = useMemo(() => [makeRidge(68), makeRidge(1968)], []);
  const ridge = (geo: PlaneGeometry, side: 1 | -1) => (
    <group position-x={side * 80} scale-x={side}>
      <mesh geometry={geo}>
        <meshStandardMaterial color="#14051f" roughness={0.9} flatShading />
      </mesh>
      <mesh geometry={geo} position-y={0.05}>
        <meshBasicMaterial color="#ff3cc8" wireframe />
      </mesh>
    </group>
  );
  return (
    <Scroll period={RIDGE_PERIOD} start={-120}>
      {ridge(left, 1)}
      {ridge(right, -1)}
    </Scroll>
  );
}

// ---- Scene ----------------------------------------------------------------

export default function OutrunScene({ domeOn }: SceneProps) {
  useCameraStart(-4, 1.8, -8);
  return (
    <DriveProvider speed={SPEED}>
      <fog attach="fog" args={[HORIZON, FOG_NEAR, FOG_FAR]} />
      <Environment resolution={256} environmentIntensity={0.6}>
        <Lightformer form="rect" intensity={3} color="#ff2fd0" position={[-6, 2, 0]} rotation-y={Math.PI / 2} scale={[10, 2, 1]} />
        <Lightformer form="rect" intensity={3} color="#29e3ff" position={[6, 2, 0]} rotation-y={-Math.PI / 2} scale={[10, 2, 1]} />
        <Lightformer form="rect" intensity={4} color="#ff9a3c" position={[0, 2, 10]} rotation-y={Math.PI} scale={[12, 3, 1]} />
        <Lightformer form="rect" intensity={0.5} color="#6a2bff" position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[10, 6, 1]} />
      </Environment>
      <ambientLight intensity={0.05} />
      <Sky />
      <Grid />
      <Road />
      <Mountains />
      <CamaroModel lightsOn domeOn={domeOn} />
      <ContactShadows position={[0, 0.01, 0]} opacity={0.8} scale={12} blur={2.4} far={3} />
      <OrbitControls makeDefault enablePan={false} enableDamping minDistance={3} maxDistance={14} maxPolarAngle={Math.PI / 2.05} />
      <EffectComposer multisampling={4}>
        <Bloom mipmapBlur luminanceThreshold={0.9} intensity={0.9} />
        <ToneMapping />
      </EffectComposer>
    </DriveProvider>
  );
}
