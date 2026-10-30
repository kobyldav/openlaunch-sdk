# @openlaunchsdk/math (v1.22.1)

Optional math package extracted from OpenLaunch engineering: vector and matrix algebra, quaternions, numerical methods, statistics, units, PID control and Kalman filtering. No orbital or rocket dependencies.

```sh
npm install @openlaunchsdk/math
```

```ts
import { matrixMul, vec3, LinearKalmanFilter } from "@openlaunchsdk/math";
```

Shared source remains in `src/science/` until the physical source migration. Engineering re-exports math functions for backwards compatibility but its compiled output imports @openlaunchsdk/math, avoiding copies of the same algorithm. Research utilities, not safety-certified. Available on npm as `@openlaunchsdk/math`.

Source: [kobyldav/openlaunch-sdk](https://github.com/kobyldav/openlaunch-sdk). MIT license.
