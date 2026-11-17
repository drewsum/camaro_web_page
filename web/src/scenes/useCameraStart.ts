import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// Puts the camera at a scene's starting viewpoint when the scene mounts,
// looking at `targetY` above the car (which the orbit controls then circle).
export function useCameraStart(x: number, y: number, z: number, targetY = 0) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControls | null;
  useEffect(() => {
    camera.position.set(x, y, z);
    camera.lookAt(0, targetY, 0);
    if (controls?.target) {
      controls.target.set(0, targetY, 0);
      controls.update();
    }
  }, [camera, controls, x, y, z, targetY]);
}
