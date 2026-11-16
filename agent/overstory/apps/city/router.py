"""HTTP routes of the City app, mounted at ``/api/apps/city``.

Reads are GETs under the host's ordinary scope, origin and role
enforcement. The only data the browser sees is the normalized fleet
catalog — server names, served tool counts, representative tool names and
pack status; never a credential or an identity (OVERSTORY-CITY-R003/R017).
An absent or unreachable fleet read is a 503 with a stated reason (the
city degrades to its bundled snapshot); a typed Arbora refusal passes its
code through.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from .gateway import CityGateway, CityUnavailable


def build_city_router(gateway: CityGateway) -> APIRouter:
    """The City routes over one fleet gateway (shared, cached)."""

    router = APIRouter(tags=['apps:city'])

    @router.get('/status')
    async def status() -> dict[str, Any]:
        """The availability probe: a failed read is a stated absence,
        not an error — the app is always shown, never hidden."""

        try:
            read = await gateway.fleet()
        except CityUnavailable:
            return {
                'status': 'ok',
                'arbora': {'reachable': False},
                'connectors': {'served': 0, 'registered': 0},
            }
        served = sum(1 for s in read.servers if s['packStatus'] == 'served')
        return {
            'status': 'ok',
            'arbora': {'reachable': True},
            'connectors': {
                'served': served,
                'registered': len(read.servers) - served,
            },
        }

    @router.get('/fleet')
    async def fleet() -> dict[str, Any]:
        """The normalized catalog the city boots from (60 s cache)."""

        try:
            read = await gateway.fleet()
        except CityUnavailable as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        return {
            'servers': read.servers,
            'captured_at': read.captured_at,
            'cache': {'stale': False, 'age_seconds': round(read.age_seconds, 1)},
        }

    return router
