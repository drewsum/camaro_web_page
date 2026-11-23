import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  InstancedMesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  ShaderMaterial,
  Shape,
  SpotLight,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry as Geometry,
  type Material,
} from "three";
import CarContactShadows from "../components/CarContactShadows";
import CamaroModel from "../components/CamaroModel";
import MustangModel from "../components/MustangModel";
import ChargerModel from "../components/ChargerModel";
import type { SceneProps } from ".";
import { useCameraStart } from "./useCameraStart";
import { useExposure, useFarPlane } from "./common/renderer";
import { polyHavenHdri } from "./common/hdri";
import { NearestLights, useSceneSky } from "./common/night";
import SkyReflections from "./common/SkyReflections";
import GrassField from "./common/GrassField";
import Optional from "./common/Optional";
import Countryside, { type CountrysideProps } from "./common/Countryside";
import { ClassicCar } from "./common/classicCars";
import { mulberry32 } from "./common/periodic";
import { preloadPbr, usePbrMaterial } from "./common/pbr";
import { FILM_H, FILM_W, makeFilm } from "./drivein/film";

// A drive-in theater on a summer night: the Camaro parked up on its ramp in
// the second row, a Mustang, Charger and Challenger among the other cars, a
// speaker post by every spot, the projection booth and snack bar behind
// throwing a dusty beam over the lot onto a big screen, and tonight's feature
// playing on it (drivein/film.ts, an original B-movie). The screen's flicker
// lights the cars. Always night; every name here is made up.

const SKY = polyHavenHdri("kloofendal_48d_partly_cloudy_puresky");
const EXPOSURE = 1.1;
const FIELD = 8000;
const GRAVEL = "gravel_floor_02";
preloadPbr(GRAVEL);

// The screen, facing back down the lot (-z) toward the cars.
const SCREEN_Z = 46;
const SCREEN_W = 30;
const SCREEN_H = (SCREEN_W * FILM_H) / FILM_W;
const SCREEN_Y = 5 + SCREEN_H / 2;
const SCREEN = new Vector3(0, SCREEN_Y, SCREEN_Z);
const BOOTH = new Vector3(0, 4.3, -25.2); // the projector window

const COUNTRYSIDE: CountrysideProps = {
  seed: 58,
  centre: [0, 8],
  hills: { from: 260, to: 1400, height: 40 },
  trees: { from: 70, to: 650, woodlots: 9, hedgerows: 8, singles: 30 },
  clear: (x, z) => Math.abs(x) < 60 && z > -50 && z < 62,
  farm: { x: -280, z: -200, rotation: 0.9 },
  powerLine: { from: [-900, -70], to: [900, -70] },
  bales: { x: 220, z: 160, spread: 140, count: 18 },
};

// ---- The lot ----------------------------------------------------------------

// Rows of parking spots, each arced so every car faces the screen.
const ROWS = [-14, -7, 0, 7, 14];
const SPOT_W = 3.8;
interface Spot {
  x: number;
  z: number;
  yaw: number;
}
const SPOTS: Spot[] = ROWS.flatMap((row) => {
  const r = SCREEN_Z - row;
  const out: Spot[] = [];
  for (let k = -7; k <= 7; k++) {
    const x = k * SPOT_W;
    const z = row + (x * x) / (2 * r);
    out.push({ x, z, yaw: Math.atan2(-x, SCREEN_Z - z) });
  }
  return out;
});
const spotAt = (x: number, row: number) => SPOTS.find((s) => Math.abs(s.x - x) < 0.1 && Math.abs(s.z - row) < 3)!;

// Each spot has a ramp: a low hump the front wheels roll up onto, tipping
// the car's nose up toward the screen.
const REAR_AXLE = -1.35;
const WHEELBASE = 2.75;
const RAMP_H = 0.3;
const TILT = Math.atan(RAMP_H / WHEELBASE);

