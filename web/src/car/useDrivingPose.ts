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
    applyPose(rig, {
      steer: 0,
      wheelSpin: (d / rig.wheelRadius) % (2 * Math.PI),
      heave: bumps(d, [
        [0.006, 7.3, 0],
        [0.004, 3.1, 1.7],
        [0.003, 17.9, 4.2],
      ]),
      pitch: bumps(d, [
        [0.0025, 5.3, 2.1],
        [0.0015, 13.7, 0.4],
      ]),
      roll: bumps(d, [
        [0.0015, 9.1, 3.3],
        [0.001, 4.3, 0.9],
      ]),
    });
  });

  useEffect(() => {
    if (moving) return () => applyPose(rig, REST);
  }, [rig, moving]);
}
