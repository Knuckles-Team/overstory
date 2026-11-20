"""The City app's layout routes (OVERSTORY-CITY-R032).

The routes run through a real FastAPI app (``build_apps_router``) with a
fake layout backend that answers the served operations
``fleet.layout.overrides.read`` / ``fleet.layout.overrides.write`` in
memory: a write persists the snake_case wire document, a second viewer
reads the same document back, reads are cached for the layout TTL and a
write invalidates the cache. An unserved read is a stated 503 (the viewer
boots the derived layout), a typed Arbora refusal on the write passes
through with its own code, and the strict normalizer drops unsound
entries and refuses any document version other than 1.
"""

# spec: OVERSTORY-CITY-R032

from __future__ import annotations

import time
from datetime import UTC, datetime
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from overstory.apps import AppBackend, build_apps_router
from overstory.apps.city import (
    LAYOUT_READ_OP,
    LAYOUT_WRITE_OP,
    CityGateway,
    build_city_router,
    normalize_layout_doc,
)

#: One stored wire document (snake_case, the served shape).
WIRE_DOC: dict[str, Any] = {
    'version': 1,
    'moves': [{'building_id': 'alpha-mcp', 'plot': 3, 'rotation': 90}],
    'roads': [{'kind': 'add', 'segment_id': 's1', 'from': 'n0:0', 'to': 'n1:1'}],
    'styles': [{'domain': 'data', 'archetype': 'studio'}],
}

#: The same document in the browser's camelCase shape (the PUT body).
BROWSER_DOC: dict[str, Any] = {
    'version': 1,
    'moves': [{'buildingId': 'alpha-mcp', 'plot': 3, 'rotation': 90}],
    'roads': [{'kind': 'add', 'segmentId': 's1', 'from': 'n0:0', 'to': 'n1:1'}],
    'styles': [{'domain': 'data', 'archetype': 'studio'}],
}


class FakeLayoutBackend:
    """The served layout operations the city gateway reaches, in memory.

    ``store`` is the persisted wire document (None: nothing stored yet, so
    the read is unserved). ``missing_ops`` answer 501 (the capability is
    not served); ``failure`` raises on every call.
    """

    def __init__(
        self,
        store: dict[str, Any] | None = None,
        *,
        missing_ops: frozenset[str] = frozenset(),
        failure: Exception | None = None,
    ) -> None:
        self.store: dict[str, Any] | None = store
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.missing_ops = missing_ops
        self.failure = failure

    async def invoke(self, op_id: str, params: dict[str, Any]) -> Any:
        self.calls.append((op_id, dict(params)))
        if op_id in self.missing_ops:
            raise HTTPException(501, {'error': 'not_available'})
        if self.failure is not None:
            raise self.failure
        if op_id == LAYOUT_WRITE_OP:
            self.store = params['doc']
            return self.store
        if op_id == LAYOUT_READ_OP:
            if self.store is None:
                raise HTTPException(501, {'error': 'not_available'})
            return self.store
        raise AssertionError(f'unexpected operation: {op_id}')


class Clock:
    def __init__(self, value: float = 2_000.0) -> None:
        self.value = value

    def __call__(self) -> float:
        return self.value


def _client(fake: FakeLayoutBackend, clock: Clock | None = None) -> TestClient:
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


def test_the_layout_read_serves_the_stored_document() -> None:
    fake = FakeLayoutBackend(store=WIRE_DOC)
    body = _client(fake).get('/api/apps/city/layout').json()

    assert [op for op, _ in fake.calls] == [LAYOUT_READ_OP]
    assert body['doc'] == BROWSER_DOC
    # A fresh capture is stamped with the current UTC time as ISO-8601.
    captured = datetime.fromisoformat(body['captured_at'])
    assert captured.tzinfo is not None
    assert abs((datetime.now(UTC) - captured).total_seconds()) < 300
    assert body['cache'] == {'stale': False, 'age_seconds': 0.0}


def test_a_write_persists_and_a_second_viewer_reads_the_same_city() -> None:
    fake = FakeLayoutBackend()  # nothing stored yet: the first write lands
    client = _client(fake)

    response = client.put('/api/apps/city/layout', json=BROWSER_DOC)
    assert response.status_code == 200
    body = response.json()
    assert body['doc'] == BROWSER_DOC
    assert 'captured_at' in body
    # The served write received the snake_case wire shape.
    assert [op for op, _ in fake.calls] == [LAYOUT_WRITE_OP]
    assert fake.calls[0][1] == {'doc': WIRE_DOC}
    assert fake.store == WIRE_DOC

    # A second viewer (a fresh gateway over the same served state) boots
    # into the city the first one edited.
    second = _client(fake)
    second_body = second.get('/api/apps/city/layout').json()
    assert second_body['doc'] == BROWSER_DOC
    assert [op for op, _ in fake.calls] == [LAYOUT_WRITE_OP, LAYOUT_READ_OP]


