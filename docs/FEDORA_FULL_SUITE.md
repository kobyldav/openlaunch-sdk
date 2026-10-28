# Fedora SDK full functional test suite

**Target:** OpenLaunch SDK `feature/gibs-tile-cache-batch-v1.22.0` (PR #33). The suite tests the SDK, not the separate MyWeb frontend. An API export parity audit and gap inventory are included. **No single test suite can certify every behavior or live upstream provider.** All operations are local except npm package installation and any live checks you explicitly enable.

## Copy/paste: recommended complete offline verification

```bash
cd ~/Desktop/Openspace/openlaunch-sdk
git fetch origin
git switch feature/gibs-tile-cache-batch-v1.22.0
git pull --ff-only origin feature/gibs-tile-cache-batch-v1.22.0
bash scripts/fedora-full-test.sh
```

If your local directory is different, change only `cd`. No sudo, no secrets and no deploy. On Fedora with Node.js 18+, npm and Git installed, the launcher runs `npm ci`, full compilation, both TypeScript checks, every JavaScript test file, every catalogued **offline** TypeScript recipe, all offline module demonstrations from the main `npm test` pipeline, all seven workspace package/typing/pack checks and the actual packed-consumer install test. Errors in one stage do not skip unrelated checks.

## More exhaustive options

```bash
# Show all steps with no side effects
bash scripts/fedora-full-test.sh --list

# Offline + a small deliberate set of live NASA/Copernicus/CelesTrak/LL2 probes.
bash scripts/fedora-full-test.sh --live

# Offline + ACTUAL optional JPEG2000 WebAssembly codec/JP2 fixtures.
bash scripts/fedora-full-test.sh --wasm

# Offline + live provider smoke probes + actual OpenJPEG/WASM.
bash scripts/fedora-full-test.sh --all

# Explicitly run *all* online-labelled cookbook recipes; 65 separate scripts,
# 3-second spacing and individual timeouts. Many independent API calls, quotas,
# credentials and longer execution; do not run casually.
bash scripts/fedora-full-test.sh --live-cookbook
```

`--skip-install` reuses existing `node_modules`, useful for repeat runs after a successful `npm ci`. `--all` intentionally **does not** run 65 network-labelled cookbook entries because doing so can trigger multiple upstream quotas. Only `--live-cookbook` explicitly authorizes those extra requests.

## Included validation coverage

| Area | Check | Network in default mode |
|---|---|---|
| Build | TypeScript ESM+CJS + 7 modular workspaces | No |
| TypeScript API examples | All catalogued cookbook TS examples typechecked | No |
| Runnable offline examples | All catalogued `network:false` TS examples (currently 82) | No |
| Regression tests | All `tests/*.test.mjs`, including security/telemetry/parsing | No |
| SDK smoke scripts | Every offline executable entry in `package.json` `test` | No |
| Packages | `test:packages`, `pack:check:packages`, `test:packed`, root pack | No |
| Live providers | LL2, CelesTrak, Copernicus, Planetary Computer, weather, orbit | Opt in `--live` |
| Real WASM codec | Pinned `@cornerstonejs/codec-openjpeg@1.3.6`, original/reduced JP2 | Opt in `--wasm` |
| All online cookbook | 65 `network:true` examples, spaced by 3 s | Explicit `--live-cookbook` |

Some online examples need provider keys; a live failure means the real provider or credentials may be unavailable, not necessarily that the SDK is broken. All offline STAC image responses and other provider fixtures are **simulated**. Successful CI does not prove every public provider currently delivers usable data.

## Reports

Every invocation prints PASS / FAIL / SKIP and writes:

```text
test-results/fedora-YYYY-MM-DDTHH-MM-SS/
  summary.txt
  summary.json
  01-npm-ci-...log
  ...
  cookbook/
    04-orbital-mechanics__01-leo-reference.log
    ...
    summary-offline.json
```

The runner uses bounded execution per test, reports failures individually, avoids embedding secret values in log output and returns a nonzero shell exit code if anything fails. You can send `summary.txt` and the specific failed `.log` to diagnose quickly. `test-results/` is ignored by Git.

## Manual requirements

- Node.js >=18, npm, Git, a Fedora Linux shell and free disk for build and temporary package tests.
- Node.js >=20 is required for the optional real WASM integration; Node 22 recommended.
- `npm ci` may require internet; the *SDK* offline test stages never need actual NASA/SpaceX/Copernicus credentials.
- Optional live API testing has real network, latency, quotas and potential upstream rate limits. Never enter API credentials directly in the shell commands.
- The suite does not run or deploy MyWeb, Cloudflare Workers or browser UI. Those require a separate environment/integration test.

## Scope and coverage evidence

- `api-surface/public-api.json` inventories root subpath exports and seven independent workspace entrypoints, checks ESM/CJS parity, and lists symbols/methods not referenced in tests/examples. **A reference is not a functional test.**
- `tests/public-api-parity.test.mjs` requires every public ESM/CJS export name and value type to agree and all `examples/**/*.ts` entries to exist in the versioned catalog.
- On Node.js 20+, the Fedora runner enables Node's built-in V8 test coverage output during the regression-test stage. Coverage of those tests must not be confused with full integration coverage.
- All recorded offline examples are executed. Online examples are **not executed** unless `--live-cookbook` is provided. `--all` alone runs only bounded live smoke probes plus optional OpenJPEG.
- Live provider tests, authentication, actual satellite acquisition dates, and downstream browser/Cloudflare behavior remain separate integration risks.

**GitHub branch vs main:** The examples belong in `main` only after reviewed PR merge; otherwise users viewing the default branch see an older catalogue.
