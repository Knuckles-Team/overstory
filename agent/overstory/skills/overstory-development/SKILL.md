---
name: overstory-development
skill_type: skill
description: >-
  How to develop, build, test, gate, and release the overstory repository
  itself: the frontend/backend commands, the FastAPI host modules, how a page
  gets routed, and the gates that must pass before a change lands. Use this
  when you are changing overstory's own code, adding a new view, or
  preparing a commit/PR in this repository — not for using the shipped UI
  (see the `kg-webui-*` skills for that).
license: MIT
tags: [arbora, webui, development, build, test, gates, routing]
tier: repository
metadata:
  author: Knuckles-Team
  version: '0.1.0'
---

# overstory-development (repository)

Engineering contract for the overstory repository itself (browser app +
its FastAPI host), generated from `AGENTS.md`. The `kg-webui-*` skills in
this same directory document the shipped product surface for an end user;
this skill documents how to change the repository that builds it.

## Step 0: route the feature

Route the feature before any code.

1. Read the [ecosystem boundaries standard](https://github.com/Knuckles-Team/pipelines/blob/main/reference/ecosystem-boundaries.md).
2. Split the feature into parts with its routing procedure.
3. If a part is not owned by overstory, stop work on that part. Write its row in the owner's `specs/`, then link it by ID.
4. Continue here only with the parts that overstory owns.

## Spec-driven flow

Run this before any code. Full table and gates: the Spec-driven development section of `AGENTS.md` and the [spec standard](https://github.com/Knuckles-Team/pipelines/blob/main/reference/spec-standard.md).

1. Read `.specify/memory/constitution.md`; create it from `.specify/templates/constitution-template.md` if absent (`speckit-constitution`).
2. Specify the feature: `speckit-specify` gathers the inputs and writes `specs/<stable-id>/spec.md` and `requirements.md`.
3. Clarify: resolve every `[NEEDS CLARIFICATION: ...]` marker (`speckit-clarify`).
4. Plan: `plan.md` from `.specify/templates/plan-template.md`, including Build contract, Production caller chain and Cross-repo seams (`speckit-plan`).
5. Tasks: `tasks.md` lines `- [ ] T001 [P] [US1] <ROW-ID> ...` (`speckit-tasks`).
6. Analyze: fix the gaps and fill `checklists/requirements.md` (`speckit-analyze`).
7. Implement and land with the delivery contract in this skill (`speckit-implement`); release through pipelines `releases/*.yml` bundles.

Never write code for a row that is not SPECIFIED. Feature directories use the stable spec ID, never a numbered prefix. The state is computed from rows, `Spec:` trailers and test bindings; never write `status.json` or a `Status:` line.

## Delivery contract

Specs are already designed. The work is implementation.

**A row is delivered when**
- its behaviour is fully implemented, as the row says;
- it is wired to its production entry point (a production caller exists outside the new code and its tests);
- every test level its test-spec names passes;
- the tests are bound to the row;
- the gates verify it.

There is no time limit, no size limit per agent or per change, and no rule about how many agents deliver a row.

**Recommendations (optional)**
- Extend first: find the spec row that owns the behaviour (`git grep -n "<term>" -- specs`), cite its ID in the commit `Spec:` trailer, and reuse the existing function or module rather than adding a second implementation.
- Group rows that share an entry point into one bundle and deliver bundles in dependency order, producer first. Split a requirement into `<ID>.<n>` children when it names more than 2 code roots or is cross-repo; the destination repository copies a behaviour first, then the source switches importers and deletes.
- Net-new work can be sliced: `.1` typed model plus validation and refusal tests, `.2` the one entry point that uses it, `.3`+ each further behaviour.
- Every delivered ID gets at least one test bound to it in the same PR. Python: `@pytest.mark.spec("<ID>")`. Rust and TypeScript: a `// spec: <ID>` line directly above the test. Never write generated status files; the state is computed.
- Run the targeted tests for the change; leave the full suite to the main-branch gates.
- Report the PR URL, requirement IDs, test result, and any `ID:<main sha>` proof for rows already on main.

**Before every push**
- Work in a real `git worktree add` from `origin/main`. Never edit a shared checkout, never `git stash`, never `git add -A`, never force-push.
- Run the repo's own pre-commit on the changed files: `uvx --from pre-commit==4.6.0 pre-commit run --files $(git diff --name-only origin/main...HEAD)`. Fix every failure. No `noqa`, `type: ignore`, skip, xfail or whitelist entries to pass a gate.

**Landing**
- Open the pull request and merge it when every required check is green. Mechanical conflicts (generated files, Markdown) resolve by merging `origin/main`; real conflicts are additive in most cases and are resolved, not deferred.
- Full CI on main catches what the pull-request subset missed; regressions are fixed forward.

## What this repository owns

The browser presentation layer for Arbora, plus the FastAPI host that
adapts browser protocols to the platform gateway (React views, streaming/
WebSocket/REST adapters, browser identity/session/CSP enforcement, sandboxed
MCP App rendering, packaged frontend assets / wheel; shipped only as a PyPI package served by Arbora).
Arbora owns auth, composition, routing contracts and the gateway;
medulla owns durable graph state; meristem owns agent/
workflow control-plane behavior; connector packages own source transport.
Reuse the canonical gateway action or client — never add a second
route-specific implementation of something those layers already own.

## Toolchain and setup

Python 3.12–3.14, the Node.js version pinned in `.node-version`, `pnpm`, and
`uv` 0.9+.

```bash
scripts/bootstrap.sh            # pinned siblings, uv, Python, locked .venv, pnpm deps, git hooks
scripts/bootstrap.sh --engine   # also build medulla from source (slow; needed for KG/numeric tests)
```

Run dev services in separate terminals: `pnpm run dev:server` (FastAPI) and
`pnpm run dev` (Vite on 5173).

## Commands (exact `package.json` script names)

```bash
pnpm run typecheck     # tsc --noEmit
pnpm run lint           # eslint
pnpm run test           # vitest run
pnpm run test:coverage  # vitest run --coverage
pnpm run test:e2e       # playwright test
pnpm run build          # fabrication gate + site assets + tsc -b + vite build + publish-dist
```

Backend:

```bash
uv run --no-sync pytest tests                              # bounded fast suite (pre-push gate scope)
uv run --all-extras pytest agent/overstory/__tests__      # full backend contract/security suite (manual)
python -m overstory.server --security-doctor --host 0.0.0.0
```

`pytest.ini` sets `testpaths = agent/overstory/__tests__ tests`, but an
explicit path on the command line overrides `testpaths` — the two commands
above cover different, non-overlapping directories.

## The Python host (`agent/overstory/`)

`server.py` (FastAPI composition — `create_agent_web_app()` builds and mounts
the app; `main()` is the CLI entry point) · `api_extensions.py` (canonical
service browser facades) · `oidc_session.py` (OIDC flow and protected
sessions) · `graph_identity.py` (request-scoped graph identity) ·
`graph_admission.py` (graph operation authorization) · `browser_control.py`
(attended browser-control boundary) · `observability.py` (redacted request
telemetry).

## How a page gets routed

`src/lib/nav-registry.ts` is the single declarative source of truth for
every page: it exports the `RouteDef` type and the `ROUTES` / `PUBLIC_ROUTES`
/ `ROUTE_REGISTRY` arrays. **Adding a page means adding one `RouteDef` entry
here — there is no second place that declares a page.** `src/App.tsx` mounts
every route generically from its `RouteDef.element`, with three named
exceptions it documents inline (Dashboard, the persistent Chat panel, and the
`:id`-parameterized Object detail route). `public/spa-routes.json` is a
build-generated static mirror (via `scripts/site-route-registry.mjs`, run
from `pnpm run build`) used for sitemap/robots/WebMCP — never hand-edit it.

A `RouteDef` also carries `minRole` (enforced both in `App.tsx` and
server-side by `agent/overstory/rbac.py`'s `WebUIAuthorizationMiddleware` —
a hidden nav item alone is not a permission) and `capability` (hides the item
unless the backend reports that capability available).

## A view counts only when it is routed AND served

Do not mark a view done from component code plus passing unit tests alone.
Two independent facts both have to be true:

1. **Routed** — the view has a `RouteDef` entry in `nav-registry.ts`, so it
   is reachable in the built app (prove it with a test that reaches the
   rendered route, not just the component in isolation — see
   `e2e/routes-smoke.spec.ts`, which iterates every entry in `ROUTES`).
2. **Served** — its backend endpoint is mounted and responding from the real
   FastAPI host, not a stub or an injected test double standing in for it
   (see `test_spa_http_status.py`: build the real app, use `TestClient`,
   assert on the HTTP response).

This follows from two repository rules: "a control wired at only one entry
point is incomplete," and "for frontend behavior, pair unit coverage with a
test that reaches the rendered route or component; for backend behavior,
prove the real FastAPI entry point and the injected service seam." A
component that renders in a unit test but has no `nav-registry.ts` entry is
unreachable; a route that renders but whose data calls hit an endpoint the
host never mounts is equally incomplete.

## Gates

`scripts/bootstrap.sh` installs the commit and push git hooks. Before
committing:

```bash
uvx pre-commit run --config .config/pre-commit.yaml --all-files
uvx pre-commit run --config .config/pre-commit.yaml --all-files --hook-stage manual
```

Hosted CI's `gates` job in `.github/workflows/ci.yml` runs the same
pre-commit config (commit stage, then pre-push stage) over all files — the
one definition of the gate.

A hook whose tool or sibling checkout is missing prints
`SKIPPED (<gate>): <reason>` and passes locally; with `CI` set it fails
closed instead (`CANNOT RUN`, exit status 2). Never bypass a gate with
`--no-verify`, `SKIP`, a diagnostic-ignore comment, or warning suppression.

Documentation changes also run `public-surface` and `mkdocs build --strict`.
Skills under `agent/overstory/skills/` are not in `mkdocs.yml` nav — arbora
discovers them as package data, not Pages content — so a skill-only change
skips `mkdocs build --strict` unless it also touches `docs/` or `mkdocs.yml`.

## Development rules

- Keep changes small, typed, and tied to one observable outcome. Use
  Pydantic models at Python boundaries and TypeScript types at browser
  boundaries; validate untrusted values before rendering or forwarding them.
- Never place an Arbora service bearer, provider secret, or raw durable
  credential in browser state.
- Never stage with `git add -A` or `git add .`; stage an explicit path
  allowlist and review `git diff --cached` before committing.
- Never hand-edit version strings — use `bump-my-version bump patch|minor|major`.
- After a dependency change, regenerate and commit the lockfile with the
  declaration (`uv lock` + `uv.lock`, or `pnpm install` + `pnpm-lock.yaml`).
- Shared multi-worktree repository on a maintainer workstation: never edit
  the canonical checkout or `git stash` (the stash ref is shared by every
  worktree). Create a real Git worktree per lane
  (`git worktree add "$WORKTREE_ROOT/overstory/<branch>" -b <branch> main`),
  never a harness-managed isolated worktree against this repository.

## Skill packaging

This directory (`agent/overstory/skills/<name>/SKILL.md`) is already
covered by `pyproject.toml`'s `[tool.setuptools.package-data]` entry
(`overstory = ["dist/**", "icon.png", "skills/**/*"]`) and the
`meristem.skill_providers` entry point
(`overstory = "overstory.skills"`) — a new `SKILL.md` needs no further
packaging change.
