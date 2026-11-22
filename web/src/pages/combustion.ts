import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Points,
  ShaderMaterial,
  Vector3,
} from "three";

// The four-stroke overlay on the Engine Model page: the charge drawn into
// each cylinder through its intake port, squeezed by the piston, lit by the
// plug 20 degrees before TDC, burning, and pushed out through the exhaust
// port, with flame out of the port face. Everything follows the crank angle
// of the GLB's clip; only the flame's flicker runs on the wall clock.
//
// The geometry (bore axes, crown heights per frame, plug tips, port centre
// lines) comes from scripts/export_engine_glb.py, as the scene's extras.

type V3 = [number, number, number];

export interface FlowCylinder {
  n: number;
  bank: string;
  origin: V3; // on the crank centre line
  axis: V3; // up the bore
  deck: number; // distances along the axis from origin
  roof: number;
  bore_r: number;
  plug: V3;
  valve_i: V3;
  valve_e: V3;
  intake: V3[]; // port face -> valve
  exhaust: V3[]; // valve -> port face
  exhaust_dir: V3;
  fire_deg: number;
  crown: number[]; // per frame, 7.5 crank degrees apart, 0-720
}

export interface FlowData {
  clip_deg: number;
  // Relative to each cylinder's firing TDC.
  events: { spark: number; eo: number; ec: number; io: number; ic: number };
  cylinders: FlowCylinder[];
}

const CHARGE_N = 120; // in the cylinder
const INTAKE_N = 48; // in the intake port
const EXHAUST_N = 40; // in the exhaust port
const FLAME_N = 56; // out of the port face
const SPARK_N = 2; // core and halo
const PER_CYL = CHARGE_N + INTAKE_N + EXHAUST_N + FLAME_N + SPARK_N;

const FRESH = new Color(0.25, 0.55, 1.0); // air and fuel
const SQUEEZED = new Color(0.62, 0.72, 1.0); // warmed by compression
const SPARK = new Color(0.85, 0.92, 1.0);
const FLAME_FRONT = new Color(1.0, 0.95, 0.75);
const BURNING = new Color(1.0, 0.55, 0.12);
const BURNT = new Color(0.75, 0.16, 0.04);
const EXHAUST = new Color(0.42, 0.14, 0.05);

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const frac = (x: number) => x - Math.floor(x);
const v3 = (a: V3) => new Vector3(a[0], a[1], a[2]);

// A seeded random so the particles land the same way on every load.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A polyline walked by arc-length fraction. */
class Path {
  private pts: Vector3[];
  private cum: number[];
  readonly length: number;
  constructor(pts: Vector3[]) {
    this.pts = pts;
    this.cum = [0];
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    this.length = this.cum[this.cum.length - 1];
  }
  /** Fraction of the way along at which point i sits. */
  fractionAt(i: number) {
    return this.cum[i] / this.length;
  }
  at(t: number, out: Vector3) {
    const s = clamp01(t) * this.length;
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < s) i++;
    const a = this.cum[i - 1];
    const span = this.cum[i] - a || 1;
    return out.lerpVectors(this.pts[i - 1], this.pts[i], (s - a) / span);
  }
}

/** Valve lift shape between the opening and closing angles (0-1). */
function lift(theta: number, open: number, close: number) {
  if (theta < open || theta >= close) return 0;
  return Math.sin((Math.PI * (theta - open)) / (close - open));
}

/** Gas moved through a port so far this cycle, in trips along it. */
function flowed(theta: number, open: number, close: number, trips: number) {
  const u = clamp01((theta - open) / (close - open));
  return (trips * (1 - Math.cos(Math.PI * u))) / 2;
}

interface Cyl {
  d: FlowCylinder;
  origin: Vector3;
  axis: Vector3;
  e1: Vector3;
  e2: Vector3;
  plug: Vector3;
  valveI: Vector3; // just under the intake valve, in the cylinder
  valveE: Vector3;
  intake: Path;
  intakeValveT: number; // where the intake path reaches the valve
  exhaust: Path;
  exhaustValveT: number;
  face: Vector3; // exhaust port opening
  dir: Vector3; // out of it
  f1: Vector3;
  f2: Vector3;
  stroke: number;
  crownMin: number;
  // per particle
  slot: Float32Array; // r, angle, s for the charge
  qOrder: Float32Array; // order the charge comes in and goes out
  portT: Float32Array; // starting place along the ports
  jitter: Float32Array; // sideways offsets in the ports and flame, xyz
  prevTheta: number;
  sparkTime: number;
}

const SPARK_HOLD = 0.12;

