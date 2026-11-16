# OVERSTORY-CITY quickstart

Run from the overstory repository root:

```bash
scripts/bootstrap.sh          # idempotent setup (uv, pnpm, hooks)
pnpm run dev:server           # FastAPI host on :38001
pnpm run dev                  # Vite dev server (proxies /api → :38001)
```

Open the app at the Vite origin (port 9000 per `vite.config.ts`):
`/apps/city`.

- With Arbora reachable (the host reaches it through `ARBORA_API_URL`,
  default `http://127.0.0.1:8000/api/v1`, set in `.env`), the mode badge
  reads `LIVE` and the connector district mirrors `fleet.catalog.list`
  (served packs built, registered packs planned).
- With Arbora unreachable or not running, the badge reads `SIMULATED`,
  the city boots from the bundled fleet snapshot, and the banner states
  the reason. **This is the default local debugging mode**: run the two
  dev servers above, do not start Arbora, and the city is fully
  interactive (dispatch, onboard, speed, selection) with zero
  external dependencies.
- `?speed=0|1|2|4` sets the initial simulation speed (the top-bar
  buttons switch it live; `0` pauses the clock and all action timers
  together).
- No WebGL → the 2D schematic renders instead of the 3D scene.

Verification:

```bash
pnpm vitest run src/apps/city
uv run --no-sync pytest agent/overstory/__tests__/test_city_app.py
pnpm build
uvx pre-commit run --config .config/pre-commit.yaml --all-files
```
