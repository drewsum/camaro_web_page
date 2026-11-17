// Builds src/scenes/capitol/capitolSquare.json, the map data behind the
// Capitol Square scene: streets, buildings, lawns, trees and signals from
// OpenStreetMap (© OpenStreetMap contributors, ODbL) and the ground's shape
// from the Terrarium elevation tiles on AWS Open Data (mostly USGS 3DEP).
//
//   node scripts/capitol-square.mjs
//
// Coordinates are metres in the scene's frame: x east, z south, y up, with the
// origin at the centre of the Capitol and y = 0 at BASE metres above sea level.

import { writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

const LAT0 = 43.07475;
const LON0 = -89.38415;
const BASE = 270;
const RADIUS = 420; // metres of city kept around the Capitol
const BBOX = [43.0705, -89.3900, 43.0790, -89.3780]; // s, w, n, e
const OUT = new URL("../src/scenes/capitol/capitolSquare.json", import.meta.url);

const MX = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const MY = 110540;
const local = (lat, lon) => [(lon - LON0) * MX, -(lat - LAT0) * MY];
const r1 = (v) => Math.round(v * 10) / 10;

// ---- Elevation ------------------------------------------------------------

// Minimal PNG decoder for 8-bit RGB/RGBA, non-interlaced (what Terrarium uses).
function decodePng(buf) {
  let pos = 8;
  let width = 0, height = 0, channels = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      channels = { 2: 3, 6: 4 }[data[9]];
      if (data[8] !== 8 || !channels || data[12] !== 0) throw new Error("unsupported PNG");
    } else if (type === "IDAT") idat.push(data);
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? out[y * stride + i - channels] : 0;
      const b = y > 0 ? out[(y - 1) * stride + i] : 0;
      const c = y > 0 && i >= channels ? out[(y - 1) * stride + i - channels] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + i] = v & 255;
    }
  }
  return { width, height, channels, data: out };
}

