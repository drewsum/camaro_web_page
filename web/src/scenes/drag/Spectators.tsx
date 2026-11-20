import { useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, BufferGeometry, Color, InstancedMesh, Matrix4, MeshStandardMaterial, Object3D, SphereGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mulberry32 } from "../common/periodic";

// The crowd in the bleachers: low-poly people, seated, standing or on their
// feet cheering, each part drawn as one instanced mesh per pose so a shirt,
// trousers, skin and hair colour can be picked per person. About 200
// triangles a person.

type Part = "shirt" | "pants" | "skin" | "hair";
type Pose = "sit" | "cheer" | "stand" | "wave"; // cheer: seated, wave: on their feet

// A box from its size and centre, tipped forward by `tilt` (rad) about x.
function box(w: number, h: number, d: number, x: number, y: number, z: number, tilt = 0) {
  const g = new BoxGeometry(w, h, d);
  if (tilt) g.rotateX(tilt);
  g.translate(x, y, z);
  g.deleteAttribute("uv");
  return g;
}

function head(y: number) {
  const g = new SphereGeometry(0.105, 8, 6).scale(1, 1.15, 1).translate(0, y, 0.01);
  g.deleteAttribute("uv");
  return g;
}

function hair(y: number) {
  const g = new SphereGeometry(0.115, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1, 1.1, 1.05).translate(0, y + 0.012, -0.008);
  g.deleteAttribute("uv");
  return g;
}

// Facing +z, origin at the hips (seated) or between the feet (standing).
function person(pose: Pose): Record<Part, BufferGeometry> {
  const seated = pose === "sit" || pose === "cheer";
  const hip = seated ? 0 : 0.9;
  const shoulder = hip + 0.5;
  const parts: Record<Part, BufferGeometry[]> = { shirt: [], pants: [], skin: [], hair: [] };
  // Torso and neck.
  parts.shirt.push(box(0.36, 0.52, 0.2, 0, hip + 0.26, -0.02));
  parts.skin.push(box(0.08, 0.08, 0.08, 0, shoulder + 0.05, 0), head(shoulder + 0.2));
  parts.hair.push(hair(shoulder + 0.2));
  for (const side of [-1, 1]) {
    const x = side * 0.1;
    if (seated) {
      // Thighs forward, shins down onto the row in front, shoes.
      parts.pants.push(box(0.14, 0.14, 0.44, x, 0.05, 0.2), box(0.12, 0.44, 0.12, x, -0.17, 0.4));
      parts.hair.push(box(0.11, 0.08, 0.22, x, -0.4, 0.45)); // shoes, in the hair's darker colours
    } else {
      parts.pants.push(box(0.14, 0.88, 0.14, x, 0.46, 0));
      parts.hair.push(box(0.11, 0.08, 0.22, x, 0.04, 0.04));
    }
    const ax = side * 0.235;
    if ((pose === "cheer" || pose === "wave") && side > 0) {
      // One arm punched up in the air.
      parts.shirt.push(box(0.1, 0.3, 0.1, ax + side * 0.02, shoulder + 0.13, 0));
      parts.skin.push(box(0.085, 0.32, 0.085, ax + side * 0.04, shoulder + 0.42, 0.02));
    } else if (seated) {
      // Upper arm down the side, forearm resting forward on the thigh.
      parts.shirt.push(box(0.1, 0.3, 0.1, ax, shoulder - 0.15, -0.01));
      parts.skin.push(box(0.085, 0.085, 0.3, ax * 0.85, hip + 0.11, 0.12));
    } else {
      parts.shirt.push(box(0.1, 0.3, 0.1, ax, shoulder - 0.15, 0));
      parts.skin.push(box(0.085, 0.3, 0.085, ax, shoulder - 0.45, 0.02));
    }
  }
  return {
    shirt: mergeGeometries(parts.shirt)!,
    pants: mergeGeometries(parts.pants)!,
    skin: mergeGeometries(parts.skin)!,
    hair: mergeGeometries(parts.hair)!,
  };
}

