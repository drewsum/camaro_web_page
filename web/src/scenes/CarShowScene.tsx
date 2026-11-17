import { useLayoutEffect, useMemo, useRef } from "react";
import { Center, ContactShadows, Environment, OrbitControls, Sky, useGLTF } from "@react-three/drei";
import {
  CanvasTexture,
  Light,
  Mesh,
  MeshPhysicalMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  type InstancedMesh,
  type Material,
  type Object3D,
} from "three";
import CamaroModel, { DRACO_URL, MODEL_URL } from "../components/CamaroModel";
import type { SceneProps } from ".";
import { useCameraStart } from "./useCameraStart";
import { useExposure } from "./common/renderer";
import { fillInstances, mulberry32 } from "./common/periodic";
import Onlooker from "./carshow/Onlooker";

// Parked on the grass at a summer car show, between a couple of other
// first-gen Camaros, while a few old guys with beers look it over.

const SUN = new Vector3(0.45, 0.75, 0.35).normalize();
const PAINT = "Matador_Red";

// ---- Other show cars ------------------------------------------------------

// A repainted copy of the hero model. Real lights (and the dome lens, which
// shares the hero's material) are stripped so the copies stay dark and don't
// add to the per-pixel light count.
function ShowCar({ paint, position, rotationY }: { paint: string; position: [number, number]; rotationY: number }) {
  const { scene } = useGLTF(MODEL_URL, DRACO_URL);
  const car = useMemo(() => {
    const copy = scene.clone(true);
    const lights: Object3D[] = [];
    let repainted: Material | null = null;
    copy.traverse((o) => {
      if (o instanceof Light || o.name === "DomeLens") lights.push(o);
      if (!(o instanceof Mesh)) return;
      const mats: Material[] = Array.isArray(o.material) ? o.material : [o.material];
      const swapped = mats.map((m) => {
        if (m.name !== PAINT) return m;
        if (!repainted) {
          repainted = (m as MeshPhysicalMaterial).clone();
          (repainted as MeshPhysicalMaterial).color.set(paint);
        }
        return repainted;
      });
      o.material = Array.isArray(o.material) ? swapped : swapped[0];
    });
    for (const l of lights) l.removeFromParent();
    return copy;
  }, [scene, paint]);
  return (
    <group position={[position[0], 0, position[1]]} rotation-y={rotationY}>
      <Center top>
        <primitive object={car} />
      </Center>
    </group>
  );
}

// ---- Grounds --------------------------------------------------------------

function makeGrassTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#4f7a2e";
  g.fillRect(0, 0, 256, 256);
  const rand = mulberry32(3);
  for (let n = 0; n < 14000; n++) {
    const h = 80 + rand() * 30;
    const l = 22 + rand() * 18;
    g.fillStyle = `hsl(${h}, 45%, ${l}%)`;
    g.fillRect(rand() * 256, rand() * 256, 1, 2 + rand() * 3);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(120, 120);
  t.anisotropy = 8;
  return t;
}

function Grounds() {
  const grass = useMemo(makeGrassTexture, []);
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-0.002} receiveShadow>
      <circleGeometry args={[400, 64]} />
      <meshStandardMaterial map={grass} roughness={1} />
    </mesh>
  );
}

// A ring of round-topped shade trees around the field.
function Trees() {
  const trunks = useRef<InstancedMesh>(null);
  const crowns = useRef<InstancedMesh>(null);
  const count = 70;
  useLayoutEffect(() => {
    const rand = mulberry32(42);
    const spots = Array.from({ length: count }, () => {
      const a = rand() * Math.PI * 2;
      const r = 45 + rand() * 50;
      return { x: Math.cos(a) * r, z: Math.sin(a) * r, s: 0.8 + rand() * 0.7 };
    });
    fillInstances(trunks.current!, count, (n, m) => {
      const { x, z, s } = spots[n];
      m.makeScale(s, s, s).setPosition(x, 2 * s, z);
      return true;
    });
    fillInstances(crowns.current!, count, (n, m) => {
      const { x, z, s } = spots[n];
      m.makeScale(4.5 * s, 3.8 * s, 4.5 * s).setPosition(x, 6 * s, z);
      return true;
    });
  }, []);
  return (
    <>
      <instancedMesh ref={trunks} args={[undefined, undefined, count]} castShadow>
        <cylinderGeometry args={[0.25, 0.35, 4, 8]} />
        <meshStandardMaterial color="#5a4632" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[undefined, undefined, count]} castShadow>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color="#3e6b2a" roughness={1} flatShading />
      </instancedMesh>
    </>
  );
}

