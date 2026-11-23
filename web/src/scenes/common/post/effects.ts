import { Color, Matrix4, Uniform, Vector2, Vector3, type PerspectiveCamera } from "three";
import { Effect, EffectAttribute } from "postprocessing";

// Both effects rebuild each pixel's world position from the depth buffer.
const worldFromDepth = /* glsl */ `
  uniform mat4 uInvProj;
  uniform mat4 uCamWorld;
  vec3 worldAt(vec2 uv, float depth) {
    vec4 v = uInvProj * vec4(vec3(uv, depth) * 2.0 - 1.0, 1.0);
    return (uCamWorld * vec4(v.xyz / v.w, 1.0)).xyz;
  }
  vec3 rayAt(vec2 uv) {
    vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
    return normalize((uCamWorld * vec4(v.xyz / v.w, 0.0)).xyz);
  }
`;

function cameraUniforms() {
  return [
    ["uInvProj", new Uniform(new Matrix4())],
    ["uCamWorld", new Uniform(new Matrix4())],
  ] as [string, Uniform][];
}

function updateCamera(effect: Effect, camera: PerspectiveCamera) {
  effect.uniforms.get("uInvProj")!.value.copy(camera.projectionMatrixInverse);
  effect.uniforms.get("uCamWorld")!.value.copy(camera.matrixWorld);
}

// ---- Atmosphere ----------------------------------------------------------------

// Aerial perspective and heat shimmer.
//
// The scenes' fog already fades distance into the horizon's colour, the same
// in every direction. Real haze isn't: looking toward the sun it glows warm
// with sunlight scattered forward off the particles, and looking away it goes
// cooler and bluer. This adds that directional part on top of the fog.
//
// Heat haze: over hot ground, light skimming the surface bends through the
// rising air, so whatever lies near the horizon wobbles. Pixels whose line of
// sight runs close to level and far are displaced by a drifting ripple.
const atmosphereFragment = /* glsl */ `
  ${worldFromDepth}
  uniform vec3 uCamPos;
  uniform vec3 uSunDir;
  uniform vec3 uSunGlow; // sunlight colour × the sky's brightness
  uniform float uHaze;
  uniform float uHazeDistance;
  uniform float uHeat;

  void mainUv(inout vec2 uv) {
    if (uHeat <= 0.0) return;
    vec3 ray = rayAt(uv);
    float depth = readDepth(uv);
    float dist = depth >= 0.99999 ? 1e4 : length(worldAt(uv, depth) - uCamPos);
    // Strongest along the horizon, nothing nearby or looking down at the road.
    float w = exp(-abs(ray.y) / 0.02) * smoothstep(25.0, 160.0, dist) * uHeat;
    if (w < 0.001) return;
    float t = time;
    float y = uv.y * 140.0;
    float n = sin(y * 1.7 + t * 7.0 + sin(uv.x * 23.0 + t * 1.3) * 2.0) + 0.6 * sin(y * 3.9 - t * 11.0 + uv.x * 51.0);
    float m = sin(uv.x * 90.0 + t * 5.0 + y * 0.7);
    uv += vec2(m * 0.35, n) * w * texelSize * 1.4;
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
    outputColor = inputColor;
    if (uHaze <= 0.0 || depth >= 0.99999) return; // the sky has its own
    vec3 p = worldAt(uv, depth);
    vec3 ray = p - uCamPos;
    float dist = length(ray);
    vec3 dir = ray / dist;
    float h = (1.0 - exp(-dist / uHazeDistance)) * uHaze;
    float mu = dot(dir, uSunDir);
    // Forward scattering: a broad warm lobe with a brighter core round the sun.
    float forward = 0.6 * pow(max(mu, 0.0), 4.0) + 0.6 * pow(max(mu, 0.0), 24.0);
    vec3 c = inputColor.rgb + uSunGlow * forward * h;
    // Away from the sun the haze is cooler.
    c = mix(c, c * vec3(0.88, 0.95, 1.1), h * 0.6 * smoothstep(0.2, -0.6, mu));
    outputColor = vec4(c, inputColor.a);
  }
`;

export class AtmosphereEffect extends Effect {
  constructor(private camera: PerspectiveCamera) {
    super("AtmosphereEffect", atmosphereFragment, {
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map([
        ...cameraUniforms(),
        ["uCamPos", new Uniform(new Vector3())],
        ["uSunDir", new Uniform(new Vector3(0, 1, 0))],
        ["uSunGlow", new Uniform(new Color())],
        ["uHaze", new Uniform(0)],
        ["uHazeDistance", new Uniform(900)],
        ["uHeat", new Uniform(0)],
      ]),
    });
  }

