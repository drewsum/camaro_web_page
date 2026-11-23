import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Color, HalfFloatType, type PerspectiveCamera, type Scene, type WebGLRenderer } from "three";
import { BloomEffect, EffectComposer, EffectPass, RenderPass, ToneMappingEffect, ToneMappingMode } from "postprocessing";
import { N8AOPostPass } from "n8ao";
import { AtmosphereEffect, MotionBlurEffect } from "./effects";
import { fx, type PostSettings } from "./fx";
import { SunPass } from "./SunPass";
import { fitSunShadows, softenShadows } from "./sunShadows";

// The camera's side of the picture, shared by every scene but Outrun (which
// has its own): the scene is rendered into a high-dynamic-range buffer and
// then, in order,
//   ambient occlusion  darkens creases, wheel wells and the ground under things
//   atmosphere         sun-tinted aerial haze, and heat shimmer where it's hot
//   motion blur        the world streaming past, spinning wheels
//   sun                the sun disc, god rays and lens glare (SunPass)
//   bloom, tone map    bright highlights glow; AgX maps the light to the screen
// Scenes describe what they need in the scene list (PostSettings); the sun and
// the driving car report themselves through `fx`. Each frame it also fits the
// sun's shadows to the view and softens their edges (sunShadows.ts).

const SHUTTER = 1 / 60; // s

function build(gl: WebGLRenderer, scene: Scene, camera: PerspectiveCamera) {
  // Multisampling resolves into the half-float buffer; on a dense display
  // the pixels are small enough that 2x does as well as 4x.
  const composer = new EffectComposer(gl, { frameBufferType: HalfFloatType, multisampling: 4 });
  gl.autoClear = true; // the composer turns it off; other render-to-texture users rely on it
  const ao = new N8AOPostPass(scene, camera, 1, 1);
  ao.configuration.aoRadius = 1.6;
  ao.configuration.distanceFalloff = 0.6;
  ao.configuration.intensity = 3;
  ao.configuration.halfRes = true;
  ao.setQualityMode("Medium");
  const atmosphere = new AtmosphereEffect(camera);
  const motion = new MotionBlurEffect(camera);
  const motionPass = new EffectPass(camera, motion);
  const sun = new SunPass(camera);
  const bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 1.6, luminanceSmoothing: 0.5, intensity: 0.45, radius: 0.7 });
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(ao);
  composer.addPass(new EffectPass(camera, atmosphere));
  composer.addPass(motionPass);
  composer.addPass(sun);
  composer.addPass(new EffectPass(camera, bloom, tone));
  return { composer, atmosphere, motion, motionPass, glow: new Color(), frame: 0 };
}

export default function PostFX({ settings }: { settings: PostSettings }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Made and disposed in an effect, so each composer is used only while mounted.
  const [parts, setParts] = useState<ReturnType<typeof build> | null>(null);
  useEffect(() => {
    const p = build(gl, scene, camera);
    setParts(p);
    return () => p.composer.dispose();
  }, [gl, scene, camera]);

  useEffect(() => {
    if (!parts) return;
    parts.composer.setSize(size.width, size.height);
    parts.composer.multisampling = dpr >= 1.75 ? 2 : 4;
  }, [parts, size, dpr]);

  useFrame((state, delta) => {
    const p = parts;
    if (!p) {
      state.gl.render(scene, camera); // until the composer is ready
      return;
    }
    const s = settingsRef.current;

    fitSunShadows(scene, camera, p.frame);
    if (p.frame++ % 30 === 0) softenShadows(scene);

    // Atmosphere: only by day, tinted by the sun.
    const sun = fx.sun;
    if (sun) {
      const sky = 0.2126 * sun.horizon.r + 0.7152 * sun.horizon.g + 0.0722 * sun.horizon.b;
      p.glow.copy(sun.color).multiplyScalar(sky * 0.5 * sun.strength);
    }
    p.atmosphere.set(s.haze ?? 1, s.hazeDistance ?? 900, s.heatHaze ?? 0, sun?.dir ?? null, sun ? p.glow : null);

    // Motion blur: only while something is moving.
    const car = fx.car;
    const u = p.motion.uniforms;
    if (car) {
      u.get("uWorldVel")!.value.copy(car.travel).multiplyScalar(s.motionBlur ? -1 : 0);
      u.get("uCarVel")!.value.copy(car.velocity);
      u.get("uCarInv")!.value.copy(car.inverse);
      u.get("uCarMin")!.value.copy(car.box.min);
      u.get("uCarMax")!.value.copy(car.box.max);
      (u.get("uWheels")!.value as typeof car.wheels).forEach((w, i) => w.copy(car.wheels[i]));
      u.get("uAxis")!.value.copy(car.axis);
      u.get("uRadius")!.value = car.radius;
      u.get("uSpin")!.value.set(car.spin[0], car.spin[1]);
    }
    u.get("uShutter")!.value = SHUTTER;
    p.motionPass.enabled = !!car && (Math.abs(car.spin[0]) + Math.abs(car.spin[1]) > 1 || car.velocity.lengthSq() > 0.1 || (!!s.motionBlur && car.travel.lengthSq() > 0.1));

    gl.autoClear = false;
    p.composer.render(delta);
    gl.autoClear = true;
  }, 1);

  return null;
}
