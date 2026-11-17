import { ContactShadows, Environment, Lightformer, OrbitControls } from "@react-three/drei";
import CamaroModel from "../components/CamaroModel";

// Default scene: the car on a neutral floor with studio-style reflections.
// The environment is built from Lightformers so no HDR has to be fetched.
export default function ShowroomScene() {
  return (
    <>
      <color attach="background" args={["#15171c"]} />
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={2} position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[10, 4, 1]} />
        <Lightformer form="rect" intensity={1.5} position={[-5, 2, 0]} rotation-y={Math.PI / 2} scale={[8, 2, 1]} />
        <Lightformer form="rect" intensity={1.5} position={[5, 2, 0]} rotation-y={-Math.PI / 2} scale={[8, 2, 1]} />
        <Lightformer form="rect" intensity={1} position={[0, 2, 6]} scale={[8, 2, 1]} />
        <Lightformer form="rect" intensity={1} position={[0, 2, -6]} rotation-y={Math.PI} scale={[8, 2, 1]} />
      </Environment>
      <ambientLight intensity={0.2} />
      <CamaroModel />
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
