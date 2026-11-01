# Browser identity delivery

**States:** SPECIFIED → BUILDING → BUILT (merged source) → ACCEPTED (evidence). Current: **SPECIFIED**; no merged-head acceptance audit has been recorded here.

- [ ] T001 OVERSTORY-IDENTITY-R002 Inventory current identity host, Arbora `identity.*` operation names, elevation operation and auth-mode behavior on current main.
- [ ] T002 OVERSTORY-IDENTITY-R003.1.1 Replace local bootstrap bypasses with explicit loopback/ack mode and mode doctor; add refusal tests.
- [ ] T003 OVERSTORY-IDENTITY-R004.2 Implement server-side session/CSRF/local-auth flow and migration tests without browser token storage.
- [ ] T004 OVERSTORY-IDENTITY-R005 Add MFA enrollment/challenge/recovery flows and adversarial browser tests.
- [ ] T005 OVERSTORY-IDENTITY-R006 Connect admin tabs and mapping-rule preview to the generated identity client; delete duplicate direct routes after contract parity.
- [ ] T006 OVERSTORY-IDENTITY-R007 Reuse the same elevation operation from UI, chat and A2A; test step-up, two-person approval, expiry and revocation.
- [ ] T007 OVERSTORY-IDENTITY-R009 Run `test-spec.md` including hosted browser and accessibility cases on exact merged source; attach commit and evidence before acceptance.


## Explicit mode delivery and acceptance

- [ ] T008 OVERSTORY-IDENTITY-R003.1 Implement explicit no-auth mode with bounded anonymous policy with upstream producer bindings and the planned installed-stack evidence; remain SPECIFIED until delivered.
- [ ] T009 OVERSTORY-IDENTITY-R003.2 Implement built-in eg authentication through arbora with upstream producer bindings and the planned installed-stack evidence; remain SPECIFIED until delivered.
- [ ] T010 OVERSTORY-IDENTITY-R003.3 Implement external oidc provider interoperability with upstream producer bindings and the planned installed-stack evidence; remain SPECIFIED until delivered.
- [ ] T011 OVERSTORY-IDENTITY-R010 Implement long-session renewal and mode-transition coherence with upstream producer bindings and the planned installed-stack evidence; remain SPECIFIED until delivered.

## Source-only delivery and open integration children

- [ ] T012 OVERSTORY-IDENTITY-R003.1.1 Explicit anonymous source refusal boundary. Source mode tests cover anonymous provenance, policy refusal and ambient-authority cleanup. This does not deliver full no-auth journeys.
- [ ] T013 OVERSTORY-IDENTITY-R003.1.2 Complete installed anonymous journeys. Installed positive and adversarial anonymous-policy journeys and native effect qualification remain required.
- [ ] T014 OVERSTORY-IDENTITY-R003.2.1 EG boundary configuration source refusal. Source factory tests reject missing and untyped EG callbacks without provisioning credentials.
- [ ] T015 OVERSTORY-IDENTITY-R003.2.2 Installed EG identity journeys. Installed real producer/browser qualification remains required; source configuration refusal is not login support.
- [ ] T016 OVERSTORY-IDENTITY-R003.3.1 OIDC configuration source refusal. Source factory tests reject incompatible owners and incomplete browser OIDC configuration.
- [ ] T017 OVERSTORY-IDENTITY-R003.3.2 External provider interoperability qualification. Protocol fixtures and each claimed live provider remain required; configuration tests do not qualify provider interoperability.

## Workspace account source and remaining session acceptance

- [ ] T018 OVERSTORY-IDENTITY-R004.1 Deliver the shared workspace account menu and its rendered source regressions. Keep fixture identity and mocked HTTP evidence separate from installed acceptance.
- [ ] T019 OVERSTORY-IDENTITY-R004.2 Qualify all original local account flows, session fixation, CSRF, logout/replay and credential-storage guarantees on the exact installed stack.

The parent OVERSTORY-IDENTITY-R004 remains incomplete while its installed child is open. Source component checks do not close OVERSTORY-IDENTITY-R009 accessibility acceptance.

## Row coverage

- [ ] T020 OVERSTORY-IDENTITY-R008 implement and prove: Identity or tenant change invalidates cached protected data
- [ ] T021 OVERSTORY-IDENTITY-R001 implement and prove: Release-qualification identity test client supports a live sign-in probe
