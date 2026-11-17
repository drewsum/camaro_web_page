import { useMemo } from "react";
import { BufferAttribute, BufferGeometry, MeshStandardMaterial, ShapeUtils, Vector2, type Material } from "three";
import { groundY, hash, MAP, signedArea, type Building, type Pt } from "./data";
import { BAY, facadeTextures, FACADES, garageTextures, roofTexture, SHOP_H, SHOP_W, storefrontTextures, STOREY } from "./textures";

// The blocks around the Square, extruded from their OpenStreetMap footprints
// to their mapped heights (or storeys). Each gets a facade style, and the
// commercial ones shopfronts at street level.

class Bucket {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  geometry() {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute("normal", new BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute("uv", new BufferAttribute(new Float32Array(this.uv), 2));
    return g;
  }
}

const NO_SHOPS = new Set(["house", "apartments", "residential", "garage", "parking", "shed", "church", "public", "government", "civic"]);
const SHOP_VARIANTS = 4;

// Wall quad from a to b between heights y0 and y1, with u along the wall and
// v up it. `out` = +1 when outward is (dz, -dx), i.e. for a polygon with
// positive signed area (see signedArea), whose inside is to the left of a→b.
function wall(b: Bucket, a: Pt, c: Pt, y0: number, y1: number, u0: number, u1: number, v0: number, v1: number, out: number) {
  const dx = c[0] - a[0], dz = c[1] - a[1];
  const len = Math.hypot(dx, dz);
  const nx = (dz / len) * out, nz = (-dx / len) * out;
  const P = [
    [a[0], y0, a[1], u0, v0],
    [c[0], y0, c[1], u1, v0],
    [c[0], y1, c[1], u1, v1],
    [a[0], y1, a[1], u0, v1],
  ];
  const tri = out > 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
  for (const k of tri) {
    const [x, y, z, u, v] = P[k];
    b.pos.push(x, y, z);
    b.nor.push(nx, 0, nz);
    b.uv.push(u, v);
  }
}

function roof(b: Bucket, pts: Pt[], y: number) {
  const contour = pts.map(([x, z]) => new Vector2(x, z));
  const tris = ShapeUtils.triangulateShape(contour, []);
  for (const t of tris) {
    const [p, q, r] = t.map((i) => pts[i]);
    // Face up: counterclockwise seen from above means (q-p)×(r-p) has +y.
    const up = (q[1] - p[1]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[1] - p[1]) > 0;
    for (const v of up ? [p, q, r] : [p, r, q]) {
      b.pos.push(v[0], y, v[1]);
      b.nor.push(0, 1, 0);
      b.uv.push(v[0] / 8, v[1] / 8);
    }
  }
}

function styleFor(bd: Building) {
  const r = hash(bd.id, 3);
  if (bd.h > 36) return r < 0.5 ? 3 : r < 0.75 ? 5 : 2;
  if (bd.kind === "house" || bd.kind === "residential") return [0, 1, 4, 7][Math.floor(r * 4)];
  return Math.floor(r * FACADES.length);
}

export function buildingGeometries() {
  const facade = FACADES.map(() => new Bucket());
  const shops = Array.from({ length: SHOP_VARIANTS }, () => new Bucket());
  const garage = new Bucket();
  const roofs = new Bucket();
  for (const bd of MAP.buildings) {
    const pts = bd.pts;
    const ground = pts.map(([x, z]) => groundY(x, z));
    const street = ground.reduce((a, b) => a + b, 0) / ground.length;
    const base = Math.min(...ground) - 0.4;
    const top = street + bd.h;
    const bottom = bd.min ? street + bd.min : base;
    const out = signedArea(pts) > 0 ? 1 : -1;
    const isGarage = bd.kind === "parking" || bd.kind === "garage" || /ramp|garage|parking/i.test(bd.name ?? "");
    const shopfront = !isGarage && !bd.min && !NO_SHOPS.has(bd.kind) && bd.h >= 7;
    const split = shopfront ? street + SHOP_H : bottom;
    const style = facade[styleFor(bd)];
    let run = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], c = pts[(i + 1) % pts.length];
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (isGarage) {
        wall(garage, a, c, bottom, top, run / 4, (run + len) / 4, (bottom - street) / 3, (top - street) / 3, out);
      } else {
        wall(style, a, c, split, top, run / BAY, (run + len) / BAY, (split - street - (shopfront ? SHOP_H : 0.6)) / STOREY, (top - street - (shopfront ? SHOP_H : 0.6)) / STOREY, out);
        if (shopfront) {
          const shop = shops[Math.floor(hash(bd.id, i) * SHOP_VARIANTS)];
          // Below street level on a slope, the shopfront's plinth carries on down.
          wall(shop, a, c, base, street, run / SHOP_W, (run + len) / SHOP_W, 0, 0, out);
          wall(shop, a, c, street, split, run / SHOP_W, (run + len) / SHOP_W, 0, 1, out);
        }
      }
      run += len;
    }
    roof(roofs, pts, top);
  }
  return { facade: facade.map((b) => b.geometry()), shops: shops.map((b) => b.geometry()), garage: garage.geometry(), roofs: roofs.geometry() };
}

export default function Buildings() {
  const parts = useMemo(() => {
    const g = buildingGeometries();
    const list: { geo: BufferGeometry; mat: Material }[] = [];
    facadeTextures().forEach((t, i) => list.push({ geo: g.facade[i], mat: new MeshStandardMaterial({ ...t, roughness: 1, metalness: 1, envMapIntensity: 1 }) }));
    for (let i = 0; i < SHOP_VARIANTS; i++) {
      list.push({ geo: g.shops[i], mat: new MeshStandardMaterial({ ...storefrontTextures(200 + i), roughness: 1, metalness: 1 }) });
    }
    list.push({ geo: g.garage, mat: new MeshStandardMaterial({ ...garageTextures(), roughness: 0.9 }) });
    list.push({ geo: g.roofs, mat: new MeshStandardMaterial({ map: roofTexture(), roughness: 0.95 }) });
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
