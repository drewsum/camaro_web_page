import { useEffect, useMemo } from "react";
import { Center, useGLTF } from "@react-three/drei";
import { Mesh, Object3D, SpotLight, type Material, type MeshStandardMaterial } from "three";
import { applyLamps, findCarRig, LAMPS_DRIVING, LAMPS_OFF } from "../car/carRig";
import { useDrivingPose } from "../car/useDrivingPose";

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

// A headlight beam hung on one of the model's LightAnchor_Head_* empties,
// aimed straight ahead (+Z in car space).
// The GLTF scene is cached, so reuse a beam that's already attached.
function makeBeam(anchor: Object3D): SpotLight {
  const existing = anchor.children.find((c): c is SpotLight => c instanceof SpotLight);
  if (existing) return existing;
  const beam = new SpotLight("#ffe9c7", 0, 30, 0.42, 0.55, 2);
  beam.target.position.set(0, -0.9, 7);
  anchor.add(beam, beam.target);
  return beam;
}

interface Props {
  lightsOn?: boolean;
}

// Centered on the origin with the tires resting on y = 0. Inside a
// DriveProvider the wheels roll and the body rides over the road.
export default function CamaroModel({ lightsOn = false }: Props) {
  const { scene } = useGLTF(MODEL_URL, DRACO_URL);
  const { rig, beams } = useMemo(() => {
    scene.traverse((obj) => {
      if (!(obj instanceof Mesh)) return;
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach(fixTexturedBlending);
    });
    const rig = findCarRig(scene);
    const beams = ["Head_L", "Head_R"].flatMap((k) => (rig.anchors[k] ? [makeBeam(rig.anchors[k])] : []));
    return { rig, beams };
  }, [scene]);

  useDrivingPose(rig);

  useEffect(() => {
    applyLamps(rig, lightsOn ? LAMPS_DRIVING : LAMPS_OFF);
    for (const b of beams) b.intensity = lightsOn ? 250 : 0;
  }, [rig, beams, lightsOn]);

  return (
    <Center top>
      <primitive object={scene} />
    </Center>
  );
}

useGLTF.preload(MODEL_URL, DRACO_URL);
