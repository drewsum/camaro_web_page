import { useMemo } from "react";
import { useEnvironment } from "@react-three/drei";
import { Color, DataUtils, Euler, FloatType, HalfFloatType, Vector3, type DataTexture } from "three";

// Real outdoor lighting from Poly Haven HDRIs (CC0), fetched at runtime from
// their CDN rather than committed. The sun's direction and the horizon colour
// are read out of the image itself, so the scene's sun light, shadows and fog
// line up with whatever sky is loaded.

export function polyHavenHdri(name: string, res: "1k" | "2k" | "4k" = "2k") {
  return `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/${res}/${name}_${res}.hdr`;
}

export interface HdriSky {
  texture: DataTexture;
  rotation: Euler; // apply as both environmentRotation and backgroundRotation
  sun: Vector3; // unit direction toward the sun, in world space
  horizon: Color; // linear HDR colour just above the horizon (for custom shaders' haze)
  fog: Color; // the same colour as it appears on screen, for three's built-in fog
}

// three applies built-in fog after tone mapping, so its colour has to be the
// displayed value: run the horizon through the same ACES filmic curve and sRGB
// encoding the renderer uses.
function displayColour(c: Color, exposure: number) {
  const e = exposure / 0.6;
  const r = c.r * e, g = c.g * e, b = c.b * e;
  const x = 0.59719 * r + 0.35458 * g + 0.04823 * b;
  const y = 0.076 * r + 0.90834 * g + 0.01566 * b;
  const z = 0.0284 * r + 0.13383 * g + 0.83777 * b;
  const fit = (v: number) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
  const [fx, fy, fz] = [fit(x), fit(y), fit(z)];
  const out = [
    1.60475 * fx - 0.53108 * fy - 0.07367 * fz,
    -0.10208 * fx + 1.10813 * fy - 0.00605 * fz,
    -0.00327 * fx - 0.07276 * fy + 1.07602 * fz,
  ].map((v) => {
    const l = Math.min(1, Math.max(0, v));
    return l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
  });
  // Stored as-is: the fog mixes these numbers straight into the encoded output.
  return new Color(out[0], out[1], out[2]);
}

function analyse(texture: DataTexture) {
  const { data, width, height } = texture.image as { data: ArrayLike<number>; width: number; height: number };
  const read =
    texture.type === HalfFloatType
      ? (i: number) => DataUtils.fromHalfFloat((data as Uint16Array)[i])
      : texture.type === FloatType
        ? (i: number) => (data as Float32Array)[i]
        : (i: number) => (data as Uint8Array)[i] / 255;
  const channels = data.length / (width * height);
  let best = -1;
  let bestPx = 0;
  let bestPy = 0;
  const horizon = new Color(0, 0, 0);
  let count = 0;
  for (let py = 0; py < height; py++) {
    // Row 0 is the top of the image (straight up).
    const v = 1 - (py + 0.5) / height;
    const nearHorizon = v > 0.5 && v < 0.53;
    for (let px = 0; px < width; px++) {
      const i = (py * width + px) * channels;
      const r = read(i), g = read(i + 1), b = read(i + 2);
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (lum > best) {
        best = lum;
        bestPx = px;
        bestPy = py;
      }
      if (nearHorizon) {
        horizon.r += r;
        horizon.g += g;
        horizon.b += b;
        count++;
      }
    }
  }
  horizon.multiplyScalar(1 / Math.max(1, count));
  // three's equirect lookup: u = atan(dir.z, dir.x) / 2π + 0.5, v = asin(dir.y) / π + 0.5.
  const phi = ((bestPx + 0.5) / width - 0.5) * Math.PI * 2;
  const theta = (1 - (bestPy + 0.5) / height - 0.5) * Math.PI;
  const sun = new Vector3(Math.cos(theta) * Math.cos(phi), Math.sin(theta), Math.cos(theta) * Math.sin(phi));
  return { sun, horizon };
}

// Loads an HDRI and turns it about the vertical so its sun sits at `sunAzimuth`
// (radians from +Z toward +X, i.e. 0 = straight ahead of the car), or leaves
// it as shot when `sunAzimuth` is null.
export function useHdriSky(url: string, sunAzimuth: number | null, exposure: number): HdriSky {
  const texture = useEnvironment({ files: url }) as DataTexture;
  return useMemo(() => {
    const { sun, horizon } = analyse(texture);
    const current = Math.atan2(sun.x, sun.z);
    // Environment rotation turns the sky the same way as rotating an object.
    const rotation = new Euler(0, sunAzimuth === null ? 0 : sunAzimuth - current, 0);
    return { texture, rotation, sun: sun.clone().applyEuler(rotation), horizon, fog: displayColour(horizon, exposure) };
  }, [texture, sunAzimuth, exposure]);
}
