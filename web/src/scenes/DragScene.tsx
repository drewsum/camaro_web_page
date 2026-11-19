import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import CarContactShadows from "../components/CarContactShadows";
import {
  BackSide,
  BoxGeometry,
  CanvasTexture,
  Color,
  Matrix4,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Group,
  type InstancedMesh,
  type MeshBasicMaterial,
} from "three";
import CamaroModel from "../components/CamaroModel";
import { DriveProvider, useDrive } from "../car/driveClock";
import type { SceneProps } from ".";
import { useCameraStart } from "./useCameraStart";
import { useExposure, useFarPlane } from "./common/renderer";
import { polyHavenHdri, useHdriSky } from "./common/hdri";
import { mulberry32 } from "./common/periodic";
import SkyReflections from "./common/SkyReflections";
import Optional from "./common/Optional";
import MustangModel from "../components/MustangModel";
import { preloadPbr, usePbrMaterial } from "./common/pbr";
import { AMBER_STEP, finishTime, QUARTER_MILE, Race, STAGE_TIME, trapSpeed, type Runner } from "./drag/race";

// Golden-hour quarter mile against a '69 Mach 1 Cobra Jet: stage at the tree, count
// down, launch, run to the finish and brake through the shutdown, then a
// quick fade and the next pass. The Camaro stays at the origin; the strip
// slides past it.

const SKY = polyHavenHdri("kloppenheim_06_puresky");
const EXPOSURE = 0.8;

const LANE = 3.7; // lane width; the Camaro runs the right lane at x = 0, the Mustang at +LANE
const START_Z = 1.4; // start line, at the Camaro's front tyres when staged
const STRIP_FROM = -120;
const STRIP_TO = START_Z + QUARTER_MILE + 450;
const WALL_X = [-LANE / 2 - 0.8, LANE * 1.5 + 0.8];

// Both four-speeds, power-shifted; 3.91 and 4.30 rear gears respectively.
const CAMARO: Runner = { topSpeed: 50, tau: 6, reaction: 0.12, shifts: [16.5, 27, 38], shiftTime: 0.3, brake: 4.2 };
const MUSTANG: Runner = { topSpeed: 49.2, tau: 5.9, reaction: 0.21, shifts: [15.5, 25.5, 36.5], shiftTime: 0.34, brake: 4.0 };
const race = new Race(CAMARO, MUSTANG);
const MUSTANG_RUN = race.profile(MUSTANG);

// ---- Surface ----------------------------------------------------------------

// The strip is concrete from behind the burnout box to 100 m out (where
// launches dig in) and asphalt beyond, both scanned surfaces from Poly Haven.
// Rubber laid down by the tyres and the painted lines sit on top as a
// transparent overlay, so they stay sharp over the tiled scans.
const STRIP_WIDTH = LANE * 2 + 1.2;
const PAD_TO = START_Z + 100;
const CONCRETE = "brushed_concrete";
const ASPHALT = "asphalt_track";
const WALL = "concrete_wall_008";
preloadPbr(CONCRETE);
preloadPbr(ASPHALT);
preloadPbr(WALL, "1k");

// One 8 m tile of overlay across both lanes, 64 px per metre: streaky rubber
// in each tyre track (heavier on the launch pad) and the lane and edge lines.
function overlayTexture(rubber: number, seed: number) {
  const PX = 64;
  const W = Math.round(STRIP_WIDTH * PX);
  const H = 8 * PX;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const px = (x: number) => (x + LANE / 2 + 0.6) * PX;
  const rand = mulberry32(seed);
  for (const lane of [0, LANE]) {
    for (const wheel of [-0.76, 0.76]) {
      const x0 = lane + wheel;
      const grad = g.createLinearGradient(px(x0 - 0.42), 0, px(x0 + 0.42), 0);
      grad.addColorStop(0, "rgba(8,8,8,0)");
      grad.addColorStop(0.3, `rgba(8,8,8,${rubber * 0.8})`);
      grad.addColorStop(0.5, `rgba(8,8,8,${rubber})`);
      grad.addColorStop(0.7, `rgba(8,8,8,${rubber * 0.8})`);
      grad.addColorStop(1, "rgba(8,8,8,0)");
      g.fillStyle = grad;
      g.fillRect(px(x0 - 0.42), 0, 0.84 * PX, H);
      // Streaks along the direction of travel; full-height so the tile wraps.
      for (let n = 0; n < 40; n++) {
        const x = x0 + (rand() - 0.5) * 0.7;
        g.fillStyle = `rgba(5,5,5,${rubber * (0.08 + rand() * 0.18)})`;
        g.fillRect(px(x), 0, 1 + rand() * 4, H);
      }
    }
  }
  // Painted lines, slightly worn.
  for (const x of [-LANE / 2, LANE / 2, LANE * 1.5]) {
    g.fillStyle = "rgba(242,240,234,0.92)";
    g.fillRect(px(x) - 0.05 * PX, 0, 0.1 * PX, H);
    for (let n = 0; n < 120; n++) {
      g.fillStyle = `rgba(60,60,60,${0.15 + rand() * 0.3})`;
      g.fillRect(px(x) - 0.05 * PX + rand() * 0.1 * PX, rand() * H, 1 + rand() * 2, 1 + rand() * 3);
    }
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 16;
  return t;
}

function Pavement({ from, to, surface, tile, brightness, rubber, seed }: { from: number; to: number; surface: string; tile: number; brightness: number; rubber: number; seed: number }) {
  const length = to - from;
  const material = usePbrMaterial(surface, { tile, size: [STRIP_WIDTH, length], normalScale: 0.8, brightness });
  const overlay = useMemo(() => {
    const t = overlayTexture(rubber, seed);
    t.repeat.set(1, length / 8);
    return t;
  }, [rubber, seed, length]);
  return (
    <group position={[LANE / 2, 0, (from + to) / 2]}>
      <mesh rotation-x={-Math.PI / 2} receiveShadow material={material}>
        <planeGeometry args={[STRIP_WIDTH, length]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.002} receiveShadow>
        <planeGeometry args={[STRIP_WIDTH, length]} />
        <meshStandardMaterial map={overlay} transparent depthWrite={false} roughness={0.75} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-2} />
      </mesh>
    </group>
  );
}

