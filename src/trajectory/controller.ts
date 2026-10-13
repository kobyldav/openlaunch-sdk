import type { CartesianKm } from "../orbit/types.js";
import type { LaunchModel, LaunchTelemetry } from "./types.js";
import { clamp, cross, dot, norm, scale } from "./math.js";
import { PHYSICS } from "../science/constants.js";

/**
 * Lightweight, memoryless throttle limit. This is NOT a closed-loop GNC system.
 *
 * Uses a local first-order estimate of qdot to avoid immediately violating
 * a desired dynamic-pressure limit. The bound cannot be guaranteed because
 * throttle cannot stop coasting acceleration or atmospheric/model errors.
 */
export function limitLaunchThrottle(
  model: LaunchModel,
  input: {
    commandedThrottle: number;
    thrustAtFullThrottleN: number;
    massKg: number;
    densityKgM3: number;
    dynamicPressurePa: number;
    relativeVelocityMps: CartesianKm;
    radialVerticalSpeedMps: number;
    gravityAndDragAccelerationMps2: CartesianKm;
    thrustDirection: CartesianKm;
  },
): Pick<LaunchTelemetry, "commandedThrottle" | "effectiveThrottle" | "throttleLimiter"> {
  const commandedThrottle = clamp(input.commandedThrottle, 0, 1);
  const c = model.flightConstraints;
  if (!c || commandedThrottle <= 0) {
    return { commandedThrottle, effectiveThrottle: commandedThrottle, throttleLimiter: "none" };
  }

  let qThrottle = 1;
  let gThrottle = 1;

  if (c.maxAxialAccelerationG !== undefined) {
    gThrottle = clamp(
      c.maxAxialAccelerationG * PHYSICS.standardGravity * input.massKg /
      Math.max(1e-12, input.thrustAtFullThrottleN),
      0, 1,
    );
  }

  if (c.maxDynamicPressurePa !== undefined) {
    const relativeSpeed = norm(input.relativeVelocityMps);
    const rho = input.densityKgM3;
    const q = input.dynamicPressurePa;
    if (relativeSpeed > 30 && rho > 0) {
      const unitRel = scale(input.relativeVelocityMps, 1 / relativeSpeed);
      const earthSpinAccel = cross(
        { x: 0, y: 0, z: PHYSICS.earthRotationRate },
        input.relativeVelocityMps,
      );
      const qdotExternal =
        -q * input.radialVerticalSpeedMps / 8_000 +
        rho * relativeSpeed * dot(
          unitRel,
          {
            x: input.gravityAndDragAccelerationMps2.x - earthSpinAccel.x,
            y: input.gravityAndDragAccelerationMps2.y - earthSpinAccel.y,
            z: input.gravityAndDragAccelerationMps2.z - earthSpinAccel.z,
          },
        );
      const qdotPerThrottle =
        rho * relativeSpeed * input.thrustAtFullThrottleN / input.massKg *
        dot(unitRel, input.thrustDirection);
      if (qdotPerThrottle > 1e-9) {
        const responseSeconds = c.maxQResponseSeconds ?? 5;
        // Use a small nominal headroom because finite integration steps and density
        // model errors can produce overshoot even with aggressive throttling.
        // This remains an advisory first-order controller, not a hard limit.
        const targetQdot = (0.96 * c.maxDynamicPressurePa - q) / responseSeconds;
        qThrottle = clamp((targetQdot - qdotExternal) / qdotPerThrottle, 0, 1);
      }
    }
  }

  const effectiveThrottle = Math.min(commandedThrottle, qThrottle, gThrottle);
  const qBound = qThrottle < commandedThrottle - 1e-9;
  const gBound = gThrottle < commandedThrottle - 1e-9;
  const limitingQ = qBound && qThrottle <= gThrottle + 1e-9;
  const limitingG = gBound && gThrottle <= qThrottle + 1e-9;

  return {
    commandedThrottle,
    effectiveThrottle,
    throttleLimiter: limitingQ && limitingG ? "both" : limitingQ ? "max-q" : limitingG ? "axial-g" : "none",
  };
}
