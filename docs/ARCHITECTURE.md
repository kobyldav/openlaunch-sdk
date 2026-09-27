# Architecture

OpenLaunch has four layers:

1. **Core transport** — fetch, cache, retry, dedupe, timeout, concurrency, telemetry and circuit breaking.
2. **Providers** — LL2, NASA and CelesTrak.
3. **Normalized domain resources** — stable Launch/Rocket/Agency/Astronaut/Event/Pad models.
4. **Science/engineering toolbox** — deterministic calculations independent of provider availability.

Applications should prefer normalized models where available and use raw resources when they need provider-specific fields.

The provider layer must remain replaceable. Physics/math utilities must not depend on network providers. Cache adapters must remain runtime-agnostic.
