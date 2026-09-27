import type { Matrix } from "./matrix.js";
import { identity, inverse, matrixAdd, matrixMul, matrixSub, matrixVectorMul, transpose } from "./matrix.js";

export interface KalmanState { x: number[]; covariance: Matrix; }
export class LinearKalmanFilter {
  private state: KalmanState;
  constructor(initialState: readonly number[], initialCovariance?: Matrix) { this.state = { x: [...initialState], covariance: initialCovariance ?? identity(initialState.length) }; }
  predict(transition: Matrix, processNoise: Matrix, controlMatrix?: Matrix, control?: readonly number[]): KalmanState {
    const predicted = matrixVectorMul(transition, this.state.x);
    if (controlMatrix && control) {
      const u = matrixVectorMul(controlMatrix, control);
      for (let i = 0; i < predicted.length; i++) predicted[i] = (predicted[i] ?? 0) + (u[i] ?? 0);
    }
    this.state = { x: predicted, covariance: matrixAdd(matrixMul(matrixMul(transition, this.state.covariance), transpose(transition)), processNoise) };
    return this.current();
  }
  update(measurement: readonly number[], observation: Matrix, measurementNoise: Matrix): KalmanState {
    const innovation = measurement.map((z, i) => z - (matrixVectorMul(observation, this.state.x)[i] ?? 0));
    const s = matrixAdd(matrixMul(matrixMul(observation, this.state.covariance), transpose(observation)), measurementNoise);
    const k = matrixMul(matrixMul(this.state.covariance, transpose(observation)), inverse(s));
    const correction = matrixVectorMul(k, innovation);
    const x = this.state.x.map((v, i) => v + (correction[i] ?? 0));
    const iMat = identity(this.state.x.length);
    const covariance = matrixMul(matrixSub(iMat, matrixMul(k, observation)), this.state.covariance);
    this.state = { x, covariance };
    return this.current();
  }
  current(): KalmanState { return { x: [...this.state.x], covariance: this.state.covariance.map((r) => [...r]) }; }
}

export function complementaryFilter(previous: number, gyroRatePerSecond: number, measurement: number, dtSeconds: number, alpha = 0.98): number { return alpha * (previous + gyroRatePerSecond * dtSeconds) + (1 - alpha) * measurement; }
export function lowPass(previous: number, input: number, alpha: number): number { return previous + alpha * (input - previous); }
export function highPass(previousOutput: number, currentInput: number, previousInput: number, alpha: number): number { return alpha * (previousOutput + currentInput - previousInput); }
