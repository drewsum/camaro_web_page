import { useRef, type ReactNode, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { DirectionalLight, Group } from "three";
import CarContactShadows from "../components/CarContactShadows";
import CamaroModel from "../components/CamaroModel";
import MustangModel from "../components/MustangModel";
import ChargerModel from "../components/ChargerModel";
import { DriveProvider, constantSpeed, driveDistance, useDrive, type DriveProfile } from "../car/driveClock";
import type { SceneProps } from ".";
import { useCameraStart } from "./useCameraStart";
import { useExposure, useFarPlane } from "./common/renderer";
import { polyHavenHdri, type HdriSky } from "./common/hdri";
import { useSceneSky } from "./common/night";
import SkyReflections from "./common/SkyReflections";
import Optional from "./common/Optional";
import { Scroll } from "./common/periodic";
import Bridge from "./goldengate/Bridge";
import Land from "./goldengate/Land";
import { BX, L, LANE, SPEED, START, TUNNEL_IN, TUNNEL_OUT, smoothstep, wrapT } from "./goldengate/layout";

// Northbound across the Golden Gate Bridge on a loop: out of a tunnel under
// the Presidio, along the approach through the cypresses, across the bridge
// (the Pacific on the left, the bay and the city on the right) and up
// through the Marin headlands into the tunnel again.

const SKY = polyHavenHdri("kloofendal_48d_partly_cloudy_puresky");
const EXPOSURE = 0.85;
const FOG_NEAR = 500;
const FOG_FAR = 9000;
const SUN_AZIMUTH = 2.3; // the afternoon sun, low over the ocean behind the car's left shoulder

const DRIVE: DriveProfile = {
  state: (t) => ({ distance: START + SPEED * t, speed: SPEED, accel: 0, curvature: 0, grade: 0 }),
};

// Where the car is along the loop this frame.
const here = { s: START };

function Tracker() {
  const drive = useDrive();
  useFrame(({ clock }) => {
    here.s = driveDistance(drive, clock.elapsedTime) % L;
  }, -1);
  return null;
}

// Inside the tunnel the sky's light can't reach the car: fade the sun and the
// sky's reflections out past each mouth and back in on the way out.
function TunnelShade({ sky, sun }: { sky: HdriSky; sun: RefObject<DirectionalLight | null> }) {
  useFrame(({ scene }) => {
    const t = wrapT(here.s);
    const depth = Math.min(t - TUNNEL_IN, TUNNEL_OUT - t);
    const inside = smoothstep(-6, 35, depth);
    if (sun.current) sun.current.intensity = sky.sunIntensity * (1 - inside);
    scene.environmentIntensity = sky.envIntensity * (1 - 0.85 * inside);
  });
  return null;
}

// ---- Traffic the other way ----------------------------------------------------

const ONCOMING_SPEED = 21;
const MUSTANG_DRIVE = constantSpeed(ONCOMING_SPEED);
const mod = (a: number, n: number) => ((a % n) + n) % n;

function Oncoming({ phase, lane, children }: { phase: number; lane: number; children: ReactNode }) {
  const drive = useDrive();
  const group = useRef<Group>(null);
  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const t = clock.elapsedTime - drive.t0;
    // The copy of it nearest ahead, from 150 m behind the Camaro.
    const s0 = mod(phase - ONCOMING_SPEED * t, L);
    const s = s0 + Math.ceil((here.s - 150 - s0) / L) * L;
    g.position.set(BX + (lane + 0.5) * LANE, 0, s - here.s);
  });
  return (
    <group ref={group} rotation-y={Math.PI}>
      {children}
    </group>
  );
}

function Traffic({ night }: { night: boolean }) {
  return (
    <>
      <Optional>
        <Oncoming phase={L * 0.45} lane={1}>
          <MustangModel profile={MUSTANG_DRIVE} lightsOn={night} />
        </Oncoming>
      </Optional>
      <Optional>
        <Oncoming phase={L * 0.95} lane={0}>
          <ChargerModel />
        </Oncoming>
      </Optional>
    </>
  );
}

function GoldenGateWorld({ lightsOn, domeOn, night = false }: SceneProps) {
  const sky = useSceneSky(SKY, SUN_AZIMUTH, EXPOSURE, night);
  const sun = useRef<DirectionalLight>(null);
  return (
    <DriveProvider profile={DRIVE}>
      <Tracker />
      <TunnelShade sky={sky} sun={sun} />
      <fog attach="fog" args={[sky.fog, FOG_NEAR, FOG_FAR]} />
      <SkyReflections sky={sky} ground="#41464a" />
      <directionalLight
        ref={sun}
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
      <Scroll period={L}>
        <Land sky={sky} night={night} fogNear={FOG_NEAR} fogFar={FOG_FAR} />
        <Bridge night={night} />
      </Scroll>
      <Traffic night={night} />
      <CamaroModel lightsOn={lightsOn} domeOn={domeOn} />
      <CarContactShadows position={[0, 0.01, 0]} opacity={0.45} scale={10} blur={2.2} far={2} />
    </DriveProvider>
  );
}

export default function GoldenGateScene(props: SceneProps) {
  useCameraStart(-5.5, 2.4, -9);
  useFarPlane(20000);
  useExposure(EXPOSURE);
  return (
    <>
      <GoldenGateWorld {...props} />
      <OrbitControls makeDefault enablePan={false} enableDamping minDistance={3} maxDistance={18} maxPolarAngle={Math.PI / 2.05} />
    </>
  );
}
