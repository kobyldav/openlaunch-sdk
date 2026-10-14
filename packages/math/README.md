# @openlaunch/math (v1.3.0 development)

Optional math package extracted from OpenLaunch engineering: vector and matrix algebra, quaternions, numerical methods, statistics, units, PID control and Kalman filtering. No orbital or rocket dependencies.

```ts
import { matrixMul, vec3, LinearKalmanFilter } from "@openlaunch/math";
```

Shared source remains in `src/science/` until the physical source migration. Engineering re-exports legacy math functions for v1 compatibility but its compiled output imports @openlaunch/math, avoiding copies of the same algorithm. Research utilities, not safety-certified. This version is not yet published on npm.