async function elevationSampler() {
  const z = 15;
  const n = 2 ** z;
  const tx = (lon) => ((lon + 180) / 360) * n;
  const ty = (lat) => ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n;
  const tiles = new Map();
  for (let x = Math.floor(tx(BBOX[1])); x <= Math.floor(tx(BBOX[3])); x++) {
    for (let y = Math.floor(ty(BBOX[2])); y <= Math.floor(ty(BBOX[0])); y++) {
      const res = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`);
      if (!res.ok) throw new Error(`elevation tile ${x},${y}: ${res.status}`);
      tiles.set(`${x},${y}`, decodePng(Buffer.from(await res.arrayBuffer())));
    }
  }
  const pixel = (px, py) => {
    const t = tiles.get(`${Math.floor(px / 256)},${Math.floor(py / 256)}`);
    const i = ((py % 256) * 256 + (px % 256)) * t.channels;
    return t.data[i] * 256 + t.data[i + 1] + t.data[i + 2] / 256 - 32768;
  };
  return (lat, lon) => {
    const px = tx(lon) * 256 - 0.5;
    const py = ty(lat) * 256 - 0.5;
    const x = Math.floor(px), y = Math.floor(py);
    const fx = px - x, fy = py - y;
    return (
      pixel(x, y) * (1 - fx) * (1 - fy) +
      pixel(x + 1, y) * fx * (1 - fy) +
      pixel(x, y + 1) * (1 - fx) * fy +
      pixel(x + 1, y + 1) * fx * fy
    );
  };
}

// Heights on a 10 m grid, gently blurred: the tiles are ~3.5 m pixels with
// some noise that would make the streets bumpy.
async function heightGrid() {
  const elev = await elevationSampler();
  const step = 10;
  const half = Math.ceil(RADIUS / step) + 2;
  const nx = 2 * half + 1;
  const raw = new Float64Array(nx * nx);
  for (let j = 0; j < nx; j++) {
    for (let i = 0; i < nx; i++) {
      const x = (i - half) * step, z = (j - half) * step;
      raw[j * nx + i] = elev(LAT0 - z / MY, LON0 + x / MX);
    }
  }
  const kernel = [0.25, 0.5, 0.25];
  const blur = (src, dx, dy) => {
    const out = new Float64Array(src.length);
    for (let j = 0; j < nx; j++) {
      for (let i = 0; i < nx; i++) {
        let v = 0;
        for (let k = -1; k <= 1; k++) {
          const ii = Math.min(nx - 1, Math.max(0, i + k * dx));
          const jj = Math.min(nx - 1, Math.max(0, j + k * dy));
          v += kernel[k + 1] * src[jj * nx + ii];
        }
        out[j * nx + i] = v;
      }
    }
    return out;
  };
  const h = blur(blur(raw, 1, 0), 0, 1);
  return { x0: -half * step, z0: -half * step, step, n: nx, h: Array.from(h, (v) => Math.round((v - BASE) * 100) / 100) };
}

// ---- OpenStreetMap ---------------------------------------------------------

async function overpass() {
  const b = BBOX.join(",");
  const query = `[out:json][timeout:90];(
    way["highway"](${b}); way["building"](${b}); relation["building"](${b});
    way["landuse"](${b}); way["leisure"](${b}); way["natural"](${b});
    node["natural"="tree"](${b});
  );(._;>;);out body;`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "User-Agent": "camaro-webpage scene builder" },
    body: new URLSearchParams({ data: query }),
  });
  if (!res.ok) throw new Error(`Overpass: ${res.status}`);
  return (await res.json()).elements;
}

// The one-way ring around the Capitol, counterclockwise from the east corner.
const RING_WAYS = [
  1547750696, 6636054, 6758194, 1547018098, 6692496, 700438283, 6728519, 6665625, 700376932, 453867865, 6693314,
  6671606, 700438284, 453867866, 1547750697,
];
const CAPITOL = 26720999;

const DRIVABLE = new Set(["primary", "secondary", "tertiary", "residential", "unclassified", "service", "living_street"]);
const GREEN = { grass: "lawn", village_green: "lawn", garden: "lawn", flowerbed: "bed", scrub: "bed", park: "park" };

function streetWidth(t) {
  if (t.width && !isNaN(parseFloat(t.width))) return parseFloat(t.width);
  if (t.highway === "service") return 5;
  const lanes = parseInt(t.lanes ?? (t.oneway === "yes" ? "1" : "2"), 10) || 2;
  const parking = ["parking:both", "parking:lane:both"].some((k) => t[k] && t[k] !== "no") ? 2 : 1;
  return lanes * 3.3 + parking * 2.3;
}

function buildingHeight(t) {
  const num = (v) => (v === undefined ? NaN : parseFloat(v));
  if (!isNaN(num(t.height))) return num(t.height);
  const levels = num(t["building:levels"]);
  if (!isNaN(levels)) return levels * 3.5 + 1.5 + (num(t["roof:levels"]) || 0) * 3;
  return { garage: 3, shed: 3, roof: 4, parking: 14, house: 8, apartments: 14, residential: 12 }[t.building] ?? 12;
}

async function main() {
  const [grid, els] = await Promise.all([heightGrid(), overpass()]);
  const nodes = new Map(els.filter((e) => e.type === "node").map((e) => [e.id, e]));
  const ways = new Map(els.filter((e) => e.type === "way").map((e) => [e.id, e]));
  const pts = (w) => w.nodes.filter((id) => nodes.has(id)).map((id) => local(nodes.get(id).lat, nodes.get(id).lon));
  const near = (p, r = RADIUS) => p.some(([x, z]) => Math.hypot(x, z) < r);
  const round = (p) => p.map(([x, z]) => [r1(x), r1(z)]);

  // Ring centreline, chained way by way.
  const ringNodes = [];
  for (const id of RING_WAYS) {
    const w = ways.get(id);
    if (!w) throw new Error(`ring way ${id} missing`);
    const ids = w.nodes;
    ringNodes.push(...(ringNodes.at(-1) === ids[0] ? ids.slice(1) : ids));
  }
  if (ringNodes.at(-1) === ringNodes[0]) ringNodes.pop();
  const ringSet = new Set(ringNodes);
  const ring = ringNodes.map((id) => local(nodes.get(id).lat, nodes.get(id).lon));

  // Other streets, and where they meet the ring.
  const roads = [];
  const joins = new Map();
  for (const w of ways.values()) {
    const t = w.tags ?? {};
    if (!DRIVABLE.has(t.highway) || RING_WAYS.includes(w.id) || t.area === "yes") continue;
    if (t.highway === "service" && (t.service === "parking_aisle" || t.service === "drive-through")) continue;
    const p = pts(w);
    if (p.length < 2 || !near(p)) continue;
    const lanes = parseInt(t.lanes ?? "", 10) || (t.oneway === "yes" ? 1 : 2);
    roads.push({ name: t.name ?? "", kind: t.highway, width: r1(streetWidth(t)), lanes, oneway: t.oneway === "yes", pts: round(p) });
    if (t.highway === "service") continue;
    for (const end of [0, w.nodes.length - 1]) {
      const id = w.nodes[end];
      if (!ringSet.has(id)) continue;
      const a = local(nodes.get(id).lat, nodes.get(id).lon);
      const bId = w.nodes[end === 0 ? 1 : w.nodes.length - 2];
      const b = local(nodes.get(bId).lat, nodes.get(bId).lon);
      const j = joins.get(id) ?? { at: [r1(a[0]), r1(a[1])], names: [], dirs: [] };
      j.names.push(t.name ?? "");
      j.dirs.push(Math.round(Math.atan2(b[0] - a[0], b[1] - a[1]) * 1000) / 1000); // heading away from the ring
      joins.set(id, j);
    }
  }

  // Buildings (outer rings of multipolygons included), apart from the Capitol.
  const buildings = [];
  const addBuilding = (p, t, id) => {
    if (p.length < 3 || !near(p)) return;
    let area = 0;
    for (let i = 0; i < p.length; i++) {
      const [x1, z1] = p[i], [x2, z2] = p[(i + 1) % p.length];
      area += x1 * z2 - x2 * z1;
    }
    if (Math.abs(area) / 2 < 12) return;
    const minH = parseFloat(t.min_height ?? "0") || 0;
    buildings.push({ id, kind: t.building ?? "yes", name: t.name, h: r1(buildingHeight(t)), ...(minH ? { min: minH } : {}), pts: round(p) });
  };
  for (const w of ways.values()) {
    const t = w.tags ?? {};
    if (!t.building || w.id === CAPITOL || t["building:part"] || t.building === "roof") continue;
    const p = pts(w);
    if (p.length > 3 && w.nodes[0] === w.nodes.at(-1)) p.pop();
    addBuilding(p, t, w.id);
  }
  for (const r of els.filter((e) => e.type === "relation" && e.tags?.building)) {
    for (const m of r.members.filter((m) => m.type === "way" && m.role === "outer")) {
      const w = ways.get(m.ref);
      if (!w) continue;
      const p = pts(w);
      if (w.nodes[0] === w.nodes.at(-1)) p.pop();
      addBuilding(p, r.tags, r.id);
    }
  }

  const capitolWay = ways.get(CAPITOL);
  const capitol = pts(capitolWay);
  capitol.pop();

  const green = [];
  for (const w of ways.values()) {
    const t = w.tags ?? {};
    const kind = GREEN[t.landuse] ?? GREEN[t.leisure] ?? GREEN[t.natural];
    if (!kind || w.nodes[0] !== w.nodes.at(-1)) continue;
    const p = pts(w);
    p.pop();
    if (p.length >= 3 && near(p)) green.push({ kind, pts: round(p) });
  }

  const trees = [];
  for (const n of nodes.values()) {
    if (n.tags?.natural !== "tree") continue;
    const [x, z] = local(n.lat, n.lon);
    if (Math.hypot(x, z) < RADIUS) trees.push([r1(x), r1(z), n.tags.leaf_type === "needleleaved" ? 1 : 0]);
  }

  const data = {
    source: "© OpenStreetMap contributors (ODbL); elevation: Terrarium tiles, AWS Open Data (USGS 3DEP)",
    origin: { lat: LAT0, lon: LON0, base: BASE },
    grid,
    ring: round(ring),
    joins: [...joins.values()],
    roads,
    capitol: round(capitol),
    buildings,
    green,
    trees,
  };
  writeFileSync(OUT, JSON.stringify(data));
  console.log(
    `ring ${ring.length} pts, ${roads.length} roads, ${joins.size} joins, ${buildings.length} buildings, ${green.length} green, ${trees.length} trees`,
  );
}

main();
