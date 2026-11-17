import { useLayoutEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Quaternion, Vector3 } from "three";
import { applyLamps, applyPose, LAMPS_DRIVING, LAMPS_OFF, type CarPose, type CarRig } from "./carRig";
import { driveState, useDrive } from "./driveClock";

const REST: CarPose = { steer: 0, wheelSpin: 0, roll: 0, pitch: 0, heave: 0 };

// Body motion per unit of acceleration: soft '60s springs.
const PITCH_PER_ACCEL = 0.008; // rad per m/s² (nose up when speeding up)
const MAX_SQUAT = 0.05; // rad; a hard launch shouldn't stand the car up
const ROLL_PER_LATERAL = 0.01; // rad per m/s² of cornering
const BRAKE_LIGHT_DECEL = 0.6; // m/s² of slowing before the brake lamps come on

// Sum of sines with incommensurate wavelengths (metres) so the road texture
// never visibly repeats.
function bumps(d: number, waves: [number, number, number][]) {
  let v = 0;
  for (const [amp, wavelength, phase] of waves) v += amp * Math.sin((d / wavelength) * 2 * Math.PI + phase);
  return v;
}

const X_AXIS = new Vector3(1, 0, 0);
const tmpQ = new Quaternion();

// While inside a moving DriveProvider: rolls the wheels, steers into the
// road's curvature, leans the body in corners, squats and dives with speed
// changes, tilts the whole car with the grade, floats it over small road
// imperfections and lights the brake lamps while slowing. Restores the rest
// pose afterwards, since the GLTF scene is cached and shared with static scenes.
export function useDrivingPose(rig: CarRig, lightsOn: boolean) {
  const drive = useDrive();

  useFrame(({ clock }) => {
    if (!drive.moving) return;
    const s = driveState(drive, clock.elapsedTime);
    const d = s.distance;
    const k = drive.roughness;
    const lateral = s.speed * s.speed * s.curvature;
    applyPose(rig, {
      steer: Math.atan(rig.wheelbase * s.curvature),
      wheelSpin: (d / rig.wheelRadius) % (2 * Math.PI),
      heave: k * bumps(d, [
        [0.0018, 7.3, 0],
        [0.0010, 3.1, 1.7],
        [0.0012, 17.9, 4.2],
      ]),
      pitch:
        Math.max(-MAX_SQUAT, Math.min(MAX_SQUAT, -PITCH_PER_ACCEL * s.accel)) +
        k * bumps(d, [
          [0.0006, 5.3, 2.1],
          [0.0004, 13.7, 0.4],
        ]),
      roll:
        ROLL_PER_LATERAL * lateral +
        k * bumps(d, [
          [0.0004, 9.1, 3.3],
          [0.0002, 4.3, 0.9],
        ]),
    });
    // Climbing tips the nose up: rotate about the car's lateral axis.
    rig.root.quaternion.copy(rig.rootRest).premultiply(tmpQ.setFromAxisAngle(X_AXIS, -Math.atan(s.grade)));
    applyLamps(rig, { ...(lightsOn ? LAMPS_DRIVING : LAMPS_OFF), brake: s.braking ?? s.accel < -BRAKE_LIGHT_DECEL });
  });

  // A layout effect, so the car is level again before the next scene's
  // <Center> measures it.
  useLayoutEffect(() => {
    if (!drive.moving) return;
    return () => {
      applyPose(rig, REST);
      rig.root.quaternion.copy(rig.rootRest);
    };
  }, [rig, drive.moving]);
}
