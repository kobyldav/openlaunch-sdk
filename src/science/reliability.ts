export const exponentialReliability = (failureRatePerHour: number, hours: number): number => Math.exp(-failureRatePerHour * hours);
export const failureProbability = (failureRatePerHour: number, hours: number): number => 1 - exponentialReliability(failureRatePerHour, hours);
export const mtbfFromFailureRate = (failureRatePerHour: number): number => 1 / failureRatePerHour;
export const failureRateFromMtbf = (mtbfHours: number): number => 1 / mtbfHours;
export const seriesReliability = (reliabilities: readonly number[]): number => reliabilities.reduce((p, r) => p * r, 1);
export const parallelReliability = (reliabilities: readonly number[]): number => 1 - reliabilities.reduce((p, r) => p * (1 - r), 1);
export const availability = (mtbfHours: number, mttrHours: number): number => mtbfHours / (mtbfHours + mttrHours);
export function kOfNReliability(componentReliability: number, k: number, n: number): number {
  let sum = 0;
  for (let i = k; i <= n; i++) sum += combination(n, i) * componentReliability ** i * (1 - componentReliability) ** (n - i);
  return sum;
}
export function combination(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= Math.min(k, n - k); i++) result = result * (n - i + 1) / i;
  return result;
}
