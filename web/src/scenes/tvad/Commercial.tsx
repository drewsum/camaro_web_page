import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  InstancedMesh,
  MathUtils,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type PerspectiveCamera,
} from "three";
import CamaroModel from "../../components/CamaroModel";
import CarContactShadows from "../../components/CarContactShadows";
import { mulberry32 } from "../common/periodic";
import { bannerTexture, checkerTexture, placardTexture, signTexture, type Caption } from "./textures";

// The commercial on the TV: the Camaro on the showroom floor of a generic
// small-town dealership (made up: "Hometown Motors"), cut together from shots
// at different angles, ending on its price. The car sits at the origin, nose
// toward +Z. The showroom spans x ±10, z -9 to 7, with its glass front at
// z = 7 facing the lot.

export interface Shot {
  length: number; // seconds
  from: [number, number, number];
  to: [number, number, number];
  lookFrom: [number, number, number];
  lookTo: [number, number, number];
  fov: number;
  caption: Caption;
  hood?: number; // radians the hood is propped open
  lights?: boolean;
}

const orbit = (deg: number, r: number, y: number): [number, number, number] => [
  Math.sin(MathUtils.degToRad(deg)) * r,
  y,
  Math.cos(MathUtils.degToRad(deg)) * r,
];

export const SHOTS: Shot[] = [
  // Outside on the lot, easing toward the showroom window.
  { length: 5.5, from: [8, 1.4, 30], to: [5, 1.3, 22], lookFrom: [0, 3.6, 0], lookTo: [0, 2.6, 0], fov: 44, caption: "presents" },
  // Low front three-quarter, pushing in.
  { length: 4.5, from: [3.4, 0.5, 4.6], to: [2.7, 0.45, 3.7], lookFrom: [0, 0.6, 0.4], lookTo: [0, 0.55, 0.6], fov: 36, caption: "title", lights: true },
  // Tracking along the side.
  { length: 4.5, from: [6.2, 0.85, -2.6], to: [6.2, 0.85, 2.6], lookFrom: [0, 0.65, -1.6], lookTo: [0, 0.65, 1.6], fov: 32, caption: "tagline" },
  // Swinging round the back.
  { length: 4.5, from: orbit(205, 5.4, 1.0), to: orbit(240, 5.2, 1.2), lookFrom: [0, 0.6, 0], lookTo: [0, 0.6, 0], fov: 36, caption: "ss396" },
  // Hood up: the big block.
  { length: 4.5, from: [0.9, 2.1, 3.6], to: [0.35, 1.9, 3.1], lookFrom: [0, 0.7, 1.2], lookTo: [0, 0.75, 1.3], fov: 38, caption: "engine", hood: 1.05 },
  // High, circling over the roof.
  { length: 4, from: orbit(35, 6.4, 4.2), to: orbit(100, 6.4, 4.0), lookFrom: [0, 0.2, 0], lookTo: [0, 0.3, 0], fov: 38, caption: "none" },
  // The price.
  { length: 7.5, from: [-4.4, 1.25, 4.8], to: [-3.9, 1.15, 4.2], lookFrom: [0, -0.9, 0.4], lookTo: [0, -0.85, 0.4], fov: 40, caption: "price", lights: true },
  // Back out on the lot, pulling away from the dealership.
  { length: 5, from: [-3, 1.8, 24], to: [-6, 2.4, 34], lookFrom: [0, 3.4, 4], lookTo: [0, 3.2, 4], fov: 44, caption: "visit" },
];

export const AD_LENGTH = SHOTS.reduce((s, x) => s + x.length, 0);

// Which shot plays `t` seconds into the loop, and how far through it (0-1).
export function shotAt(t: number) {
  let left = ((t % AD_LENGTH) + AD_LENGTH) % AD_LENGTH;
  for (let i = 0; i < SHOTS.length; i++) {
    if (left < SHOTS[i].length) return { index: i, into: left, k: left / SHOTS[i].length };
    left -= SHOTS[i].length;
  }
  return { index: 0, into: 0, k: 0 };
}

// Shared with the TV: the commercial's clock and current shot.
export interface AdState {
  started: number | null; // clock time the set warmed up (null: still off)
  time: number; // seconds into the broadcast
  shot: number;
  into: number; // seconds into the current shot
}

const ease = (k: number) => k * k * (3 - 2 * k);

