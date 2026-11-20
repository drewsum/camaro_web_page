import { CanvasTexture, SRGBColorSpace } from "three";
import { mulberry32 } from "../common/periodic";

// Tonight's feature at the drive-in, drawn frame by frame on a canvas: an
// original black-and-white B-movie, "The Atomic Armadillo". A countdown
// leader, the title card, a giant armadillo stomping through a city under
// sweeping searchlights, and "THE END?" — about a minute, on a loop, with
// grain, scratches, gate weave and flicker. `brightness` follows the picture
// so the light thrown on the cars can follow it too.

export const FILM_W = 1024;
export const FILM_H = 436; // 2.35:1, CinemaScope
const FPS = 24;
const LENGTH = 62; // seconds

const LEADER = 7;
const TITLE = 16;
const STOMP = 52;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

interface Building {
  x: number;
  w: number;
  h: number;
  windows: [number, number][];
}

function skyline(seed: number, count: number, minH: number, maxH: number): Building[] {
  const rand = mulberry32(seed);
  const out: Building[] = [];
  let x = -40;
  for (let i = 0; i < count && x < FILM_W * 2.2; i++) {
    const w = 40 + rand() * 70;
    const h = minH + rand() * (maxH - minH);
    const windows: [number, number][] = [];
    for (let wy = 14; wy < h - 10; wy += 16)
      for (let wx = 8; wx < w - 10; wx += 13) if (rand() < 0.3) windows.push([wx, wy]);
    out.push({ x, w, h, windows });
    x += w + rand() * 12;
  }
  return out;
}

const FAR = skyline(5, 60, 60, 170);
const NEAR = skyline(11, 50, 40, 120);

