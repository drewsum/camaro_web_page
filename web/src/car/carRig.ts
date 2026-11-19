import { Color, Mesh, MeshStandardMaterial, Object3D, Quaternion, Vector3 } from "three";

// Handles to the animatable parts of camaro.glb. The Blender file is rigged as:
//
//   Camaro                  root: move/turn this to drive (forward = +Z, up = +Y, driver side = +X)
//   ├─ Body                 sprung mass: roll about Z, pitch about X, offset Y for squat/dive
//   │  ├─ SteeringWheel     turns about its local Y (the column axis) on top of its rest rotation
//   │  └─ LightAnchor_*     empties at the headlamps / reverse lamps for real three.js lights
//   ├─ Hub_FL / Hub_FR      steer about Y (Hub_RL / Hub_RR don't steer); offset Y for suspension travel
//   │  ├─ brake caliper     (does not spin)
//   │  └─ Wheel_XX          spins about X: +angle rolls the car forward
//
// Lamps are per-side materials named Lamp_<Role>_<L|R>, exported switched off.
// Their glTF extras carry lamp_role, lamp_side, lamp_color and intensity_<preset>.

export type WheelId = "FL" | "FR" | "RL" | "RR";
export const WHEELS: WheelId[] = ["FL", "FR", "RL", "RR"];

export interface CarRig {
  root: Object3D;
  rootRest: Quaternion;
  body: Object3D;
  bodyRestY: number;
  steeringWheel: Object3D;
  steeringWheelRest: Quaternion;
  hubs: Record<WheelId, Object3D>;
  wheels: Record<WheelId, Object3D>;
  lamps: MeshStandardMaterial[];
  anchors: Record<string, Object3D>;
  wheelRadius: number;
  wheelbase: number;
  trackFront: number;
  maxSteer: number; // radians
  steeringRatio: number;
}

function need(scene: Object3D, name: string): Object3D {
  const o = scene.getObjectByName(name);
  if (!o) throw new Error(`car model is missing rig node "${name}"`);
  return o;
}

// The pose the model was exported in. The GLTF scene is cached and shared by
// every scene, and a driving scene may still be holding the car tilted on a
// hill or mid-bump when the next one rigs it, so the rest pose is read once,
// before anything has moved it.
interface RestPose {
  root: Quaternion;
  bodyY: number;
  steeringWheel: Quaternion;
}
const restPoses = new WeakMap<Object3D, RestPose>();

// rootName is the top rig node: "Camaro" in camaro.glb, "Mustang" in mustang.glb
// (built by scripts/build_mustang.py with the same layout).
export function findCarRig(scene: Object3D, rootName = "Camaro"): CarRig {
  const root = need(scene, rootName);
  const body = need(scene, "Body");
  const steeringWheel = need(scene, "SteeringWheel");
  let rest = restPoses.get(root);
  if (!rest) {
    rest = { root: root.quaternion.clone(), bodyY: body.position.y, steeringWheel: steeringWheel.quaternion.clone() };
    restPoses.set(root, rest);
  }
  const meta = root.userData as Record<string, number>;
  const lampSet = new Set<MeshStandardMaterial>();
  const anchors: Record<string, Object3D> = {};
  scene.traverse((o) => {
    if (o.name.startsWith("LightAnchor_")) anchors[o.name.slice("LightAnchor_".length)] = o;
    if (!(o instanceof Mesh)) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) if (m.name.startsWith("Lamp_")) lampSet.add(m as MeshStandardMaterial);
  });
  const lamps = [...lampSet];
  for (const m of lamps) {
    m.emissive = new Color(...(m.userData.lamp_color as [number, number, number]));
    m.emissiveIntensity = 0;
    // ACES tone mapping skews a bright saturated red toward orange, so lit
    // tail and brake lamps read amber in daylight. Keep the red lamps out of it.
    if (m.userData.lamp_role === "tail" || m.userData.lamp_role === "marker_rear") m.toneMapped = false;
  }
  const byId = (prefix: string) =>
    Object.fromEntries(WHEELS.map((w) => [w, need(scene, prefix + w)])) as Record<WheelId, Object3D>;
  return {
    root,
    rootRest: rest.root,
    body,
    bodyRestY: rest.bodyY,
    steeringWheel,
    steeringWheelRest: rest.steeringWheel,
    hubs: byId("Hub_"),
    wheels: byId("Wheel_"),
    lamps,
    anchors,
    wheelRadius: meta.wheel_radius ?? 0.328,
    wheelbase: meta.wheelbase ?? 2.76,
    trackFront: meta.track_front ?? 1.56,
    maxSteer: ((meta.max_steer_deg ?? 30) * Math.PI) / 180,
    steeringRatio: meta.steering_ratio ?? 24,
  };
}

