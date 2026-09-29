# Changelog

## 0.5.1 - 2026-09-29

Documentation and example-library release.

- added **90 categorized TypeScript examples** covering data providers, astrodynamics, rocket/spacecraft engineering, GNC math, geodesy, atmosphere/EDL, SDK infrastructure and integrated mission sketches
- every TypeScript example is checked by `npm run examples:check` without making network requests
- added `examples/catalog.json` for machine-readable indexing
- added `examples/AI_INDEX.md` and root `llms.txt` for AI/code-search context and modeling boundaries
- included `examples` and `llms.txt` in the published npm package
- expanded the main README with example/indexing guidance
- fixed literal-inferred gravity parameter types so callers can supply non-Earth gravity values

## 0.5.0 - 2026-09-27

Major expansion from launch-data wrapper to spaceflight/mission SDK.

- complete LL2 raw endpoint registry and config tables
- NASA and CelesTrak providers
- OMM helpers
- pagination iterators and collectors
- query builder
- resilient HTTP layer with timeout, dedupe, retry/jitter, concurrency control, telemetry and circuit breaker
- expanded caching adapters
- orbital mechanics, transfers and Mars reference calculations
- vectors, matrices, quaternions and numerical methods
- rocket, atmosphere, geodesy, communications, thermal, power, structures and EDL helpers
- navigation/Kalman/PID tools
- reliability, statistics, life-support, radiation, data and propellant utilities
- GitHub Actions Node CI
- expanded tests and documentation

## 0.1.0 - 2026-09-26

Initial typed Launch Library 2 SDK with normalized launches, rockets, agencies, astronauts, events, pads, cache and ESM/CommonJS builds.
