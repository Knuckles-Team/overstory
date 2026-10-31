# Contributing to overstory

`AGENTS.md` is the full engineering contract; this page is the short path from
a fresh clone to a pull request.

## Set up

Requirements: git, Python 3, Node.js (see `.node-version`) with `pnpm` or
`corepack`. Then, from the repository root:

```bash
scripts/bootstrap.sh
```

The script is idempotent. It checks out the gate tooling pinned in
`scripts/siblings.lock` under `.uv-workspace-siblings/`, installs uv 0.9 or
newer when needed, installs the pinned Python, runs `uv sync --frozen` with the
test extra, installs frontend dependencies with `pnpm install --frozen-lockfile`,
and installs the pre-commit and pre-push hooks from `.config/pre-commit.yaml`.
Every Python dependency installs from PyPI. Claude Code cloud sessions run the same script
through `.claude/hooks/session-start.sh`.

## Check the operator's change

```bash
uv run --no-sync pytest tests
pnpm test
uvx pre-commit run --config .config/pre-commit.yaml --all-files
```

CI runs that same pre-commit file, so a clean local run predicts the CI
result. A hook that cannot find its tool prints `SKIPPED (<gate>): <reason>`
locally; run `scripts/bootstrap.sh` to enable it. In CI the same condition
fails the job.

## Branches and pull requests

1. Create a topic branch from `main`.
2. Commit in small, logical steps with conventional commit subjects
   (`fix(scope): ...`, `feat(scope): ...`). Stage explicit paths and review
   `git diff --cached` first.
3. Push with `git push -u origin <branch>` and open a pull request against
   `main`, as a draft until it is ready for review.
4. The `gates` job must pass. Never bypass hooks with `--no-verify` or `SKIP`.

## Spec-driven contributions

Every change follows one process: constitution, route, specify, clarify, plan, tasks, analyze, implement, land, release.
Each step names its skill and the files it writes, in the
[organization contribution guide](https://github.com/Knuckles-Team/.github/blob/main/CONTRIBUTING.md).
Read the [constitution](https://github.com/Knuckles-Team/pipelines/blob/main/.specify/memory/constitution.md),
the [spec standard](https://github.com/Knuckles-Team/pipelines/blob/main/reference/spec-standard.md) and the
[spec templates](.specify/templates), and pick an open row in
[Canopy](https://knuckles-team.github.io/.github/architecture/). Commit with a `Spec: <ROW-ID>` trailer and a bound test.
