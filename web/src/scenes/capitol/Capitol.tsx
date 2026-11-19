import { useMemo } from "react";
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  LatheGeometry,
  LOD,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  Quaternion,
  RingGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  type Texture,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { groundY, MAP, signedArea } from "./data";
import { CAPITOL_BAY, CAPITOL_STOREY, DOME_RIBS, domeTexture, graniteTextures, rusticatedTextures } from "./textures";
import { preloadPbr, usePbrTextures } from "../common/pbr";
import { tiledInstances } from "../common/tiles";

// The Wisconsin State Capitol (1917, George B. Post & Sons): four white
// granite wings on the building's mapped footprint, and at the crossing the
// drum, its colonnade, the granite dome and the lantern, topped by Daniel
// Chester French's gilded "Wisconsin" 86.6 m above the ground.
//
// Each wing has a channelled (rusticated) ground storey, pilasters between
// the arched windows above, a cornice and a balustrade along the roof, and
// ends in a six-column Corinthian portico whose pediment is filled with
// sculpture. Four sculpture groups stand at the dome's base on the
// diagonals; the dome has raised ribs and a ring of oval lucarnes. The
// proportions come from photographs and the mapped height, and the details
// are simplified.

const WING_H = 24;
const CORNICE_H = 1.8;
const STONE = "#e7e2d7";

// Fine tooling on the dressed stone: a scanned plaster's surface relief and
// roughness (Poly Haven, CC0), laid over the drawn coursing and windows.
const TOOLING = "plaster_grey_04"; // one scan covers 1.5 m
preloadPbr(TOOLING, "1k");

const v2 = (x: number, y: number) => new Vector2(x, y);

// Every part is merged on position and normal alone.
function clean(g: BufferGeometry) {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (k !== "position" && k !== "normal") n.deleteAttribute(k);
  if (!n.attributes.normal) n.computeVertexNormals();
  return n;
}
const merge = (gs: BufferGeometry[]) => mergeGeometries(gs.map(clean));

function bounds() {
  const xs = MAP.capitol.map((p) => p[0]), zs = MAP.capitol.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  return { cx, cz, ground: groundY(cx, cz) };
}

function repeated(t: { map: Texture; roughnessMap?: Texture; metalnessMap?: Texture }, u: number, v: number) {
  const out: Record<string, Texture> = {};
  for (const [k, tex] of Object.entries(t)) {
    if (!tex) continue;
    const c = tex.clone();
    c.repeat.set(u, v);
    c.needsUpdate = true;
    out[k] = c;
  }
  return out;
}

// The tooling normal map tiled for a surface whose UVs run in units of
// (u, v) metres. Three gives each map its own transform, so this repeat
// is independent of the colour map's.
function tooling(normal: Texture, u: number, v: number) {
  const t = normal.clone();
  t.repeat.set(u / 1.5, v / 1.5);
  t.needsUpdate = true;
  return { normalMap: t, normalScale: new Vector2(0.45, 0.45) };
}

// Cylinder whose window texture tiles in whole bays around it.
function drum(r: number, y0: number, y1: number, tex: ReturnType<typeof graniteTextures>, normal: Texture, storey = CAPITOL_STOREY) {
  const geo = new CylinderGeometry(r, r, y1 - y0, 96, 1, true).translate(0, (y0 + y1) / 2, 0);
  const bays = Math.max(1, Math.round((2 * Math.PI * r) / CAPITOL_BAY));
  const storeys = Math.max(1, Math.round((y1 - y0) / storey));
  const mat = new MeshStandardMaterial({ ...repeated(tex, bays, storeys), ...tooling(normal, 2 * Math.PI * r, y1 - y0), roughness: 1, metalness: 1 });
  return { geo, mat };
}

// ---- Orders and ornament ------------------------------------------------------

