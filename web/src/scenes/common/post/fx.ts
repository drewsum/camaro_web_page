import { Box3, Color, Matrix4, Vector3 } from "three";

// What the post-processing (PostFX) needs to know about the scene each frame,
// written by whatever owns it: the sky registers its sun (SunGlare), the
// driving car its motion (useDrivingPose). Module state rather than React
// context because the composer lives in App, above the scenes, and reads it
// every frame.

export interface FxSun {
  dir: Vector3; // unit direction toward the sun, world space, with the sky turned by skyYaw
  skyYaw: number; // the sky's turn about the vertical that dir is for; driving scenes turn the sky further
                  // as the road bends (scene.backgroundRotation), and the sun has to turn with it
  color: Color; // the sunlight's colour (normalised)
  horizon: Color; // linear sky colour just above the horizon
  strength: number; // 0..1, how hard the sun is
}

export interface FxCar {
  inverse: Matrix4; // world → the car's own frame
  box: Box3; // the car's bounds in its own frame
  wheels: Vector3[]; // wheel centres in world space: FL, FR, RL, RR
  axis: Vector3; // the axles' direction in world space
  radius: number; // tyre radius, m
  spin: [number, number]; // front and rear wheels' spin, rad/s
  velocity: Vector3; // how fast the car actually moves through the scene, m/s
  travel: Vector3; // its driving speed along its heading, m/s (in a driving scene the world moves instead)
}

export const fx = {
  sun: null as FxSun | null,
  car: null as FxCar | null,
};

export function newCar(): FxCar {
  return {
    inverse: new Matrix4(),
    box: new Box3(),
    wheels: [new Vector3(), new Vector3(), new Vector3(), new Vector3()],
    axis: new Vector3(1, 0, 0),
    radius: 0.33,
    spin: [0, 0],
    velocity: new Vector3(),
    travel: new Vector3(),
  };
}

// Per-scene settings, from the scene list (scenes/index.ts).
export interface PostSettings {
  motionBlur?: boolean; // the world streams past a car parked at the origin (a driving scene)
  heatHaze?: number; // 0..1 shimmer over hot ground near the horizon
  haze?: number; // 0..1 sun-tinted aerial haze (default 1)
  hazeDistance?: number; // m over which the haze builds (default 900)
}
