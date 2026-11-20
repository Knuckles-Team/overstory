"""The exact anonymous read-route set the hosted apps declare."""

import pytest
from overstory.apps import anonymous_read_routes
from overstory.auth_policy import AnonymousReadPolicy


@pytest.mark.spec('OVERSTORY-IDENTITY-R003.1.3')
def test_declared_set_is_exact_read_only_and_accepted_by_the_policy():
    routes = anonymous_read_routes()
    assert '/api/apps' in routes
    assert {
        '/api/apps/city/status',
        '/api/apps/city/fleet',
        '/api/apps/city/layout',
        '/api/apps/markets/status',
    } <= routes
    # Exact paths only: the one policy accepts the set and nothing wildcarded.
    policy = AnonymousReadPolicy(routes)
    assert all('*' not in r and '{' not in r for r in routes)
    for path in routes:
        assert policy.allows('GET', path, admin=False), path
        assert not policy.allows('PUT', path, admin=False), path
        assert not policy.allows('POST', path, admin=False), path
    # Reserved prefixes are never admitted, even if a caller asks.
    assert not policy.allows('GET', '/api/identity/session', admin=False)
    assert not policy.allows('GET', '/api/apps/city/fleet', admin=True)


@pytest.mark.spec('OVERSTORY-IDENTITY-R003.1.3')
def test_an_app_declares_its_reads_and_the_set_follows_it():
    from fastapi import APIRouter
    from overstory.apps import AppBackend

    app = AppBackend(
        app_id='demo',
        router=APIRouter(),
        available=lambda: True,
        unavailable_reason='',
        anonymous_reads=('summary',),
    )
    assert anonymous_read_routes([app]) == frozenset(
        {'/api/apps', '/api/apps/demo/summary'}
    )
