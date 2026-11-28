"""The City presence routes and gateway (OVERSTORY-CITY-R047.1).

The gateway forwards exactly Arbora's ``HeartbeatParams`` (``expected_revision``,
``x``, ``y``, ``heading``) to ``fleet.city.presence.heartbeat``; the snapshot
route reads ``simulated_at`` from the served ``{'value': ...}`` answer; an
absent presence layer is the stated 503 and a typed refusal keeps its code.
"""

# spec: OVERSTORY-CITY-R047.1

from __future__ import annotations

import time
from typing import Any

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from overstory.apps import AppBackend, build_apps_router
from overstory.apps.city import CityGateway, build_city_router
from overstory.apps.city.gateway import CityUnavailable

SNAPSHOT: dict[str, Any] = {
    'value': {
        'tenant': 't',
        'revision': 7,
        'simulated_at': '2026-11-28T09:00:00Z',
        'layout_revision': 3,
        'entities': [
            {'id': 'h1', 'kind': 'human', 'x': 1.0, 'y': 2.0, 'heading': 0.5},
        ],
    }
}
RECEIPT: dict[str, Any] = {
    'value': {'tenant': 't', 'subject': 's', 'revision': 8, 'accepted_at': 'x'}
}


class Presence:
    """The served presence operations, recording every call."""

    def __init__(self, failure: Exception | None = None, answer: Any = None) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.failure = failure
        self.answer = answer

    async def invoke(self, op_id: str, params: dict[str, Any]) -> Any:
        self.calls.append((op_id, dict(params)))
        if self.failure is not None:
            raise self.failure
        if self.answer is not None:
            return self.answer
        return SNAPSHOT if op_id == 'fleet.city.presence' else RECEIPT


def _client(fake: Presence) -> TestClient:
    gateway = CityGateway(invoke=fake.invoke, clock=time.time)
    app = FastAPI()
    backend = AppBackend(
        app_id='city',
        router=build_city_router(gateway),
        available=lambda: True,
        unavailable_reason='never',
    )
    app.include_router(build_apps_router([backend]))
    return TestClient(app)


HEARTBEAT = {'expectedRevision': 7, 'x': 1.5, 'y': -2.5, 'heading': 3.0}


def test_the_heartbeat_sends_exactly_arboras_params() -> None:
    fake = Presence()
    response = _client(fake).post('/api/apps/city/state/heartbeat', json=HEARTBEAT)
    assert response.status_code == 200
    assert response.json() == {'accepted': True, 'revision': 8}
    assert fake.calls == [
        (
            'fleet.city.presence.heartbeat',
            {'expected_revision': 7, 'x': 1.5, 'y': -2.5, 'heading': 3.0},
        )
    ]


@pytest.mark.parametrize(
    'extra',
    [{'avatarId': 'someone-else'}, {'subject': 'x'}, {'z': 1.0}, {'timestamp': 1}],
)
def test_the_heartbeat_refuses_any_field_arbora_does_not_take(
    extra: dict[str, Any],
) -> None:
    fake = Presence()
    response = _client(fake).post(
        '/api/apps/city/state/heartbeat', json={**HEARTBEAT, **extra}
    )
    assert response.status_code == 422
    assert fake.calls == []


def test_the_snapshot_route_reads_simulated_at_from_the_served_value() -> None:
    response = _client(Presence()).get('/api/apps/city/state')
    assert response.status_code == 200
    body = response.json()
    assert body['revision'] == 7
    assert body['simulatedAt'] == '2026-11-28T09:00:00Z'
    assert body['layoutRevision'] == 3
    assert body['entities'][0]['id'] == 'h1'
    assert body['live'] is True
    assert 'clock' not in body


def test_an_absent_presence_layer_is_a_stated_503_for_both_routes() -> None:
    client = _client(Presence(failure=RuntimeError('engine down')))
    assert client.get('/api/apps/city/state').status_code == 503
    assert (
        client.post('/api/apps/city/state/heartbeat', json=HEARTBEAT).status_code == 503
    )


def test_a_malformed_snapshot_is_a_503_not_a_default_city() -> None:
    client = _client(Presence(answer={'value': {'entities': []}}))
    response = client.get('/api/apps/city/state')
    assert response.status_code == 503


def test_a_typed_arbora_refusal_keeps_its_code() -> None:
    fake = Presence(failure=HTTPException(409, 'REVISION_CONFLICT'))
    response = _client(fake).post('/api/apps/city/state/heartbeat', json=HEARTBEAT)
    assert response.status_code == 409
    assert response.json()['detail'] == 'REVISION_CONFLICT'


@pytest.mark.asyncio
async def test_the_gateway_raises_unavailable_for_a_malformed_receipt() -> None:
    gateway = CityGateway(invoke=Presence(answer={'nope': 1}).invoke)
    with pytest.raises(CityUnavailable):
        await gateway.publish_heartbeat(expected_revision=0, x=0.0, y=0.0, heading=0.0)
