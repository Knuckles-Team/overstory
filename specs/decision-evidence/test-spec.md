# OVERSTORY-DECIDE — Test specification

Governing spec: [spec.md](spec.md).

| Test ID | Requirement | Level | Setup and input | Expected observation | Evidence |
|---|---|---|---|---|---|
| T-001 | `OVERSTORY-DECIDE-R003` | Contract and rendered route | Two-option synthetic certificate | Identifiers, derivations and constraints stay navigable. No premise is invented. |  |
| T-002 | `OVERSTORY-DECIDE-R004` | Adapter fixture | Success, timeout and denial | The original decision stays unchanged. The request is bounded and the diagnostic is distinct. |  |
| T-003 | `OVERSTORY-DECIDE-R005` | Rendered route | Independently labeled receipt | Coverage and risk labels include cohort, count, version, window and receipt. |  |
| T-004 | `OVERSTORY-DECIDE-R006` | Negative fixtures | Missing, synthetic and underpowered evaluation | No numeric bound and no deployable badge appear. |  |
| T-005 | `OVERSTORY-DECIDE-R007` | Browser | Delayed first response and a second identity | Old content never persists. No denied body leaks. |  |
| T-006 | `OVERSTORY-DECIDE-R008` | Keyboard and accessibility audit | Full explanation structure | Focus order, labels, table headers, contrast and text alternatives pass. |  |
| T-007 | `OVERSTORY-DECIDE-R009.1` | Component | Proposals of every kind with and without evidence | Each kind groups correctly. Missing evidence shows unavailable. |  |
| T-008 | `OVERSTORY-DECIDE-R009.2` | Component | Accept and reject actions | Accept requests a pull request. No direct write path exists. |  |
| T-009 | `OVERSTORY-DECIDE-R009.3` | Served L4 | Reviewer session on a loopback arbora | The pull request link and the refusal appear. A second tenant sees nothing. |  |
| T-010 | `OVERSTORY-DECIDE-R010.1` | Component | Answers in a fixed order, plus empty, denied and failed reads | The order is kept. The three states are distinct. |  |
| T-011 | `OVERSTORY-DECIDE-R010.2` | Served L4 | Goal chosen on a loopback arbora | Open tasks appear in the served order with row and contracts. |  |
| T-012 | `OVERSTORY-DECIDE-R011` | Component and served L4 | Mode change to evolving | The pending approval shows. The control never approves itself. |  |
| T-013 | `OVERSTORY-DECIDE-R001` | Independent-label fixture | Cohort, count, window and receipt fields | Each field shows separately. Synthetic-only, missing and underpowered cases show no claim. |  |
| T-014 | `OVERSTORY-DECIDE-R002` | Component and browser | Selected decision in an authenticated session | The explorer shows premise classes, derivations, certificate, why-not and violations. |  |

## Negative and boundary cases

A denied or cross-tenant read must show a generic access state with no existence leak. A stale response must never overwrite a newer selection. A proposal view must offer no write path other than the pull request request.

## Quality and release proof

Run `pnpm run typecheck`, `pnpm run test`, `pnpm run test:e2e`, `pnpm run build` and `uv run --all-extras pytest agent/overstory/__tests__`.
The E2E job starts its own browser, host, arbora fixture and test identity. An unavailable external deployment is not a pass.
Run `pre-commit run --config .config/pre-commit.yaml --all-files` and hosted CI on the exact commit. Record the commit, CI URL and browser outcomes as evidence.
