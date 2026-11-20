import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { BoxGeometry, ExtrudeGeometry, TorusGeometry, InstancedMesh, MeshStandardMaterial, Object3D, PlaneGeometry, Shape, Vector3, type Group } from "three";
import CarContactShadows from "../components/CarContactShadows";
import CamaroModel from "../components/CamaroModel";
import MustangModel from "../components/MustangModel";
import ChargerModel from "../components/ChargerModel";
import type { SceneProps } from ".";
import { useCameraStart } from "./useCameraStart";
import { useExposure, useFarPlane } from "./common/renderer";
import { polyHavenHdri } from "./common/hdri";
import { NearestLights, useSceneSky } from "./common/night";
import SkyReflections from "./common/SkyReflections";
import GrassField from "./common/GrassField";
import Optional from "./common/Optional";
import Countryside, { type CountrysideProps } from "./common/Countryside";
import { ClassicCar } from "./common/classicCars";
import { mulberry32 } from "./common/periodic";
import { preloadPbr, usePbrMaterial } from "./common/pbr";
import { DriveProvider, useDrive } from "../car/driveClock";
import Spectators, { type Seat } from "./drag/Spectators";
import { makeRoutine } from "./burnout/donuts";
import Smoke, { type SmokeEmitter } from "./burnout/Smoke";
import TireMarks, { type Tyre } from "./burnout/TireMarks";

// A burnout competition in a blocked-off corner of a big parking lot: a pen
// walled in with concrete barriers and tyre stacks, a crowd packed along
// three sides, and the Camaro inside spinning seeded-random donuts and figure
// eights (see burnout/donuts.ts), laying rubber (TireMarks) and pouring out
// tyre smoke (Smoke). An empty store and the rest of the lot behind, farmland
// beyond.

const SKY = polyHavenHdri("kloofendal_48d_partly_cloudy_puresky");
const EXPOSURE = 0.85;
const FIELD = 8000;
const HAZE = "#9ea3b6";
const ASPHALT = "asphalt_04";
preloadPbr(ASPHALT);

const PEN = 16; // the barriers' half-width
const LOT = { x: [-60, 60], z: [-75, 45] } as const;

const COUNTRYSIDE: CountrysideProps = {
  seed: 41,
  centre: [0, -15],
  hills: { from: 260, to: 1400, height: 45 },
  trees: { from: 90, to: 650, woodlots: 9, hedgerows: 10, singles: 30 },
  clear: (x, z) => x > -75 && x < 75 && z > -95 && z < 60,
  farm: { x: 260, z: -240, rotation: 0.4 },
  powerLine: { from: [-900, 75], to: [900, 75] },
  bales: { x: -200, z: 180, spread: 160, count: 20 },
};

// ---- The lot ----------------------------------------------------------------

function Lot() {
  const w = LOT.x[1] - LOT.x[0];
  const d = LOT.z[1] - LOT.z[0];
  const asphalt = usePbrMaterial(ASPHALT, { tile: 4, size: [w, d], normalScale: 0.8, brightness: 0.85 });
  // Faded parking-stall lines in rows across the lot, outside the pen.
  const stalls = useMemo(() => {
    const lines: [number, number, number][] = []; // x, z, length along z
    for (const row of [-58, -46, -32, 28, 40]) {
      for (let x = -56; x <= 56; x += 2.7) {
        if (Math.abs(x) < PEN + 4 && Math.abs(row) < PEN + 20) continue;
        lines.push([x, row, 5.2]);
      }
    }
    return lines;
  }, []);
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current!;
    const o = new Object3D();
    stalls.forEach(([x, z, len], i) => {
      o.position.set(x, 0.008, z);
      o.rotation.set(-Math.PI / 2, 0, 0);
      o.scale.set(1, len, 1);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [stalls]);
  const line = useMemo(() => new PlaneGeometry(0.12, 1), []);
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[(LOT.x[0] + LOT.x[1]) / 2, 0, (LOT.z[0] + LOT.z[1]) / 2]} material={asphalt} receiveShadow>
        <planeGeometry args={[w, d]} />
      </mesh>
      <instancedMesh ref={ref} args={[line, undefined, stalls.length]} receiveShadow>
        <meshStandardMaterial color="#d9d6cc" roughness={0.7} transparent opacity={0.7} polygonOffset polygonOffsetFactor={-1} />
      </instancedMesh>
    </>
  );
}

