import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

// Dyno pull from April 11th, 2026 (Performance Engine and Machine), read off
// the shop's corrected HP/torque graph at 100 rpm steps.
// Each row is [rpm, corrected HP, corrected torque in ft-lbs].
const PULL: [number, number, number][] = [
  [3000, 260, 455], [3100, 290, 485], [3200, 310, 500], [3300, 330, 520],
  [3400, 360, 545], [3500, 370, 545], [3600, 385, 550], [3700, 405, 565],
  [3800, 425, 575], [3900, 440, 580], [4000, 455, 585], [4100, 475, 600],
  [4200, 495, 610], [4300, 505, 615], [4400, 520, 615], [4500, 535, 610],
  [4600, 540, 610], [4700, 555, 610], [4800, 560, 605], [4900, 555, 590],
  [5000, 570, 595], [5100, 575, 585], [5200, 585, 585], [5300, 605, 595],
  [5400, 610, 590], [5500, 575, 545], [5600, 515, 480],
];

const HP_COLOR = "#e5534b";
const TQ_COLOR = "#4ea1f3";

// Chart geometry, in viewBox units. Both y axes share the same 8 gridlines.
const W = 720;
const H = 380;
const M = { top: 16, right: 58, bottom: 44, left: 58 };
const RPM = [3000, 5600];
const HP = [250, 650];
const TQ = [440, 640];
const STEPS = 8;

const x = (rpm: number) => M.left + ((rpm - RPM[0]) / (RPM[1] - RPM[0])) * (W - M.left - M.right);
const yOf = (v: number, [lo, hi]: number[]) => H - M.bottom - ((v - lo) / (hi - lo)) * (H - M.top - M.bottom);

