import { CanvasTexture, NoColorSpace, RepeatWrapping, SRGBColorSpace } from "three";
import { mulberry32 } from "../common/periodic";

// Procedural textures for the Square. Facades come as colour, roughness and
// metalness maps from the same drawing, so the glass is smooth and reflects
// the sky while the masonry stays matte.

type Ctx = CanvasRenderingContext2D;

function canvas(w: number, h = w) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

function texture(c: HTMLCanvasElement, colour = true) {
  const t = new CanvasTexture(c);
  t.colorSpace = colour ? SRGBColorSpace : NoColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function speckle(g: Ctx, w: number, h: number, seed: number, count: number, spread: number, alpha = 0.35) {
  const rand = mulberry32(seed);
  for (let n = 0; n < count; n++) {
    const v = Math.floor(255 * (1 - spread / 2 + rand() * spread));
    g.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    g.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2);
  }
}

// ---- Ground ---------------------------------------------------------------

// The streets and sidewalks themselves are scanned Poly Haven textures (see
// Ground); these are the layers multiplied over them.

// City wear over ASPHALT_WEAR_TILE metres square at 64 px per metre, white
// where the scan shows through: tar-snake crack sealing wandering every
// which way, oil stains, and a few saw-cut utility patches.
export const ASPHALT_WEAR_TILE = 16;
export function asphaltWearTexture() {
  const PX = 64, S = ASPHALT_WEAR_TILE * PX;
  const [c, g] = canvas(S);
  g.fillStyle = "#fff";
  g.fillRect(0, 0, S, S);
  const rand = mulberry32(11);
  // Draw at all nine wrap offsets so the tile is seamless.
  const wrapped = (draw: (ox: number, oy: number) => void) => {
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) draw(ox, oy);
  };
  for (let n = 0; n < 3; n++) {
    const x = rand() * S, y = rand() * S, w = (1.2 + rand() * 2.5) * PX, h = (1 + rand() * 2) * PX;
    const tone = 205 + Math.floor(rand() * 25);
    wrapped((ox, oy) => {
      g.fillStyle = `rgb(${tone},${tone},${tone + 2})`;
      g.fillRect(x + ox, y + oy, w, h);
      g.strokeStyle = "rgba(40,40,42,0.85)";
      g.lineWidth = 0.05 * PX;
      g.strokeRect(x + ox, y + oy, w, h);
    });
  }
  for (let n = 0; n < 40; n++) {
    const x = rand() * S, y = rand() * S, rx = (0.08 + rand() * 0.35) * PX, ry = rx * (0.5 + rand() * 0.8), a = 0.12 + rand() * 0.22;
    wrapped((ox, oy) => {
      const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rx);
      grad.addColorStop(0, `rgba(30,28,26,${a})`);
      grad.addColorStop(1, "rgba(30,28,26,0)");
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(x + ox, y + oy, rx, ry, rand() * 3, 0, Math.PI * 2);
      g.fill();
    });
  }
  g.lineCap = g.lineJoin = "round";
  for (let n = 0; n < 9; n++) {
    let x = rand() * S, y = rand() * S, a = rand() * Math.PI * 2;
    const heading = a, pts: [number, number][] = [[x, y]];
    const steps = 20 + Math.floor(rand() * 60);
    for (let i = 0; i < steps; i++) {
      a += (rand() - 0.5) * 0.9;
      a += (heading - a) * 0.3;
      x += Math.cos(a) * 0.12 * PX;
      y += Math.sin(a) * 0.12 * PX;
      pts.push([x, y]);
    }
    const width = (0.025 + rand() * 0.03) * PX;
    wrapped((ox, oy) => {
      g.strokeStyle = "rgba(14,14,15,0.85)";
      g.lineWidth = width;
      g.beginPath();
      pts.forEach(([px, py], i) => (i ? g.lineTo(px + ox, py + oy) : g.moveTo(px + ox, py + oy)));
      g.stroke();
    });
  }
  return texture(c, false); // a plain multiplier, not a colour
}

// Poured concrete sidewalk, 1.5 m panels with tooled joints, three panels
// square: each panel a slightly different pour, the joints dark grooves.
export const PANEL = 1.5;
export function sidewalkJointsTexture() {
  const PX = 128, S = 3 * PANEL * PX;
  const [c, g] = canvas(S);
  const rand = mulberry32(22);
  const p = PANEL * PX;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const v = 228 + Math.floor(rand() * 27);
      g.fillStyle = `rgb(${v},${v},${v - 2})`;
      g.fillRect(i * p, j * p, p, p);
    }
  }
  for (let k = 0; k < 3; k++) {
    // Groove plus a little tooled margin either side.
    g.fillStyle = "rgba(150,146,140,0.5)";
    g.fillRect(k * p - 4, 0, 8, S);
    g.fillRect(0, k * p - 4, S, 8);
    g.fillStyle = "rgb(70,67,62)";
    g.fillRect(k * p - 1.5, 0, 3, S);
    g.fillRect(0, k * p - 1.5, S, 3);
  }
  // Edges wrap: draw the k = 0 lines at the far side too.
  g.fillStyle = "rgba(150,146,140,0.5)";
  g.fillRect(S - 4, 0, 4, S);
  g.fillRect(0, S - 4, S, 4);
  g.fillStyle = "rgb(70,67,62)";
  g.fillRect(S - 1.5, 0, 1.5, S);
  g.fillRect(0, S - 1.5, S, 1.5);
  return texture(c, false);
}

