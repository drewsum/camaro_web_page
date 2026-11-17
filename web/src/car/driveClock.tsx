import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useThree } from "@react-three/fiber";

// Driving scenes keep the car at the origin and scroll the world past it.
// Everything that moves (wheels, suspension, road, scenery) derives its state
// from the same distance travelled, computed from the shared R3F clock, so the
// car and the world never drift out of step regardless of render order.
interface Drive {
  speed: number; // m/s, along the car's +Z
  roughness: number; // scales the suspension motion; 1 = smooth fresh pavement
  t0: number; // clock time when the drive started
}

const DriveContext = createContext<Drive>({ speed: 0, roughness: 1, t0: 0 });

interface ProviderProps {
  speed: number;
  roughness?: number;
  children: ReactNode;
}

export function DriveProvider({ speed, roughness = 1, children }: ProviderProps) {
  const clock = useThree((s) => s.clock);
  const value = useMemo(() => ({ speed, roughness, t0: clock.elapsedTime }), [speed, roughness, clock]);
  return <DriveContext.Provider value={value}>{children}</DriveContext.Provider>;
}

export function useDrive() {
  return useContext(DriveContext);
}

// Distance travelled (metres) at a given clock time.
export function driveDistance(drive: Drive, elapsed: number) {
  return drive.speed * (elapsed - drive.t0);
}
