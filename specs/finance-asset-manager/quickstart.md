# OVERSTORY quickstart

Run the proofs from the repository root.

## Contract and component tests

```bash
pnpm exec vitest run src/apps/markets
```

Expected: every contract module and component test under src/apps/markets passes.

## Browser rows (R001.2, R015.2, R016.2)

```bash
pnpm test:e2e e2e/markets-app.spec.ts
```

Expected once the wiring is built: navigation, offline staleness and accessibility cases pass at phone and desktop widths.