// A Corinthian column standing on y = 0, `r` its lower radius: an Attic base
// on a square plinth, a fluted shaft tapering toward the top, and a bell
// capital wrapped in two rows of acanthus with volutes under the abacus.
//
// `detail` false gives the distant version, for when flutes and leaves are
// a pixel or two: the same silhouette with a plain shaft and bell, about a
// twentieth of the triangles.
function column(r: number, h: number, detail = true) {
  const parts: BufferGeometry[] = [];
  parts.push(new BoxGeometry(r * 2.8, r * 0.32, r * 2.8).translate(0, r * 0.16, 0));
  const base = [v2(1.4, 0.32), v2(1.4, 0.46), v2(1.22, 0.58), v2(1.15, 0.64), v2(1.27, 0.74), v2(1.07, 0.92), v2(1.0, 1.0)];
  parts.push(new LatheGeometry(base.map((p) => p.multiplyScalar(r)), detail ? 24 : 10));
  const capH = r * 2.4, abacusH = r * 0.35;
  const shaftH = h - r - capH - abacusH;
  if (!detail) {
    parts.push(new CylinderGeometry(r * 0.86, r, shaftH, 12, 1, true).translate(0, r + shaftH / 2, 0));
    parts.push(new LatheGeometry([v2(r * 0.9, 0), v2(r * 1.0, capH * 0.5), v2(r * 1.3, capH)], 10).translate(0, r + shaftH, 0));
    parts.push(new BoxGeometry(r * 2.75, abacusH, r * 2.75).translate(0, r + shaftH + capH + abacusH / 2, 0));
    return merge(parts);
  }
  // Twenty-four flutes: the radius dips between arrises. The flutes run
  // straight and the taper is linear, so one row of quads carries it all.
  const shaft = new CylinderGeometry(r * 0.86, r, shaftH, 96, 1, true);
  const p = shaft.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const a = Math.atan2(x, z);
    const k = 1 - 0.055 * Math.pow(0.5 + 0.5 * Math.cos(a * 24), 2);
    p.setXYZ(i, x * k, p.getY(i), z * k);
  }
  shaft.computeVertexNormals();
  parts.push(shaft.translate(0, r + shaftH / 2, 0));
  const y0 = r + shaftH;
  parts.push(new LatheGeometry([v2(r * 0.95, 0), v2(r * 0.95, r * 0.12), v2(r * 0.88, r * 0.16)], 24).translate(0, y0 - r * 0.16, 0)); // astragal
  parts.push(new LatheGeometry([v2(r * 0.86, 0), v2(r * 0.9, capH * 0.5), v2(r * 1.15, capH * 0.92), v2(r * 1.2, capH)], 24).translate(0, y0, 0));
  // Acanthus: two staggered rows of slim leaves hugging the bell, their tips
  // curling out, and small volutes tucked under the abacus corners.
  for (let row = 0; row < 2; row++) {
    for (let k = 0; k < 12; k++) {
      const a = ((k + row * 0.5) / 12) * Math.PI * 2;
      const leaf = new SphereGeometry(r * 0.2, 6, 8, 0, Math.PI * 2, 0, Math.PI * 0.62).scale(1, 2.6, 0.28).rotateX(-0.22).rotateY(a);
      const rr = r * (0.9 + row * 0.08);
      parts.push(leaf.translate(Math.sin(a) * rr, y0 + capH * (0.12 + row * 0.3), Math.cos(a) * rr));
    }
  }
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    parts.push(new TorusGeometry(r * 0.13, r * 0.06, 6, 12).rotateY(Math.atan2(sx, sz) + Math.PI / 2).translate(sx * r * 0.98, y0 + capH * 0.84, sz * r * 0.98));
  }
  parts.push(new BoxGeometry(r * 2.75, abacusH, r * 2.75).translate(0, y0 + capH + abacusH / 2, 0));
  return merge(parts);
}

// The shadow a column casts, from an octagonal stand-in. It sits a little
// inside the real column's surface, so the column doesn't shadow itself.
function columnShadow(r: number, h: number) {
  const capH = r * 2.4 + r * 0.35;
  return merge([
    new CylinderGeometry(r * 0.78, r * 0.9, h - capH, 8, 1).translate(0, (h - capH) / 2, 0),
    new CylinderGeometry(r * 1.15, r * 0.8, capH, 8, 1).translate(0, h - capH / 2, 0),
  ]);
}

// Shadow stand-ins draw only into the shadow map: in the main pass they
// write neither colour nor depth.
const SHADOW_ONLY = new MeshBasicMaterial({ colorWrite: false, depthWrite: false });

// Detailed geometry near the camera, a lighter version beyond `distance`.
// Neither casts a shadow (a stand-in does that), so the shadow doesn't
// change when the level does.
function twoLevels(near: BufferGeometry, far: BufferGeometry, mat: MeshStandardMaterial, distance: number) {
  const lod = new LOD();
  for (const [geo, d] of [[near, 0], [far, distance]] as const) {
    const mesh = new Mesh(geo, mat);
    mesh.receiveShadow = true;
    lod.addLevel(mesh, d, 4);
  }
  return lod;
}

// A robed figure for the pediments and the dome's corner groups, standing
// on y = 0 and facing +z: `h` tall standing, seated (on a block), or
// reclining (then `h` is its length, lying along x, head toward +x).
function figure(h: number, pose: "stand" | "seat" | "recline") {
  const parts: BufferGeometry[] = [];
  const robe = (s: number) => new LatheGeometry(
    [v2(0.01, 0), v2(0.27, 0), v2(0.24, 0.3), v2(0.2, 0.55), v2(0.17, 0.66), v2(0.21, 0.74), v2(0.1, 0.81), v2(0.01, 0.83)].map((p) => p.multiplyScalar(s)),
    14,
  );
  if (pose === "stand") {
    parts.push(robe(h));
    parts.push(new SphereGeometry(h * 0.07, 10, 8).translate(0, h * 0.9, 0));
    parts.push(new CylinderGeometry(h * 0.035, h * 0.04, h * 0.42, 6).rotateZ(0.5).translate(h * 0.18, h * 0.62, h * 0.04));
  } else if (pose === "seat") {
    parts.push(new BoxGeometry(h * 0.42, h * 0.32, h * 0.38).translate(0, h * 0.16, -h * 0.04));
    parts.push(new BoxGeometry(h * 0.36, h * 0.13, h * 0.34).translate(0, h * 0.38, h * 0.12)); // lap and knees
    parts.push(new BoxGeometry(h * 0.3, h * 0.36, h * 0.12).translate(0, h * 0.2, h * 0.26)); // shins and drapery
    parts.push(robe(h * 0.62).translate(0, h * 0.32, -h * 0.03));
    parts.push(new SphereGeometry(h * 0.07, 10, 8).translate(0, h * 0.91, -h * 0.03));
  } else {
    parts.push(new SphereGeometry(1, 14, 10).scale(h * 0.48, h * 0.13, h * 0.17).translate(-h * 0.05, h * 0.13, 0));
    parts.push(new SphereGeometry(h * 0.12, 10, 8).scale(1, 1.4, 1).translate(h * 0.32, h * 0.27, 0)); // torso raised on an elbow
    parts.push(new SphereGeometry(h * 0.07, 10, 8).translate(h * 0.38, h * 0.45, 0));
  }
  return merge(parts);
}