function Camera({ camera, ad, onShot }: { camera: PerspectiveCamera; ad: AdState; onShot: (i: number) => void }) {
  const pos = useMemo(() => new Vector3(), []);
  const look = useMemo(() => new Vector3(), []);
  const target = useMemo(() => new Vector3(), []);
  const last = useRef(-1);
  useFrame(({ clock }) => {
    ad.time = ad.started === null ? 0 : clock.elapsedTime - ad.started;
    const { index, into, k } = shotAt(ad.time);
    ad.shot = index;
    ad.into = into;
    if (index !== last.current) {
      last.current = index;
      onShot(index);
    }
    const s = SHOTS[index];
    const e = ease(k);
    pos.fromArray(s.from).lerp(target.fromArray(s.to), e);
    camera.position.copy(pos);
    look.fromArray(s.lookFrom).lerp(target.fromArray(s.lookTo), e);
    camera.lookAt(look);
    if (camera.fov !== s.fov) {
      camera.fov = s.fov;
      camera.updateProjectionMatrix();
    }
  });
  return null;
}

// Strings of pennant flags, sagging between their ends.
function Pennants({ runs }: { runs: [Vector3, Vector3][] }) {
  const mesh = useMemo(() => {
    const flag = new BufferGeometry();
    flag.setAttribute("position", new BufferAttribute(new Float32Array([-0.17, 0, 0, 0.17, 0, 0, 0, -0.45, 0]), 3));
    flag.computeVertexNormals();
    const per = runs.map(([a, b]) => Math.floor(a.distanceTo(b) / 0.55));
    const total = per.reduce((s, n) => s + n, 0);
    const m = new InstancedMesh(flag, new MeshStandardMaterial({ side: DoubleSide, roughness: 0.7 }), total);
    const colors = ["#d7262b", "#f2d33a", "#1f4fb3", "#f4f1e8", "#2b9a4b"].map((c) => new Color(c));
    const rand = mulberry32(3);
    const mat = new Matrix4();
    const q = new Quaternion();
    const p = new Vector3();
    let i = 0;
    runs.forEach(([a, b], r) => {
      const yaw = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
      for (let j = 0; j < per[r]; j++) {
        const k = (j + 0.5) / per[r];
        p.lerpVectors(a, b, k);
        p.y -= Math.sin(k * Math.PI) * 0.6;
        q.setFromAxisAngle(new Vector3(0, 1, 0), yaw + (rand() - 0.5) * 0.4);
        m.setMatrixAt(i, mat.compose(p, q, new Vector3(1, 1, 1)));
        m.setColorAt(i, colors[i % colors.length]);
        i++;
      }
    });
    return m;
  }, [runs]);
  return <primitive object={mesh} />;
}

