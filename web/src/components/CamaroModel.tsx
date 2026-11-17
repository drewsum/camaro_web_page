import { Center, useGLTF } from "@react-three/drei";

const MODEL_URL = "/models/camaro.glb";
const DRACO_URL = "/draco/";

// Centered on the origin with the tires resting on y = 0.
export default function CamaroModel() {
  const { scene } = useGLTF(MODEL_URL, DRACO_URL);
  return (
    <Center top>
      <primitive object={scene} />
    </Center>
  );
}

useGLTF.preload(MODEL_URL, DRACO_URL);
