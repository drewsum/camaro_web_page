import { useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { Mesh } from "three";
import { applyLamps, findCarRig, LAMPS_DRIVING, LAMPS_OFF } from "../car/carRig";
import { useDrivingPose } from "../car/useDrivingPose";
import { MUSTANG_CHASSIS } from "../car/suspension";
import type { DriveProfile } from "../car/driveClock";
import { DRACO_URL, fixTexturedBlending } from "./CamaroModel";

// Ddiaz Design's '69 Mach 1 428 Cobra Jet (CC BY-NC-SA 4.0), rigged like the
// Camaro by scripts/build_mustang.py. Origin between the wheels at ground
// level, nose toward +Z.
export const MUSTANG_URL = "/models/mustang.glb";

interface Props {
  lightsOn?: boolean;
  profile: DriveProfile; // its own run, on the shared drive clock
}

export default function MustangModel({ lightsOn = false, profile }: Props) {
  const { scene } = useGLTF(MUSTANG_URL, DRACO_URL);
  const rig = useMemo(() => {
    scene.traverse((obj) => {
      if (!(obj instanceof Mesh)) return;
      obj.castShadow = true;
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach(fixTexturedBlending);
    });
    return findCarRig(scene, "Mustang");
  }, [scene]);

  useDrivingPose(rig, { lightsOn, chassis: MUSTANG_CHASSIS, profile });

  useEffect(() => applyLamps(rig, lightsOn ? LAMPS_DRIVING : LAMPS_OFF), [rig, lightsOn]);

  return <primitive object={scene} />;
}

useGLTF.preload(MUSTANG_URL, DRACO_URL);