// ---- Lights -------------------------------------------------------------

export interface LampState {
  headlights: "off" | "low" | "high";
  parkLights: boolean; // park lamps, side markers and tail lamps (also on with the headlights)
  brake: boolean;
  reverse: boolean;
  turnLeft: boolean; // pass the blink phase in, e.g. turnLeft && blinkOn
  turnRight: boolean;
}

export const LAMPS_OFF: LampState = {
  headlights: "off",
  parkLights: false,
  brake: false,
  reverse: false,
  turnLeft: false,
  turnRight: false,
};

export const LAMPS_DRIVING: LampState = { ...LAMPS_OFF, headlights: "low", parkLights: true };

// Wired like a '68: the rear turn signal and brake share the tail lamp, and
// the front turn signal is the amber park lamp.
export function applyLamps(rig: CarRig, s: LampState) {
  const running = s.parkLights || s.headlights !== "off";
  for (const m of rig.lamps) {
    const d = m.userData as Record<string, number | string>;
    const p = (k: string) => (d["intensity_" + k] as number) ?? 0;
    const turning = d.lamp_side === "L" ? s.turnLeft : s.turnRight;
    let v = 0;
    switch (d.lamp_role) {
      case "headlight":
        v = s.headlights === "off" ? 0 : p(s.headlights);
        break;
      case "tail":
        v = turning || s.brake ? p("brake") : running ? p("tail") : 0;
        break;
      case "park_turn":
        v = turning ? p("turn") : running ? p("park") : 0;
        break;
      case "marker_front":
      case "marker_rear":
        v = running ? p("on") : 0;
        break;
      case "reverse":
        v = s.reverse ? p("on") : 0;
        break;
    }
    m.emissiveIntensity = v;
  }
}

// ---- Pose ---------------------------------------------------------------

export interface CarPose {
  steer: number; // road-wheel angle in radians, + = turning left
  wheelSpin: number; // accumulated rolling angle in radians (distance travelled / wheelRadius)
  roll: number; // body roll in radians, + = leaning right (outward in a left turn)
  pitch: number; // body pitch in radians, + = nose down (braking)
  heave: number; // body vertical offset in metres, - = lower
}

const UP = new Vector3(0, 1, 0);
const tmpQ = new Quaternion();

export function applyPose(rig: CarRig, p: CarPose) {
  const steer = Math.max(-rig.maxSteer, Math.min(rig.maxSteer, p.steer));
  // Ackermann geometry: the inside wheel turns tighter than the outside one.
  const wheelAngle = (side: 1 | -1) => {
    if (Math.abs(steer) < 1e-4) return 0;
    const r = rig.wheelbase / Math.tan(steer); // signed turn radius at the centreline
    return Math.atan(rig.wheelbase / (r - (side * rig.trackFront) / 2));
  };
  rig.hubs.FL.rotation.y = wheelAngle(1); // driver side is +X
  rig.hubs.FR.rotation.y = wheelAngle(-1);
  for (const w of Object.values(rig.wheels)) w.rotation.x = p.wheelSpin;

  rig.body.rotation.set(p.pitch, 0, p.roll);
  rig.body.position.y = rig.bodyRestY + p.heave;

  // The column axis points at the driver, so + is counter-clockwise from the seat.
  tmpQ.setFromAxisAngle(UP, steer * rig.steeringRatio);
  rig.steeringWheel.quaternion.copy(rig.steeringWheelRest).multiply(tmpQ);
}