// A box whose UVs are its own surface coordinates in metres, so a tiled
// material keeps its real-world scale on every face.
function metricBox(w: number, h: number, d: number) {
  const g = new BoxGeometry(w, h, d);
  const pos = g.attributes.position;
  const nrm = g.attributes.normal;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const [ax, ay] = [Math.abs(nrm.getX(i)), Math.abs(nrm.getY(i))];
    if (ax > 0.5) uv.setXY(i, z, y);
    else if (ay > 0.5) uv.setXY(i, x, z);
    else uv.setXY(i, x, y);
  }
  return g;
}

function Line({ z, checkered = false }: { z: number; checkered?: boolean }) {
  const texture = useMemo(() => {
    if (!checkered) return null;
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 8;
    const g = c.getContext("2d")!;
    for (let i = 0; i < 16; i++)
      for (let j = 0; j < 2; j++) {
        g.fillStyle = (i + j) % 2 ? "#111" : "#f2f2f2";
        g.fillRect(i * 4, j * 4, 4, 4);
      }
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, [checkered]);
  return (
    <mesh rotation-x={-Math.PI / 2} position={[LANE / 2, 0.006, z]}>
      <planeGeometry args={[LANE * 2 + 1.2, checkered ? 0.6 : 0.2]} />
      <meshStandardMaterial color={texture ? "#ffffff" : "#f2f0ea"} map={texture} roughness={0.7} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-4} />
    </mesh>
  );
}

// ---- Trackside ------------------------------------------------------------

function Walls() {
  const length = STRIP_TO - STRIP_FROM;
  const geometry = useMemo(() => metricBox(0.35, 0.84, length), [length]);
  const material = usePbrMaterial(WALL, { res: "1k", tile: 2.7, size: [1, 1], tint: "#d8d6d0" });
  return (
    <>
      {WALL_X.map((x) => (
        <mesh key={x} position={[x, 0.42, (STRIP_FROM + STRIP_TO) / 2]} geometry={geometry} material={material} castShadow receiveShadow />
      ))}
      {/* Grass beyond the walls */}
      <mesh rotation-x={-Math.PI / 2} position={[LANE / 2, -0.02, (STRIP_FROM + STRIP_TO) / 2]} receiveShadow>
        <planeGeometry args={[3000, 3000]} />
        {/* Pushed back so it never shows through the strip in the distance. */}
        <meshStandardMaterial color="#5f6b3a" roughness={1} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={4} />
      </mesh>
    </>
  );
}

