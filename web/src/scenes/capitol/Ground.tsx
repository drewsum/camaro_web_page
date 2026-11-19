import { useMemo } from "react";
import { BufferAttribute, BufferGeometry, CanvasTexture, LinearMipmapLinearFilter, MeshStandardMaterial, SRGBColorSpace, type Texture } from "three";
import { EXTENT, GRID, groundY, MAP, segmentDistance, type Pt } from "./data";
import { RING, ringCentre, ringTrack } from "./ringTrack";
import { ASPHALT_WEAR_TILE, asphaltWearTexture, grassTexture, PANEL, paintWearTexture, sidewalkJointsTexture } from "./textures";
import { preloadPbr, usePbrTextures } from "../common/pbr";

// The ground: one terrain mesh over the real elevation grid, surfaced from a
// painted map of where the asphalt, sidewalks and lawns are. Each surface's
// detail texture tiles in map space, so a single mesh carries the streets
// and the lawns without any draped polygons; markings and curbs go on top.

const ZONE_SIZE = 2048;
const FAR = 3000; // the terrain runs out flat to here, under the fog

// ---- Where things are -----------------------------------------------------

const toPx = (v: number) => ((v + EXTENT) / (2 * EXTENT)) * ZONE_SIZE;

function zoneMap() {
  const c = document.createElement("canvas");
  c.width = c.height = ZONE_SIZE;
  const g = c.getContext("2d")!;
  // Blue = concrete (the default: sidewalks and plazas), red = grass, green = asphalt.
  g.fillStyle = "#0000ff";
  g.fillRect(0, 0, ZONE_SIZE, ZONE_SIZE);
  const poly = (p: Pt[]) => {
    g.beginPath();
    p.forEach(([x, z], i) => (i ? g.lineTo(toPx(x), toPx(z)) : g.moveTo(toPx(x), toPx(z))));
    g.closePath();
  };
  g.fillStyle = "#ff0000";
  for (const a of MAP.green) {
    if (a.kind === "park") continue;
    poly(a.pts);
    g.fill();
  }
  g.strokeStyle = "#00ff00";
  g.lineCap = "round";
  g.lineJoin = "round";
  const scale = ZONE_SIZE / (2 * EXTENT);
  for (const r of MAP.roads) {
    g.lineWidth = r.width * scale;
    g.beginPath();
    r.pts.forEach(([x, z], i) => (i ? g.lineTo(toPx(x), toPx(z)) : g.moveTo(toPx(x), toPx(z))));
    g.stroke();
  }
  g.lineWidth = 2 * RING.halfWidth * scale;
  poly(ringCentre());
  g.stroke();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.minFilter = LinearMipmapLinearFilter;
  t.anisotropy = 8;
  return t;
}

// ---- Terrain ----------------------------------------------------------------

