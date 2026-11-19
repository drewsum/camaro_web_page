import { useLayoutEffect, useMemo, useRef } from "react";
import { OrbitControls } from "@react-three/drei";
import CarContactShadows from "../components/CarContactShadows";
import { markCar } from "../car/layers";
import { Vector3, type Group } from "three";
import CamaroModel from "../components/CamaroModel";
import type { SceneProps } from ".";
import { useCameraStart } from "./useCameraStart";
import { useExposure, useFarPlane } from "./common/renderer";
import { polyHavenHdri, useHdriSky } from "./common/hdri";
import SkyReflections from "./common/SkyReflections";
import GrassField from "./common/GrassField";
import Optional from "./common/Optional";
import { ClassicCar } from "./common/classicCars";
import MustangModel from "../components/MustangModel";
import ChargerModel from "../components/ChargerModel";
import Onlooker, { onlookerModel } from "./carshow/Onlooker";
import Countryside, { type CountrysideProps } from "./common/Countryside";

// Parked on the grass at a summer car show among other muscle cars (a
// Challenger R/T fetched from a public repo, plus Ddiaz Design's '69 Charger
// R/T and our rigged '69 Mach 1 Cobra Jet), while a few old guys with beers
// look it over. An open mown field runs out to the horizon under a real sky
// (Poly Haven's "kloofendal_48d_partly_cloudy_puresky" HDRI), the grass
// their scanned "leafy_grass" (see GrassField).

const SKY = polyHavenHdri("kloofendal_48d_partly_cloudy_puresky");
const SUN_AZIMUTH = 0.9; // mid-afternoon, over the camera's right shoulder
const EXPOSURE = 0.85;
const FIELD = 8000; // metres across: out to the horizon, so no sky shows under its edge
// The haze the far field fades into, matched by eye to this sky just above
// the horizon on screen (the sky's own averaged horizon colour comes out much
// whiter, which drew a bright line along the edge of the field).
const HAZE = "#9ea3b6";

// Farmland around the show field: hills, woods, a farm and a power line,
// all kept 70 m clear of the cars and canopies.
const COUNTRYSIDE: CountrysideProps = {
  seed: 3,
  centre: [2, -2],
  hills: { from: 170, to: 1000, height: 55 },
  trees: { from: 75, to: 600, woodlots: 10, hedgerows: 8, singles: 35 },
  clear: (x, z) => Math.hypot(x - 2, z + 2) < 70,
  farm: { x: -250, z: -330, rotation: 0.6 },
  powerLine: { from: [-520, -150], to: [520, -270] },
  bales: { x: 130, z: -170, spread: 120, count: 30 },
};

// ---- Props ----------------------------------------------------------------

// White pop-up canopy with a table, folding chairs and a cooler.
function Canopy({ position, rotationY }: { position: [number, number]; rotationY: number }) {
  const size = 3;
  const legs = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ];
  // The canopy, table and chairs get the soft contact shadow too.
  const group = useRef<Group>(null);
  useLayoutEffect(() => void (group.current && markCar(group.current)), []);
  return (
    <group ref={group} position={[position[0], 0, position[1]]} rotation-y={rotationY}>
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
      <mesh position-y={2.15} castShadow>
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

// Greyed and weathered: older guys in jeans, a jacket and a short-sleeved shirt.
const GREY_HAIR = "#b9b5ad";

function Show({ lightsOn, domeOn }: SceneProps) {
  const sky = useHdriSky(SKY, SUN_AZIMUTH, EXPOSURE);
  const sun = useMemo(() => sky.sun.clone().multiplyScalar(40), [sky]);
  return (
    <>
      {/* Exponential haze, so the far field fades into the sky over a soft
          band rather than a hard line where the fog finally reaches full. */}
      <fogExp2 attach="fog" args={[HAZE, 0.0018]} />
      <SkyReflections sky={sky} ground="#2c3a1a" />
      <GrassField size={FIELD} mown />
      <Countryside config={COUNTRYSIDE} />
      <directionalLight
        position={sun}
        intensity={sky.sunIntensity}
        color={sky.sunColor}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-camera-far={100}
      />
      <Canopy position={[-1.5, -7]} rotationY={0.15} />
      <Canopy position={[6, -9]} rotationY={-0.1} />

      <CamaroModel lightsOn={lightsOn} domeOn={domeOn} />
      <Optional>
        <group position={[4.6, 0, -0.4]} rotation-y={-0.06}>
          <ChargerModel />
        </group>
      </Optional>
      <Optional>
        <ClassicCar id="challenger" position={[-4.6, 0.3]} rotationY={0.08} />
      </Optional>
      <Optional>
        <group position={[9.3, 0, -1.2]} rotation-y={-0.12}>
          <MustangModel />
        </group>
      </Optional>

      <Optional>
        <Onlooker
          model={onlookerModel("Casual")}
          position={[-2.1, 1.7]}
          faceToward={CAR_CENTER}
          pointAt={[HOOD, FRONT_WHEEL_R, STRIPE]}
          recolor={{ Purple: "#8e2a24", Hair: GREY_HAIR, LightBlue: "#3d4f6b" }}
          phase={0}
        />
        <Onlooker
          model={onlookerModel("Casual2")}
          position={[-1.2, 3.6]}
          faceToward={CAR_CENTER}
          pointAt={[GRILLE, HOOD, FRONT_WHEEL_R]}
          recolor={{ Hair: GREY_HAIR, Eyebrows: GREY_HAIR, LightBrown: "#5a4632" }}
          height={1.72}
          phase={3.1}
        />
        <Onlooker
          model={onlookerModel("Beach")}
          position={[-2.2, -0.9]}
          faceToward={CAR_CENTER}
          pointAt={[QUARTER_R, FRONT_WHEEL_R]}
          recolor={{ Hair: GREY_HAIR, Eyebrows: GREY_HAIR, Earrings: "#c99a7a", Red_Dark: "#2f5f7a" }}
          height={1.8}
          phase={5.7}
        />
      </Optional>

      <CarContactShadows position={[2, 0.006, 0]} opacity={0.5} scale={30} resolution={1024} blur={2} far={2} />
    </>
  );
}

export default function CarShowScene(props: SceneProps) {
  useCameraStart(6.5, 2.4, 7.5);
  useFarPlane(5000);
  useExposure(EXPOSURE);
  return (
    <>
      <Show {...props} />
      <OrbitControls makeDefault enablePan={false} enableDamping minDistance={3} maxDistance={16} maxPolarAngle={Math.PI / 2.05} />
    </>
  );
}
