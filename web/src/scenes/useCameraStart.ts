import { useEffect } from "react";
import { useThree } from "@react-three/fiber";

// Puts the camera at a scene's starting viewpoint when the scene mounts.
export function useCameraStart(x: number, y: number, z: number) {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    camera.position.set(x, y, z);
    camera.lookAt(0, 0, 0);
  }, [camera, x, y, z]);
}
