import {
  Box3,
  Color,
  Mesh,
  MeshBasicMaterial,
  CircleGeometry,
  Matrix4,
  PointLight,
  Vector3,
  type Material,
  type MeshStandardMaterial,
  type Object3D,
} from "three";
import type { CarRig } from "./carRig";

// Real light for the car's lamps so they glow on the ground around it, not
// just on the lenses. Headlights already have beams (CamaroModel); the other
// lamps share one point light per cluster and side to keep the light count
// low: front amber (park/turn + front marker), rear red (tail/brake/turn +
// rear marker) and reverse.

// Candela of ground glow per unit of lamp emissive intensity.
const GLOW_PER_EMISSIVE = 1.1;

const CLUSTER: Record<string, string> = {
  park_turn: "front",
  marker_front: "front",
  tail: "rear",
  marker_rear: "rear",
  reverse: "reverse",
};

export interface LampGlow {
  light: PointLight;
  lamps: MeshStandardMaterial[];
}

// Bounds, in `space`'s local frame, of the faces of `mesh` drawn with `material`.
function materialBounds(mesh: Mesh, material: Material, space: Object3D, box: Box3) {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const toSpace = new Matrix4().copy(space.matrixWorld).invert().multiply(mesh.matrixWorld);
  const pos = mesh.geometry.attributes.position;
  const index = mesh.geometry.index;
  const groups = mesh.geometry.groups.length ? mesh.geometry.groups : [{ start: 0, count: index ? index.count : pos.count, materialIndex: 0 }];
  const v = new Vector3();
  for (const g of groups) {
    if (mats[g.materialIndex ?? 0] !== material) continue;
    for (let n = g.start; n < g.start + g.count; n++) {
      v.fromBufferAttribute(pos, index ? index.getX(n) : n).applyMatrix4(toSpace);
      box.expandByPoint(v);
    }
  }
}

// Builds (or, since the GLTF scene is cached, finds) the glow lights on the body.
export function makeLampGlows(rig: CarRig, scene: Object3D): LampGlow[] {
  const existing = rig.body.children.filter((c): c is PointLight => c instanceof PointLight && c.name.startsWith("LampGlow_"));
  scene.updateMatrixWorld(true);

  const clusters = new Map<string, { lamps: MeshStandardMaterial[]; box: Box3; color: Color }>();
  for (const m of rig.lamps) {
    const d = m.userData as { lamp_role: string; lamp_side: string; lamp_color: [number, number, number] };
    const cluster = CLUSTER[d.lamp_role];
    if (!cluster) continue;
    const key = `${cluster}_${d.lamp_side}`;
    if (!clusters.has(key)) clusters.set(key, { lamps: [], box: new Box3(), color: new Color(...d.lamp_color) });
    clusters.get(key)!.lamps.push(m);
  }
  scene.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    for (const c of clusters.values()) for (const m of c.lamps) materialBounds(o, m, rig.body, c.box);
  });

  return [...clusters].flatMap(([key, c]) => {
    if (c.box.isEmpty()) return [];
    const name = `LampGlow_${key}`;
    let light = existing.find((l) => l.name === name);
    if (!light) {
      light = new PointLight(c.color, 0, 4.5, 2);
      light.name = name;
      // Sit just outside the lens, pushed away from the body's centre.
      const centre = c.box.getCenter(new Vector3());
      const out = new Vector3(centre.x, 0, centre.z).normalize().multiplyScalar(0.25);
      light.position.copy(centre).add(out);
      rig.body.add(light);
    }
    return [{ light, lamps: c.lamps }];
  });
}

// Follow the lamps' current brightness, whatever set it (presets, braking, blinkers).
export function updateLampGlows(glows: LampGlow[]) {
  for (const g of glows) {
    let e = 0;
    for (const m of g.lamps) e += m.emissiveIntensity;
    g.light.intensity = e * GLOW_PER_EMISSIVE;
  }
}

// ---- Dome light -----------------------------------------------------------

export interface DomeLight {
  light: PointLight;
  lens: Mesh;
}

// A white courtesy lamp on the headliner: a point light in the cabin plus a
// small lens that glows when it's on. Placed from the interior's bounds.
export function makeDomeLight(rig: CarRig, scene: Object3D): DomeLight {
  const found = rig.body.getObjectByName("DomeLight") as PointLight | undefined;
  if (found) return { light: found, lens: rig.body.getObjectByName("DomeLens") as Mesh };

  scene.updateMatrixWorld(true);
  const box = new Box3();
  scene.traverse((o) => {
    if (!(o instanceof Mesh) || !/interior/i.test(o.name)) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) materialBounds(o, m, rig.body, box);
  });
  const centre = box.getCenter(new Vector3());
  // Just under the roof, a little behind the middle of the cabin.
  const pos = new Vector3(0, box.max.y - 0.04, centre.z - 0.15);

  // Short reach so it lights the cabin but not the ground under the car.
  const light = new PointLight("#fff3e2", 0, 1.4, 1);
  light.name = "DomeLight";
  light.position.copy(pos).y -= 0.08;
  const lens = new Mesh(new CircleGeometry(0.07, 20), new MeshBasicMaterial({ color: "#5a5852" }));
  lens.name = "DomeLens";
  lens.rotation.x = Math.PI / 2; // face down into the cabin
  lens.position.copy(pos);
  rig.body.add(light, lens);
  return { light, lens };
}

export function setDomeLight(dome: DomeLight, on: boolean) {
  dome.light.intensity = on ? 9 : 0;
  (dome.lens.material as MeshBasicMaterial).color.set(on ? "#fffaf0" : "#5a5852");
}
