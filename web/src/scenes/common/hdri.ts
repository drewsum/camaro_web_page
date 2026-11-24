import { useMemo } from "react";
import { useEnvironment } from "@react-three/drei";
import assets from "./polyHavenAssets.json";
import { Color, DataUtils, Euler, FloatType, HalfFloatType, Vector3, type DataTexture } from "three";

// Real outdoor lighting from Poly Haven HDRIs (CC0), downloaded at build time
// by scripts/polyhaven.mjs (list them in polyHavenAssets.json) and served
// gzipped by the site itself. The sun's direction and the horizon colour are
// read out of the image itself, so the scene's sun light, shadows and fog line
// up with whatever sky is loaded.

export function polyHavenHdri(name: string) {
  if (!assets.hdris.includes(name)) throw new Error(`Add the HDRI ${name} to polyHavenAssets.json (then restart the dev server)`);
  return `/ph/hdri/${name}_2k.hdr`;
}

export interface HdriSky {
  texture: DataTexture;
  rotation: Euler; // apply as both environmentRotation and backgroundRotation
  sun: Vector3; // unit direction toward the sun, in world space
  sunIntensity: number; // for the scene's directional sun light
  sunColor: Color;
  sunPeak: number; // the sun's brightest pixel over the sky's average: thousands for a hard sun, tens for a hazy one
  envIntensity: number; // for the environment the clipped sky lights the car with
  horizon: Color; // linear HDR colour just above the horizon (for custom shaders' haze)
  fog: Color; // for three's built-in fog: the horizon's linear colour (tone mapping comes after, in PostFX)
  backgroundIntensity?: number; // how bright the sky is drawn behind the scene (default 1)
}

// The sun is a few pixels thousands of times brighter than the sky, carrying
// most of the photo's light. Scenes light the car with a shadow-casting
// directional light instead, so the sun is clipped out of the image here and
// its energy and colour handed to that light. Leaving it in counts the sun
// twice, and the extra diffuse light drowns the paint's sky reflections.
const SUN_CLIP = 20; // × the sky's average brightness (and never below 50)

// A photographer's balance rather than the photo's own: under a hard sun and
// a dark blue sky the sun's diffuse light swamps the clear coat, so dim skies
// go onto the car brighter (up to SKY_FILL_MAX) and the sun softer. This is
// what makes the paint and chrome read as glossy outdoors, the way the studio's
// light panels do in the showroom. Bright overcast skies are left as shot.
const SKY_TARGET = 0.6; // average sky brightness worth reflecting
const SKY_FILL_MAX = 3;
const SUN_SHARE = 0.5;

