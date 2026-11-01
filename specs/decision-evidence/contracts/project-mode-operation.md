# Project mode operation

Seam between overstory and arbora. Owner rows: ARBORA-OPS-R896.2 in arbora and MEDULLA-SDLC-R012.8 in medulla..

Provider: arbora ARBORA-OPS-R896.2
Consumer: overstory OVERSTORY-DECIDE-R011

## Wire shape

The view reads `project.mode.get` (verb `ask`), which returns one of `reference`, `development` or `evolving` for a repository. It changes the mode with `project.mode.set` (verb `manage`). A change to `evolving` returns a preview first and needs operator approval through the approval path.

## Refusal codes

- `MODE_APPROVAL_REQUIRED`: the engine refusal that arbora passes through when no operator approval exists. The mode stays unchanged.

## Authoritative types

- arbora `arbora/api/ops/development.py`: `handle_project_mode`.