function rampGeometry() {
  const s = new Shape();
  // Profile in (z, y) relative to the car's origin.
  s.moveTo(-0.7, 0);
  s.lineTo(1.25, RAMP_H);
  s.lineTo(1.9, RAMP_H);
  s.lineTo(3.3, 0);
  const g = new ExtrudeGeometry(s, { depth: SPOT_W, bevelEnabled: false });
  g.translate(0, 0, -SPOT_W / 2);
  g.rotateY(-Math.PI / 2); // profile's x → world z, extrusion → world x
  return g;
}

// A car parked on its ramp at a spot, nose up.
function Parked({ spot, children }: { spot: Spot; children: ReactNode }) {
  return (
    <group position={[spot.x, 0, spot.z]} rotation-y={spot.yaw}>
      <group position-z={REAR_AXLE} rotation-x={-TILT}>
        <group position-z={-REAR_AXLE}>{children}</group>
      </group>
    </group>
  );
}

// A stand-in car's greenhouse: a sloped cabin profile in (z, y), extruded across.
function cabinGeometry() {
  const s = new Shape();
  s.moveTo(-1.55, 0);
  s.lineTo(0.75, 0);
  s.lineTo(0.15, 0.46);
  s.lineTo(-1.15, 0.46);
  const g = new ExtrudeGeometry(s, { depth: 1.46, bevelEnabled: false });
  g.translate(0, 0, -0.73);
  g.rotateY(-Math.PI / 2);
  return g;
}

function Instanced({ geometry, material, items, colors, shadows = true }: { geometry: Geometry; material: Material; items: Object3D[]; colors?: Color[]; shadows?: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current!;
    items.forEach((o, i) => {
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      if (colors) m.setColorAt(i, colors[i]);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items, colors]);
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} castShadow={shadows} receiveShadow />;
}

// Where a part sits in a spot's frame (x across, z along the car), as an Object3D.
function inSpot(spot: Spot, x: number, y: number, z: number, tilt = false) {
  const o = new Object3D();
  const c = Math.cos(spot.yaw);
  const s = Math.sin(spot.yaw);
  let ly = y;
  let lz = z;
  if (tilt) {
    // Tipped about the rear axle like the car on its ramp.
    const dz = z - REAR_AXLE;
    ly = y + (dz * RAMP_H) / WHEELBASE;
    lz = REAR_AXLE + dz * Math.cos(TILT);
    o.rotation.set(-TILT, spot.yaw, 0, "YXZ");
  } else o.rotation.y = spot.yaw;
  o.position.set(spot.x + x * c + lz * s, ly, spot.z - x * s + lz * c);
  return o;
}

const TAKEN = new Set<Spot>(); // spots with a real car model in them