// Daniel Chester French's "Wisconsin" (4.7 m), facing +z: her right arm
// outstretched, her left hand holding a globe with an eagle on it, a
// helmet with a badger on her head.
function statue() {
  const parts: BufferGeometry[] = [];
  parts.push(new LatheGeometry(
    [v2(0.01, 0), v2(0.62, 0), v2(0.57, 0.5), v2(0.49, 1.4), v2(0.41, 2.2), v2(0.36, 2.75), v2(0.42, 3.05), v2(0.27, 3.25), v2(0.13, 3.35), v2(0.01, 3.4)],
    24,
  ));
  parts.push(new SphereGeometry(0.27, 16, 12).translate(0, 3.62, 0));
  parts.push(new SphereGeometry(0.3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.8, 1.05).translate(0, 3.7, 0)); // helmet
  parts.push(new SphereGeometry(0.11, 10, 8).scale(1, 0.75, 2.6).translate(0, 4.02, -0.02)); // the badger
  parts.push(new SphereGeometry(0.07, 8, 6).translate(0, 4.05, 0.27));
  // Cloak folds falling from the shoulders.
  for (const s of [-1, 1]) parts.push(new SphereGeometry(1, 10, 8).scale(0.16, 1.3, 0.22).translate(s * 0.43, 2.0, -0.1));
  const arm = (from: Vector3, to: Vector3, r: number) => {
    const d = to.clone().sub(from);
    const g = new CylinderGeometry(r * 0.85, r, d.length(), 10).translate(0, d.length() / 2, 0);
    g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.normalize()));
    return g.translate(from.x, from.y, from.z);
  };
  // Right arm reaching out and up, palm down.
  const hand = new Vector3(0.75, 3.55, 1.25);
  parts.push(arm(new Vector3(0.36, 3.1, 0.05), hand, 0.1));
  parts.push(new SphereGeometry(0.1, 8, 6).scale(1.3, 0.5, 1.6).translate(hand.x, hand.y, hand.z + 0.05));
  // Left arm down to the globe at her side, the eagle spreading its wings on it.
  const globe = new Vector3(-0.72, 2.15, 0.28);
  parts.push(arm(new Vector3(-0.36, 3.1, 0), globe.clone().add(new Vector3(0.1, 0.25, 0)), 0.1));
  parts.push(new SphereGeometry(0.34, 16, 12).translate(globe.x, globe.y, globe.z));
  parts.push(new SphereGeometry(0.1, 8, 6).scale(1, 1.5, 1).translate(globe.x, globe.y + 0.47, globe.z));
  for (const s of [-1, 1]) parts.push(new BoxGeometry(0.55, 0.05, 0.22).rotateZ(s * 0.45).translate(globe.x + s * 0.3, globe.y + 0.6, globe.z));
  return merge(parts);
}

// A run of balusters: urn-shaped, 0.85 m tall, standing on y = 0.
function baluster() {
  return new LatheGeometry(
    [v2(0.09, 0), v2(0.09, 0.08), v2(0.06, 0.12), v2(0.1, 0.3), v2(0.13, 0.38), v2(0.09, 0.5), v2(0.055, 0.62), v2(0.07, 0.7), v2(0.08, 0.77), v2(0.08, 0.85)],
    8,
  );
}
const BALUSTER_STEP = 0.32;

