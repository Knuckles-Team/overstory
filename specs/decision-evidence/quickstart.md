# OVERSTORY-DECIDE quickstart

Run the proofs from the repository root.

## Decision view tests

```bash
pnpm exec vitest run src/components/decisions src/components/views/__tests__/DecisionsView.test.tsx
```

Expected: the explorer, calibration, query-scope and transport tests pass.

## Hot-path proofs (R009.3, R010.2, R011)

```bash
pnpm exec vitest run src/components/views/__tests__/ProposalReview.e2e.test.tsx src/components/views/__tests__/ArtifactGraph.e2e.test.tsx src/components/views/__tests__/ProjectMode.e2e.test.tsx
```

Expected once built: each journey passes against a loopback arbora with a reviewer session, and a second tenant sees none of the first tenant's records.
