import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { CAM, EXHAUST, INTAKE, STROKES, VALVES, events, liftAt, strokeAt, timing, type Valve } from "./camModel";

// Chart geometry, in viewBox units.
const W = 720;
const H = 380;
const M = { top: 40, right: 20, bottom: 44, left: 58 };
const LIFT_MAX = 0.7;
const x = (a: number) => M.left + ((a + 360) / 720) * (W - M.left - M.right);
const y = (l: number) => H - M.bottom - (l / LIFT_MAX) * (H - M.top - M.bottom);

function curve(v: Valve) {
  const pts: string[] = [];
  for (let a = Math.ceil(v.center - v.halfSeat); a <= v.center + v.halfSeat; a += 1) {
    pts.push(`${pts.length ? "L" : "M"}${x(a).toFixed(1)},${y(liftAt(v, a)).toFixed(1)}`);
  }
  return pts.join("");
}

const overlap050 = events(EXHAUST).close - events(INTAKE).open;

// Area where both valves are off their seats (overlap), under the lower curve.
function overlapArea() {
  const from = Math.ceil(INTAKE.center - INTAKE.halfSeat);
  const to = Math.floor(EXHAUST.center + EXHAUST.halfSeat);
  if (to <= from) return "";
  let d = `M${x(from)},${y(0)}`;
  for (let a = from; a <= to; a++) d += `L${x(a).toFixed(1)},${y(Math.min(liftAt(INTAKE, a), liftAt(EXHAUST, a))).toFixed(1)}`;
  return d + `L${x(to)},${y(0)}Z`;
}

const TIP_W = 196;