// Worn paint: alpha speckle over 2 m, for the street markings.
export function paintWearTexture() {
  const [c, g] = canvas(256);
  g.fillStyle = "#fff";
  g.fillRect(0, 0, 256, 256);
  const rand = mulberry32(23);
  for (let n = 0; n < 2600; n++) {
    const v = Math.floor(rand() * 160);
    g.fillStyle = `rgba(${v},${v},${v},${0.3 + rand() * 0.6})`;
    g.beginPath();
    g.arc(rand() * 256, rand() * 256, 0.4 + rand() * 1.6, 0, Math.PI * 2);
    g.fill();
  }
  return texture(c, false);
}

export function grassTexture() {
  const [c, g] = canvas(512);
  g.fillStyle = "#4f6b2f";
  g.fillRect(0, 0, 512, 512);
  const rand = mulberry32(31);
  for (let n = 0; n < 60000; n++) {
    const r = 55 + rand() * 50, gg = 85 + rand() * 60, b = 30 + rand() * 30;
    g.fillStyle = `rgba(${r | 0},${gg | 0},${b | 0},0.6)`;
    const x = rand() * 512, y = rand() * 512;
    g.fillRect(x, y, 1, 2 + rand() * 4);
  }
  for (let n = 0; n < 30; n++) {
    g.fillStyle = `rgba(${rand() < 0.5 ? "40,60,20" : "120,140,60"},0.08)`;
    g.beginPath();
    g.arc(rand() * 512, rand() * 512, 20 + rand() * 80, 0, Math.PI * 2);
    g.fill();
  }
  return texture(c);
}

// ---- Facades --------------------------------------------------------------

export interface FacadeStyle {
  wall: string;
  joint?: string; // brick mortar
  brick?: boolean;
  ashlar?: boolean; // stone or panel joints
  frame: string;
  glass: [string, string]; // top and bottom of the window's gradient
  windows: { x: number; y: number; w: number; h: number }[]; // fractions of one bay × one storey
  sill?: string;
  band?: string; // a horizontal band at the floor line
  lintel?: string; // a header over each window
  blinds?: string; // the usual blind colour behind the glass
}

// One bay (3.2 m) by one storey (3.5 m); each texture covers a block of
// FACADE_BAYS × FACADE_STOREYS of them at 64 px per metre so the windows
// differ (blinds, curtains, lights on) instead of repeating every bay.
export const BAY = 3.2;
export const STOREY = 3.5;
export const FACADE_BAYS = 3;
export const FACADE_STOREYS = 2;

