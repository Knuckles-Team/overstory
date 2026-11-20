"""HTTP routes of the City app, mounted at ``/api/apps/city``.

Reads are GETs under the host's ordinary scope, origin and role
enforcement. The only data the browser sees is the normalized fleet
catalog — server names, served tool counts, representative tool names and
pack status; never a credential or an identity (OVERSTORY-CITY-R003/R017).
An absent or unreachable fleet read is a 503 with a stated reason (the
city degrades to its bundled snapshot); a typed Arbora refusal passes its
code through.

The layout routes (R032): ``GET /layout`` serves the stored override
document (30 s cache); ``PUT /layout`` validates the browser's camelCase
document against the strict Pydantic shape (the wire twin of the browser's
Zod schema) and persists it through the served layout write. An absent or
refused layout read is the stated 503 — the viewer boots the derived
layout; a typed Arbora refusal passes its code through.
"""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, model_validator

from .gateway import CityGateway, CityUnavailable

#: The quarter-turn rotations the layout document accepts (R032); the
#: browser's Zod twin (src/apps/city/schemas.ts) carries the same bounds.
Rotation = Literal[0, 90, 180, 270]
Archetype = Literal['gateway', 'datahall', 'workshop', 'storehouse', 'studio', 'docks']


class LayoutMove(BaseModel):
    """One building move in the stored document (the browser's camelCase)."""

    buildingId: str = Field(min_length=1, max_length=200)
    plot: int = Field(ge=0, le=1023)
    rotation: Rotation


class LayoutRoad(BaseModel):
    """One road override; a drawn road names both of its endpoints."""

    kind: Literal['add', 'remove']
    segmentId: str = Field(min_length=1, max_length=200)
    from_: str | None = Field(default=None, alias='from', max_length=200)
    to: str | None = Field(default=None, max_length=200)

    @model_validator(mode='after')
    def _endpoints(self) -> LayoutRoad:
        if self.kind == 'add' and (not self.from_ or not self.to):
            raise ValueError('a drawn road needs both endpoints')
        return self


class LayoutStyle(BaseModel):
    """One district style override: the domain's saved archetype."""

    domain: str = Field(min_length=1, max_length=50)
    archetype: Archetype


class LayoutDocIn(BaseModel):
    """The stored layout override document, validated at the wire boundary.

    The final-state delta over the derived layout (R032): building moves
    and rotations, road segments added or removed, district styles — the
    same bounds the browser enforces before it sends anything."""

    version: Literal[1]
    moves: list[LayoutMove] = Field(default_factory=list, max_length=200)
    roads: list[LayoutRoad] = Field(default_factory=list, max_length=400)
    styles: list[LayoutStyle] = Field(default_factory=list, max_length=20)


def _doc_to_dict(doc: LayoutDocIn) -> dict[str, Any]:
    """The validated document as the browser's camelCase dict (the gateway
    converts it to the snake_case wire shape for the served write)."""

    roads: list[dict[str, Any]] = []
    for r in doc.roads:
        entry: dict[str, Any] = {'kind': r.kind, 'segmentId': r.segmentId}
        if r.from_ is not None:
            entry['from'] = r.from_
        if r.to is not None:
            entry['to'] = r.to
        roads.append(entry)
    return {
        'version': doc.version,
        'moves': [m.model_dump() for m in doc.moves],
        'roads': roads,
        'styles': [s.model_dump() for s in doc.styles],
    }


def build_city_router(gateway: CityGateway) -> APIRouter:
    """The City routes over one fleet gateway (shared, cached)."""

    router = APIRouter(tags=['apps:city'])

    @router.get('/layout')
    async def layout_read() -> dict[str, Any]:
        """The stored layout document (30 s cache); an absent or refused
        read is the stated 503 — the viewer boots the derived layout."""

        try:
            read = await gateway.layout()
        except CityUnavailable as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        return {
            'doc': read.doc,
            'captured_at': read.captured_at,
            'cache': {'stale': False, 'age_seconds': round(read.age_seconds, 1)},
        }

    @router.put('/layout')
    async def layout_write(body: LayoutDocIn) -> dict[str, Any]:
        """Persist one layout document through the served write operation;
        the ack carries the stored document. A typed Arbora refusal passes
        its code through; an absent write is the stated 503 — the edit is
        not saved and nothing changes locally."""

        try:
            saved = await gateway.save_layout(_doc_to_dict(body))
        except CityUnavailable as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        return {'doc': saved.doc, 'captured_at': saved.captured_at}

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