// Stone runs and baluster positions for balustrades, gathered so all the
// balusters on the building become one instanced mesh.
class Balustrades {
  stone: BufferGeometry[] = [];
  balusters: Matrix4[] = [];
  // A straight run from a to c with its foot at height y.
  straight(a: [number, number], c: [number, number], y: number, pedestalEvery = 2 * CAPITOL_BAY) {
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (len < 1) return;
    const X = new Vector3((c[0] - a[0]) / len, 0, (c[1] - a[1]) / len), Y = new Vector3(0, 1, 0);
    const Z = X.clone().cross(Y);
    const at = (s: number, h: number) => new Matrix4().makeBasis(X, Y, Z).setPosition(a[0] + X.x * s, y + h, a[1] + X.z * s);
    this.stone.push(new BoxGeometry(len, 0.3, 0.55).translate(len / 2, 0.15, 0).applyMatrix4(at(0, 0)));
    this.stone.push(new BoxGeometry(len + 0.1, 0.17, 0.62).translate(len / 2, 0, 0).applyMatrix4(at(0, 1.24)));
    const n = Math.max(1, Math.round(len / pedestalEvery));
    const posts = Array.from({ length: n + 1 }, (_, k) => (k / n) * len);
    for (const s of posts) this.stone.push(new BoxGeometry(0.6, 1.4, 0.62).applyMatrix4(at(s, 0.7)));
    for (let s = 0.45; s < len - 0.4; s += BALUSTER_STEP) {
      if (posts.some((p) => Math.abs(p - s) < 0.48)) continue;
      this.balusters.push(at(s, 0.3));
    }
  }
  // A ring of radius r about (cx, cz) with its foot at height y.
  circle(cx: number, cz: number, r: number, y: number, posts = 24) {
    const band = (h: number, w: number) => new LatheGeometry([v2(r - w, 0), v2(r + w, 0), v2(r + w, h), v2(r - w, h), v2(r - w, 0)], 128);
    this.stone.push(band(0.3, 0.28).translate(cx, y, cz));
    this.stone.push(band(0.17, 0.31).translate(cx, y + 1.155, cz));
    const at = (a: number, h: number) => new Matrix4().makeRotationY(a).setPosition(cx + Math.sin(a) * r, y + h, cz + Math.cos(a) * r);
    const postGap = (2 * Math.PI) / posts;
    for (let k = 0; k < posts; k++) this.stone.push(new BoxGeometry(0.6, 1.4, 0.62).applyMatrix4(at(k * postGap, 0.7)));
    const n = Math.round((2 * Math.PI * r) / BALUSTER_STEP);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const fromPost = Math.abs(((a / postGap + 0.5) % 1) - 0.5) * postGap * r; // metres to the nearest post
      if (fromPost < 0.48) continue;
      this.balusters.push(at(a, 0.3));
    }
  }
}

// A portico on a podium with steps, built facing +z with its back at z = 0:
// six Corinthian columns, responding pilasters on the wall, an entablature
// on dentils, and a pediment with raking cornices and a row of figures in
// its tympanum.
function portico() {
  const W = 26, D = 7.5, PODIUM = 4.5, COL_H = 15, R = 0.75;
  const parts: BufferGeometry[] = [];
  parts.push(new BoxGeometry(W, PODIUM + 1, D).translate(0, (PODIUM - 1) / 2, D / 2));
  for (let k = 0; k < 10; k++) {
    const h = PODIUM * (1 - (k + 1) / 11);
    parts.push(new BoxGeometry(18, h + 1, 0.5).translate(0, (h - 1) / 2, D + 0.25 + k * 0.5));
  }
  // Cheek blocks either side of the steps.
  for (const s of [-1, 1]) parts.push(new BoxGeometry(2.4, PODIUM + 1, 5).translate(s * 10.2, (PODIUM - 1) / 2, D + 2.5));
  // The columns at two levels of detail, and their shadow stand-ins.
  const xs = Array.from({ length: 6 }, (_, k) => -11 + k * 4.4);
  const row = (g: BufferGeometry) => merge(xs.map((x) => g.clone().translate(x, PODIUM, D - 1.6)));
  const columns = { near: row(column(R, COL_H)), far: row(column(R, COL_H, false)), shadow: row(columnShadow(R, COL_H)) };
  for (const x of xs) parts.push(new BoxGeometry(1.4, COL_H, 0.3).translate(x, PODIUM + COL_H / 2, 0.15));
  const top = PODIUM + COL_H;
  const FRONT = D - 1.6 + R * 1.4;
  // Architrave in two fasciae, a plain frieze, dentils, then the cornice.
  parts.push(new BoxGeometry(W - 0.9, 0.62, FRONT - 0.08).translate(0, top + 0.31, (FRONT - 0.08) / 2));
  parts.push(new BoxGeometry(W - 0.7, 0.62, FRONT).translate(0, top + 0.93, FRONT / 2));
  parts.push(new BoxGeometry(W - 0.7, 1.3, FRONT).translate(0, top + 1.89, FRONT / 2));
  parts.push(new BoxGeometry(W - 0.3, 0.12, FRONT + 0.15).translate(0, top + 2.6, (FRONT + 0.15) / 2));
  const E = top + 2.66;
  for (let x = -W / 2 + 0.4; x <= W / 2 - 0.4; x += 0.45) parts.push(new BoxGeometry(0.22, 0.3, 0.3).translate(x, E + 0.15, FRONT + 0.15));
  parts.push(new BoxGeometry(W + 0.7, 0.65, FRONT + 0.95).translate(0, E + 0.62, (FRONT + 0.95) / 2));
  // Pediment: a recessed tympanum framed by raking cornices.
  const P0 = E + 0.95, HW = W / 2 + 0.35, H = 5.2;
  const tri = new Shape([v2(-HW + 0.5, 0), v2(HW - 0.5, 0), v2(0, H - 0.45)]);
  parts.push(new ExtrudeGeometry(tri, { depth: FRONT - 0.55, bevelEnabled: false }).translate(0, P0, 0));
  const slope = Math.atan2(H, HW), rake = Math.hypot(HW, H);
  for (const s of [-1, 1]) {
    parts.push(new BoxGeometry(rake + 0.6, 0.7, FRONT + 0.95).rotateZ(-s * slope).translate((s * HW) / 2, P0 + H / 2 + 0.1, (FRONT + 0.95) / 2));
  }
  // The sculpture: a central standing figure, others seated and standing
  // as the gable allows, and reclining figures in the corners.
  const zf = FRONT - 0.55 + 0.42;
  // `room` is the clear height under the raking cornice at the figure's
  // outer shoulder, so each one fills its part of the gable.
  for (let x = -HW + 1.5; x <= HW - 1.4; x += 1.75) {
    const room = H * (1 - (Math.abs(x) + 0.4) / HW) - 0.55;
    let fig: BufferGeometry;
    if (Math.abs(x) < 0.9) fig = figure(room * 0.97, "stand");
    else if (room > 2.4) fig = figure(room * 0.95, Math.round(Math.abs(x) / 1.75) % 2 ? "stand" : "seat");
    else if (room > 1.3) fig = figure(room * 0.97, "seat");
    else fig = figure(2.3, "recline").rotateY(x > 0 ? Math.PI : 0);
    parts.push(fig.scale(1, 1, 0.65).translate(x, P0, zf));
  }
  return { mass: merge(parts), columns };
}

