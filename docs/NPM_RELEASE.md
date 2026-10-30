# Publishing OpenLaunch SDK to npm

The monorepo contains eight public packages: the umbrella `openlaunch-sdk` and seven `@openlaunchsdk/*` workspaces. A GitHub merge does **not** publish to npm.

## Prepare the 1.22.1 correction

On Fedora, after the pull request passes CI and is merged into a clean `main`:

```bash
git switch main
git pull --ff-only origin main
npm ci
npm run check
npm run pack:check:packages
npm run test:packed
node scripts/release-npm.mjs --plan
```

The `check:release-metadata` check enforces matching package and lockfile versions, correct workspace dependency ranges, accurate README version headings, and complete public package metadata.

## Stage, review and approve

Use Node 22.14+ and npm 11.15+ for staged publishing. On Fedora, `npx --yes npm@11.21.1` works without changing the global npm installation.

Stage **one module at a time** in dependency order:

```bash
set -e
for pkg in core earth orbit math engineering launches raster; do
  (cd "packages/$pkg" && npx --yes npm@11.21.1 stage publish --access=public --tag=next)
done
npx --yes npm@11.21.1 stage publish --access=public --tag=next --workspaces=false
```

Stop at any failure and inspect the staged packages. npm staging is not transactional. Never blindly re-stage an already submitted version.

Sign in to https://www.npmjs.com/settings/kobdav/staged-packages and approve each package after reviewing its manifest and README; check the `openlaunchsdk` organization for scoped modules. Approval requires 2FA. The initial `0.0.0-stage` versions are publicly visible placeholders for new package names; they are not the final release.

## Verify on the public registry

After approving **all eight**:

```bash
node scripts/release-npm.mjs --verify
```

This command independently installs each exact version from npm and checks both ESM and CommonJS imports. Do **not** change `latest` if it fails.

## Promote the tested version

After successful verification, set `latest` for the seven scoped modules and finally the umbrella. `node scripts/release-npm.mjs --promote` performs the operation, but an npm CLI session can demand additional browser authorization for `npm dist-tag`.

If needed, an npm granular **Read and write (stage only)** token, scoped to these eight packages and explicitly permitted to bypass 2FA for this operation, can instead run `npm dist-tag add PACKAGE@1.22.1 latest`. Use a very short lifetime; keep it out of terminal history, logs, project files and chat, and **revoke it immediately** after successful promotion.

Verify the registry tags for all eight names:

```bash
for p in @openlaunchsdk/core @openlaunchsdk/earth @openlaunchsdk/orbit @openlaunchsdk/math @openlaunchsdk/engineering @openlaunchsdk/launches @openlaunchsdk/raster openlaunch-sdk; do
  printf '%s: ' "$p"
  npm view "$p" dist-tags.latest
done
```

## Public metadata caveat

New versions cannot overwrite an already published `name@version` tarball. The placeholder description `Temporary package placeholder for staged publishing` may persist on a user profile due to registry metadata caching, even when the latest package manifest is correct. **After 1.22.1 is promoted**, inspect the package page, package manifest and profile summary. If the summary remains wrong, contact npm support rather than unpublishing a working release.

Future releases should use npm Trusted Publishing via GitHub Actions (OIDC) for all eight packages, with explicit dist-tag permissions and no long-lived publication tokens.

Official docs: https://docs.npmjs.com/staged-publishing/ and https://docs.npmjs.com/trusted-publishers/
