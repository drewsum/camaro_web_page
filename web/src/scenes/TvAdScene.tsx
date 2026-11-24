import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { createPortal, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, RoundedBox, useFBO } from "@react-three/drei";
import {
  DefaultLoadingManager,
  ExtrudeGeometry,
  HalfFloatType,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Scene,
  Shape,
  type Group,
  type Object3D,
} from "three";
import type { SceneProps } from ".";
import { crtMaterial, type CrtUniforms } from "./tvad/crt";
import Commercial, { SHOTS, type AdState } from "./tvad/Commercial";
import {
  captionCanvas,
  dialTexture,
  drawCaption,
  grilleTexture,
  nameplateTexture,
  wallpaperTexture,
  walnutTexture,
} from "./tvad/textures";

// A 1968 TV commercial for the Camaro SS 396, playing on a colour set of the
// day in a living room. The view is fixed on the set, framed so the cabinet
// borders the screen whatever the window's shape.
//
// The commercial is a scene of its own (tvad/Commercial: the car at a made-up
// dealership, cut from several angles, ending on its 1968 price), rendered
// each frame into a small 4:3 target and shown on the tube through an analog
// CRT shader (tvad/crt): snow, smeared and drifting colour, ghosting, rolling.

// The cabinet, in metres; the room's origin is its centre.
const CAB_W = 1.0;
const CAB_H = 0.76;
const CAB_D = 0.5;
const FRONT = CAB_D / 2;
const SCREEN_W = 0.62;
const SCREEN_H = 0.465; // 4:3
const SCREEN_X = -0.12;
const SCREEN_Y = 0.02;
const PANEL_X = 0.355;
const FLOOR_Y = -CAB_H / 2 - 0.34;

const FOV = 30;
const PICTURE_W = 640;
const PICTURE_H = 480;

function roundRect(w: number, h: number, r: number, cx = 0, cy = 0) {
  const s = new Shape();
  const x = cx - w / 2;
  const y = cy - h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// The tube's face: bulging toward the viewer, most in the middle.
function tubeGeometry() {
  const g = new PlaneGeometry(SCREEN_W, SCREEN_H, 40, 30);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / (SCREEN_W / 2);
    const v = p.getY(i) / (SCREEN_H / 2);
    p.setZ(i, 0.022 * (1 - u * u * 0.85) * (1 - v * v * 0.85));
  }
  g.computeVertexNormals();
  return g;
}

// Holds the camera square on the set, as close as the window allows.
function useFixedView() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  useLayoutEffect(() => {
    const fov = camera.fov;
    camera.fov = FOV;
    const tan = Math.tan(((FOV / 2) * Math.PI) / 180);
    const aspect = size.width / size.height;
    const d = 1.03 * Math.max(CAB_H / 2 / tan, CAB_W / 2 / (tan * aspect)) + FRONT;
    camera.position.set(0, 0.03, d);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    return () => {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    };
  }, [camera, size]);
  return camera;
}

function visible(o: Object3D | null) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return !!o;
}

