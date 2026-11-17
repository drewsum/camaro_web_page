import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  Box3,
  Color,
  CylinderGeometry,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type Group,
  type Material,
  type Object3D,
} from "three";

// An older guy at a car show: a little unsteady on his feet, beer in his
// left hand, pointing things out on the car with his right. The bodies are
// Quaternius' "Ultimate Modular Men" (CC0), fetched at runtime from a GitHub
// mirror pinned to a commit (the repo is too big for jsDelivr). They ship
// rigged but unanimated, so the pose is driven bone by bone here.

const QUATERNIUS =
  "https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/0128ca510d653bb04d6d1e4885bd8890b5050b4f/public/glb/modular_men";
export const onlookerModel = (name: "Casual" | "Farmer" | "Worker" | "Adventurer" | "Beach" | "Suit") =>
  `${QUATERNIUS}/${name}.glb`;

export interface OnlookerProps {
  model: string;
  position: [number, number]; // x, z on the ground
  faceToward: Vector3; // he stands facing this point
  pointAt: Vector3[]; // spots on the car he points at, one per gesture in turn
  recolor?: Record<string, string>; // material name -> colour, e.g. greying the hair
  height?: number; // metres
  phase: number; // seconds; desynchronises the animation from the others
}

// 0 -> 1 -> 0 over [start, end] with `ease` seconds of smooth ramp at each end.
function window01(t: number, start: number, end: number, ease: number) {
  const up = Math.min(1, Math.max(0, (t - start) / ease));
  const down = Math.min(1, Math.max(0, (end - t) / ease));
  const w = Math.min(up, down);
  return w * w * (3 - 2 * w);
}

function bone(root: Object3D, name: string) {
  // GLTFLoader strips '.' from node names ("UpperArm.R" -> "UpperArmR").
  const b = root.getObjectByName(name) ?? root.getObjectByName(name.replace(".", ""));
  if (!b) throw new Error(`Onlooker rig is missing bone "${name}"`);
  return b;
}

const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpQ = new Quaternion();
const tmpQ2 = new Quaternion();
const tmpParent = new Quaternion();

// Turns `b` (from its rest pose) so the line from it to `child` points along
// the world direction `dir`. Works whatever axis the rig's bones use.
function aim(b: Object3D, child: Object3D, rest: Quaternion, dir: Vector3) {
  b.quaternion.copy(rest);
  b.updateWorldMatrix(true, true);
  const from = child.getWorldPosition(tmpA).sub(b.getWorldPosition(tmpB)).normalize();
  tmpQ.setFromUnitVectors(from, tmpB.copy(dir).normalize());
  b.getWorldQuaternion(tmpQ2).premultiply(tmpQ); // desired world rotation
  b.parent!.getWorldQuaternion(tmpParent).invert();
  b.quaternion.copy(tmpParent.multiply(tmpQ2));
  b.updateWorldMatrix(false, true);
}

// Rotates `b` from rest by a world-space rotation `q`.
function turnInWorld(b: Object3D, rest: Quaternion, q: Quaternion) {
  b.quaternion.copy(rest);
  b.updateWorldMatrix(true, false);
  b.getWorldQuaternion(tmpQ2).premultiply(q);
  b.parent!.getWorldQuaternion(tmpParent).invert();
  b.quaternion.copy(tmpParent.multiply(tmpQ2));
  b.updateWorldMatrix(false, true);
}

const can = new CylinderGeometry(0.033, 0.033, 0.122, 16);
const canMaterial = new MeshStandardMaterial({ color: "#c9ced4", metalness: 0.85, roughness: 0.3 });

