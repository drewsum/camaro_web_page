import type { DriveState } from "../car/driveClock";

// Works out what the engine is doing from how the car is moving: which gear
// a driver would be in, the rpm that gear gives at the rear tyres' tread
// speed, and roughly how much throttle the acceleration needs. Scenes only
// describe motion, so this is the single place that knows the drivetrain.

const TIRE_RADIUS = 0.356; // m, 275/60R15
const FINAL = 3.91; // Dana 60
const GEARS = [2.2, 1.64, 1.28, 1.0]; // Muncie M22 close ratio
export const IDLE_RPM = 920;
const LIMIT_RPM = 6600; // where the HEI breaks up (the sim's limiter is 6800)
const SHIFT_TIME = 0.28; // s with the clutch in on a shift
// Acceleration the engine can give in each gear at wide open, m/s² (about
// 620 ft-lb through the gearing, 3550 lb, before traction limits).
const MAX_ACCEL = GEARS.map((g) => (840 * FINAL * g * 0.9) / TIRE_RADIUS / 1610);
const RPM_PER_MS = (60 / (2 * Math.PI * TIRE_RADIUS)) * FINAL; // rpm per m/s per unit ratio

export class Drivetrain {
  rpm = IDLE_RPM;
  throttle = 0;
  private gear = 0;
  private shiftLeft = 0; // s of clutch-in left on the current shift
  private sinceShift = 10;
  private lastTread: number | null = null;
  private smoothTread = 0;
  private pull = 0; // smoothed acceleration while on the throttle, m/s²
  private floored = 0; // s left of a wide-open run (renewed while pulling)
  private time = 0;

  update(s: DriveState, dt: number) {
    if (dt <= 0) return;
    const frame = dt; // real time since the last frame, for the speed below
    dt = Math.min(dt, 0.1);
    this.time += dt;

    // Tread speed: road speed plus wheelspin (burnouts).
    const tread = s.distance + (s.spin ?? 0);
    if (this.lastTread === null) {
      // Joining a drive already under way: the gear a driver would be in.
      this.smoothTread = s.speed;
      while (this.gear < GEARS.length - 1 && s.speed * RPM_PER_MS * GEARS[this.gear + 1] > 1700) this.gear++;
      this.rpm = Math.max(IDLE_RPM, s.speed * RPM_PER_MS * GEARS[this.gear]);
    }
    const raw = this.lastTread === null || frame > 0.25 ? s.speed : Math.max(0, (tread - this.lastTread) / frame);
    this.lastTread = tread;
    // A scene's lap seam can jump distance; ignore implausible spikes.
    const v = raw > 120 ? this.smoothTread : raw;
    this.smoothTread += (v - this.smoothTread) * Math.min(1, dt / 0.05);
    const tv = this.smoothTread;

    // Throttle the motion needs: acceleration plus drag, rolling and grade.
    const need = s.accel + 0.15 + 0.00045 * s.speed * s.speed + 9.81 * s.grade;
    // Hard acceleration is traction-limited well below MAX_ACCEL, so the
    // pedal is on the floor by about half of it.
    let throttle = s.braking || s.accel < -0.4 ? 0 : Math.min(1, Math.max(0, need / (0.55 * MAX_ACCEL[this.gear])));
    const spinning = (s.spin ?? 0) > 0 && tv > s.speed + 2;
    if (spinning) throttle = 1; // lighting the tyres: pedal down
    // A hard pull means a wide-open run: the pedal stays down through the
    // gears (shift dips aside) until the driver lifts or brakes.
    if (this.pull > 3) this.floored = 0.6;
    else if (s.accel > 0.6) this.floored = Math.max(this.floored, 0);
    if (s.braking || s.accel < -0.4) this.floored = 0;
    if (this.floored > 0) {
      if (s.accel > 0.6) this.floored = Math.max(this.floored, 0.6);
      this.floored -= dt;
      if (throttle > 0) throttle = 1;
    }

    // Gear choice with hysteresis: shift later the harder it's being driven.
    this.sinceShift += dt;
    const inGear = (g: number) => tv * RPM_PER_MS * GEARS[g];
    const upAt = 2300 + 3900 * throttle * throttle;
    // A power shift in the scene's motion: pulling hard, then the push drops
    // away for a moment while the clutch is in.
    const dip = this.pull > 1 && s.accel < 0.35 * this.pull && !s.braking && s.accel > -1.5;
    this.pull = s.accel > 1 && !spinning ? this.pull + (s.accel - this.pull) * Math.min(1, dt / 0.15) : this.pull * Math.max(0, 1 - dt / 0.4);
    if (this.shiftLeft <= 0 && this.sinceShift > 0.8 && !spinning) {
      if (this.gear < GEARS.length - 1 && (inGear(this.gear) > upAt || (dip && inGear(this.gear) > 3000))) {
        this.gear++;
        this.shift();
      } else if (this.gear > 0 && inGear(this.gear) < (throttle > 0.7 ? 2600 : 1250)) {
        this.gear--;
        this.shift();
      }
    }
    if (tv < 1) this.gear = 0;

    let target = inGear(this.gear);
    if (this.shiftLeft > 0) {
      // Clutch in: off the throttle and the revs fall toward the next gear.
      this.shiftLeft -= dt;
      throttle = 0;
      target = Math.max(target, IDLE_RPM);
    } else if (tv < 12 && this.gear === 0) {
      // Pulling away: slipping the clutch, revs held up by the throttle
      // (about 4300 on a hard launch), handing over to the gear as it bites.
      const slip = IDLE_RPM + throttle * throttle * 3400;
      const engaged = (tv / 12) ** 2;
      target = Math.max(target, slip * (1 - engaged) + target * engaged, IDLE_RPM);
    }
    target = Math.max(IDLE_RPM, target);
    if (target > LIMIT_RPM) {
      // On the limiter: the ignition cuts, the revs bounce just under it.
      target = LIMIT_RPM - 120 * (0.5 + 0.5 * Math.sin(this.time * 2 * Math.PI * 9));
      throttle *= 0.6;
    }

    // Revs rise and fall quickly, but not instantly.
    const tau = target > this.rpm ? 0.07 : this.shiftLeft > 0 ? 0.09 : 0.12;
    this.rpm += (target - this.rpm) * Math.min(1, dt / tau);
    this.throttle += (throttle - this.throttle) * Math.min(1, dt / 0.06);
  }

  private shift() {
    this.shiftLeft = SHIFT_TIME;
    this.sinceShift = 0;
  }
}
