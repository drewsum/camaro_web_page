import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useThree } from "@react-three/fiber";

// Driving scenes keep the car at the origin and move the world past it.
// Everything that moves (wheels, suspension, road, scenery) derives its state
// from the same motion profile evaluated on the shared R3F clock, so the car
// and the world never drift out of step regardless of render order.

export interface DriveState {
  distance: number; // metres travelled since the drive started
  speed: number; // m/s
  accel: number; // m/s², + = speeding up
  curvature: number; // 1/m of the path at the car, + = turning left
  grade: number; // rise over run of the road at the car, + = uphill
  braking?: boolean; // foot on the brake regardless of accel (e.g. waiting at a light)
  spin?: number; // metres of extra tread the rear tyres have spun through (wheelspin)
}

// Where the car is t seconds after the drive started.
export interface DriveProfile {
  state(t: number): DriveState;
}

export function constantSpeed(speed: number): DriveProfile {
  return { state: (t) => ({ distance: speed * t, speed, accel: 0, curvature: 0, grade: 0 }) };
}

const PARKED = constantSpeed(0);

export interface Drive {
  profile: DriveProfile;
  moving: boolean;
  roughness: number; // scales the suspension motion; 1 = smooth fresh pavement
  t0: number; // clock time when the drive started
}

const DriveContext = createContext<Drive>({ profile: PARKED, moving: false, roughness: 1, t0: 0 });

type ProviderProps = { roughness?: number; children: ReactNode } & ({ speed: number } | { profile: DriveProfile });

export function DriveProvider(props: ProviderProps) {
  const { roughness = 1, children } = props;
  const clock = useThree((s) => s.clock);
  const speed = "speed" in props ? props.speed : undefined;
  const given = "profile" in props ? props.profile : undefined;
  const value = useMemo(() => {
    const profile = given ?? constantSpeed(speed ?? 0);
    return { profile, moving: profile !== PARKED && speed !== 0, roughness, t0: clock.elapsedTime };
  }, [given, speed, roughness, clock]);
  return <DriveContext.Provider value={value}>{children}</DriveContext.Provider>;
}

export function useDrive() {
  return useContext(DriveContext);
}

export function driveState(drive: Drive, elapsed: number) {
  return drive.profile.state(elapsed - drive.t0);
}

// Distance travelled (metres) at a given clock time.
export function driveDistance(drive: Drive, elapsed: number) {
  return driveState(drive, elapsed).distance;
}
