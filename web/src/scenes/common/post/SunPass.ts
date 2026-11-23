import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Camera,
  Color,
  HalfFloatType,
  Mesh,
  RawShaderMaterial,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type PerspectiveCamera,
  type Texture,
  type WebGLRenderer,
} from "three";
import { Pass } from "postprocessing";
import { fx } from "./fx";

// The sun as a camera sees it, drawn into the HDR frame before tone mapping.
// The HDRI skies have their sun clipped out (see hdri.ts), so it's drawn back
// in as a hot disc, and the lens and the air add the rest:
//
// - glare: a bloom, starburst streaks, a horizontal light band and a chain
//   of ghosts reflected through the middle of the frame. It doesn't stop dead
//   at the frame's edge: with the sun just out of shot the streaks, a veil of
//   haze and the ghosts still reach in, fading out as the camera turns further
//   away (as a real lens's do over a few tens of degrees);
// - god rays: shafts of light where trees, buildings, the car or dark cloud
//   break up the sky around the sun, from a radial blur of the sky toward the
//   sun (Mitchell, "Volumetric Light Scattering as a Post-Process", GPU Gems 3).
//
// Sky is wherever the depth buffer is still at the far plane. The sun's
// visibility for the glare comes from the same test, on the GPU, so nothing is
// read back.

const RAY_SAMPLES = 48;
const RAY_SCALE = 4; // rays are worked out at 1/4 of the frame's resolution
const OUT_OF_FRAME = (32 * Math.PI) / 180; // the glare is gone with the sun this far outside the frame
const GAIN = 1.2; // the glare's brightness in the HDR frame, before tone mapping
const RAYS = 1.4;