function Lot() {
  const gravel = usePbrMaterial(GRAVEL, { tile: 3, size: [110, 100], brightness: 0.45, roughness: 1.3 });
  const parts = useMemo(() => {
    const rand = mulberry32(19);
    const ramps: Object3D[] = [];
    const posts: Object3D[] = [];
    const speakers: Object3D[] = [];
    const bodies: Object3D[] = [];
    const cabins: Object3D[] = [];
    const wheels: Object3D[] = [];
    const paint: Color[] = [];
    const glass: Color[] = [];
    const PAINT = ["#2f3d55", "#6b2a24", "#3d4a3a", "#7d7466", "#1e1f22", "#5a6f7f", "#8a6a2e", "#d9d2c0", "#4b2f45", "#2c5d5a"];
    for (const spot of SPOTS) {
      ramps.push(inSpot(spot, 0, 0, 0));
      // A speaker post on the driver's side, between this spot and the next.
      posts.push(inSpot(spot, SPOT_W / 2, 0.6, 0.2));
      for (const side of [-1, 1]) speakers.push(inSpot(spot, SPOT_W / 2 + side * 0.13, 1.08, 0.2));
      // About half the other spots taken by plain stand-in cars, kept back
      // from the Camaro where they'd be seen up close.
      if (TAKEN.has(spot) || rand() < 0.45 || Math.hypot(spot.x, spot.z) < 11) continue;
      bodies.push(inSpot(spot, 0, 0.64, 0, true));
      cabins.push(inSpot(spot, 0, 0.9, 0, true));
      for (const wx of [-0.8, 0.8])
        for (const wz of [REAR_AXLE, REAR_AXLE + WHEELBASE]) {
          const w = inSpot(spot, wx, 0.33, wz, true);
          w.rotateZ(Math.PI / 2);
          wheels.push(w);
        }
      const c = new Color(PAINT[Math.floor(rand() * PAINT.length)]);
      paint.push(c);
      glass.push(c.clone().multiplyScalar(0.25));
    }
    return {
      ramps,
      posts,
      speakers,
      bodies,
      cabins,
      wheels,
      wheel: new CylinderGeometry(0.33, 0.33, 0.24, 14),
      tyre: new MeshStandardMaterial({ color: "#141414", roughness: 0.9 }),
      paint,
      glass,
      ramp: rampGeometry(),
      post: new CylinderGeometry(0.04, 0.05, 1.2, 8),
      speaker: new BoxGeometry(0.24, 0.18, 0.12),
      body: new BoxGeometry(1.86, 0.52, 4.9),
      cabin: cabinGeometry(),
      dirt: new MeshStandardMaterial({ color: "#6d6457", roughness: 1 }),
      steel: new MeshStandardMaterial({ color: "#7d8084", roughness: 0.5, metalness: 0.6 }),
      speakerMat: new MeshStandardMaterial({ color: "#3c4044", roughness: 0.6, metalness: 0.3 }),
      carPaint: new MeshStandardMaterial({ roughness: 0.35, metalness: 0.3 }),
      carGlass: new MeshStandardMaterial({ roughness: 0.1, metalness: 0.5 }),
    };
  }, []);
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 6]} material={gravel} receiveShadow>
        <planeGeometry args={[110, 100]} />
      </mesh>
      <Instanced geometry={parts.ramp} material={parts.dirt} items={parts.ramps} shadows={false} />
      <Instanced geometry={parts.post} material={parts.steel} items={parts.posts} />
      <Instanced geometry={parts.speaker} material={parts.speakerMat} items={parts.speakers} />
      <Instanced geometry={parts.body} material={parts.carPaint} items={parts.bodies} colors={parts.paint} />
      <Instanced geometry={parts.cabin} material={parts.carGlass} items={parts.cabins} colors={parts.glass} />
      <Instanced geometry={parts.wheel} material={parts.tyre} items={parts.wheels} />
    </>
  );
}

// ---- The screen -------------------------------------------------------------

function Screen({ film }: { film: ReturnType<typeof makeFilm> }) {
  const light = useRef<SpotLight>(null);
  const picture = useMemo(() => new MeshBasicMaterial({ map: film.texture, toneMapped: false }), [film]);
  useFrame(({ clock }) => {
    film.update(clock.elapsedTime);
    // The picture's light spilling back over the lot.
    if (light.current) light.current.intensity = 400 + 3600 * film.brightness;
  });
  const lightTarget = useMemo(() => {
    const o = new Object3D();
    o.position.set(0, 0, -5);
    return o;
  }, []);
  return (
    <group>
      {/* The screen face, its dark backing and the steel tower holding it up. */}
      <mesh position={[0, SCREEN_Y, SCREEN_Z]} rotation-y={Math.PI} material={picture}>
        <planeGeometry args={[SCREEN_W, SCREEN_H]} />
      </mesh>
      <mesh position={[0, SCREEN_Y, SCREEN_Z + 0.35]} castShadow>
        <boxGeometry args={[SCREEN_W + 1.2, SCREEN_H + 1.2, 0.6]} />
        <meshStandardMaterial color="#2e2f31" roughness={0.9} />
      </mesh>
      {[-12, -4, 4, 12].map((x) => (
        <mesh key={x} position={[x, SCREEN_Y / 2 + 1, SCREEN_Z + 1.4]} castShadow>
          <boxGeometry args={[0.5, SCREEN_Y + SCREEN_H / 2, 0.5]} />
          <meshStandardMaterial color="#3a3c3f" roughness={0.8} metalness={0.4} />
        </mesh>
      ))}
      <mesh position={[0, 2.5, SCREEN_Z + 0.4]}>
        <boxGeometry args={[SCREEN_W + 1.2, 5, 0.4]} />
        <meshStandardMaterial color="#5b4a3a" roughness={0.9} />
      </mesh>
      <primitive object={lightTarget} />
      <spotLight
        ref={light}
        position={[0, SCREEN_Y, SCREEN_Z - 1]}
        target={lightTarget}
        angle={1.1}
        penumbra={1}
        decay={2}
        distance={120}
        color="#c9d4ff"
      />
    </group>
  );
}