const SHIRTS = ["#8c3a32", "#3a5670", "#d8d4c8", "#2f2f31", "#a88f4a", "#4d6a3e", "#5e4a6e", "#9a6a44", "#6f7378", "#c24a2a", "#e2c23c", "#f2f0ea", "#24477a"];
const PANTS = ["#2d3a52", "#3a3f48", "#5a5148", "#24252a", "#7a6a52", "#41506a", "#b8ad96"];
const SKIN = ["#e2b89a", "#c9946f", "#8d5e3f", "#f0c8a8", "#b07a55", "#6b4530", "#d6a684"];
const HAIR = ["#2a211b", "#4a3424", "#8a6a3e", "#b9b5ad", "#1c1c1c", "#6b4a2a", "#c9a46a", "#7a1f1f", "#23324a"];

export interface Seat {
  x: number;
  y: number; // top of the bench
  z: number;
  ry?: number; // which way they face (default +x, toward the drag strip)
}

// `standing`: a crowd on its feet on the ground (y = 0), some cheering,
// rather than seated on bleachers.
export default function Spectators({ seats, seed = 1320, standing = false }: { seats: Seat[]; seed?: number; standing?: boolean }) {
  const poses: Pose[] = ["sit", "cheer", "stand", "wave"];
  const { geometry, placed } = useMemo(() => {
    const rand = mulberry32(seed);
    const geometry = Object.fromEntries(poses.map((p) => [p, person(p)])) as Record<Pose, Record<Part, BufferGeometry>>;
    const placed: Record<Pose, { matrix: Matrix4; colors: Record<Part, Color> }[]> = { sit: [], cheer: [], stand: [], wave: [] };
    const o = new Object3D();
    const pick = (a: string[]) => new Color(a[Math.floor(rand() * a.length)]);
    for (const s of seats) {
      const r = rand();
      const pose: Pose = standing ? (r < 0.3 ? "wave" : "stand") : r < 0.12 ? "cheer" : r < 0.2 ? "stand" : "sit";
      // Facing the track (+x), give or take; standing folk stand on the bench.
      const ry = s.ry ?? Math.PI / 2;
      const back = standing ? 0 : pose === "stand" ? -0.15 : 0.02; // knees over the bench edge
      o.position.set(s.x + back * Math.sin(ry), s.y, s.z + back * Math.cos(ry));
      o.rotation.set(0, ry + (rand() - 0.5) * 0.5, 0);
      const k = 0.92 + rand() * 0.14;
      o.scale.set(k, k, k);
      o.updateMatrix();
      const hairColour = rand() < 0.15 ? pick(["#7a1f1f", "#23324a", "#1f4a2e", "#e8e4d8"]) : pick(HAIR); // a few caps
      placed[pose].push({ matrix: o.matrix.clone(), colors: { shirt: pick(SHIRTS), pants: pick(PANTS), skin: pick(SKIN), hair: hairColour } });
    }
    return { geometry, placed };
  }, [seats, seed, standing]); // eslint-disable-line react-hooks/exhaustive-deps
  const material = useMemo(() => new MeshStandardMaterial({ roughness: 0.85 }), []);
  return (
    <>
      {poses.flatMap((pose) =>
        (["shirt", "pants", "skin", "hair"] as Part[]).map((part) => (
          <PartMesh key={`${pose}-${part}`} geometry={geometry[pose][part]} material={material} people={placed[pose]} part={part} />
        )),
      )}
    </>
  );
}

function PartMesh({
  geometry,
  material,
  people,
  part,
}: {
  geometry: BufferGeometry;
  material: MeshStandardMaterial;
  people: { matrix: Matrix4; colors: Record<Part, Color> }[];
  part: Part;
}) {
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    people.forEach((p, i) => {
      m.setMatrixAt(i, p.matrix);
      m.setColorAt(i, p.colors[part]);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [people, part]);
  if (!people.length) return null;
  return <instancedMesh ref={mesh} args={[geometry, material, people.length]} castShadow receiveShadow />;
}