// A -1..1 quad, drawn straight to clip space.
const quad = new BufferGeometry();
quad.setAttribute("position", new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
quad.setAttribute("uv", new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
quad.setIndex([0, 1, 2, 0, 2, 3]);

const fullVertex = /* glsl */ `
  precision highp float;
  attribute vec3 position;
  attribute vec2 uv;
  varying vec2 vUV;
  void main() {
    vUV = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const raysFragment = /* glsl */ `
  precision highp float;
  uniform sampler2D uColor;
  uniform sampler2D uDepth;
  uniform vec2 uSun;     // the sun in uv (may lie outside 0..1)
  uniform float uAspect; // width / height
  varying vec2 vUV;
  // Light from the sky at uv: open sky near the sun, brighter where the sky
  // is brighter, so dark cloud blocks rays as well as solid things do.
  float light(vec2 uv) {
    uv = clamp(uv, 0.001, 0.999);
    float sky = step(0.99999, texture2D(uDepth, uv).r);
    float l = dot(texture2D(uColor, uv).rgb, vec3(0.2126, 0.7152, 0.0722));
    l = l / (1.0 + l);
    float d = length((uv - uSun) * vec2(uAspect, 1.0));
    return sky * (0.3 + 0.7 * smoothstep(0.3, 0.8, l)) * exp(-d * 7.0);
  }
  void main() {
    vec2 uv = vUV;
    vec2 step = (uv - uSun) * (0.85 / float(${RAY_SAMPLES}));
    // Interleaved gradient noise staggers each pixel's samples, trading
    // banding for fine grain the upscale smooths out.
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
  uniform vec3 uTint;
  varying vec2 vUV;
  void main() {
    gl_FragColor = vec4(uTint * texture2D(uRays, vUV).r, 1.0);
  }
`;

const glareVertex = /* glsl */ `
  precision highp float;
  uniform vec2 uCentre;
  uniform vec2 uScale;
  uniform vec2 uSunUV;
  uniform vec2 uTexel; // one pixel of the frame, in uv
  uniform sampler2D uDepth;
  attribute vec3 position;
  varying vec2 vP;
  varying vec2 vNdc;
  varying float vVis;
  float sky(vec2 at) { return step(0.99999, texture2D(uDepth, clamp(uSunUV + at * uTexel, 0.001, 0.999)).r); }
  void main() {
    vP = position.xy;
    // How much of the sun shows: nine taps of the sky across its disc.
    // Off-frame, the taps clamp to the frame's edge nearest the sun: open sky
    // there is taken to mean the sun is clear too.
    vVis = (sky(vec2(-6.0, -6.0)) + sky(vec2(0.0, -6.0)) + sky(vec2(6.0, -6.0)) +
            sky(vec2(-6.0, 0.0)) + sky(vec2(0.0, 0.0)) + sky(vec2(6.0, 0.0)) +
            sky(vec2(-6.0, 6.0)) + sky(vec2(0.0, 6.0)) + sky(vec2(6.0, 6.0))) / 9.0;
    gl_Position = vec4(position.xy * uScale + uCentre, 0.0, 1.0);
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
  uniform sampler2D uDepth;
  uniform vec2 uTexel;
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
    float vis = vVis;
    if (uKind == 0) {
      // The disc itself, cut off pixel by pixel by anything in front of it.
      vis = step(0.99999, texture2D(uDepth, gl_FragCoord.xy * uTexel).r);
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
    gl_FragColor = vec4(c * v * uIntensity * vis, 1.0);
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
const DISC_HDR = 12; // the disc is far brighter than anything else in the frame, so it blooms

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const view = new Vector3();

export class SunPass extends Pass {
  dir = new Vector3(0, 1, 0); // toward the sun in world space, set each frame by PostFX
  private camera3: PerspectiveCamera;
  private depth: Texture | null = null;
  private rays = new WebGLRenderTarget(1, 1, { depthBuffer: false, type: HalfFloatType });
  private raysMaterial: RawShaderMaterial;
  private composite: RawShaderMaterial;
  private glare: RawShaderMaterial;
  private colors = ELEMENTS.map((e) => new Color(e.color));
  private quadScene = new Scene();
  private quadMesh: Mesh;
  private quadCamera = new Camera();

  constructor(camera: PerspectiveCamera) {
    super("SunPass");
    this.camera3 = camera;
    this.needsSwap = false; // draws over the frame in place
    this.needsDepthTexture = true;
    this.raysMaterial = new RawShaderMaterial({
      uniforms: { uColor: { value: null }, uDepth: { value: null }, uSun: { value: new Vector2() }, uAspect: { value: 1 } },
      vertexShader: fullVertex,
      fragmentShader: raysFragment,
      depthTest: false,
      depthWrite: false,
    });
    this.composite = new RawShaderMaterial({
      uniforms: { uRays: { value: this.rays.texture }, uTint: { value: new Color() } },
      vertexShader: fullVertex,
      fragmentShader: compositeFragment,
      blending: AdditiveBlending,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.glare = new RawShaderMaterial({
      uniforms: {
        uCentre: { value: new Vector2() },
        uScale: { value: new Vector2() },
        uRot: { value: 0 },
        uKind: { value: 0 },
        uColor: { value: new Color() },
        uIntensity: { value: 0 },
        uSun: { value: new Vector2() },
        uSunUV: { value: new Vector2() },
        uAspect: { value: 1 },
        uTexel: { value: new Vector2() },
        uDepth: { value: null },
      },
      vertexShader: glareVertex,
      fragmentShader: glareFragment,
      blending: AdditiveBlending,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.quadMesh = new Mesh(quad, this.glare);
    this.quadMesh.frustumCulled = false;
    this.quadScene.add(this.quadMesh);
  }

  override setDepthTexture(depthTexture: Texture) {
    this.depth = depthTexture;
  }

  override setSize(width: number, height: number) {
    this.rays.setSize(Math.max(1, Math.round(width / RAY_SCALE)), Math.max(1, Math.round(height / RAY_SCALE)));
  }

  private draw(renderer: WebGLRenderer, m: RawShaderMaterial) {
    this.quadMesh.material = m;
    renderer.render(this.quadScene, this.quadCamera);
  }

  override render(renderer: WebGLRenderer, inputBuffer: WebGLRenderTarget) {
    const sun = fx.sun;
    const camera = this.camera3;
    if (!sun || sun.strength <= 0 || !this.depth) return;

    // Where the sun is relative to the frame, and how far outside it.
    view.copy(this.dir).transformDirection(camera.matrixWorldInverse);
    if (view.z > -0.05) return; // beside or behind the camera
    const ty = Math.tan((camera.fov * Math.PI) / 360) / camera.zoom;
    const tx = ty * camera.aspect;
    let x = view.x / -view.z / tx;
    let y = view.y / -view.z / ty;
    const outside = Math.max(0, Math.atan(Math.abs(view.x / view.z)) - Math.atan(tx), Math.atan(Math.abs(view.y / view.z)) - Math.atan(ty));
    const fade = sun.strength * (1 - smoothstep(0, OUT_OF_FRAME, outside)) ** 2;
    if (fade < 0.003) return;
    const far = Math.max(Math.abs(x), Math.abs(y));
    if (far > 3.5) {
      x *= 3.5 / far;
      y *= 3.5 / far;
    }
    const w = inputBuffer.width;
    const h = inputBuffer.height;

    // God rays, worked out small and laid over the frame.
    const r = this.raysMaterial.uniforms;
    r.uColor.value = inputBuffer.texture;
    r.uDepth.value = this.depth;
    r.uSun.value.set(x * 0.5 + 0.5, y * 0.5 + 0.5);
    r.uAspect.value = w / h;
    renderer.setRenderTarget(this.rays);
    this.draw(renderer, this.raysMaterial);
    renderer.setRenderTarget(inputBuffer);
    this.composite.uniforms.uTint.value.copy(sun.color).multiplyScalar(RAYS * fade);
    this.draw(renderer, this.composite);

    // Glare.
    const u = this.glare.uniforms;
    u.uSun.value.set(x, y);
    u.uSunUV.value.set(x * 0.5 + 0.5, y * 0.5 + 0.5);
    u.uAspect.value = w / h;
    u.uTexel.value.set(1 / w, 1 / h);
    u.uDepth.value = this.depth;
    const aspect = h / w;
    const element = (kind: number, cx: number, cy: number, sx: number, sy: number, c: Color, intensity: number, rot: number) => {
      u.uKind.value = kind;
      u.uCentre.value.set(cx, cy);
      u.uScale.value.set(sx, sy);
      u.uRot.value = rot;
      u.uColor.value.copy(c);
      u.uIntensity.value = intensity;
      this.glare.uniformsNeedUpdate = true;
      this.draw(renderer, this.glare);
    };
    ELEMENTS.forEach((el, i) => {
      const intensity = el.intensity * fade * GAIN;
      if (el.kind === 7) element(7, 0, 0, 1, 1, this.colors[i], intensity, 0);
      else
        element(
          el.kind,
          x - 2 * x * el.at,
          y - 2 * y * el.at,
          el.size[0] * 2 * aspect,
          el.size[1] * 2,
          this.colors[i],
          intensity,
          el.spin ? x * 0.6 + y * 0.4 : 0,
        );
    });
    // Then the disc itself, over its own bloom.
    element(0, x, y, DISC_SIZE * 2 * aspect, DISC_SIZE * 2, DISC_COLOR, sun.strength * DISC_HDR, 0);
  }

  override dispose() {
    this.rays.dispose();
    this.raysMaterial.dispose();
    this.composite.dispose();
    this.glare.dispose();
  }
}
