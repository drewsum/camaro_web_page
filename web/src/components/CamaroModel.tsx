import { useMemo } from "react";
import { Center, useGLTF } from "@react-three/drei";
import { Mesh, type Material, type MeshStandardMaterial } from "three";

const MODEL_URL = "/models/camaro.glb";
const DRACO_URL = "/draco/";

// Blender exports textured materials whose image has an alpha channel (Interior,
// Chassis, Engine, ...) as alpha BLEND. Blended meshes are depth-sorted per object
// and don't occlude each other, so the interior flickers and the underbody shows
// through it. Render those as opaque with an alpha cutout instead; untextured
// glass and lens materials keep blending.
function fixTexturedBlending(material: Material) {
  const m = material as MeshStandardMaterial;
  if (!m.transparent || !m.map) return;
  m.transparent = false;
  m.depthWrite = true;
  m.alphaTest = 0.5;
  m.needsUpdate = true;
}

// Centered on the origin with the tires resting on y = 0.
export default function CamaroModel() {
  const { scene } = useGLTF(MODEL_URL, DRACO_URL);
  useMemo(() => {
    scene.traverse((obj) => {
      if (!(obj instanceof Mesh)) return;
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach(fixTexturedBlending);
    });
  }, [scene]);
  return (
    <Center top>
      <primitive object={scene} />
    </Center>
  );
}

useGLTF.preload(MODEL_URL, DRACO_URL);
