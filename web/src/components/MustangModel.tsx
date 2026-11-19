import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Mesh } from "three";
import { applyLamps, findCarRig, LAMPS_DRIVING, LAMPS_OFF } from "../car/carRig";
import { useDrivingPose } from "../car/useDrivingPose";
import { MUSTANG_CHASSIS } from "../car/suspension";
import type { DriveProfile } from "../car/driveClock";
import { castsVisibleShadow, DRACO_URL, dropTransmission, fixTexturedBlending } from "./CamaroModel";
import { markCar } from "../car/layers";
import { makeHeadBeams, makeLampGlows, updateLampGlows } from "../car/lampGlow";

// Ddiaz Design's '69 Mach 1 428 Cobra Jet (CC BY-NC-SA 4.0), rigged like the
// Camaro by scripts/build_mustang.py. Origin between the wheels at ground
// level, nose toward +Z. Only one scene shows it at a time, so the cached
// GLTF scene is used directly, like CamaroModel does.
export const MUSTANG_URL = "/models/mustang.glb";

interface Props {
  lightsOn?: boolean;
  profile?: DriveProfile; // its own run on the shared drive clock; parked without one
}

export default function MustangModel({ lightsOn = false, profile }: Props) {
  const { scene } = useGLTF(MUSTANG_URL, DRACO_URL);
  const { rig, beams, glows } = useMemo(() => {
    scene.traverse((obj) => {
      if (!(obj instanceof Mesh)) return;
      obj.castShadow = castsVisibleShadow(obj);
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach(fixTexturedBlending);
      materials.forEach(dropTransmission);
    });
    markCar(scene);
    const rig = findCarRig(scene, "Mustang");
    // Real light from its lamps, as on the Camaro: headlight beams down the
    // lane, and a red glow behind that brightens when it brakes.
    return { rig, beams: makeHeadBeams(rig, scene), glows: makeLampGlows(rig, scene) };
  }, [scene]);

  useDrivingPose(rig, { lightsOn, chassis: MUSTANG_CHASSIS, profile });

  useFrame(() => updateLampGlows(glows));

  useEffect(() => {
    applyLamps(rig, lightsOn ? LAMPS_DRIVING : LAMPS_OFF);
    for (const b of beams) b.intensity = lightsOn ? 250 : 0;
  }, [rig, beams, lightsOn]);

  return <primitive object={scene} />;
}

useGLTF.preload(MUSTANG_URL, DRACO_URL);
