# Migration from 0.1.x to 0.5.0

The existing high-level API remains compatible:

```ts
new OpenLaunch()
sdk.launches
sdk.rockets
sdk.agencies
sdk.astronauts
sdk.events
sdk.pads
sdk.spacecraft
sdk.spaceStations
sdk.celestialBodies
sdk.dockingEvents
sdk.expeditions
sdk.payloads
sdk.programs
```

New major surfaces:

```ts
sdk.ll2.*
sdk.config.*
sdk.nasa.*
sdk.celestrak.*
sdk.resource(...)
query()
science/math exports
```

## Safe repository update

Commit the current repository first, then copy the v0.5.0 tree over it and inspect `git status`.

```bash
git add -A
git commit -m "Backup before OpenLaunch v0.5.0" || true
```

After copying the new files:

```bash
npm install
npm run check
npm pack --dry-run
git status
```

Then commit:

```bash
git add -A
git commit -m "Expand OpenLaunch SDK to v0.5.0"
git push
```

Generated `dist/` and `dist-cjs/` directories are gitignored and rebuilt by CI/package scripts.
