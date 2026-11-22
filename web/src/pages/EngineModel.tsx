import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Center, ContactShadows, Environment, Lightformer, OrbitControls, useGLTF } from "@react-three/drei";
import { AnimationMixer, Mesh, type Object3D } from "three";
import { DRACO_URL, dropTransmission, fixTexturedBlending } from "../components/CamaroModel";

// Exported from 3d_model/engine/bbc_block_work.blend by scripts/export_engine_glb.py,
// which tags every object with its top-level collection (userData.engine_part).
export const ENGINE_URL = "/models/engine.glb";

// The GLB's one animation is the .blend's timeline: a full four-stroke cycle,
// 720 crank degrees in 4 s, i.e. the crank turning at 30 rpm.
const CLIP_RPM = 30;
const RPM_MIN = 10;
const RPM_MAX = 300;
const RPM_START = 60;

// Tickbox labels for the .blend's collections, in the order they're listed.
// A collection missing here still gets a tickbox, named after the collection.
const PART_LABELS: Record<string, string> = {
  BBC_Block: "Block & main caps",
  BBC_Crank: "Crankshaft & bearings",
  BBC_Rods_Pistons: "Rods & pistons",
  BBC_Cam_Timing: "Cam & timing set",
  BBC_Lifters: "Lifters",
  BBC_Heads: "Cylinder heads",
  BBC_Valvetrain: "Valvetrain",
  BBC_FrontCover: "Timing cover & balancer",
  BBC_Oiling: "Oil pan & pump",
  BBC_Flywheel: "Flywheel",
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
    });
    return groupParts(scene);
  }, [scene]);

  useEffect(() => onParts([...parts.keys()].sort(byOrder)), [parts, onParts]);

  useEffect(() => {
    for (const [id, nodes] of parts) for (const n of nodes) n.visible = !hidden.has(id);
  }, [parts, hidden]);

  // Crank, rods, pistons, cam, chain and valvetrain all play from the one
  // clip; the speed only scales its playback.
  const mixer = useMemo(() => new AnimationMixer(scene), [scene]);
  useEffect(() => {
    if (!animations.length) return;
    const action = mixer.clipAction(animations[0]).play();
    return () => {
      action.stop();
    };
  }, [mixer, animations]);
  useEffect(() => {
    mixer.timeScale = rpm / CLIP_RPM;
  }, [mixer, rpm]);
  useFrame((_, dt) => mixer.update(dt));

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
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={2} position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[10, 4, 1]} />
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
            min={RPM_MIN}
            max={RPM_MAX}
            step={10}
            value={rpm}
            disabled={!running}
            onChange={(e) => setRpm(Number(e.target.value))}
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
