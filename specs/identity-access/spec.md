# OVERSTORY-IDENTITY — Browser identity, administration and elevation

**ID:** OVERSTORY-IDENTITY
**Owner:** overstory
**Related IDs:** MERISTEM-SEC-R006, ARBORA-IDENTITY-R004, ARBORA-IDENTITY-R005, ARBORA-IDENTITY-R006, ARBORA-IDENTITY-R007, OVERSTORY-IDENTITY-R002
**Delivery:** specified; current source requires audit
**Acceptance:** open

## Outcome and actors

A visitor can understand the configured sign-in mode, authenticate or use an explicitly local bootstrap mode, manage their session and MFA, and an authorized administrator can manage identity policy through the Arbora identity API. A permitted user can request elevation and see an auditable approve/revoke state. Browser controls never grant a role or capability by changing local state alone.

Actors are visitor, authenticated member, identity administrator, elevation requester and separate approver. The same protected route rules apply to REST, streaming and WebSocket entry points. Local bootstrap is allowed only on loopback with explicit operator acknowledgment and visible banner; all non-loopback modes require verified identity. MFA is configurable globally and by group, not imposed unconditionally on all administrators.

## User scenarios and testing

### User Story 1 - Sign in under the configured mode (Priority: P1)

A user opens the interface and signs in through the mode the operator chose: explicit no-auth, built-in EG authentication or external OIDC. The user needs to see the active mode and to trust that no hidden bypass exists.

**Acceptance scenarios**

1. Given the operator selected no-auth, When the interface loads, Then it shows anonymous operation and its policy scope, and no signed-in principal appears.
2. Given EG authentication, When the user submits valid credentials, Then a server session starts and no credential enters browser storage.
3. Given external OIDC with an unavailable provider, When the user opens the interface, Then sign-in fails closed and does not fall back to another mode.

### User Story 2 - Protect the account with a second factor (Priority: P2)

A user enrolls and uses TOTP or WebAuthn and keeps one-time recovery codes.

**Acceptance scenarios**

1. Given an enrolled TOTP factor, When the user signs in, Then the interface asks for the code and accepts it once.
2. Given a used recovery code, When the user submits it again, Then the server refuses it.

### User Story 3 - Administer identity and elevation (Priority: P2)

An administrator manages users, roles, groups and mapping rules, and reviews elevation requests with scope, reason, expiry and receipt.

**Acceptance scenarios**

1. Given a caller without the admin role, When they open the admin tabs, Then each tab refuses through the typed operation.
2. Given an elevation request, When the approver opens it, Then the view shows scope, reason, expiry and receipt, and the approval binds to that caller and action.

### User Story 4 - Change identity safely (Priority: P3)

A user switches tenant or session, or the session expires, and sees no data from the prior context.

**Acceptance scenarios**

1. Given cached protected data, When the identity or tenant changes, Then the cache clears and open privileged interactions close.
2. Given an expired session, When the user signs in again, Then safe unsent drafts remain.

## Edge Cases

- A missing credential, a broken verifier or a provider outage never selects no-auth.
- A shared verifier issuer alone does not configure browser SSO.
- Two tabs renew one session once; a revoked session is not renewed.
- A failed step-up never becomes a success on retry without a new confirmation.
- An error never discloses whether a username, tenant or record exists.

## Assumptions

- The arbora identity operations named in the related rows exist and are served; this spec consumes them through the generated client.
- Installed qualification runs with synthetic identities; live provider evidence is reported separately.
- WebAuthn enrollment is built after the TOTP and recovery slice.

## Requirements and acceptance

| ID | Required behavior | Related IDs | Acceptance |
|---|---|---|---|
| OVERSTORY-IDENTITY-R003 | Mode wizard shows configured OIDC, local or loopback bootstrap and doctor result; no invisible auth bypass | ARBORA-IDENTITY-R004, ARBORA-IDENTITY-R007 | Mode-specific rendered + server tests |
| OVERSTORY-IDENTITY-R004 | Local register/login/logout/forgot/reset/change-password use server sessions and anti-CSRF. No credential or bearer is stored in browser persistence | ARBORA-IDENTITY-R005 | End-to-end session/fixation/CSRF probes |
| OVERSTORY-IDENTITY-R005 | MFA enrollment, challenge and recovery cover TOTP and WebAuthn, with one-time recovery code handling | ARBORA-IDENTITY-R006 | Positive, replay, lost-device tests |
| OVERSTORY-IDENTITY-R006 | Admin tabs cover users, roles, groups, auth modes and mapping-rule dry run through typed `identity.*` operations | ARBORA-IDENTITY-R007, OVERSTORY-IDENTITY-R002 | Authorized/denied generated-client tests |
| OVERSTORY-IDENTITY-R007 | Elevation request, approval and revocation display scope, reason, expiry and receipt; confirmation and step-up bind to the same caller and action | MERISTEM-SEC-R006 | A2A/chat/UI parity and adversarial tests |
| OVERSTORY-IDENTITY-R008 | Identity mode, tenant or session change invalidates cached protected data and closes active privileged interactions | ARBORA-IDENTITY-R004–ARBORA-IDENTITY-R007 | Two-principal browser test |
| OVERSTORY-IDENTITY-R009 | All forms, errors, tab panels and modal confirmations are keyboard and screen-reader usable, with equivalent mobile behavior | all | Accessibility E2E |

Errors must avoid disclosing whether a username, tenant or protected record exists. A failed step-up never turns into a successful action after retry unless a new valid confirmation and receipt are obtained. The UI's role labels are explanatory; authorization comes from Arbora and its delegated database scopes.

## Completion

BUILT requires merged WebUI source for each applicable requirement. ACCEPTED requires a fresh-checkout test identity service, real browser positive/negative probes, server/Arbora contract tests and exact-commit CI evidence. If a backend operation is not available, that requirement remains open; a mock screen does not count as delivered. State and receipts belong in `tasks.md`.

Requirement IDs are defined in [requirements.md](requirements.md); delivery state per ID is in `status.json`.

## Explicit authentication modes and long sessions

OVERSTORY-IDENTITY-R003.1, R003.2 and R003.3 extend the existing mode owner: no-auth, built-in EG authentication and configured external OIDC providers (Keycloak/Okta). OVERSTORY-IDENTITY-R010 defines common lifecycle and renewal. No-auth is an intentional operator-selected mode with honest anonymous policy/provenance, not a fallback after auth failure. These additions are SPECIFIED. Existing login/MFA/approval requirements apply when their authentication capability is enabled; anonymous operation cannot mint proof of identity or approval. All modes retain the same responsive navigation and UI/WebMCP action boundary.
