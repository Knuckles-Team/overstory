# OVERSTORY-IDENTITY quickstart

Run the proofs from the repository root.

## Component and client tests

```bash
pnpm exec vitest run src/components/__tests__/SignInPanel.test.tsx src/components/__tests__/UserMenu.test.tsx src/components/views/__tests__/AdminView.test.tsx src/lib/__tests__/identity-lifecycle.test.tsx src/__tests__/chat-store-identity.test.tsx
```

Expected: sign-in, account menu, admin tabs, lifecycle and cache ownership tests pass.

## Server mode tests

```bash
uv run pytest tests/test_explicit_auth_modes.py tests/test_oidc_configuration_intent.py tests/test_local_browser_boundary.py
```

Expected: no-auth, EG and OIDC configuration refusals pass.

## Installed qualification (R003.2, R003.3, R004.2)

```bash
WEBUI_INSTALLED_QUALIFICATION=1 uv run pytest tests/qualification
```

Expected once the planned journeys are built: installed composed-mode, OIDC and local-account journeys pass. A skipped run is not evidence.
