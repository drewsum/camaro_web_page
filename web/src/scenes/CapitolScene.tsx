import { useRef, type ReactNode, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import CarContactShadows from "../components/CarContactShadows";
import { Matrix4, Vector3, type DirectionalLight, type Group } from "three";
import CamaroModel from "../components/CamaroModel";
import { DriveProvider, driveState, useDrive } from "../car/driveClock";
import type { SceneProps } from ".";
import { useCameraStart } from "./useCameraStart";
import { useExposure, useFarPlane } from "./common/renderer";
import { polyHavenHdri, useHdriSky, type HdriSky } from "./common/hdri";
import SkyReflections from "./common/SkyReflections";
import { ringTrack as track } from "./capitol/ringTrack";
import Ground from "./capitol/Ground";
import Buildings from "./capitol/Buildings";
import Capitol from "./capitol/Capitol";
import Trees from "./capitol/Trees";
import Furniture from "./capitol/Furniture";

// Laps of the Capitol Square in Madison, Wisconsin, on a summer afternoon:
// counterclockwise around the one-way ring like the traffic does, waiting at
// the red light at each corner. The streets, buildings, lawns and trees are
// placed from OpenStreetMap and the ground's rise and fall from USGS
// elevation data (see scripts/capitol-square.mjs); the Capitol and the
// facades are modelled from photographs.
//
// As in the other driving scenes the car stays at the origin and the city is
// moved and turned around it each frame.

const SKY = polyHavenHdri("kloofendal_48d_partly_cloudy_puresky");
const SUN_AZIMUTH = -0.5; // afternoon sun in the south-southwest (0 = +z = south)
const EXPOSURE = 0.9;
const UP = new Vector3(0, 1, 0);

function City({ sky, sunLight, children }: { sky: HdriSky; sunLight: RefObject<DirectionalLight | null>; children: ReactNode }) {
  const drive = useDrive();
  const group = useRef<Group>(null);
  const turn = useRef(new Matrix4());
  useFrame(({ clock, scene }) => {
    const { distance } = driveState(drive, clock.elapsedTime);
    const p = track.at(distance);
    group.current?.matrix.makeTranslation(-p.x, -p.y, -p.z).premultiply(turn.current.makeRotationY(-p.heading));
    scene.environmentRotation.y = sky.rotation.y - p.heading;
    scene.backgroundRotation.y = sky.rotation.y - p.heading;
    sunLight.current?.position.copy(sky.sun).applyAxisAngle(UP, -p.heading).multiplyScalar(150);
  }, -1);
  return (
    <group ref={group} matrixAutoUpdate={false}>
      {children}
    </group>
  );
}

function Square({ lightsOn, domeOn }: SceneProps) {
  const sky = useHdriSky(SKY, SUN_AZIMUTH, EXPOSURE);
  const sun = useRef<DirectionalLight>(null);
  return (
    <DriveProvider profile={track} roughness={0.7}>
      <fog attach="fog" args={[sky.fog, 150, 750]} />
      <SkyReflections sky={sky} ground="#4f4d48" />
      <directionalLight
        ref={sun}
        intensity={sky.sunIntensity}
        color={sky.sunColor}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.03}
        shadow-camera-left={-55}
        shadow-camera-right={55}
        shadow-camera-top={55}
        shadow-camera-bottom={-55}
        shadow-camera-far={400}
      />
      <City sky={sky} sunLight={sun}>
        <Ground />
        <Buildings />
        <Capitol />
        <Trees />
        <Furniture />
      </City>
      <CamaroModel lightsOn={lightsOn} domeOn={domeOn} />
      <CarContactShadows position={[0, 0.01, 0]} opacity={0.45} scale={10} blur={2.2} far={2} />
    </DriveProvider>
  );
}

export default function CapitolScene(props: SceneProps) {
  // Across the car toward the south portico and the dome.
  useCameraStart(-6, 1.3, 7.5, 2.6);
  useFarPlane(4000);
  useExposure(EXPOSURE);
  return (
    <>
      <Square {...props} />
      <OrbitControls makeDefault enablePan={false} enableDamping minDistance={3} maxDistance={18} maxPolarAngle={Math.PI / 2.05} />
    </>
  );
}
