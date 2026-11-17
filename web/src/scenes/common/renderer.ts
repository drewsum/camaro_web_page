import { useLayoutEffect } from "react";
import { useThree } from "@react-three/fiber";
import { PerspectiveCamera } from "three";

// Extends the camera's far plane while the scene is mounted (default is 1000 m).
export function useFarPlane(far: number) {
  const camera = useThree((s) => s.camera);
  useLayoutEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    const prev = camera.far;
    camera.far = far;
    camera.updateProjectionMatrix();
    return () => {
      camera.far = prev;
      camera.updateProjectionMatrix();
    };
  }, [camera, far]);
}

// Sets tone-mapping exposure while the scene is mounted; outdoor skies need less.
export function useExposure(exposure: number) {
  const gl = useThree((s) => s.gl);
  useLayoutEffect(() => {
    const prev = gl.toneMappingExposure;
    gl.toneMappingExposure = exposure;
    return () => {
      gl.toneMappingExposure = prev;
    };
  }, [gl, exposure]);
}
