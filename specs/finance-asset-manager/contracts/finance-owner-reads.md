# Finance owner reads contract

Provider: medulla MEDULLA-FINANCE-PRIMITIVES-R004
Consumer: overstory OVERSTORY-R011.2

## Wire shape

The browser reads owner-calculated values as decimal strings with method, currency, source, as-of time and session. It renders them verbatim. Holdings after a CSV import come from the owning service response (provider row SCION-FINANCE-SOURCES-R002, consumer row OVERSTORY-R014.2). Strategy proposals carry versioned evidence or an abstain reason and no order field (provider row MEDULLA-FINANCE-PRIMITIVES-R009, consumer row OVERSTORY-R012.2).

## Refusal codes

- Value unavailable: the view shows an explicit unavailable state, never zero.
- Value stale: the view shows a stale label with the as-of time.
- Access denied (401 or 403): the view shows a denied state, distinct from empty.
- Route not served (404 or 501): the view shows an unavailable state.

## Owner rows

- Provider rows: medulla MEDULLA-FINANCE-PRIMITIVES-R004, medulla MEDULLA-FINANCE-PRIMITIVES-R009, scion-sdk SCION-FINANCE-SOURCES-R002.
- Consumer rows: overstory OVERSTORY-R011.2, OVERSTORY-R012.2, OVERSTORY-R014.2.
