import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CanvasTexture, Matrix4, Quaternion, RepeatWrapping, SRGBColorSpace, Vector3, type Group } from "three";

// A stylised older guy at a car show: a little unsteady on his feet, beer in
// his left hand, pointing things out on the car with his right. Built from
// primitives and animated procedurally, so nothing has to be downloaded.
//
// The figure faces local +Z with +Y up, so his right side is -X. Limbs hang
// along -Y from their joints; rotating a joint by a negative angle about X
// swings the limb forward.

export interface OnlookerProps {
  position: [number, number]; // x, z on the ground
  faceToward: Vector3; // he stands facing this point
  pointAt: Vector3[]; // spots on the car he points at, one per gesture in turn
  shirt: string | [string, string]; // solid colour, or two colours for flannel
  pants?: string;
  cap: string;
  skin: string;
  phase: number; // seconds; desynchronises the animation from the others
}

const DOWN = new Vector3(0, -1, 0);

function makePlaid(a: string, b: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d")!;
  g.fillStyle = a;
  g.fillRect(0, 0, 32, 32);
  g.globalAlpha = 0.55;
  g.fillStyle = b;
  g.fillRect(0, 10, 32, 10);
  g.fillRect(10, 0, 10, 32);
  g.globalAlpha = 0.35;
  g.fillStyle = "#f2efe6";
  g.fillRect(0, 26, 32, 2);
  g.fillRect(26, 0, 2, 32);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}

// 0 -> 1 -> 0 over [start, end] with `ease` seconds of smooth ramp at each end.
function window01(t: number, start: number, end: number, ease: number) {
  const up = Math.min(1, Math.max(0, (t - start) / ease));
  const down = Math.min(1, Math.max(0, (end - t) / ease));
  const w = Math.min(up, down);
  return w * w * (3 - 2 * w);
}

const tmpTarget = new Vector3();
const tmpShoulder = new Vector3();
const tmpQ = new Quaternion();
const tmpM = new Matrix4();

