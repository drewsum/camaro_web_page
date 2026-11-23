import { useEffect, useLayoutEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  HalfFloatType,
  LinearMipmapLinearFilter,
  Matrix4,
  PerspectiveCamera,
  Plane,
  Texture,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type MeshStandardMaterial,
} from "three";

// Wet ground after rain: the surface goes darker and glossier, puddles lie in
// the low spots (a world-space noise pattern) as near-mirrors, and lamps,
// lit signs, headlights and the car show in it.
//
// The reflection is a real one: each frame the scene is drawn again, at half
// resolution, from the camera mirrored in the ground's plane (the way three's
// Reflector does it, with an oblique near plane so nothing below the ground
// shows). The ground materials sample it where they lie on screen, blurred
// more where the surface is rougher and wobbled by its bumps, and weighted by
// Fresnel, so it's strongest looking along the road. Ground that isn't
// perfectly flat (a road with grade) reflects from the plane at `height`,
// close enough near the car.
//
// The materials are patched once; `wet` only sets a uniform, so the same
// materials serve dry daytime and wet night without recompiling.

const RES = 0.5; // the reflection's resolution, as a share of the frame's

const wetPars = /* glsl */ `
  uniform float uWet;
  uniform sampler2D uReflection;
  uniform mat4 uReflectMatrix;
  varying vec3 vWetWorld;
  varying vec3 vWetLocal;
  float wetHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float wetNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(wetHash(i), wetHash(i + vec2(1.0, 0.0)), u.x), mix(wetHash(i + vec2(0.0, 1.0)), wetHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  // Puddles: two octaves of noise, metres-wide pools with ragged edges.
  float puddleAt(vec2 xz) {
    float n = 0.65 * wetNoise(xz * 0.22) + 0.35 * wetNoise(xz * 0.9 + 17.0);
    return smoothstep(0.56, 0.63, n);
  }
`;

function patch(material: MeshStandardMaterial, uniforms: Record<string, { value: unknown }>) {
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    prev.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWetWorld;\nvarying vec3 vWetLocal;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWetWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWetLocal = transformed;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\n" + wetPars)
      // Wet surfaces are darker: water fills the texture and less light scatters back out.
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        // In the mesh's own frame, so the puddles stay put on a road that moves
        // (a flat plane lies in its xy, a road's geometry in its xz).
        float puddle = puddleAt(vec2(vWetLocal.x, vWetLocal.y + vWetLocal.z)) * uWet;
        diffuseColor.rgb *= mix(1.0, mix(0.55, 0.35, puddle), uWet);`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, mix(0.3, 0.04, puddle), uWet);`,
      )
      // Standing water is flat: the puddles lose the surface's bumps.
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nvec3 wetBumps = normal;\nnormal = normalize(mix(normal, nonPerturbedNormal, puddle));")
      .replace(
        "#include <opaque_fragment>",
        `if (uWet > 0.0) {
          vec4 rc = uReflectMatrix * vec4(vWetWorld, 1.0);
          vec2 ruv = rc.xy / rc.w + (wetBumps.xy - nonPerturbedNormal.xy) * 0.04 * (1.0 - puddle);
          float rough = roughnessFactor;
          vec3 reflected = textureLod(uReflection, ruv, rough * 7.0).rgb;
          float facing = clamp(dot(normalize(vViewPosition), nonPerturbedNormal), 0.0, 1.0);
          float fresnel = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
          outgoingLight += reflected * fresnel * uWet * mix(0.3, 1.0, puddle) * (1.0 - rough);
        }
        #include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => prevKey() + "|wet";
  material.needsUpdate = true;
}

export default function WetGround({ materials, wet, height = 0 }: { materials: MeshStandardMaterial[]; wet: boolean; height?: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);

  const state = useMemo(() => {
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, generateMipmaps: true, minFilter: LinearMipmapLinearFilter });
    return {
      target,
      mirror: new PerspectiveCamera(),
      uniforms: { uWet: { value: 0 }, uReflection: { value: target.texture as Texture }, uReflectMatrix: { value: new Matrix4() } },
    };
  }, []);

  useLayoutEffect(() => {
    for (const m of materials) if (!m.userData.wet) {
      patch(m, state.uniforms);
      m.userData.wet = true;
    }
  }, [materials, state]);

  useEffect(() => {
    state.target.setSize(Math.max(1, Math.round(size.width * dpr * RES)), Math.max(1, Math.round(size.height * dpr * RES)));
  }, [state, size, dpr]);

  useEffect(() => () => state.target.dispose(), [state]);

  useFrame(() => {
    state.uniforms.uWet.value = wet ? 1 : 0;
    if (!wet) return;
    renderMirror(gl, scene, camera, state.mirror, height, state.target, state.uniforms.uReflectMatrix.value, materials);
  });

  return null;
}

const normal = new Vector3(0, 1, 0);
const point = new Vector3();
const eye = new Vector3();
const look = new Vector3();
const target = new Vector3();
const rotation = new Matrix4();
const plane = new Plane();
const clip = new Vector4();
const q = new Vector4();

function renderMirror(
  gl: import("three").WebGLRenderer,
  scene: import("three").Scene,
  camera: PerspectiveCamera,
  mirror: PerspectiveCamera,
  height: number,
  rt: WebGLRenderTarget,
  textureMatrix: Matrix4,
  hide: MeshStandardMaterial[],
) {
  // The mirrored camera, following three's Reflector.
  eye.setFromMatrixPosition(camera.matrixWorld);
  if (eye.y <= height) return;
  point.set(eye.x, height, eye.z);
  rotation.extractRotation(camera.matrixWorld);
  look.set(0, 0, -1).applyMatrix4(rotation).add(eye);
  target.subVectors(point, look).reflect(normal).negate().add(point);
  mirror.position.set(eye.x, 2 * height - eye.y, eye.z); // the eye's reflection in the plane
  mirror.up.set(0, 1, 0).applyMatrix4(rotation).reflect(normal);
  mirror.lookAt(target);
  mirror.far = camera.far;
  mirror.updateMatrixWorld();
  mirror.projectionMatrix.copy(camera.projectionMatrix);
  mirror.projectionMatrix.elements[8] *= -1;
  mirror.projectionMatrix.elements[12] *= -1;

  textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  textureMatrix.multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);

  // Oblique near plane at the ground, so nothing below it is drawn.
  plane.setFromNormalAndCoplanarPoint(normal, point).applyMatrix4(mirror.matrixWorldInverse);
  clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
  const p = mirror.projectionMatrix.elements;
  q.set((Math.sign(clip.x) + p[8]) / p[0], (Math.sign(clip.y) + p[9]) / p[5], -1, (1 + p[10]) / p[14]);
  clip.multiplyScalar(2 / clip.dot(q));
  p[2] = clip.x;
  p[6] = clip.y;
  p[10] = clip.z + 1 - 0.003;
  p[14] = clip.w;

  // Draw it, without the wet ground itself (it's the mirror) or new shadows.
  for (const m of hide) m.visible = false;
  const prevTarget = gl.getRenderTarget();
  const prevShadows = gl.shadowMap.autoUpdate;
  gl.shadowMap.autoUpdate = false;
  gl.setRenderTarget(rt);
  gl.clear();
  gl.render(scene, mirror);
  gl.setRenderTarget(prevTarget);
  gl.shadowMap.autoUpdate = prevShadows;
  for (const m of hide) m.visible = true;
}
