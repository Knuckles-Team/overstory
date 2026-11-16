"""The City app's one seam to the Arbora fleet (OVERSTORY-CITY-R003).

Every fleet read goes through :class:`CityGateway`: one call to the served
operation ``fleet.catalog.list`` (browse + summary) for the authoritative
registered-server list, plus one bounded, defensive per-server read of
representative tool names for each served pack. The gateway adds no
authority of its own; it caches the normalized answer for 60 s so the
browser's boot costs at most one upstream read, and it turns an absent or
unreachable capability into :class:`CityUnavailable` so a route answers a
stated absence (503) instead of an error. A typed Arbora refusal (any
``HTTPException`` other than 501/503) passes through with its own code.
"""

from __future__ import annotations

import time
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException

#: How long a normalized fleet read is trusted (browser boots may run on a
#: read up to this old; the age is reported, never hidden).
CACHE_TTL_S = 60.0

#: The one served operation the city consumes.
CATALOG_OPERATION = 'fleet.catalog.list'

#: Browse + summary: the authoritative registered-server list (names,
#: served tool counts, pack status).
BROWSE_PARAMS: dict[str, Any] = {'browse': True, 'summary': True}

#: Representative served tool names per pack (defensive: a failed read
#: means the pack shows no served tools and the city marks its tool set
#: as simulated).
TOOL_NAMES_LIMIT = 12
_NAME_LIMIT = 200


class CityUnavailable(Exception):
    """The fleet catalog, or the capability a route needs, is not available."""


@dataclass(frozen=True)
class FleetRead:
    """One normalized, whitelisted fleet catalog read.

    ``servers`` entries carry only the browser shape (OVERSTORY-CITY-R017):
    ``server``, ``toolCount``, ``tools`` (<= 12 names) and ``packStatus`` —
    never a credential, identity or anything else the catalog carries.
    """

    servers: list[dict[str, Any]]
    captured_at: str
    age_seconds: float = 0.0


def normalize_fleet(value: Any) -> list[dict[str, Any]]:
    """The strict whitelist shape from one browse+summary answer.

    Unrecognized entries (missing names, unknown pack statuses, non-mapping
    rows) are dropped, not coerced: the city would rather show fewer
    buildings than render a made-up one.
    """

    servers = value.get('servers') if isinstance(value, Mapping) else None
    out: list[dict[str, Any]] = []
    for entry in servers if isinstance(servers, list) else []:
        if not isinstance(entry, Mapping):
            continue
        name = entry.get('server')
        if not isinstance(name, str) or not name or len(name) > _NAME_LIMIT:
            continue
        pack_status = entry.get('pack_status')
        if pack_status not in ('served', 'registered_unpublished'):
            continue
        tool_count = 0
        surfaces = entry.get('surfaces')
        if isinstance(surfaces, Mapping):
            tools = surfaces.get('tools')
            if isinstance(tools, Mapping):
                count = tools.get('count')
                if isinstance(count, int) and count >= 0:
                    tool_count = count
        out.append({'server': name, 'toolCount': tool_count, 'packStatus': pack_status})
    return out


def _classified(error: Exception) -> Exception:
    """A typed Arbora refusal keeps its own code; anything else is an
    unavailable catalog, whose cause is never echoed to the browser."""

    if isinstance(error, HTTPException) and error.status_code not in (501, 503):
        return error
    return CityUnavailable('The fleet catalog is not available')


class CityGateway:
    """Runs one fleet read and caches its normalized answer for the TTL."""

    def __init__(
        self,
        invoke: Callable[[str, dict[str, Any]], Awaitable[Any]],
        *,
        cache_ttl_s: float = CACHE_TTL_S,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self._invoke = invoke
        self._cache_ttl_s = cache_ttl_s
        self._clock = clock
        self._read: FleetRead | None = None
        self._captured_at: float = 0.0

    async def fleet(self) -> FleetRead:
        """One normalized fleet read, cached for the TTL."""

        if (
            self._read is not None
            and self._clock() - self._captured_at < self._cache_ttl_s
        ):
            return replace(
                self._read,
                age_seconds=max(0.0, self._clock() - self._captured_at),
            )
        read = await self._fresh_read()
        self._read = read
        self._captured_at = self._clock()
        return read

    async def _fresh_read(self) -> FleetRead:
        value = await self._value(CATALOG_OPERATION, dict(BROWSE_PARAMS))
        servers: list[dict[str, Any]] = []
        for entry in normalize_fleet(value):
            if entry['packStatus'] == 'served' and entry['toolCount'] > 0:
                entry['tools'] = await self._tool_names(entry['server'])
            else:
                entry['tools'] = []
            servers.append(entry)
        captured_at = datetime.fromtimestamp(self._clock(), tz=UTC).isoformat(
            timespec='seconds'
        )
        return FleetRead(servers=servers, captured_at=captured_at)

    async def _tool_names(self, server: str) -> list[str]:
        """Representative served tool names for one pack ([] when the read
        fails — the city marks the set simulated)."""

        try:
            value = await self._value(
                CATALOG_OPERATION,
                {'query': server, 'kinds': ['tool'], 'limit': TOOL_NAMES_LIMIT},
            )
        except CityUnavailable:
            return []
        items = value.get('items') if isinstance(value, Mapping) else None
        names: list[str] = []
        for item in items if isinstance(items, list) else []:
            if not isinstance(item, Mapping):
                continue
            if item.get('server') != server or item.get('kind') != 'tool':
                continue
            name = item.get('name')
            if isinstance(name, str) and name and len(name) <= _NAME_LIMIT:
                names.append(name)
            if len(names) >= TOOL_NAMES_LIMIT:
                break
        return names

    async def _value(self, op: str, params: dict[str, Any]) -> Any:
        """One upstream read, classified (typed refusals pass through)."""

        try:
            value = await self._invoke(op, params)
        except Exception as error:
            raise _classified(error) from error
        return value
