// Valve timing model shared by the cam profile chart and the engine animation.

// Cam card for the Comp Cams custom grind, as installed. Everything below is
// worked out from these numbers, so a new cam only needs this block changed.
export const CAM = {
  lsa: 110, // lobe separation angle
  advance: 4, // installed advance
  intake: { dur050: 242, advertised: 291, lift: 0.622 },
  exhaust: { dur050: 250, advertised: 301, lift: 0.618 },
};

// Crank angle convention: 0 is TDC at overlap, -180 is BDC at the end of the
// power stroke, +180 is BDC at the end of the intake stroke, ±360 is firing TDC.
export type Valve = {
  name: string;
  color: string;
  lift: number;
  center: number;
  half050: number; // half the duration at 0.050"
  halfSeat: number; // half the advertised duration
  k: number; // curve shape exponent
};

// The lift curve is lift·cos(π/2 · θ/halfSeat)^k, centred on the lobe centreline.
// It is zero at the advertised (seat) points, and k is chosen so the curve
// crosses 0.050" exactly at the 0.050" duration. This matches the timing events
// on the cam card; the ramps between seat and 0.050" are an approximation.
function valve(name: string, color: string, spec: typeof CAM.intake, center: number): Valve {
  const half050 = spec.dur050 / 2;
  const halfSeat = spec.advertised / 2;
  const k = Math.log(0.05 / spec.lift) / Math.log(Math.cos((Math.PI / 2) * (half050 / halfSeat)));
  return { name, color, lift: spec.lift, center, half050, halfSeat, k };
}

export const INTAKE = valve("Intake", "#4ea1f3", CAM.intake, CAM.lsa - CAM.advance);
export const EXHAUST = valve("Exhaust", "#e0a030", CAM.exhaust, -(CAM.lsa + CAM.advance));
export const VALVES = [EXHAUST, INTAKE];

// Lift at any crank angle; angles outside -360..360 wrap onto the cycle.
export function liftAt(v: Valve, angle: number) {
  const a = wrap(angle);
  // The exhaust event straddles -180 and the intake event +180, so neither
  // crosses the ±360 seam and no second copy of the lobe is needed.
  const t = (a - v.center) / v.halfSeat;
  return Math.abs(t) >= 1 ? 0 : v.lift * Math.cos((Math.PI / 2) * t) ** v.k;
}

// Any angle onto -360 <= a < 360.
export const wrap = (a: number) => ((((a + 360) % 720) + 720) % 720) - 360;

// "59° BBDC", "11° ATDC", "TDC", using the nearest TDC or BDC.
export function timing(angle: number) {
  const ref = Math.round(angle / 180) * 180;
  const d = Math.round(angle - ref);
  const mark = ref % 360 === 0 ? "TDC" : "BDC";
  return d === 0 ? mark : `${Math.abs(d)}° ${d < 0 ? "B" : "A"}${mark}`;
}

export const STROKES = [
  { name: "Power", from: -360, to: -180, color: "#e5534b", fill: "rgba(229, 83, 75, 0.10)" },
  { name: "Exhaust", from: -180, to: 0, color: "#e0a030", fill: "rgba(224, 160, 48, 0.10)" },
  { name: "Intake", from: 0, to: 180, color: "#4ea1f3", fill: "rgba(78, 161, 243, 0.10)" },
  { name: "Compression", from: 180, to: 360, color: "#6eb45a", fill: "rgba(110, 180, 90, 0.10)" },
];
export const strokeAt = (a: number) => STROKES.find((s) => wrap(a) < s.to) ?? STROKES[3];

export const events = (v: Valve) => ({
  open: v.center - v.half050,
  close: v.center + v.half050,
  seatOpen: v.center - v.halfSeat,
  seatClose: v.center + v.halfSeat,
});
