import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Center, ContactShadows, Environment, Lightformer, OrbitControls, useGLTF } from "@react-three/drei";
import { AnimationMixer, BackSide, Mesh, Vector2, type MeshStandardMaterial, type AnimationAction, type Object3D, type PerspectiveCamera } from "three";
import { DRACO_URL, dropTransmission, fixTexturedBlending } from "../components/CamaroModel";
import { Combustion, type FlowData } from "./combustion";
import { EngineStandSound } from "../audio/EngineStandSound";

// Exported from 3d_model/engine/bbc_block_work.blend by scripts/export_engine_glb.py,
// which tags every object with its top-level collection (userData.engine_part).
export const ENGINE_URL = "/models/engine.glb";

// Not preloaded with the app (it's 8 MB and most visits never open the page);
// the nav link calls this on hover/focus instead. Repeat calls are cached.
export function prefetchEngineModel() {
  useGLTF.preload(ENGINE_URL, DRACO_URL);
}

// The GLB's one animation is the .blend's timeline: a full four-stroke cycle,
// 720 crank degrees in 4 s, i.e. the crank turning at 30 rpm.
const CLIP_RPM = 30;
const RPM_MIN = 10;
const RPM_MAX = 5000;
const RPM_START = 60;

// The slider runs on a log scale so the slow end (where the valve events are
// easy to follow) keeps as much travel as the fast end. Speeds snap to round
// numbers: 1 rpm below 100, 10 below 1000, 50 above.
const SLIDER_STEPS = 1000;
const LOG_SPAN = Math.log(RPM_MAX / RPM_MIN);
const snapRpm = (r: number) => {
  const q = r < 100 ? 1 : r < 1000 ? 10 : 50;
  return Math.min(RPM_MAX, Math.max(RPM_MIN, Math.round(r / q) * q));
};
const rpmToSlider = (r: number) => Math.round((Math.log(r / RPM_MIN) / LOG_SPAN) * SLIDER_STEPS);
const sliderToRpm = (s: number) => snapRpm(RPM_MIN * Math.exp((s / SLIDER_STEPS) * LOG_SPAN));

// Tickbox labels for the .blend's collections, in the order they're listed.
// A collection missing here still gets a tickbox, named after the collection.
// The export folds some collections together (scripts/export_engine_glb.py,
// part_of): lifters and spark plugs into the valvetrain; the main bearings,
// oiling parts and timing cover into the block; and the crank, flywheel,
// rods, pistons and balancer into the rotating assembly.
// COMBUSTION isn't a part of the model: it's the four-stroke overlay.
const COMBUSTION = "Combustion";
const PART_LABELS: Record<string, string> = {
  BBC_Block: "Block, timing cover, oil pan & pump",
  BBC_Rotating: "Rotating assembly",
  BBC_Cam_Timing: "Cam & timing set",
  BBC_Heads: "Cylinder heads",
  BBC_Valvetrain: "Valvetrain, lifters & plugs",
  [COMBUSTION]: "Four-stroke airflow & flame",
};

const ORDER = Object.keys(PART_LABELS);

function partLabel(id: string) {
  return PART_LABELS[id] ?? id.replace(/^BBC_/, "").replace(/_/g, " ");
}

function byOrder(a: string, b: string) {
  const ia = ORDER.indexOf(a);
  const ib = ORDER.indexOf(b);
  if (ia < 0 && ib < 0) return a.localeCompare(b);
  return (ia < 0 ? ORDER.length : ia) - (ib < 0 ? ORDER.length : ib);
}

// The tagged nodes of each part. A tagged object with several materials comes
// through as a group of meshes, so hiding the node hides all of them.
function groupParts(scene: Object3D) {
  const parts = new Map<string, Object3D[]>();
  scene.traverse((o) => {
    const id = o.userData.engine_part as string | undefined;
    if (!id) return;
    if (!parts.has(id)) parts.set(id, []);
    parts.get(id)!.push(o);
  });
  return parts;
}

interface ModelProps {
  hidden: ReadonlySet<string>;
  onParts: (ids: string[]) => void;
  rpm: number; // 0 holds the engine still
}

