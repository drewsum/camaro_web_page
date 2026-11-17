import { ContactShadows, Environment, Lightformer, OrbitControls } from "@react-three/drei";
import CamaroModel from "../components/CamaroModel";
import type { SceneProps } from ".";
import { useCameraStart } from "./useCameraStart";

// Default scene: the car on a neutral floor with studio-style reflections.
// The environment is built from Lightformers so no HDR has to be fetched.
// With the car's lights on the studio is dimmed so the lamps read.
export default function ShowroomScene({ lightsOn }: SceneProps) {
  useCameraStart(5, 2, 6);
  const studio = lightsOn ? 0.35 : 1;
  return (
    <>
      <color attach="background" args={["#15171c"]} />
      <Environment resolution={256} environmentIntensity={studio}>
        <Lightformer form="rect" intensity={2} position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[10, 4, 1]} />
        <Lightformer form="rect" intensity={1.5} position={[-5, 2, 0]} rotation-y={Math.PI / 2} scale={[8, 2, 1]} />
        <Lightformer form="rect" intensity={1.5} position={[5, 2, 0]} rotation-y={-Math.PI / 2} scale={[8, 2, 1]} />
        <Lightformer form="rect" intensity={1} position={[0, 2, 6]} scale={[8, 2, 1]} />
        <Lightformer form="rect" intensity={1} position={[0, 2, -6]} rotation-y={Math.PI} scale={[8, 2, 1]} />
      </Environment>
      <ambientLight intensity={0.2 * studio} />
      <CamaroModel lightsOn={lightsOn} />
      <mesh rotation-x={-Math.PI / 2} position-y={-0.001} receiveShadow>
        <circleGeometry args={[14, 64]} />
        <meshStandardMaterial color="#1b1d22" roughness={0.9} />
      </mesh>
      <ContactShadows position={[0, 0, 0]} opacity={0.7} scale={12} blur={2.4} far={3} />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        minDistance={3}
        maxDistance={14}
        maxPolarAngle={Math.PI / 2.05}
      />
    </>
  );
}