export default function CamProfileChart() {
  const svg = useRef<SVGSVGElement>(null);
  const [angle, setAngle] = useState<number | null>(null);
  const [show, setShow] = useState({ Intake: true, Exhaust: true });
  const shown = VALVES.filter((v) => show[v.name as keyof typeof show]);

  function track(e: PointerEvent<SVGSVGElement>) {
    const box = svg.current!.getBoundingClientRect();
    const vx = ((e.clientX - box.left) / box.width) * W;
    const a = Math.round(((vx - M.left) / (W - M.left - M.right)) * 720 - 360);
    setAngle(Math.max(-360, Math.min(360, a)));
  }

  function keys(e: KeyboardEvent<SVGSVGElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const step = (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 10 : 2);
    setAngle((a) => Math.max(-360, Math.min(360, (a ?? EXHAUST.center) + step)));
  }

  const px = angle === null ? 0 : x(angle);
  const tipX = px > W / 2 ? px - TIP_W - 12 : px + 12;
  const rows =
    angle === null
      ? []
      : [
          { label: "Crank angle", value: `${angle}Â°`, color: "#eef0f4" },
          { label: "Timing", value: timing(angle), color: "#eef0f4" },
          { label: "Stroke", value: strokeAt(angle).name, color: "#eef0f4" },
          ...shown.map((v) => {
            const l = liftAt(v, angle);
            return { label: `${v.name} lift`, value: l > 0.0005 ? `${l.toFixed(3)}"` : "closed", color: v.color };
          }),
        ];

  return (
    <figure className="chart">
      <div className="chart-legend">
        {VALVES.map((v) => (
          <button
            key={v.name}
            type="button"
            aria-pressed={show[v.name as keyof typeof show]}
            onClick={() => setShow((s) => ({ ...s, [v.name]: !s[v.name as keyof typeof s] }))}
          >
            <span style={{ background: v.color }} /> {v.name}
          </button>
        ))}
      </div>

      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        tabIndex={0}
        role="img"
        aria-label={`Cam profile. Intake opens ${timing(events(INTAKE).open)} and closes ${timing(events(INTAKE).close)}; exhaust opens ${timing(events(EXHAUST).open)} and closes ${timing(events(EXHAUST).close)}, at 0.050 inch lift. Use the arrow keys to step through the cycle.`}
        onPointerMove={track}
        onPointerDown={track}
        onPointerLeave={(e) => e.pointerType === "mouse" && setAngle(null)}
        onKeyDown={keys}
        onBlur={() => setAngle(null)}
      >
        {STROKES.map((s) => (
          <g key={s.name}>
            <rect x={x(s.from)} y={M.top} width={x(s.to) - x(s.from)} height={H - M.top - M.bottom} fill={s.fill} />
            <text className="chart-axis" x={(x(s.from) + x(s.to)) / 2} y={M.top - 8} textAnchor="middle">
              {s.name}
            </text>
          </g>
        ))}

        {[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7].map((l) => (
          <g key={l} className="chart-grid">
            <line x1={M.left} x2={W - M.right} y1={y(l)} y2={y(l)} />
            <text x={M.left - 8} y={y(l)} textAnchor="end">
              {l.toFixed(1)}
            </text>
          </g>
        ))}
        <g className="chart-grid">
          <line x1={M.left} x2={W - M.right} y1={y(0.05)} y2={y(0.05)} strokeDasharray="3 4" />
        </g>
        {[-360, -270, -180, -90, 0, 90, 180, 270, 360].map((a) => (
          <g key={a} className={a % 180 === 0 ? "chart-grid chart-mark" : "chart-grid"}>
            <line x1={x(a)} x2={x(a)} y1={M.top} y2={H - M.bottom} />
            <text x={x(a)} y={H - M.bottom + 18} textAnchor="middle">
              {a % 360 === 0 ? `${a} TDC` : a % 180 === 0 ? `${a} BDC` : a}
            </text>
          </g>
        ))}
        <text className="chart-axis" x={(M.left + W - M.right) / 2} y={H - 6} textAnchor="middle">
          Crankshaft angle (degrees)
        </text>
        <text className="chart-axis" transform={`translate(14 ${(M.top + H - M.bottom) / 2}) rotate(-90)`} textAnchor="middle">
          Valve lift (in)
        </text>

        {shown.length === 2 && <path d={overlapArea()} className="cam-overlap" />}
        {shown.map((v) => {
          const ev = events(v);
          return (
            <g key={v.name}>
              <path d={curve(v)} fill="none" stroke={v.color} strokeWidth={2.5} strokeLinejoin="round" />
              {[ev.open, ev.close].map((a) => (
                <circle key={a} cx={x(a)} cy={y(0.05)} r={3.5} fill={v.color} />
              ))}
              {[ev.seatOpen, ev.seatClose].map((a) => (
                <circle key={a} cx={x(a)} cy={y(0)} r={3.5} fill="#0e1014" stroke={v.color} strokeWidth={1.5} />
              ))}
              <circle cx={x(v.center)} cy={y(v.lift)} r={3.5} fill={v.color} />
            </g>
          );
        })}

        {angle !== null && (
          <g pointerEvents="none">
            <line className="chart-cursor" x1={px} x2={px} y1={M.top} y2={H - M.bottom} />
            {shown.map((v) => (
              <circle key={v.name} cx={px} cy={y(liftAt(v, angle))} r={5} fill={v.color} stroke="#0e1014" strokeWidth={2} />
            ))}
            <g transform={`translate(${tipX} ${M.top + 6})`} className="chart-tip">
              <rect width={TIP_W} height={14 + rows.length * 20} rx={6} />
              {rows.map((r, i) => (
                <g key={r.label} transform={`translate(10 ${21 + i * 20})`}>
                  <text fill="#9a9ea8">{r.label}</text>
                  <text x={TIP_W - 20} textAnchor="end" fill={r.color} fontWeight={600}>
                    {r.value}
                  </text>
                </g>
              ))}
            </g>
          </g>
        )}
      </svg>
      <figcaption>
        Hover or drag across the chart (or focus it and use the arrow keys, Shift for bigger steps) to follow the valves
        through one 720Â° cycle. Filled dots are the 0.050" events, hollow dots the advertised (seat) events; the shaded
        sliver at TDC is overlap. Curve shape between those points is modelled from the cam card.
      </figcaption>

      <table className="sheet events">
        <thead>
          <tr>
            <th scope="col">At 0.050" lift</th>
            {VALVES.map((v) => (
              <th scope="col" key={v.name} style={{ color: v.color }}>
                {v.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(
            [
              ["Opens", (v: Valve) => timing(events(v).open)],
              // Cam cards quote lobe centerlines from overlap TDC, not the nearest BDC.
              ["Centerline", (v: Valve) => `${Math.abs(v.center)}Â° ${v.center < 0 ? "BTDC" : "ATDC"}`],
              ["Closes", (v: Valve) => timing(events(v).close)],
              ["Duration", (v: Valve) => `${v.half050 * 2}Â° (${v.halfSeat * 2}Â° advertised)`],
              ["Max lift", (v: Valve) => `${v.lift.toFixed(3)}"`],
            ] as [string, (v: Valve) => string][]
          ).map(([label, f]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              {VALVES.map((v) => (
                <td key={v.name}>{f(v)}</td>
              ))}
            </tr>
          ))}
          <tr>
            <th scope="row">Overlap</th>
            <td colSpan={2}>
              {overlap050}Â° at 0.050", {CAM.lsa}Â° LSA, installed {CAM.advance}Â° advanced
            </td>
          </tr>
        </tbody>
      </table>
    </figure>
  );
}
