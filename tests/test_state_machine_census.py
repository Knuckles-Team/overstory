"""OVERSTORY-APPS-R052 (PIPE-GATES-R086.8): this repository runs the shared state-machine census.

The census is adopted in mode ``staged`` (findings are printed, the hook exits
0) until the last state-machine row of this repository is verified; the hook
then moves to ``blocking``. The shared hook itself is tested in pipelines.
"""

from __future__ import annotations

import tomllib
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]


def _pipelines_hooks() -> dict[str, dict]:
    document = yaml.safe_load(
        (ROOT / '.config/pre-commit.yaml').read_text(encoding='utf-8')
    )
    repos = [
        repo
        for repo in document['repos']
        if repo['repo'].endswith('Knuckles-Team/pipelines')
    ]
    assert len(repos) == 1 and repos[0]['rev'] == 'main'
    return {hook['id']: hook for hook in repos[0]['hooks']}


@pytest.mark.spec('OVERSTORY-APPS-R052')
def test_census_exits_zero() -> None:
    policy = tomllib.loads((ROOT / 'pyproject.toml').read_text(encoding='utf-8'))[
        'tool'
    ]['pipelines_hooks']
    table = policy['state_machine']
    assert table['mode'] == 'staged'
    assert table['paths'] and all((ROOT / path).is_dir() for path in table['paths'])
    assert set(table['languages']) <= {'python', 'rust'}
    hooks = _pipelines_hooks()
    assert hooks['state-machine-shape']['stages'] == ['pre-commit', 'pre-push']
    assert hooks['state-machine-census']['stages'] == ['manual']
