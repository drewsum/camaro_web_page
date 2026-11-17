import { useMemo } from "react";
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  LatheGeometry,
  Matrix4,
  MeshStandardMaterial,
  RingGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Vector2,
  type Texture,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { groundY, MAP, signedArea } from "./data";
import { CAPITOL_BAY, CAPITOL_STOREY, domeTexture, graniteTextures } from "./textures";

// The Wisconsin State Capitol (1917): four granite wings on its mapped
// footprint, each ending in a six-column portico, and at the crossing the
// drum, colonnade, dome and lantern, topped by Daniel Chester French's gilded
// "Wisconsin" 86.6 m above the ground. Proportions are from photographs and
// the mapped height; the details are simplified.

const WING_H = 24;
const CORNICE_H = 1.8;

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

// Cylinder whose window texture tiles in whole bays around it.
function drum(r: number, y0: number, y1: number, tex: ReturnType<typeof graniteTextures>, storey = CAPITOL_STOREY) {
  const geo = new CylinderGeometry(r, r, y1 - y0, 96, 1, true).translate(0, (y0 + y1) / 2, 0);
  const bays = Math.max(1, Math.round((2 * Math.PI * r) / CAPITOL_BAY));
  const mat = new MeshStandardMaterial({ ...repeated(tex, bays, Math.max(1, Math.round((y1 - y0) / storey))), roughness: 1, metalness: 1 });
  return { geo, mat };
}

function column(r: number, h: number) {
  const shaft = new CylinderGeometry(r * 0.88, r, h, 20).translate(0, h / 2, 0);
  const base = new CylinderGeometry(r * 1.25, r * 1.3, 0.5, 20).translate(0, 0.25, 0);
  const capital = new CylinderGeometry(r * 1.35, r * 0.9, r * 1.4, 20).translate(0, h - r * 0.7, 0);
  const abacus = new BoxGeometry(r * 2.9, r * 0.35, r * 2.9).translate(0, h + r * 0.17, 0);
  return mergeGeometries([shaft, base, capital, abacus].map((g) => g.toNonIndexed()));
}

function ring(count: number, radius: number, geo: BufferGeometry, y: number) {
  const parts: BufferGeometry[] = [];
  for (let k = 0; k < count; k++) {
    const a = ((k + 0.5) / count) * Math.PI * 2;
    parts.push(geo.clone().translate(Math.cos(a) * radius, y, Math.sin(a) * radius));
  }
  return mergeGeometries(parts);
}

// A portico on a podium with steps, built facing +z with its back at z = 0.
function portico() {
  const W = 26, D = 7.5, PODIUM = 4.5, COL_H = 15;
  const parts: BufferGeometry[] = [];
  parts.push(new BoxGeometry(W, PODIUM + 1, D).translate(0, (PODIUM - 1) / 2, D / 2));
  for (let k = 0; k < 10; k++) {
    const h = PODIUM * (1 - (k + 1) / 11);
    parts.push(new BoxGeometry(18, h + 1, 0.5).translate(0, (h - 1) / 2, D + 0.25 + k * 0.5));
  }
  const col = column(0.75, COL_H);
  for (let k = 0; k < 6; k++) parts.push(col.clone().translate(-11 + k * 4.4, PODIUM, D - 1.6));
  const top = PODIUM + COL_H + 0.3;
  parts.push(new BoxGeometry(W, 2.6, D + 0.4).translate(0, top + 1.3, (D + 0.4) / 2));
  const tri = new Shape([new Vector2(-W / 2 - 0.3, 0), new Vector2(W / 2 + 0.3, 0), new Vector2(0, 5.2)]);
  parts.push(new ExtrudeGeometry(tri, { depth: D + 0.8, bevelEnabled: false }).translate(0, top + 2.6, 0));
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => {
    g.deleteAttribute("uv");
    return g;
  }));
}

function statue() {
  const gold: BufferGeometry[] = [];
  const robe = new LatheGeometry(
    [new Vector2(0.01, 0), new Vector2(0.55, 0), new Vector2(0.5, 1.2), new Vector2(0.36, 2.4), new Vector2(0.3, 3.0), new Vector2(0.12, 3.2), new Vector2(0.01, 3.25)],
    24,
  );
  gold.push(robe);
  gold.push(new SphereGeometry(0.27, 16, 12).translate(0, 3.5, 0));
  // Right arm raised, holding a globe with an eagle.
  gold.push(new CylinderGeometry(0.09, 0.11, 1.4, 10).rotateZ(-0.45).translate(0.5, 3.55, 0));
  gold.push(new SphereGeometry(0.32, 16, 12).translate(0.8, 4.25, 0));
  gold.push(new CylinderGeometry(0.0, 0.25, 0.4, 8).translate(0.8, 4.7, 0));
  return mergeGeometries(gold.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => {
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
    return g;
  }));
}