export default function Onlooker({ model, position, faceToward, pointAt, recolor, height = 1.76, phase }: OnlookerProps) {
  const { scene } = useGLTF(model);
  const sway = useRef<Group>(null);

  const rig = useMemo(() => {
    const body = cloneSkinned(scene);
    body.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      o.castShadow = true;
      o.frustumCulled = false; // skinned bounds don't follow the pose
      const swap = (m: Material) => {
        const c = recolor?.[m.name];
        if (!c) return m;
        const copy = (m as MeshStandardMaterial).clone();
        copy.color = new Color(c);
        return copy;
      };
      o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    });
    // These rigs come out of FBX lying down (Z-up). Stand each one up from its
    // own bones (head above the feet), then turn him to face +Z. In these
    // exports the ".L" bones sit on the character's right, so that side goes
    // to -X.
    const at = (n: string) => bone(body, n).getWorldPosition(new Vector3());
    body.updateMatrixWorld(true);
    const feet = at("Foot.L").add(at("Foot.R")).multiplyScalar(0.5);
    body.quaternion.premultiply(new Quaternion().setFromUnitVectors(at("Head").sub(feet).normalize(), new Vector3(0, 1, 0)));
    body.updateMatrixWorld(true);
    const leftward = at("UpperArm.L").sub(at("UpperArm.R")).setY(0).normalize();
    body.quaternion.premultiply(new Quaternion().setFromUnitVectors(leftward, new Vector3(-1, 0, 0)));
    body.updateMatrixWorld(true);
    const box = new Box3().setFromObject(body);
    const size = box.getSize(new Vector3());
    // He points with his right hand (the arm on -X) and holds the beer in his left.
    const [right, left] = at("UpperArm.L").x < at("UpperArm.R").x ? ["L", "R"] : ["R", "L"];
    const b = {
      Head: bone(body, "Head"),
      "UpperArm.R": bone(body, `UpperArm.${right}`),
      "LowerArm.R": bone(body, `LowerArm.${right}`),
      "Hand.R": bone(body, `Hand.${right}`),
      "UpperArm.L": bone(body, `UpperArm.${left}`),
      "LowerArm.L": bone(body, `LowerArm.${left}`),
      "Hand.L": bone(body, `Hand.${left}`),
    };
    const rest = new Map<Object3D, Quaternion>(Object.values(b).map((o) => [o, o.quaternion.clone()]));
    const beer = new Mesh(can, canMaterial);
    beer.castShadow = true;
    const scale = height / size.y;
    // Stand on the ground, centred over the feet.
    const base = at("Foot.L").add(at("Foot.R")).multiplyScalar(0.5);
    const offset = new Vector3(-base.x, -box.min.y, -base.z).multiplyScalar(scale);
    return { body, scale, offset, b, rest, beer };
  }, [scene, recolor, height]);

  // The can hangs off the left hand; it's re-oriented upright every frame.
  useEffect(() => {
    rig.body.add(rig.beer);
    return () => void rig.body.remove(rig.beer);
  }, [rig]);

  const yaw = Math.atan2(faceToward.x - position[0], faceToward.z - position[1]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phase;
    const g = sway.current;
    if (!g) return;
    const { b, rest } = rig;

    // Unsteady sway from the ankles, never quite periodic.
    g.rotation.z = 0.045 * Math.sin(t * 0.83) + 0.02 * Math.sin(t * 2.17 + 1);
    g.rotation.x = 0.03 * Math.sin(t * 0.61 + 2) + 0.012 * Math.sin(t * 1.9);
    g.updateWorldMatrix(true, true);

    // Body axes in world space.
    const q = g.getWorldQuaternion(new Quaternion());
    const fwd = new Vector3(0, 0, 1).applyQuaternion(q);
    const left = new Vector3(1, 0, 0).applyQuaternion(q);
    const up = new Vector3(0, 1, 0).applyQuaternion(q);

    // Every 8 s, point at the next spot on the car for a few seconds.
    const cycle = 8;
    const k = Math.floor(t / cycle);
    const ct = t - k * cycle;
    const point = window01(ct, 1, 4.2, 0.45);
    const target = pointAt[k % pointAt.length];
    const sip = window01(ct, 5.4, 7.0, 0.5);

    // Right arm (on his -X side): hangs relaxed, or reaches toward the target.
    const shoulderR = b["UpperArm.R"].getWorldPosition(new Vector3());
    const toTarget = target.clone().sub(shoulderR).normalize();
    const hangR = up.clone().multiplyScalar(-1).addScaledVector(left, -0.18).addScaledVector(fwd, 0.05);
    aim(b["UpperArm.R"], b["LowerArm.R"], rest.get(b["UpperArm.R"])!, hangR.lerp(toTarget, point));
    const jab = point > 0.95 ? 0.15 * Math.max(0, Math.sin(ct * 9)) : 0;
    const foreR = up.clone().multiplyScalar(-1).addScaledVector(fwd, 0.35).lerp(toTarget, point).addScaledVector(up, jab);
    aim(b["LowerArm.R"], b["Hand.R"], rest.get(b["LowerArm.R"])!, foreR);

    // Left arm: can held at the belly, raised to the mouth for a sip.
    const hangL = up.clone().multiplyScalar(-1).addScaledVector(left, 0.2).addScaledVector(fwd, 0.25 + 0.75 * sip);
    aim(b["UpperArm.L"], b["LowerArm.L"], rest.get(b["UpperArm.L"])!, hangL);
    const elbowL = b["LowerArm.L"].getWorldPosition(new Vector3());
    const mouth = b["Head"].getWorldPosition(new Vector3()).addScaledVector(fwd, 0.12).addScaledVector(up, 0.02);
    const holdL = fwd.clone().addScaledVector(up, 0.35).addScaledVector(left, -0.25);
    aim(b["LowerArm.L"], b["Hand.L"], rest.get(b["LowerArm.L"])!, holdL.lerp(mouth.sub(elbowL).normalize(), sip));

    // Head: follow what he's pointing at (or the car), tip back to drink.
    const head = b["Head"];
    const headPos = head.getWorldPosition(new Vector3());
    const look = (point > 0.05 ? target : faceToward.clone().setY(0.7)).clone().sub(headPos).normalize();
    const turn = new Quaternion().setFromUnitVectors(fwd, look);
    turn.slerp(new Quaternion(), 0.25);
    turn.premultiply(new Quaternion().setFromAxisAngle(left, -0.5 * sip + 0.05 * Math.sin(t * 1.3)));
    turnInWorld(head, rest.get(head)!, turn);

    // Keep the can upright in the left hand (tipped up while drinking).
    const hand = b["Hand.L"];
    const handPos = hand.getWorldPosition(new Vector3()).addScaledVector(fwd, 0.03);
    rig.body.worldToLocal(rig.beer.position.copy(handPos));
    const canUp = up.clone().addScaledVector(fwd, -1.6 * sip).normalize();
    const world = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), canUp);
    rig.body.getWorldQuaternion(tmpParent).invert();
    rig.beer.quaternion.copy(tmpParent.multiply(world));
    rig.beer.scale.setScalar(1 / rig.scale);
  });

  return (
    <group position={[position[0], 0, position[1]]} rotation-y={yaw}>
      <group ref={sway}>
        <primitive object={rig.body} scale={rig.scale} position={rig.offset} />
      </group>
    </group>
  );
}
