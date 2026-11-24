import { useMemo } from "react";
import { useTexture } from "@react-three/drei";
import { MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, Vector2, type Texture } from "three";
import assets from "./polyHavenAssets.json";

// Scanned CC0 surface textures from Poly Haven: colour, OpenGL normal, and the
// packed AO/roughness/metal map. scripts/polyhaven.mjs downloads the ones
// listed in polyHavenAssets.json into public/ph/ as WebP, a quarter to a third
// the size of Poly Haven's own near-lossless JPGs, and only the maps a scene
// samples are fetched.

export type PbrRes = "1k" | "2k" | "4k";
export type PbrMap = "map" | "normalMap" | "arm";

const ALL: readonly PbrMap[] = ["map", "normalMap", "arm"];
const SUFFIX: Record<PbrMap, string> = { map: "diff", normalMap: "nor_gl", arm: "arm" };
const LISTED = assets.textures as Record<string, Partial<Record<PbrRes, string[]>>>;

function urls<M extends PbrMap>(name: string, res: PbrRes, maps: readonly M[]) {
  const out = {} as Record<M, string>;
  for (const m of maps) {
    if (!LISTED[name]?.[res]?.includes(SUFFIX[m])) {
      throw new Error(`Add ${name} ${res} "${SUFFIX[m]}" to polyHavenAssets.json (then restart the dev server)`);
    }
    out[m] = `/ph/tex/${name}_${SUFFIX[m]}_${res}.webp`;
  }
  return out;
}

interface Options {
  res?: PbrRes;
  tile: number; // metres one copy of the texture covers in the real world
  size: [number, number]; // metres the mesh's UV square spans (u, v)
  normalScale?: number;
  tint?: string; // multiplies the colour map
  brightness?: number; // scales the colour map (scans are often shot darker than a sunlit surface reads)
  roughness?: number; // scales the scanned roughness
}

// A tiled material for a mesh whose 0-1 UVs span `size` metres. Textures
// are shared from drei's cache; each material clones them to set its own repeat.
//
// drei's useTexture hands back a new { map, normalMap, arm } object on every
// render (the textures in it are the cached ones), so the memos key on the
// textures themselves: keyed on the object, every re-render of a scene (the
// Lights or Dome light tickbox) built new materials, re-uploaded every surface
// texture and leaked the old copies.
export function usePbrMaterial(name: string, { res = "2k", tile, size, normalScale = 1, tint = "#ffffff", brightness = 1, roughness = 1 }: Options) {
  const tex = useTexture(urls(name, res, ALL));
  return useMemo(() => {
    const repeat = (t: Texture) => {
      const c = t.clone();
      c.wrapS = c.wrapT = RepeatWrapping;
      c.repeat.set(size[0] / tile, size[1] / tile);
      c.anisotropy = 16;
      c.needsUpdate = true;
      return c;
    };
    const map = repeat(tex.map);
    map.colorSpace = SRGBColorSpace;
    const arm = repeat(tex.arm);
    const material = new MeshStandardMaterial({
      map,
      normalMap: repeat(tex.normalMap),
      normalScale: new Vector2(normalScale, normalScale),
      aoMap: arm, // red channel
      roughnessMap: arm, // green channel
      roughness,
      metalness: 0,
      color: tint,
    });
    material.color.multiplyScalar(brightness);
    return material;
  }, [tex.map, tex.normalMap, tex.arm, tile, size[0], size[1], normalScale, tint, brightness, roughness]); // eslint-disable-line react-hooks/exhaustive-deps
}

// The raw textures, wrapping and at full anisotropy, for custom shaders that
// sample them themselves (shared from drei's cache, so don't change repeat).
// Pass `maps` to fetch only the ones the shader reads.
export function usePbrTextures<M extends PbrMap = PbrMap>(name: string, res: PbrRes = "2k", maps: readonly M[] = ALL as readonly M[]) {
  const tex = useTexture(urls(name, res, maps)) as Record<M, Texture>;
  const list = maps.map((m) => tex[m]);
  return useMemo(() => {
    for (const m of maps) {
      const t = tex[m];
      t.wrapS = t.wrapT = RepeatWrapping;
      t.anisotropy = 16;
      if (m === "map") t.colorSpace = SRGBColorSpace;
      t.needsUpdate = true;
    }
    return tex;
  }, list); // eslint-disable-line react-hooks/exhaustive-deps
}

export function preloadPbr(name: string, res: PbrRes = "2k", maps: readonly PbrMap[] = ALL) {
  useTexture.preload(Object.values(urls(name, res, maps)));
}
