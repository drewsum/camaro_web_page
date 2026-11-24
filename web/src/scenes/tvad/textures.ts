import { CanvasTexture, NoColorSpace, RepeatWrapping, SRGBColorSpace } from "three";
import { mulberry32 } from "../common/periodic";

// Canvas-drawn textures for the TV commercial scene: the living room around
// the set, the dealership in the commercial, and the commercial's captions.

const SCRIPT = '"Brush Script MT", "Segoe Script", "Lucida Handwriting", cursive';
const BLOCK = '"Futura", "Century Gothic", "Trebuchet MS", "Arial Black", sans-serif';

export const DEALER = "Hometown Motors"; // fictional

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d")! };
}

function texture(c: HTMLCanvasElement, repeat?: [number, number]) {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

// ---- The living room -------------------------------------------------------

// Walnut veneer: long wavy grain lines over a warm brown.
export function walnutTexture() {
  const { c, g } = canvas(1024, 512);
  const rand = mulberry32(7);
  g.fillStyle = "#4a2a16";
  g.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 260; i++) {
    const y0 = rand() * 560 - 24;
    const amp = 4 + rand() * 14;
    const freq = 0.004 + rand() * 0.006;
    const phase = rand() * 6.28;
    const light = rand() < 0.5;
    g.strokeStyle = light ? `rgba(150, 96, 58, ${0.08 + rand() * 0.2})` : `rgba(28, 14, 6, ${0.1 + rand() * 0.25})`;
    g.lineWidth = 0.6 + rand() * 2.4;
    g.beginPath();
    for (let x = 0; x <= 1024; x += 8) {
      const y = y0 + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 3.1 + phase * 2) * amp * 0.25;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  return texture(c);
}

// Mid-century wallpaper: starbursts and boomerangs on cream. Tiles.
export function wallpaperTexture() {
  const { c, g } = canvas(512, 512);
  g.fillStyle = "#e6d6b4";
  g.fillRect(0, 0, 512, 512);
  const rand = mulberry32(19);
  const star = (x: number, y: number, r: number, color: string) => {
    g.strokeStyle = color;
    g.lineWidth = 2.2;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const len = i % 2 ? r * 0.55 : r;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.stroke();
      g.beginPath();
      g.arc(x + Math.cos(a) * len, y + Math.sin(a) * len, 2.4, 0, Math.PI * 2);
      g.fillStyle = color;
      g.fill();
    }
  };
  const boomerang = (x: number, y: number, s: number, rot: number, color: string) => {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.scale(s, s);
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(-30, 10);
    g.quadraticCurveTo(0, -30, 30, 10);
    g.quadraticCurveTo(0, -8, -30, 10);
    g.fill();
    g.restore();
  };
  // Placed so the tile wraps: everything near an edge is drawn again across it.
  const items: [number, number][] = [];
  for (let i = 0; i < 7; i++) items.push([rand() * 512, rand() * 512]);
  for (const [x, y] of items) {
    for (const dx of [-512, 0, 512])
      for (const dy of [-512, 0, 512]) {
        star(x + dx, y + dy, 26, "#2f7f7a");
        boomerang(x + dx + 90, y + dy + 60, 1, (x / 512) * 3, "#d9772b");
        boomerang(x + dx - 60, y + dy + 120, 0.8, (y / 512) * 3, "#9a3b2c");
      }
  }
  return texture(c, [18, 10]);
}

// Gold speaker cloth with vertical slats.
export function grilleTexture() {
  const { c, g } = canvas(256, 256);
  g.fillStyle = "#8f7442";
  g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 3) {
    g.fillStyle = y % 6 ? "rgba(255,240,200,0.08)" : "rgba(0,0,0,0.12)";
    g.fillRect(0, y, 256, 1);
  }
  for (let x = 6; x < 256; x += 18) {
    g.fillStyle = "#c9b27a";
    g.fillRect(x, 0, 6, 256);
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.fillRect(x + 6, 0, 2, 256);
  }
  return texture(c);
}

