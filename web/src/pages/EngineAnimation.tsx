import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { EXHAUST, INTAKE, STROKES, events, liftAt, strokeAt, timing, wrap } from "./camModel";
import {
  BORE,
  CLEARANCE_CC,
  COMP_HEIGHT,
  COMPRESSION,
  CRANK_Y,
  DECK_CLEARANCE,
  EXHAUST_VALVE,
  EXHAUST_X,
  HEAD_FACE,
  INTAKE_VALVE,
  INTAKE_X,
  PIN_DIA,
  PLUG_ANGLE,
  PLUG_TIP,
  R,
  ROD,
  ROD_JOURNAL,
  ROOF,
  SPARK_ADVANCE,
  SPARK_AT,
  STEM,
  STROKE,
  SWEPT_CC,
  crank,
} from "./engineGeometry";

// One cylinder of the 540, cut through the bore centre and drawn to scale in
// inches. As in most textbook cutaways, both valves and the plug are shown in
// the same plane; on the real big block they sit one behind the other along
// the head.

const VB = { x: -4.8, y: -5.95, w: 10, h: 20.1 };
const HB = BORE / 2; // bore half-width
const HEAD_TOP = -3.3;
const VALVE_LEN = 4.95;
const LENS_R = 1.7; // magnifier radius, inches of drawing
const LENS_ZOOM = 3;

// --- Cylinder contents -------------------------------------------------------

type RGB = [number, number, number];
const FRESH: RGB = [78, 161, 243];
const COMPRESSED: RGB = [118, 104, 250];
const FLAME: RGB = [255, 214, 90];
const BURNT: RGB = [240, 112, 40];
const COOLING: RGB = [176, 70, 40];
const EXHAUST_GAS: RGB = [128, 118, 108];
const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => v + (b[i] - v) * t) as RGB;
const rgb = (c: RGB) => `rgb(${c.map(Math.round).join(",")})`;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

const EVO = events(EXHAUST).open; // exhaust opens (0.050")
const IVO = events(INTAKE).open;
const BURN = 40; // degrees for the flame to cross the chamber

// What the cylinder holds at a crank angle. `sinceSpark` runs 0..720 from the
// moment the plug fires.
function charge(angle: number) {
  const sinceSpark = (((angle - SPARK_AT) % 720) + 720) % 720;
  const evo = (((EVO - SPARK_AT) % 720) + 720) % 720;
  const ivo = (((IVO - SPARK_AT) % 720) + 720) % 720;
  const tdc = 360 + SPARK_ADVANCE; // overlap TDC, measured from the spark
  const ivc = (((events(INTAKE).close - SPARK_AT) % 720) + 720) % 720;

  if (sinceSpark < BURN) {
    const t = sinceSpark / BURN;
    return {
      what: sinceSpark < 6 ? "Spark" : "Burning",
      color: COMPRESSED,
      opacity: 0.8,
      flame: { r: 4.6 * (1 - (1 - t) ** 2), color: mix(FLAME, BURNT, t) },
    };
  }
  if (sinceSpark < evo) {
    const t = (sinceSpark - BURN) / (evo - BURN);
    return { what: "Expanding", color: mix(BURNT, COOLING, t), opacity: 0.85 - 0.15 * t };
  }
  if (sinceSpark < ivo) {
    const t = (sinceSpark - evo) / (tdc - evo);
    return { what: "Exhaust", color: mix(COOLING, EXHAUST_GAS, clamp01(t * 3)), opacity: 0.7 - 0.25 * t };
  }
  if (sinceSpark < ivc) {
    // Fresh charge displaces the exhaust as the piston draws it in.
    const t = clamp01((sinceSpark - ivo) / 200);
    return { what: "Intake", color: mix(EXHAUST_GAS, FRESH, t), opacity: 0.45 + 0.1 * t };
  }
  const t = (sinceSpark - ivc) / (720 - ivc);
  return { what: "Compressing", color: mix(FRESH, COMPRESSED, t), opacity: 0.55 + 0.25 * t };
}

const CONTENTS: Record<string, string> = {
  Spark: "the spark is lighting the compressed charge",
  Burning: "the flame front is burning across the chamber",
  Expanding: "hot, high-pressure combustion gases",
  Exhaust: "spent exhaust gases on their way out",
  Intake: "a fresh air/fuel charge drawn in from the carburetor",
  Compressing: "the air/fuel charge being squeezed",
};

// Chamber plus the bore down to the piston crown.
const gasPath = (crown: number) =>
  `M${-HB},${crown}L${-HB},-0.45Q${-HB},${ROOF} -2.05,${ROOF}L1.95,${ROOF}L${HB},-0.25L${HB},${crown}Z`;

