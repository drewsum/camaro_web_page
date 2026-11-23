import { useEffect, useMemo } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  FramebufferTexture,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  OneFactor,
  RawShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  ZeroFactor,
  type Camera,
  type PerspectiveCamera,
  type Scene,
  type WebGLRenderer,
} from "three";

// The sun as a camera sees it. The HDRI skies have their sun clipped out (see
// hdri.ts), so it's drawn back in here as a hot disc, and the lens and the air
// add the rest:
//
// - glare: a warm bloom, starburst streaks, a horizontal light band and a
//   chain of ghosts reflected through the middle of the frame. It doesn't stop
//   dead at the frame's edge: with the sun just out of shot the streaks, a
//   veil of haze and the ghosts still reach in, fading out as the camera turns
//   further away (as a real lens's do over a few tens of degrees);
// - god rays: shafts of light where trees, buildings, the car or dark cloud
//   break up the sky around the sun, from a radial blur of a sky mask toward
//   the sun (Mitchell, "Volumetric Light Scattering as a Post-Process", GPU
//   Gems 3).
//
// Everything is drawn from the anchor mesh's onBeforeRender, last in the main
// view's transparent pass, straight into the canvas. The sky mask is made
// without disturbing the picture: the canvas's alpha channel is set to 0, a
// quad at the far plane sets it to 1 wherever nothing nearer was drawn (the
// sky), the frame is copied, and the alpha is put back to 1. The copy's
// alpha is the mask and its colour lets dark cloud block rays too. The sun's
// own visibility for the glare is read from the same mask, on the GPU, so
// nothing is read back.

const RAY_SAMPLES = 48;
const RAY_SCALE = 4; // rays are worked out at 1/4 the canvas's resolution
const OUT_OF_FRAME = (32 * Math.PI) / 180; // glare is gone with the sun this far outside the frame

