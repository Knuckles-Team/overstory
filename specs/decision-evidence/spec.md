# OVERSTORY-DECIDE — Decision evidence and calibration

Owner: overstory. Cross-repo IDs: ARBORA-OPS-R896.1, ARBORA-OPS-R896.2, ARBORA-OPS-R896.5, MEDULLA-SDLC-R012.8, MEDULLA-SDLC-R014.6, MEDULLA-SDLC-R017.2.
Public provenance: the rows of this spec and the linked owner specs hold all required detail.

## Delivery mapping

Component: Decision and development views
Depends-on: [ARBORA-OPS-R896.1](https://github.com/Knuckles-Team/arbora/blob/main/specs/hosted-api-operations/requirements.md), [ARBORA-OPS-R896.2](https://github.com/Knuckles-Team/arbora/blob/main/specs/hosted-api-operations/requirements.md), [ARBORA-OPS-R896.5](https://github.com/Knuckles-Team/arbora/blob/main/specs/hosted-api-operations/requirements.md)
References: [MEDULLA-SDLC](https://github.com/Knuckles-Team/medulla/blob/main/specs/development-lifecycle/spec.md)
Code: ../../src/App.tsx ../../src/lib/api.ts ../../src/components/views/

## User Scenarios & Testing

A reader inspects why a governed decision chose an option and whether evaluated calibration supports a claim. The view shows evidence that the authenticated arbora API returns. It never recomputes a decision, invents confidence or turns a diagnostic into permission. This spec owns presentation and browser adaptation. The engine owns decision records, and arbora owns authorization and the read contract.

### User Story 1 - Trace a decision (Priority: P1)

A tenant reader selects an option and traces the outcome, premises, derivations, constraints and why-not explanations to stable record identifiers.

**Acceptance Scenarios**:

1. **Given** an authorized decision with a certificate, **When** the reader selects an option, **Then** the view shows identifiers for each premise and derivation.
2. **Given** a missing field, **When** the view renders, **Then** it labels the field unavailable and fills no generated text.

### User Story 2 - Read calibration honestly (Priority: P1)

A reader sees coverage and risk only when independent evaluation supports them.

**Acceptance Scenarios**:

1. **Given** no evaluation or too few labeled samples, **When** the view renders, **Then** it shows `not evaluated` or `insufficient evidence` and no bound.
2. **Given** a valid receipt, **When** the view renders, **Then** it shows cohort, count, window and provenance as separate fields.
3. **Given** a cross-tenant read, **When** arbora denies it, **Then** the view shows a generic access state with no record body.

### User Story 3 - Review proposals (Priority: P2)

A reviewer reads typed proposals with their evidence and decides on each. Acceptance opens a pull request. Nothing else writes.

**Acceptance Scenarios**:

1. **Given** a proposal with evidence, **When** the reviewer accepts it, **Then** the view shows the pull request link and gate state.
2. **Given** a reviewer without access, **When** the view loads, **Then** it shows a generic access state.

### User Story 4 - Follow a plan and set the project mode (Priority: P2)

A reader follows a goal or phase to its open tasks in order. An operator changes the project mode.

**Acceptance Scenarios**:

1. **Given** a goal, **When** the reader opens it, **Then** the view lists the open tasks in the order that arbora returns.
2. **Given** a request for `evolving`, **When** the operator submits it, **Then** the view shows the pending approval.

### Edge Cases

- A denied read, an empty collection, a stale response and a network failure show distinct states.
- A tenant or purpose change cancels in-flight requests and clears cached results.
- A synthetic-only, missing or underpowered evaluation shows no numeric claim.

## Requirements

- **FR-001**: The explorer must show options, premises, derivations, certificate and violations. Rows: `OVERSTORY-DECIDE-R002`, `OVERSTORY-DECIDE-R003`, `OVERSTORY-DECIDE-R004`.
- **FR-002**: The dashboard must label evaluation fields independently and withhold unsupported claims. Rows: `OVERSTORY-DECIDE-R001`, `OVERSTORY-DECIDE-R005`, `OVERSTORY-DECIDE-R006`.
- **FR-003**: The views must isolate tenants and work without color, hover or pointer. Rows: `OVERSTORY-DECIDE-R007`, `OVERSTORY-DECIDE-R008`.
- **FR-004**: The proposal view must show typed proposals and land them only as pull requests. Rows: `OVERSTORY-DECIDE-R009`, `OVERSTORY-DECIDE-R009.1`, `OVERSTORY-DECIDE-R009.2`, `OVERSTORY-DECIDE-R009.3`.
- **FR-005**: The artifact view must show next task and plans from served operations. Rows: `OVERSTORY-DECIDE-R010`, `OVERSTORY-DECIDE-R010.1`, `OVERSTORY-DECIDE-R010.2`.
- **FR-006**: The project view must change the mode only through arbora with operator approval. Rows: `OVERSTORY-DECIDE-R011`.

## Success Criteria

- **SC-001**: A two-tenant browser run shows no content of the other tenant. Rows: `OVERSTORY-DECIDE-R007`.
- **SC-002**: A reviewer decides a proposal and sees the pull request link. Rows: `OVERSTORY-DECIDE-R009.3`.
- **SC-003**: A reader follows a goal to its open tasks in served order. Rows: `OVERSTORY-DECIDE-R010.2`.

## Assumptions

- Generated arbora API types prevail over the conceptual response shapes in `plan.md`.
- A test arbora service and identity fixture exist for browser acceptance.

## Why a new spec

This spec is not new. It extends the decision evidence views with the proposal, artifact and mode views. No other overstory spec presents engine decisions or development records.

## Scope and interfaces

Owned: the decision explorer, the evaluation dashboard, the proposal view, the artifact view and the mode control. Not owned: decision records and evaluation data (medulla), authorization, the read contract and the served operations (arbora). The views hold no write path to the engine.

## Traceability

| Label | Rows | Design section | Test ID | Evidence |
|---|---|---|---|---|
| FR-001 | `OVERSTORY-DECIDE-R003` | plan.md#data-and-interaction-contract | T-001 |  |
| FR-002 | `OVERSTORY-DECIDE-R005` | plan.md#data-and-interaction-contract | T-003 |  |
| FR-003 | `OVERSTORY-DECIDE-R007` | plan.md#failure-privacy-and-migration | T-005 |  |
| FR-004 | `OVERSTORY-DECIDE-R009.3` | plan.md#development-views | T-009 |  |
| FR-005 | `OVERSTORY-DECIDE-R010.2` | plan.md#development-views | T-011 |  |
| FR-006 | `OVERSTORY-DECIDE-R011` | plan.md#development-views | T-012 |  |
| SC-001 | `OVERSTORY-DECIDE-R007` | plan.md#failure-privacy-and-migration | T-005 |  |
| SC-002 | `OVERSTORY-DECIDE-R009.3` | plan.md#development-views | T-009 |  |
| SC-003 | `OVERSTORY-DECIDE-R010.2` | plan.md#development-views | T-011 |  |
