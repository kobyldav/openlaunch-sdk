/**
 * Monte Carlo scalar summary
 *
 * Run a deterministic-seed-free uncertainty sketch and summarize percentiles. Use a seeded RNG in reproducible engineering workflows.
 *
 * Uses: monteCarloScalar
 * Network: no
 */
import { monteCarloScalar } from "../../src/index.js";

const result = monteCarloScalar(2_000, () => 100 + (Math.random() - 0.5) * 20);
console.log({ mean: result.mean, stddev: result.stddev, p05: result.p05, p50: result.p50, p95: result.p95 });
