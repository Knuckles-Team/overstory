# Seam: host-log stream

Provider: arbora ARBORA-HOST-R009.8.2.2.2
Consumer: overstory OVERSTORY-APPS-R054

## Wire shape

Arbora serves two POST routes on the host: `/host/logs/reference` (no body) and `/host/logs/read`. Both require exactly one `Authorization: Bearer` header, no cookie and no query string. The read body is `{version: 2, log_ref, cursor | null, limit 1..128}`; `log_ref` is at most 128 bytes and `cursor` at most 1024 bytes. A 200 read answers `{version: 2, records, cursor, gap}`. Each record carries `host_instance`, `sequence` (integer, 1 to 2^63-1), `request` (at most 1024 bytes), `timestamp` (finite, non-negative number), `severity` (1 to 32 bytes) and `message`. The consumer renders these as text and sends credentials omitted.

## Refusal codes

Each refusal is `{detail: <code>}` with no log content, record, metadata or cursor:

- `409 retention_gap`: the held cursor is no longer retained. The consumer drops every held record, cursor and reference and shows a gap marker.
- `403 workspace_denied`: the grant is revoked, expired or the credential is refused. The consumer drops the same state and shows access denied.
- `503 log_unavailable`: the owner is absent or slow. The consumer shows unavailable and keeps nothing it cannot confirm.

A 200 batch with `gap: true` reports that a fresh read passed a rotation. The consumer replaces what it holds with that batch, shows the gap marker, and never shows text from before the gap.

## Authoritative types

The version-2 batch and record shape in `arbora/agent_host/log_routes.py` (`LogReadRequest`, `_metadata`). The consumer type is `HostLogBatch` in `src/lib/host-logs.ts`.

## Test vectors

`tests/agent_host/test_overstory_logs_served.py::test_retention_gap_clears_protected_content` in arbora holds the HTTP vectors: first read, stale cursor 409, fresh read with `gap: true`, revoked grant 403. `e2e/host-log-view.browser.ts` in overstory replays the same sequence in a real browser against a real host and real log files.
