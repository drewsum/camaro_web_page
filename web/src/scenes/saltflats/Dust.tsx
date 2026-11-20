import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry, NormalBlending, PerspectiveCamera, ShaderMaterial, type Color, type Points } from "three";
import { driveState, useDrive } from "../../car/driveClock";
import { RUN_LENGTH, TOP_SPEED } from "./speedRun";

// Salt dust kicked up behind the rear wheels: soft puffs spawned in proportion
// to speed (a wisp at launch, a rooster tail at 190 mph) that hang where they
// were thrown up while the car pulls away, billowing out and fading over a few
// seconds. Lives in the course's frame, so mount it inside the course group
// and pass the car's current position along the course.

const POOL = 900;
const LIFE = 4.5; // seconds
const REAR_AXLE = -1.35; // metres behind the car's origin
const TRACK_HALF = 0.76;

const vertex = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  uniform float uScale;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uScale / -mv.z;
    vAlpha = aAlpha;
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d) * 2.0;
    if (r > 1.0) discard;
    // A soft, lumpy puff rather than a disc.
    float puff = (1.0 - smoothstep(0.35, 1.0, r)) * (0.85 + 0.15 * sin(d.x * 17.0 + d.y * 23.0));
    gl_FragColor = vec4(uColor, puff * vAlpha);
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

export default function Dust({ course, color }: { course: { course: number }; color: Color }) {
  const drive = useDrive();
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const points = useRef<Points>(null);
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
      uniforms: { uScale: { value: 1 }, uColor: { value: color } },
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
    });
    return { puffs, geometry, material, pos, sizes, alphas, next: 0, owed: 0, last: 0 };
  }, [color]);

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.05);
    const s = state;
    const { speed } = driveState(drive, clock.elapsedTime);
    const here = course.course;
    // The course wrapped back to its start between runs: carry the dust back too.
    if (here < s.last - RUN_LENGTH / 2) for (const p of s.puffs) p.z -= RUN_LENGTH;
    s.last = here;

    // Spawn: none when crawling, up to ~200 a second flat out.
    const v = speed / TOP_SPEED;
    s.owed += dt * (speed > 3 ? 20 + 180 * v : 0);
    while (s.owed >= 1) {
      s.owed -= 1;
      const p = s.puffs[s.next];
      s.next = (s.next + 1) % POOL;
      const side = Math.random() < 0.5 ? -1 : 1;
      p.x = side * TRACK_HALF + (Math.random() - 0.5) * 0.3;
      p.y = 0.15 + Math.random() * 0.2;
      p.z = here + REAR_AXLE - Math.random() * 1.5;
      // Thrown up and out, and dragged a little way along behind the car.
      p.vx = side * (0.4 + Math.random() * 1.2 * v);
      p.vy = 0.6 + Math.random() * (1 + 2.5 * v);
      p.vz = speed * (0.12 + Math.random() * 0.1);
      p.age = 0;
      p.size = 0.6 + Math.random() * 0.6;
    }

    for (let i = 0; i < POOL; i++) {
      const p = s.puffs[i];
      if (p.age >= LIFE) {
        s.alphas[i] = 0;
        continue;
      }
      p.age += dt;
      // Air drag slows it quickly; then it drifts and settles.
      const drag = Math.exp(-2.2 * dt);
      p.vx *= drag;
      p.vz *= drag;
      p.vy = p.vy * drag - 0.25 * dt;
      p.x += p.vx * dt + 0.3 * dt; // a light crosswind
      p.y = Math.max(0.1, p.y + p.vy * dt);
      p.z += p.vz * dt;
      const t = p.age / LIFE;
      s.pos[i * 3] = p.x;
      s.pos[i * 3 + 1] = p.y;
      s.pos[i * 3 + 2] = p.z;
      s.sizes[i] = p.size * (1 + 7 * Math.sqrt(t));
      s.alphas[i] = 0.55 * Math.min(1, t * 8) * (1 - t) * (1 - t);
    }
    const g = s.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
    // Point size in pixels for a puff `aSize` metres across at distance 1.
    const fov = camera instanceof PerspectiveCamera ? camera.fov : 50;
    s.material.uniforms.uScale.value = (size.height * dpr) / 2 / Math.tan((fov * Math.PI) / 360);
  });

  return <points ref={points} geometry={state.geometry} material={state.material} frustumCulled={false} renderOrder={2} />;
}
