# OVERSTORY-DASH quickstart

Run the proofs from the repository root.

## Library and component tests

```bash
pnpm exec vitest run src/lib/dashboards src/components/dashboards
```

Expected: the document model, history, query, parameter, store, tool and view tests pass.

## Served behavior (R005)

The natural-language, fleet-call and engine-operation query kinds run through arbora served operations. Once built, `pnpm exec vitest run src/lib/dashboards/__tests__/query-kinds.test.ts` proves each kind validates its arguments and refuses a bad one.
