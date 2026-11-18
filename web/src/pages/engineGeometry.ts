// Geometry for the engine cutaway, in inches. Values marked "spec" come from
// the engine build page; the rest are standard Gen VI big block parts that the
// page doesn't list, chosen to be consistent with it.

export const BORE = 4.5; // spec
export const STROKE = 4.25; // spec
export const COMPRESSION = 9.4; // spec (~9.4:1)
export const CHAMBER_CC = 117; // spec, AFR 2110 chamber
export const INTAKE_VALVE = 2.3; // spec
export const EXHAUST_VALVE = 1.88; // spec

export const ROD = 6.535; // Scat H-beam, the usual length with a 4.25" stroke
export const DECK_HEIGHT = 9.8; // Gen VI standard deck
export const PIN_DIA = 0.99; // big block wrist pin
export const ROD_JOURNAL = 2.2;
export const MAIN_JOURNAL = 2.75;
export const STEM = 11 / 32; // valve stem
export const GASKET = 0.04; // thin Cometic MLS, compressed

const IN3_TO_CC = 16.387;
export const R = STROKE / 2; // crank throw
export const AREA = (Math.PI / 4) * BORE * BORE; // in²
export const SWEPT_CC = AREA * STROKE * IN3_TO_CC; // ~1107 cc per cylinder

// Clearance volume follows from the compression ratio. Whatever the chamber
// and gasket don't account for is the piston sitting down in the bore.
export const CLEARANCE_CC = SWEPT_CC / (COMPRESSION - 1);
const gasketCc = (Math.PI / 4) * 4.54 ** 2 * GASKET * IN3_TO_CC;
export const DECK_CLEARANCE = Math.max(0, (CLEARANCE_CC - CHAMBER_CC - gasketCc) / IN3_TO_CC / AREA); // ~0.016"

// Piston crown to wrist pin centre, so the crown sits DECK_CLEARANCE below the
// deck at TDC.
export const COMP_HEIGHT = DECK_HEIGHT - ROD - R - DECK_CLEARANCE; // ~1.12"

// Drawing coordinates: x across the bore, y downward, block deck at y = 0,
// crank centre at y = DECK_HEIGHT.
export const CRANK_Y = DECK_HEIGHT;
export const HEAD_FACE = -GASKET;
export const ROOF = HEAD_FACE - 0.6; // chamber roof where the valves seat
export const INTAKE_X = -1.1;
export const EXHAUST_X = 1.15;

// Crank angle in degrees: 0 and ±360 are TDC, ±180 BDC, turning clockwise.
export function crank(angle: number) {
  const a = (angle * Math.PI) / 180;
  const s = Math.sin(a);
  const c = Math.cos(a);
  const pinY = CRANK_Y - (R * c + Math.sqrt(ROD * ROD - R * R * s * s));
  const crown = pinY - COMP_HEIGHT;
  const fromTdc = crown - DECK_CLEARANCE;
  return {
    pin: { x: R * s, y: CRANK_Y - R * c }, // crank pin (rod big end)
    pinY, // wrist pin
    crown, // piston top
    fromTdc, // piston travel from TDC
    volumeCc: CLEARANCE_CC + AREA * fromTdc * IN3_TO_CC,
    rodAngle: (-Math.atan2(R * s, CRANK_Y - R * c - pinY) * 180) / Math.PI,
  };
}

// Spark plug: tip in the chamber's exhaust-side wall, body angled up and out
// under the exhaust port.
export const PLUG_TIP = { x: 2.12, y: -0.42 };
export const PLUG_ANGLE = -21; // degrees, from +x
export const SPARK_ADVANCE = 15; // spec: 15° BTDC
export const SPARK_AT = 360 - SPARK_ADVANCE; // crank angle the plug fires