// Centered on the origin with the oil pan resting on y = 0. Center measures
// every part, hidden or not, so the rest stay put when some are switched off.
function EngineParts({ hidden, onParts, rpm }: ModelProps) {
  const { scene, animations } = useGLTF(ENGINE_URL, DRACO_URL);
  const parts = useMemo(() => {
    scene.traverse((obj) => {
      if (!(obj instanceof Mesh)) return;
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach(fixTexturedBlending);
      materials.forEach(dropTransmission);
      // The tiled surface textures are seen at every angle: filter them
      // anisotropically, or the fine machining and casting detail shimmers.
      for (const m of materials as MeshStandardMaterial[])
        for (const t of [m.map, m.normalMap, m.roughnessMap, m.metalnessMap]) if (t) t.anisotropy = 8;
    });
    return groupParts(scene);
  }, [scene]);

  // The four-stroke overlay, from the geometry the export stores on the scene.
  const combustion = useMemo(() => {
    const json = scene.userData.engine_flow as string | undefined;
    return json ? new Combustion(JSON.parse(json) as FlowData) : null;
  }, [scene]);

  useEffect(() => {
    const ids = [...parts.keys()];
    if (combustion) ids.push(COMBUSTION);
    onParts(ids.sort(byOrder));
  }, [parts, combustion, onParts]);

  useEffect(() => {
    for (const [id, nodes] of parts) for (const n of nodes) n.visible = !hidden.has(id);
    if (combustion) combustion.group.visible = !hidden.has(COMBUSTION);
  }, [parts, combustion, hidden]);

  // Added once Center has measured the engine (its layout effect runs
  // first), so the flame reaching out of the ports doesn't shift it.
  useEffect(() => {
    if (!combustion) return;
    scene.add(combustion.group);
    return () => {
      scene.remove(combustion.group);
      combustion.dispose();
    };
  }, [scene, combustion]);

  // Crank, rods, pistons, cam, chain and valvetrain all play from the one
  // clip; the speed only scales its playback.
  const mixer = useMemo(() => new AnimationMixer(scene), [scene]);
  const action = useRef<AnimationAction | null>(null);
  useEffect(() => {
    if (!animations.length) return;
    const a = mixer.clipAction(animations[0]).play();
    action.current = a;
    return () => {
      a.stop();
      action.current = null;
    };
  }, [mixer, animations]);
  useEffect(() => {
    mixer.timeScale = rpm / CLIP_RPM;
  }, [mixer, rpm]);
  const drawSize = useMemo(() => new Vector2(), []);
  useFrame(({ gl, camera, clock }, dt) => {
    mixer.update(dt);
    const a = action.current;
    if (!combustion || !a || !combustion.group.visible) return;
    gl.getDrawingBufferSize(drawSize);
    combustion.setPixelScale(drawSize.y, (camera as PerspectiveCamera).fov);
    combustion.update((a.time / a.getClip().duration) * 720, clock.elapsedTime);
  });

  return (
    <Center top>
      <primitive object={scene} />
    </Center>
  );
}

