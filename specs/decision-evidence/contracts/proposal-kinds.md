# Proposal kinds

Seam between overstory and medulla. Owner row: MEDULLA-SDLC-R017.2 in medulla..

Provider: medulla MEDULLA-SDLC-R017.2
Consumer: overstory OVERSTORY-DECIDE-R009.1

## Wire shape

A proposal carries one closed kind. Row kinds are add, update, split, prune and retire. The plan kind is edit plan section. Task kinds are add, reorder and split. The other kinds are add contract, resolve clarification and tune knob. The view groups proposals by this kind and shows a kind it does not list as `unavailable`.

## Refusal codes

- `PROPOSAL_KIND_UNKNOWN`: the engine refuses an unknown kind.

## Authoritative types

- medulla `crates/medulla-types/src/lifecycle.rs`: `ProposalKind`.
