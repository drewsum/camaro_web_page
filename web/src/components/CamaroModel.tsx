import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Center, useGLTF } from "@react-three/drei";
import { Mesh, Vector3, type Material, type MeshPhysicalMaterial, type MeshStandardMaterial } from "three";
import { markCar } from "../car/layers";
import { applyLamps, findCarRig, LAMPS_DRIVING, LAMPS_OFF } from "../car/carRig";
import { useDrivingPose } from "../car/useDrivingPose";
import { makeDomeLight, makeHeadBeams, makeLampGlows, setDomeLight, updateLampGlows } from "../car/lampGlow";

export const MODEL_URL = "/models/camaro.glb";
export const DRACO_URL = "/draco/";

// Blender exports textured materials whose image has an alpha channel (Interior,
// Chassis, Engine, ...) as alpha BLEND. Blended meshes are depth-sorted per object
// and don't occlude each other, so the interior flickers and the underbody shows
// through it. Render those as opaque with an alpha cutout instead; untextured
// glass and lens materials keep blending.
export function fixTexturedBlending(material: Material) {
  const m = material as MeshStandardMaterial;
  if (!m.transparent || !m.map) return;
  m.transparent = false;
  m.depthWrite = true;
  m.alphaTest = 0.5;
  m.needsUpdate = true;
}

// Blender's Transmission comes through as MeshPhysicalMaterial.transmission,
// and a single transmissive material makes three render every opaque object
// in the scene a second time each frame (into a texture for the glass to
// refract). The car's glass is thin, unrefracting and already alpha-blended
// (and the lenses barely transmissive), so it looks the same blended alone.
export function dropTransmission(material: Material) {
  const m = material as MeshPhysicalMaterial;
  if (!m.transmission) return;
  m.transmission = 0;
  m.needsUpdate = true;
}

// Badges, emblems, lamp internals and the wheel-arch lips are dense (about a
// third of the Camaro's triangles) but tiny or skin-tight, and the engines
// sit under closed hoods: at the sun shadow map's ~3 cm texels their shadows
// vanish inside the body's, so drawing them into it every frame buys
// nothing. Used for every car model.
export function castsVisibleShadow(mesh: Mesh) {
  if (/WheelArch_trim|engine/i.test(mesh.name)) return false;
  mesh.geometry.computeBoundingBox();
  const size = mesh.geometry.boundingBox!.getSize(new Vector3()).multiply(mesh.getWorldScale(new Vector3()));
  return Math.max(size.x, size.y, size.z) >= 0.3;
}

interface Props {
  lightsOn?: boolean;
  domeOn?: boolean;
}

// Centered on the origin with the tires resting on y = 0. Inside a
// DriveProvider the wheels roll and the body rides over the road.
export default function CamaroModel({ lightsOn = false, domeOn = false }: Props) {
  const { scene } = useGLTF(MODEL_URL, DRACO_URL);
  const { rig, beams, glows, dome } = useMemo(() => {
    scene.traverse((obj) => {
      if (!(obj instanceof Mesh)) return;
      obj.castShadow = castsVisibleShadow(obj); // for scenes with a shadow-casting sun
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach(fixTexturedBlending);
      materials.forEach(dropTransmission);
    });
    markCar(scene);
    const rig = findCarRig(scene);
    const beams = makeHeadBeams(rig, scene);
    return { rig, beams, glows: makeLampGlows(rig, scene), dome: makeDomeLight(rig, scene) };
  }, [scene]);

  useDrivingPose(rig, { lightsOn });
  useFrame(() => updateLampGlows(glows));

  useEffect(() => {
    applyLamps(rig, lightsOn ? LAMPS_DRIVING : LAMPS_OFF);
    for (const b of beams) b.intensity = lightsOn ? 250 : 0;
  }, [rig, beams, lightsOn]);

  useEffect(() => setDomeLight(dome, domeOn), [dome, domeOn]);

  return (
    <Center top>
      <primitive object={scene} />
    </Center>
  );
}

useGLTF.preload(MODEL_URL, DRACO_URL);
