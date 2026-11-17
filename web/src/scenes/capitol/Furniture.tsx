import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
  type InstancedMesh,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useDrive } from "../../car/driveClock";
import { groundY } from "./data";
import { RED_WAIT, RING, ringCentre, ringTrack, type Intersection } from "./ringTrack";

// Traffic signals at the Square's eight junctions and its ornamental street
// lamps. The signals run off the car's own timeline: at the corners the ring's
// light goes amber and red as the car comes up to it and green after its
// wait; at the avenues it is green as the car rolls through. The side
// streets' lights run opposite, with an all-red gap between.

const AMBER = 3;
const ALL_RED = 2;

type Light = "red" | "amber" | "green";

interface Phase {
  anchor: number; // lap time when the ring's light turns amber
  red: number; // seconds after `anchor` when it turns green again
}

function phaseFor(it: Intersection): Phase {
  if (it.corner) {
    const arrive = ringTrack.timeAt(it.stop);
    return { anchor: arrive - 9, red: 9 + RED_WAIT - 0.6 };
  }
  // Green for 25 s before the car passes and 20 s after; red the rest of the lap.
  const pass = ringTrack.timeAt(it.s);
  return { anchor: pass + 20, red: ringTrack.lapTime - 45 };
}

function lights(p: Phase, t: number): [Light, Light] {
  const T = ringTrack.lapTime;
  const rel = (((t - p.anchor) % T) + T) % T;
  const ring: Light = rel < AMBER ? "amber" : rel < p.red ? "red" : "green";
  const cross: Light = rel >= AMBER + ALL_RED && rel < p.red - AMBER ? "green" : rel >= p.red - AMBER && rel < p.red ? "amber" : "red";
  return [ring, cross];
}

// ---- Signal hardware --------------------------------------------------------

const LENS: Record<Light, string> = { red: "#ff1408", amber: "#ff8a00", green: "#00ff8c" };
const HEAD_H = 1.05;

// A three-lens head facing +z, its centre at the origin.
function headGeometry() {
  const housing = new BoxGeometry(0.36, HEAD_H, 0.26);
  const plate = new BoxGeometry(0.62, HEAD_H + 0.28, 0.03).translate(0, 0, -0.15);
  const visors = [0.33, 0, -0.33].map((y) => new CylinderGeometry(0.14, 0.14, 0.22, 12, 1, true, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).translate(0, y + 0.02, 0.24));
  return mergeGeometries([housing, plate, ...visors].map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => {
    g.deleteAttribute("uv");
    return g;
  }));
}
const BORDER = new BoxGeometry(0.68, HEAD_H + 0.34, 0.02).translate(0, 0, -0.17);
// Mast arm: one metre along +z, stretched to length per pole.
const ARM = new CylinderGeometry(0.07, 0.1, 1, 8).rotateX(Math.PI / 2).translate(0, 0, 0.5);
const LENS_GEO = { red: 0.33, amber: 0, green: -0.33 } as const;

interface HeadPlacement {
  m: Matrix4;
  group: number; // index into the per-intersection light materials (2 per junction)
}

function placements() {
  const heads: HeadPlacement[] = [];
  const poles: Matrix4[] = [];
  const arms: Matrix4[] = [];
  const up = new Vector3(0, 1, 0);
  const roadR = -RING.halfWidth - RING.lane; // outer edge of the ring, in lane coordinates
  ringTrack.intersections.forEach((it, i) => {
    // Pole on the outer sidewalk past the stop line, arm out over the lanes.
    const s = it.corner ? it.stop + 9 : it.s + 11;
    const p = ringTrack.at(s);
    const [px, , pz] = ringTrack.offset(p, roadR - 0.8);
    const base = groundY(px, pz);
    poles.push(new Matrix4().makeTranslation(px, base, pz));
    const facing = new Quaternion().setFromAxisAngle(up, p.heading + Math.PI); // toward the oncoming car
    const armLen = -roadR + 1.2;
    arms.push(new Matrix4().compose(new Vector3(px, base + 6.4, pz), new Quaternion().setFromAxisAngle(up, p.heading + Math.PI / 2), new Vector3(1, 1, armLen)));
    for (const u of [0, -3.6]) {
      const [hx, , hz] = ringTrack.offset(p, u);
      heads.push({ m: new Matrix4().compose(new Vector3(hx, base + 5.7, hz), facing, new Vector3(1, 1, 1)), group: i * 2 });
    }
    // One head on the pole for the ring, one for each side street.
    heads.push({ m: new Matrix4().compose(new Vector3(px, base + 3.4, pz), facing, new Vector3(1, 1, 1)).multiply(new Matrix4().makeTranslation(0.45, 0, 0)), group: i * 2 });
    for (const dir of it.dirs) {
      const q = new Quaternion().setFromAxisAngle(up, dir);
      const offset = new Vector3(0, 0, 0.35).applyQuaternion(q);
      heads.push({ m: new Matrix4().compose(new Vector3(px + offset.x, base + 3.4, pz + offset.z), q, new Vector3(1, 1, 1)), group: i * 2 + 1 });
    }
  });
  return { heads, poles, arms };
}

