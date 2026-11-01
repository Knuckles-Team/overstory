# OVERSTORY-API quickstart

Run the served proof for `OVERSTORY-API-R001` with these commands from the repository root.

1. `pnpm run test -- src/lib/arbora-api/__tests__/invoke.test.ts` proves the typed invoke adapter.
2. `pnpm run test -- src/components/views/__tests__/ConsoleConfirmView.test.tsx` proves the confirmation page sends only the exact plan reference.
3. `uv run --all-extras pytest agent/overstory/__tests__/test_served_operations.py` proves the host calls served operations.
