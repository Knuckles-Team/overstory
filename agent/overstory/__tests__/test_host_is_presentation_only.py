"""OVERSTORY-API-R012: the Python host serves presentation and session only.

The route census (``src/lib/arbora-api/route-census.json``) is the oracle for
every domain route the host still serves. These tests compare it with the
routes FastAPI actually mounts, keep the host import graph acyclic, and state
the end condition (no domain route, no module over the line bound) as a strict
expected failure so finishing the migration turns it into a visible error to
flip, instead of a quiet pass.
"""

from __future__ import annotations

import ast
import json
from pathlib import Path

import pytest
from overstory import api_extensions

HOST_DIR = Path(api_extensions.__file__).resolve().parent
CENSUS = HOST_DIR.parents[1] / 'src' / 'lib' / 'arbora-api' / 'route-census.json'
MODULE_LINE_BOUND = 1500
# The host's allowed set: presentation and session routes (owner ruling
# 2026-11-06). Every other census row is a domain route awaiting an Arbora
# operation.
ALLOWED_HOST_ROUTES = frozenset(
    {
        'GET /api/enhanced/info',
        'GET /api/enhanced/agent-icon',
        'GET /api/enhanced/download/{filename:path}',
        'GET /api/enhanced/editor-context',
        'POST /api/enhanced/editor-context',
        'GET /api/enhanced/mcp/servers/{server_name}/tools',
        'GET /api/enhanced/mcp/server-schema',
        'POST /api/enhanced/mcp/tools/call',
        'POST /api/enhanced/mcp/apps/resource',
        'GET /api/enhanced/sessions',
        'GET /api/enhanced/sessions/{session_id}',
        'DELETE /api/enhanced/sessions/{session_id}',
        'POST /api/enhanced/sessions/{session_id}/reply',
        'POST /api/enhanced/sessions/{session_id}/cancel',
    }
)
# (router, mount prefix) as wired in server.py
MOUNTS = (
    (api_extensions.router, '/api/enhanced'),
    (api_extensions.chats_router, '/api'),
)


def _mounted_routes() -> set[str]:
    found: set[str] = set()
    for router, prefix in MOUNTS:
        for route in router.routes:
            for method in sorted(route.methods or ()):
                if method in {'HEAD', 'OPTIONS'}:
                    continue
                found.add(f'{method} {prefix}{route.path}')
    return found


def _census() -> list[dict[str, object]]:
    return json.loads(CENSUS.read_text(encoding='utf-8'))


def _import_graph() -> dict[str, set[str]]:
    """Intra-package import edges, including imports nested in functions."""

    modules = {path.stem for path in HOST_DIR.glob('*.py')}
    graph: dict[str, set[str]] = {name: set() for name in modules}
    for path in HOST_DIR.glob('*.py'):
        for node in ast.walk(ast.parse(path.read_text(encoding='utf-8'))):
            if isinstance(node, ast.ImportFrom) and node.level == 1:
                if node.module in modules:
                    graph[path.stem].add(str(node.module))
                else:
                    graph[path.stem].update(
                        alias.name for alias in node.names if alias.name in modules
                    )
    return graph


def _cycle(graph: dict[str, set[str]]) -> list[str] | None:
    state: dict[str, int] = {}
    stack: list[str] = []

    def visit(name: str) -> list[str] | None:
        state[name] = 1
        stack.append(name)
        for nxt in sorted(graph[name]):
            if state.get(nxt) == 1:
                return [*stack[stack.index(nxt) :], nxt]
            if nxt not in state and (found := visit(nxt)):
                return found
        stack.pop()
        state[name] = 2
        return None

    for name in sorted(graph):
        if name not in state and (found := visit(name)):
            return found
    return None


def test_census_lists_exactly_the_mounted_domain_routes() -> None:
    census_routes = [str(row['route']) for row in _census()]
    assert len(census_routes) == len(set(census_routes))
    assert set(census_routes) == _mounted_routes()


def test_only_the_allowed_set_is_exempt_from_retirement() -> None:
    kept = {str(row['route']) for row in _census() if row['disposition'] != 'retire'}
    assert kept == ALLOWED_HOST_ROUTES


def test_host_units_do_not_import_each_other_in_a_cycle() -> None:
    assert _cycle(_import_graph()) is None


# spec: OVERSTORY-API-R012.2
def test_memory_and_link_routes_are_gone_and_masking_is_served() -> None:
    mounted = _mounted_routes()
    gone = [r for r in mounted if '/graph/memory' in r or r.endswith('/graph/link')]
    assert gone == []
    source = (Path(__file__).parents[1] / 'api_extensions.py').read_text(
        encoding='utf-8'
    )
    assert "'/graph/link'" not in source


# spec: OVERSTORY-API-R012.3
def test_no_cypher_validator_remains() -> None:
    assert not any(r.endswith('/graph/query') for r in _mounted_routes())
    for module in Path(__file__).parents[1].glob('*.py'):
        assert '_validate_read_only_cypher' not in module.read_text(encoding='utf-8')


# spec: OVERSTORY-API-R012
@pytest.mark.xfail(
    strict=True,
    reason='OVERSTORY-API-R012 in progress: domain routes await Arbora operations',
)
def test_no_domain_route_and_no_module_over_the_line_bound() -> None:
    domain = [row['route'] for row in _census() if row['disposition'] == 'retire']
    oversized = {
        path.name: lines
        for path in HOST_DIR.glob('*.py')
        if (lines := len(path.read_text(encoding='utf-8').splitlines()))
        > MODULE_LINE_BOUND
    }
    assert domain == []
    assert oversized == {}


def test_operate_qualification_has_one_served_fixture_host() -> None:
    fixtures = HOST_DIR.parents[1] / 'e2e' / 'fixtures' / 'operate-qualification'
    assert sorted(path.name for path in fixtures.glob('*_served.py')) == []
    assert (fixtures / 'served.py').is_file()