// The Christmas tree: per lane, pre-stage and stage bulbs, three ambers, a
// green and a red, facing the cars.
function Tree() {
  const bulbs = useMemo(() => {
    const make = (color: string) => new MeshStandardMaterial({ color: "#222", emissive: color, emissiveIntensity: 0, roughness: 0.3 });
    return {
      stage: [make("#fff3c4"), make("#fff3c4")],
      amber: [make("#ffad1f"), make("#ffad1f"), make("#ffad1f")],
      green: make("#3dff5a"),
      red: make("#ff2a1f"),
    };
  }, []);
  const drive = useDrive();
  useFrame(({ clock }) => {
    const p = race.phase(clock.elapsedTime - drive.t0);
    const on = (v: boolean, k = 6) => (v ? k : 0);
    bulbs.stage.forEach((m) => (m.emissiveIntensity = on(p > 1)));
    const firstAmber = STAGE_TIME - 3 * AMBER_STEP;
    bulbs.amber.forEach((m, i) => (m.emissiveIntensity = on(p > firstAmber + i * AMBER_STEP && p < STAGE_TIME)));
    bulbs.green.emissiveIntensity = on(p >= STAGE_TIME && p < STAGE_TIME + 8, 8);
  });
  const rows: [number, MeshStandardMaterial, number][] = [
    [3.05, bulbs.stage[0], 0.06],
    [2.9, bulbs.stage[1], 0.06],
    [2.65, bulbs.amber[0], 0.09],
    [2.42, bulbs.amber[1], 0.09],
    [2.19, bulbs.amber[2], 0.09],
    [1.96, bulbs.green, 0.09],
    [1.73, bulbs.red, 0.09],
  ];
  return (
    <group position={[LANE / 2, 0, START_Z + 1.2]} rotation-y={Math.PI}>
      <mesh position-y={1.2} castShadow>
        <cylinderGeometry args={[0.08, 0.1, 2.4, 10]} />
        <meshStandardMaterial color="#2a2a2c" metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position-y={2.4} castShadow>
        <boxGeometry args={[0.7, 1.6, 0.18]} />
        <meshStandardMaterial color="#141416" roughness={0.6} />
      </mesh>
      {rows.flatMap(([y, material, r]) =>
        [-0.2, 0.2].map((x) => (
          <mesh key={`${y}${x}`} position={[x, y, 0.1]} material={material}>
            <sphereGeometry args={[r, 16, 10]} />
          </mesh>
        )),
      )}
    </group>
  );
}

// Elapsed time and trap speed for each lane on boards at the finish.
function Scoreboard({ x, runner }: { x: number; runner: Runner }) {
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 256;
    const g = c.getContext("2d")!;
    g.fillStyle = "#0c0c0e";
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = "#ffb52e";
    g.font = "bold 92px monospace";
    g.textAlign = "center";
    g.fillText(finishTime(runner).toFixed(3), 256, 112);
    g.fillText((trapSpeed(runner) * 2.23694).toFixed(2), 256, 224);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, [runner]);
  return (
    <group position={[x, 0, START_Z + QUARTER_MILE + 6]} rotation-y={Math.PI}>
      {[-1.4, 1.4].map((lx) => (
        <mesh key={lx} position={[lx, 3, 0.1]} castShadow>
          <boxGeometry args={[0.2, 6, 0.2]} />
          <meshStandardMaterial color="#3a3a3a" />
        </mesh>
      ))}
      <mesh position={[0, 5, 0]}>
        <planeGeometry args={[4, 2]} />
        <meshStandardMaterial map={texture} emissiveMap={texture} emissive="#ffffff" emissiveIntensity={1.4} />
      </mesh>
    </group>
  );
}

// Aluminium bleachers along the starting line with a crowd on them.
function Grandstand() {
  const crowd = useRef<InstancedMesh>(null);
  const heads = useRef<InstancedMesh>(null);
  const ROWS = 7;
  const LENGTH = 70;
  const X = WALL_X[0] - 6;
  const count = ROWS * 90;
  useLayoutEffect(() => {
    const rand = mulberry32(1320);
    const shirts = ["#8c3a32", "#3a5670", "#d8d4c8", "#3b3b3b", "#a88f4a", "#4d6a3e", "#5e4a6e", "#9a6a44", "#6f7378"].map((c) => new Color(c));
    const skin = ["#e2b89a", "#c9946f", "#8d5e3f", "#f0c8a8", "#b07a55"].map((c) => new Color(c));
    const m = new Matrix4();
    let n = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let i = 0; i < 90; i++) {
        if (rand() < 0.35) continue;
        const z = -15 + (i / 90) * LENGTH + rand() * 0.3;
        m.makeTranslation(X - r * 0.8 - 0.3, 0.45 * (r + 1) + 0.45, z);
        crowd.current!.setMatrixAt(n, m);
        crowd.current!.setColorAt(n, shirts[Math.floor(rand() * shirts.length)]);
        heads.current!.setMatrixAt(n, m.clone().multiply(new Matrix4().makeTranslation(0, 0.58, 0)));
        heads.current!.setColorAt(n, skin[Math.floor(rand() * skin.length)]);
        n++;
      }
    }
    for (const mesh of [crowd.current!, heads.current!]) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [X]);
  return (
    <group>
      {Array.from({ length: ROWS }, (_, r) => (
        <mesh key={r} position={[X - r * 0.8, (0.45 * (r + 1)) / 2, -15 + LENGTH / 2]} castShadow receiveShadow>
          <boxGeometry args={[0.8, 0.45 * (r + 1), LENGTH]} />
          <meshStandardMaterial color="#b8bcc0" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      <instancedMesh ref={crowd} args={[undefined, undefined, count]} castShadow>
        <capsuleGeometry args={[0.19, 0.4, 4, 8]} />
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[undefined, undefined, count]}>
        <sphereGeometry args={[0.11, 10, 8]} />
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
    </group>
  );
}

function LightPoles() {
  const spots = useMemo(() => {
    const out: [number, number][] = [];
    for (let z = -40; z < STRIP_TO; z += 70) for (const x of [WALL_X[0] - 2.5, WALL_X[1] + 2.5]) out.push([x, z]);
    return out;
  }, []);
  return (
    <>
      {spots.map(([x, z]) => (
        <group key={`${x}${z}`} position={[x, 0, z]}>
          <mesh position-y={6} castShadow>
            <cylinderGeometry args={[0.12, 0.16, 12, 8]} />
            <meshStandardMaterial color="#8a8d90" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[x < 0 ? 0.6 : -0.6, 12, 0]}>
            <boxGeometry args={[1.4, 0.3, 0.6]} />
            <meshStandardMaterial color="#3a3c3e" />
          </mesh>
        </group>
      ))}
    </>
  );
}