// --- Static shapes -----------------------------------------------------------

const INTAKE_PORT = `M-4.8,-3.3L-3.55,-2.9C-1.5,-2.9 -0.15,-1.8 -0.15,${ROOF}L-2.05,${ROOF}C-2.05,-1.4 -2.6,-1.7 -3.55,-1.7L-4.8,-2.1Z`;
const EXHAUST_PORT = `M5.2,-2.9L3.55,-2.3C1.9,-2.3 0.37,-1.7 0.37,${ROOF}L1.93,${ROOF}C1.93,-1.1 2.6,-1.4 3.55,-1.4L5.2,-2Z`;
const INTAKE_FLOW = "M-4.8,-2.7L-3.55,-2.3C-1.6,-2.3 -1.1,-1.6 -1.1,-0.75";
const EXHAUST_FLOW = "M1.15,-0.75C1.15,-1.5 2,-1.85 3.55,-1.85L5.2,-2.45";
const BLOCK_SIDE = `M-3.45,0L${-HB},0L${-HB},6L-2.9,6.5L-3.7,9.8L-4.5,9.8L-4.5,9.5L-4.15,9.5L-3.45,6.3Z`;

// A valve, drawn with its face at the origin and the stem running up (-y).
function valvePath(dia: number) {
  const r = dia / 2;
  const s = STEM / 2;
  return `M${-r},0L${r},0L${r - 0.09},-0.1Q${s + 0.12},-0.2 ${s},-0.8L${s},${-VALVE_LEN}L${-s},${-VALVE_LEN}L${-s},-0.8Q${-s - 0.12},-0.2 ${-(r - 0.09)},-0.1Z`;
}

function springPath(x: number, bottom: number, top: number) {
  const coils = 7;
  const pts = [`M${x - 0.7},${bottom}`];
  for (let i = 1; i <= coils * 2; i++) {
    pts.push(`L${x + (i % 2 ? 0.7 : -0.7)},${bottom + ((top - bottom) * i) / (coils * 2)}`);
  }
  return pts.join("");
}

// Crank counterweight: a 130° sector of 3.3" radius opposite the pin.
const CW = 3.3;
const cwPoint = (deg: number) => `${(CW * Math.sin((deg * Math.PI) / 180)).toFixed(3)},${(CW * Math.cos((deg * Math.PI) / 180)).toFixed(3)}`;
const COUNTERWEIGHT = `M-1.45,0.2L${cwPoint(-65)}A${CW} ${CW} 0 0 0 ${cwPoint(65)}L1.45,0.2Z`;

const PARTS: Record<string, { name: string; detail: string }> = {
  head: { name: "Cylinder head", detail: "AFR 2110 aluminum head: 345cc rectangular intake port, 117cc chamber." },
  block: { name: "Engine block", detail: `Gen VI big block, cast iron. ${BORE.toFixed(3)}" bore, 9.8" deck.` },
  gasket: { name: "Head gasket", detail: 'Thin Cometic MLS (drawn at about 0.040" compressed) to raise compression.' },
  coolant: { name: "Coolant passages", detail: "Water jackets around the bore and through the head." },
  piston: { name: "Piston", detail: `Mahle forged aluminum flat top, ${COMP_HEIGHT.toFixed(2)}" compression height, with 2 compression rings and an oil ring.` },
  pin: { name: "Wrist pin", detail: `${PIN_DIA.toFixed(3)}" pin joining the piston to the rod.` },
  rod: { name: "Connecting rod", detail: `Scat forged H-beam, ${ROD}" centre to centre.` },
  crank: { name: "Crankshaft", detail: `Scat forged steel, ${STROKE}" stroke (${R.toFixed(3)}" throw) on a ${ROD_JOURNAL}" rod journal, internally balanced.` },
  intakeValve: { name: "Intake valve", detail: `${INTAKE_VALVE.toFixed(2)}" AFR valve, ${INTAKE.lift.toFixed(3)}" lift.` },
  exhaustValve: { name: "Exhaust valve", detail: `${EXHAUST_VALVE.toFixed(2)}" AFR valve, ${EXHAUST.lift.toFixed(3)}" lift.` },
  springs: { name: "Valve springs", detail: "Comp Cams springs, 140 lbs on the seat, with retainers and bronze valve guides." },
  plug: { name: "Spark plug", detail: `Fires ${SPARK_ADVANCE}° before TDC: mechanical timing, MSD HEI distributor.` },
  intakePort: { name: "Intake port", detail: "Air/fuel from the 850 cfm carb through the AFR dual plane intake." },
  exhaustPort: { name: "Exhaust port", detail: "Out to the Hooker headers and 3.25\" true dual exhaust." },
  pan: { name: "Oil pan", detail: "Moroso deep drag pan, trimmed to fit the F-body." },
};

