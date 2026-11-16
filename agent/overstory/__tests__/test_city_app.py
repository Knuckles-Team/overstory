"""The City app routes (OVERSTORY-CITY-R003/R014/R017) and the apps catalog.

The routes run through a real FastAPI app (``build_apps_router``) with a
fake fleet invoker that answers the served operation ``fleet.catalog.list``
with the captured live shape (browse + summary for the server list, a
per-server tool-item read for served packs). The fake records every call,
so the tests prove what the app asks Arbora for -- one browse read plus
one bounded read per served pack -- and how it whitelists, caches and
refuses.
"""

# spec: OVERSTORY-CITY-R003, OVERSTORY-CITY-R017

from __future__ import annotations

import json
import time
from datetime import UTC, datetime
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from overstory.apps import AppBackend, build_apps_router, default_apps
from overstory.apps.city import CityGateway, build_city_router, normalize_fleet

BROWSE: dict[str, Any] = {
    'items': [],
    'next_cursor': None,
    'servers': [
        {
            'server': 'alpha-mcp',
            'surfaces': {'tools': {'count': 5, 'status': 'ok'}},
            'surface_gap': 0,
            'pack_status': 'served',
            # R017: extra fields exist upstream and must never reach the browser.
            'credential': 'sk-SECRET',
            'operator': 'alice',
        },
        {
            'server': 'beta-mcp',
            'surfaces': {'tools': {'count': 0}},
            'pack_status': 'served',
        },
        {
            'server': 'gamma-mcp',
            'surfaces': {},
            'pack_status': 'registered_unpublished',
        },
        {
            'server': 'arbora',
            'surfaces': {'skills': {'count': 15}, 'prompts': {'count': 29}},
            'pack_status': 'served',
        },
        'not-a-mapping',
        {'server': '', 'pack_status': 'served'},
        {'server': 'delta-mcp', 'pack_status': 'unknown_status'},
        {'server': 'x' * 201, 'pack_status': 'served'},
    ],
}

TOOL_ITEMS: dict[str, list[Any]] = {
    'alpha-mcp': [
        {'id': 'alpha_one', 'kind': 'tool', 'name': 'alpha_one', 'server': 'alpha-mcp'},
        {'id': 'foreign', 'kind': 'tool', 'name': 'beta_one', 'server': 'beta-mcp'},
        {
            'id': 'alpha_skill',
            'kind': 'skill',
            'name': 'alpha_two',
            'server': 'alpha-mcp',
        },
        {
            'id': 'alpha_three',
            'kind': 'tool',
            'name': 'alpha_three',
            'server': 'alpha-mcp',
        },
        'junk',
    ],
    'arbora': [
        {
            'id': 'admission.review',
            'kind': 'tool',
            'name': 'admission.review',
            'server': 'arbora',
        }
    ],
}


class FakeFleet:
    """The ``fleet.catalog.list`` invoker the gateway reaches."""

    def __init__(
        self,
        browse: dict[str, Any] = BROWSE,
        tool_items: dict[str, list[Any]] = TOOL_ITEMS,
        failure: Exception | None = None,
    ) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.browse = browse
        self.tool_items = tool_items
        self.failure = failure

    async def invoke(self, op_id: str, params: dict[str, Any]) -> Any:
        self.calls.append((op_id, dict(params)))
        if self.failure is not None:
            raise self.failure
        if params.get('query'):
            return {'items': self.tool_items.get(params['query'], [])}
        return self.browse


class Clock:
    def __init__(self, value: float = 1_000.0) -> None:
        self.value = value

    def __call__(self) -> float:
        return self.value


def _client(fake: FakeFleet, clock: Clock | None = None) -> TestClient:
    gateway = CityGateway(invoke=fake.invoke, clock=clock or time.time)
    app = FastAPI()
    backend = AppBackend(
        app_id='city',
        router=build_city_router(gateway),
        available=lambda: True,
        unavailable_reason='never: the city degrades to its bundled snapshot',
    )
    app.include_router(build_apps_router([backend]))
    return TestClient(app)


def test_the_fleet_route_serves_the_whitelisted_catalog() -> None:
    fake = FakeFleet()
    client = _client(fake)
    body = client.get('/api/apps/city/fleet').json()

    # Exactly one browse read and one tool read per served pack with tools.
    assert [op for op, _ in fake.calls] == ['fleet.catalog.list', 'fleet.catalog.list']
    assert fake.calls[0][1] == {'browse': True, 'summary': True}
    assert fake.calls[1][1] == {
        'query': 'alpha-mcp',
        'kinds': ['tool'],
        'limit': 12,
    }

    servers = {s['server']: s for s in body['servers']}
    assert set(servers) == {'alpha-mcp', 'beta-mcp', 'gamma-mcp', 'arbora'}
    # Strict whitelist shape: no extra field survives normalization (R017).
    for server in body['servers']:
        assert set(server) == {'server', 'toolCount', 'tools', 'packStatus'}
    assert 'sk-SECRET' not in json.dumps(body)
    assert 'alice' not in json.dumps(body)
    assert servers['alpha-mcp'] == {
        'server': 'alpha-mcp',
        'toolCount': 5,
        'tools': ['alpha_one', 'alpha_three'],
        'packStatus': 'served',
    }
    assert servers['beta-mcp'] == {
        'server': 'beta-mcp',
        'toolCount': 0,
        'tools': [],
        'packStatus': 'served',
    }
    assert servers['gamma-mcp'] == {
        'server': 'gamma-mcp',
        'toolCount': 0,
        'tools': [],
        'packStatus': 'registered_unpublished',
    }
    # A fresh capture is stamped with the current UTC time as ISO-8601.
    captured = datetime.fromisoformat(body['captured_at'])
    assert captured.tzinfo is not None
    assert abs((datetime.now(UTC) - captured).total_seconds()) < 300
    assert body['cache'] == {'stale': False, 'age_seconds': 0.0}


