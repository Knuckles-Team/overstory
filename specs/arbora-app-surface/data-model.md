# OVERSTORY-APPS data model

Governing spec: [spec.md](spec.md). Rows: [requirements.md](requirements.md).

## GoalLink

`OVERSTORY-APPS-R006.1` adds the `GoalLink` type in `src/types.ts`. It links one goal to the sessions and fleet entries that serve it, built only from identifiers the Arbora read operations return.

A parser in `src/lib/goal-link.ts` rejects a link that names an identifier no returned record carries.

`GoalsView.tsx`, `SessionsView.tsx` and `FleetView.tsx` consume the parsed link. No view builds a link from a guessed identifier.
