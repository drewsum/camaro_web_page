import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls } from "@react-three/drei";
import CarContactShadows from "../components/CarContactShadows";
import { Bloom, EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { ShaderPass } from "postprocessing";
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  ShaderMaterial,
} from "three";
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
// toward the horizon and slowly slide down it, inside a soft glow.
const sunFragment = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p) / 0.62; // the disc fills the middle of the quad
    // Halo around the disc, added over the sky.
    // Gone well before the quad's edge, so no square shows round it.
    float halo = exp(-max(r - 1.0, 0.0) * 4.0) * 0.5 * (1.0 - smoothstep(1.15, 1.55, r));
    vec3 col = mix(vec3(1.0, 0.08, 0.42), vec3(1.0, 0.72, 0.12), smoothstep(0.25, 0.8, vUv.y));
    float disc = 1.0 - smoothstep(0.985, 1.0, r);
    float y = p.y / 0.62; // -1 at the disc's bottom, 1 at its top
    if (y < 0.15) {
      float band = fract(y * 7.0 + uTime * 0.25);
      float gap = 0.06 + (0.15 - y) * 0.5;
      disc *= smoothstep(gap - 0.02, gap + 0.02, band);
    }
    vec3 c = col * 0.85 * disc + vec3(1.0, 0.15, 0.5) * halo * (1.0 - disc);
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function Sky() {
  const uniforms = useMemo(() => ({ uHorizon: { value: HORIZON } }), []);
  const sun = useRef<ShaderMaterial>(null);
  const sunUniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  useFrame(({ clock }) => {
    if (sun.current) sun.current.uniforms.uTime.value = clock.elapsedTime;
  });
  // Stars over the upper sky, thinning toward the horizon glow.
  const stars = useMemo(() => {
    const rand = mulberry32(77);
    const n = 1400;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const y = 0.12 + Math.pow(rand(), 0.7) * 0.88;
      const h = Math.sqrt(1 - y * y);
      pos.set([Math.cos(a) * h * 760, y * 760, Math.sin(a) * h * 760], i * 3);
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(pos, 3));
    return g;
  }, []);
  return (
    <>
      <mesh>
        <sphereGeometry args={[800, 32, 16]} />
        <shaderMaterial side={BackSide} depthWrite={false} uniforms={uniforms} vertexShader={skyVertex} fragmentShader={skyFragment} />
      </mesh>
      <points geometry={stars}>
        <pointsMaterial color="#ffd9f6" size={1.6} sizeAttenuation={false} fog={false} transparent opacity={0.8} depthWrite={false} />
      </points>
      {/* The disc's bottom sinks behind the far range (MountainRing). */}
      <mesh position={[0, 52, 620]} rotation-y={Math.PI}>
        <planeGeometry args={[270, 270]} />
        {/* Added over the sky, so the glow has no edge. */}
        <shaderMaterial ref={sun} uniforms={sunUniforms} vertexShader={sunVertex} fragmentShader={sunFragment} depthWrite={false} transparent blending={AdditiveBlending} />
      </mesh>
    </>
  );
}

// ---- The far range ----------------------------------------------------------

// Mountains all the way round the horizon, too far off to scroll: a dark
// silhouette with glowing contour lines and a neon ridge line, the sun
// setting behind it. Heights are sums of whole-number frequencies round the
// ring, so it closes without a seam.
const RING_R = 560;
const RING_SEGMENTS = 360;