export const FACADES: FacadeStyle[] = [
  // 0 Red brick with two punched windows per bay.
  { wall: "#8a4b3a", joint: "#b5a89a", brick: true, frame: "#e8e2d4", glass: ["#4c5a66", "#20262c"], sill: "#cfc6b4", lintel: "#c9bfae", windows: [{ x: 0.12, y: 0.22, w: 0.3, h: 0.52 }, { x: 0.58, y: 0.22, w: 0.3, h: 0.52 }] },
  // 1 Tan brick, one wide window.
  { wall: "#b59a74", joint: "#d8cdb9", brick: true, frame: "#3b3a37", glass: ["#5e6d78", "#232a31"], sill: "#d9d0bd", windows: [{ x: 0.15, y: 0.2, w: 0.7, h: 0.55 }] },
  // 2 Limestone with tall windows.
  { wall: "#cfc5ad", ashlar: true, frame: "#5b5248", glass: ["#53636e", "#1f252b"], band: "#bdb197", windows: [{ x: 0.22, y: 0.14, w: 0.56, h: 0.66 }] },
  // 3 Glass curtain wall.
  { wall: "#59636b", frame: "#3d4247", glass: ["#7d93a3", "#2c3a46"], blinds: "#9aa0a3", windows: [{ x: 0.02, y: 0.04, w: 0.46, h: 0.88 }, { x: 0.52, y: 0.04, w: 0.46, h: 0.88 }] },
  // 4 Dark brown brick.
  { wall: "#5c3b2e", joint: "#8f8578", brick: true, frame: "#d4cfc4", glass: ["#46535d", "#1c2126"], sill: "#a8a090", windows: [{ x: 0.18, y: 0.2, w: 0.64, h: 0.55 }] },
  // 5 White precast with ribbon windows.
  { wall: "#dcdad3", ashlar: true, frame: "#2e3135", glass: ["#61727e", "#26303a"], windows: [{ x: 0, y: 0.32, w: 1, h: 0.42 }] },
  // 6 Grey stone.
  { wall: "#8f8d88", ashlar: true, frame: "#2f2f2f", glass: ["#566670", "#1e2328"], band: "#7b7973", windows: [{ x: 0.2, y: 0.18, w: 0.25, h: 0.6 }, { x: 0.55, y: 0.18, w: 0.25, h: 0.6 }] },
  // 7 Cream terra cotta.
  { wall: "#e2d3b2", frame: "#6b5a44", glass: ["#4f5f69", "#1d2329"], band: "#d0bf9b", sill: "#c9b892", windows: [{ x: 0.16, y: 0.2, w: 0.68, h: 0.56 }] },
  // 8 Madison's Cream City brick, dark green trim.
  { wall: "#d6c495", joint: "#ece3cc", brick: true, frame: "#2f3a33", glass: ["#526170", "#1e252b"], sill: "#bfae86", lintel: "#b8a67c", windows: [{ x: 0.14, y: 0.2, w: 0.3, h: 0.56 }, { x: 0.56, y: 0.2, w: 0.3, h: 0.56 }] },
  // 9 Painted white brick, black frames.
  { wall: "#d5d3cc", joint: "#bab7af", brick: true, frame: "#1f1f20", glass: ["#56656f", "#1d2227"], sill: "#bdbab2", windows: [{ x: 0.1, y: 0.2, w: 0.22, h: 0.58 }, { x: 0.39, y: 0.2, w: 0.22, h: 0.58 }, { x: 0.68, y: 0.2, w: 0.22, h: 0.58 }] },
  // 10 Red sandstone, tall pairs.
  { wall: "#8e5a44", ashlar: true, frame: "#ddd5c3", glass: ["#4e5c66", "#1e2429"], band: "#784a37", lintel: "#7a4b38", windows: [{ x: 0.16, y: 0.16, w: 0.28, h: 0.64 }, { x: 0.56, y: 0.16, w: 0.28, h: 0.64 }] },
  // 11 Dark metal panels, a wide strip window.
  { wall: "#3e4246", ashlar: true, frame: "#1c1e20", glass: ["#6f8696", "#26323c"], blinds: "#8c9194", windows: [{ x: 0.04, y: 0.26, w: 0.92, h: 0.5 }] },
  // 12 Orange 1960s brick with ribbon windows.
  { wall: "#9c5a34", joint: "#cbb9a0", brick: true, frame: "#c8c3b8", glass: ["#5a6a75", "#222a31"], band: "#c9c1b0", windows: [{ x: 0, y: 0.3, w: 1, h: 0.38 }] },
  // 13 Beige stucco, white trim.
  { wall: "#c9b593", frame: "#efebe1", glass: ["#57666f", "#1f252a"], sill: "#e4ddcc", windows: [{ x: 0.2, y: 0.22, w: 0.6, h: 0.52 }] },
];

const PX = 64;

// Blinds, curtain and light colours a window might show.
const BLINDS = ["#e8e2d2", "#d9d2bf", "#cfc9bd", "#f0ece4", "#b8ad98"];
const CURTAINS = ["#7a3b33", "#3d4e6b", "#a08a5c", "#4f5e45", "#d8cfbf", "#6a4b5e"];