function Dealership() {
  const mats = useMemo(() => {
    const sign = new MeshBasicMaterial({ map: signTexture(), toneMapped: false });
    sign.color.multiplyScalar(1.6);
    return {
      floor: new MeshStandardMaterial({ map: checkerTexture(), roughness: 0.18, metalness: 0 }),
      wall: new MeshStandardMaterial({ color: "#efe6d2", roughness: 0.85 }),
      accent: new MeshStandardMaterial({ color: "#2f6f8f", roughness: 0.8 }),
      trim: new MeshStandardMaterial({ color: "#c9c9c4", roughness: 0.3, metalness: 0.8 }),
      dark: new MeshStandardMaterial({ color: "#26292d", roughness: 0.6 }),
      glass: new MeshStandardMaterial({ color: "#b8d6e8", roughness: 0.05, transparent: true, opacity: 0.14, depthWrite: false }),
      lot: new MeshStandardMaterial({ color: "#6d6a66", roughness: 0.95 }),
      grass: new MeshStandardMaterial({ color: "#5f8a3e", roughness: 1 }),
      ceiling: new MeshStandardMaterial({ color: "#f4f1ea", roughness: 0.9 }),
      panel: new MeshBasicMaterial({ color: "#fffaf0" }),
      banner: new MeshStandardMaterial({ map: bannerTexture(), roughness: 0.7 }),
      placard: new MeshStandardMaterial({ map: placardTexture(), roughness: 0.6 }),
      sign,
      plant: new MeshStandardMaterial({ color: "#3d7a35", roughness: 0.9 }),
      pot: new MeshStandardMaterial({ color: "#c56a3a", roughness: 0.7 }),
      tree: new MeshStandardMaterial({ color: "#4d7a3a", roughness: 1 }),
    };
  }, []);

  const pennants = useMemo<[Vector3, Vector3][]>(
    () => [
      // Indoors, across the ceiling.
      [new Vector3(-9.5, 4.7, -8.5), new Vector3(9.5, 4.7, 6.5)],
      [new Vector3(9.5, 4.7, -8.5), new Vector3(-9.5, 4.7, 6.5)],
      // Outdoors, from the roof to the lot's light poles.
      [new Vector3(-9.8, 5.3, 7.3), new Vector3(-13, 5.4, 19)],
      [new Vector3(9.8, 5.3, 7.3), new Vector3(13, 5.4, 19)],
      [new Vector3(-13, 5.4, 19), new Vector3(13, 5.4, 19)],
    ],
    [],
  );

  const mullions = [-10, -7.5, -5, -2.5, 0, 2.5, 5, 7.5, 10];
  const lights = [];
  for (let x = -7.5; x <= 7.5; x += 5) for (let z = -6; z <= 4; z += 5) lights.push([x, z]);
  const trees = useMemo(() => {
    const rand = mulberry32(12);
    return Array.from({ length: 18 }, (_, i) => [-40 + i * 4.8 + rand() * 2, 2 + rand() * 2.5, -22 - rand() * 6] as const);
  }, []);

  return (
    <>
      {/* Showroom floor, and the lot and grass outside. */}
      <mesh material={mats.floor} rotation-x={-Math.PI / 2} position={[0, 0, -1]} receiveShadow>
        <planeGeometry args={[20, 16]} />
      </mesh>
      <mesh material={mats.lot} rotation-x={-Math.PI / 2} position={[0, -0.01, 10]} receiveShadow>
        <planeGeometry args={[90, 60]} />
      </mesh>
      <mesh material={mats.grass} rotation-x={-Math.PI / 2} position={[0, -0.02, -40]}>
        <planeGeometry args={[200, 60]} />
      </mesh>
      {/* Walls, roof and ceiling. */}
      <mesh material={mats.wall} position={[0, 2.5, -9]}>
        <boxGeometry args={[20.6, 5, 0.3]} />
      </mesh>
      {[-10.15, 10.15].map((x) => (
        <mesh key={x} material={mats.wall} position={[x, 2.5, -1]}>
          <boxGeometry args={[0.3, 5, 16.3]} />
        </mesh>
      ))}
      <mesh material={mats.accent} position={[0, 0.4, -8.82]}>
        <boxGeometry args={[20, 0.8, 0.05]} />
      </mesh>
      <mesh material={mats.ceiling} position={[0, 5.05, -1]} rotation-x={Math.PI / 2}>
        <planeGeometry args={[20.6, 16.3]} />
      </mesh>
      <mesh material={mats.accent} position={[0, 5.45, -1]}>
        <boxGeometry args={[21.2, 0.8, 16.9]} />
      </mesh>
      {lights.map(([x, z]) => (
        <mesh key={`${x},${z}`} material={mats.panel} position={[x, 5.0, z]} rotation-x={Math.PI / 2}>
          <planeGeometry args={[2.4, 0.6]} />
        </mesh>
      ))}
      {/* The glass front, its frames and the door. */}
      <mesh material={mats.glass} position={[0, 2.5, 7]}>
        <planeGeometry args={[20, 5]} />
      </mesh>
      {mullions.map((x) => (
        <mesh key={x} material={mats.trim} position={[x, 2.5, 7]}>
          <boxGeometry args={[0.12, 5, 0.12]} />
        </mesh>
      ))}
      <mesh material={mats.trim} position={[0, 0.05, 7]}>
        <boxGeometry args={[20.4, 0.1, 0.16]} />
      </mesh>
      {/* Signs: the dealer's name on the roof and inside, and the banner. */}
      <mesh material={mats.dark} position={[0, 6.55, 6.7]}>
        <boxGeometry args={[9.4, 1.6, 0.25]} />
      </mesh>
      <mesh material={mats.sign} position={[0, 6.55, 6.84]}>
        <planeGeometry args={[9, 1.4]} />
      </mesh>
      {[-3.5, 3.5].map((x) => (
        <mesh key={x} material={mats.trim} position={[x, 5.9, 6.7]}>
          <cylinderGeometry args={[0.05, 0.05, 0.9]} />
        </mesh>
      ))}
      <mesh material={mats.sign} position={[0, 3.55, -8.84]}>
        <planeGeometry args={[7.2, 1.12]} />
      </mesh>
      <mesh material={mats.banner} position={[0, 2.1, -8.84]}>
        <planeGeometry args={[6, 1.5]} />
      </mesh>
      {/* The price placard beside the car. */}
      <group position={[2.4, 0, 2.2]} rotation-y={-0.5}>
        <mesh material={mats.trim} position={[0, 0.55, 0]}>
          <cylinderGeometry args={[0.025, 0.025, 1.1]} />
        </mesh>
        <mesh material={mats.trim} position={[0, 0.01, 0]}>
          <cylinderGeometry args={[0.2, 0.22, 0.02]} />
        </mesh>
        <mesh material={mats.placard} position={[0, 1.25, 0.01]}>
          <planeGeometry args={[0.5, 0.625]} />
        </mesh>
      </group>
      {/* Potted plants in the corners. */}
      {[
        [-8.5, -7.5],
        [8.5, -7.5],
        [-8.5, 5.5],
        [8.5, 5.5],
      ].map(([x, z]) => (
        <group key={`${x},${z}`} position={[x, 0, z]}>
          <mesh material={mats.pot} position-y={0.3}>
            <cylinderGeometry args={[0.3, 0.22, 0.6]} />
          </mesh>
          <mesh material={mats.plant} position-y={1.0}>
            <sphereGeometry args={[0.55, 12, 10]} />
          </mesh>
        </group>
      ))}
      {/* The lot: light poles, and a row of trees beyond the building. */}
      {[-13, 13].map((x) => (
        <mesh key={x} material={mats.trim} position={[x, 2.8, 19]}>
          <cylinderGeometry args={[0.08, 0.1, 5.6]} />
        </mesh>
      ))}
      {trees.map(([x, h, z], i) => (
        <mesh key={i} material={mats.tree} position={[x, h, z]}>
          <sphereGeometry args={[h * 0.9, 10, 8]} />
        </mesh>
      ))}
      <Pennants runs={pennants} />
    </>
  );
}

