import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useThree } from "@react-three/fiber";

// Driving scenes keep the car at the origin and scroll the world past it.
// Everything that moves (wheels, suspension, road, scenery) derives its state
// from the same distance travelled, computed from the shared R3F clock, so the
// car and the world never drift out of step regardless of render order.
interface Drive {
  speed: number; // m/s, along the car's +Z
  t0: number; // clock time when the drive started
}

const DriveContext = createContext<Drive>({ speed: 0, t0: 0 });

export function DriveProvider({ speed, children }: { speed: number; children: ReactNode }) {
  const clock = useThree((s) => s.clock);
  const value = useMemo(() => ({ speed, t0: clock.elapsedTime }), [speed, clock]);
  return <DriveContext.Provider value={value}>{children}</DriveContext.Provider>;
}

export function useDrive() {
  return useContext(DriveContext);
}

// Distance travelled (metres) at a given clock time.
export function driveDistance(drive: Drive, elapsed: number) {
  return drive.speed * (elapsed - drive.t0);
}
