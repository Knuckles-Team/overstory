# Artifact intent operations

Seam between overstory and arbora. Owner rows: ARBORA-OPS-R896.1 in arbora and MEDULLA-SDLC-R014.6 in medulla..

Provider: arbora ARBORA-OPS-R896.1
Consumer: overstory OVERSTORY-DECIDE-R010.1

## Wire shape

The view asks the `ask` and `find` intent tools one question at a time: next unblocked task for phase P, plan to reach goal G, and plan to reach phase P. Arbora answers each from a registered engine competency query and returns the list in the engine order. The view renders the list as returned and keeps the order.

## Refusal codes

- Engine refusals pass through arbora unchanged, and the view shows the returned text.
- A denied read and a transport failure are separate states in the view.

## Authoritative types

- arbora `arbora/api/ops/development.py`: `handle_artifact_query`.
- medulla `specs/development-lifecycle/contracts/spec-artifact-graph.md`.