export default function Capitol() {
  const parts = useMemo(() => {
    const { cx, cz, ground: g } = bounds();
    const list: { geo: BufferGeometry; mat: MeshStandardMaterial; shadow?: boolean }[] = [];
    const windows = graniteTextures(true);
    const plainTex = graniteTextures(false);
    const plain = new MeshStandardMaterial({ color: "#e7e2d7", roughness: 0.8 });
    const gold = new MeshStandardMaterial({ color: "#d9a83f", metalness: 1, roughness: 0.28 });

    // Wings: walls on the footprint, a cornice band and a flat roof.
    const pts = MAP.capitol;
    const out = signedArea(pts) > 0 ? 1 : -1;
    const walls: number[] = [], nor: number[] = [], uv: number[] = [];
    const cornice: number[] = [], cnor: number[] = [], cuv: number[] = [];
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
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], c = pts[(i + 1) % pts.length];
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      quad(walls, nor, uv, a, c, base, g + WING_H, run / CAPITOL_BAY, (run + len) / CAPITOL_BAY, (base - g) / CAPITOL_STOREY, WING_H / CAPITOL_STOREY);
      run += len;
    }
    // Projecting bands: a plinth, string courses at the floor lines and an
    // overhanging cornice under the balustrade. Each is the footprint pushed
    // out by `d`, with its own top and underside so it catches light and
    // casts a shadow line.
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
    band(0.22, g + CAPITOL_STOREY - 0.2, g + CAPITOL_STOREY + 0.3);
    band(0.18, g + 3 * CAPITOL_STOREY - 0.15, g + 3 * CAPITOL_STOREY + 0.2);
    band(0.75, g + WING_H - 0.2, g + WING_H + 0.8);
    band(0.1, g + WING_H + 0.8, g + WING_H + CORNICE_H);
    const geoOf = (P: number[], N: number[], U: number[]) => {
      const geo = new BufferGeometry();
      geo.setAttribute("position", new BufferAttribute(new Float32Array(P), 3));
      geo.setAttribute("normal", new BufferAttribute(new Float32Array(N), 3));
      geo.setAttribute("uv", new BufferAttribute(new Float32Array(U), 2));
      return geo;
    };
    list.push({ geo: geoOf(walls, nor, uv), mat: new MeshStandardMaterial({ ...windows, roughness: 1, metalness: 1 }) });
    list.push({ geo: geoOf(cornice, cnor, cuv), mat: new MeshStandardMaterial({ ...plainTex, roughness: 0.85, metalness: 0 }) });
    const roofGeo = roofOver(pts, g + WING_H + CORNICE_H);
    list.push({ geo: roofGeo, mat: new MeshStandardMaterial({ color: "#a29d93", roughness: 0.9 }) });

    // The crossing: pavilion, drum and colonnade, attic, dome, lantern.
    const c = (geo: BufferGeometry) => geo.translate(cx, 0, cz);
    const pav = drum(22, g + WING_H - 2, g + 31, windows);
    list.push({ geo: c(pav.geo), mat: pav.mat });
    list.push({ geo: c(new RingGeometry(15, 22.4, 96).rotateX(-Math.PI / 2).translate(0, g + 31, 0)), mat: plain });
    list.push({ geo: c(new CylinderGeometry(19.8, 20.2, 1.2, 96).translate(0, g + 31.6, 0)), mat: plain });
    const drumWall = drum(16, g + 32, g + 47, windows, 7.5);
    list.push({ geo: c(drumWall.geo), mat: drumWall.mat });
    list.push({ geo: c(ring(24, 18.4, column(0.66, 13.4), g + 32.2)), mat: plain });
    list.push({ geo: c(new CylinderGeometry(19.8, 19.8, 2.6, 96).translate(0, g + 47, 0)), mat: plain });
    const attic = drum(16.8, g + 48.3, g + 54, plainTex);
    list.push({ geo: c(attic.geo), mat: attic.mat });
    list.push({ geo: c(new RingGeometry(0, 17, 96).rotateX(-Math.PI / 2).translate(0, g + 54, 0)), mat: plain });
    const profile: Vector2[] = [];
    const end = Math.acos(3.6 / 16.2);
    for (let k = 0; k <= 32; k++) {
      const th = (k / 32) * end;
      profile.push(new Vector2(16.2 * Math.cos(th), 19 * Math.sin(th)));
    }
    const dome = domeTexture();
    list.push({ geo: c(new LatheGeometry(profile, 96).translate(0, g + 54, 0)), mat: new MeshStandardMaterial({ map: dome, roughness: 0.75, side: DoubleSide }) });
    const lanternBase = g + 54 + 19 * Math.sin(end);
    list.push({ geo: c(new CylinderGeometry(4.3, 4.6, 1.2, 48).translate(0, lanternBase + 0.6, 0)), mat: plain });
    list.push({ geo: c(new CylinderGeometry(2.7, 2.7, 5.5, 48).translate(0, lanternBase + 1.2 + 2.75, 0)), mat: plain });
    list.push({ geo: c(ring(8, 3.5, column(0.22, 5.2), lanternBase + 1.2)), mat: plain });
    list.push({ geo: c(new CylinderGeometry(4, 4, 1, 48).translate(0, lanternBase + 7.2, 0)), mat: plain });
    const cap: Vector2[] = [];
    for (let k = 0; k <= 12; k++) {
      const th = (k / 12) * (Math.PI / 2);
      cap.push(new Vector2(0.05 + 3.6 * Math.cos(th), 2.2 * Math.sin(th)));
    }
    list.push({ geo: c(new LatheGeometry(cap, 48).translate(0, lanternBase + 7.7, 0)), mat: plain });
    const statueBase = g + 86.6 - 4.75;
    list.push({ geo: c(new CylinderGeometry(0.5, 0.7, statueBase - (lanternBase + 9.9), 16).translate(0, (statueBase + lanternBase + 9.9) / 2, 0)), mat: plain });
    list.push({ geo: c(statue().translate(0, statueBase, 0)), mat: gold });

    // Porticos where the wings end, one along each axis.
    const port = portico();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const e = Math.max(...pts.map(([x, z]) => (x - cx) * dx + (z - cz) * dz));
      const m = new Matrix4().makeRotationY(Math.atan2(dx, dz)).setPosition(cx + dx * e, groundY(cx + dx * (e + 9), cz + dz * (e + 9)), cz + dz * e);
      list.push({ geo: port.clone().applyMatrix4(m), mat: plain });
    }
    return list;
  }, []);
  return (
    <>
      {parts.map(({ geo, mat }, i) => (
        <mesh key={i} geometry={geo} material={mat} castShadow receiveShadow />
      ))}
    </>
  );
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
