import type { DerivativeState, LaunchModel } from "./types.js";
import { derivative, type PhysicsContext } from "./dynamics.js";
import { add, scale } from "./math.js";

/** Fixed-step RK4 on Cartesian inertial position, velocity and total mass. */
export function rk4LaunchStep(model: LaunchModel, initial: DerivativeState, context: PhysicsContext, dtSeconds: number): DerivativeState {
  if (!(dtSeconds > 0)) throw new RangeError("dtSeconds must be positive");
  const k1=derivative(model,initial,context);
  const k2=derivative(model,advance(initial,k1,dtSeconds/2),{
    ...context,elapsedSeconds:context.elapsedSeconds+dtSeconds/2,
  });
  const k3=derivative(model,advance(initial,k2,dtSeconds/2),{
    ...context,elapsedSeconds:context.elapsedSeconds+dtSeconds/2,
  });
  const k4=derivative(model,advance(initial,k3,dtSeconds),{
    ...context,elapsedSeconds:context.elapsedSeconds+dtSeconds,
  });
  const combined={
    positionM:scale(add(add(k1.positionM,scale(k2.positionM,2)),add(scale(k3.positionM,2),k4.positionM)),1/6),
    velocityMps:scale(add(add(k1.velocityMps,scale(k2.velocityMps,2)),add(scale(k3.velocityMps,2),k4.velocityMps)),1/6),
    massKg:(k1.massKg+2*k2.massKg+2*k3.massKg+k4.massKg)/6,
  };
  return advance(initial,combined,dtSeconds);
}

function advance(state: DerivativeState, d: DerivativeState, dt: number): DerivativeState {
  return {
    positionM:add(state.positionM,scale(d.positionM,dt)),
    velocityMps:add(state.velocityMps,scale(d.velocityMps,dt)),
    massKg:state.massKg+d.massKg*dt,
  };
}