const ABOUT_STROKE: Record<string, string> = {
  Power: `The burning charge drives the piston down. The exhaust valve cracks open ${timing(EVO)} to start blowdown.`,
  Exhaust: `The piston pushes the spent gases out past the ${EXHAUST_VALVE.toFixed(2)}" exhaust valve.`,
  Intake: `The piston draws a fresh air/fuel charge in past the ${INTAKE_VALVE.toFixed(2)}" intake valve, which stays open until ${timing(events(INTAKE).close)}.`,
  Compression: `Both valves are shut and the piston squeezes the charge about ${COMPRESSION}:1. The plug fires at ${SPARK_ADVANCE}° BTDC.`,
};

// --- Valve timing dial -------------------------------------------------------

// The 720° cycle laid around one turn (one cam revolution), firing TDC at top.
const dialPt = (angle: number, r: number) => {
  const d = (((angle + 360) / 2) * Math.PI) / 180;
  return [r * Math.sin(d), -r * Math.cos(d)];
};
function dialArc(from: number, to: number, r: number) {
  const [x1, y1] = dialPt(from, r);
  const [x2, y2] = dialPt(to, r);
  return `M${x1},${y1}A${r} ${r} 0 ${to - from > 360 ? 1 : 0} 1 ${x2},${y2}`;
}

function TimingDial({ angle }: { angle: number }) {
  const [px, py] = dialPt(angle, 1.06);
  const [sx1, sy1] = dialPt(SPARK_AT, 0.84);
  const [sx2, sy2] = dialPt(SPARK_AT, 1.1);
  return (
    <svg className="engine-dial" viewBox="-1.35 -1.35 2.7 2.7" role="img" aria-label="Valve timing dial">
      {STROKES.map((s) => (
        <path key={s.name} d={dialArc(s.from, s.to, 1)} stroke={s.color} strokeWidth={0.14} fill="none" opacity={0.75} />
      ))}
      {[EXHAUST, INTAKE].map((v, i) => (
        <path
          key={v.name}
          d={dialArc(events(v).open, events(v).close, 0.74 - i * 0.16)}
          stroke={v.color}
          strokeWidth={0.1}
          strokeLinecap="round"
          fill="none"
        />
      ))}
      <line x1={sx1} y1={sy1} x2={sx2} y2={sy2} stroke="#fff1a8" strokeWidth={0.05} />
      <text x={0} y={-1.2} textAnchor="middle" className="engine-dial-text">
        Firing TDC
      </text>
      <text x={0} y={1.29} textAnchor="middle" className="engine-dial-text">
        Overlap TDC
      </text>
      <line x1={0} y1={0} x2={px} y2={py} stroke="#eef0f4" strokeWidth={0.05} strokeLinecap="round" />
      <circle r={0.07} fill="#eef0f4" />
    </svg>
  );
}

// --- Component ---------------------------------------------------------------

type Motion = { angle: number; flowIn: number; flowEx: number };

