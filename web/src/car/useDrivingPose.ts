import { useLayoutEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Quaternion, Vector3 } from "three";
import { applyLamps, applyPose, LAMPS_DRIVING, LAMPS_OFF, type CarPose, type CarRig } from "./carRig";
import { driveState, useDrive, type DriveProfile } from "./driveClock";
import { bodyMotion, CAMARO_CHASSIS, Suspension, type Chassis } from "./suspension";

const REST: CarPose = { steer: 0, wheelSpin: 0, roll: 0, pitch: 0, heave: 0 };

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

// How far ahead of the rear axle the body's pivot sits, from the rig.
function pivotOf(rig: CarRig) {
  const rear = (rig.hubs.RL.position.z + rig.hubs.RR.position.z) / 2;
  const front = (rig.hubs.FL.position.z + rig.hubs.FR.position.z) / 2;
  return { pivot: rig.body.position.z - rear, wheelbase: front - rear };
}

interface Options {
  lightsOn: boolean;
  chassis?: Chassis;
  profile?: DriveProfile; // follow this motion instead of the DriveProvider's (e.g. a second car)
}

// While inside a moving DriveProvider: rolls the wheels, steers into the
// road's curvature, leans the body in corners, shifts its weight onto the
// springs as it speeds up and slows down, tilts the whole car with the grade,
// floats it over small road imperfections and lights the brake lamps while
// slowing. Restores the rest pose afterwards, since the GLTF scene is cached
// and shared with static scenes.
export function useDrivingPose(rig: CarRig, { lightsOn, chassis = CAMARO_CHASSIS, profile }: Options) {
  const drive = useDrive();
  const suspension = useMemo(() => new Suspension(chassis), [chassis]);
  const geometry = useMemo(() => pivotOf(rig), [rig]);

  useFrame(({ clock }) => {
    if (!drive.moving) return;
    const t = clock.elapsedTime - drive.t0;
    const stateAt = (time: number) => (profile ? profile.state(time) : driveState(drive, time + drive.t0));
    const s = stateAt(t);
    const d = s.distance;
    const k = drive.roughness;
    const lateral = s.speed * s.speed * s.curvature;
    const travel = suspension.update(t, (time) => stateAt(time).accel);
    const body = bodyMotion(travel, geometry.wheelbase, geometry.pivot);
    applyPose(rig, {
      steer: Math.atan(rig.wheelbase * s.curvature),
      wheelSpin: (d / rig.wheelRadius) % (2 * Math.PI),
      rearSpin: ((s.spin ?? 0) / rig.wheelRadius) % (2 * Math.PI),
      heave:
        body.heave +
        k * bumps(d, [
          [0.0018, 7.3, 0],
          [0.001, 3.1, 1.7],
          [0.0012, 17.9, 4.2],
        ]),
      pitch:
        body.pitch +
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