// Raised ribs over the dome: each a strip `w` wide standing `d` proud of the
// lathe profile (a, b: the ellipse's radii; 0..end: its arc), DOME_RIBS of
// them on the same meridians as the texture's panel edges.
function domeRibs(a: number, b: number, end: number, w = 0.8, d = 0.38) {
  const pos: number[] = [];
  const N = 40;
  const tri = (p: number[], q: number[], r: number[]) => pos.push(...p, ...q, ...r);
  for (let k = 0; k < DOME_RIBS; k++) {
    const phi = (k / DOME_RIBS) * Math.PI * 2, sx = Math.sin(phi), cz = Math.cos(phi);
    const pt = (th: number, out: number, side: number) => {
      let nr = Math.cos(th) / a, ny = Math.sin(th) / b;
      const nl = Math.hypot(nr, ny);
      nr /= nl;
      ny /= nl;
      const R = a * Math.cos(th) + nr * out, Y = b * Math.sin(th) + ny * out;
      const half = (side * w) / 2;
      return [R * sx + cz * half, Y, R * cz - sx * half];
    };
    for (let i = 0; i < N; i++) {
      const t0 = (i / N) * end, t1 = ((i + 1) / N) * end;
      const [o0l, o0r, o1l, o1r] = [pt(t0, d, -1), pt(t0, d, 1), pt(t1, d, -1), pt(t1, d, 1)];
      const [i0l, i0r, i1l, i1r] = [pt(t0, -0.05, -1), pt(t0, -0.05, 1), pt(t1, -0.05, -1), pt(t1, -0.05, 1)];
      tri(o0l, o1l, o1r); tri(o0l, o1r, o0r); // face
      tri(i0l, i1l, o1l); tri(i0l, o1l, o0l); // one side
      tri(o0r, o1r, i1r); tri(o0r, i1r, i0r); // the other
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  geo.computeVertexNormals();
  return geo;
}

// Oval lucarnes in the lower dome, one centred in each bay between ribs:
// a dark glazed oval and its moulded stone frame, each set on the surface.
function lucarnes(a: number, b: number, th: number) {
  const glass: BufferGeometry[] = [], frames: BufferGeometry[] = [];
  let nr = Math.cos(th) / a, ny = Math.sin(th) / b;
  const nl = Math.hypot(nr, ny);
  nr /= nl;
  ny /= nl;
  let tr = -a * Math.sin(th), ty = b * Math.cos(th);
  const tl = Math.hypot(tr, ty);
  tr /= tl;
  ty /= tl;
  for (let k = 0; k < DOME_RIBS; k++) {
    const phi = ((k + 0.5) / DOME_RIBS) * Math.PI * 2, sx = Math.sin(phi), cz = Math.cos(phi);
    const Z = new Vector3(nr * sx, ny, nr * cz), Yv = new Vector3(tr * sx, ty, tr * cz);
    const X = Yv.clone().cross(Z);
    const p = new Vector3(a * Math.cos(th) * sx, b * Math.sin(th), a * Math.cos(th) * cz).addScaledVector(Z, 0.08);
    const m = new Matrix4().makeBasis(X, Yv, Z).setPosition(p);
    glass.push(new CircleGeometry(0.75, 28).scale(1, 1.3, 1).applyMatrix4(m));
    frames.push(new TorusGeometry(0.82, 0.16, 8, 28).scale(1, 1.3, 1.4).applyMatrix4(m));
  }
  return { glass: merge(glass), frames: merge(frames) };
}

export default function Capitol() {
  const scan = usePbrTextures(TOOLING, "1k");
  const { parts, objects } = useMemo(() => {
    const { cx, cz, ground: g } = bounds();
    const S = CAPITOL_STOREY;
    // Meshes (cast: false for detail whose shadow wouldn't be seen), and
    // objects that manage their own meshes (levels of detail, tiles).
    const list: { geo: BufferGeometry; mat: MeshStandardMaterial | MeshBasicMaterial; cast?: boolean }[] = [];
    const objects: Object3D[] = [];
    const windows = graniteTextures(true);
    const rustic = rusticatedTextures();
    const plainTex = graniteTextures(false);
    const plain = new MeshStandardMaterial({ color: STONE, roughness: 0.8 });
    const gold = new MeshStandardMaterial({ color: "#d9a83f", metalness: 1, roughness: 0.28 });
    const bal = new Balustrades();

    // ---- Wings ----
    const pts = MAP.capitol;
    const out = signedArea(pts) > 0 ? 1 : -1;
    const upper: number[] = [], nor: number[] = [], uv: number[] = [];
    const lower: number[] = [], lnor: number[] = [], luv: number[] = [];
    const cornice: number[] = [], cnor: number[] = [], cuv: number[] = [];
    const pilasters: BufferGeometry[] = [];
    let run = 0;
    const base = Math.min(...pts.map(([x, z]) => groundY(x, z))) - 0.5;
    const quad = (P: number[], N: number[], U: number[], a: number[], c: number[], y0: number, y1: number, u0: number, u1: number, v0: number, v1: number) => {
      const dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
      const nx = (dz / len) * out, nz = (-dx / len) * out;
      const Q = [[a[0], y0, a[1], u0, v0], [c[0], y0, c[1], u1, v0], [c[0], y1, c[1], u1, v1], [a[0], y1, a[1], u0, v1]];
      for (const k of out > 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]) {
        P.push(Q[k][0], Q[k][1], Q[k][2]);
        N.push(nx, 0, nz);
        U.push(Q[k][3], Q[k][4]);
      }
    };
    const pilTop = g + WING_H - 0.2, pilBot = g + S + 0.3;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], c = pts[(i + 1) % pts.length];
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      const u0 = run / CAPITOL_BAY, u1 = (run + len) / CAPITOL_BAY;
      quad(lower, lnor, luv, a, c, base, g + S, u0, u1, (base - g) / S, 1);
      quad(upper, nor, uv, a, c, g + S, g + WING_H, u0, u1, 1, WING_H / S);
      // Pilasters on the bay lines between the windows, above the ground storey.
      if (len > 3) {
        const X = new Vector3((c[0] - a[0]) / len, 0, (c[1] - a[1]) / len), Y = new Vector3(0, 1, 0), Z = X.clone().cross(Y);
        const nx = (X.z) * out, nz = (-X.x) * out;
        for (let k = Math.ceil(run / CAPITOL_BAY); k * CAPITOL_BAY < run + len; k++) {
          const s = k * CAPITOL_BAY - run;
          if (s < 1 || s > len - 1) continue;
          const at = (depth: number, y: number) =>
            new Matrix4().makeBasis(X, Y, Z).setPosition(a[0] + X.x * s + nx * depth, y, a[1] + X.z * s + nz * depth);
          const h = pilTop - pilBot;
          pilasters.push(new BoxGeometry(0.85, h, 0.3).applyMatrix4(at(0.15, pilBot + h / 2)));
          pilasters.push(new BoxGeometry(1.05, 0.45, 0.42).applyMatrix4(at(0.21, pilBot + 0.22)));
          pilasters.push(new BoxGeometry(1.1, 0.7, 0.45).applyMatrix4(at(0.22, pilTop - 0.35)));
        }
      }
      run += len;
    }
    // Projecting bands: a plinth, string courses at the floor lines and an
    // overhanging cornice. Each is the footprint pushed out by `d`, with its
    // own top and underside so it catches light and casts a shadow line.
    const band = (d: number, y0: number, y1: number) => {
      const off = offsetPolygon(pts, d, out);
      let r = 0;
      for (let i = 0; i < off.length; i++) {
        const a = off[i], c = off[(i + 1) % off.length];
        const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
        quad(cornice, cnor, cuv, a, c, y0, y1, r / 4, (r + len) / 4, 0, (y1 - y0) / 4);
        r += len;
        for (const [y, up] of [[y1, 1], [y0, -1]] as const) {
          const ring = [pts[i], pts[(i + 1) % pts.length], c, a];
          const tri = up * out > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
          for (const k of tri) {
            cornice.push(ring[k][0], y, ring[k][1]);
            cnor.push(0, up, 0);
            cuv.push(ring[k][0] / 4, ring[k][1] / 4);
          }
        }
      }
    };
    band(0.35, base, g + 1.3);
    band(0.4, g + S - 0.25, g + S + 0.35); // heavier course over the rustication
    band(0.38, g + 3 * S - 0.15, g + 3 * S + 0.2);
    band(0.55, g + WING_H - 0.2, g + WING_H + 0.35); // frieze
    band(0.95, g + WING_H + 0.35, g + WING_H + 0.9); // cornice overhang
    band(0.12, g + WING_H + 0.9, g + WING_H + CORNICE_H); // blocking course
    const geoOf = (P: number[], N: number[], U: number[]) => {
      const geo = new BufferGeometry();
      geo.setAttribute("position", new BufferAttribute(new Float32Array(P), 3));
      geo.setAttribute("normal", new BufferAttribute(new Float32Array(N), 3));
      geo.setAttribute("uv", new BufferAttribute(new Float32Array(U), 2));
      return geo;
    };
    list.push({ geo: geoOf(upper, nor, uv), mat: new MeshStandardMaterial({ ...windows, ...tooling(scan.normalMap, CAPITOL_BAY, S), roughness: 1, metalness: 1 }) });
    list.push({ geo: geoOf(lower, lnor, luv), mat: new MeshStandardMaterial({ ...rustic, ...tooling(scan.normalMap, CAPITOL_BAY, S), roughness: 1, metalness: 1 }) });
    list.push({ geo: geoOf(cornice, cnor, cuv), mat: new MeshStandardMaterial({ ...plainTex, ...tooling(scan.normalMap, 4, 4), roughness: 0.85, metalness: 0 }) });
    list.push({ geo: merge(pilasters), mat: plain });
    list.push({ geo: roofOver(pts, g + WING_H + CORNICE_H), mat: new MeshStandardMaterial({ color: "#a29d93", roughness: 0.9 }) });
    // The roof balustrade, set just inside the blocking course.
    const inner = offsetPolygon(pts, -0.35, out);
    for (let i = 0; i < inner.length; i++) bal.straight(inner[i], inner[(i + 1) % inner.length], g + WING_H + CORNICE_H);

    // ---- The crossing: pavilion, drum and colonnade, attic, dome, lantern ----
    const c = (geo: BufferGeometry) => geo.translate(cx, 0, cz);
    const pav = drum(22, g + WING_H - 2, g + 31, windows, scan.normalMap);
    list.push({ geo: c(pav.geo), mat: pav.mat });
    list.push({ geo: c(new RingGeometry(15, 22.4, 96).rotateX(-Math.PI / 2).translate(0, g + 31, 0)), mat: plain });
    list.push({ geo: c(new CylinderGeometry(22.5, 22.5, 0.9, 96).translate(0, g + 30.6, 0)), mat: plain }); // cornice
    list.push({ geo: c(new CylinderGeometry(19.8, 20.2, 1.2, 96).translate(0, g + 31.6, 0)), mat: plain }); // stylobate
    const drumWall = drum(16, g + 32, g + 47, windows, scan.normalMap, 7.5);
    list.push({ geo: c(drumWall.geo), mat: drumWall.mat });
    // The colonnade, measured for its level of detail from the drum's centre.
    const colonnade = twoLevels(ring(24, 18.4, column(0.66, 13.4), 0), ring(24, 18.4, column(0.66, 13.4, false), 0), plain, COLONNADE_LOD);
    colonnade.position.set(cx, g + 32.2, cz);
    objects.push(colonnade);
    list.push({ geo: c(ring(24, 18.4, columnShadow(0.66, 13.4), g + 32.2)), mat: SHADOW_ONLY });
    // Entablature over the colonnade, a balustrade along it.
    list.push({ geo: c(new CylinderGeometry(19.3, 19.3, 1.2, 96).translate(0, g + 46.2, 0)), mat: plain });
    list.push({ geo: c(new CylinderGeometry(19.6, 19.4, 1.1, 96).translate(0, g + 47.35, 0)), mat: plain });
    list.push({ geo: c(new CylinderGeometry(20.2, 20.2, 0.5, 96).translate(0, g + 48.1, 0)), mat: plain });
    list.push({ geo: c(new RingGeometry(16, 20.2, 96).rotateX(-Math.PI / 2).translate(0, g + 48.35, 0)), mat: plain });
    bal.circle(cx, cz, 19.55, g + 48.35);
    const attic = drum(16.8, g + 48.3, g + 54, plainTex, scan.normalMap);
    list.push({ geo: c(attic.geo), mat: attic.mat });
    list.push({ geo: c(new CylinderGeometry(17.3, 17.3, 0.7, 96).translate(0, g + 53.75, 0)), mat: plain });
    list.push({ geo: c(new RingGeometry(0, 17.3, 96).rotateX(-Math.PI / 2).translate(0, g + 54.1, 0)), mat: plain });
    // The dome: a granite shell with raised ribs and a ring of lucarnes.
    const A = 16.2, B = 19, end = Math.acos(3.6 / A);
    const profile: Vector2[] = [];
    for (let k = 0; k <= 48; k++) {
      const th = (k / 48) * end;
      profile.push(v2(A * Math.cos(th), B * Math.sin(th)));
    }
    const domeY = g + 54;
    list.push({ geo: c(new LatheGeometry(profile, 128).translate(0, domeY, 0)), mat: new MeshStandardMaterial({ map: domeTexture(), roughness: 0.75, side: DoubleSide }) });
    list.push({ geo: c(domeRibs(A, B, end).translate(0, domeY, 0)), mat: new MeshStandardMaterial({ color: STONE, roughness: 0.75, side: DoubleSide }) });
    const luc = lucarnes(A, B, 0.33);
    list.push({ geo: c(luc.frames.translate(0, domeY, 0)), mat: plain, cast: false });
    list.push({ geo: c(luc.glass.translate(0, domeY, 0)), mat: new MeshStandardMaterial({ color: "#222a30", metalness: 0.6, roughness: 0.15 }), cast: false });
    const lanternBase = domeY + B * Math.sin(end);
    list.push({ geo: c(new CylinderGeometry(4.3, 4.6, 1.2, 48).translate(0, lanternBase + 0.6, 0)), mat: plain });
    list.push({ geo: c(new CylinderGeometry(2.7, 2.7, 5.5, 48).translate(0, lanternBase + 1.2 + 2.75, 0)), mat: plain });
    // Seen from 60 m down at the closest, so the lantern's columns are the plain kind.
    list.push({ geo: c(ring(8, 3.5, column(0.22, 5.2, false), lanternBase + 1.2)), mat: plain });
    list.push({ geo: c(new CylinderGeometry(4, 4, 1, 48).translate(0, lanternBase + 7.2, 0)), mat: plain });
    const cap: Vector2[] = [];
    for (let k = 0; k <= 12; k++) {
      const th = (k / 12) * (Math.PI / 2);
      cap.push(v2(0.05 + 3.6 * Math.cos(th), 2.2 * Math.sin(th)));
    }
    list.push({ geo: c(new LatheGeometry(cap, 48).translate(0, lanternBase + 7.7, 0)), mat: plain });
    const statueBase = g + 86.6 - 4.75;
    list.push({ geo: c(new CylinderGeometry(0.5, 0.7, statueBase - (lanternBase + 9.9), 16).translate(0, (statueBase + lanternBase + 9.9) / 2, 0)), mat: plain });
    list.push({ geo: c(statue().translate(0, statueBase, 0)), mat: gold });

    // Sculpture groups on the four diagonals at the foot of the drum.
    const groups: BufferGeometry[] = [];
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      const m = new Matrix4().makeRotationY(a).setPosition(cx + Math.sin(a) * 20.7, g + 31, cz + Math.cos(a) * 20.7);
      const grp = [
        new BoxGeometry(5.2, 1.6, 2.4).translate(0, 0.8, 0),
        new BoxGeometry(5.6, 0.3, 2.7).translate(0, 1.6, 0),
        figure(4.8, "stand").translate(0, 1.75, -0.2),
        figure(3.8, "seat").translate(-1.6, 1.75, 0.2),
        figure(3.8, "seat").translate(1.6, 1.75, 0.2),
      ];
      groups.push(merge(grp).applyMatrix4(m));
    }
    // Their shadows fall on the pavilion roof, out of sight from the street.
    list.push({ geo: merge(groups), mat: plain, cast: false });

    // Porticos where the wings end, one along each axis. The stonework is
    // one mesh; the columns switch detail with distance from the portico.
    const port = portico();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const e = Math.max(...pts.map(([x, z]) => (x - cx) * dx + (z - cz) * dz));
      const m = new Matrix4().makeRotationY(Math.atan2(dx, dz)).setPosition(cx + dx * e, groundY(cx + dx * (e + 9), cz + dz * (e + 9)), cz + dz * e);
      list.push({ geo: port.mass.clone().applyMatrix4(m), mat: plain });
      list.push({ geo: port.columns.shadow.clone().applyMatrix4(m), mat: SHADOW_ONLY });
      const cols = twoLevels(port.columns.near, port.columns.far, plain, PORTICO_LOD);
      cols.applyMatrix4(m);
      objects.push(cols);
    }

    list.push({ geo: merge(bal.stone), mat: plain });
    // Balusters in 40 m tiles: culled out of view, dropped past 220 m (where
    // each is under a pixel wide and the rails and posts carry the look).
    // Their shadows fall on the roofs, so they don't cast.
    objects.push(tiledInstances(baluster(), plain, bal.balusters, 40, { castShadow: false, hideBeyond: 220 }));
    return { parts: list, objects };
  }, [scan]);
  return (
    <>
      {parts.map(({ geo, mat, cast }, i) => (
        <mesh key={i} geometry={geo} material={mat} castShadow={cast ?? true} receiveShadow={mat !== SHADOW_ONLY} />
      ))}
      {objects.map((o, i) => (
        <primitive key={`o${i}`} object={o} />
      ))}
    </>
  );
}