def test_tool_names_are_bounded_at_twelve_per_pack() -> None:
    fake = FakeFleet(
        tool_items={
            'alpha-mcp': [
                {
                    'id': f't{i}',
                    'kind': 'tool',
                    'name': f'tool_{i}',
                    'server': 'alpha-mcp',
                }
                for i in range(15)
            ]
        }
    )
    body = _client(fake).get('/api/apps/city/fleet').json()
    alpha = next(s for s in body['servers'] if s['server'] == 'alpha-mcp')
    assert len(alpha['tools']) == 12
    assert alpha['tools'] == [f'tool_{i}' for i in range(12)]


def test_the_catalog_is_cached_for_sixty_seconds() -> None:
    fake = FakeFleet()
    clock = Clock()
    client = _client(fake, clock)
    client.get('/api/apps/city/fleet')
    assert len(fake.calls) == 2  # browse + one tool read per served pack

    clock.value += 59
    body = client.get('/api/apps/city/fleet').json()
    assert len(fake.calls) == 2  # served from cache
    assert body['cache']['age_seconds'] == 59.0

    clock.value += 2  # 61 s: the read is no longer trusted
    client.get('/api/apps/city/fleet')
    assert len(fake.calls) == 4


def test_an_unreachable_or_absent_catalog_is_a_stated_503() -> None:
    unreachable = _client(FakeFleet(failure=HTTPException(503, 'arbora_unreachable')))
    response = unreachable.get('/api/apps/city/fleet')
    assert response.status_code == 503
    assert response.json()['detail'] == 'The fleet catalog is not available'
    status = unreachable.get('/api/apps/city/status').json()
    assert status == {
        'status': 'ok',
        'arbora': {'reachable': False},
        'connectors': {'served': 0, 'registered': 0},
    }

    absent = _client(FakeFleet(failure=HTTPException(501, {'error': 'not_available'})))
    assert absent.get('/api/apps/city/fleet').status_code == 503


def test_any_other_upstream_failure_is_unavailable_too() -> None:
    broken = _client(FakeFleet(failure=RuntimeError('boom')))
    assert broken.get('/api/apps/city/fleet').status_code == 503


def test_a_typed_refusal_passes_its_code_through() -> None:
    refused = _client(FakeFleet(failure=HTTPException(403, 'PERMISSION_DENIED')))
    response = refused.get('/api/apps/city/fleet')
    assert response.status_code == 403
    assert response.json()['detail'] == 'PERMISSION_DENIED'


def test_normalize_fleet_drops_unrecognized_entries() -> None:
    rows = normalize_fleet(
        {
            'servers': [
                {
                    'server': 'ok-mcp',
                    'surfaces': {'tools': {'count': 3}},
                    'pack_status': 'served',
                },
                {'server': 'no-count-mcp', 'pack_status': 'served'},
                {
                    'server': 'odd',
                    'surfaces': {'tools': 'not-a-mapping'},
                    'pack_status': 'served',
                },
                {'server': None, 'pack_status': 'served'},
                {'server': 'weird', 'pack_status': 'serving'},
            ]
        }
    )
    assert rows == [
        {'server': 'ok-mcp', 'toolCount': 3, 'packStatus': 'served'},
        {'server': 'no-count-mcp', 'toolCount': 0, 'packStatus': 'served'},
        {'server': 'odd', 'toolCount': 0, 'packStatus': 'served'},
    ]
    assert normalize_fleet(None) == []
    assert normalize_fleet({'servers': 'nope'}) == []


def test_the_apps_catalog_reports_the_city_available() -> None:
    app = FastAPI()
    app.include_router(build_apps_router(default_apps()))
    with TestClient(app) as client:
        body = client.get('/api/apps').json()
    by_id = {entry['id']: entry for entry in body['apps']}
    assert by_id['city'] == {'id': 'city', 'available': True, 'detail': None}
    # The city router carries its two routes.
    city = next(a for a in default_apps() if a.app_id == 'city')
    paths = {route.path for route in city.router.routes}
    assert {'/status', '/fleet'} <= paths


def test_default_apps_registers_one_city_backend() -> None:
    cities = [a for a in default_apps() if a.app_id == 'city']
    assert len(cities) == 1
    assert cities[0].available() is True