// The Showroom scene's studio, scaled down to the engine: the same
// Lightformer reflections, floor and contact shadow, without the car.
function EngineScene(props: ModelProps) {
  // The contact shadow is drawn once (the engine never moves) and again
  // whenever the set of parts shown changes.
  const shadowKey = [...props.hidden].sort().join();
  return (
    <>
      <color attach="background" args={["#15171c"]} />
      <Environment resolution={512}>
        {/* A dim shop round the studio lights, so the bare metal (heads, ground
            journals, machined faces) reflects a room rather than black. */}
        <mesh scale={30}>
          <sphereGeometry args={[1, 32, 16]} />
          <meshBasicMaterial color="#3b3e45" side={BackSide} />
        </mesh>
        <Lightformer form="rect" intensity={2} position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[10, 4, 1]} />
        {/* Strip lights overhead: the long highlights that run along machined faces. */}
        <Lightformer form="rect" intensity={3} position={[-1.5, 4, -2]} rotation-x={Math.PI / 2} scale={[0.3, 6, 1]} />
        <Lightformer form="rect" intensity={3} position={[1.5, 4, 2]} rotation-x={Math.PI / 2} scale={[0.3, 6, 1]} />
        <Lightformer form="ring" intensity={1.5} position={[3, 3, -4]} scale={1.5} />
        <Lightformer form="rect" intensity={1.5} position={[-5, 2, 0]} rotation-y={Math.PI / 2} scale={[8, 2, 1]} />
        <Lightformer form="rect" intensity={1.5} position={[5, 2, 0]} rotation-y={-Math.PI / 2} scale={[8, 2, 1]} />
        <Lightformer form="rect" intensity={1} position={[0, 2, 6]} scale={[8, 2, 1]} />
        <Lightformer form="rect" intensity={1} position={[0, 2, -6]} rotation-y={Math.PI} scale={[8, 2, 1]} />
        {/* A dim panel underneath, for looking up at the pan and the crank. */}
        <Lightformer form="rect" intensity={0.6} position={[0, -5, 0]} rotation-x={-Math.PI / 2} scale={[10, 4, 1]} />
      </Environment>
      <ambientLight intensity={0.2} />
      <Suspense fallback={null}>
        <EngineParts {...props} />
        <ContactShadows key={shadowKey} frames={1} position={[0, 0, 0]} opacity={0.7} scale={2} blur={2} far={0.6} />
      </Suspense>
      <EngineStandSound rpm={props.rpm} />
      <mesh rotation-x={-Math.PI / 2} position-y={-0.002}>
        <circleGeometry args={[4, 64]} />
        <meshStandardMaterial color="#1b1d22" roughness={0.9} />
      </mesh>
      {/* Panning lets you look into the corners of a part-stripped engine.
          Unlike the car scenes the orbit goes all the way round, underneath
          too: the floor and contact shadow are one-sided, so from below they
          vanish and leave the oil pan and crank in view. */}
      <OrbitControls makeDefault target={[0, 0.28, 0]} enableDamping minDistance={0.35} maxDistance={3} />
    </>
  );
}

// Opens in place of the car viewer (see PageDef.viewer): the engine alone in
// the studio, with a tickbox per part of the .blend to strip it down.
// Turning over unless the viewer has asked for less motion.
const prefersStill = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

export default function EngineModel() {
  const [parts, setParts] = useState<string[]>([]);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [running, setRunning] = useState(() => !prefersStill());
  const [rpm, setRpm] = useState(RPM_START);

  const toggle = (id: string, show: boolean) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (show) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      {/* Front three-quarter view from the driver's side; the engine is
          under a metre across, so the near plane comes in close. */}
      <div className="viewer">
        <Canvas dpr={[1, 2]} camera={{ position: [-0.8, 0.7, -1.0], fov: 40, near: 0.02, far: 50 }}>
          <EngineScene hidden={hidden} onParts={setParts} rpm={running ? rpm : 0} />
        </Canvas>
      </div>
      <div className="controls engine-parts" role="group" aria-labelledby="engine-parts-title" hidden={parts.length === 0}>
        <label>
          <input type="checkbox" checked={running} onChange={(e) => setRunning(e.target.checked)} />
          Running
        </label>
        <label className="engine-speed">
          <input
            type="range"
            aria-label="Crank speed"
            min={0}
            max={SLIDER_STEPS}
            step={1}
            value={rpmToSlider(rpm)}
            aria-valuetext={`${rpm} rpm`}
            disabled={!running}
            onChange={(e) => setRpm(sliderToRpm(Number(e.target.value)))}
          />
          <output>{rpm} rpm</output>
        </label>
        <div id="engine-parts-title" className="engine-parts-title">
          Engine parts
        </div>
        {parts.map((id) => (
          <label key={id}>
            <input type="checkbox" checked={!hidden.has(id)} onChange={(e) => toggle(id, e.target.checked)} />
            {partLabel(id)}
          </label>
        ))}
        {parts.includes(COMBUSTION) && !hidden.has(COMBUSTION) && (
          <p className="engine-flow-hint">Hide the heads and block to see inside the cylinders.</p>
        )}
        <div className="engine-parts-all">
          <button type="button" disabled={hidden.size === 0} onClick={() => setHidden(new Set())}>
            Show all
          </button>
          <button type="button" disabled={hidden.size === parts.length} onClick={() => setHidden(new Set(parts))}>
            Hide all
          </button>
        </div>
      </div>
    </>
  );
}