// The monster: a giant armadillo in silhouette, facing right, legs on a
// walk cycle `phase`. Origin between its feet.
function armadillo(g: CanvasRenderingContext2D, x: number, y: number, s: number, phase: number) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.fillStyle = "#0b0b0b";
  // Legs.
  [-60, -25, 30, 62].forEach((lx, i) => {
    const swing = Math.sin(phase + (i % 2) * Math.PI) * 10;
    const lift = Math.max(0, Math.sin(phase + (i % 2) * Math.PI)) * 8;
    g.beginPath();
    g.roundRect(lx - 12 + swing, -48 - lift, 24, 48, 8);
    g.fill();
  });
  const bob = Math.abs(Math.sin(phase)) * 4;
  g.translate(0, -bob);
  // Tail.
  g.beginPath();
  g.moveTo(-95, -60);
  g.quadraticCurveTo(-150, -40, -175, -8);
  g.quadraticCurveTo(-140, -50, -92, -40);
  g.fill();
  // Shell.
  g.beginPath();
  g.moveTo(-105, -40);
  g.bezierCurveTo(-110, -150, 100, -150, 100, -40);
  g.closePath();
  g.fill();
  // Bands catch a little light.
  g.strokeStyle = "#2a2a2a";
  g.lineWidth = 5;
  for (const bx of [-55, -18, 18, 52]) {
    g.beginPath();
    g.moveTo(bx - 6, -44);
    g.quadraticCurveTo(bx + 6, -100, bx - 2, -128);
    g.stroke();
  }
  // Head, ear and a glowing eye.
  g.fillStyle = "#0b0b0b";
  g.beginPath();
  g.moveTo(85, -90);
  g.quadraticCurveTo(150, -84, 172, -54);
  g.quadraticCurveTo(160, -36, 110, -38);
  g.quadraticCurveTo(84, -44, 80, -64);
  g.fill();
  g.beginPath();
  g.ellipse(98, -100, 11, 22, -0.4, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#f4f4f4";
  g.beginPath();
  g.arc(124, -66, 5, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function centred(g: CanvasRenderingContext2D, s: string, y: number, size: number, color: string, font = "'Arial Black', Impact, sans-serif") {
  g.font = `bold ${size}px ${font}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = color;
  g.fillText(s, FILM_W / 2, y);
}

export function makeFilm() {
  const canvas = document.createElement("canvas");
  canvas.width = FILM_W;
  canvas.height = FILM_H;
  const g = canvas.getContext("2d")!;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  // A vignette, drawn once and laid over every frame.
  const vignette = document.createElement("canvas");
  vignette.width = FILM_W;
  vignette.height = FILM_H;
  const v = vignette.getContext("2d")!;
  const grad = v.createRadialGradient(FILM_W / 2, FILM_H / 2, FILM_H * 0.35, FILM_W / 2, FILM_H / 2, FILM_W * 0.62);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.75)");
  v.fillStyle = grad;
  v.fillRect(0, 0, FILM_W, FILM_H);

  const film = { texture, brightness: 0.3, frame: -1 };

  function leader(t: number) {
    const n = 5 - Math.floor(t);
    if (n < 1) {
      g.fillStyle = "#000";
      g.fillRect(0, 0, FILM_W, FILM_H);
      return 0.02;
    }
    g.fillStyle = "#8a8a8a";
    g.fillRect(0, 0, FILM_W, FILM_H);
    const cx = FILM_W / 2;
    const cy = FILM_H / 2;
    // The sweep round the dial.
    g.fillStyle = "#5c5c5c";
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, 400, -Math.PI / 2, -Math.PI / 2 + (t % 1) * Math.PI * 2);
    g.fill();
    g.strokeStyle = "#1c1c1c";
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(0, cy);
    g.lineTo(FILM_W, cy);
    g.moveTo(cx, 0);
    g.lineTo(cx, FILM_H);
    g.stroke();
    for (const r of [150, 175]) {
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.stroke();
    }
    centred(g, String(n), cy + 8, 230, "#111", "Georgia, serif");
    return 0.55;
  }

  function title(t: number) {
    g.fillStyle = "#050505";
    g.fillRect(0, 0, FILM_W, FILM_H);
    const a = smooth(0, 1.5, t) * (1 - smooth(TITLE - LEADER - 1.2, TITLE - LEADER, t));
    g.globalAlpha = a;
    // Rays behind the title.
    g.save();
    g.translate(FILM_W / 2, FILM_H / 2);
    g.rotate(t * 0.08);
    g.fillStyle = "#1b1b1b";
    for (let i = 0; i < 16; i++) {
      g.rotate((Math.PI * 2) / 16);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(700, -60);
      g.lineTo(700, 60);
      g.fill();
    }
    g.restore();
    const grow = 1 + 0.04 * t;
    g.save();
    g.translate(FILM_W / 2, FILM_H / 2);
    g.scale(grow, grow);
    g.translate(-FILM_W / 2, -FILM_H / 2);
    centred(g, "THE ATOMIC", 128, 64, "#d8d8d8");
    centred(g, "ARMADILLO!", 222, 120, "#000");
    g.lineWidth = 6;
    g.strokeStyle = "#f2f2f2";
    g.strokeText("ARMADILLO!", FILM_W / 2, 222);
    centred(g, "IT CAME FROM THE MESA...", 318, 28, "#bdbdbd", "Georgia, serif");
    g.restore();
    g.globalAlpha = 1;
    return 0.22 * a;
  }

  function stomp(t: number) {
    const d = STOMP - TITLE;
    // A slow pan right while the beast stomps across the city.
    const pan = t * 22;
    const shake = Math.max(0, Math.sin(t * 5.2)) ** 8 * 5;
    g.save();
    g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    const sky = g.createLinearGradient(0, 0, 0, FILM_H);
    sky.addColorStop(0, "#1a1a1a");
    sky.addColorStop(1, "#4a4a4a");
    g.fillStyle = sky;
    g.fillRect(-10, -10, FILM_W + 20, FILM_H + 20);
    // Searchlights from the city, sweeping.
    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < 4; i++) {
      const bx = 140 + i * 250 - (pan * 0.6) % 250;
      const ang = Math.sin(t * 0.7 + i * 1.9) * 0.5;
      g.save();
      g.translate(bx, FILM_H - 60);
      g.rotate(ang);
      const beam = g.createLinearGradient(0, 0, 0, -460);
      beam.addColorStop(0, "rgba(200,200,200,0.35)");
      beam.addColorStop(1, "rgba(200,200,200,0)");
      g.fillStyle = beam;
      g.beginPath();
      g.moveTo(-6, 0);
      g.lineTo(-48, -460);
      g.lineTo(48, -460);
      g.lineTo(6, 0);
      g.fill();
      g.restore();
    }
    g.globalCompositeOperation = "source-over";
    // Far buildings, the monster wading among them, then the near row.
    const ground = FILM_H - 30;
    const row = (b: Building[], parallax: number, shade: string, lit: string) => {
      for (const s of b) {
        const x = s.x - pan * parallax;
        if (x > FILM_W || x + s.w < 0) continue;
        g.fillStyle = shade;
        g.fillRect(x, ground - s.h, s.w, s.h);
        g.fillStyle = lit;
        for (const [wx, wy] of s.windows) g.fillRect(x + wx, ground - s.h + wy, 5, 7);
      }
    };
    row(FAR, 0.5, "#2b2b2b", "#7a7a7a");
    const mx = 120 + (t / d) * 760;
    armadillo(g, mx, ground - 6, 1.55, t * 3.2);
    row(NEAR, 1, "#121212", "#9a9a9a");
    g.fillStyle = "#0a0a0a";
    g.fillRect(-10, ground, FILM_W + 20, 40);
    // Now and then something goes up in a flash.
    const boom = Math.max(0, Math.sin(t * 0.9 + 1)) ** 30;
    if (boom > 0.02) {
      g.fillStyle = `rgba(255,255,255,${0.7 * boom})`;
      g.fillRect(-10, -10, FILM_W + 20, FILM_H + 20);
    }
    g.restore();
    return 0.3 + 0.6 * boom;
  }

  function theEnd(t: number) {
    g.fillStyle = "#060606";
    g.fillRect(0, 0, FILM_W, FILM_H);
    const a = smooth(0.5, 2, t) * (1 - smooth(LENGTH - STOMP - 2, LENGTH - STOMP - 0.5, t));
    g.globalAlpha = a;
    centred(g, "THE END", 190, 96, "#e6e6e6", "Georgia, serif");
    // ...or is it? The question mark creeps in late.
    g.globalAlpha = a * smooth(3, 4.5, t);
    g.font = "bold 96px Georgia, serif";
    g.textAlign = "left";
    g.fillText("?", FILM_W / 2 + 200, 190);
    g.globalAlpha = 1;
    return 0.12 * a;
  }

  function update(time: number) {
    const frame = Math.floor(time * FPS);
    if (frame === film.frame) return;
    film.frame = frame;
    const t = time % LENGTH;
    let b: number;
    // Gate weave: the whole picture drifts a pixel or two.
    g.save();
    g.translate(Math.sin(time * 3.1) * 1.2, Math.sin(time * 2.3 + 1) * 1.5);
    if (t < LEADER) b = leader(t);
    else if (t < TITLE) b = title(t - LEADER);
    else if (t < STOMP) b = stomp(t - TITLE);
    else b = theEnd(t - STOMP);
    g.restore();
    // Grain, dust and the odd scratch running down the print.
    for (let i = 0; i < 260; i++) {
      const c = Math.random() < 0.5 ? 0 : 255;
      g.fillStyle = `rgba(${c},${c},${c},${0.08 + Math.random() * 0.12})`;
      g.fillRect(Math.random() * FILM_W, Math.random() * FILM_H, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    if (Math.random() < 0.06) {
      g.fillStyle = "rgba(0,0,0,0.6)";
      g.beginPath();
      g.arc(Math.random() * FILM_W, Math.random() * FILM_H, 2 + Math.random() * 5, 0, Math.PI * 2);
      g.fill();
    }
    const scratchX = (Math.sin(Math.floor(time / 3) * 91.7) * 0.5 + 0.5) * FILM_W;
    g.fillStyle = "rgba(230,230,230,0.25)";
    g.fillRect(scratchX + Math.sin(time * 40) * 2, 0, 1.5, FILM_H);
    // Flicker, then the vignette.
    const flicker = 0.06 * Math.random();
    g.fillStyle = `rgba(0,0,0,${flicker})`;
    g.fillRect(0, 0, FILM_W, FILM_H);
    g.drawImage(vignette, 0, 0);
    film.brightness = b * (1 - flicker);
    texture.needsUpdate = true;
  }

  return {
    texture,
    update,
    get brightness() {
      return film.brightness;
    },
  };
}
