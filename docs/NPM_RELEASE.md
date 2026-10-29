# Publishing OpenLaunch SDK and all seven npm packages

The `main` branch currently contains an umbrella package `openlaunch-sdk` and seven scoped workspaces. npm publication is a separate step. Do not mistake a GitHub development version for a version available on the public npm registry.

## Prerequisites

1. Control the npm `@openlaunch` namespace. The namespace belongs to the npm account or npm organization named `openlaunch`, **not** automatically to the owner of this GitHub repository. If the organization does not exist and its name is available, create an npm organization on the free public-package plan and grant your npm account write access. If the namespace belongs to someone else, **stop** and agree on a different scope before making coordinated name/dependency changes.
2. Use the npm public registry and authenticate with npm 2FA. Do not put npm tokens, OTPs or passwords into the repository, issues or chat.
3. Work from an up-to-date, clean **main** branch. `git pull` updates the currently checked out branch; a local feature branch is not acceptable for production release.

## Release from Fedora

```bash
cd ~/Desktop/Openspace/openlaunch-sdk
git fetch origin
git switch main
git pull --ff-only origin main
npm login
npm whoami
npm config get registry
node scripts/release-npm.mjs --plan
node scripts/release-npm.mjs --publish
```

`--publish` checks the git branch and clean working tree; checks npm authentication, registry and availability of the exact version; validates the local dependency graph; performs `npm ci`, all TypeScript/unit tests, pack checks and local isolated consumer tests; publishes workspaces in dependency order; publishes the backward-compatible umbrella last; and installs/imports all eight exact versions from the real public npm registry in a new temporary directory.

All packages are initially published with the **`next`** dist-tag, so the previously installed `latest` release of `openlaunch-sdk` is not changed. Newly published scoped packages may only be installable using explicit versions or the `next` tag before promotion.

## Verify and promote

Inspect the package pages in npm. Then:

```bash
node scripts/release-npm.mjs --verify
node scripts/release-npm.mjs --promote
npm view openlaunch-sdk version
npm view @openlaunch/core version
npm view @openlaunch/engineering version
```

`--verify` installs exactly the versions on npm and checks ESM and CommonJS consumer imports for **all eight** names; it does not use local workspace symlinks. `--promote` repeats that verification, then switches each package's `latest` dist-tag, umbrella last.

Install examples after promotion:

```bash
npm install openlaunch-sdk
npm install @openlaunch/earth @openlaunch/raster
npm install @openlaunch/launches
npm install @openlaunch/orbit
npm install @openlaunch/engineering
```

## Important failure cases

- npm publishes are **not transactional**: interruption can leave only part of the eight packages published. The release script rejects existing exact versions rather than silently treating them as safe to skip. Inspect registry tarballs and finish a partial release deliberately, or release a new coordinated patch version.
- `E403` on a scoped package usually means missing scope rights, authentication/2FA restrictions, or an already published version. `E404` alone does not prove the scope is yours.
- If any registry consumer smoke fails, **do not run `--promote`**. Published versions cannot be overwritten; fix the code and issue a new release.
- Live NASA/LL2/Copernicus credentials, provider availability and upstream API correctness are separate from the offline unit tests. This publication workflow does not claim live provider checks were passed.

## Future GitHub automation

After the initial manual publish, register GitHub Actions as an npm Trusted Publisher **for each of the eight packages** and add the exact repository URL to every package manifest. Use an explicitly reviewed workflow, modern Node/npm, `id-token: write`, and a GitHub-hosted runner. `npm dist-tag` needs a separate trusted-publisher permission. Never commit persistent npm publication tokens.

References: https://docs.npmjs.com/trusted-publishers/ and https://docs.npmjs.com/creating-an-organization/
