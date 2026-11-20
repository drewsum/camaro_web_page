import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { driveState, useDrive } from "../car/driveClock";
import { Drivetrain } from "./drivetrain";
import { enginePlayer } from "./enginePlayer";

// Drives the engine sound from the scene's motion. Lives beside the Camaro,
// so it sees the scene's DriveProvider (or none: parked, idling).
export function EngineSound() {
  const drive = useDrive();
  const drivetrain = useMemo(() => new Drivetrain(), [drive]);
  useFrame(({ clock, camera }, dt) => {
    if (!enginePlayer.enabled) return;
    drivetrain.update(driveState(drive, clock.elapsedTime), dt);
    enginePlayer.update(drivetrain.rpm, drivetrain.throttle, camera.position.length());
  });
  return null;
}