// ---- Motion -----------------------------------------------------------------

// Slides the strip past the Camaro, moves the Mustang along its lane and
// fades to black around each reset.
function Pass({ children, lightsOn }: { children: ReactNode; lightsOn: boolean }) {
  const drive = useDrive();
  const strip = useRef<Group>(null);
  const rival = useRef<Group>(null);
  const curtain = useRef<MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime - drive.t0;
    const hero = race.leg(CAMARO, t).distance;
    if (strip.current) strip.current.position.z = -hero;
    if (rival.current) rival.current.position.z = race.leg(MUSTANG, t).distance;
    if (curtain.current) curtain.current.opacity = race.fade(t);
  });
  return (
    <>
      <group ref={strip}>
        {children}
        <group ref={rival} position-x={LANE}>
          <Optional>
            <MustangModel profile={MUSTANG_RUN} lightsOn={lightsOn} />
            <CarContactShadows position={[0, 0.01, 0]} opacity={0.45} scale={10} blur={2.2} far={2} />
          </Optional>
        </group>
      </group>
      {/* Black curtain around the camera for the reset. */}
      <mesh renderOrder={999}>
        <sphereGeometry args={[40, 16, 12]} />
        <meshBasicMaterial ref={curtain} color="#000" side={BackSide} transparent depthTest={false} depthWrite={false} fog={false} />
      </mesh>
    </>
  );
}

function Strip({ lightsOn, domeOn }: SceneProps) {
  const sky = useHdriSky(SKY, 1.1, EXPOSURE);
  const sun = useMemo(() => sky.sun.clone().multiplyScalar(40), [sky]);
  return (
    <DriveProvider profile={race.heroProfile} roughness={0.6}>
      <fog attach="fog" args={[sky.fog, 200, 1400]} />
      <SkyReflections sky={sky} ground="#44453f" />
      <directionalLight
        position={sun}
        // This sky's sun is down in the haze, with nothing to clip: light the
        // strip with a low evening sun of our own.
        intensity={sky.sunIntensity || 2.4}
        color={sky.sunIntensity ? sky.sunColor : "#ffd9a8"}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-camera-far={120}
      />
      <Pass lightsOn={!!lightsOn}>
        <Pavement from={STRIP_FROM} to={PAD_TO} surface={CONCRETE} tile={2.5} brightness={1.25} rubber={0.8} seed={1} />
        <Pavement from={PAD_TO} to={STRIP_TO} surface={ASPHALT} tile={3} brightness={2.2} rubber={0.45} seed={2} />
        <Line z={START_Z} />
        <Line z={START_Z + QUARTER_MILE} checkered />
        <Walls />
        <Tree />
        <Scoreboard x={WALL_X[0] - 3} runner={CAMARO} />
        <Scoreboard x={WALL_X[1] + 3} runner={MUSTANG} />
        <Grandstand />
        <LightPoles />
      </Pass>
      <CamaroModel lightsOn={lightsOn} domeOn={domeOn} />
      <CarContactShadows position={[0, 0.01, 0]} opacity={0.45} scale={10} blur={2.2} far={2} />
    </DriveProvider>
  );
}

export default function DragScene(props: SceneProps) {
  useCameraStart(1.2, 2.1, -8.5);
  useFarPlane(5000);
  useExposure(EXPOSURE);
  return (
    <>
      <Strip {...props} />
      <OrbitControls makeDefault enablePan={false} enableDamping minDistance={3} maxDistance={16} maxPolarAngle={Math.PI / 2.05} />
    </>
  );
}