  set(haze: number, hazeDistance: number, heat: number, sunDir: Vector3 | null, sunGlow: Color | null) {
    const u = this.uniforms;
    u.get("uHaze")!.value = sunDir ? haze : 0;
    u.get("uHazeDistance")!.value = hazeDistance;
    u.get("uHeat")!.value = heat;
    if (sunDir) u.get("uSunDir")!.value.copy(sunDir);
    if (sunGlow) u.get("uSunGlow")!.value.copy(sunGlow);
  }

  override update() {
    updateCamera(this, this.camera);
    this.uniforms.get("uCamPos")!.value.setFromMatrixPosition(this.camera.matrixWorld);
  }
}

// ---- Motion blur ---------------------------------------------------------------

// What a camera's shutter does to things moving across the frame: each pixel
// is smeared along the path its point travelled while the shutter was open.
// Nothing moves the camera here (it rides along with the car), so a point's
// motion comes from what it is:
// - the world, streaming past a car that a driving scene keeps at the origin;
// - the car's body, when the car itself moves through the scene (burnout);
// - a wheel, spinning about its axle.
// Each pixel's world position comes from the depth buffer; it's moved back by
// its velocity × the shutter time and projected again, and the frame is
// sampled along the line between. Samples from nearer things (the car, when
// smearing the road past it) are left out, so the car doesn't streak into
// the background.
const SAMPLES = 12;
const motionFragment = /* glsl */ `
  ${worldFromDepth}
  uniform mat4 uViewProj;
  uniform vec3 uWorldVel;
  uniform vec3 uCarVel;
  uniform mat4 uCarInv;
  uniform vec3 uCarMin;
  uniform vec3 uCarMax;
  uniform vec3 uWheels[4];
  uniform vec3 uAxis;
  uniform float uRadius;
  uniform vec2 uSpin;
  uniform float uShutter;
  uniform float uMaxBlur; // longest smear, as a fraction of the frame

  vec3 velocityAt(vec3 p) {
    vec3 local = (uCarInv * vec4(p, 1.0)).xyz;
    if (any(lessThan(local, uCarMin)) || any(greaterThan(local, uCarMax))) return uWorldVel;
    for (int i = 0; i < 4; i++) {
      vec3 r = p - uWheels[i];
      float along = dot(r, uAxis);
      vec3 radial = r - uAxis * along;
      if (abs(along) < 0.17 && length(radial) < uRadius * 1.03) {
        return uCarVel + cross(uAxis * (i < 2 ? uSpin.x : uSpin.y), radial);
      }
    }
    return uCarVel;
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
    outputColor = inputColor;
    if (depth >= 0.99999) return; // the sky is too far away to smear
    vec3 p = worldAt(uv, depth);
    vec3 v = velocityAt(p);
    if (dot(v, v) < 1e-4) return;
    vec4 c = uViewProj * vec4(p - v * uShutter, 1.0);
    vec2 d = uv - (c.xy / c.w * 0.5 + 0.5);
    float len = length(d * vec2(aspect, 1.0));
    if (len > uMaxBlur) d *= uMaxBlur / len;
    if (length(d * resolution) < 1.0) return;
    float z = getViewZ(depth);
    float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    vec4 sum = inputColor;
    float weight = 1.0;
    for (int i = 0; i < ${SAMPLES}; i++) {
      vec2 s = uv + d * ((float(i) + jitter) / float(${SAMPLES}) - 0.5);
      // Skip what's well in front of this pixel.
      if (getViewZ(textureLod(depthBuffer, s, 0.0).r) > z + 0.6) continue;
      sum += textureLod(inputBuffer, s, 0.0);
      weight += 1.0;
    }
    outputColor = sum / weight;
  }
`;

const tmp = new Matrix4();

export class MotionBlurEffect extends Effect {
  constructor(private camera: PerspectiveCamera) {
    super("MotionBlurEffect", motionFragment, {
      attributes: EffectAttribute.DEPTH | EffectAttribute.CONVOLUTION,
      uniforms: new Map([
        ...cameraUniforms(),
        ["uViewProj", new Uniform(new Matrix4())],
        ["uWorldVel", new Uniform(new Vector3())],
        ["uCarVel", new Uniform(new Vector3())],
        ["uCarInv", new Uniform(new Matrix4())],
        ["uCarMin", new Uniform(new Vector3(1, 1, 1))],
        ["uCarMax", new Uniform(new Vector3(-1, -1, -1))],
        ["uWheels", new Uniform([new Vector3(), new Vector3(), new Vector3(), new Vector3()])],
        ["uAxis", new Uniform(new Vector3(1, 0, 0))],
        ["uRadius", new Uniform(0.33)],
        ["uSpin", new Uniform(new Vector2())],
        ["uShutter", new Uniform(1 / 60)],
        ["uMaxBlur", new Uniform(0.06)],
      ]),
    });
  }

  override update() {
    updateCamera(this, this.camera);
    this.uniforms.get("uViewProj")!.value.copy(tmp.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse));
  }
}