export default function EngineAnimation() {
  const box = useRef<HTMLDivElement>(null);
  const [m, setM] = useState<Motion>({ angle: 200, flowIn: 0, flowEx: 0 });
  const [playing, setPlaying] = useState(
    () => typeof window === "undefined" || !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [rpm, setRpm] = useState(12);
  const [visible, setVisible] = useState(false);
  const [part, setPart] = useState<string | null>(null);
  const [dims, setDims] = useState(false);
  const [magnify, setMagnify] = useState(true);
  const [lens, setLens] = useState<{ x: number; y: number } | null>(null);

  // Turn the crank by `d` degrees, moving the port flow by how far each valve is open.
  const turn = (d: number) =>
    setM((s) => {
      const angle = wrap(s.angle + d);
      return { angle, flowIn: s.flowIn + liftAt(INTAKE, angle) * d, flowEx: s.flowEx + liftAt(EXHAUST, angle) * d };
    });
  const turnTo = (a: number) => setM((s) => {
    const d = wrap(a - s.angle);
    const angle = wrap(a);
    return { angle, flowIn: s.flowIn + liftAt(INTAKE, angle) * d, flowEx: s.flowEx + liftAt(EXHAUST, angle) * d };
  });

  // Only run while the animation is on screen.
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting));
    io.observe(box.current!);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!playing || !visible) return;
    let last = performance.now();
    let id = requestAnimationFrame(function tick(t) {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      turn(rpm * 6 * dt); // rpm × 360° / 60 s
      id = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(id);
  }, [playing, visible, rpm]);

  const { angle } = m;
  const k = crank(angle);
  const liftIn = liftAt(INTAKE, angle);
  const liftEx = liftAt(EXHAUST, angle);
  const gas = charge(angle);
  const stroke = strokeAt(angle);
  const sinceSpark = (((angle - SPARK_AT) % 720) + 720) % 720;
  const spark = sinceSpark < 6;
  const kernel = { x: PLUG_TIP.x - 0.075, y: PLUG_TIP.y + 0.03 };
  const crown = k.crown;
  const pushing = sinceSpark > 12 && sinceSpark < 120;
  const status = spark
    ? "Spark!"
    : liftIn > 0 && liftEx > 0
      ? "Overlap: both valves open"
      : sinceSpark < BURN
        ? "Combustion"
        : stroke.name === "Power" && liftEx > 0
          ? "Blowdown: exhaust valve open"
          : stroke.name === "Compression" && liftIn > 0
            ? "Intake valve still closing"
            : null;

  function hover(e: RPointerEvent<SVGSVGElement>) {
    const el = (e.target as Element).closest("[data-part]");
    setPart(el ? el.getAttribute("data-part") : null);
    const ctm = e.currentTarget.getScreenCTM();
    if (ctm) {
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
      setLens({ x: p.x, y: p.y });
    }
  }
  const cls = (id: string) => (part === id ? "eng-part on" : "eng-part");
  const info =
    part === "gas"
      ? { name: "Cylinder charge", detail: `Right now: ${CONTENTS[gas.what]}. ${CLEARANCE_CC.toFixed(0)} cc clearance + ${SWEPT_CC.toFixed(0)} cc swept.` }
      : part
        ? PARTS[part]
        : null;

  return (
    <div className="engine" ref={box}>
      <svg
        className="engine-svg"
        viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
        role="img"
        aria-label={`Cutaway animation of one cylinder, currently on the ${stroke.name.toLowerCase()} stroke at ${timing(angle)}.`}
        onPointerMove={hover}
        onPointerDown={hover}
        onPointerLeave={() => (setPart(null), setLens(null))}
        onClick={() => setPlaying((p) => !p)}
      >
        <defs>
          {/* Section hatching: iron is dense and dark, aluminum light and open. */}
          <pattern id="eng-iron" width={0.16} height={0.16} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={0.16} height={0.16} fill="#4e5259" />
            <line x1={0} y1={0} x2={0} y2={0.16} stroke="#3c4046" strokeWidth={0.05} />
          </pattern>
          <pattern id="eng-alu" width={0.3} height={0.3} patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <rect width={0.3} height={0.3} fill="#a7aeb8" />
            <line x1={0} y1={0} x2={0} y2={0.3} stroke="#c0c6ce" strokeWidth={0.04} />
          </pattern>
          <linearGradient id="eng-piston" x1="0" x2="1">
            <stop offset="0" stopColor="#959ca6" />
            <stop offset="0.45" stopColor="#d9dde3" />
            <stop offset="1" stopColor="#959ca6" />
          </linearGradient>
          <linearGradient id="eng-steel" x1="0" x2="1">
            <stop offset="0" stopColor="#5f656e" />
            <stop offset="0.5" stopColor="#9ea5ae" />
            <stop offset="1" stopColor="#5f656e" />
          </linearGradient>
          <radialGradient id="eng-spark">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.3" stopColor="#bfe3ff" />
            <stop offset="1" stopColor="#7cc4ff" stopOpacity="0" />
          </radialGradient>
          <clipPath id="eng-gas">
            <path d={gasPath(crown)} />
          </clipPath>
          <marker id="eng-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
            <path d="M0,0L10,5L0,10Z" fill="context-stroke" />
          </marker>
        </defs>

        <g id="eng-scene">
        {/* Oil pan and oil */}
        <g data-part="pan" className={cls("pan")}>
          <path d="M-4.5,9.8L-4.5,13.95L4.5,13.95L4.5,9.8" fill="none" stroke="#2b2f36" strokeWidth={0.14} />
          <rect x={-4.43} y={13.25} width={8.86} height={0.63} fill="#8a5a14" opacity={0.55} />
        </g>

        {/* Crankshaft, turning about its main journal */}
        <g data-part="crank" className={cls("crank")} transform={`translate(0 ${CRANK_Y}) rotate(${angle})`}>
          <path d={COUNTERWEIGHT} fill="url(#eng-steel)" stroke="#2b2f36" strokeWidth={0.04} />
          <rect x={-1.45} y={-R - 1.45} width={2.9} height={R + 1.9} rx={1.45} fill="url(#eng-steel)" stroke="#2b2f36" strokeWidth={0.04} />
          <circle r={2.75 / 2} fill="#b9bfc7" stroke="#2b2f36" strokeWidth={0.04} />
          <circle r={0.18} fill="#2b2f36" />
        </g>

        {/* Piston body, with the hollow underside showing */}
        <g data-part="piston" className={cls("piston")} transform={`translate(0 ${crown})`}>
          <path d={`M${-HB + 0.01},0H${HB - 0.01}V2.75H1.95V0.35H-1.95V2.75H${-HB + 0.01}Z`} fill="url(#eng-piston)" stroke="#6f7680" strokeWidth={0.03} />
          <circle cx={0} cy={COMP_HEIGHT} r={0.8} fill="#868d97" />
          {[0.25, 0.45, 0.7].map((y, i) => (
            <g key={y}>
              <rect x={-HB + 0.01} y={y} width={0.2} height={i === 2 ? 0.16 : 0.06} fill="#3a3f46" />
              <rect x={HB - 0.21} y={y} width={0.2} height={i === 2 ? 0.16 : 0.06} fill="#3a3f46" />
            </g>
          ))}
        </g>

        {/* Connecting rod, from wrist pin to crank pin */}
        <g data-part="rod" className={cls("rod")} transform={`translate(0 ${k.pinY}) rotate(${k.rodAngle})`}>
          <path d={`M-0.42,0.6L0.42,0.6L0.66,${ROD - 1.4}L-0.66,${ROD - 1.4}Z`} fill="url(#eng-steel)" stroke="#2b2f36" strokeWidth={0.04} />
          <path d={`M-0.18,0.9L0.18,0.9L0.3,${ROD - 1.6}L-0.3,${ROD - 1.6}Z`} fill="#4a5058" />
          <circle r={0.75} fill="url(#eng-steel)" stroke="#2b2f36" strokeWidth={0.04} />
          <circle cy={ROD} r={1.58} fill="url(#eng-steel)" stroke="#2b2f36" strokeWidth={0.04} />
          <line x1={-1.58} x2={1.58} y1={ROD} y2={ROD} stroke="#2b2f36" strokeWidth={0.04} />
        </g>
        <g data-part="crank" className={cls("crank")}>
          <circle cx={k.pin.x} cy={k.pin.y} r={ROD_JOURNAL / 2} fill="#c3c8cf" stroke="#9a7a3a" strokeWidth={0.06} />
        </g>
        <g data-part="pin" className={cls("pin")}>
          <circle cx={0} cy={k.pinY} r={PIN_DIA / 2} fill="#c3c8cf" stroke="#2b2f36" strokeWidth={0.04} />
        </g>

        {/* Iron block: cylinder walls, water jackets and crankcase */}
        <g data-part="block" className={cls("block")}>
          <path d={BLOCK_SIDE} fill="url(#eng-iron)" stroke="#2b2f36" strokeWidth={0.03} />
          <path d={BLOCK_SIDE} fill="url(#eng-iron)" stroke="#2b2f36" strokeWidth={0.03} transform="scale(-1 1)" />
        </g>
        <g data-part="coolant" className={cls("coolant")}>
          <rect x={-3.15} y={0.25} width={0.6} height={4.45} rx={0.12} fill="#2d5f8a" />
          <rect x={2.55} y={0.25} width={0.6} height={4.45} rx={0.12} fill="#2d5f8a" />
        </g>

        {/* Black head gasket */}
        <g data-part="gasket" className={cls("gasket")}>
          <rect x={-3.5} y={HEAD_FACE} width={3.5 - HB - 0.02} height={-HEAD_FACE} fill="#0b0b0c" />
          <rect x={HB + 0.02} y={HEAD_FACE} width={3.5 - HB - 0.02} height={-HEAD_FACE} fill="#0b0b0c" />
        </g>

        {/* Aluminum head, intake runner and header tube */}
        <g data-part="head" className={cls("head")}>
          <rect x={-3.55} y={HEAD_TOP} width={7.1} height={HEAD_FACE - HEAD_TOP} fill="url(#eng-alu)" stroke="#6f7680" strokeWidth={0.03} />
          <path d="M-4.8,-3.55L-3.55,-3.15L-3.55,-2.9L-4.8,-3.3ZM-4.8,-2.1L-3.55,-1.7L-3.55,-1.45L-4.8,-1.85Z" fill="#8f97a2" />
        </g>
        <g data-part="exhaustPort" className={cls("exhaustPort")}>
          <path d="M5.2,-3.05L3.55,-2.45L3.55,-2.3L5.2,-2.9ZM5.2,-2L3.55,-1.4L3.55,-1.25L5.2,-1.85Z" fill="#5b5550" />
          <rect x={3.55} y={-2.55} width={0.2} height={1.3} fill="#5b5550" />
        </g>
        <g data-part="coolant" className={cls("coolant")}>
          <rect x={-3.35} y={-1.25} width={0.85} height={0.9} rx={0.15} fill="#2d5f8a" />
          <rect x={-0.6} y={-3.05} width={1.25} height={0.6} rx={0.15} fill="#2d5f8a" />
        </g>

        {/* Ports, holding fresh charge (intake) and exhaust */}
        <g data-part="intakePort" className={cls("intakePort")}>
          <path d={INTAKE_PORT} fill="#15171b" />
          <path d={INTAKE_PORT} fill={rgb(FRESH)} opacity={0.22 + 0.25 * (liftIn / INTAKE.lift)} />
          <path d={INTAKE_FLOW} className="eng-flow" strokeDashoffset={-m.flowIn * 0.06} opacity={liftIn / INTAKE.lift} />
        </g>
        <g data-part="exhaustPort" className={cls("exhaustPort")}>
          <path d={EXHAUST_PORT} fill="#15171b" />
          <path
            d={EXHAUST_PORT}
            fill={rgb(liftEx > 0 && stroke.name === "Power" ? COOLING : EXHAUST_GAS)}
            opacity={0.25 + 0.35 * (liftEx / EXHAUST.lift)}
          />
          <path d={EXHAUST_FLOW} className="eng-flow" strokeDashoffset={-m.flowEx * 0.06} opacity={liftEx / EXHAUST.lift} />
        </g>

        {/* Valve guides and hardened seats */}
        <g data-part="springs" className={cls("springs")}>
          <rect x={INTAKE_X - 0.3} y={HEAD_TOP} width={0.6} height={0.55} fill="#a0784a" />
          <rect x={EXHAUST_X - 0.28} y={HEAD_TOP} width={0.56} height={1.25} fill="#a0784a" />
        </g>
        <g data-part="head" className={cls("head")}>
          {[-2.12, -0.22, 0.3, 2.0].map((x) => (
            <rect key={x} x={x - 0.08} y={ROOF - 0.1} width={0.16} height={0.1} fill="#6b7078" />
          ))}
        </g>

        {/* The charge in the cylinder, with the flame front and flow */}
        <g data-part="gas" className={cls("gas")}>
          <path d={gasPath(crown)} fill="#101215" />
          <path d={gasPath(crown)} fill={rgb(gas.color)} opacity={gas.opacity} />
          <g clipPath="url(#eng-gas)">
            {gas.flame && (
              <circle cx={kernel.x} cy={kernel.y} r={gas.flame.r} fill={rgb(gas.flame.color)} opacity={0.9} />
            )}
            {liftIn > 0.05 && crown > 0.8 && (
              <path
                d={`M${INTAKE_X},${ROOF + liftIn}Q${INTAKE_X - 0.7},${crown * 0.5} ${INTAKE_X - 0.4},${crown - 0.2}`}
                className="eng-flow"
                strokeDashoffset={-m.flowIn * 0.06}
                opacity={liftIn / INTAKE.lift}
              />
            )}
            {liftEx > 0.05 && crown > 0.8 && (
              <path
                d={`M${EXHAUST_X - 0.5},${crown - 0.2}Q${EXHAUST_X + 0.3},${crown * 0.45} ${EXHAUST_X},${ROOF + liftEx}`}
                className="eng-flow"
                strokeDashoffset={-m.flowEx * 0.06}
                opacity={liftEx / EXHAUST.lift}
              />
            )}
            {pushing &&
              [-1.3, 0, 1.3].map((x) => (
                <line
                  key={x}
                  x1={x}
                  x2={x}
                  y1={crown - 0.9}
                  y2={crown - 0.25}
                  stroke="#fff3d6"
                  strokeWidth={0.07}
                  markerEnd="url(#eng-arrow)"
                  opacity={Math.sin(((sinceSpark - 12) / 108) * Math.PI) * 0.8}
                />
              ))}
          </g>
        </g>

        {/* Valves, springs and retainers */}
        {[
          { id: "intakeValve", x: INTAKE_X, dia: INTAKE_VALVE, lift: liftIn, fill: "#c9ccd0" },
          { id: "exhaustValve", x: EXHAUST_X, dia: EXHAUST_VALVE, lift: liftEx, fill: "#a99f94" },
        ].map((v) => {
          const retainer = ROOF + v.lift - VALVE_LEN + 0.35;
          return (
            <g key={v.id}>
              <g data-part={v.id} className={cls(v.id)} transform={`translate(${v.x} ${ROOF + v.lift})`}>
                <path d={valvePath(v.dia)} fill={v.fill} stroke="#2b2f36" strokeWidth={0.03} />
              </g>
              <g data-part="springs" className={cls("springs")}>
                <rect x={v.x - 0.75} y={HEAD_TOP - 0.07} width={1.5} height={0.07} fill="#7d838c" />
                <path d={springPath(v.x, HEAD_TOP - 0.07, retainer)} fill="none" stroke="#9aa1ab" strokeWidth={0.12} strokeLinejoin="round" />
                <path d={`M${v.x - 0.8},${retainer}L${v.x + 0.8},${retainer}L${v.x + 0.55},${retainer - 0.25}L${v.x - 0.55},${retainer - 0.25}Z`} fill="#7d838c" stroke="#2b2f36" strokeWidth={0.03} />
              </g>
            </g>
          );
        })}

        {/* Spark plug, angled in under the exhaust port */}
        <g data-part="plug" className={cls("plug")} transform={`translate(${PLUG_TIP.x} ${PLUG_TIP.y}) rotate(${PLUG_ANGLE})`}>
          <rect x={0} y={-0.29} width={1.55} height={0.58} fill="#15171b" />
          <rect x={0.02} y={-0.27} width={0.8} height={0.54} fill="#8d939b" />
          {[0.12, 0.24, 0.36, 0.48, 0.6, 0.72].map((x) => (
            <line key={x} x1={x} x2={x + 0.06} y1={-0.27} y2={0.27} stroke="#5f656e" strokeWidth={0.025} />
          ))}
          <rect x={0.82} y={-0.36} width={0.06} height={0.72} fill="#c3a46a" />
          <rect x={0.88} y={-0.41} width={0.5} height={0.82} fill="url(#eng-steel)" stroke="#2b2f36" strokeWidth={0.03} />
          <path d="M1.38,-0.25L2.3,-0.2L2.3,0.2L1.38,0.25Z" fill="#ebe8e0" stroke="#9a978f" strokeWidth={0.02} />
          <rect x={2.2} y={-0.28} width={0.85} height={0.56} rx={0.12} fill="#7d2a22" />
          <rect x={-0.12} y={-0.03} width={0.14} height={0.06} fill="#c3c8cf" />
          <path d="M0.02,0.2L-0.15,0.2L-0.15,0.06" fill="none" stroke="#c3c8cf" strokeWidth={0.05} />
        </g>
        {spark && (
          <g pointerEvents="none">
            <circle cx={kernel.x} cy={kernel.y} r={0.9 - sinceSpark * 0.1} fill="url(#eng-spark)" />
            <path
              d={`M${kernel.x - 0.05},${kernel.y - 0.1}l0.08,0.07l-0.06,0.03l0.07,0.09`}
              stroke="#ffffff"
              strokeWidth={0.04}
              fill="none"
            />
          </g>
        )}
        </g>

        {/* Bore, stroke and TDC/BDC marks */}
        {dims && (
          <g className="eng-dims" pointerEvents="none">
            {[
              { y: DECK_CLEARANCE, label: "TDC" },
              { y: DECK_CLEARANCE + STROKE, label: "BDC" },
            ].map((d) => (
              <g key={d.label}>
                <line x1={-HB} x2={HB} y1={d.y} y2={d.y} strokeDasharray="0.12 0.1" />
                <text x={HB - 0.1} y={d.y - 0.1} textAnchor="end">
                  {d.label}
                </text>
              </g>
            ))}
            <line
              x1={-1.75}
              x2={-1.75}
              y1={DECK_CLEARANCE + 0.05}
              y2={DECK_CLEARANCE + STROKE - 0.05}
              markerStart="url(#eng-arrow)"
              markerEnd="url(#eng-arrow)"
            />
            <text transform={`translate(-1.9 ${DECK_CLEARANCE + STROKE / 2}) rotate(-90)`} textAnchor="middle">
              {STROKE.toFixed(2)}" stroke
            </text>
            <line x1={-HB + 0.05} x2={HB - 0.05} y1={5.75} y2={5.75} markerStart="url(#eng-arrow)" markerEnd="url(#eng-arrow)" />
            <text x={0} y={5.6} textAnchor="middle">
              {BORE.toFixed(3)}" bore
            </text>
          </g>
        )}

        {/* Magnifier: the scene again at 3×, clipped to a circle at the pointer */}
        {magnify && lens && (
          <g pointerEvents="none">
            <clipPath id="eng-lens">
              <circle cx={lens.x} cy={lens.y} r={LENS_R} />
            </clipPath>
            <circle cx={lens.x} cy={lens.y} r={LENS_R} fill="#0e1014" />
            <g clipPath="url(#eng-lens)">
              <g transform={`translate(${lens.x} ${lens.y}) scale(${LENS_ZOOM}) translate(${-lens.x} ${-lens.y})`}>
                <use href="#eng-scene" />
              </g>
            </g>
            <circle cx={lens.x} cy={lens.y} r={LENS_R} fill="none" stroke="#e0a030" strokeWidth={0.05} />
          </g>
        )}
      </svg>

      <div className="engine-panel">
        <div className="engine-stroke" style={{ color: stroke.color }}>
          {stroke.name} stroke
        </div>
        <p className="engine-about">{ABOUT_STROKE[stroke.name]}</p>
        <p className="engine-status">{status ?? " "}</p>

        <dl className="engine-read">
          <dt>Crank</dt>
          <dd>
            {Math.round(angle)}° · {timing(angle)}
          </dd>
          <dt>Piston</dt>
          <dd>{k.fromTdc.toFixed(3)}" from TDC</dd>
          <dt>Volume</dt>
          <dd>{k.volumeCc.toFixed(0)} cc</dd>
          <dt style={{ color: INTAKE.color }}>Intake</dt>
          <dd>{liftIn > 0.0005 ? `${liftIn.toFixed(3)}" open` : "closed"}</dd>
          <dt style={{ color: EXHAUST.color }}>Exhaust</dt>
          <dd>{liftEx > 0.0005 ? `${liftEx.toFixed(3)}" open` : "closed"}</dd>
        </dl>

        <TimingDial angle={angle} />

        <div className="engine-controls">
          <button type="button" onClick={() => setPlaying((p) => !p)} aria-pressed={playing}>
            {playing ? "Pause" : "Play"}
          </button>
          <button type="button" aria-label="Back 1 degree" onClick={() => (setPlaying(false), turn(-1))}>
            −1°
          </button>
          <button type="button" aria-label="Forward 1 degree" onClick={() => (setPlaying(false), turn(1))}>
            +1°
          </button>
        </div>
        <label className="engine-slider">
          Crank angle
          <input
            type="range"
            min={-360}
            max={359}
            step={1}
            value={Math.round(angle)}
            onChange={(e) => (setPlaying(false), turnTo(Number(e.target.value)))}
          />
        </label>
        <label className="engine-slider">
          Speed · {rpm} rpm
          <input type="range" min={2} max={60} step={1} value={rpm} onChange={(e) => setRpm(Number(e.target.value))} />
        </label>
        <div className="engine-controls">
          {STROKES.map((s) => (
            <button key={s.name} type="button" onClick={() => (setPlaying(false), turnTo(s.from))} style={{ borderColor: s.color }}>
              {s.name}
            </button>
          ))}
          <button type="button" onClick={() => (setPlaying(false), turnTo(SPARK_AT))} style={{ borderColor: "#fff1a8" }}>
            Spark
          </button>
        </div>
        <label className="engine-check">
          <input type="checkbox" checked={dims} onChange={(e) => setDims(e.target.checked)} /> Show bore, stroke, TDC and BDC
        </label>
        <label className="engine-check">
          <input type="checkbox" checked={magnify} onChange={(e) => setMagnify(e.target.checked)} /> Magnifier (3×) under the pointer
        </label>

        <div className="engine-info">
          {info ? (
            <>
              <strong>{info.name}</strong>
              <span>{info.detail}</span>
            </>
          ) : (
            <span className="engine-hint">Point at a part to see what it is. Click the engine to pause or play.</span>
          )}
        </div>

        <ul className="engine-legend">
          <li><span style={{ background: "#4e5259" }} />Cast iron</li>
          <li><span style={{ background: "#b4bac3" }} />Aluminum</li>
          <li><span style={{ background: "#8d939b" }} />Steel</li>
          <li><span style={{ background: "#0b0b0c", outline: "1px solid #555" }} />Head gasket</li>
          <li><span style={{ background: "#2d5f8a" }} />Coolant</li>
          <li><span style={{ background: "#a0784a" }} />Bronze guides</li>
        </ul>
      </div>
    </div>
  );
}