const ringVertex = /* glsl */ `
  attribute float aTop; // 1 on the ridge, 0 at the foot
  varying float vTop;
  varying float vHeight;
  void main() {
    vTop = aTop;
    vHeight = position.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ringFragment = /* glsl */ `
  varying float vTop;
  varying float vHeight;
  void main() {
    vec3 base = mix(vec3(0.03, 0.0, 0.07), vec3(0.16, 0.02, 0.24), smoothstep(0.0, 1.0, vTop));
    // Contour lines every 9 m, brighter toward the top.
    float h = vHeight / 9.0;
    float d = abs(fract(h) - 0.5);
    float line = 1.0 - smoothstep(0.0, fwidth(h) * 1.2, d - 0.47);
    vec3 c = base + vec3(1.0, 0.2, 0.8) * line * 0.9 * smoothstep(0.05, 0.6, vTop);
    // The ridge itself.
    float ridge = smoothstep(0.965, 1.0, vTop);
    c += vec3(1.0, 0.35, 0.9) * ridge * 2.5;
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function MountainRing() {
  const geometry = useMemo(() => {
    const rand = mulberry32(84);
    const waves = Array.from({ length: 7 }, (_, k) => ({ f: [3, 5, 7, 11, 13, 19, 29][k], a: [26, 18, 14, 9, 7, 5, 3][k], p: rand() * 6.28 }));
    const pos: number[] = [];
    const top: number[] = [];
    const index: number[] = [];
    for (let i = 0; i <= RING_SEGMENTS; i++) {
      const a = (i / RING_SEGMENTS) * Math.PI * 2;
      let h = 34;
      for (const w of waves) h += w.a * Math.sin(w.f * a + w.p);
      // Lowest dead ahead, so the sun shows over a notch in the range.
      const ahead = Math.cos(a - Math.PI / 2); // +z is a = pi/2
      h = Math.max(6, h * (1 - 0.55 * Math.max(0, ahead) ** 6));
      const x = Math.cos(a) * RING_R;
      const z = Math.sin(a) * RING_R;
      pos.push(x, -2, z, x, h, z);
      top.push(0, 1);
      if (i < RING_SEGMENTS) {
        const v = i * 2;
        index.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute("aTop", new BufferAttribute(new Float32Array(top), 1));
    g.setIndex(index);
    return g;
  }, []);
  return (
    <mesh geometry={geometry}>
      <shaderMaterial vertexShader={ringVertex} fragmentShader={ringFragment} side={DoubleSide} />
    </mesh>
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
      <shaderMaterial ref={material} uniforms={uniforms} vertexShader={gridVertex} fragmentShader={gridFragment} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={4} />
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
      {/* Drawn over the grid by polygon offset, which counts in the depth buffer's
          own steps; 5 mm alone is lost in a phone's 16-bit depth buffer. */}
      <meshStandardMaterial
        map={texture}
        emissiveMap={texture}
        emissive="#ffffff"
        emissiveIntensity={1.2}
        roughness={0.6}
        metalness={0.1}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-4}
      />
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
      {/* Pushed back so the wireframe on its surface always wins the depth
          test (polygon offset doesn't apply to lines). */}
      <mesh geometry={geo}>
        <meshStandardMaterial color="#14051f" roughness={0.9} flatShading polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={4} />
      </mesh>
      <mesh geometry={geo}>
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

// ---- Post-processing ------------------------------------------------------

// Phone GPUs light in half precision, and a hot specular glint on the paint
// can overflow to Inf or NaN in the scene buffer. Bloom's blur then spreads
// that one pixel over the whole screen and the frame flashes black, so
// replace them before the bloom sees them. Checked on the bits because
// drivers may optimise isnan() away.
const sanitizeFragment = /* glsl */ `
  uniform sampler2D inputBuffer;
  varying vec2 vUv;
  bool finite(float x) {
    return (floatBitsToUint(x) & 0x7f800000u) != 0x7f800000u;
  }
  void main() {
    vec4 c = texture2D(inputBuffer, vUv);
    for (int i = 0; i < 4; i++) c[i] = finite(c[i]) ? clamp(c[i], 0.0, 64.0) : 0.0;
    gl_FragColor = c;
  }
`;

function makeSanitizePass() {
  return new ShaderPass(
    new ShaderMaterial({
      uniforms: { inputBuffer: { value: null } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = position.xy * 0.5 + 0.5;
          gl_Position = vec4(position.xy, 1.0, 1.0);
        }
      `,
      fragmentShader: sanitizeFragment,
      depthTest: false,
      depthWrite: false,
    }),
  );
}

// ---- Scene ----------------------------------------------------------------

export default function OutrunScene({ domeOn }: SceneProps) {
  useCameraStart(-4, 1.8, -8);
  const sanitize = useMemo(makeSanitizePass, []);
  const dpr = useThree((s) => s.viewport.dpr);
  return (
    <DriveProvider speed={SPEED}>
      <fog attach="fog" args={[HORIZON, FOG_NEAR, FOG_FAR]} />
      {/* Narrow neon strips over darkness, like the showroom's light panels:
          crisp bands in the paint and chrome without flooding the red. */}
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={6} color="#ff2fd0" position={[-6, 1.5, 0]} rotation-y={Math.PI / 2} scale={[12, 0.5, 1]} />
        <Lightformer form="rect" intensity={6} color="#29e3ff" position={[6, 1.5, 0]} rotation-y={-Math.PI / 2} scale={[12, 0.5, 1]} />
        <Lightformer form="circle" intensity={5} color="#ffb070" position={[0, 2.5, 12]} rotation-y={Math.PI} scale={3} />
        <Lightformer form="rect" intensity={2.5} color="#d9b8ff" position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[10, 1.2, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#8a3cff" position={[0, 5, -6]} rotation-x={Math.PI / 4} scale={[10, 0.8, 1]} />
      </Environment>
      <ambientLight intensity={0.05} />
      <Sky />
      <MountainRing />
      <Grid />
      <Road />
      <Mountains />
      <CamaroModel lightsOn domeOn={domeOn} />
      <CarContactShadows position={[0, 0.01, 0]} opacity={0.8} scale={12} blur={2.4} far={3} />
      <OrbitControls makeDefault enablePan={false} enableDamping minDistance={3} maxDistance={14} maxPolarAngle={Math.PI / 2.05} />
      {/* Multisampling resolves into a half-float buffer, costly on phones;
          on a dense display the pixels are small enough that 2x smooths the
          neon edges as well as 4x does. */}
      <EffectComposer multisampling={dpr >= 1.75 ? 2 : 4}>
        <primitive object={sanitize} />
        <Bloom mipmapBlur luminanceThreshold={0.9} intensity={0.9} />
        <ToneMapping />
      </EffectComposer>
    </DriveProvider>
  );
}