// The channel dial: 2 to 13 around the knob, as on VHF sets.
export function dialTexture() {
  const { c, g } = canvas(256, 256);
  g.fillStyle = "#d8cdb0";
  g.beginPath();
  g.arc(128, 128, 126, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#2a2118";
  g.font = `bold 22px ${BLOCK}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (let ch = 2; ch <= 13; ch++) {
    const a = ((ch - 2) / 12) * Math.PI * 2 - Math.PI / 2;
    g.fillText(String(ch), 128 + Math.cos(a) * 102, 128 + Math.sin(a) * 102);
  }
  return texture(c);
}

// Small gold nameplate under the screen.
export function nameplateTexture() {
  const { c, g } = canvas(512, 128);
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, "#f3dc94");
  grad.addColorStop(0.5, "#b68f3e");
  grad.addColorStop(1, "#e8cc7c");
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = "#3b2a10";
  g.font = `italic 74px ${SCRIPT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("Living Color", 256, 66);
  return texture(c);
}

// ---- The dealership in the commercial ---------------------------------------

export function checkerTexture() {
  const { c, g } = canvas(256, 256);
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 2; x++) {
      g.fillStyle = (x + y) % 2 ? "#1d1a18" : "#ece4d2";
      g.fillRect(x * 128, y * 128, 128, 128);
    }
  return texture(c, [10, 8]);
}

export function signTexture() {
  const { c, g } = canvas(1024, 160);
  g.fillStyle = "#b3231f";
  g.fillRect(0, 0, 1024, 160);
  g.strokeStyle = "#f5eedc";
  g.lineWidth = 8;
  g.strokeRect(10, 10, 1004, 140);
  g.fillStyle = "#fff6dc";
  g.font = `italic bold 96px ${SCRIPT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(DEALER, 512, 86);
  return texture(c);
}

export function bannerTexture() {
  const { c, g } = canvas(1024, 256);
  g.fillStyle = "#f3d23c";
  g.fillRect(0, 0, 1024, 256);
  g.fillStyle = "#1c3f8f";
  g.font = `bold 120px ${BLOCK}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("NEW FOR '68!", 512, 112);
  g.font = `bold 40px ${BLOCK}`;
  g.fillText("SALES · SERVICE · EASY TERMS", 512, 206);
  return texture(c);
}

export function placardTexture() {
  const { c, g } = canvas(256, 320);
  g.fillStyle = "#fbf6e8";
  g.fillRect(0, 0, 256, 320);
  g.strokeStyle = "#b3231f";
  g.lineWidth = 10;
  g.strokeRect(8, 8, 240, 304);
  g.textAlign = "center";
  g.fillStyle = "#1c3f8f";
  g.font = `bold 44px ${BLOCK}`;
  g.fillText("SS 396", 128, 80);
  g.font = `bold 26px ${BLOCK}`;
  g.fillText("4-SPEED", 128, 124);
  g.fillStyle = "#b3231f";
  g.font = `bold 52px ${BLOCK}`;
  g.fillText("$3,117", 128, 214);
  g.fillStyle = "#333";
  g.font = `20px ${BLOCK}`;
  g.fillText("ASK ABOUT", 128, 262);
  g.fillText("EASY TERMS", 128, 288);
  return texture(c);
}

// ---- Captions, drawn over the commercial before the CRT effects ----------

export const CAPTION_W = 640;
export const CAPTION_H = 480;

// Straight to the shader in display space (no colour conversion).
export function captionCanvas() {
  const { c, g } = canvas(CAPTION_W, CAPTION_H);
  const t = new CanvasTexture(c);
  t.colorSpace = NoColorSpace;
  return { canvas: c, g, texture: t };
}

function outlined(g: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, width = 7) {
  g.lineJoin = "round";
  g.strokeStyle = "rgba(18, 10, 4, 0.95)";
  g.lineWidth = width;
  g.strokeText(text, x, y);
  g.fillStyle = fill;
  g.fillText(text, x, y);
}

export type Caption = "presents" | "title" | "tagline" | "ss396" | "engine" | "none" | "price" | "visit";

export function drawCaption(g: CanvasRenderingContext2D, which: Caption) {
  g.clearRect(0, 0, CAPTION_W, CAPTION_H);
  g.textAlign = "center";
  g.textBaseline = "middle";
  const W = CAPTION_W;
  switch (which) {
    case "presents":
      g.font = `italic 50px ${SCRIPT}`;
      outlined(g, DEALER, W / 2, 380, "#fff4d6");
      g.font = `bold 26px ${BLOCK}`;
      outlined(g, "PROUDLY PRESENTS", W / 2, 426, "#ffd84a", 6);
      break;
    case "title":
      g.font = `bold 30px ${BLOCK}`;
      outlined(g, "THE NEW", W / 2, 70, "#ffd84a", 6);
      g.font = `italic 74px ${SCRIPT}`;
      outlined(g, "'68 Camaro SS", W / 2, 128, "#ffffff", 8);
      break;
    case "tagline":
      g.font = `bold 30px ${BLOCK}`;
      outlined(g, "LONG HOOD. SHORT DECK.", W / 2, 418, "#ffffff", 6);
      break;
    case "ss396":
      g.font = `bold 58px ${BLOCK}`;
      outlined(g, "SS 396", W / 2, 70, "#ffd84a", 8);
      g.font = `bold 30px ${BLOCK}`;
      outlined(g, "with 4-speed manual", W / 2, 118, "#ffffff", 6);
      break;
    case "engine":
      g.font = `bold 40px ${BLOCK}`;
      outlined(g, "396 CUBIC INCHES", W / 2, 400, "#ffffff", 7);
      g.font = `bold 32px ${BLOCK}`;
      outlined(g, "325 HORSEPOWER", W / 2, 446, "#ffd84a", 6);
      break;
    case "price": {
      // A banded price card across the lower half, like a dealer's slide.
      g.fillStyle = "rgba(20, 40, 110, 0.86)";
      g.fillRect(0, 238, W, 242);
      g.fillStyle = "#f3d23c";
      g.fillRect(0, 238, W, 8);
      g.font = `italic 46px ${SCRIPT}`;
      outlined(g, "'68 Camaro SS 396", W / 2, 286, "#ffffff", 6);
      g.font = `bold 24px ${BLOCK}`;
      outlined(g, "SPORT COUPE · 4-SPEED MANUAL", W / 2, 326, "#ffd84a", 5);
      g.font = `bold 78px ${BLOCK}`;
      outlined(g, "$3,117.35*", W / 2, 386, "#ffffff", 9);
      g.font = `15px ${BLOCK}`;
      g.fillStyle = "#e8e2d0";
      g.fillText("*Manufacturer's suggested retail price: SS 396 sport coupe $2,933,", W / 2, 438);
      g.fillText("plus 4-speed manual transmission $184.35. Destination charges,", W / 2, 456);
      g.fillText("state and local taxes and other options extra.", W / 2, 474);
      break;
    }
    case "visit":
      g.font = `bold 30px ${BLOCK}`;
      outlined(g, "SEE IT TODAY AT", W / 2, 336, "#ffffff", 6);
      g.font = `italic 64px ${SCRIPT}`;
      outlined(g, DEALER, W / 2, 392, "#ffd84a", 8);
      g.font = `bold 22px ${BLOCK}`;
      outlined(g, "YOUR FRIENDLY HOMETOWN DEALER", W / 2, 442, "#ffffff", 5);
      break;
    case "none":
      break;
  }
}
