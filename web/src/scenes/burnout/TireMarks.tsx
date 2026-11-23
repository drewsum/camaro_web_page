import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  BufferAttribute,
  BufferGeometry,
  Camera,
  Color,
  CustomBlending,
  LinearMipmapLinearFilter,
  Mesh,
  MeshStandardMaterial,
  OneFactor,
  OneMinusSrcAlphaFactor,
  RawShaderMaterial,
  Scene,
  WebGLRenderTarget,
  ZeroFactor,
} from "three";

// Rubber laid down on the asphalt: each frame a short dark stroke is drawn
// along every sliding tyre's path into a texture spread over the pen, so the
// circles and figure eights build up into a thick black tangle. Old rubber
// very slowly weathers away, so the pen never goes solid black.
//
// The strokes are drawn on the GPU straight into a render target that the
// ground decal uses as its alpha map. (Painting a 2D canvas and re-uploading
// it, 16 MB plus mipmaps every few frames, stalled Chrome on Windows into a
// steady stutter: issue #15.)

export interface Tyre {
  x: number;
  z: number;
  strength: number; // 0 = rolling, 1 = spinning flat out
}

const PX = 2048;
const WIDTH = 0.24; // a stroke's width, m
const MAX_STROKES = 8; // per frame
const RUBBER = "#0c0b0a";

// One quad per stroke, written straight to clip space: x across the pen to
// clip x, z to clip -y (render-target rows run up the texture, which is -z on
// the laid-flat plane, see below). Round caps come from the distance to the
// segment in the fragment shader.
const strokeVertex = /* glsl */ `
  precision highp float;
  attribute vec2 position;  // this corner, m
  attribute vec4 aSeg;      // the stroke's ends, m
  attribute float aAlpha;
  uniform float uHalf;
  varying vec2 vP;
  varying vec4 vSeg;
  varying float vAlpha;
  void main() {
    vP = position;
    vSeg = aSeg;
    vAlpha = aAlpha;
    gl_Position = vec4(position.x / uHalf, -position.y / uHalf, 0.0, 1.0);
  }
`;

const strokeFragment = /* glsl */ `
  precision highp float;
  uniform float uRadius;
  uniform float uPixel; // one texel, m
  varying vec2 vP;
  varying vec4 vSeg;
  varying float vAlpha;
  void main() {
    vec2 a = vSeg.xy;
    vec2 ab = vSeg.zw - a;
    float h = clamp(dot(vP - a, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
    float d = length(vP - a - ab * h);
    float cover = 1.0 - smoothstep(uRadius - 0.5 * uPixel, uRadius + 0.5 * uPixel, d);
    // Coverage in every channel, blended like canvas source-over.
    gl_FragColor = vec4(vAlpha * cover);
  }
`;

// A full-target triangle for the weathering pass.
const fadeVertex = /* glsl */ `
  precision highp float;
  attribute vec2 position;
  void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;
const fadeFragment = /* glsl */ `
  precision highp float;
  uniform float uAmount;
  void main() { gl_FragColor = vec4(uAmount); }