// ---- The projector's beam ------------------------------------------------------

const beamVertex = /* glsl */ `
  varying float vAlong;
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  void main() {
    vAlong = uv.y; // 0 at the screen, 1 at the projector
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormalV = normalize(normalMatrix * normal);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const beamFragment = /* glsl */ `
  uniform float uBrightness;
  varying float vAlong;
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  void main() {
    // Thickest through the middle of the cone, brightest near the lens.
    float edge = mix(0.45, 1.0, abs(dot(vNormalV, vViewDir)));
    float a = edge * (0.015 + 0.2 * pow(vAlong, 3.0)) * (0.45 + uBrightness);
    gl_FragColor = vec4(vec3(0.82, 0.86, 1.0) * a, 1.0);
  }
`;

function Beam({ film }: { film: ReturnType<typeof makeFilm> }) {
  const { geometry, material, position, quaternion, motes } = useMemo(() => {
    const dir = BOOTH.clone().sub(SCREEN);
    const length = dir.length();
    // A four-sided pyramid from the lens to the screen's corners: a cone's
    // square cross-section turned square to the axes, then stretched to the
    // picture's shape (its x stays across, its z ends up vertical).
    const geometry = new ConeGeometry(1, length, 4, 1, true)
      .rotateY(Math.PI / 4)
      .scale((SCREEN_W / 2) * Math.SQRT2, 1, (SCREEN_H / 2) * Math.SQRT2);
    const material = new ShaderMaterial({
      uniforms: { uBrightness: { value: 0.3 } },
      vertexShader: beamVertex,
      fragmentShader: beamFragment,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    });
    const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.clone().normalize());
    const position = SCREEN.clone().add(BOOTH).multiplyScalar(0.5);
    // Dust and moths drifting through the beam near the booth.
    const rand = mulberry32(3);
    const n = 500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const t = Math.pow(rand(), 1.6) * 0.5; // bunched toward the projector
      const p = BOOTH.clone().lerp(SCREEN, t);
      const spread = t * SCREEN_W * 0.45;
      pos[i * 3] = p.x + (rand() - 0.5) * spread;
      pos[i * 3 + 1] = p.y + (rand() - 0.5) * spread * 0.45;
      pos[i * 3 + 2] = p.z;
    }
    const mg = new BufferGeometry();
    mg.setAttribute("position", new BufferAttribute(pos, 3));
    return { geometry, material, position, quaternion, motes: mg };
  }, []);
  const moteRef = useRef<Object3D>(null);
  useFrame(({ clock }) => {
    material.uniforms.uBrightness.value = film.brightness;
    if (moteRef.current) moteRef.current.position.y = Math.sin(clock.elapsedTime * 0.3) * 0.2;
  });
  return (
    <>
      <mesh geometry={geometry} material={material} position={position} quaternion={quaternion} renderOrder={4} />
      <points ref={moteRef} geometry={motes} renderOrder={4}>
        <pointsMaterial color="#cfd8ff" size={0.05} transparent opacity={0.6} blending={AdditiveBlending} depthWrite={false} />
      </points>
    </>
  );
}

// ---- Booth, snack bar and marquee ---------------------------------------------

function neonSign(lines: { text: string; size: number; y: number; color: string }[], w: number, h: number, lit: boolean) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = lit ? "#000" : "#1b1c20";
  g.fillRect(0, 0, w, h);
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (const l of lines) {
    g.font = `bold ${l.size}px 'Arial Black', Impact, sans-serif`;
    g.shadowColor = l.color;
    g.shadowBlur = lit ? l.size * 0.4 : 0;
    g.fillStyle = lit ? l.color : "#55585e";
    g.fillText(l.text, w / 2, l.y);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function useSigns() {
  return useMemo(() => {
    const sign = (lines: Parameters<typeof neonSign>[0], w: number, h: number) =>
      new MeshStandardMaterial({ map: neonSign(lines, w, h, false), emissiveMap: neonSign(lines, w, h, true), emissive: "#ffffff", emissiveIntensity: 2.2, roughness: 0.5 });
    return {
      snack: sign([{ text: "SNACK BAR", size: 110, y: 128, color: "#ff4f7b" }], 1024, 256),
      marquee: sign(
        [
          { text: "DILLO", size: 150, y: 120, color: "#ffc93d" },
          { text: "DRIVE-IN", size: 110, y: 250, color: "#5ff2ff" },
        ],
        1024,
        340,
      ),
      showing: (() => {
        const c = document.createElement("canvas");
        c.width = 1024;
        c.height = 400;
        const g = c.getContext("2d")!;
        g.fillStyle = "#f2ecd8";
        g.fillRect(0, 0, 1024, 400);
        g.fillStyle = "#1a1a1a";
        g.textAlign = "center";
        g.font = "bold 64px 'Arial Black', Impact, sans-serif";
        g.fillText("NOW SHOWING", 512, 90);
        g.font = "bold 74px 'Arial Black', Impact, sans-serif";
        g.fillText("THE ATOMIC", 512, 200);
        g.fillText("ARMADILLO", 512, 290);
        g.font = "bold 48px 'Arial Black', Impact, sans-serif";
        g.fillText("DUSK TO DAWN", 512, 370);
        const t = new CanvasTexture(c);
        t.colorSpace = SRGBColorSpace;
        return new MeshStandardMaterial({ map: t, emissiveMap: t, emissive: "#fff3d6", emissiveIntensity: 0.9, roughness: 0.6 });
      })(),
    };
  }, []);
}

function Booth({ signs }: { signs: ReturnType<typeof useSigns> }) {
  return (
    <group position={[0, 0, -30]}>
      <mesh position-y={2.4} castShadow receiveShadow>
        <boxGeometry args={[16, 4.8, 9]} />
        <meshStandardMaterial color="#d8cbb0" roughness={0.9} />
      </mesh>
      {/* Flat roof with a deep overhang, the projection room on top. */}
      <mesh position={[0, 4.95, 0.6]} castShadow>
        <boxGeometry args={[17.5, 0.3, 11]} />
        <meshStandardMaterial color="#8c2f2a" roughness={0.7} />
      </mesh>
      <mesh position={[0, 3.9, 4.52]}>
        <boxGeometry args={[1.2, 0.7, 0.05]} />
        <meshBasicMaterial color="#fffaf0" toneMapped={false} />
      </mesh>
      {/* The snack bar's lit windows and sign. */}
      {[-5, 5].map((x) => (
        <mesh key={x} position={[x, 1.6, 4.52]}>
          <planeGeometry args={[4.5, 1.8]} />
          <meshStandardMaterial color="#ffe7b8" emissive="#ffd99a" emissiveIntensity={1.6} roughness={0.3} />
        </mesh>
      ))}
      <mesh position={[0, 6.0, 4.5]} material={signs.snack}>
        <planeGeometry args={[8, 2]} />
      </mesh>
    </group>
  );
}

function Marquee({ signs }: { signs: ReturnType<typeof useSigns> }) {
  return (
    <group position={[-38, 0, -18]} rotation-y={0.9}>
      {[-2.2, 2.2].map((x) => (
        <mesh key={x} position={[x, 4.5, 0]} castShadow>
          <boxGeometry args={[0.35, 9, 0.35]} />
          <meshStandardMaterial color="#d6d2c8" roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, 8.6, 0.05]} material={signs.marquee}>
        <planeGeometry args={[6, 2]} />
      </mesh>
      <mesh position={[0, 6.1, 0.05]} material={signs.showing}>
        <planeGeometry args={[5.4, 2.1]} />
      </mesh>
      <mesh position={[0, 7.4, -0.02]}>
        <boxGeometry args={[6.4, 5, 0.12]} />
        <meshStandardMaterial color="#26272b" roughness={0.8} />
      </mesh>
    </group>
  );
}

const LAMPS = [new Vector3(0, 5.6, -24), new Vector3(-36, 7, -17)];

// ---- Scene --------------------------------------------------------------------

const CAMARO = spotAt(0, 0);
const NEIGHBOURS = { mustang: spotAt(-SPOT_W, 0), charger: spotAt(2 * SPOT_W, -7), challenger: spotAt(-2 * SPOT_W, 7) };
TAKEN.add(CAMARO).add(NEIGHBOURS.mustang).add(NEIGHBOURS.charger).add(NEIGHBOURS.challenger);

function DriveIn({ lightsOn, domeOn }: SceneProps) {
  const sky = useSceneSky(SKY, 2.2, true);
  const moon = useMemo(() => sky.sun.clone().multiplyScalar(60), [sky]);
  const film = useMemo(() => makeFilm(), []);
  const signs = useSigns();
  return (
    <>
      <fogExp2 attach="fog" args={[sky.fog, 0.004]} />
      <SkyReflections sky={sky} ground="#1c1c1a" />
      <GrassField size={FIELD} mown={false} behind />
      <Countryside config={COUNTRYSIDE} />
      {/* Faint moonlight; its shadows would barely show at night, so none. */}
      <directionalLight position={moon} intensity={sky.sunIntensity} color={sky.sunColor} />
      <Lot />
      <Screen film={film} />
      <Beam film={film} />
      <Booth signs={signs} />
      <Marquee signs={signs} />
      <NearestLights spots={LAMPS} count={2} color="#ffd7a0" intensity={60} distance={30} />

      {/* Rear wheels on the gravel, nose up the ramp: CAMARO is the spot at
          the origin, so the car stays centred for the orbit controls. */}
      <Parked spot={CAMARO}>
        <CamaroModel lightsOn={lightsOn} domeOn={domeOn} />
        <CarContactShadows position={[0, 0.02, 0]} opacity={0.5} scale={8} blur={2} far={2} />
      </Parked>
      <Optional>
        <Parked spot={NEIGHBOURS.mustang}>
          <MustangModel />
        </Parked>
      </Optional>
      <Optional>
        <Parked spot={NEIGHBOURS.charger}>
          <ChargerModel />
        </Parked>
      </Optional>
      <Optional>
        <Parked spot={NEIGHBOURS.challenger}>
          <ClassicCar id="challenger" position={[0, 0]} />
        </Parked>
      </Optional>
    </>
  );
}

export default function DriveInScene(props: SceneProps) {
  useCameraStart(-3.2, 2.7, -8.5, 1.2);
  useFarPlane(5000);
  useExposure(EXPOSURE);
  return (
    <>
      <DriveIn {...props} />
      <OrbitControls makeDefault enablePan={false} enableDamping minDistance={3} maxDistance={30} maxPolarAngle={Math.PI / 2.05} />
    </>
  );
}
