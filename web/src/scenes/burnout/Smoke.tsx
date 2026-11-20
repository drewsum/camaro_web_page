import { useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry, Color, NormalBlending, PerspectiveCamera, ShaderMaterial } from "three";

// Tyre smoke: soft puffs poured off the spinning rear tyres that balloon,
// rise and drift downwind, thinning out over several seconds. A big donut
// session leaves the whole pen hazy. Emitters are written each frame by
// whatever is making the smoke (positions in this component's frame).

export interface SmokeEmitter {
  x: number;
  y: number;
  z: number;
  rate: number; // puffs a second
  vx: number; // the tyre's sideways fling, m/s
  vz: number;
}

const POOL = 2200;
const LIFE = 7; // seconds

const vertex = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  uniform float uScale;
  varying float vAlpha;
  varying float vSeed;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = min(aSize * uScale / -mv.z, 1400.0);
    // Fade puffs that are right on top of the camera rather than fill the screen.
    vAlpha = aAlpha * smoothstep(0.6, 2.5, -mv.z);
    vSeed = float(gl_VertexID);
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  varying float vSeed;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d) * 2.0;
    if (r > 1.0) discard;
    // Lumpy and a touch darker underneath, like a real billow.
    float s = vSeed * 1.7;
    float lumps = 0.8 + 0.2 * sin(d.x * 13.0 + s) * sin(d.y * 11.0 - s * 1.3);
    float puff = (1.0 - smoothstep(0.2, 1.0, r)) * lumps;
    vec3 c = uColor * (0.88 + 0.2 * (0.5 - d.y));
    gl_FragColor = vec4(c, puff * vAlpha);
    #include <colorspace_fragment>
  }
`;

interface Puff {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  size: number;
}

export default function Smoke({ emitters, color, wind = [0.9, 0.35] }: { emitters: { current: SmokeEmitter[] }; color: string; wind?: [number, number] }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const state = useMemo(() => {
    const puffs: Puff[] = Array.from({ length: POOL }, () => ({ x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, age: LIFE, size: 0 }));
    const geometry = new BufferGeometry();
    const pos = new Float32Array(POOL * 3);
    const sizes = new Float32Array(POOL);
    const alphas = new Float32Array(POOL);
    geometry.setAttribute("position", new BufferAttribute(pos, 3));
    geometry.setAttribute("aSize", new BufferAttribute(sizes, 1));
    geometry.setAttribute("aAlpha", new BufferAttribute(alphas, 1));
    const material = new ShaderMaterial({
      uniforms: { uScale: { value: 1 }, uColor: { value: new Color(color) } },
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
    });
    return { puffs, geometry, material, pos, sizes, alphas, next: 0, owed: [] as number[] };
  }, [color]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const s = state;
    emitters.current.forEach((e, k) => {
      s.owed[k] = (s.owed[k] ?? 0) + dt * e.rate;
      while (s.owed[k] >= 1) {
        s.owed[k] -= 1;
        const p = s.puffs[s.next];
        s.next = (s.next + 1) % POOL;
        p.x = e.x + (Math.random() - 0.5) * 0.4;
        p.y = 0.2 + Math.random() * 0.25;
        p.z = e.z + (Math.random() - 0.5) * 0.4;
        p.vx = e.vx * (0.6 + Math.random() * 0.8) + (Math.random() - 0.5) * 1.2;
        p.vy = 0.3 + Math.random() * 0.9;
        p.vz = e.vz * (0.6 + Math.random() * 0.8) + (Math.random() - 0.5) * 1.2;
        p.age = 0;
        p.size = 0.7 + Math.random() * 0.6;
      }
    });

    const [wx, wz] = wind;
    for (let i = 0; i < POOL; i++) {
      const p = s.puffs[i];
      if (p.age >= LIFE) {
        s.alphas[i] = 0;
        continue;
      }
      p.age += dt;
      // Thrown off fast, then carried on the breeze and slowly rising.
      const drag = Math.exp(-1.6 * dt);
      p.vx = wx + (p.vx - wx) * drag;
      p.vz = wz + (p.vz - wz) * drag;
      p.vy = 0.35 + (p.vy - 0.35) * drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const t = p.age / LIFE;
      s.pos[i * 3] = p.x;
      s.pos[i * 3 + 1] = p.y;
      s.pos[i * 3 + 2] = p.z;
      s.sizes[i] = p.size * (1 + 6 * Math.sqrt(t));
      s.alphas[i] = 0.42 * Math.min(1, t * 10) * (1 - t) * (1 - t);
    }
    const g = s.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
    const fov = camera instanceof PerspectiveCamera ? camera.fov : 50;
    s.material.uniforms.uScale.value = (size.height * dpr) / 2 / Math.tan((fov * Math.PI) / 360);
  });

  return <points geometry={state.geometry} material={state.material} frustumCulled={false} renderOrder={3} />;
}