function Signals() {
  const drive = useDrive();
  const { heads, poles, arms } = useMemo(placements, []);
  const phases = useMemo(() => ringTrack.intersections.map(phaseFor), []);
  // One lens material per junction, side (ring / cross) and colour.
  const lensMats = useMemo(
    () => ringTrack.intersections.flatMap(() => [0, 1].map(() => ({ red: lensMaterial("red"), amber: lensMaterial("amber"), green: lensMaterial("green") }))),
    [],
  );
  const head = useMemo(headGeometry, []);
  const lenses = useMemo(() => {
    // Lens discs, merged per (group, colour).
    const out: { geo: BufferGeometry; mat: MeshStandardMaterial }[] = [];
    lensMats.forEach((mats, g) => {
      for (const c of ["red", "amber", "green"] as Light[]) {
        const parts = heads.filter((h) => h.group === g).map((h) => new CircleGeometry(0.11, 16).translate(0, LENS_GEO[c] + 0.02, 0.135).applyMatrix4(h.m));
        if (parts.length) out.push({ geo: mergeGeometries(parts), mat: mats[c] });
      }
    });
    return out;
  }, [heads, lensMats]);
  const headRef = useRef<InstancedMesh>(null);
  const borderRef = useRef<InstancedMesh>(null);
  const poleRef = useRef<InstancedMesh>(null);
  const armRef = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    heads.forEach((h, i) => {
      headRef.current!.setMatrixAt(i, h.m);
      borderRef.current!.setMatrixAt(i, h.m);
    });
    poles.forEach((m, i) => poleRef.current!.setMatrixAt(i, m));
    arms.forEach((m, i) => armRef.current!.setMatrixAt(i, m));
    for (const r of [headRef, borderRef, poleRef, armRef]) {
      r.current!.instanceMatrix.needsUpdate = true;
      r.current!.computeBoundingSphere();
    }
  }, [heads, poles, arms]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime - drive.t0;
    phases.forEach((p, i) => {
      const [ring, cross] = lights(p, t);
      for (const [side, on] of [[0, ring], [1, cross]] as const) {
        const mats = lensMats[i * 2 + side];
        for (const c of ["red", "amber", "green"] as Light[]) setLens(mats[c], c === on);
      }
    });
  });
  return (
    <>
      <instancedMesh ref={headRef} args={[head, undefined, heads.length]} castShadow>
        <meshStandardMaterial color="#151614" roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={borderRef} args={[BORDER, undefined, heads.length]}>
        <meshStandardMaterial color="#e3c11c" roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={poleRef} args={[undefined, undefined, poles.length]} castShadow>
        <cylinderGeometry args={[0.13, 0.17, 6.8, 12]} />
        <meshStandardMaterial color="#2a2c2b" roughness={0.55} metalness={0.6} />
      </instancedMesh>
      <instancedMesh ref={armRef} args={[undefined, undefined, arms.length]} castShadow>
        <primitive object={ARM} attach="geometry" />
        <meshStandardMaterial color="#2a2c2b" roughness={0.55} metalness={0.6} />
      </instancedMesh>
      {lenses.map((l, i) => (
        <mesh key={i} geometry={l.geo} material={l.mat} />
      ))}
    </>
  );
}

function lensMaterial(c: Light) {
  return new MeshStandardMaterial({ color: "#1a1a1a", emissive: new Color(LENS[c]), emissiveIntensity: 0, roughness: 0.3 });
}

function setLens(m: MeshStandardMaterial, on: boolean) {
  m.emissiveIntensity = on ? 3.2 : 0;
}

// ---- Street lamps -----------------------------------------------------------

function lampSpots() {
  const c = ringCentre();
  const n = c.length;
  const out: Matrix4[] = [];
  for (let i = 0; i < n; i += 30) {
    const [x, z] = c[i];
    const [ax, az] = c[(i - 1 + n) % n], [bx, bz] = c[(i + 1) % n];
    const h = Math.atan2(bx - ax, bz - az);
    if (ringTrack.intersections.some((it) => Math.hypot(it.at[0] - x, it.at[1] - z) < 22)) continue;
    for (const side of [1, -1]) {
      const u = side * (RING.halfWidth + 1.1);
      const px = x + Math.cos(h) * u, pz = z - Math.sin(h) * u;
      out.push(new Matrix4().makeTranslation(px, groundY(px, pz), pz));
    }
  }
  return out;
}

function Lamps() {
  const spots = useMemo(lampSpots, []);
  const { post, globe } = useMemo(() => {
    const post = mergeGeometries(
      [
        new CylinderGeometry(0.17, 0.22, 0.9, 12).translate(0, 0.45, 0),
        new CylinderGeometry(0.06, 0.08, 3.6, 10).translate(0, 2.6, 0),
        new CylinderGeometry(0.16, 0.08, 0.25, 10).translate(0, 4.45, 0),
        new CylinderGeometry(0.02, 0.26, 0.3, 10).translate(0, 5.25, 0),
      ].map((g) => g.toNonIndexed()),
    );
    const globe = new SphereGeometry(0.24, 16, 12).scale(1, 1.25, 1).translate(0, 4.82, 0);
    return { post, globe };
  }, []);
  const a = useRef<InstancedMesh>(null);
  const b = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    for (const r of [a, b]) {
      spots.forEach((m, i) => r.current!.setMatrixAt(i, m));
      r.current!.instanceMatrix.needsUpdate = true;
      r.current!.computeBoundingSphere();
    }
  }, [spots]);
  return (
    <>
      <instancedMesh ref={a} args={[post, undefined, spots.length]} castShadow>
        <meshStandardMaterial color="#1c1d1c" roughness={0.5} metalness={0.5} />
      </instancedMesh>
      <instancedMesh ref={b} args={[globe, undefined, spots.length]}>
        <meshStandardMaterial color="#f2efe6" roughness={0.25} transparent opacity={0.9} />
      </instancedMesh>
    </>
  );
}

export default function Furniture() {
  return (
    <>
      <Signals />
      <Lamps />
    </>
  );
}