export default function Commercial({
  camera,
  ad,
  onShot,
  lightsOn,
  domeOn,
}: {
  camera: PerspectiveCamera;
  ad: AdState;
  onShot: (i: number) => void;
  lightsOn: boolean;
  domeOn: boolean;
}) {
  const [shot, setShot] = useState(0);
  const sun = useRef<import("three").DirectionalLight>(null);
  useLayoutEffect(() => {
    const s = sun.current;
    if (!s) return;
    s.shadow.camera.left = s.shadow.camera.bottom = -6;
    s.shadow.camera.right = s.shadow.camera.top = 6;
    s.shadow.camera.updateProjectionMatrix();
  }, []);
  const s = SHOTS[shot];
  return (
    <>
      <Camera
        camera={camera}
        ad={ad}
        onShot={(i) => {
          setShot(i);
          onShot(i);
        }}
      />
      <color attach="background" args={["#a9cbe6"]} />
      <fog attach="fog" args={["#c4d8e6", 40, 120]} />
      <Environment resolution={128} environmentIntensity={0.75}>
        <Lightformer form="rect" intensity={2.4} position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[12, 6, 1]} />
        <Lightformer form="rect" intensity={1.6} position={[0, 2.5, 8]} scale={[16, 4, 1]} color="#dfefff" />
        <Lightformer form="rect" intensity={0.8} position={[-7, 2, 0]} rotation-y={Math.PI / 2} scale={[10, 3, 1]} />
        <Lightformer form="rect" intensity={0.8} position={[7, 2, 0]} rotation-y={-Math.PI / 2} scale={[10, 3, 1]} />
      </Environment>
      <hemisphereLight args={["#fff8ea", "#6b625a", 0.8]} />
      <directionalLight ref={sun} position={[4, 12, 8]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004} />
      <Dealership />
      <CamaroModel lightsOn={lightsOn || !!s.lights} domeOn={domeOn} hoodOpen={s.hood ?? 0} />
      <CarContactShadows position={[0, 0.005, 0]} opacity={0.75} scale={10} blur={2.2} far={2.5} />
    </>
  );
}
