# Seam: served run and graph operations

Provider: arbora ARBORA-OPS-R013
Consumer: overstory OVERSTORY-APPS-R004.1

## Wire shape

The browser sends one authenticated same-origin `POST /api/v1/ops/{op_id}` through `invoke` (src/lib/arbora-api/invoke.ts:66) with the generated operation identifier and a bounded parameter object. Arbora generates the engine-bound operations (`ARBORA-OPS-R008`), enforces the invoke authority of the verified principal (`ARBORA-OPS-R009`) and serves the route (`ARBORA-OPS-R013`). The run rows read `runs.get` and `runs.metrics`; the graph edit rows send `eg.graph.AddNode`, `eg.graph.ApplyMutation` and `eg.graph.RemoveNode`. The client validates each response envelope with a strict schema and computes no run value itself.

## Refusal codes

A refused or absent operation reads "not available" in the view and shows no value. A graph edit verdict is one of `applied`, `refused` or `unavailable`; a refused edit leaves the node unchanged and shows the engine reason. The stable refusal codes are defined by the provider rows above; the client maps none of them to success.

## Authoritative types

The generated schemas of the installed Arbora registry are the authority. The consumer types are `GraphEditRequest` and `GraphEditVerdict` in `src/lib/graph-edit.ts` and the planned run schemas in `src/lib/run-read.ts`.

## Test vectors

Planned `src/lib/__tests__/run-read.test.ts` and the existing `src/__tests__/graph-edit-types.test.ts` hold the consumer vectors. Served acceptance uses the real WebUI host and the fixture engine (`OVERSTORY-APPS-R030.7`).
