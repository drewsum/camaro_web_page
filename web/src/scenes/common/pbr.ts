import { useMemo } from "react";
import { useTexture } from "@react-three/drei";
import { MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, Vector2, type Texture } from "three";

// Scanned CC0 surface textures from Poly Haven, fetched from their CDN at
// runtime: colour, OpenGL normal, and the packed AO/roughness/metal map.

export type PbrRes = "1k" | "2k" | "4k";

function urls(name: string, res: PbrRes) {
  const base = `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/${res}/${name}/${name}`;
  return { map: `${base}_diff_${res}.jpg`, normalMap: `${base}_nor_gl_${res}.jpg`, arm: `${base}_arm_${res}.jpg` };
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
  const tex = useTexture(urls(name, res));
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
export function usePbrTextures(name: string, res: PbrRes = "2k") {
  const tex = useTexture(urls(name, res));
  return useMemo(() => {
    for (const t of [tex.map, tex.normalMap, tex.arm]) {
      t.wrapS = t.wrapT = RepeatWrapping;
      t.anisotropy = 16;
      t.needsUpdate = true;
    }
    tex.map.colorSpace = SRGBColorSpace;
    return tex;
  }, [tex.map, tex.normalMap, tex.arm]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function preloadPbr(name: string, res: PbrRes = "2k") {
  useTexture.preload(Object.values(urls(name, res)));
}