def test_layout_reads_are_cached_and_a_write_invalidates_them() -> None:
    fake = FakeLayoutBackend(store=WIRE_DOC)
    clock = Clock()
    client = _client(fake, clock)

    client.get('/api/apps/city/layout')
    assert len(fake.calls) == 1

    clock.value += 29  # inside the 30 s layout TTL: served from cache
    body = client.get('/api/apps/city/layout').json()
    assert len(fake.calls) == 1
    assert body['cache']['age_seconds'] == 29.0

    # A write clears every layout cache entry: the next read is fresh,
    # even though the clock is still inside the TTL.
    assert client.put('/api/apps/city/layout', json=BROWSER_DOC).status_code == 200
    client.get('/api/apps/city/layout')
    assert len(fake.calls) == 3

    clock.value += 30  # the fresh read is no longer trusted either
    client.get('/api/apps/city/layout')
    assert len(fake.calls) == 4


def test_an_unserved_layout_read_is_a_stated_503() -> None:
    fake = FakeLayoutBackend(missing_ops=frozenset({LAYOUT_READ_OP}))
    response = _client(fake).get('/api/apps/city/layout')
    assert response.status_code == 503
    assert response.json()['detail'] == 'The served layout is not available'
    # The write still lands (the capability gap is read-side only).
    assert (
        _client(fake).put('/api/apps/city/layout', json=BROWSER_DOC).status_code == 200
    )


def test_an_absent_layout_is_a_stated_503_too() -> None:
    # Nothing stored yet: the read is 501 upstream, a stated absence here.
    response = _client(FakeLayoutBackend()).get('/api/apps/city/layout')
    assert response.status_code == 503
    assert response.json()['detail'] == 'The served layout is not available'


def test_a_typed_write_refusal_passes_through_its_code() -> None:
    fake = FakeLayoutBackend(failure=HTTPException(403, {'error': 'forbidden'}))
    response = _client(fake).put('/api/apps/city/layout', json=BROWSER_DOC)
    assert response.status_code == 403
    # The refusal was not saved: nothing persists.
    assert fake.store is None


def test_an_unclassified_write_failure_is_unavailable() -> None:
    fake = FakeLayoutBackend(failure=RuntimeError('boom'))
    response = _client(fake).put('/api/apps/city/layout', json=BROWSER_DOC)
    assert response.status_code == 503
    assert response.json()['detail'] == 'The layout write is not available'
    assert fake.store is None


def test_normalize_layout_doc_drops_invalid_entries() -> None:
    doc = normalize_layout_doc(
        {
            'version': 1,
            'moves': [
                {'building_id': 'ok-mcp', 'plot': 7, 'rotation': 180},
                {'building_id': 'bad-rot', 'plot': 8, 'rotation': 45},
                {'building_id': 'extra-field', 'plot': 9, 'rotation': 90, 'oops': 1},
                {'building_id': 'bool-plot', 'plot': True, 'rotation': 0},
                {'building_id': 'big-plot', 'plot': 1024, 'rotation': 0},
                'not-a-mapping',
            ],
            'roads': [
                {'kind': 'add', 'segment_id': 'ok-seg', 'from': 'n0:0', 'to': 'n1:1'},
                {'kind': 'add', 'segment_id': 'no-endpoints'},
                {'kind': 'draw', 'segment_id': 'bad-kind', 'from': 'a', 'to': 'b'},
            ],
            'styles': [
                {'domain': 'data', 'archetype': 'studio'},
                {'domain': 'data', 'archetype': 'castle'},
            ],
        }
    )
    assert doc == {
        'version': 1,
        'moves': [{'buildingId': 'ok-mcp', 'plot': 7, 'rotation': 180}],
        'roads': [{'kind': 'add', 'segmentId': 'ok-seg', 'from': 'n0:0', 'to': 'n1:1'}],
        'styles': [{'domain': 'data', 'archetype': 'studio'}],
    }


def test_normalize_layout_doc_refuses_any_other_version() -> None:
    assert (
        normalize_layout_doc({'version': 2, 'moves': [], 'roads': [], 'styles': []})
        is None
    )
    assert normalize_layout_doc({'moves': []}) is None
    assert normalize_layout_doc('not-a-mapping') is None


def test_a_malformed_put_body_is_a_422() -> None:
    client = _client(FakeLayoutBackend())

    # A document version the city does not read.
    assert client.put('/api/apps/city/layout', json={'version': 2}).status_code == 422
    # An illegal rotation.
    bad_rotation = client.put(
        '/api/apps/city/layout',
        json={'version': 1, 'moves': [{'buildingId': 'a', 'plot': 0, 'rotation': 45}]},
    )
    assert bad_rotation.status_code == 422
    # A drawn road without both endpoints.
    bad_road = client.put(
        '/api/apps/city/layout',
        json={
            'version': 1,
            'roads': [{'kind': 'add', 'segmentId': 's', 'from': 'n0:0'}],
        },
    )
    assert bad_road.status_code == 422
    # An unknown archetype.
    bad_style = client.put(
        '/api/apps/city/layout',
        json={'version': 1, 'styles': [{'domain': 'data', 'archetype': 'castle'}]},
    )
    assert bad_style.status_code == 422
    # Nothing was saved by any of the attempts.
