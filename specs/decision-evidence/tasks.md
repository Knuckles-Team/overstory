# OVERSTORY-DECIDE — Implementation tasks

Governing spec: [spec.md](spec.md). Design: [plan.md](plan.md). Rows: [requirements.md](requirements.md).

Each task line reads `- [ ] T001 [P] [US1] <ID>-R012.4 description`. The task number and the row ID are required.
`[P]` marks a task that may run in parallel. `[US1]` names the user story. Order tasks producer first.

- [ ] T001 [US2] OVERSTORY-DECIDE-R001 Evaluation dashboard shows calibration and coverage.
- [ ] T002 [US1] OVERSTORY-DECIDE-R002 Decision explorer surfaces premises, derivations and violations.
- [ ] T003 [US1] OVERSTORY-DECIDE-R003 Decision explorer cites premises, derivations and certificate.
- [x] T004 [US1] OVERSTORY-DECIDE-R004 Why-not explanations run on demand within a bounded budget.
- [ ] T005 [US2] OVERSTORY-DECIDE-R005 Dashboard labels each evaluation field independently.
- [ ] T006 [US2] OVERSTORY-DECIDE-R006 No coverage claim shown for inadequate evaluation data.
- [ ] T007 [US2] OVERSTORY-DECIDE-R007 Tenant or purpose change invalidates cached decision queries.
- [ ] T008 [US2] OVERSTORY-DECIDE-R008 Explanation views work without color, hover or pointer.
- [ ] T009 [US3] OVERSTORY-DECIDE-R009 Proposal review view (rollup).
- [ ] T010 [US3] OVERSTORY-DECIDE-R009.1 Typed kinds and evidence.
- [ ] T011 [P] [US3] OVERSTORY-DECIDE-R009.2 Accept and reject land only as a pull request.
- [ ] T012 [P] [US3] OVERSTORY-DECIDE-R009.3 Hot-path proof: reviewer decides a proposal.
- [ ] T013 [US4] OVERSTORY-DECIDE-R010 Artifact graph view (rollup).
- [ ] T014 [US4] OVERSTORY-DECIDE-R010.1 Render the answers of the served operations.
- [ ] T015 [P] [US4] OVERSTORY-DECIDE-R010.2 Hot-path proof: follow a goal to its open tasks.
- [ ] T016 [US4] OVERSTORY-DECIDE-R011 Project mode control.

The why-not helper `getWhyNotOnDemand` resolves `timeout` or `refused` without changing the rendered record (`OVERSTORY-DECIDE-R004`). Fixture coverage is in `src/components/decisions/__tests__/DecisionDetailPanel.test.tsx`. No production arbora transport is wired yet.
