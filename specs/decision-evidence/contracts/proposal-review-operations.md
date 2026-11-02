# Proposal review operations

Seam between overstory and arbora. Owner rows: ARBORA-OPS-R896.5 in arbora and MEDULLA-SDLC-R017 in medulla..

Provider: arbora ARBORA-OPS-R896.5
Consumer: overstory OVERSTORY-DECIDE-R009.2

## Wire shape

The view lists proposals with `development.proposal.list` (verb `find`), which returns kind, target, evidence and state for each. It records a decision with `development.proposal.review` (verb `act`). An accept asks the engine to open a pull request that runs the gates; the view shows the returned link and gate state. A reject records the refusal.

## Refusal codes

- `PROPOSAL_DIRECT_WRITE_REFUSED`: a request to write a file or merge directly. The view offers no such path.

## Authoritative types

- arbora `arbora/api/ops/development.py`: `handle_proposal_review`.
- medulla `specs/development-lifecycle/contracts/proposal-review.md`.