// A -1..1 quad.
const quad = new BufferGeometry();
quad.setAttribute("position", new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
quad.setAttribute("uv", new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
quad.setIndex([0, 1, 2, 0, 2, 3]);

// ---- Sky mask ----------------------------------------------------------------

const fullVertex = /* glsl */ `
  precision highp float;
  uniform float uDepth;
  attribute vec3 position;
  attribute vec2 uv;
  varying vec2 vUV;
  void main() {
    vUV = uv;
    gl_Position = vec4(position.xy, uDepth, 1.0);
  }
`;

// Writes only alpha (the blend keeps the colour as it was).
const alphaFragment = /* glsl */ `
  precision highp float;
  uniform float uAlpha;
  void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, uAlpha); }
`;

function alphaOnly(alpha: number, depth: number, depthTest: boolean) {
  return new RawShaderMaterial({
    uniforms: { uAlpha: { value: alpha }, uDepth: { value: depth } },
    vertexShader: fullVertex,
    fragmentShader: alphaFragment,
    blending: CustomBlending,
    blendSrc: ZeroFactor, // colour: keep
    blendDst: OneFactor,
    blendSrcAlpha: OneFactor, // alpha: replace
    blendDstAlpha: ZeroFactor,
    depthTest,
    depthWrite: false,
  });
}

// ---- God rays ----------------------------------------------------------------

const raysFragment = /* glsl */ `
  precision highp float;
  uniform sampler2D uMask;
  uniform vec2 uSun;     // the sun in uv (may lie outside 0..1)
  uniform float uAspect; // width / height
  varying vec2 vUV;
  // Light from the sky at uv: open sky near the sun, brighter where the sky
  // is brighter, so dark cloud blocks rays as well as solid things do.
  float light(vec2 uv) {
    vec4 m = texture2D(uMask, clamp(uv, 0.001, 0.999));
    float l = dot(m.rgb, vec3(0.2126, 0.7152, 0.0722));
    float d = length((uv - uSun) * vec2(uAspect, 1.0));
    return m.a * (0.3 + 0.7 * smoothstep(0.35, 0.9, l)) * exp(-d * 7.0);
  }
  void main() {
    vec2 uv = vUV;
    vec2 step = (uv - uSun) * (0.85 / float(${RAY_SAMPLES}));
    // Interleaved gradient noise staggers each pixel's samples, trading
    // banding for fine grain the blur and upscale smooth out.
    uv -= step * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float sum = 0.0;
    float fall = 1.0;
    for (int i = 0; i < ${RAY_SAMPLES}; i++) {
      sum += light(uv) * fall;
      fall *= 0.97;
      uv -= step;
    }
    gl_FragColor = vec4(vec3(sum / float(${RAY_SAMPLES})), 1.0);
  }
`;

const compositeFragment = /* glsl */ `
  precision highp float;
  uniform sampler2D uRays;
  uniform vec3 uColor;
  varying vec2 vUV;
  void main() {
    float r = texture2D(uRays, vUV).r;
    // A little noise against banding in the 8-bit canvas.
    float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
    gl_FragColor = vec4(uColor * r + n / 255.0, 1.0);
  }
`;

// ---- Glare -------------------------------------------------------------------

const glareVertex = /* glsl */ `
  precision highp float;
  uniform vec3 uCentre;
  uniform vec2 uScale;
  uniform vec2 uSunUV;
  uniform vec2 uTexel; // one canvas pixel in uv
  uniform sampler2D uMask;
  attribute vec3 position;
  varying vec2 vP;
  varying vec2 vNdc;
  varying float vVis;
  float sky(vec2 at) { return texture2D(uMask, clamp(uSunUV + at * uTexel, 0.001, 0.999)).a; }
  void main() {
    vP = position.xy;
    // How much of the sun shows: nine taps of the sky mask across its disc.
    // Off-frame, the taps clamp to the frame's edge nearest the sun: open sky
    // there is taken to mean the sun is clear too.
    vVis = (sky(vec2(-6.0, -6.0)) + sky(vec2(0.0, -6.0)) + sky(vec2(6.0, -6.0)) +
            sky(vec2(-6.0, 0.0)) + sky(vec2(0.0, 0.0)) + sky(vec2(6.0, 0.0)) +
            sky(vec2(-6.0, 6.0)) + sky(vec2(0.0, 6.0)) + sky(vec2(6.0, 6.0))) / 9.0;
    gl_Position = vec4(position.xy * uScale + uCentre.xy, uCentre.z, 1.0);
    vNdc = gl_Position.xy;
  }
`;

// One shader for every element, picked by uKind.
const glareFragment = /* glsl */ `
  precision highp float;
  uniform int uKind;
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uRot;
  uniform vec2 uSun;     // the sun in NDC, for the veil
  uniform float uAspect;
  varying vec2 vP;
  varying vec2 vNdc;
  varying float vVis;
  float ray(float a, float n, float sharp) { return pow(abs(cos(a * n)), sharp); }
  void main() {
    vec2 p = vP;
    float r = length(p);
    float a = atan(p.y, p.x) + uRot;
    vec3 c = uColor;
    float v = 0.0;
    if (uKind == 0) {
      // The disc itself: a white-hot core with a thin warm corona.
      v = smoothstep(0.42, 0.36, r) * 1.6 + exp(-r * 5.0) * 0.6;
      v *= 1.0 - smoothstep(0.8, 1.0, r);
    } else if (uKind == 1) {
      // Bloom: a tight hot glow inside a broad soft one.
      v = exp(-r * 9.0) * 0.8 + exp(-r * r * 5.0) * 0.35;
      v *= 1.0 - smoothstep(0.7, 1.0, r);
    } else if (uKind == 2) {
      // Starburst: six long diffraction spikes, six fainter between them and
      // a fine fringe of short rays, all falling off from the middle.
      float s = ray(a, 3.0, 400.0) + 0.45 * ray(a + 0.5236, 3.0, 600.0);
      s += 0.25 * pow(0.5 + 0.5 * sin(a * 41.0) * sin(a * 23.0 + 1.7), 12.0);
      float fall = exp(-r * 3.2) * (1.0 - smoothstep(0.6, 1.0, r));
      v = s * fall + exp(-r * 18.0) * 0.4;
    } else if (uKind == 3) {
      // A horizontal light band, as an anamorphic lens streaks a bright light.
      v = exp(-p.y * p.y * 30.0) * pow(1.0 - abs(p.x), 3.0);
    } else if (uKind == 4) {
      // A ghost the shape of the aperture: a soft hexagon with a brighter rim.
      vec2 q = abs(p);
      float h = max(q.x * 0.866 + q.y * 0.5, q.y);
      v = smoothstep(1.0, 0.92, h) * (0.55 + 0.45 * smoothstep(0.6, 0.95, h));
    } else if (uKind == 5) {
      // A round ghost, brighter toward its edge.
      v = smoothstep(1.0, 0.9, r) * (0.4 + 0.6 * r * r);
    } else if (uKind == 6) {
      // A faint rainbow ring around the middle of the frame.
      float band = smoothstep(0.78, 0.88, r) * smoothstep(1.0, 0.9, r);
      c = vec3(smoothstep(0.86, 0.96, r), smoothstep(0.82, 0.9, r) * smoothstep(0.99, 0.9, r), smoothstep(0.9, 0.8, r));
      v = band;
    } else {
      // Veiling glare: haze over the whole frame, thickest toward the sun,
      // in shot or just out of it.
      float d = length((vNdc - uSun) * vec2(uAspect, 1.0)) * 0.5;
      v = exp(-d * 3.0) * 0.7 + exp(-d * 0.9) * 0.3;
    }
    gl_FragColor = vec4(c * v * uIntensity * vVis, 1.0);
  }
`;

interface Element {
  kind: number;
  at: number; // along the line from the sun (0) through the middle of the frame (0.5) to its mirror (1)
  size: [number, number]; // half-size as a fraction of the frame's height
  color: string;
  intensity: number;
  spin?: boolean; // turns with the sun's place in the frame, as a starburst does
}

const ELEMENTS: Element[] = [
  { kind: 7, at: 0, size: [0, 0], color: "#ffe6c4", intensity: 0.04 }, // full frame
  { kind: 1, at: 0, size: [0.5, 0.5], color: "#ffd9a8", intensity: 0.22 },
  { kind: 2, at: 0, size: [0.55, 0.55], color: "#fff1dc", intensity: 0.6, spin: true },
  { kind: 3, at: 0, size: [1.6, 0.03], color: "#b8cbff", intensity: 0.3 },
  { kind: 4, at: 0.22, size: [0.035, 0.035], color: "#8fb7ff", intensity: 0.14 },
  { kind: 5, at: 0.42, size: [0.018, 0.018], color: "#ffb07a", intensity: 0.22 },
  { kind: 4, at: 0.68, size: [0.07, 0.07], color: "#9dffb8", intensity: 0.07 },
  { kind: 5, at: 0.82, size: [0.025, 0.025], color: "#ffd38a", intensity: 0.14 },
  { kind: 4, at: 1.05, size: [0.12, 0.12], color: "#7f9cff", intensity: 0.05 },
  { kind: 5, at: 1.3, size: [0.05, 0.05], color: "#ff9a6a", intensity: 0.08 },
  { kind: 6, at: 0.5, size: [0.42, 0.42], color: "#ffffff", intensity: 0.03 },
];
const DISC_SIZE = 0.022;
const DISC_COLOR = new Color("#fff6e6");
const RAYS = 0.6; // god-ray brightness at full strength
const WHITE = new Color(1, 1, 1);

const viewport = new Vector4();
const view = new Vector3();
const corner = new Vector2();
// renderBufferDirect draws the whole geometry when given no group (typed as required).
const NO_GROUP = null as unknown as Parameters<WebGLRenderer["renderBufferDirect"]>[5];

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export default function SunGlare({
  sun,
  color = WHITE,
  strength = 1,
  rays = 1,
}: {
  sun: Vector3; // unit direction toward the sun
  color?: Color; // the sunlight's colour, tinting the god rays
  strength?: number; // 0..1, how hard the sun is (scales everything)
  rays?: number; // god rays' share of that
}) {
  const state = useMemo(() => {
    const maskOff = alphaOnly(0, 0, false);
    const maskSky = alphaOnly(1, 0.999999, true); // just inside the far plane, behind everything drawn
    const maskOn = alphaOnly(1, 0, false);
    const target = new WebGLRenderTarget(1, 1, { depthBuffer: false });
    const raysMaterial = new RawShaderMaterial({
      uniforms: { uMask: { value: null }, uSun: { value: new Vector2() }, uAspect: { value: 1 }, uDepth: { value: 0 } },
      vertexShader: fullVertex,
      fragmentShader: raysFragment,
      depthTest: false,
      depthWrite: false,
    });
    const composite = new RawShaderMaterial({
      uniforms: { uRays: { value: target.texture }, uColor: { value: new Color() }, uDepth: { value: 0 } },
      vertexShader: fullVertex,
      fragmentShader: compositeFragment,
      blending: AdditiveBlending,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const glareMaterial = (depthTest: boolean) =>
      new RawShaderMaterial({
        uniforms: {
          uCentre: { value: new Vector3() },
          uScale: { value: new Vector2() },
          uRot: { value: 0 },
          uKind: { value: 0 },
          uColor: { value: new Color() },
          uIntensity: { value: 0 },
          uSun: { value: new Vector2() },
          uSunUV: { value: new Vector2() },
          uAspect: { value: 1 },
          uTexel: { value: new Vector2() },
          uMask: { value: null },
        },
        vertexShader: glareVertex,
        fragmentShader: glareFragment,
        blending: AdditiveBlending,
        transparent: true,
        depthTest,
        depthWrite: false,
      });
    // The disc is depth tested so a tree or a roof edge cuts it off sharply;
    // the lens's glare lies over everything.
    const disc = glareMaterial(true);
    const glare = glareMaterial(false);
    const colors = ELEMENTS.map((e) => new Color(e.color));

    // Draws nothing itself: it only marks the moment after everything else is
    // drawn (last in the transparent pass).
    const anchor = new Mesh(quad, new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
    anchor.frustumCulled = false;
    anchor.renderOrder = Infinity;
    return { maskOff, maskSky, maskOn, mask: null as FramebufferTexture | null, target, raysMaterial, composite, disc, glare, colors, anchor };
  }, []);

  useEffect(() => {
    const s = state;
    const draw = (renderer: WebGLRenderer, scene: Scene, camera: Camera, m: RawShaderMaterial) =>
      renderer.renderBufferDirect(camera, scene, quad, m, s.anchor, NO_GROUP);

    s.anchor.onBeforeRender = (renderer: WebGLRenderer, scene: Scene, cam: Camera) => {
      // Only the main view: not the contact shadows' or anything else's
      // render of the scene into a texture.
      const camera = cam as PerspectiveCamera;
      if (strength <= 0 || !camera.isPerspectiveCamera || renderer.getRenderTarget() !== null) return;
      renderer.getCurrentViewport(viewport);
      const w = viewport.z;
      const h = viewport.w;

      // Where the sun is relative to the frame, and how far outside it.
      view.copy(sun).transformDirection(camera.matrixWorldInverse);
      if (view.z > -0.05) return; // beside or behind the camera
      const ty = Math.tan((camera.fov * Math.PI) / 360) / camera.zoom;
      const tx = ty * camera.aspect;
      let x = view.x / -view.z / tx;
      let y = view.y / -view.z / ty;
      const outside = Math.max(0, Math.atan(Math.abs(view.x / view.z)) - Math.atan(tx), Math.atan(Math.abs(view.y / view.z)) - Math.atan(ty));
      const fade = strength * (1 - smoothstep(0, OUT_OF_FRAME, outside)) ** 2;
      if (fade < 0.003) return;
      const far = Math.max(Math.abs(x), Math.abs(y));
      if (far > 3.5) {
        x *= 3.5 / far;
        y *= 3.5 / far;
      }
      // The disc's depth: 90% of the way to the far plane.
      const e = camera.projectionMatrix.elements;
      const dz = -camera.far * 0.9;
      const depth = (e[10] * dz + e[14]) / -dz;

      // Sky mask, into the canvas's alpha and out again.
      if (!s.mask || s.mask.image.width !== w || s.mask.image.height !== h) {
        s.mask?.dispose();
        s.mask = new FramebufferTexture(w, h);
        s.mask.minFilter = s.mask.magFilter = LinearFilter;
        s.target.setSize(Math.max(1, Math.round(w / RAY_SCALE)), Math.max(1, Math.round(h / RAY_SCALE)));
      }
      draw(renderer, scene, camera, s.maskOff);
      draw(renderer, scene, camera, s.maskSky);
      renderer.copyFramebufferToTexture(s.mask, corner.set(viewport.x, viewport.y));
      draw(renderer, scene, camera, s.maskOn);

      // God rays.
      if (rays > 0) {
        const r = s.raysMaterial.uniforms;
        r.uMask.value = s.mask;
        r.uSun.value.set(x * 0.5 + 0.5, y * 0.5 + 0.5);
        r.uAspect.value = w / h;
        renderer.setRenderTarget(s.target);
        draw(renderer, scene, camera, s.raysMaterial);
        renderer.setRenderTarget(null);
        s.composite.uniforms.uColor.value.copy(color).multiplyScalar(RAYS * rays * fade);
        draw(renderer, scene, camera, s.composite);
      }

      // Glare.
      const aspect = h / w;
      const element = (m: RawShaderMaterial, kind: number, cx: number, cy: number, sx: number, sy: number, c: Color, intensity: number, rot: number) => {
        const u = m.uniforms;
        u.uKind.value = kind;
        u.uCentre.value.set(cx, cy, depth);
        u.uScale.value.set(sx, sy);
        u.uRot.value = rot;
        u.uColor.value.copy(c);
        u.uIntensity.value = intensity;
        u.uSun.value.set(x, y);
        u.uSunUV.value.set(x * 0.5 + 0.5, y * 0.5 + 0.5);
        u.uAspect.value = w / h;
        u.uTexel.value.set(1 / w, 1 / h);
        u.uMask.value = s.mask;
        m.uniformsNeedUpdate = true;
        draw(renderer, scene, camera, m);
      };
      ELEMENTS.forEach((el, i) => {
        if (el.kind === 7) element(s.glare, 7, 0, 0, 1, 1, s.colors[i], el.intensity * fade, 0);
        else
          element(
            s.glare,
            el.kind,
            x - 2 * x * el.at,
            y - 2 * y * el.at,
            el.size[0] * 2 * aspect,
            el.size[1] * 2,
            s.colors[i],
            el.intensity * fade,
            el.spin ? x * 0.6 + y * 0.4 : 0,
          );
      });
      // Then the disc itself, over its own bloom.
      element(s.disc, 0, x, y, DISC_SIZE * 2 * aspect, DISC_SIZE * 2, DISC_COLOR, strength, 0);
    };
  }, [state, sun, color, strength, rays]);

  useEffect(
    () => () => {
      const s = state;
      s.mask?.dispose();
      s.target.dispose();
      for (const m of [s.maskOff, s.maskSky, s.maskOn, s.raysMaterial, s.composite, s.disc, s.glare, s.anchor.material]) m.dispose();
    },
    [state],
  );

  return <primitive object={state.anchor} />;
}
