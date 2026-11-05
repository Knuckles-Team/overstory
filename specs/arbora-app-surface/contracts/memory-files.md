# Seam: versioned memory files

Provider: arbora ARBORA-OPS-R024.4.1
Consumer: overstory OVERSTORY-APPS-R031.2

## Wire shape

Arbora serves the memory file operations (`ARBORA-OPS-R024.4.1` to `ARBORA-OPS-R024.4.6`) for list, read, save and conflict resolution, over the engine versions, conflicts, retention and sync evidence of `MEDULLA-DURABLE-KERNEL-R085.1` to `MEDULLA-DURABLE-KERNEL-R085.8`. The browser sends generated, bounded requests: content up to 1 MiB, document identifiers up to 256 bytes and logical paths up to 1024 bytes, with an exact precondition and digest on save. The browser cannot invoke host observation or materialization acknowledgment.

## Refusal codes

An authorized stale save returns `conflict_retained` only after both versions are durably retained. A refused result carries only an error code and a request-local correlation, with equal disclosure for denied existing, absent and creation attempts. Sync labels are `in_sync`, `graph_ahead`, `file_ahead`, `conflict` or `unavailable`, rendered only from served evidence. The stable codes are defined by the provider rows above.

## Authoritative types

The generated Arbora schemas and the engine retention contract of `MEDULLA-DURABLE-KERNEL-R085`. The consumer helpers are planned in `src/lib/memory-files.ts`.

## Test vectors

Planned `e2e/memory-files-served.spec.ts` holds the served vectors: cursor rejection, competing saves, retained conflicts across restart and the delayed acknowledgment race of `OVERSTORY-APPS-R031.7`.