// White pop-up canopy with a table, folding chairs and a cooler.
function Canopy({ position, rotationY }: { position: [number, number]; rotationY: number }) {
  const size = 3;
  const legs = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ];
  return (
    <group position={[position[0], 0, position[1]]} rotation-y={rotationY}>
      {legs.map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[(x * size) / 2, 1.1, (z * size) / 2]} castShadow>
          <cylinderGeometry args={[0.025, 0.025, 2.2, 8]} />
          <meshStandardMaterial color="#d8dadc" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      <mesh position-y={2.55} rotation-y={Math.PI / 4} castShadow>
        <coneGeometry args={[(size / 2) * Math.SQRT2 * 1.05, 0.7, 4, 1, true]} />
        <meshStandardMaterial color="#f4f4f1" roughness={0.9} side={2} />
      </mesh>
      <mesh position-y={2.15}>
        <boxGeometry args={[size * 1.02, 0.25, size * 1.02]} />
        <meshStandardMaterial color="#f4f4f1" roughness={0.9} />
      </mesh>
      {/* Table */}
      <mesh position={[0, 0.74, -0.8]} castShadow>
        <boxGeometry args={[1.8, 0.04, 0.75]} />
        <meshStandardMaterial color="#e9e6dd" roughness={0.7} />
      </mesh>
      {[-0.8, 0.8].map((x) => (
        <mesh key={x} position={[x, 0.37, -0.8]}>
          <boxGeometry args={[0.04, 0.74, 0.6]} />
          <meshStandardMaterial color="#555" />
        </mesh>
      ))}
      {/* Folding chairs */}
      {[-0.7, 0.6].map((x, i) => (
        <group key={x} position={[x, 0, 0.5]} rotation-y={i ? -0.4 : 0.3}>
          <mesh position-y={0.45} castShadow>
            <boxGeometry args={[0.5, 0.05, 0.45]} />
            <meshStandardMaterial color={i ? "#2c5d8f" : "#7a2626"} roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.75, -0.22]} castShadow>
            <boxGeometry args={[0.5, 0.55, 0.04]} />
            <meshStandardMaterial color={i ? "#2c5d8f" : "#7a2626"} roughness={0.8} />
          </mesh>
          {[-0.22, 0.22].map((lx) => (
            <mesh key={lx} position={[lx, 0.22, 0]} rotation-x={0.3}>
              <cylinderGeometry args={[0.012, 0.012, 0.5, 6]} />
              <meshStandardMaterial color="#888" metalness={0.6} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Cooler */}
      <group position={[1.1, 0, 0.3]} rotation-y={0.4}>
        <mesh position-y={0.2} castShadow>
          <boxGeometry args={[0.65, 0.4, 0.4]} />
          <meshStandardMaterial color="#b3261e" roughness={0.5} />
        </mesh>
        <mesh position-y={0.42}>
          <boxGeometry args={[0.67, 0.06, 0.42]} />
          <meshStandardMaterial color="#f2f2f2" roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}

// ---- Scene ----------------------------------------------------------------

// Points on the hero car (centred at the origin, nose toward +Z). The
// onlookers stand on its passenger side (-X), facing the default camera.
const HOOD = new Vector3(0, 0.95, 1.4);
const GRILLE = new Vector3(0, 0.6, 2.3);
const FRONT_WHEEL_R = new Vector3(-0.9, 0.35, 1.45);
const STRIPE = new Vector3(0, 0.9, 1.9);
const QUARTER_R = new Vector3(-0.95, 0.7, -1.2);
const CAR_CENTER = new Vector3(0, 0.6, 0.4);

export default function CarShowScene({ lightsOn, domeOn }: SceneProps) {
  useCameraStart(6.5, 2.4, 7.5);
  useExposure(0.5);
  const sunPosition = useMemo(() => SUN.clone().multiplyScalar(1000), []);
  return (
    <>
      <fog attach="fog" args={["#cfdbe4", 60, 260]} />
      <Sky sunPosition={sunPosition} turbidity={4} rayleigh={1} mieCoefficient={0.004} mieDirectionalG={0.8} />
      <Environment resolution={256} environmentIntensity={0.6}>
        <Sky sunPosition={sunPosition} turbidity={4} rayleigh={1} mieCoefficient={0.004} mieDirectionalG={0.8} />
      </Environment>
      <hemisphereLight args={["#d6e6f5", "#5d6b3a", 0.5]} />
      <directionalLight position={SUN.clone().multiplyScalar(50)} intensity={2.8} color="#fff1dc" />

      <Grounds />
      <Trees />
      <Canopy position={[-1.5, -7]} rotationY={0.15} />
      <Canopy position={[6, -9]} rotationY={-0.1} />

      <CamaroModel lightsOn={lightsOn} domeOn={domeOn} />
      <ShowCar paint="#1f3f7a" position={[4.4, -0.4]} rotationY={-0.06} />
      <ShowCar paint="#e2b33c" position={[-4.5, 0.3]} rotationY={0.08} />
      <ShowCar paint="#1d4a32" position={[9.2, -1.2]} rotationY={-0.12} />

      <Onlooker
        position={[-2.1, 1.7]}
        faceToward={CAR_CENTER}
        pointAt={[HOOD, FRONT_WHEEL_R, STRIPE]}
        shirt={["#9e1f1f", "#1b1b1b"]}
        cap="#2f6b2f"
        skin="#d9a98b"
        phase={0}
      />
      <Onlooker
        position={[-1.2, 3.6]}
        faceToward={CAR_CENTER}
        pointAt={[GRILLE, HOOD, FRONT_WHEEL_R]}
        shirt="#8b8f94"
        pants="#4a4237"
        cap="#b72a2a"
        skin="#c98e6d"
        phase={3.1}
      />
      <Onlooker
        position={[-2.2, -0.9]}
        faceToward={CAR_CENTER}
        pointAt={[QUARTER_R, FRONT_WHEEL_R]}
        shirt={["#2a4f7a", "#1c2c3c"]}
        cap="#f2f0ea"
        skin="#e2b79a"
        phase={5.7}
      />

      <ContactShadows position={[2, 0.005, 0]} opacity={0.7} scale={30} resolution={1024} blur={2} far={4} />
      <OrbitControls makeDefault enablePan={false} enableDamping minDistance={3} maxDistance={16} maxPolarAngle={Math.PI / 2.05} />
    </>
  );
}
