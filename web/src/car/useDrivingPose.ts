import { useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { applyPose, type CarPose, type CarRig } from "./carRig";
import { driveDistance, useDrive } from "./driveClock";

const REST: CarPose = { steer: 0, wheelSpin: 0, roll: 0, pitch: 0, heave: 0 };

// Sum of sines with incommensurate wavelengths (metres) so the road texture
// never visibly repeats.
function bumps(d: number, waves: [number, number, number][]) {
  let v = 0;
  for (const [amp, wavelength, phase] of waves) v += amp * Math.sin((d / wavelength) * 2 * Math.PI + phase);
  return v;
}

// Rolls the wheels and floats the body over small road imperfections while
// inside a DriveProvider with a non-zero speed. Restores the rest pose after,
// since the GLTF scene is cached and shared with the static scenes.
export function useDrivingPose(rig: CarRig) {
  const drive = useDrive();
  const moving = drive.speed !== 0;

  useFrame(({ clock }) => {
    if (!moving) return;
    const d = driveDistance(drive, clock.elapsedTime);
    const k = drive.roughness;
    applyPose(rig, {
      steer: 0,
      wheelSpin: (d / rig.wheelRadius) % (2 * Math.PI),
      heave: k * bumps(d, [
        [0.0018, 7.3, 0],
        [0.0010, 3.1, 1.7],
        [0.0012, 17.9, 4.2],
      ]),
      pitch: k * bumps(d, [
        [0.0006, 5.3, 2.1],
        [0.0004, 13.7, 0.4],
      ]),
      roll: k * bumps(d, [
        [0.0004, 9.1, 3.3],
        [0.0002, 4.3, 0.9],
      ]),
    });
  });

  useEffect(() => {
    if (moving) return () => applyPose(rig, REST);
  }, [rig, moving]);
}