function TvSet({ crt }: { crt: ReturnType<typeof crtMaterial> }) {
  const mats = useMemo(() => {
    const walnut = walnutTexture();
    return {
      wood: new MeshStandardMaterial({ map: walnut, roughness: 0.42, metalness: 0 }),
      chrome: new MeshStandardMaterial({ color: "#d9d6cc", roughness: 0.22, metalness: 1 }),
      brass: new MeshStandardMaterial({ color: "#c9a457", roughness: 0.3, metalness: 1 }),
      panel: new MeshStandardMaterial({ color: "#3a3127", roughness: 0.6, metalness: 0.2 }),
      knob: new MeshStandardMaterial({ color: "#1c1a17", roughness: 0.35 }),
      backing: new MeshStandardMaterial({ color: "#050505", roughness: 0.9 }),
      grille: new MeshStandardMaterial({ map: grilleTexture(), roughness: 0.8 }),
      dial: new MeshStandardMaterial({ map: dialTexture(), roughness: 0.5 }),
      plate: new MeshStandardMaterial({ map: nameplateTexture(), roughness: 0.3, metalness: 0.6 }),
    };
  }, []);
  const bezel = useMemo(() => {
    const outer = roundRect(SCREEN_W + 0.075, SCREEN_H + 0.075, 0.075);
    outer.holes.push(roundRect(SCREEN_W - 0.004, SCREEN_H - 0.004, 0.055));
    return new ExtrudeGeometry(outer, { depth: 0.018, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 3, curveSegments: 12 });
  }, []);
  const tube = useMemo(tubeGeometry, []);
  const dial = useRef<Group>(null);
  useFrame(({ clock }) => {
    // Someone fiddles with the fine tuning now and then.
    if (dial.current) dial.current.rotation.z = Math.sin(clock.elapsedTime * 0.3) * 0.08;
  });

  return (
    <group>
      <RoundedBox args={[CAB_W, CAB_H, CAB_D]} radius={0.035} smoothness={4} material={mats.wood} />
      {/* Tube, its black surround and the chrome bezel. */}
      <mesh material={mats.backing} position={[SCREEN_X, SCREEN_Y, FRONT + 0.001]}>
        <planeGeometry args={[SCREEN_W + 0.07, SCREEN_H + 0.07]} />
      </mesh>
      <mesh geometry={tube} material={crt} position={[SCREEN_X, SCREEN_Y, FRONT + 0.004]} />
      <mesh geometry={bezel} material={mats.chrome} position={[SCREEN_X, SCREEN_Y, FRONT]} />
      <mesh material={mats.plate} position={[SCREEN_X, -CAB_H / 2 + 0.035, FRONT + 0.002]}>
        <planeGeometry args={[0.14, 0.035]} />
      </mesh>
      {/* The control panel: channel dial, two small knobs, speaker. */}
      <mesh material={mats.panel} position={[PANEL_X, 0, FRONT + 0.002]}>
        <planeGeometry args={[0.2, CAB_H - 0.09]} />
      </mesh>
      <mesh material={mats.dial} position={[PANEL_X, 0.19, FRONT + 0.004]}>
        <circleGeometry args={[0.072, 40]} />
      </mesh>
      <group ref={dial} position={[PANEL_X, 0.19, FRONT + 0.004]}>
        <mesh material={mats.knob} rotation-x={Math.PI / 2} position-z={0.02}>
          <cylinderGeometry args={[0.042, 0.046, 0.04, 32]} />
        </mesh>
        <mesh material={mats.chrome} rotation-x={Math.PI / 2} position-z={0.041}>
          <cylinderGeometry args={[0.03, 0.03, 0.004, 32]} />
        </mesh>
        <mesh material={mats.chrome} position={[0, 0.03, 0.044]}>
          <boxGeometry args={[0.006, 0.022, 0.004]} />
        </mesh>
      </group>
      {[-0.045, 0.045].map((dx) => (
        <group key={dx} position={[PANEL_X + dx, 0.04, FRONT + 0.004]}>
          <mesh material={mats.knob} rotation-x={Math.PI / 2} position-z={0.012}>
            <cylinderGeometry args={[0.022, 0.024, 0.024, 24]} />
          </mesh>
          <mesh material={mats.brass} rotation-x={Math.PI / 2} position-z={0.025}>
            <cylinderGeometry args={[0.014, 0.014, 0.003, 24]} />
          </mesh>
        </group>
      ))}
      <mesh material={mats.grille} position={[PANEL_X, -0.17, FRONT + 0.004]}>
        <planeGeometry args={[0.16, 0.26]} />
      </mesh>
      <mesh material={mats.brass} position={[PANEL_X, -0.305, FRONT + 0.004]}>
        <boxGeometry args={[0.16, 0.006, 0.004]} />
      </mesh>
      {/* Tapered legs with brass caps. */}
      {[
        [-0.4, -0.17],
        [0.4, -0.17],
        [-0.4, 0.17],
        [0.4, 0.17],
      ].map(([x, z]) => (
        <group key={`${x},${z}`} position={[x, -CAB_H / 2, z]} rotation={[z * 0.6, 0, -x * 0.25]}>
          <mesh material={mats.wood} position-y={-0.16}>
            <cylinderGeometry args={[0.022, 0.012, 0.32, 12]} />
          </mesh>
          <mesh material={mats.brass} position-y={-0.31}>
            <cylinderGeometry args={[0.012, 0.012, 0.04, 12]} />
          </mesh>
        </group>
      ))}
      {/* Rabbit ears. */}
      <group position={[0.1, CAB_H / 2, -0.05]}>
        <mesh material={mats.knob} position-y={0.02}>
          <sphereGeometry args={[0.06, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        {[-1, 1].map((side) => (
          <group key={side} position-y={0.05} rotation-z={side * 0.55} rotation-x={-0.15}>
            <mesh material={mats.chrome} position-y={0.3}>
              <cylinderGeometry args={[0.004, 0.006, 0.6, 8]} />
            </mesh>
            <mesh material={mats.chrome} position-y={0.6}>
              <sphereGeometry args={[0.009, 10, 8]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

function Room() {
  const mats = useMemo(
    () => ({
      wall: new MeshStandardMaterial({ map: wallpaperTexture(), roughness: 0.9 }),
      carpet: new MeshStandardMaterial({ color: "#7a5a2a", roughness: 1 }),
      skirting: new MeshStandardMaterial({ color: "#5a3a22", roughness: 0.6 }),
    }),
    [],
  );
  return (
    <>
      <mesh material={mats.wall} position={[0, 0.9, -0.55]}>
        <planeGeometry args={[9, 5]} />
      </mesh>
      <mesh material={mats.skirting} position={[0, FLOOR_Y + 0.06, -0.54]}>
        <boxGeometry args={[9, 0.12, 0.02]} />
      </mesh>
      <mesh material={mats.carpet} rotation-x={-Math.PI / 2} position={[0, FLOOR_Y, 1.5]}>
        <planeGeometry args={[9, 5]} />
      </mesh>
    </>
  );
}

export default function TvAdScene({ lightsOn, domeOn }: SceneProps) {
  useFixedView();

  // The broadcast: its own scene and camera, drawn into a small 4:3 picture.
  const adScene = useMemo(() => new Scene(), []);
  const adCamera = useMemo(() => new PerspectiveCamera(36, PICTURE_W / PICTURE_H, 0.1, 300), []);
  const picture = useFBO(PICTURE_W, PICTURE_H, { type: HalfFloatType, samples: 4 });
  const ad = useMemo<AdState>(() => ({ started: null, time: 0, shot: 0, into: 0 }), []);
  const crt = useMemo(() => crtMaterial(SCREEN_W, SCREEN_H), []);
  const u = crt.uniforms as unknown as CrtUniforms;
  const caption = useMemo(() => captionCanvas(), []);
  u.uPicture.value = picture.texture;
  u.uCaption.value = caption.texture;

  const glow = useRef<PointLight>(null);
  const screenAnchor = useRef<Object3D>(null);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const glitch = useRef({ until: 0, next: 6, roll: 0 });
  const gl = useThree((s) => s.gl);

  // The commercial is a scene of its own, which Precompile (App) never sees:
  // its shaders are compiled here the same way, in the background, before
  // it's first drawn, with the loading bar up meanwhile.
  const adReady = useRef(false);
  useEffect(() => {
    const item = "tvad:shaders";
    let ended = false;
    const end = () => {
      if (!ended) DefaultLoadingManager.itemEnd(item);
      ended = true;
    };
    DefaultLoadingManager.itemStart(item);
    let live = true;
    const frame = requestAnimationFrame(() => {
      const before = gl.getRenderTarget();
      let compiling: Promise<unknown>;
      try {
        gl.setRenderTarget(picture); // drawn into a target, as it will be
        compiling = gl.compileAsync(adScene, adCamera);
      } catch (e) {
        compiling = Promise.reject(e);
      } finally {
        gl.setRenderTarget(before);
      }
      compiling
        .catch((e) => console.warn("Precompiling the commercial's shaders failed:", e))
        .finally(() => {
          if (live) adReady.current = true;
          end();
        });
    });
    return () => {
      live = false;
      cancelAnimationFrame(frame);
      end();
    };
  }, [gl, picture, adScene, adCamera]);

  useFrame(({ clock }) => {
    const now = clock.elapsedTime;
    // The set is switched on the first time it's actually on view.
    if (ad.started === null && visible(screenAnchor.current)) ad.started = now;
    const on = ad.started === null ? 0 : now - ad.started;

    if (adReady.current) {
      const prev = gl.getRenderTarget();
      gl.setRenderTarget(picture);
      gl.render(adScene, adCamera);
      gl.setRenderTarget(prev);
    }

    u.uTime.value = now;
    u.uPower.value = Math.min(1, Math.max(0, (on - 0.3) / 1.4)) ** 0.6;
    // Snow bursts at every cut, more at the top of the loop (a channel flip),
    // and every few seconds the signal stumbles: tearing, colour, a roll.
    const cut = Math.exp(-ad.into * (ad.shot === 0 ? 5 : 16));
    u.uSnow.value = (ad.shot === 0 ? 0.9 : 0.4) * cut;
    const g = glitch.current;
    if (on > g.next) {
      g.until = on + 0.25 + Math.random() * 0.5;
      g.next = on + 4 + Math.random() * 7;
      g.roll = Math.random() < 0.35 ? 1 : 0;
    }
    const glitching = on < g.until;
    u.uGlitch.value += ((glitching ? 0.8 : 0) - u.uGlitch.value) * 0.25;
    const loopRoll = ad.shot === 0 && ad.into < 0.6 ? 1 - ad.into / 0.6 : 0;
    u.uRoll.value = loopRoll * 1.0 + (glitching && g.roll ? (on % 0.5) * 2 : 0);
    u.uHue.value = 0.28 * Math.sin(now * 0.23) + 0.12 * Math.sin(now * 0.71);
    u.uCaptionAlpha.value = Math.min(1, Math.max(0, (ad.into - 0.3) / 0.4));

    // Scanlines and phosphor triads at a pitch the display can resolve.
    const tan = Math.tan(((camera.fov / 2) * Math.PI) / 180);
    const dist = camera.position.z - FRONT;
    const pxHigh = (SCREEN_H / (2 * dist * tan)) * size.height * dpr;
    u.uLines.value = Math.min(262, Math.max(90, pxHigh / 3));
    u.uTriads.value = Math.min(420, Math.max(120, (pxHigh * (SCREEN_W / SCREEN_H)) / 3.2));

    // The picture lights the room, flickering with it.
    if (glow.current) glow.current.intensity = u.uPower.value * (5 + Math.sin(now * 13) * Math.sin(now * 7.3) + 2 * u.uSnow.value);
  });

  return (
    <>
      <color attach="background" args={["#0b0a09"]} />
      <Environment resolution={128} environmentIntensity={0.22}>
        <Lightformer form="rect" intensity={1.5} position={[-2, 2, 3]} scale={[2, 2, 1]} color="#ffd9a8" />
        <Lightformer form="rect" intensity={0.8} position={[0, 3, 1]} rotation-x={Math.PI / 2} scale={[4, 2, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[0, 0, 3]} scale={[1.2, 0.9, 1]} color="#b9d4ff" />
      </Environment>
      <ambientLight intensity={0.06} />
      {/* A table lamp off to the left, and the screen's own glow. */}
      <pointLight position={[-1.6, 0.7, 1.2]} intensity={5} distance={8} decay={2} color="#ffbf7a" />
      <pointLight ref={glow} position={[SCREEN_X, SCREEN_Y, 0.9]} distance={3} decay={2} color="#cfe0ff" />
      <Room />
      <object3D ref={screenAnchor} />
      <TvSet crt={crt} />
      {createPortal(
        <Commercial
          camera={adCamera}
          ad={ad}
          lightsOn={lightsOn}
          domeOn={domeOn}
          onShot={(i) => {
            drawCaption(caption.g, SHOTS[i].caption);
            caption.texture.needsUpdate = true;
          }}
        />,
        adScene,
        { camera: adCamera },
      )}
    </>
  );
}
