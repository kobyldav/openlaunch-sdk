# Fedora SDK full functional test suite

**Target:** OpenLaunch SDK `main` (v1.22+). The suite tests the SDK, not the separate MyWeb frontend. An API export parity audit and gap inventory are included. **No single test suite can certify every behavior or live upstream provider.** All operations are local except npm package installation and any live checks you explicitly enable.

## Copy/paste: recommended complete offline verification

```bash
cd ~/Desktop/Openspace/openlaunch-sdk-validation
git fetch origin
git switch main
git pull --ff-only origin main
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
# 3-second spacing and individual 30-second timeouts. Many independent API calls, quotas,
# credentials and longer execution; do not run casually.
bash scripts/fedora-full-test.sh --live-cookbook
```

`--skip-install` reuses existing `node_modules`, useful for repeat runs after a successful `npm ci`. `--all` intentionally **does not** run 65 network-labelled cookbook entries because doing so can trigger multiple upstream quotas. Only `--live-cookbook` explicitly authorizes those extra requests.

## Included validation coverage

| Area | Check | Network in default mode |
|---|---|---|
| Build | TypeScript ESM+CJS + 7 modular workspaces | No |
| TypeScript API examples | All catalogued cookbook TS examples typechecked | No |
| Runnable offline examples | All catalogued `network:false` TS examples (currently 87) | No |
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

The runner uses bounded execution per test, reports failures individually, avoids embedding secret values in log output and returns a nonzero shell exit code if anything fails. The live cookbook runs with a 45-minute overall cap to accommodate up to 65 individual 30-second request limits and 3-second gaps. It prints allowlisted `RUN/PASS/FAIL` lines as each recipe executes; a live provider may still block an individual recipe until its own timeout. Every completed recipe is persisted immediately in `cookbook-live/progress-live.json`, even if the suite is interrupted before the final `summary-live.json` is produced. Do not run two suites writing the same output directory. You can send `summary.txt` and the specific failed `.log` to diagnose quickly. `test-results/` is ignored by Git.

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

**Versioned examples:** The catalogue and Fedora runner are tracked in `main`. Always verify the checked-out Git commit in the Fedora report.

**Measured initial API gaps (2026-10-28):** 486 distinct public runtime symbols, 300 not referenced in cookbook examples; 637 exported class-method records (across entrypoints), 270 not referenced in examples. These are reference-audit counts, not executed statement coverage. The Fedora runner includes these values in its summary as **incomplete API coverage** even when all executed tests pass.

## Diagnose live failures using existing logs (no new API requests)

The `--mode=live` runner now stores `diagnosis-live.json` with **signature-only** categories. A 403 or timeout alone does not prove an SDK defect or a provider quota. Preserve complete redacted logs for inspection.

After testing on Fedora, run:

```bash
cd ~/Desktop/Openspace/openlaunch-sdk-validation
node scripts/diagnose-live-results.mjs --dir=test-results/live-manual
```

Or pass the existing `test-results/fedora-.../cookbook-live` directory. This tool reads only existing logs and uses **zero** provider requests. Do not share unredacted API tokens or signed asset URLs. The resulting `diagnosis-live.json` includes only classifications and filenames. To reproduce provider behavior safely, avoid hammering unauthenticated LL2 production: LL2 free production allows about 15 calls/hour, and the rate-unlimited `lldev` endpoint contains stale/limited data. NASA `DEMO_KEY` has much lower per-IP quotas (30/hour, 50/day); configure a personal NASA key if repeated API calls are needed. These limits do not justify marking failed tests as passed.

## Why 31 online examples timed out, and how to reproduce safely

The 2026-10-28 Fedora logs had **33 PASS, 31 timeout-classified failures and 1 COG/raster exception**. These do **not** demonstrate 31 defective SDK functions. The live cookbook process had a 30-second per-example deadline, while HTTP clients can themselves wait up to 30 seconds **per request** and may retry. A process killed at the harness deadline never emits the true HTTP error. Timeout signatures also do not rule out provider throttling, DNS issues, or retries.

**Do not immediately repeat all 65 online examples**. First inspect the existing `diagnosis-live.json` and a specific failed example's local (redacted) log.

The diagnosis CLI now reports a **numeric** `failed`, `failedExamples[]`, and `timeoutByHarness` to separate process termination from merely mentioning "TimeoutError" in a log.

To investigate a *single* failing LL2 example with a longer budget (this makes real network requests and can consume quotas):

```bash
cd ~/Desktop/Openspace/openlaunch-sdk-validation
node scripts/verify-cookbook.mjs --mode=live \
  --only=00-getting-started/01-next-launch.ts \
  --timeout-ms=120000 \
  --output=test-results/live-ll2-one
```

Use the same `--only=` syntax for e.g. `02-nasa/02-neows-browse.ts` or `17-raster/01-real-cog-window.ts`. Multiple exact `--only=` arguments are accepted, but choose a few representatives at most. The original 30-second deadline remains the default for the full live suite to bound calls; a longer deadline is **explicit opt-in** for individual root-cause analysis. Inspect `summary-live.json`, `diagnosis-live.json` and the relevant `.log` file before touching SDK provider code. Redact provider credentials and signed asset URLs before sharing logs.
