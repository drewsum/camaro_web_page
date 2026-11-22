import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { IDLE_RPM } from "./drivetrain";
import { enginePlayer } from "./enginePlayer";

// Engine sound for the Engine Model page: the 540 free-revving on the stand,
// following the crank-speed slider. The car scenes' EngineSound sits in the
// car viewer's canvas, which stops drawing while this page is open, so this
// one has the shared player to itself.
//
// The slider jumps; a real engine doesn't. The sound's rpm chases the slider
// as fast as an unloaded big block revs, on the throttle while it climbs and
// off it while it falls, and holds a light cruise throttle when steady.
// Below firing speed (the slow end, for following the valve events) the
// engine wouldn't be running, so the sound fades out.

const REV_UP = 9000; // rpm/s, unloaded, wide open
const REV_DOWN = 3500; // rpm/s, closed throttle
const STEADY_THROTTLE = 0.12; // holding revs with no load
const FIRE_LO = 450; // rpm: silent below
const FIRE_HI = 800; // rpm: full level above

export function EngineStandSound({ rpm }: { rpm: number }) {
  const sound = useRef({ rpm: IDLE_RPM, throttle: STEADY_THROTTLE, primed: false });
  useFrame(({ camera }, dt) => {
    if (!enginePlayer.enabled) return;
    const s = sound.current;
    dt = Math.min(dt, 0.25); // slow devices still keep up with the slider
    // Running from the start: begin at the slider, not revving up to it.
    if (!s.primed) {
      s.rpm = Math.max(rpm, IDLE_RPM);
      s.primed = true;
    }
    const target = Math.max(rpm, 0);
    const gap = target - s.rpm;
    let throttle = STEADY_THROTTLE;
    if (gap > 40) {
      s.rpm = Math.min(target, s.rpm + REV_UP * dt);
      throttle = 1;
    } else if (gap < -40) {
      s.rpm = Math.max(target, s.rpm - REV_DOWN * dt);
      throttle = 0;
    } else s.rpm = target;
    // Ease the pedal so a blip doesn't click between layers.
    s.throttle += (throttle - s.throttle) * Math.min(1, dt / 0.06);
    const level = Math.min(1, Math.max(0, (s.rpm - FIRE_LO) / (FIRE_HI - FIRE_LO)));
    enginePlayer.update(Math.max(s.rpm, IDLE_RPM * 0.6), s.throttle, camera.position.length(), level);
  });
  return null;
}