`;

const clearColor = new Color();

export default function TireMarks({ tyres, half }: { tyres: { current: Tyre[] }; half: number }) {
  const gl = useThree((s) => s.gl);
  const state = useMemo(() => {
    const target = new WebGLRenderTarget(PX, PX, { depthBuffer: false, generateMipmaps: true, minFilter: LinearMipmapLinearFilter });
    target.texture.anisotropy = 8;

    // Strokes: four corners a quad, rewritten each frame.
    const geometry = new BufferGeometry();
    const corners = new Float32Array(MAX_STROKES * 4 * 2);
    const segs = new Float32Array(MAX_STROKES * 4 * 4);
    const alphas = new Float32Array(MAX_STROKES * 4);
    const index: number[] = [];
    for (let i = 0; i < MAX_STROKES; i++) index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    geometry.setAttribute("position", new BufferAttribute(corners, 2));
    geometry.setAttribute("aSeg", new BufferAttribute(segs, 4));
    geometry.setAttribute("aAlpha", new BufferAttribute(alphas, 1));
    geometry.setIndex(index);
    const strokeMaterial = new RawShaderMaterial({
      uniforms: { uHalf: { value: half }, uRadius: { value: WIDTH / 2 }, uPixel: { value: (2 * half) / PX } },
      vertexShader: strokeVertex,
      fragmentShader: strokeFragment,
      blending: CustomBlending,
      blendSrc: OneFactor, // dst = src + dst * (1 - src), as canvas source-over
      blendDst: OneMinusSrcAlphaFactor,
      depthTest: false,
      depthWrite: false,
    });
    const strokes = new Mesh(geometry, strokeMaterial);
    strokes.frustumCulled = false;
    const strokeScene = new Scene();
    strokeScene.add(strokes);

    // Weathering: dst *= 1 - amount, as canvas destination-out.
    const tri = new BufferGeometry();
    tri.setAttribute("position", new BufferAttribute(new Float32Array([-1, -1, 3, -1, -1, 3]), 2));
    const fadeMaterial = new RawShaderMaterial({
      uniforms: { uAmount: { value: 0.012 } },
      vertexShader: fadeVertex,
      fragmentShader: fadeFragment,
      blending: CustomBlending,
      blendSrc: ZeroFactor,
      blendDst: OneMinusSrcAlphaFactor,
      depthTest: false,
      depthWrite: false,
    });
    const fade = new Mesh(tri, fadeMaterial);
    fade.frustumCulled = false;
    const fadeScene = new Scene();
    fadeScene.add(fade);

    const material = new MeshStandardMaterial({
      color: RUBBER,
      alphaMap: target.texture,
      transparent: true,
      roughness: 0.55, // rubber polishes the surface a little
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    return {
      target,
      geometry,
      corners,
      segs,
      alphas,
      strokes,
      strokeScene,
      strokeMaterial,
      tri,
      fadeMaterial,
      fadeScene,
      material,
      camera: new Camera(), // unused by the shaders, but render() wants one
      last: [] as ({ x: number; z: number } | null)[],
      fade: 0,
      cleared: false,
    };
  }, [half]);

  useEffect(
    () => () => {
      const s = state;
      s.target.dispose();
      s.geometry.dispose();
      s.strokeMaterial.dispose();
      s.tri.dispose();
      s.fadeMaterial.dispose();
      s.material.dispose();
    },
    [state],
  );

  useFrame((_, delta) => {
    const s = state;
    const r = WIDTH / 2;
    let n = 0;
    tyres.current.forEach((t, i) => {
      const prev = s.last[i];
      s.last[i] = { x: t.x, z: t.z };
      // Nothing across a long gap (a hidden tab, a hitch): that would be a chord.
      if (!prev || t.strength < 0.05 || n >= MAX_STROKES) return;
      const dx = t.x - prev.x;
      const dz = t.z - prev.z;
      const len = Math.hypot(dx, dz);
      if (len > 1) return;
      // The quad: the segment widened by the radius on every side.
      const ux = len > 1e-6 ? dx / len : 1;
      const uz = len > 1e-6 ? dz / len : 0;
      const ax = prev.x - ux * r;
      const az = prev.z - uz * r;
      const bx = t.x + ux * r;
      const bz = t.z + uz * r;
      const px = -uz * r;
      const pz = ux * r;
      const c = s.corners;
      const o = n * 8;
      c[o] = ax + px;
      c[o + 1] = az + pz;
      c[o + 2] = bx + px;
      c[o + 3] = bz + pz;
      c[o + 4] = bx - px;
      c[o + 5] = bz - pz;
      c[o + 6] = ax - px;
      c[o + 7] = az - pz;
      for (let k = 0; k < 4; k++) {
        s.segs.set([prev.x, prev.z, t.x, t.z], (n * 4 + k) * 4);
        s.alphas[n * 4 + k] = 0.16 * t.strength;
      }
      n++;
    });

    s.fade += delta;
    const weather = s.fade > 2;
    if (weather) s.fade = 0;
    if (!n && !weather && s.cleared) return;

    const prevTarget = gl.getRenderTarget();
    const prevAutoClear = gl.autoClear;
    gl.autoClear = false;
    gl.setRenderTarget(s.target);
    if (!s.cleared) {
      gl.getClearColor(clearColor);
      const alpha = gl.getClearAlpha();
      gl.setClearColor(0x000000, 0);
      gl.clear(true, false, false);
      gl.setClearColor(clearColor, alpha);
      s.cleared = true;
    }
    if (n) {
      const g = s.geometry;
      g.attributes.position.needsUpdate = true;
      g.attributes.aSeg.needsUpdate = true;
      g.attributes.aAlpha.needsUpdate = true;
      g.setDrawRange(0, n * 6);
      gl.render(s.strokeScene, s.camera);
    }
    // A whisper of every mark rubbed out every couple of seconds.
    if (weather) gl.render(s.fadeScene, s.camera);
    gl.setRenderTarget(prevTarget);
    gl.autoClear = prevAutoClear;
  });

  // Texture v runs up the render target, which is -z on the ground after the
  // plane is laid flat (rotation -90° about x maps the plane's +y to -z); the
  // stroke shader writes z to clip -y to match.
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0.006} material={state.material} receiveShadow renderOrder={1}>
      <planeGeometry args={[2 * half, 2 * half]} />
    </mesh>
  );
}
