import { ValidationError } from "../errors.js";

export type Matrix = number[][];

export function zeros(rows: number, cols: number): Matrix { return Array.from({ length: rows }, () => Array(cols).fill(0) as number[]); }
export function identity(size: number): Matrix { const out = zeros(size, size); for (let i = 0; i < size; i++) out[i]![i] = 1; return out; }
export function transpose(a: Matrix): Matrix { return a[0] ? a[0].map((_, c) => a.map((row) => row[c] ?? 0)) : []; }
export function matrixAdd(a: Matrix, b: Matrix): Matrix { return a.map((row, r) => row.map((v, c) => v + (b[r]?.[c] ?? 0))); }
export function matrixSub(a: Matrix, b: Matrix): Matrix { return a.map((row, r) => row.map((v, c) => v - (b[r]?.[c] ?? 0))); }
export function matrixScale(a: Matrix, k: number): Matrix { return a.map((row) => row.map((v) => v * k)); }
export function matrixMul(a: Matrix, b: Matrix): Matrix {
  if (!a[0] || !b[0] || a[0].length !== b.length) throw new ValidationError("Matrix dimensions are incompatible for multiplication");
  const bt = transpose(b);
  return a.map((row) => bt.map((col) => row.reduce((sum, v, i) => sum + v * (col[i] ?? 0), 0)));
}
export function matrixVectorMul(a: Matrix, v: readonly number[]): number[] { return a.map((row) => row.reduce((sum, x, i) => sum + x * (v[i] ?? 0), 0)); }
export function determinant(a: Matrix): number {
  const n = a.length;
  if (n === 0 || a.some((row) => row.length !== n)) throw new ValidationError("Determinant requires a square matrix");
  const m = a.map((row) => [...row]);
  let det = 1;
  for (let i = 0; i < n; i++) {
    let pivot = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(m[r]![i] ?? 0) > Math.abs(m[pivot]![i] ?? 0)) pivot = r;
    const pv = m[pivot]![i] ?? 0;
    if (Math.abs(pv) < 1e-15) return 0;
    if (pivot !== i) { [m[i], m[pivot]] = [m[pivot]!, m[i]!]; det *= -1; }
    det *= m[i]![i] ?? 0;
    for (let r = i + 1; r < n; r++) {
      const factor = (m[r]![i] ?? 0) / (m[i]![i] ?? 1);
      for (let c = i + 1; c < n; c++) m[r]![c] = (m[r]![c] ?? 0) - factor * (m[i]![c] ?? 0);
    }
  }
  return det;
}
export function inverse(a: Matrix): Matrix {
  const n = a.length;
  if (n === 0 || a.some((row) => row.length !== n)) throw new ValidationError("Inverse requires a square matrix");
  const aug = a.map((row, i) => [...row, ...identity(n)[i]!]);
  for (let i = 0; i < n; i++) {
    let pivot = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(aug[r]![i] ?? 0) > Math.abs(aug[pivot]![i] ?? 0)) pivot = r;
    if (Math.abs(aug[pivot]![i] ?? 0) < 1e-15) throw new ValidationError("Matrix is singular");
    [aug[i], aug[pivot]] = [aug[pivot]!, aug[i]!];
    const scale = aug[i]![i] ?? 1;
    aug[i] = aug[i]!.map((v) => v / scale);
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const factor = aug[r]![i] ?? 0;
      aug[r] = aug[r]!.map((v, c) => v - factor * (aug[i]![c] ?? 0));
    }
  }
  return aug.map((row) => row.slice(n));
}
export function solveLinear(a: Matrix, b: readonly number[]): number[] { return matrixVectorMul(inverse(a), b); }