function terrainGeometry() {
  const { x0, z0, step, n } = GRID;
  // The grid's own lines, plus one far line on each side.
  const lines = [-FAR, ...Array.from({ length: n }, (_, i) => x0 + i * step), FAR];
  const linesZ = [-FAR, ...Array.from({ length: n }, (_, j) => z0 + j * step), FAR];
  const m = lines.length;
  const pos = new Float32Array(m * m * 3);
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < m; i++) {
      const x = lines[i], z = linesZ[j];
      pos.set([x, groundY(x, z), z], (j * m + i) * 3);
    }
  }
  const index: number[] = [];
  for (let j = 0; j < m - 1; j++) {
    for (let i = 0; i < m - 1; i++) {
      const a = j * m + i, b = a + 1, c = a + m, d = c + 1;
      // Split from (i+1, j) to (i, j+1), as groundY interpolates.
      index.push(a, c, b, b, c, d);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

// Scanned CC0 surfaces from Poly Haven: the same weathered grey asphalt as
// the coast road, and broom-finished concrete for the sidewalks.
const ASPHALT = "asphalt_04"; // one scan covers 4 m
const SIDEWALK = "brushed_concrete_03"; // 2 m
preloadPbr(ASPHALT);
preloadPbr(SIDEWALK);

type Pbr = ReturnType<typeof usePbrTextures>;

function groundMaterial(asphalt: Pbr, walk: Pbr) {
  const zone = zoneMap();
  const wear = asphaltWearTexture();
  const joints = sidewalkJointsTexture();
  const grass = grassTexture();
  const m = new MeshStandardMaterial({ roughness: 1 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uZone: { value: zone },
      uGrass: { value: grass },
      uAsphalt: { value: asphalt.map },
      uAsphaltN: { value: asphalt.normalMap },
      uAsphaltArm: { value: asphalt.arm },
      uWear: { value: wear },
      uWalk: { value: walk.map },
      uWalkN: { value: walk.normalMap },
      uWalkArm: { value: walk.arm },
      uJoints: { value: joints },
    });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vMap;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvMap = position.xz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec2 vMap;
        uniform sampler2D uZone, uGrass, uAsphalt, uAsphaltN, uAsphaltArm, uWear, uWalk, uWalkN, uWalkArm, uJoints;
        vec3 zoneW;
        vec2 auv, cuv;
        vec3 aArm, cArm;
        // Tangent frame from screen-space derivatives (as three's own
        // normal mapping does), with the map coordinates as UVs.
        mat3 groundTBN(vec3 eye, vec3 n, vec2 uv) {
          vec3 q0 = dFdx(eye), q1 = dFdy(eye);
          vec2 st0 = dFdx(uv), st1 = dFdy(uv);
          vec3 q1perp = cross(q1, n), q0perp = cross(n, q0);
          vec3 T = q1perp * st0.x + q0perp * st1.x;
          vec3 B = q1perp * st0.y + q0perp * st1.y;
          float det = max(dot(T, T), dot(B, B));
          float s = det == 0.0 ? 0.0 : inversesqrt(det);
          return mat3(T * s, B * s, n);
        }`,
      )
      .replace(
        "#include <map_fragment>",
        `vec2 zuv = (vMap + ${EXTENT.toFixed(1)}) / ${(2 * EXTENT).toFixed(1)};
        zoneW = texture2D(uZone, vec2(zuv.x, 1.0 - zuv.y)).rgb;
        zoneW = smoothstep(0.3, 0.7, zoneW); // crisper edges than the map's pixels
        zoneW /= max(zoneW.r + zoneW.g + zoneW.b, 1e-3);
        auv = vMap / 4.0;
        cuv = vMap / 2.0;
        aArm = texture2D(uAsphaltArm, auv).rgb;
        cArm = texture2D(uWalkArm, cuv).rgb;
        vec3 grassC = texture2D(uGrass, vMap / 4.0).rgb * (0.85 + 0.3 * texture2D(uGrass, vMap / 31.0).g);
        // Large, slow variation from the scan itself sampled far out, so the
        // 4 m tile doesn't read as a grid down a long street.
        float slow = 0.9 + 0.35 * (texture2D(uAsphalt, vMap / 53.0 + 0.37).r - 0.35);
        vec3 asphaltC = texture2D(uAsphalt, auv).rgb * 0.85 * slow * aArm.r
          * texture2D(uWear, vMap / ${ASPHALT_WEAR_TILE.toFixed(1)}).rgb;
        // The scan is a warm, dirty slab; Madison's sidewalks are pale grey.
        vec3 walkScan = texture2D(uWalk, cuv).rgb;
        walkScan = mix(vec3(dot(walkScan, vec3(0.3, 0.59, 0.11))), walkScan, 0.25) * vec3(1.0, 0.99, 0.96);
        vec3 walkC = walkScan * 1.9 * cArm.r * texture2D(uJoints, vMap / ${(3 * PANEL).toFixed(1)}).rgb;
        diffuseColor.rgb *= grassC * zoneW.r + asphaltC * zoneW.g + walkC * zoneW.b;`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        "float roughnessFactor = roughness * (0.97 * zoneW.r + aArm.g * zoneW.g + cArm.g * zoneW.b);",
      )
      .replace(
        "#include <normal_fragment_maps>",
        `vec3 nA = texture2D(uAsphaltN, auv).xyz * 2.0 - 1.0;
        vec3 nC = texture2D(uWalkN, cuv).xyz * 2.0 - 1.0;
        vec3 nts = vec3(0.0, 0.0, 1.0) * zoneW.r + nA * zoneW.g + nC * zoneW.b;
        nts.xy *= 0.8;
        normal = normalize(groundTBN(-vViewPosition, normal, vMap) * nts);`,
      );
  };
  return m;
}

// Street paint, flaked where the wear texture says so.
function paintMaterial(color: string, wear: Texture) {
  const m = new MeshStandardMaterial({ color, roughness: 0.7, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uPaintWear = { value: wear };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vMap;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvMap = position.xz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vMap;\nuniform sampler2D uPaintWear;")
      .replace("#include <map_fragment>", "#include <map_fragment>\ndiffuseColor.a *= 0.92 * texture2D(uPaintWear, vMap / 2.0).r;");
  };
  return m;
}

// ---- Markings ---------------------------------------------------------------

const LIFT = 0.025;

// Quads laid on the ground, collected into one geometry.
class Decals {
  private pos: number[] = [];
  // A strip from a to b, `width` wide, subdivided so it follows the ground.
  strip(a: Pt, b: Pt, width: number, lift = LIFT) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-3) return;
    const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
    const nx = -dz * (width / 2), nz = dx * (width / 2);
    const steps = Math.max(1, Math.ceil(len / 2));
    for (let k = 0; k < steps; k++) {
      const t0 = (k / steps) * len, t1 = ((k + 1) / steps) * len;
      const p = (t: number, side: number): number[] => {
        const x = a[0] + dx * t + nx * side, z = a[1] + dz * t + nz * side;
        return [x, groundY(x, z) + lift, z];
      };
      const [l0, r0, l1, r1] = [p(t0, 1), p(t0, -1), p(t1, 1), p(t1, -1)];
      this.pos.push(...l0, ...r0, ...l1, ...l1, ...r0, ...r1);
    }
  }
  geometry() {
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(new Float32Array(this.pos), 3));
    // Make every triangle face up whichever way it was wound.
    const p = geo.attributes.position.array as Float32Array;
    for (let i = 0; i < p.length; i += 9) {
      const ax = p[i + 3] - p[i], az = p[i + 5] - p[i + 2];
      const bx = p[i + 6] - p[i], bz = p[i + 8] - p[i + 2];
      if (az * bx - ax * bz < 0) {
        for (let k = 0; k < 3; k++) [p[i + 3 + k], p[i + 6 + k]] = [p[i + 6 + k], p[i + 3 + k]];
      }
    }
    geo.computeVertexNormals();
    return geo;
  }
}

// Ring frame at each metre of the centreline: point and heading.
function ringFrame() {
  const c = ringCentre();
  const n = c.length;
  return c.map(([x, z], i) => {
    const [ax, az] = c[(i - 1 + n) % n], [bx, bz] = c[(i + 1) % n];
    return { x, z, h: Math.atan2(bx - ax, bz - az) };
  });
}

const along = (f: { x: number; z: number; h: number }, u: number): Pt => [f.x + Math.cos(f.h) * u, f.z - Math.sin(f.h) * u];

// How close to a junction (on the ring's centreline) markings and curbs stop.
function junctionClear(x: number, z: number, corner: number, avenue: number) {
  for (const it of ringTrack.intersections) {
    const r = it.corner ? corner : avenue;
    if (Math.hypot(x - it.at[0], z - it.at[1]) < r) return false;
  }
  return true;
}

type OnRoad = (x: number, z: number, own: number) => boolean;

// A road's centreline every `ds` metres.
function densify(pts: Pt[], ds: number) {
  const dense: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / ds));
    for (let k = 0; k < steps; k++) dense.push([ax + ((bx - ax) * k) / steps, az + ((bz - az) * k) / steps]);
  }
  dense.push(pts[pts.length - 1]);
  return dense;
}

function offsetLine(pts: Pt[], u: number, closed: boolean): Pt[] {
  const n = pts.length;
  return pts.map(([x, z], i) => {
    const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const h = Math.atan2(b[0] - a[0], b[1] - a[1]);
    return [x + Math.cos(h) * u, z - Math.sin(h) * u];
  });
}

// Centre lines on two-way side streets, lane lines on the wide ones, both
// stopping where another street crosses.
function streetLines(d: Decals, onRoad: OnRoad, yellow: Decals) {
  MAP.roads.forEach((r, ri) => {
    if (r.kind === "service" || r.width < 7) return;
    const centre = densify(r.pts, 1);
    const line = (u: number, dashed: boolean, target: Decals, width = 0.12) => {
      const pts = offsetLine(centre, u, false);
      let run = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        const on = !dashed || run % 12 < 3;
        run += len;
        if (on && !onRoad(ax, az, ri) && !onRoad(bx, bz, ri)) target.strip(pts[i], pts[i + 1], width);
      }
    };
    if (!r.oneway) {
      line(0.12, false, yellow, 0.1);
      line(-0.12, false, yellow, 0.1);
      const perDir = Math.floor(r.lanes / 2);
      for (let k = 1; k < perDir; k++) for (const side of [1, -1]) line(side * k * 3.3, true, d);
    } else {
      for (let k = 1; k < r.lanes; k++) line(-((r.lanes * 3.3) / 2) + k * 3.3, true, d);
    }
  });
}

function markings(onRoad: OnRoad) {
  const d = new Decals();
  const yellow = new Decals();
  streetLines(d, onRoad, yellow);
  const frame = ringFrame();
  const n = frame.length;
  const clear = frame.map((f) => junctionClear(f.x, f.z, 24, 14));
  for (let i = 0; i < n; i++) {
    if (!clear[i] || !clear[(i + 1) % n]) continue;
    const f0 = frame[i], f1 = frame[(i + 1) % n];
    d.strip(along(f0, RING.innerParking), along(f1, RING.innerParking), 0.12);
    d.strip(along(f0, RING.outerParking), along(f1, RING.outerParking), 0.12);
    if (i % 12 < 3) d.strip(along(f0, RING.laneLine), along(f1, RING.laneLine), 0.12);
  }
  // Stop bars and crosswalks on the ring, before and after each junction.
  const lanePt = (s: number, u: number): Pt => {
    const p = ringTrack.at(s);
    const [x, , z] = ringTrack.offset(p, u);
    return [x, z];
  };
  const across = (s: number, from: number, to: number, width: number) => d.strip(lanePt(s, from), lanePt(s, to), width);
  const roadL = RING.halfWidth - RING.lane; // edges of the roadway in lane coordinates
  const roadR = -RING.halfWidth - RING.lane;
  const zebra = (s: number) => {
    for (let u = roadR + 0.6; u < roadL - 0.3; u += 1.2) {
      const a = lanePt(s - 1.5, u), b = lanePt(s + 1.5, u);
      d.strip(a, b, 0.6);
    }
  };
  for (const it of ringTrack.intersections) {
    const near = it.corner ? it.stop + 4 : it.s - 13;
    across(near, RING.outerParking - RING.lane, RING.innerParking - RING.lane, 0.5); // stop bar
    zebra(near + 3);
    zebra(it.corner ? it.s + 22 : it.s + 12);
    // Across each side street, just off the ring.
    for (const dir of it.dirs) {
      const dx = Math.sin(dir), dz = Math.cos(dir);
      const cx = it.at[0] + dx * (RING.halfWidth + 4), cz = it.at[1] + dz * (RING.halfWidth + 4);
      for (let w = -5; w <= 5; w += 1.2) {
        const px = cx + dz * w, pz = cz - dx * w;
        d.strip([px - dx * 1.5, pz - dz * 1.5], [px + dx * 1.5, pz + dz * 1.5], 0.6);
      }
    }
  }
  return { white: d.geometry(), yellow: yellow.geometry() };
}

// ---- Curbs ------------------------------------------------------------------

// Spatial index of road segments, for cutting curbs where streets meet.
function roadIndex() {
  const cell = 25;
  const map = new Map<string, { a: Pt; b: Pt; half: number; road: number }[]>();
  const add = (a: Pt, b: Pt, half: number, road: number) => {
    const x0 = Math.floor(Math.min(a[0], b[0]) / cell) - 1, x1 = Math.floor(Math.max(a[0], b[0]) / cell) + 1;
    const z0 = Math.floor(Math.min(a[1], b[1]) / cell) - 1, z1 = Math.floor(Math.max(a[1], b[1]) / cell) + 1;
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const k = `${i},${j}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push({ a, b, half, road });
    }
  };
  MAP.roads.forEach((r, ri) => {
    for (let i = 0; i < r.pts.length - 1; i++) add(r.pts[i], r.pts[i + 1], r.width / 2, ri);
  });
  const ring = ringCentre();
  for (let i = 0; i < ring.length; i++) add(ring[i], ring[(i + 1) % ring.length], RING.halfWidth, -1);
  // True if (x, z) is on the pavement of a street other than `own` (ways
  // sharing its name count as the same street).
  const street = (i: number) => (i < 0 ? "(ring)" : MAP.roads[i].name || `#${i}`);
  return (x: number, z: number, own: number) => {
    const list = map.get(`${Math.floor(x / cell)},${Math.floor(z / cell)}`) ?? [];
    const name = street(own);
    return list.some((s) => street(s.road) !== name && segmentDistance(x, z, s.a, s.b) < s.half - 0.2);
  };
}

