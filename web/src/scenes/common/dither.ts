import { Vector2, Vector3, type Material } from "three";

// Dithered cross-fades by distance, for instanced scenery that changes level
// of detail or stops being drawn. Over a band of distance the outgoing
// version drops a growing share of its pixels in a fine screen-space pattern
// and the incoming one draws exactly those pixels, so nothing pops and no
// pixel is drawn twice. It needs no sorting or transparency, so it's as
// cheap as the alpha test the foliage already does.

// Interleaved gradient noise: a well-spread threshold in [0, 1) per pixel.
export const DITHER_GLSL = /* glsl */ `
  float ditherNoise(vec2 p) {
    return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
  }
  float ramp(vec2 band, float d) {
    return band.y <= band.x ? 1.0 : clamp((d - band.x) / (band.y - band.x), 0.0, 1.0);
  }
  // Drawn in full once \`fadeIn\` is complete and until \`fadeOut\` starts. The
  // two tests are complementary, so a level fading out over a band and the
  // next fading in over the same band split the pixels between them.
  bool ditherKeep(float d, vec2 fadeIn, vec2 fadeOut) {
    float n = ditherNoise(gl_FragCoord.xy);
    float vin = fadeIn.y <= fadeIn.x ? 1.0 : ramp(fadeIn, d);
    float vout = fadeOut.y <= fadeOut.x ? 1.0 : 1.0 - ramp(fadeOut, d);
    return n >= 1.0 - vin && n < vout;
  }
`;

export interface FadeBands {
  fadeIn?: [number, number]; // distances over which it appears, nearer to farther
  fadeOut?: [number, number]; // distances over which it disappears
  centre?: Vector3; // the point of each instance measured from, in the model's own units
}

// A copy of an instanced material that fades each instance by its distance
// from the camera. (Shadow passes use their own depth material and aren't faded.)
export function fadedMaterial<M extends Material>(source: M, { fadeIn, fadeOut, centre = new Vector3() }: FadeBands): M {
  const m = source.clone() as M;
  const uniforms = {
    uFadeIn: { value: new Vector2(...(fadeIn ?? [0, 0])) },
    uFadeOut: { value: new Vector2(...(fadeOut ?? [0, 0])) },
    uFadeCentre: { value: centre },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uFadeCentre;\nvarying float vFadeDistance;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvFadeDistance = distance((modelMatrix * instanceMatrix * vec4(uFadeCentre, 1.0)).xyz, cameraPosition);",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec2 uFadeIn;\nuniform vec2 uFadeOut;\nvarying float vFadeDistance;\n" + DITHER_GLSL)
      .replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\nif (!ditherKeep(vFadeDistance, uFadeIn, uFadeOut)) discard;");
  };
  const key = `faded:${fadeIn ?? "-"}:${fadeOut ?? "-"}`;
  m.customProgramCacheKey = () => key;
  return m;
}