// ---- The pen ----------------------------------------------------------------

// A concrete jersey barrier's cross-section, extruded 3 m along x.
function jersey() {
  const s = new Shape();
  s.moveTo(-0.31, 0);
  s.lineTo(0.31, 0);
  s.lineTo(0.31, 0.08);
  s.lineTo(0.17, 0.33);
  s.lineTo(0.08, 0.81);
  s.lineTo(-0.08, 0.81);
  s.lineTo(-0.17, 0.33);
  s.lineTo(-0.31, 0.08);
  const g = new ExtrudeGeometry(s, { depth: 2.95, bevelEnabled: false });
  g.translate(0, 0, -1.475);
  g.rotateY(Math.PI / 2); // length along x
  return g;
}

function Instanced({ geometry, material, mats }: { geometry: BoxGeometry | ExtrudeGeometry | TorusGeometry; material: MeshStandardMaterial; mats: Object3D[] }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current!;
    mats.forEach((o, i) => {
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [mats]);
  return <instancedMesh ref={ref} args={[geometry, material, mats.length]} castShadow receiveShadow />;
}

function Pen() {
  const parts = useMemo(() => {
    const barriers: Object3D[] = [];
    const water: Object3D[] = [];
    const tyres: Object3D[] = [];
    const place = (x: number, z: number, ry: number) => {
      const o = new Object3D();
      o.position.set(x, 0, z);
      o.rotation.y = ry;
      return o;
    };
    // Four sides of 3 m barriers; on the near (+z) side two orange water
    // barriers stand in for a gate.
    for (let k = -5; k <= 5; k++) {
      const u = k * 3;
      barriers.push(place(u, -PEN, 0), place(PEN, u, Math.PI / 2), place(-PEN, u, Math.PI / 2));
      if (Math.abs(k) <= 1) water.push(place(u, PEN, 0));
      else barriers.push(place(u, PEN, 0));
    }
    // Tyre stacks walling off each corner.
    for (const [cx, cz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      for (let j = 0; j < 5; j++) {
        const along = j * 0.72;
        for (const [x, z] of [
          [cx * (PEN - 1.2 - along), cz * (PEN - 0.8)],
          [cx * (PEN - 0.8), cz * (PEN - 1.2 - along)],
        ]) {
          for (let h = 0; h < 4; h++) {
            const o = new Object3D();
            o.position.set(x, 0.11 + h * 0.21, z);
            o.rotation.set(-Math.PI / 2, 0, j * 1.3 + h);
            tyres.push(o);
          }
        }
      }
    }
    const concrete = new MeshStandardMaterial({ color: "#b9b6ad", roughness: 0.9 });
    const orange = new MeshStandardMaterial({ color: "#e8661c", roughness: 0.6 });
    const rubber = new MeshStandardMaterial({ color: "#1c1c1d", roughness: 0.85 });
    return {
      barriers,
      water,
      tyres,
      concrete,
      orange,
      rubber,
      jersey: jersey(),
      waterBox: new BoxGeometry(2.9, 0.95, 0.5).translate(0, 0.475, 0),
      tyre: new TorusGeometry(0.25, 0.11, 8, 20).scale(1, 1, 0.95),
    };
  }, []);
  return (
    <>
      <Instanced geometry={parts.jersey} material={parts.concrete} mats={parts.barriers} />
      <Instanced geometry={parts.waterBox} material={parts.orange} mats={parts.water} />
      <Instanced geometry={parts.tyre} material={parts.rubber} mats={parts.tyres} />
    </>
  );
}

// The crowd, two to four deep along three sides, all facing into the pen.
// The near side is left open for the camera.
function useCrowd() {
  return useMemo(() => {
    const rand = mulberry32(77);
    const seats: Seat[] = [];
    const row = (from: number, to: number, depth: number, at: (u: number, v: number) => [number, number], ry: number) => {
      for (let u = from; u < to; u += 0.62 + rand() * 0.25) {
        const deep = 2 + Math.floor(rand() * 3);
        for (let r = 0; r < Math.min(deep, depth); r++) {
          if (rand() < 0.12) continue;
          const v = 0.9 + r * 0.75 + rand() * 0.3;
          const [x, z] = at(u + (rand() - 0.5) * 0.3, v);
          seats.push({ x, y: 0, z, ry: ry + (rand() - 0.5) * 0.4 });
        }
      }
    };
    row(-PEN - 2, PEN + 2, 4, (u, v) => [u, -PEN - v], 0); // far side, facing +z
    row(-PEN, PEN - 3, 4, (u, v) => [PEN + v, u], -Math.PI / 2); // right side, facing -x
    row(-PEN, PEN - 3, 4, (u, v) => [-PEN - v, u], Math.PI / 2); // left side, facing +x
    return seats;
  }, []);
}

// Tall lot lights at the corners of the pen.
const POLES: [number, number][] = [
  [PEN + 6, PEN + 6],
  [-PEN - 6, PEN + 6],
  [PEN + 6, -PEN - 6],
  [-PEN - 6, -PEN - 6],
];
const LAMPS = POLES.map(([x, z]) => new Vector3(x * 0.92, 9.6, z * 0.92));

function LightPoles({ night }: { night: boolean }) {
  return (
    <>
      {POLES.map(([x, z]) => (
        <group key={`${x}${z}`} position={[x, 0, z]} rotation-y={Math.atan2(-x, -z)}>
          <mesh position-y={5} castShadow>
            <cylinderGeometry args={[0.1, 0.16, 10, 10]} />
            <meshStandardMaterial color="#8d9094" roughness={0.5} metalness={0.6} />
          </mesh>
          <mesh position={[0, 9.9, 0.7]}>
            <boxGeometry args={[0.5, 0.18, 1.6]} />
            <meshStandardMaterial color="#5b5e62" roughness={0.5} metalness={0.5} />
          </mesh>
          <mesh position={[0, 9.8, 0.9]} rotation-x={Math.PI / 2}>
            <planeGeometry args={[0.4, 0.9]} />
            <meshStandardMaterial color="#fff1d2" emissive="#ffe2b0" emissiveIntensity={night ? 6 : 0} side={2} />
          </mesh>
        </group>
      ))}
    </>
  );
}

// The closed-down store whose lot this is.
function Store() {
  return (
    <group position={[0, 0, -92]}>
      <mesh position-y={4.5} castShadow receiveShadow>
        <boxGeometry args={[90, 9, 30]} />
        <meshStandardMaterial color="#cfc6b4" roughness={0.9} />
      </mesh>
      <mesh position={[0, 7.4, 15.02]}>
        <planeGeometry args={[90, 1.6]} />
        <meshStandardMaterial color="#7c2d27" roughness={0.7} />
      </mesh>
      {[-30, -10, 10, 30].map((x) => (
        <mesh key={x} position={[x, 1.6, 15.02]}>
          <planeGeometry args={[12, 3.2]} />
          <meshStandardMaterial color="#20262c" roughness={0.15} metalness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

// ---- The car ----------------------------------------------------------------

const REAR_AXLE = -1.35;
const TRACK_HALF = 0.76;

function DonutCar({ lightsOn, domeOn, routine, tyres, smoke }: SceneProps & { routine: ReturnType<typeof makeRoutine>; tyres: { current: Tyre[] }; smoke: { current: SmokeEmitter[] } }) {
  const drive = useDrive();
  const group = useRef<Group>(null);
  useFrame(({ clock }) => {
    const p = routine.pose(clock.elapsedTime - drive.t0);
    const g = group.current;
    if (!g) return;
    g.position.set(p.x, 0, p.z);
    g.rotation.y = p.yaw;
    const sin = Math.sin(p.yaw);
    const cos = Math.cos(p.yaw);
    // The rear tyres in the pen's frame: always spinning, laying the most
    // rubber and smoke with the tail hung out.
    const strength = 0.35 + 0.65 * p.drift;
    [-1, 1].forEach((side, i) => {
      const lx = side * TRACK_HALF;
      const x = p.x + lx * cos + REAR_AXLE * sin;
      const z = p.z - lx * sin + REAR_AXLE * cos;
      tyres.current[i] = { x, z, strength };
      smoke.current[i] = { x, y: 0.3, z, rate: 18 + 70 * p.drift, vx: -sin * 3 + side * cos * 1.5, vz: -cos * 3 - side * sin * 1.5 };
    });
  });
  return (
    <group ref={group}>
      <CamaroModel lightsOn={lightsOn} domeOn={domeOn} />
      <CarContactShadows position={[0, 0.02, 0]} opacity={0.5} scale={8} blur={2} far={2} />
    </group>
  );
}

// ---- Scene ------------------------------------------------------------------

function Burnout({ lightsOn, domeOn, night = false }: SceneProps) {
  const sky = useSceneSky(SKY, 2.6, EXPOSURE, night);
  const sun = useMemo(() => sky.sun.clone().multiplyScalar(70), [sky]);
  const routine = useMemo(() => makeRoutine(1968), []);
  const tyres = useRef<Tyre[]>([]);
  const smoke = useRef<SmokeEmitter[]>([]);
  const crowd = useCrowd();
  return (
    <>
      <fogExp2 attach="fog" args={[night ? sky.fog : HAZE, 0.0018]} />
      <SkyReflections sky={sky} ground="#34342f" />
      <GrassField size={FIELD} mown={false} behind />
      <Countryside config={COUNTRYSIDE} />
      <directionalLight
        position={sun}
        intensity={sky.sunIntensity}
        color={sky.sunColor}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0003}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-far={200}
      />
      <Lot />
      <Pen />
      <Store />
      <LightPoles night={night} />
      {night && <NearestLights spots={LAMPS} count={4} color="#ffe2b0" intensity={1000} distance={70} />}
      <Spectators seats={crowd} seed={4512} standing />
      <TireMarks tyres={tyres} half={PEN} />
      <Smoke emitters={smoke} color={night ? "#9a9a96" : "#dcdcd7"} />

      <DriveProvider profile={routine.profile} roughness={0.5}>
        <DonutCar lightsOn={lightsOn} domeOn={domeOn} routine={routine} tyres={tyres} smoke={smoke} />
      </DriveProvider>

      {/* The other entrants, parked outside the pen. */}
      <Optional>
        <ClassicCar id="challenger" position={[-PEN - 8, -PEN - 6]} rotationY={0.7} />
      </Optional>
      <Optional>
        <group position={[PEN + 8, 0, -PEN - 5]} rotation-y={-0.8}>
          <MustangModel />
        </group>
      </Optional>
      <Optional>
        <group position={[-PEN - 8, 0, 8]} rotation-y={1.4}>
          <ChargerModel />
        </group>
      </Optional>
    </>
  );
}

export default function BurnoutScene(props: SceneProps) {
  useCameraStart(11, 4.2, 19);
  useFarPlane(5000);
  useExposure(EXPOSURE);
  return (
    <>
      <Burnout {...props} />
      <OrbitControls makeDefault enablePan={false} enableDamping minDistance={5} maxDistance={45} maxPolarAngle={Math.PI / 2.05} />
    </>
  );
}