const VERT = /* glsl */ `
  attribute float alpha;
  attribute float size;
  attribute vec3 color;
  uniform float uScale;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = color;
    vAlpha = alpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = alpha > 0.0 ? size * uScale / -mv.z : 0.0;
  }
`;
const FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    if (r > 1.0) discard;
    gl_FragColor = vec4(vColor, vAlpha * pow(1.0 - r, 1.5));
  }
`;

export class Combustion {
  readonly group = new Group();
  private cyls: Cyl[] = [];
  private ev: FlowData["events"];
  private pos: Float32Array;
  private col: Float32Array;
  private alpha: Float32Array;
  private size: Float32Array;
  private geo = new BufferGeometry();
  private mat: ShaderMaterial;
  private tmp = new Vector3();
  private tmp2 = new Vector3();
  private c = new Color();

  constructor(data: FlowData) {
    this.ev = data.events;
    const total = PER_CYL * data.cylinders.length;
    this.pos = new Float32Array(total * 3);
    this.col = new Float32Array(total * 3);
    this.alpha = new Float32Array(total);
    this.size = new Float32Array(total);
    this.geo.setAttribute("position", new BufferAttribute(this.pos, 3));
    this.geo.setAttribute("color", new BufferAttribute(this.col, 3));
    this.geo.setAttribute("alpha", new BufferAttribute(this.alpha, 1));
    this.geo.setAttribute("size", new BufferAttribute(this.size, 1));
    this.mat = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 800 } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const points = new Points(this.geo, this.mat);
    points.frustumCulled = false;
    points.renderOrder = 10;
    this.group.add(points);
    this.group.name = "Combustion";

    const up = new Vector3(0, 1, 0);
    data.cylinders.forEach((d) => {
      const r = rng(1000 + d.n * 77);
      const origin = v3(d.origin);
      const axis = v3(d.axis).normalize();
      const e1 = new Vector3().crossVectors(axis, Math.abs(axis.y) < 0.9 ? up : new Vector3(1, 0, 0)).normalize();
      const e2 = new Vector3().crossVectors(axis, e1);
      const deckC = origin.clone().addScaledVector(axis, d.deck);
      // Just past each valve head, in the chamber (above the crown even at TDC).
      const valveI = v3(d.valve_i).lerp(deckC, 0.3);
      const valveE = v3(d.valve_e).lerp(deckC, 0.3);
      const inPts = [...d.intake.map(v3), valveI];
      const exPts = [valveE, ...d.exhaust.map(v3)];
      const intake = new Path(inPts);
      const exhaust = new Path(exPts);
      const dir = v3(d.exhaust_dir).normalize();
      const f1 = new Vector3().crossVectors(dir, axis).normalize();
      const f2 = new Vector3().crossVectors(dir, f1);
      const slot = new Float32Array(CHARGE_N * 3);
      const qOrder = new Float32Array(CHARGE_N);
      for (let i = 0; i < CHARGE_N; i++) {
        slot[i * 3] = Math.sqrt(r()) * 0.9;
        slot[i * 3 + 1] = r() * Math.PI * 2;
        slot[i * 3 + 2] = r();
        qOrder[i] = r();
      }
      const nPort = INTAKE_N + EXHAUST_N + FLAME_N;
      const portT = new Float32Array(nPort);
      const jitter = new Float32Array(nPort * 3);
      for (let i = 0; i < nPort; i++) {
        portT[i] = r();
        const a = r() * Math.PI * 2;
        const m = Math.sqrt(r());
        jitter[i * 3] = Math.cos(a) * m;
        jitter[i * 3 + 1] = Math.sin(a) * m;
        jitter[i * 3 + 2] = r() * 2 - 1;
      }
      const crownMin = Math.min(...d.crown);
      this.cyls.push({
        d,
        origin,
        axis,
        e1,
        e2,
        plug: v3(d.plug),
        valveI,
        valveE,
        intake,
        intakeValveT: intake.fractionAt(inPts.length - 2),
        exhaust,
        exhaustValveT: exhaust.fractionAt(1),
        face: exPts[exPts.length - 1].clone(),
        dir,
        f1,
        f2,
        stroke: Math.max(...d.crown) - crownMin,
        crownMin,
        slot,
        qOrder,
        portT,
        jitter,
        prevTheta: 0,
        sparkTime: -1,
      });
    });
  }

  /** Point size scale: drawing-buffer height over the view's vertical extent at 1 m. */
  setPixelScale(bufferHeight: number, fovDeg: number) {
    this.mat.uniforms.uScale.value = bufferHeight / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }

  /** deg: crank angle of the clip (0-720); time: wall clock in seconds. */
  update(deg: number, time: number) {
    this.cyls.forEach((cy, ci) => this.updateCylinder(cy, ci * PER_CYL, deg, time));
    for (const name of ["position", "color", "alpha", "size"]) this.geo.getAttribute(name).needsUpdate = true;
  }

  private put(i: number, p: Vector3, c: Color, a: number, s: number) {
    this.pos[i * 3] = p.x;
    this.pos[i * 3 + 1] = p.y;
    this.pos[i * 3 + 2] = p.z;
    this.col[i * 3] = c.r;
    this.col[i * 3 + 1] = c.g;
    this.col[i * 3 + 2] = c.b;
    this.alpha[i] = a;
    this.size[i] = s;
  }

  private updateCylinder(cy: Cyl, base: number, deg: number, time: number) {
    const { ev } = this;
    const d = cy.d;
    const theta = (((deg - d.fire_deg) % 720) + 720) % 720; // 0 = this cylinder's firing TDC
    const phi = theta >= 680 ? theta - 720 : theta; // runs -40 .. 680, so the burn isn't split by the wrap

    // Crown height along the bore, between the clip's frames.
    const fi = (((deg % 720) + 720) % 720) / 7.5;
    const f0 = Math.floor(fi);
    const crown = d.crown[f0] + (d.crown[Math.min(f0 + 1, d.crown.length - 1)] - d.crown[f0]) * (fi - f0);
    const top = d.roof - 0.003;
    const gap = top - crown;
    const squeeze = clamp01((crown - cy.crownMin) / cy.stroke); // 0 at BDC, 1 at TDC

    const liftI = lift(theta, ev.io, ev.ic);
    const liftE = lift(theta, ev.eo, ev.ec);
    const intaking = theta >= ev.io && theta < ev.ic;
    const compressing = theta >= ev.ic || phi < ev.spark;
    const burning = !compressing && phi >= ev.spark && phi < ev.eo;
    const exhausting = theta >= ev.eo && theta < ev.ec;

    // How much fresh charge is in, and how much burnt gas is out.
    const filled = intaking ? smooth(ev.io + 5, ev.ic - 15, theta) : compressing ? 1 : 0;
    const blown = exhausting
      ? 0.55 * smooth(ev.eo, ev.eo + 55, theta) + 0.45 * smooth(ev.eo + 55, ev.ec - 5, theta)
      : theta >= ev.ec && theta < 680
        ? 1
        : 0;
    // The flame front grows out from the plug over about 45 degrees.
    const front = burning ? cy.d.bore_r * 2.4 * smooth(ev.spark + 4, 25, phi) : 0;

    const { e1, e2, axis, origin, slot, qOrder } = cy;
    const p = this.tmp;
    const c = this.c;

    // The charge in the cylinder.
    for (let i = 0; i < CHARGE_N; i++) {
      const q = qOrder[i];
      const ang = slot[i * 3 + 1] + theta * 0.012; // a slow swirl
      const rad = slot[i * 3] * d.bore_r;
      p.copy(origin)
        .addScaledVector(axis, crown + slot[i * 3 + 2] * gap)
        .addScaledVector(e1, Math.cos(ang) * rad)
        .addScaledVector(e2, Math.sin(ang) * rad);
      let a = 0;
      if (intaking && q < filled) {
        // Fresh charge, each particle coming in from the intake valve.
        const inn = clamp01((filled - q) / 0.18);
        p.lerpVectors(cy.valveI, p, smooth(0, 1, inn));
        c.copy(FRESH);
        a = 0.85;
      } else if (compressing) {
        c.copy(FRESH).lerp(SQUEEZED, squeeze * squeeze);
        a = 0.75 + 0.25 * squeeze;
      } else if (burning || (exhausting && q >= blown)) {
        const dist = p.distanceTo(cy.plug);
        if (burning && dist > front) {
          c.copy(SQUEEZED); // not reached yet
          a = 0.9;
        } else {
          // Hot behind the front, cooling as the piston goes down and the gas goes out.
          const behind = burning ? clamp01((front - dist) / (d.bore_r * 0.6)) : 1;
          const cool = smooth(10, ev.eo + 60, phi);
          c.copy(FLAME_FRONT).lerp(BURNING, behind).lerp(BURNT, cool);
          if (exhausting) c.lerp(EXHAUST, smooth(ev.eo + 60, ev.ec, theta));
          a = 1;
        }
      } else if (exhausting && q < blown) {
        // On its way out through the exhaust valve.
        const out = clamp01((blown - q) / 0.12);
        if (out < 1) {
          p.lerp(cy.valveE, smooth(0, 1, out));
          c.copy(BURNT).lerp(EXHAUST, smooth(ev.eo + 60, ev.ec, theta));
          a = 1 - out;
        }
      } else if (intaking && theta < ev.ec && q >= blown) {
        // Overlap: the last of the burnt gas still leaving as the fresh comes in.
        c.copy(EXHAUST);
        a = 0.6;
      }
      this.put(base + i, p, c, a, 0.0075);
    }

    // The intake port: air standing in it, flowing while the valve is open.
    let k = base + CHARGE_N;
    const inFlow = theta >= ev.io ? flowed(theta, ev.io, ev.ic, 3) : 0;
    for (let i = 0; i < INTAKE_N; i++) {
      const t = frac(cy.portT[i] + inFlow);
      cy.intake.at(t, p);
      p.addScaledVector(e1, cy.jitter[i * 3] * 0.011).addScaledVector(e2, cy.jitter[i * 3 + 1] * 0.011);
      let a = 0.35 + 0.65 * liftI;
      if (t > cy.intakeValveT) a = liftI; // past the valve only while it's open
      this.put(k + i, p, FRESH, a, 0.0065);
    }

    // The exhaust port: hot gas while the exhaust valve is open.
    k += INTAKE_N;
    const exFlow = theta >= ev.eo ? flowed(theta, ev.eo, ev.ec, 4) : 0;
    const blowdown = 1 - smooth(ev.eo + 20, ev.eo + 120, theta);
    for (let i = 0; i < EXHAUST_N; i++) {
      const j = INTAKE_N + i;
      const t = frac(cy.portT[j] + exFlow);
      cy.exhaust.at(t, p);
      p.addScaledVector(e1, cy.jitter[j * 3] * 0.01).addScaledVector(e2, cy.jitter[j * 3 + 1] * 0.01);
      c.copy(BURNING).lerp(BURNT, 1 - blowdown).lerp(EXHAUST, smooth(ev.eo + 120, ev.ec, theta));
      this.put(k + i, p, c, exhausting ? Math.min(1, liftE * 1.6) : 0, 0.007);
    }

    // Flame out of the port face, strongest at blowdown.
    k += EXHAUST_N;
    const u = exhausting ? (theta - ev.eo) / (ev.ec - ev.eo) : 1;
    const flame = exhausting ? smooth(0, 0.04, u) * Math.pow(1 - u, 1.3) : 0;
    const reach = 0.05 + 0.11 * flame;
    for (let i = 0; i < FLAME_N; i++) {
      const j = INTAKE_N + EXHAUST_N + i;
      const life = 0.14 + 0.08 * cy.portT[j];
      const age = frac(time / life + cy.portT[j]);
      const wob = Math.sin(time * 23 + j * 1.7) * 0.25;
      const along = age * reach;
      p.copy(cy.face)
        .addScaledVector(cy.dir, along)
        .addScaledVector(cy.f1, (cy.jitter[j * 3] + wob) * along * 0.28)
        .addScaledVector(cy.f2, cy.jitter[j * 3 + 1] * along * 0.28);
      c.copy(FLAME_FRONT).lerp(BURNING, smooth(0.05, 0.4, age)).lerp(BURNT, smooth(0.45, 1, age));
      const a = flame > 0.01 ? flame * Math.pow(1 - age, 1.1) : 0;
      this.put(k + i, p, c, a, 0.012 + 0.03 * age);
    }

    // The spark: from 20 degrees before TDC, a few degrees long.
    k += FLAME_N;
    // At speed those degrees go by within a screen frame, so once the crank
    // passes the firing point the flash is held for at least SPARK_HOLD s.
    const sparkAt = (ev.spark + 720) % 720;
    const moved = (theta - cy.prevTheta + 720) % 720;
    const toSpark = (sparkAt - cy.prevTheta + 720) % 720;
    if (moved < 360 && toSpark > 0 && toSpark <= moved) cy.sparkTime = time;
    cy.prevTheta = theta;
    const sparkOn = (phi >= ev.spark && phi < ev.spark + 7) || time - cy.sparkTime < SPARK_HOLD;
    const flick = 0.75 + 0.25 * Math.sin(time * 90 + d.n);
    this.put(k, cy.plug, SPARK, sparkOn ? flick : 0, 0.016);
    this.tmp2.copy(cy.plug);
    this.put(k + 1, this.tmp2, FRESH, sparkOn ? 0.6 * flick : 0, 0.05);
  }
}
