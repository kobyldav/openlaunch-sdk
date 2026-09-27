export interface PIDOptions { kp: number; ki: number; kd: number; outputMin?: number; outputMax?: number; integralMin?: number; integralMax?: number; }
export class PIDController {
  private integral = 0; private previousError: number | undefined;
  constructor(readonly options: PIDOptions) {}
  update(setpoint: number, measurement: number, dtSeconds: number): number {
    const error = setpoint - measurement;
    this.integral += error * dtSeconds;
    this.integral = Math.max(this.options.integralMin ?? -Infinity, Math.min(this.options.integralMax ?? Infinity, this.integral));
    const derivative = this.previousError === undefined || dtSeconds <= 0 ? 0 : (error - this.previousError) / dtSeconds;
    this.previousError = error;
    const output = this.options.kp * error + this.options.ki * this.integral + this.options.kd * derivative;
    return Math.max(this.options.outputMin ?? -Infinity, Math.min(this.options.outputMax ?? Infinity, output));
  }
  reset(): void { this.integral = 0; this.previousError = undefined; }
}
export const firstOrderTimeConstantAlpha = (dtSeconds: number, timeConstantSeconds: number): number => dtSeconds / (timeConstantSeconds + dtSeconds);
