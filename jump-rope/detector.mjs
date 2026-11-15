// Original implementation: gravity projection, smoothing, and hysteresis.
export class JumpDetector {
  constructor(threshold = 2.5) { this.threshold = threshold; this.reset(); }
  reset() { this.gravity = null; this.filtered = 0; this.previous = null; this.armed = false; this.lastJump = -Infinity; this.warmUntil = null; }
  sample(x, y, z, time) {
    if (![x,y,z,time].every(Number.isFinite)) return false;
    if (this.previous !== null && time <= this.previous) return false;
    if (this.previous !== null && time - this.previous > 500) this.reset();
    if (!this.gravity) { this.gravity = [x,y,z]; this.warmUntil = time + 1500; }
    const dt = this.previous === null ? 20 : time - this.previous;
    this.previous = time;
    const a = 1 - Math.exp(-dt / 700);
    const values = [x,y,z];
    this.gravity = this.gravity.map((g,i) => g + a * (values[i]-g));
    const norm = Math.hypot(...this.gravity);
    if (norm < 1) return false;
    const vertical = values.reduce((sum,v,i) => sum + (v-this.gravity[i])*this.gravity[i]/norm,0);
    this.filtered += (1 - Math.exp(-dt / 35)) * (vertical-this.filtered);
    if (time < this.warmUntil) return false;
    if (this.filtered > this.threshold && !this.armed) { this.armed = true; this.peakTime = time; }
    if (this.armed && time - this.peakTime > 650) this.armed = false;
    if (this.armed && this.filtered < -this.threshold * 0.55) {
      this.armed = false;
      if (time - this.lastJump >= 260) { this.lastJump = time; return true; }
    }
    return false;
  }
}
