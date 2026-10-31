# Overstory constitution

This repository inherits the [organization constitution](https://github.com/Knuckles-Team/pipelines/blob/main/.specify/memory/constitution.md) version 1.0.0. Every article of that constitution applies here. This file adds only the rules and limits of this repository.

**Inherits**: organization constitution v1.0.0 | **Version**: 1.0.0 | **Ratified**: 2026-10-31 | **Last amended**: 2026-10-31

## Organization standards

- [Spec standard](https://github.com/Knuckles-Team/pipelines/blob/main/reference/spec-standard.md): one owning spec per capability, computed states, `Spec:` trailers.
- [Ecosystem boundaries](https://github.com/Knuckles-Team/pipelines/blob/main/reference/ecosystem-boundaries.md): which repository owns which requirement.
- [Wording standard](https://github.com/Knuckles-Team/pipelines/blob/main/reference/ste.md): sentences of 20 words or fewer, with `must`, `should`, or `may`.

## Repository articles

### R-I. The browser shows; arbora decides

Overstory presents and takes input. It reads data and sends commands only through the arbora client. It computes no decision and imports no engine, harness or other interface package.

**Enforced by:** [Ecosystem boundaries](https://github.com/Knuckles-Team/pipelines/blob/main/reference/ecosystem-boundaries.md), overstory row and forbidden-import matrix.

**Plan check:** Does every data access in the change go through the arbora client?

### R-II. No fabricated data in the interface

A view shows real served data or an honest empty, loading or error state. It never shows invented values.

**Enforced by:** Pre-commit hook `no-fabrication-gate` (`scripts/no_fabrication_gate.mjs`).

**Plan check:** Does each new view show served data or an honest state?

### R-III. The frontend type-checks, lints and builds

The TypeScript sources pass the type check, lint and build before a change lands.

**Enforced by:** Pre-commit hooks `typecheck`, `lint`, `eslint-staged` and `pnpm-build`; `eslint.config.ts` and `tsconfig.json`.

**Plan check:** Does the change pass the type check, lint and build?

## Repository limits

This repository sets no numeric limit of its own. It follows the organization limits table.

Amend this file in a reviewed change. State the impact in the pull request. When the organization constitution changes its version, update the **Inherits** line in the same change.