const CURB_H = 0.14;
const CURB_W = 0.22;

function curbs(onRoad: OnRoad) {
  const pos: number[] = [];
  // Curb along a run of points, its face toward `side` (+1 = left of travel).
  const run = (pts: Pt[], face: number) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-3 || len > 3) continue;
      const nx = (-(bz - az) / len) * face, nz = ((bx - ax) / len) * face; // toward the road
      const ya = groundY(ax, az), yb = groundY(bx, bz);
      const top = (x: number, z: number, y: number, o: number) => [x - nx * o, y + CURB_H, z - nz * o];
      const A = [ax, ya - 0.05, az], B = [bx, yb - 0.05, bz];
      const At = top(ax, az, ya, 0), Bt = top(bx, bz, yb, 0);
      const Ab = top(ax, az, ya, CURB_W), Bb = top(bx, bz, yb, CURB_W);
      pos.push(...A, ...B, ...At, ...At, ...B, ...Bt); // face
      pos.push(...At, ...Bt, ...Ab, ...Ab, ...Bt, ...Bb); // top
    }
  };
  // Split a polyline into runs, dropping points on other pavement.
  const edge = (pts: Pt[], keep: (p: Pt) => boolean, face: number) => {
    let cur: Pt[] = [];
    for (const p of pts) {
      if (keep(p)) cur.push(p);
      else {
        if (cur.length > 1) run(cur, face);
        cur = [];
      }
    }
    if (cur.length > 1) run(cur, face);
  };
  const ring = ringCentre();
  for (const side of [1, -1]) {
    const line = offsetLine(ring, side * RING.halfWidth, true);
    edge([...line, line[0]], ([x, z]) => junctionClear(x, z, 20, 13) && !onRoad(x, z, -1), side);
  }
  MAP.roads.forEach((r, ri) => {
    if (r.kind === "service") return;
    const dense = densify(r.pts, 1.5);
    for (const side of [1, -1]) {
      const line = offsetLine(dense, (side * r.width) / 2, false);
      edge(line, ([x, z]) => !onRoad(x, z, ri), side);
    }
  });
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  geo.computeVertexNormals();
  return geo;
}

export default function Ground() {
  const asphalt = usePbrTextures(ASPHALT);
  const walk = usePbrTextures(SIDEWALK);
  const { terrain, lines, curb } = useMemo(() => {
    const onRoad = roadIndex();
    return { terrain: terrainGeometry(), lines: markings(onRoad), curb: curbs(onRoad) };
  }, []);
  const material = useMemo(() => groundMaterial(asphalt, walk), [asphalt, walk]);
  const paint = useMemo(() => {
    const wear = paintWearTexture();
    return { white: paintMaterial("#e9e7e0", wear), yellow: paintMaterial("#e0ae2c", wear) };
  }, []);
  return (
    <>
      <mesh geometry={terrain} material={material} receiveShadow />
      <mesh geometry={lines.white} material={paint.white} receiveShadow />
      <mesh geometry={lines.yellow} material={paint.yellow} receiveShadow />
      <mesh geometry={curb} receiveShadow castShadow>
        <meshStandardMaterial color="#b9b5ad" roughness={0.85} side={2} />
      </mesh>
    </>
  );
}
