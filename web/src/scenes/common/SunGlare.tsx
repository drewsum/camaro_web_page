import { useLayoutEffect } from "react";
import type { Color, Vector3 } from "three";
import { fx } from "./post/fx";

// Puts the sky's sun in front of the camera: the HDRI skies have their sun
// clipped out (see hdri.ts), so the post-processing draws it back in with its
// lens glare and god rays (post/SunPass.ts) and tints the aerial haze by it
// (post/effects.ts). This just tells it where the sun is.
export default function SunGlare({
  sun,
  skyYaw,
  color,
  horizon,
  strength = 1,
}: {
  sun: Vector3;
  skyYaw: number;
  color: Color;
  horizon: Color;
  strength?: number;
}) {
  useLayoutEffect(() => {
    const entry = { dir: sun, skyYaw, color, horizon, strength };
    fx.sun = entry;
    return () => {
      if (fx.sun === entry) fx.sun = null;
    };
  }, [sun, skyYaw, color, horizon, strength]);
  return null;
}
