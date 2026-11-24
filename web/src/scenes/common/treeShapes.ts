import { BufferAttribute, BufferGeometry, CylinderGeometry, Quaternion, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mulberry32 } from "./periodic";

// Procedural trees: a trunk and limbs with a crown of leaf-cluster cards whose
// normals point out from the crown's centre, so it shades as one soft mass.
// Kept apart from capitol/Trees so the scenes that borrow these shapes don't
// pull in the Capitol's map data with them.

function limb(from: Vector3, to: Vector3, r0: number, r1: number) {
  const dir = to.clone().sub(from);
  const len = dir.length();
  const g = new CylinderGeometry(r1, r0, len, 7, 1, true).translate(0, len / 2, 0);
  g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize()));
  return g.translate(from.x, from.y, from.z);
}

// Cards scattered through an ellipsoid crown.
export function crown(rand: () => number, centre: Vector3, radii: Vector3, count: number, size: number, cone = false) {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [];
  const q = new Quaternion();
  for (let n = 0; n < count; n++) {
    let p: Vector3;
    if (cone) {
      const h = rand();
      const r = (1 - h) * radii.x * Math.sqrt(0.3 + 0.7 * rand());
      const a = rand() * Math.PI * 2;
      p = new Vector3(Math.cos(a) * r, (h - 0.5) * 2 * radii.y, Math.sin(a) * r).add(centre);
    } else {
      // Mostly near the surface, where the leaves are.
      const d = new Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
      const r = 0.55 + 0.45 * Math.sqrt(rand());
      p = new Vector3(d.x * radii.x * r, d.y * radii.y * r, d.z * radii.z * r).add(centre);
    }
    const normal = p.clone().sub(centre).normalize().lerp(new Vector3(0, 1, 0), 0.25).normalize();
    q.setFromAxisAngle(new Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(), rand() * Math.PI);
    const s = size * (0.75 + rand() * 0.5);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
    for (const [cx, cy] of corners) {
      const v = new Vector3((cx * s) / 2, (cy * s) / 2, 0).applyQuaternion(q).add(p);
      pos.push(v.x, v.y, v.z);
      nor.push(normal.x, normal.y, normal.z);
      uv.push((cx + 1) / 2, (cy + 1) / 2);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("normal", new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
  return g;
}

// \cards\ and \size\: fewer, bigger leaf cards for trees only seen from afar.
export function deciduous(seed: number, cards = 230, size = 1.85, limbs = 6) {
  const rand = mulberry32(seed);
  const trunkTop = 3.6 + rand() * 1.2;
  const wood = [limb(new Vector3(0, -0.3, 0), new Vector3(0, trunkTop, 0), 0.42, 0.3)];
  const centre = new Vector3(0, trunkTop + 4.6, 0);
  const radii = new Vector3(4.6 + rand(), 4 + rand() * 0.8, 4.6 + rand());
  for (let k = 0; k < limbs; k++) {
    const a = (k / limbs) * Math.PI * 2 + rand();
    const end = new Vector3(Math.cos(a) * radii.x * 0.6, trunkTop + 2.5 + rand() * 3, Math.sin(a) * radii.z * 0.6);
    wood.push(limb(new Vector3(0, trunkTop - 0.3, 0), end, 0.2, 0.06));
  }
  wood.push(limb(new Vector3(0, trunkTop - 0.2, 0), new Vector3(0.3, trunkTop + 6, -0.2), 0.22, 0.06));
  return { wood: mergeGeometries(wood.map((g) => g.toNonIndexed())), leaves: crown(rand, centre, radii, cards, size) };
}

export function conifer(seed: number, cards = 160, size = 1.6) {
  const rand = mulberry32(seed);
  return {
    wood: limb(new Vector3(0, -0.3, 0), new Vector3(0, 9, 0), 0.25, 0.05).toNonIndexed(),
    leaves: crown(rand, new Vector3(0, 6, 0), new Vector3(3, 5, 3), cards, size, true),
  };
}
