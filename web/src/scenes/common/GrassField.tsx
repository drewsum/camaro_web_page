import { useMemo } from "react";
import { preloadPbr, usePbrMaterial } from "./pbr";

// Open grass: Poly Haven's scanned "leafy_grass" tiled every 2 m, broken up
// by much broader patches (the same scan, blurred and stretched to tens of
// metres) so it doesn't read as a repeating tile toward the horizon, and
// optionally mown in 3 m stripes.

const GRASS = "leafy_grass";
preloadPbr(GRASS);

export default function GrassField({
  size,
  position = [0, 0, 0],
  mown = false,
  behind = false,
}: {
  size: number; // metres square
  position?: [number, number, number];
  mown?: boolean;
  behind?: boolean; // pushed back in depth so it never shows through a road laid on it
}) {
  const material = usePbrMaterial(GRASS, { tile: 2, size: [size, size], normalScale: 0.9, tint: "#b4d68a", brightness: 1.1 });
  useMemo(() => {
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        /* glsl */ `#include <map_fragment>
        {
          vec3 avg = textureLod(map, vec2(0.5), 16.0).rgb;
          vec3 broad = texture(map, vMapUv * 0.071 + 0.17, 5.0).rgb + texture(map, vMapUv * 0.023 + 0.53, 6.0).rgb;
          const vec3 LUMA = vec3(0.3, 0.59, 0.11);
          float patchy = dot(broad, LUMA) / max(2.0 * dot(avg, LUMA), 1e-3);
          diffuseColor.rgb *= mix(1.0, clamp(patchy, 0.7, 1.35), 0.6);
          ${
            mown
              ? `// Mown in 3 m passes, alternately toward and away from the camera.
          float pass = smoothstep(0.4, 0.6, abs(fract(vMapUv.x / 1.5) - 0.5) * 2.0);
          diffuseColor.rgb *= mix(0.93, 1.05, pass);`
              : ""
          }
        }`,
      );
    };
    material.customProgramCacheKey = () => `grass-field-${mown}`;
    if (behind) {
      material.polygonOffset = true;
      material.polygonOffsetFactor = 1;
      material.polygonOffsetUnits = 4;
    }
    material.needsUpdate = true;
  }, [material, mown, behind]);
  return (
    <mesh rotation-x={-Math.PI / 2} position={position} material={material} receiveShadow>
      <planeGeometry args={[size, size]} />
    </mesh>
  );
}