function analyse(texture: DataTexture) {
  const { data, width, height } = texture.image as { data: ArrayLike<number>; width: number; height: number };
  const half = texture.type === HalfFloatType;
  const float = texture.type === FloatType;
  const read = half
    ? (i: number) => DataUtils.fromHalfFloat((data as Uint16Array)[i])
    : float
      ? (i: number) => (data as Float32Array)[i]
      : (i: number) => (data as Uint8Array)[i] / 255;
  const write = half
    ? (i: number, v: number) => ((data as Uint16Array)[i] = DataUtils.toHalfFloat(v))
    : (i: number, v: number) => ((data as Float32Array)[i] = v);
  const channels = data.length / (width * height);
  // Row 0 is the top of the image (straight up).
  const latitude = (py: number) => (0.5 - (py + 0.5) / height) * Math.PI;
  const pixelAngle = (2 * Math.PI * Math.PI) / (width * height); // solid angle of a pixel on the equator
  const lum = (i: number) => 0.2126 * read(i) + 0.7152 * read(i + 1) + 0.0722 * read(i + 2);

  let best = -1;
  let bestPx = 0;
  let bestPy = 0;
  const horizon = new Color(0, 0, 0);
  let count = 0;
  let skySum = 0;
  let skyWeight = 0;
  for (let py = 0; py < height; py++) {
    const v = 1 - (py + 0.5) / height;
    const nearHorizon = v > 0.5 && v < 0.53;
    const w = Math.cos(latitude(py));
    for (let px = 0; px < width; px++) {
      const i = (py * width + px) * channels;
      const l = lum(i);
      if (l > best) {
        best = l;
        bestPx = px;
        bestPy = py;
      }
      if (v > 0.5 && l < 50) {
        skySum += l * w;
        skyWeight += w;
      }
      if (nearHorizon) {
        horizon.r += read(i);
        horizon.g += read(i + 1);
        horizon.b += read(i + 2);
        count++;
      }
    }
  }
  horizon.multiplyScalar(1 / Math.max(1, count));

  // Clip everything much brighter than the sky, collecting what was removed.
  const removed = new Color(0, 0, 0);
  const skyMean = skySum / Math.max(1e-6, skyWeight);
  const clip = Math.max(50, SUN_CLIP * skyMean);
  if (half || float) {
    for (let py = 0; py < height; py++) {
      const dOmega = pixelAngle * Math.cos(latitude(py));
      for (let px = 0; px < width; px++) {
        const i = (py * width + px) * channels;
        const l = lum(i);
        if (l <= clip) continue;
        const k = clip / l;
        const r = read(i), g = read(i + 1), b = read(i + 2);
        removed.r += r * (1 - k) * dOmega;
        removed.g += g * (1 - k) * dOmega;
        removed.b += b * (1 - k) * dOmega;
        write(i, r * k);
        write(i + 1, g * k);
        write(i + 2, b * k);
      }
    }
    texture.needsUpdate = true;
  }
  // As a directional light: intensity is the irradiance facing the sun.
  const sunIntensity = Math.max(removed.r, removed.g, removed.b);
  const sunColor = sunIntensity > 0 ? removed.multiplyScalar(1 / sunIntensity) : new Color(1, 1, 1);

  // three's equirect lookup: u = atan(dir.z, dir.x) / 2π + 0.5, v = asin(dir.y) / π + 0.5.
  const phi = ((bestPx + 0.5) / width - 0.5) * Math.PI * 2;
  const theta = (1 - (bestPy + 0.5) / height - 0.5) * Math.PI;
  const sun = new Vector3(Math.cos(theta) * Math.cos(phi), Math.sin(theta), Math.cos(theta) * Math.sin(phi));
  return { sun, horizon, sunIntensity, sunColor, skyMean, sunPeak: best / Math.max(1e-6, skyMean) };
}

// Textures are cached and shared, and clipping is one-way: analyse each once.
const analysed = new WeakMap<DataTexture, ReturnType<typeof analyse>>();

// Loads an HDRI and turns it about the vertical so its sun sits at `sunAzimuth`
// (radians from +Z toward +X, i.e. 0 = straight ahead of the car), or leaves
// it as shot when `sunAzimuth` is null.
export function useHdriSky(url: string, sunAzimuth: number | null): HdriSky {
  const texture = useEnvironment({ files: url }) as DataTexture;
  return useMemo(() => {
    let a = analysed.get(texture);
    if (!a) analysed.set(texture, (a = analyse(texture)));
    const { sun, horizon, sunIntensity, sunColor, skyMean, sunPeak } = a;
    const current = Math.atan2(sun.x, sun.z);
    // Environment rotation turns the sky the same way as rotating an object.
    const rotation = new Euler(0, sunAzimuth === null ? 0 : sunAzimuth - current, 0);
    return {
      texture,
      rotation,
      sun: sun.clone().applyEuler(rotation),
      sunIntensity: sunIntensity * SUN_SHARE,
      sunColor,
      sunPeak,
      envIntensity: Math.min(SKY_FILL_MAX, Math.max(1, SKY_TARGET / skyMean)),
      horizon,
      fog: horizon.clone(),
    };
  }, [texture, sunAzimuth]);
}