// Distances (m) past which the columns switch to their plain version.
const PORTICO_LOD = 110;
const COLONNADE_LOD = 150;

function ring(count: number, radius: number, geo: BufferGeometry, y: number) {
  const parts: BufferGeometry[] = [];
  for (let k = 0; k < count; k++) {
    const a = ((k + 0.5) / count) * Math.PI * 2;
    parts.push(geo.clone().translate(Math.cos(a) * radius, y, Math.sin(a) * radius));
  }
  return mergeGeometries(parts);
}

// The polygon pushed out by d (mitred corners, clamped at sharp ones).
function offsetPolygon(pts: [number, number][], d: number, out: number): [number, number][] {
  const n = pts.length;
  const normal = (i: number) => {
    const a = pts[i], b = pts[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [((b[1] - a[1]) / len) * out, (-(b[0] - a[0]) / len) * out];
  };
  return pts.map(([x, z], i) => {
    const n1 = normal((i - 1 + n) % n), n2 = normal(i);
    let mx = n1[0] + n2[0], mz = n1[1] + n2[1];
    const ml = Math.hypot(mx, mz) || 1;
    mx /= ml;
    mz /= ml;
    const k = Math.min(3, 1 / Math.max(0.3, mx * n1[0] + mz * n1[1]));
    return [x + mx * d * k, z + mz * d * k];
  });
}

// Flat roof over a footprint.
function roofOver(pts: [number, number][], y: number) {
  const shape = new Shape(pts.map(([x, z]) => new Vector2(x, -z)));
  return new ShapeGeometry(shape).rotateX(-Math.PI / 2).translate(0, y, 0);
}
