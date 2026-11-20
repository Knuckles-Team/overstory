"""Application surfaces hosted by the WebUI (EH-429).

An app is a product area with its own routes under ``/api/apps/<id>`` and its
own frontend section. :func:`build_apps_router` mounts every registered app and
serves ``GET /api/apps``, the catalog the browser reads to decide which apps to
show: an app whose engine capability is absent is listed as unavailable with a
reason, never silently hidden or shown broken.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from fastapi import APIRouter


@dataclass(frozen=True)
class AppBackend:
    """One hosted app: its id (the URL segment), its router, and a cheap
    availability probe (no engine round trip)."""

    app_id: str
    router: APIRouter
    available: Callable[[], bool]
    unavailable_reason: str
    # Read sub-paths an explicit no-auth session may GET (R003.1.3). The
    # default is the cheap status read only; the host hard-codes nothing.
    anonymous_reads: tuple[str, ...] = ('status',)


def build_apps_router(apps: list[AppBackend]) -> APIRouter:
    router = APIRouter()

    @router.get('/api/apps')
    async def app_catalog() -> dict[str, Any]:
        entries = []
        for app in apps:
            available = bool(app.available())
            entries.append(
                {
                    'id': app.app_id,
                    'available': available,
                    'detail': None if available else app.unavailable_reason,
                }
            )
        return {'apps': entries}

    for app in apps:
        router.include_router(app.router, prefix=f'/api/apps/{app.app_id}')
    return router


def anonymous_read_routes(apps: list[AppBackend] | None = None) -> frozenset[str]:
    """The exact anonymous read-route set the hosted apps declare (R003.1.3).

    The app catalog plus each app's declared read sub-paths, as exact API
    paths. The host passes this set as the anonymous read policy in explicit
    no-auth mode only; `AnonymousReadPolicy` stays the one policy source.
    """
    hosted = default_apps() if apps is None else apps
    routes = {'/api/apps'}
    for app in hosted:
        routes.update(f'/api/apps/{app.app_id}/{sub}' for sub in app.anonymous_reads)
    return frozenset(routes)


def default_apps() -> list[AppBackend]:
    """The apps this WebUI hosts.

    Markets reads market signals from the graph. Arbora does not serve a
    market-signal operation yet, so the app reports "not available".
    City needs no engine capability: its one fleet read degrades to the
    bundled snapshot (SIMULATED) when Arbora is unreachable, so the app
    is always available — it degrades instead of hiding.
    """

    from ..host import served, unavailable
    from .city import CityGateway, build_city_router
    from .markets import EngineGateway, build_markets_router

    def gateway() -> EngineGateway:
        raise unavailable('Markets', 'markets.signals.read')

    return [
        AppBackend(
            app_id='markets',
            router=build_markets_router(gateway),
            available=lambda: False,
            unavailable_reason=(
                'Markets is not available: Arbora does not serve the '
                'markets.signals.read operation yet.'
            ),
        ),
        AppBackend(
            app_id='city',
            router=build_city_router(CityGateway(invoke=served)),
            available=lambda: True,
            anonymous_reads=('status', 'fleet', 'layout'),
            unavailable_reason=(
                'City is always available: an unreachable fleet read '
                'degrades the city to its bundled snapshot.'
            ),
        ),
    ]
