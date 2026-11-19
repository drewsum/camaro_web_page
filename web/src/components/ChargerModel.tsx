import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { Mesh } from "three";
import { DRACO_URL, dropTransmission, fixTexturedBlending } from "./CamaroModel";
import { markCar } from "../car/layers";

// Ddiaz Design's '69 Dodge Charger R/T (CC BY-NC-SA 4.0), prepared by
// scripts/build_charger.py: real size, origin between the wheels at ground
// level, nose toward +Z. It only ever sits parked, so it has no rig.
export const CHARGER_URL = "/models/charger.glb";

export default function ChargerModel() {
  const { scene } = useGLTF(CHARGER_URL, DRACO_URL);
  useMemo(() => {
    scene.traverse((obj) => {
      if (!(obj instanceof Mesh)) return;
      obj.castShadow = true;
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach(fixTexturedBlending);
      materials.forEach(dropTransmission);
    });
    markCar(scene);
  }, [scene]);
  return <primitive object={scene} />;
}

useGLTF.preload(CHARGER_URL, DRACO_URL);