const path = (col: 1 | 2, range: number[]) =>
  PULL.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${yOf(p[col], range).toFixed(1)}`).join("");

const peakHp = PULL.reduce((a, b) => (b[1] > a[1] ? b : a));
// The torque peak is flat from 4300 to 4400; >= reports 4400 to match the spec sheet.
const peakTq = PULL.reduce((a, b) => (b[2] >= a[2] ? b : a));

export default function DynoChart() {
  const svg = useRef<SVGSVGElement>(null);
  const [idx, setIdx] = useState<number | null>(null);
  const [show, setShow] = useState({ hp: true, tq: true });

  // Snap the cursor to the nearest measured rpm.
  function track(e: PointerEvent<SVGSVGElement>) {
    const box = svg.current!.getBoundingClientRect();
    const vx = ((e.clientX - box.left) / box.width) * W;
    const rpm = RPM[0] + ((vx - M.left) / (W - M.left - M.right)) * (RPM[1] - RPM[0]);
    const i = Math.round((rpm - RPM[0]) / 100);
    setIdx(Math.max(0, Math.min(PULL.length - 1, i)));
  }

  function keys(e: KeyboardEvent<SVGSVGElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const step = e.key === "ArrowRight" ? 1 : -1;
    setIdx((i) => Math.max(0, Math.min(PULL.length - 1, (i ?? (step > 0 ? -1 : PULL.length)) + step)));
  }

  const p = idx === null ? null : PULL[idx];
  const px = p ? x(p[0]) : 0;
  const flip = px > W / 2;
  const tipW = 150;
  const tipX = flip ? px - tipW - 12 : px + 12;
  const rows = [
    { key: "rpm", label: "RPM", value: p?.[0].toLocaleString(), color: "#eef0f4" },
    show.hp && { key: "hp", label: "Horsepower", value: p && `${p[1]} HP`, color: HP_COLOR },
    show.tq && { key: "tq", label: "Torque", value: p && `${p[2]} ft-lbs`, color: TQ_COLOR },
  ].filter(Boolean) as { key: string; label: string; value: string; color: string }[];

  return (
    <figure className="dyno">
      <div className="dyno-legend">
        <button type="button" aria-pressed={show.hp} onClick={() => setShow((s) => ({ ...s, hp: !s.hp }))}>
          <span style={{ background: HP_COLOR }} /> Horsepower
        </button>
        <button type="button" aria-pressed={show.tq} onClick={() => setShow((s) => ({ ...s, tq: !s.tq }))}>
          <span style={{ background: TQ_COLOR }} /> Torque
        </button>
      </div>

      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        tabIndex={0}
        role="img"
        aria-label={`Dyno chart. Peak ${peakHp[1]} HP at ${peakHp[0]} rpm, peak ${peakTq[2]} ft-lbs at ${peakTq[0]} rpm. Use the arrow keys to step through the pull.`}
        onPointerMove={track}
        onPointerDown={track}
        onPointerLeave={(e) => e.pointerType === "mouse" && setIdx(null)}
        onKeyDown={keys}
        onBlur={() => setIdx(null)}
      >
        {Array.from({ length: STEPS + 1 }, (_, i) => {
          const y = H - M.bottom - (i / STEPS) * (H - M.top - M.bottom);
          return (
            <g key={i} className="dyno-grid">
              <line x1={M.left} x2={W - M.right} y1={y} y2={y} />
              <text x={M.left - 8} y={y} textAnchor="end" fill={HP_COLOR}>
                {HP[0] + ((HP[1] - HP[0]) * i) / STEPS}
              </text>
              <text x={W - M.right + 8} y={y} textAnchor="start" fill={TQ_COLOR}>
                {TQ[0] + ((TQ[1] - TQ[0]) * i) / STEPS}
              </text>
            </g>
          );
        })}
        {[3000, 3500, 4000, 4500, 5000, 5500].map((r) => (
          <g key={r} className="dyno-grid">
            <line x1={x(r)} x2={x(r)} y1={M.top} y2={H - M.bottom} />
            <text x={x(r)} y={H - M.bottom + 18} textAnchor="middle">
              {r}
            </text>
          </g>
        ))}
        <text className="dyno-axis" x={(M.left + W - M.right) / 2} y={H - 6} textAnchor="middle">
          Engine speed (RPM)
        </text>
        <text className="dyno-axis" transform={`translate(14 ${(M.top + H - M.bottom) / 2}) rotate(-90)`} textAnchor="middle" fill={HP_COLOR}>
          Corrected HP
        </text>
        <text className="dyno-axis" transform={`translate(${W - 10} ${(M.top + H - M.bottom) / 2}) rotate(90)`} textAnchor="middle" fill={TQ_COLOR}>
          Corrected torque (ft-lbs)
        </text>

        {show.tq && <path d={path(2, TQ)} fill="none" stroke={TQ_COLOR} strokeWidth={2.5} strokeLinejoin="round" />}
        {show.hp && <path d={path(1, HP)} fill="none" stroke={HP_COLOR} strokeWidth={2.5} strokeLinejoin="round" />}

        {p && (
          <g pointerEvents="none">
            <line className="dyno-cursor" x1={px} x2={px} y1={M.top} y2={H - M.bottom} />
            {show.tq && <circle cx={px} cy={yOf(p[2], TQ)} r={5} fill={TQ_COLOR} stroke="#0e1014" strokeWidth={2} />}
            {show.hp && <circle cx={px} cy={yOf(p[1], HP)} r={5} fill={HP_COLOR} stroke="#0e1014" strokeWidth={2} />}
            <g transform={`translate(${tipX} ${M.top + 6})`} className="dyno-tip">
              <rect width={tipW} height={14 + rows.length * 20} rx={6} />
              {rows.map((r, i) => (
                <g key={r.key} transform={`translate(10 ${21 + i * 20})`}>
                  <text fill="#9a9ea8">{r.label}</text>
                  <text x={tipW - 20} textAnchor="end" fill={r.color} fontWeight={600}>
                    {r.value}
                  </text>
                </g>
              ))}
            </g>
          </g>
        )}
      </svg>
      <figcaption>Hover or drag across the chart (or focus it and use the arrow keys) to read each point of the pull.</figcaption>
    </figure>
  );
}
