# OVERSTORY-DESIGN quickstart

Run the proofs from the repository root.

## Component and token tests

```bash
pnpm exec vitest run src/__tests__/design-tokens.test.ts src/components/ui src/components/workspace src/lib/__tests__/csp-nonce.test.ts
```

Expected: the token audit, primitive inventory, status messages, workspace frame, viewport, wallpaper and nonce tests pass.

## Server policy tests (R008, R009)

```bash
uv run pytest agent/overstory/__tests__/test_security_boundaries.py
```

Expected: each HTML document carries a fresh style nonce and the style directives stay strict.

## Browser rows

```bash
pnpm exec playwright test --config e2e/canopy-glass.config.ts
pnpm exec playwright test --config e2e/accessibility.config.ts
```

Expected: the Canopy Glass, wallpaper and keyboard journeys pass at the declared viewports. The planned cases listed in test-spec.md run from the same configs once built.