export default function Onlooker({ position, faceToward, pointAt, shirt, pants = "#3b4f70", cap, skin, phase }: OnlookerProps) {
  const body = useRef<Group>(null);
  const head = useRef<Group>(null);
  const rShoulder = useRef<Group>(null);
  const rElbow = useRef<Group>(null);
  const lShoulder = useRef<Group>(null);
  const lElbow = useRef<Group>(null);

  const shirtMap = useMemo(() => (Array.isArray(shirt) ? makePlaid(shirt[0], shirt[1]) : null), [shirt]);
  const shirtColor = Array.isArray(shirt) ? "#ffffff" : shirt;
  const yaw = Math.atan2(faceToward.x - position[0], faceToward.z - position[1]);
  const restQ = useMemo(() => new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.12), []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phase;
    if (!body.current || !head.current || !rShoulder.current || !rElbow.current || !lShoulder.current || !lElbow.current) return;

    // Unsteady sway from the ankles, never quite periodic.
    body.current.rotation.z = 0.05 * Math.sin(t * 0.83) + 0.025 * Math.sin(t * 2.17 + 1);
    body.current.rotation.x = 0.035 * Math.sin(t * 0.61 + 2) + 0.015 * Math.sin(t * 1.9);

    // Every 8 s: point at the next spot on the car for a few seconds, jabbing.
    const cycle = 8;
    const k = Math.floor(t / cycle);
    const ct = t - k * cycle;
    const point = window01(ct, 1, 4.2, 0.45);
    const target = pointAt[k % pointAt.length];

    // Aim the right upper arm along the line from the shoulder to the target,
    // expressed in the shoulder's parent frame.
    const parent = rShoulder.current.parent!;
    rShoulder.current.getWorldPosition(tmpShoulder);
    tmpTarget.copy(target).sub(tmpShoulder).normalize();
    tmpM.extractRotation(parent.matrixWorld).invert();
    tmpTarget.applyMatrix4(tmpM).normalize();
    tmpQ.setFromUnitVectors(DOWN, tmpTarget);
    const restR = restQ.clone().invert(); // right arm hangs out to -X
    rShoulder.current.quaternion.copy(restR).slerp(tmpQ, point);
    const jab = point > 0.95 ? 0.18 * Math.max(0, Math.sin(ct * 9)) : 0;
    rElbow.current.rotation.x = -0.25 * (1 - point) - jab;

    // Sip from the can between gestures.
    const sip = window01(ct, 5.4, 7.0, 0.5);
    lShoulder.current.quaternion.copy(restQ);
    lShoulder.current.rotateX(-0.3 - 0.75 * sip);
    lElbow.current.rotation.x = -1.25 - 1.05 * sip;

    // Watch what he's pointing at, tip back to drink, and nod along.
    tmpTarget.copy(point > 0.05 ? target : faceToward).setY(point > 0.05 ? target.y : 0.8);
    head.current.lookAt(tmpTarget);
    head.current.rotateX(-0.45 * sip + 0.05 * Math.sin(t * 1.3));
  });

  return (
    <group position={[position[0], 0, position[1]]} rotation-y={yaw}>
      <group ref={body}>
        {/* Legs and shoes */}
        {[-0.1, 0.1].map((x) => (
          <group key={x} position-x={x}>
            <mesh position-y={0.46} castShadow>
              <cylinderGeometry args={[0.075, 0.07, 0.9, 10]} />
              <meshStandardMaterial color={pants} roughness={0.9} />
            </mesh>
            <mesh position={[0, 0.04, 0.05]} castShadow>
              <boxGeometry args={[0.11, 0.08, 0.28]} />
              <meshStandardMaterial color="#3a2a1e" roughness={0.7} />
            </mesh>
          </group>
        ))}
        {/* Torso and gut */}
        <mesh position-y={1.2} castShadow>
          <capsuleGeometry args={[0.2, 0.22, 6, 14]} />
          <meshStandardMaterial color={shirtColor} map={shirtMap} roughness={0.85} />
        </mesh>
        <mesh position={[0, 1.08, 0.08]} scale={[1, 0.85, 1]} castShadow>
          <sphereGeometry args={[0.2, 14, 10]} />
          <meshStandardMaterial color={shirtColor} map={shirtMap} roughness={0.85} />
        </mesh>
        <mesh position-y={0.93}>
          <cylinderGeometry args={[0.205, 0.205, 0.05, 14]} />
          <meshStandardMaterial color="#2b2118" roughness={0.6} />
        </mesh>
        {/* Head, cap and moustache */}
        <group ref={head} position-y={1.5}>
          <mesh position-y={0.12} castShadow>
            <sphereGeometry args={[0.11, 14, 12]} />
            <meshStandardMaterial color={skin} roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.15, 0.1]}>
            <sphereGeometry args={[0.022, 8, 6]} />
            <meshStandardMaterial color={skin} roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.095, 0.1]}>
            <boxGeometry args={[0.09, 0.025, 0.03]} />
            <meshStandardMaterial color="#c9c4bb" roughness={1} />
          </mesh>
          <mesh position-y={0.16}>
            <sphereGeometry args={[0.116, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color={cap} roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.165, 0.13]} rotation-x={0.12}>
            <boxGeometry args={[0.18, 0.012, 0.11]} />
            <meshStandardMaterial color={cap} roughness={0.8} />
          </mesh>
        </group>
        {/* Arms: right (-X) points, left (+X) holds the beer */}
        {([
          [-1, rShoulder, rElbow],
          [1, lShoulder, lElbow],
        ] as const).map(([side, shoulder, elbow]) => (
          <group key={side} ref={shoulder} position={[side * 0.25, 1.42, 0]}>
            <mesh position-y={-0.15} castShadow>
              <cylinderGeometry args={[0.058, 0.052, 0.3, 10]} />
              <meshStandardMaterial color={shirtColor} map={shirtMap} roughness={0.85} />
            </mesh>
            <group ref={elbow} position-y={-0.3}>
              <mesh position-y={-0.13} castShadow>
                <cylinderGeometry args={[0.048, 0.042, 0.27, 10]} />
                <meshStandardMaterial color={skin} roughness={0.8} />
              </mesh>
              <mesh position-y={-0.29}>
                <sphereGeometry args={[0.05, 10, 8]} />
                <meshStandardMaterial color={skin} roughness={0.8} />
              </mesh>
              {side === 1 && (
                <mesh position={[0, -0.3, 0.02]}>
                  <cylinderGeometry args={[0.033, 0.033, 0.12, 12]} />
                  <meshStandardMaterial color="#c7ccd2" metalness={0.8} roughness={0.3} />
                </mesh>
              )}
            </group>
          </group>
        ))}
      </group>
    </group>
  );
}
