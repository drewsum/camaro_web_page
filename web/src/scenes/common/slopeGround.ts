import { useMemo } from "react";
import { Color, DoubleSide, MeshStandardMaterial, Vector2, Vector3, type Texture } from "three";
import { preloadPbr, usePbrTextures } from "./pbr";

// Natural ground that picks its surface by steepness, like Slow Roads: grass
// on the flats, dry stony dirt where it starts to tilt, rock on the steep
// faces. Grass keeps the mesh's vertex colours (meadow patchwork, golden
// hills) with the scan supplying only the detail; dirt and rock are the scans'
// own colours. Rock is mapped from three sides so cliffs don't smear. A
// little noise wobbles the boundaries so they don't follow contour lines.
//
// Textures are mapped from the mesh's own coordinates (plus `offset`, for
// scenery that recentres itself), and every repeat divides PERIOD metres, so
// shifting the mapping by a whole PERIOD changes nothing.

export const GROUND_PERIOD = 200;
const GRASS = "leafy_grass";
const DIRT = "dry_ground_rocks";
const ROCK = "rock_face";
// The shader samples only the colour of each scan.
preloadPbr(GRASS, "2k", ["map"]);
preloadPbr(DIRT, "1k", ["map"]);
preloadPbr(ROCK, "1k", ["map"]);

export interface SlopeGroundOptions {
  dirt?: [number, number]; // steepness (1 - normal.y) where dirt fades in, and where it's full
  rock?: [number, number]; // likewise for rock
  rockTint?: string;
  dirtTint?: string;
  // Read a float attribute "rockiness" from the mesh, forcing rock where it's
  // 1. Only for meshes that have it: WebGL hands a mesh without the attribute
  // whatever constant was last left at that slot, not necessarily 0.
  rockiness?: boolean;
}

const head = /* glsl */ `
  uniform sampler2D uGrass;
  uniform sampler2D uDirt;
  uniform sampler2D uRock;
  uniform vec3 uOffset;
  uniform vec2 uDirtSlope;
  uniform vec2 uRockSlope;
  uniform vec3 uDirtTint;
  uniform vec3 uRockTint;
  varying vec3 vGroundPos;
  varying vec3 vGroundNormal;
  varying float vRockiness;

  // Value noise on a lattice that wraps every PERIOD metres.
  float gHash(vec2 c) { return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453); }
  float gNoise(vec2 p, float cell) {
    float cells = ${GROUND_PERIOD.toFixed(1)} / cell;
    vec2 q = p / cell, i = floor(q), f = fract(q);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = gHash(mod(i, cells)), b = gHash(mod(i + vec2(1, 0), cells));
    float c = gHash(mod(i + vec2(0, 1), cells)), d = gHash(mod(i + vec2(1, 1), cells));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  // A scan's colour divided by its own average: just the detail, around 1.
  vec3 gDetail(sampler2D t, vec2 uv) {
    return texture2D(t, uv).rgb / max(textureLod(t, vec2(0.5), 12.0).rgb, vec3(0.02));
  }
`;

const ground = /* glsl */ `
  {
    vec3 p = vGroundPos + uOffset;
    vec3 n = normalize(vGroundNormal);
    float wobble = (gNoise(p.xz, 12.5) - 0.5) * 0.12 + (gNoise(p.xz, 4.0) - 0.5) * 0.05;
    float steep = 1.0 - n.y + wobble;
    float wDirt = smoothstep(uDirtSlope.x, uDirtSlope.y, steep);
    float wRock = max(smoothstep(uRockSlope.x, uRockSlope.y, steep), vRockiness);
    // Broad light and dark patches so no repeat shows toward the horizon.
    float patches = 0.82 + 0.36 * gNoise(p.xz, 40.0);

    vec3 grass = vColor.rgb * mix(gDetail(uGrass, p.xz / 4.0), vec3(1.0), 0.25);
    vec3 dirt = texture2D(uDirt, p.xz / 10.0).rgb * uDirtTint;
    vec3 rock = vec3(0.0);
    if (wRock > 0.001) {
      vec3 w = pow(abs(n), vec3(4.0));
      w /= w.x + w.y + w.z;
      rock = (texture2D(uRock, p.zy / 12.5).rgb * w.x + texture2D(uRock, p.xz / 12.5).rgb * w.y + texture2D(uRock, p.xy / 12.5).rgb * w.z) * uRockTint;
    }
    diffuseColor.rgb *= mix(mix(grass, dirt, wDirt), rock, wRock) * patches;
  }
`;

// A MeshStandardMaterial for terrain with vertex colours (the grass colour)
// and, optionally, a float attribute "rockiness" forcing rock where it's 1.
export function useSlopeGround({ dirt = [0.12, 0.3], rock = [0.38, 0.6], rockTint = "#ffffff", dirtTint = "#ffffff", rockiness = false }: SlopeGroundOptions = {}) {
  const grassTex = usePbrTextures(GRASS, "2k", ["map"]);
  const dirtTex = usePbrTextures(DIRT, "1k", ["map"]);
  const rockTex = usePbrTextures(ROCK, "1k", ["map"]);
  return useMemo(() => {
    const offset = { value: new Vector3() };
    const material = new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: DoubleSide });
    const linear = (c: string) => new Color(c);
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        uGrass: { value: grassTex.map as Texture },
        uDirt: { value: dirtTex.map as Texture },
        uRock: { value: rockTex.map as Texture },
        uOffset: offset,
        uDirtSlope: { value: new Vector2(...dirt) },
        uRockSlope: { value: new Vector2(...rock) },
        uDirtTint: { value: linear(dirtTint) },
        uRockTint: { value: linear(rockTint) },
      });
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>\n${rockiness ? "attribute float rockiness;\n" : ""}varying vec3 vGroundPos;\nvarying vec3 vGroundNormal;\nvarying float vRockiness;`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>\nvGroundPos = position;\nvGroundNormal = normal;\nvRockiness = ${rockiness ? "rockiness" : "0.0"};`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\n" + head)
        .replace("#include <color_fragment>", ground);
    };
    material.customProgramCacheKey = () => (rockiness ? "slope-ground-rocky" : "slope-ground");
    return { material, offset: offset.value };
  }, [grassTex, dirtTex, rockTex, dirt[0], dirt[1], rock[0], rock[1], rockTint, dirtTint, rockiness]); // eslint-disable-line react-hooks/exhaustive-deps
}
