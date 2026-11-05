# Seam: engine graph edit authority

Provider: medulla MEDULLA-DURABLE-KERNEL-R084.3
Consumer: overstory OVERSTORY-APPS-R030.3

## Wire shape

The browser never writes the graph. `sendGraphEdit` posts one edit request through the arbora operation route. The engine owns the served `ApplyMutation` version check (`MEDULLA-DURABLE-KERNEL-R084.3`) and the refusal of an unchanged-state conflict (`MEDULLA-DURABLE-KERNEL-R084.4`). The client updates local state only after an `applied` verdict and an authoritative readback.

## Refusal codes

The engine refuses a stale version and an unchanged-state edit; the verdict reaches the browser as `refused` with the engine reason. An unauthorized edit leaves the durable graph state unchanged. The stable codes are defined by the provider rows above.

## Authoritative types

The wire-callable graph methods of the engine contract and the generated Arbora schemas. The consumer verdict type is `GraphEditVerdict` in `src/lib/graph-edit.ts`.

## Test vectors

Planned served proof for `OVERSTORY-APPS-R030.7`: unauthorized edits leave durable state unchanged, and an independent durable read confirms an applied edit.