function drawFacade(style: FacadeStyle, seed: number) {
  const bw = BAY * PX, bh = STOREY * PX;
  const w = Math.round(FACADE_BAYS * bw), h = Math.round(FACADE_STOREYS * bh);
  const [cc, cg] = canvas(w, h);
  // Roughness in green, metalness in blue: one map serves both. Red is the
  // glow of the rooms lit after dark (see Buildings' night emission).
  const [rc, rg] = canvas(w, h);
  const rand = mulberry32(seed);
  const glow = mulberry32(seed + 500); // its own stream, so the daytime look is unchanged
  cg.fillStyle = style.wall;
  cg.fillRect(0, 0, w, h);
  rg.fillStyle = "rgb(0,225,0)";
  rg.fillRect(0, 0, w, h);
  if (style.brick) {
    // Running bond, ~ 0.2 m × 0.07 m bricks, each one a little different.
    const course = 4.5, brick = 13;
    const rows = Math.ceil(h / course), cols = Math.ceil(w / brick) + 1;
    for (let row = 0; row < rows; row++) {
      for (let k = 0; k < cols; k++) {
        const r = rand();
        if (r > 0.45) continue;
        const dark = r < 0.25;
        cg.fillStyle = `rgba(${dark ? "20,10,5" : "255,240,220"},${0.03 + rand() * (dark ? 0.12 : 0.07)})`;
        cg.fillRect(k * brick - (row % 2) * 6.5, row * course, brick - 1, course - 1);
      }
    }
    cg.fillStyle = style.joint!;
    cg.globalAlpha = 0.55;
    for (let y = 0, row = 0; y < h; y += course, row++) {
      cg.fillRect(0, y, w, 1);
      for (let x = (row % 2) * 6.5; x < w; x += brick) cg.fillRect(x, y, 1, course);
    }
    cg.globalAlpha = 1;
  } else {
    speckle(cg, w, h, seed, 1500 * FACADE_BAYS * FACADE_STOREYS, 0.3, 0.15);
    // Broad blotches of weathering so the plain walls aren't flat.
    for (let n = 0; n < 18; n++) {
      const x = rand() * w, y = rand() * h, r = (0.6 + rand() * 1.6) * PX;
      const grad = cg.createRadialGradient(x, y, 0, x, y, r);
      const c = rand() < 0.6 ? "40,36,30" : "255,250,240";
      grad.addColorStop(0, `rgba(${c},${0.05 + rand() * 0.06})`);
      grad.addColorStop(1, `rgba(${c},0)`);
      cg.fillStyle = grad;
      cg.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
  }
  if (style.ashlar) {
    // Stone courses at 0.875 m (four to a storey), joints offset by half a block.
    cg.fillStyle = "rgba(0,0,0,0.16)";
    const cH = bh / 4, bW = bw / 2;
    for (let j = 0; j < 4 * FACADE_STOREYS; j++) {
      cg.fillRect(0, j * cH, w, 1.5);
      for (let x = (j % 2) * bW * 0.5; x < w; x += bW) cg.fillRect(x, j * cH, 1.5, cH);
    }
  }
  for (let s = 0; s < FACADE_STOREYS; s++) {
    // Canvas y runs down, texture v up: storey 0 sits at the bottom.
    const oy = h - (s + 1) * bh;
    if (style.band) {
      cg.fillStyle = style.band;
      cg.fillRect(0, oy + bh - 10, w, 10);
    }
    for (let b = 0; b < FACADE_BAYS; b++) {
      const ox = b * bw;
      for (const win of style.windows) drawWindow(cg, rg, style, rand, glow, ox + win.x * bw, oy + win.y * bh, win.w * bw, win.h * bh);
    }
  }
  const map = texture(cc), rm = texture(rc, false);
  return { map, roughnessMap: rm, metalnessMap: rm };
}

function drawWindow(cg: Ctx, rg: Ctx, style: FacadeStyle, rand: () => number, glow: () => number, x: number, y: number, ww: number, hh: number) {
  if (style.lintel) {
    cg.fillStyle = style.lintel;
    cg.fillRect(x - 6, y - 10, ww + 12, 7);
  }
  cg.fillStyle = style.frame;
  cg.fillRect(x - 3, y - 3, ww + 6, hh + 6);
  // Each pane catches the sky a little differently.
  const grad = cg.createLinearGradient(0, y - hh * rand() * 0.4, 0, y + hh * (1 + rand() * 0.4));
  grad.addColorStop(0, style.glass[0]);
  grad.addColorStop(1, style.glass[1]);
  cg.fillStyle = grad;
  cg.fillRect(x, y, ww, hh);
  rg.fillStyle = "rgb(0,18,150)";
  rg.fillRect(x, y, ww, hh);
  const r = rand();
  if (r < 0.1) {
    // Lights on: a warm interior behind the glass.
    const lit = cg.createLinearGradient(0, y, 0, y + hh);
    lit.addColorStop(0, "rgba(255,226,170,0.55)");
    lit.addColorStop(1, "rgba(200,150,90,0.3)");
    cg.fillStyle = lit;
    cg.fillRect(x, y, ww, hh);
  } else if (r < 0.22) {
    // Curtains drawn part way from each side.
    cg.fillStyle = CURTAINS[Math.floor(rand() * CURTAINS.length)];
    const cw = ww * (0.15 + rand() * 0.3);
    cg.globalAlpha = 0.85;
    cg.fillRect(x, y, cw, hh);
    cg.fillRect(x + ww - cw, y, cw, hh);
    cg.globalAlpha = 1;
  } else if (r < 0.3) {
    // Empty and dark.
    cg.fillStyle = "rgba(5,7,9,0.45)";
    cg.fillRect(x, y, ww, hh);
  }
  // Blinds pulled down to all sorts of heights.
  if (r >= 0.1 && rand() < 0.6) {
    const drop = hh * (0.1 + rand() * 0.75);
    cg.fillStyle = style.blinds ?? BLINDS[Math.floor(rand() * BLINDS.length)];
    cg.globalAlpha = 0.75;
    cg.fillRect(x, y, ww, drop);
    cg.globalAlpha = 0.25;
    cg.fillStyle = "#000";
    for (let k = 3; k < drop; k += 4) cg.fillRect(x, y + k, ww, 1);
    cg.globalAlpha = 1;
    cg.fillRect(x, y + drop - 2, ww, 2);
    // Glass is still in front, so only a little rougher.
    rg.fillStyle = "rgb(0,60,110)";
    rg.fillRect(x, y, ww, drop);
  }
  // Mullions every ~1.1 m and a transom.
  cg.fillStyle = style.frame;
  const panes = Math.max(1, Math.round(ww / (1.1 * PX)));
  for (let k = 1; k < panes; k++) cg.fillRect(x + (k * ww) / panes - 1.5, y, 3, hh);
  if (hh > 1.6 * PX) cg.fillRect(x, y + hh * 0.28, ww, 3);
  rg.fillStyle = "rgb(0,225,0)";
  for (let k = 1; k < panes; k++) rg.fillRect(x + (k * ww) / panes - 1.5, y, 3, hh);
  if (style.sill) {
    cg.fillStyle = style.sill;
    cg.fillRect(x - 5, y + hh + 3, ww + 10, 5);
    // Rain streaks running down from the sill.
    for (let n = 0; n < 3; n++) {
      const sx = x + rand() * ww, len = (0.3 + rand() * 1.1) * PX;
      const streak = cg.createLinearGradient(0, y + hh + 8, 0, y + hh + 8 + len);
      streak.addColorStop(0, "rgba(30,26,22,0.18)");
      streak.addColorStop(1, "rgba(30,26,22,0)");
      cg.fillStyle = streak;
      cg.fillRect(sx, y + hh + 8, 3 + rand() * 6, len);
    }
  }
  // After dark about a third of the rooms are lit, some brighter than others
  // (the ones lit by day always).
  if (r < 0.1 || glow() < 0.3) {
    rg.globalCompositeOperation = "lighter";
    rg.fillStyle = `rgb(${80 + Math.floor(glow() * 150)},0,0)`;
    rg.fillRect(x, y, ww, hh);
    rg.globalCompositeOperation = "source-over";
  }
}

export function facadeTextures() {
  return FACADES.map((s, i) => drawFacade(s, 100 + i));
}

// Street-level shopfronts, one 6 m × 4.5 m unit: a sign band, big glass over
// a bulkhead, a door. Each variant picks its own frame, sign, bulkhead and
// window dressing, and some get a striped awning.
export const SHOP_W = 6;
export const SHOP_H = 4.5;
const SHOP_FRAMES = ["#1b1b1b", "#3a3633", "#8c8a85", "#2d4a3a", "#5a3a26", "#e6e1d6", "#6e2a2a", "#23324a"];
const SHOP_SIGNS = ["#1f3b57", "#5a1f24", "#20402e", "#2b2b2b", "#6b4a1f", "#d8cfb8", "#8a2f1f", "#3c2f52", "#b58a2e", "#0f5c5c"];
const AWNINGS: [string, string][] = [["#7a1f1f", "#e8e0cc"], ["#1f4a2e", "#e8e0cc"], ["#23324a", "#d8d2c0"], ["#2b2b2b", "#2b2b2b"], ["#a0522d", "#f0e6cc"], ["#5a1f4a", "#5a1f4a"]];
export function storefrontTextures(seed: number) {
  const w = SHOP_W * PX, h = SHOP_H * PX;
  const [cc, cg] = canvas(w, h);
  const [rc, rg] = canvas(w, h);
  const rand = mulberry32(seed);
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  const frame = pick(SHOP_FRAMES), sign = pick(SHOP_SIGNS);
  cg.fillStyle = frame;
  cg.fillRect(0, 0, w, h);
  speckle(cg, w, h, seed, 3000, 0.3, 0.12);
  rg.fillStyle = "rgb(0,200,0)";
  rg.fillRect(0, 0, w, h);
  const signTop = h * 0.06, signH = h * (0.12 + rand() * 0.06);
  cg.fillStyle = sign;
  cg.fillRect(w * 0.04, signTop, w * 0.92, signH);
  // Lettering: a light or dark word or two, left, centred or right.
  const light = !/^#[c-f]/i.test(sign);
  cg.fillStyle = light ? "rgba(240,232,210,0.9)" : "rgba(30,28,26,0.85)";
  const letters = 4 + Math.floor(rand() * 8), lw = w * 0.05, gap = w * 0.018;
  const span = letters * (lw + gap), lx = w * (0.08 + rand() * (0.84 - span / w));
  for (let k = 0; k < letters; k++) if (rand() > 0.12) cg.fillRect(lx + k * (lw + gap), signTop + signH * 0.3, lw, signH * 0.4);
  const awning = rand() < 0.45 ? pick(AWNINGS) : null;
  const gx = w * 0.04, gy = signTop + signH + 10, gw = w * 0.92;
  // Bulkhead under the glass: panelled, tiled or brick.
  const bulk = h * (0.1 + rand() * 0.08), gh = h - gy - bulk - 6;
  const by = gy + gh + 3, kind = rand();
  cg.fillStyle = kind < 0.33 ? frame : kind < 0.66 ? "#5e2f25" : "#2a2c2e";
  cg.fillRect(gx, by, gw, bulk);
  cg.fillStyle = cg.strokeStyle = "rgba(0,0,0,0.25)";
  if (kind < 0.33) for (let k = 0; k < 6; k++) cg.strokeRect(gx + (k * gw) / 6 + 6, by + 6, gw / 6 - 12, bulk - 12);
  else if (kind < 0.66) for (let y = by; y < by + bulk; y += 4.5) cg.fillRect(gx, y, gw, 1);
  else for (let x = gx; x < gx + gw; x += 10) cg.fillRect(x, by, 1, bulk);
  const grad = cg.createLinearGradient(0, gy, 0, gy + gh);
  const sky = rand() * 0.3;
  grad.addColorStop(0, `rgb(${98 + sky * 80 | 0},${113 + sky * 70 | 0},${123 + sky * 60 | 0})`);
  grad.addColorStop(0.5, "#30383f");
  grad.addColorStop(1, "#1d2124");
  cg.fillStyle = grad;
  cg.fillRect(gx, gy, gw, gh);
  // A lit interior with shelves, racks or tables, in a warm or cool light.
  const warmLight = rand() < 0.7;
  const glow = cg.createLinearGradient(0, gy, 0, gy + gh);
  glow.addColorStop(0, warmLight ? "rgba(255,220,160,0.2)" : "rgba(200,225,255,0.2)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  cg.fillStyle = glow;
  cg.fillRect(gx, gy, gw, gh);
  for (let n = 0; n < 14 + rand() * 14; n++) {
    const hue = rand();
    cg.fillStyle = `rgba(${150 + hue * 100 | 0},${110 + rand() * 100 | 0},${80 + (1 - hue) * 120 | 0},${0.1 + rand() * 0.15})`;
    cg.fillRect(gx + rand() * gw, gy + gh * 0.35 + rand() * gh * 0.55, 12 + rand() * 50, 8 + rand() * 30);
  }
  // Mullions.
  cg.fillStyle = frame;
  const panes = 2 + Math.floor(rand() * 3);
  for (let k = 1; k < panes; k++) cg.fillRect(gx + (gw * k) / panes - 3, gy, 6, gh);
  if (rand() < 0.5) cg.fillRect(gx, gy + gh * 0.22, gw, 5);
  const door = rand() < 0.5 ? 0.04 : 0.74;
  cg.fillStyle = frame;
  cg.fillRect(gx + gw * door - 4, gy + gh * 0.02, gw * 0.22 + 8, gh + bulk);
  cg.fillStyle = "#1a1d20";
  cg.fillRect(gx + gw * door + 6, gy + gh * 0.08, gw * 0.22 - 12, gh + bulk - gh * 0.1);
  rg.fillStyle = "rgb(0,15,140)";
  rg.fillRect(gx, gy, gw, gh);
  // Shops stay lit after dark: the window and the sign (red = night glow).
  rg.globalCompositeOperation = "lighter";
  rg.fillStyle = "rgb(115,0,0)";
  rg.fillRect(gx, gy, gw, gh);
  rg.fillStyle = "rgb(90,0,0)";
  rg.fillRect(w * 0.04, signTop, w * 0.92, signH);
  rg.globalCompositeOperation = "source-over";
  if (awning) {
    // Seen flat on the wall: the awning's sloped face, then its valance.
    const ay = gy - 4, ah = gh * 0.22, stripe = w / 24;
    for (let k = 0; k < 24; k++) {
      cg.fillStyle = awning[k % 2];
      cg.fillRect(k * stripe, ay, stripe + 0.5, ah);
    }
    const shade = cg.createLinearGradient(0, ay, 0, ay + ah);
    shade.addColorStop(0, "rgba(255,255,255,0.12)");
    shade.addColorStop(1, "rgba(0,0,0,0.25)");
    cg.fillStyle = shade;
    cg.fillRect(0, ay, w, ah);
    cg.fillStyle = "rgba(0,0,0,0.35)";
    cg.fillRect(0, ay + ah, w, 8);
    rg.fillStyle = "rgb(0,235,0)";
    rg.fillRect(0, ay, w, ah);
  }
  cg.fillStyle = "#9b958a";
  cg.fillRect(0, h - 6, w, 6);
  const rm = texture(rc, false);
  return { map: texture(cc), roughnessMap: rm, metalnessMap: rm };
}

// Concrete parking-ramp floors with open sides: 3 m deck to deck.
export function garageTextures() {
  const w = 4 * PX, h = 3 * PX;
  const [cc, cg] = canvas(w, h);
  cg.fillStyle = "#26282a";
  cg.fillRect(0, 0, w, h);
  cg.fillStyle = "#b2aea6";
  cg.fillRect(0, h * 0.62, w, h * 0.38);
  cg.fillRect(0, 0, w * 0.08, h);
  speckle(cg, w, h, 51, 1500, 0.3, 0.2);
  return { map: texture(cc) };
}

export function roofTexture() {
  const [c, g] = canvas(256);
  g.fillStyle = "#6b6a66";
  g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 61, 9000, 0.5, 0.4);
  return texture(c);
}

// ---- The Capitol ----------------------------------------------------------

// White Bethel granite: one 5.5 m bay by one 6 m storey, coursed blocks and a
// tall round-headed window.
export const CAPITOL_BAY = 5.5;
export const CAPITOL_STOREY = 6;
export function graniteTextures(arched = true) {
  const w = Math.round(CAPITOL_BAY * PX), h = Math.round(CAPITOL_STOREY * PX);
  const [cc, cg] = canvas(w, h);
  const [rc, rg] = canvas(w, h);
  const [mc, mg] = canvas(w, h);
  cg.fillStyle = "#e4e0d6";
  cg.fillRect(0, 0, w, h);
  speckle(cg, w, h, 71, 9000, 0.22, 0.25);
  cg.fillStyle = "rgba(120,112,100,0.35)";
  for (let y = 0, row = 0; y < h; y += 38, row++) {
    cg.fillRect(0, y, w, 1.5);
    for (let x = (row % 2) * 60; x < w; x += 120) cg.fillRect(x, y, 1.5, 38);
  }
  rg.fillStyle = "rgb(200,200,200)";
  rg.fillRect(0, 0, w, h);
  mg.fillStyle = "#000";
  mg.fillRect(0, 0, w, h);
  if (arched) {
    const ww = 1.7 * PX, wx = (w - ww) / 2, wy = h * 0.2, wh = h * 0.6;
    const path = (g: Ctx, inset: number) => {
      g.beginPath();
      g.moveTo(wx + inset, wy + wh);
      g.lineTo(wx + inset, wy + ww / 2);
      g.arc(wx + ww / 2, wy + ww / 2, ww / 2 - inset, Math.PI, 0);
      g.lineTo(wx + ww - inset, wy + wh);
      g.closePath();
    };
    cg.fillStyle = "#cfc9bb";
    path(cg, -6);
    cg.fill();
    const grad = cg.createLinearGradient(0, wy, 0, wy + wh);
    grad.addColorStop(0, "#56636c");
    grad.addColorStop(1, "#1f2428");
    cg.fillStyle = grad;
    path(cg, 0);
    cg.fill();
    // The opening is set ~0.3 m into the wall: shade the reveal along the
    // top and the left jamb (the sun's side lit, the far side in shadow).
    cg.save();
    path(cg, 0);
    cg.clip();
    cg.fillStyle = "rgba(10,12,14,0.55)";
    cg.fillRect(wx, wy, 10, wh);
    cg.fillRect(wx, wy, ww, ww * 0.18);
    cg.restore();
    cg.fillStyle = "#e8e4da";
    cg.fillRect(wx + ww / 2 - 2, wy + 6, 4, wh - 6);
    cg.fillRect(wx, wy + wh * 0.45, ww, 4);
    // Voussoir joints around the arch, and a projecting keystone.
    cg.strokeStyle = "rgba(120,112,100,0.6)";
    cg.lineWidth = 1.5;
    for (let k = 1; k < 9; k++) {
      const a = Math.PI + (k / 9) * Math.PI;
      const cx = wx + ww / 2, cy = wy + ww / 2;
      cg.beginPath();
      cg.moveTo(cx + Math.cos(a) * (ww / 2 + 1), cy + Math.sin(a) * (ww / 2 + 1));
      cg.lineTo(cx + Math.cos(a) * (ww / 2 + 16), cy + Math.sin(a) * (ww / 2 + 16));
      cg.stroke();
    }
    cg.fillStyle = "#efebe2";
    cg.beginPath();
    cg.moveTo(wx + ww / 2 - 9, wy - 1);
    cg.lineTo(wx + ww / 2 + 9, wy - 1);
    cg.lineTo(wx + ww / 2 + 12, wy - 22);
    cg.lineTo(wx + ww / 2 - 12, wy - 22);
    cg.closePath();
    cg.fill();
    cg.fillStyle = "rgba(90,84,76,0.5)";
    cg.fillRect(wx + ww / 2 + 9, wy - 22, 3, 21);
    // Sill on two small brackets, with its shadow.
    cg.fillStyle = "#ebe7dd";
    cg.fillRect(wx - 10, wy + wh + 2, ww + 20, 8);
    cg.fillStyle = "rgba(60,56,50,0.35)";
    cg.fillRect(wx - 8, wy + wh + 10, ww + 16, 4);
    cg.fillStyle = "#ddd8cc";
    cg.fillRect(wx + 4, wy + wh + 10, 8, 10);
    cg.fillRect(wx + ww - 12, wy + wh + 10, 8, 10);
    rg.fillStyle = "rgb(20,20,20)";
    path(rg, 0);
    rg.fill();
    mg.fillStyle = "rgb(140,140,140)";
    path(mg, 0);
    mg.fill();
  }
  return { map: texture(cc), roughnessMap: texture(rc, false), metalnessMap: texture(mc, false) };
}

// The ground storey: channelled (rusticated) granite, one bay by one storey,
// with a square-headed window under a flat arch of radiating voussoirs.
export function rusticatedTextures() {
  const w = Math.round(CAPITOL_BAY * PX), h = Math.round(CAPITOL_STOREY * PX);
  const [cc, cg] = canvas(w, h);
  const [rc, rg] = canvas(w, h);
  const [mc, mg] = canvas(w, h);
  cg.fillStyle = "#dcd7cb";
  cg.fillRect(0, 0, w, h);
  speckle(cg, w, h, 73, 9000, 0.24, 0.25);
  // Deep horizontal channels every 0.6 m: a dark groove over a lit lip.
  for (let y = 0; y < h; y += 0.6 * PX) {
    cg.fillStyle = "rgba(70,64,56,0.6)";
    cg.fillRect(0, y, w, 4);
    cg.fillStyle = "rgba(255,253,246,0.4)";
    cg.fillRect(0, y + 4, w, 2);
  }
  rg.fillStyle = "rgb(205,205,205)";
  rg.fillRect(0, 0, w, h);
  mg.fillStyle = "#000";
  mg.fillRect(0, 0, w, h);
  const ww = 1.6 * PX, wh = 2.5 * PX, wx = (w - ww) / 2, wy = h * 0.3;
  // Flat arch: a fan of voussoirs over the opening.
  const ax = w / 2, ay = wy + 2.2 * PX;
  cg.fillStyle = "#e6e1d6";
  cg.beginPath();
  cg.moveTo(wx - 14, wy);
  cg.lineTo(wx + ww + 14, wy);
  cg.lineTo(wx + ww + 26, wy - 0.75 * PX);
  cg.lineTo(wx - 26, wy - 0.75 * PX);
  cg.closePath();
  cg.fill();
  cg.strokeStyle = "rgba(90,84,76,0.6)";
  cg.lineWidth = 1.5;
  for (let k = -4; k <= 4; k++) {
    const x = wx + ww / 2 + (k * (ww + 28)) / 9;
    const t = (wy - 0.75 * PX - ay) / (wy - ay);
    cg.beginPath();
    cg.moveTo(x, wy);
    cg.lineTo(ax + (x - ax) * t, wy - 0.75 * PX);
    cg.stroke();
  }
  const grad = cg.createLinearGradient(0, wy, 0, wy + wh);
  grad.addColorStop(0, "#4b5861");
  grad.addColorStop(1, "#1d2226");
  cg.fillStyle = grad;
  cg.fillRect(wx, wy, ww, wh);
  cg.fillStyle = "rgba(10,12,14,0.55)";
  cg.fillRect(wx, wy, 10, wh);
  cg.fillRect(wx, wy, ww, 10);
  cg.fillStyle = "#e3dfd5";
  cg.fillRect(wx + ww / 2 - 2, wy, 4, wh);
  cg.fillRect(wx, wy + wh * 0.4, ww, 4);
  cg.fillStyle = "#ebe7dd";
  cg.fillRect(wx - 8, wy + wh, ww + 16, 8);
  rg.fillStyle = "rgb(20,20,20)";
  rg.fillRect(wx, wy, ww, wh);
  mg.fillStyle = "rgb(140,140,140)";
  mg.fillRect(wx, wy, ww, wh);
  return { map: texture(cc), roughnessMap: texture(rc, false), metalnessMap: texture(mc, false) };
}

// The dome's skin, wrapped once around (u) and from base to crown (v):
// coursed granite, each of the 16 bays between the (modelled) ribs a little
// shaded toward its edges so it reads as a sunk panel.
export const DOME_RIBS = 16;
export function domeTexture() {
  const [c, g] = canvas(1024, 512);
  g.fillStyle = "#e6e2d8";
  g.fillRect(0, 0, 1024, 512);
  speckle(g, 1024, 512, 81, 12000, 0.2, 0.25);
  g.fillStyle = "rgba(120,112,100,0.28)";
  for (let y = 0; y < 512; y += 24) g.fillRect(0, y, 1024, 1.5);
  const bay = 1024 / DOME_RIBS;
  for (let k = 0; k < DOME_RIBS; k++) {
    const x = k * bay;
    const grad = g.createLinearGradient(x, 0, x + bay, 0);
    grad.addColorStop(0, "rgba(80,74,66,0.22)");
    grad.addColorStop(0.15, "rgba(80,74,66,0)");
    grad.addColorStop(0.85, "rgba(80,74,66,0)");
    grad.addColorStop(1, "rgba(80,74,66,0.22)");
    g.fillStyle = grad;
    g.fillRect(x, 0, bay, 512);
  }
  return texture(c);
}

// ---- Trees ----------------------------------------------------------------

// A cluster of leaves on transparency, for the canopy cards.
export function leafTexture(seed: number, hues: [number, number]) {
  const [c, g] = canvas(256);
  g.clearRect(0, 0, 256, 256);
  const rand = mulberry32(seed);
  for (let n = 0; n < 420; n++) {
    const x = 128 + (rand() - 0.5) * 220 * Math.sqrt(rand());
    const y = 128 + (rand() - 0.5) * 220 * Math.sqrt(rand());
    const a = rand() * Math.PI;
    const len = 9 + rand() * 9;
    const hue = hues[0] + rand() * (hues[1] - hues[0]);
    const light = 22 + rand() * 22;
    g.fillStyle = `hsl(${hue},${45 + rand() * 25}%,${light}%)`;
    g.beginPath();
    g.ellipse(x, y, len, len * 0.45, a, 0, Math.PI * 2);
    g.fill();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function barkTexture() {
  const [c, g] = canvas(128);
  g.fillStyle = "#4a3f35";
  g.fillRect(0, 0, 128, 128);
  const rand = mulberry32(91);
  for (let n = 0; n < 160; n++) {
    g.fillStyle = `rgba(${rand() < 0.5 ? "25,20,16" : "110,98,84"},0.5)`;
    g.fillRect(rand() * 128, rand() * 128, 1 + rand() * 2, 8 + rand() * 30);
  }
  return texture(c);
}

