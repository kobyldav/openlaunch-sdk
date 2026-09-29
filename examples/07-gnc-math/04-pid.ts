/**
 * PID controller loop
 *
 * Run a minimal PID loop against a toy first-order plant.
 *
 * Uses: PIDController
 * Network: no
 */
import { PIDController } from "../../src/index.js";

const pid = new PIDController({ kp: 1.2, ki: 0.2, kd: 0.05, outputMin: -10, outputMax: 10 });
let measurement = 0;
for (let i = 0; i < 20; i++) {
  const command = pid.update(5, measurement, 0.1);
  measurement += command * 0.05;
}
console.log("Final measurement:", measurement);
