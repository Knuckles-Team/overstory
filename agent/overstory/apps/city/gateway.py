"""The City app's one seam to the Arbora fleet (OVERSTORY-CITY-R003).

Every fleet read goes through :class:`CityGateway`: one cursor-paginated
call to the served operation ``fleet.catalog.list`` (browse + summary,
``limit: 100``, following ``next_cursor``) for the authoritative
registered-server list, plus one bounded, defensive per-server read of
representative tool names for each served pack (filtered by
``servers: [name]`` — the existing consumer shape, not free text). The
gateway adds no authority of its own; it caches the normalized answer for
60 s so the browser's boot costs at most one upstream read, and it turns
an absent or unreachable capability into :class:`CityUnavailable` so a
route answers a stated absence (503) instead of an error. A typed Arbora
refusal (any ``HTTPException`` other than 501/503) passes through with
its own code.

Bounds: the whole fresh read — catalog pages plus the per-pack fan-out —
runs under an overall 30 s deadline, the catalog read follows
``next_cursor`` (safety cap ten pages, so a paged catalog is never
truncated), and a typed refusal or timeout on one pack's tool read
degrades that pack's tool list to empty while the rest of the read
stands.

Cache scoping: the normalized read is cached per (principal, tenant), the
verified identity of the caller (the ambient bound actor of the host). If
``fleet.catalog.list`` is scoped by role or tenant, one caller's view is
never served to another. Concurrent cold boots for the same key share one
in-flight read (single flight): the read runs as one real asyncio task,
the waiters await it through ``asyncio.shield`` — a cancelled caller
neither strands the shared read nor cancels it for everyone — and the
in-flight entry is cleared when the task settles, so no state survives a
failure.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException

from ...host import bound_actor

#: How long a normalized fleet read is trusted (browser boots may run on a
#: read up to this old; the age is reported, never hidden).
CACHE_TTL_S = 60.0

#: The one served operation the city consumes.
CATALOG_OPERATION = 'fleet.catalog.list'

#: Browse + summary: the authoritative registered-server list (names,
#: served tool counts, pack status). Each page carries at most
#: ``CATALOG_PAGE_LIMIT`` servers, followed by ``next_cursor``.
BROWSE_PARAMS: dict[str, Any] = {'browse': True, 'summary': True}

#: One catalog page.
CATALOG_PAGE_LIMIT = 100

#: Safety cap on the number of catalog pages; past it the read is
#: unavailable rather than silently partial.
CATALOG_MAX_PAGES = 10

#: The whole fresh read (catalog pages plus the per-pack fan-out) is
#: bounded by this deadline; past it the read is the stated 503.
FRESH_READ_DEADLINE_S = 30.0

#: Representative served tool names per pack (defensive: a failed read
#: means the pack shows no served tools and the city marks its tool set
#: as simulated).
TOOL_NAMES_LIMIT = 12
_NAME_LIMIT = 200

#: The per-pack tool-name fan-out runs concurrently, but at most this many
#: upstream reads are in flight at once.
FAN_OUT_CONCURRENCY = 8

#: A single per-pack tool read is bounded; past this it counts as failed
#: (the pack shows no served tools) instead of holding the whole read.
TOOL_READ_TIMEOUT_S = 5.0

#: Cache keys for calls with no verified actor bound (tests, or a host
#: without session enforcement). A verified caller can never share a
#: cache entry with another caller, or with an unverified one.
_UNVERIFIED_PRINCIPAL = 'unverified'


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
    """The strict whitelist shape from one browse+summary page.

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


def _next_cursor(value: Any) -> str | None:
    """The cursor that continues a paged catalog read (None: last page)."""

    cursor = value.get('next_cursor') if isinstance(value, Mapping) else None
    if isinstance(cursor, str) and cursor:
        return cursor
    return None


def _classified(error: Exception) -> Exception:
    """A typed Arbora refusal keeps its own code; anything else is an
    unavailable catalog, whose cause is never echoed to the browser."""

    if isinstance(error, HTTPException) and error.status_code not in (501, 503):
        return error
    return CityUnavailable('The fleet catalog is not available')


def _cache_key(
    principal: str | None = None, tenant: str | None = None
) -> tuple[str, str]:
    """The (principal, tenant) the read is cached for.

    The verified identity is the ambient bound actor of the host (the
    request's session); an explicit override is accepted for tests. A call
    with no verified actor caches under its own dedicated key, never
    sharing an entry with any verified caller.
    """

    actor = bound_actor()
    if principal is None and actor is not None:
        principal = actor.actor_id
    if tenant is None and actor is not None:
        tenant = actor.tenant_id
    return (principal or _UNVERIFIED_PRINCIPAL, tenant or '')


class CityGateway:
    """Runs one fleet read per (principal, tenant) and caches each for the
    TTL; concurrent cold boots single-flight per key as one real task the
    waiters shield."""

    def __init__(
        self,
        invoke: Callable[[str, dict[str, Any]], Awaitable[Any]],
        *,
        cache_ttl_s: float = CACHE_TTL_S,
        clock: Callable[[], float] = time.time,
        concurrency: int = FAN_OUT_CONCURRENCY,
        tool_read_timeout_s: float = TOOL_READ_TIMEOUT_S,
        fresh_read_deadline_s: float = FRESH_READ_DEADLINE_S,
    ) -> None:
        self._invoke = invoke
        self._cache_ttl_s = cache_ttl_s
        self._clock = clock
        self._concurrency = max(1, concurrency)
        self._tool_read_timeout_s = tool_read_timeout_s
        self._fresh_read_deadline_s = fresh_read_deadline_s
        self._cache: dict[tuple[str, str], tuple[FleetRead, float]] = {}
        self._inflight: dict[tuple[str, str], asyncio.Task[FleetRead]] = {}
        self._fan_out_lock: asyncio.Semaphore | None = None

    async def fleet(
        self, principal: str | None = None, tenant: str | None = None
    ) -> FleetRead:
        """One normalized fleet read for the caller, cached for the TTL;
        concurrent cold boots share one in-flight read. The read is a real
        task the waiters await through ``asyncio.shield``: a cancelled
        caller neither strands the shared read nor cancels it for
        everyone, and the in-flight entry clears when the task settles."""

        key = _cache_key(principal, tenant)
        cached = self._cache.get(key)
        if cached is not None and self._clock() - cached[1] < self._cache_ttl_s:
            read, captured_at = cached
            return replace(
                read,
                age_seconds=max(0.0, self._clock() - captured_at),
            )
        task = self._inflight.get(key)
        if task is None:
            task = asyncio.create_task(self._fresh_read())
            self._inflight[key] = task
            task.add_done_callback(self._flight_done(key))
        read = await asyncio.shield(task)
        self._cache[key] = (read, self._clock())
        return read

    def _flight_done(
        self, key: tuple[str, str]
    ) -> Callable[[asyncio.Task[FleetRead]], None]:
        """Clears the in-flight entry when its task settles.

        Identity-guarded (a later flight for the same key owns the entry)
        and failure-collecting (no un-retrieved-exception warning when the
        last waiter has gone)."""

        def done(task: asyncio.Task[FleetRead]) -> None:
            if self._inflight.get(key) is task:
                self._inflight.pop(key, None)
            if not task.cancelled():
                task.exception()

        return done

    async def _fresh_read(self) -> FleetRead:
        """One fresh read: the catalog pages, then the bounded per-pack
        tool-name fan-out — under the overall deadline."""

        entries: list[dict[str, Any]] = []
        tools_by_server: dict[str, list[str]] = {}
        try:
            async with asyncio.timeout(self._fresh_read_deadline_s):
                entries = await self._catalog_entries()
                tool_reads = {
                    entry['server']: self._bounded_tool_names(entry['server'])
                    for entry in entries
                    if entry['packStatus'] == 'served' and entry['toolCount'] > 0
                }
                if tool_reads:
                    results = await asyncio.gather(*tool_reads.values())
                    tools_by_server = dict(zip(tool_reads.keys(), results, strict=True))
        except TimeoutError as error:
            raise CityUnavailable(
                'The fleet catalog read exceeded its deadline'
            ) from error
        servers: list[dict[str, Any]] = []
        for entry in entries:
            entry = dict(entry)
            entry['tools'] = tools_by_server.get(entry['server'], [])
            servers.append(entry)
        captured_at = datetime.fromtimestamp(self._clock(), tz=UTC).isoformat(
            timespec='seconds'
        )
        return FleetRead(servers=servers, captured_at=captured_at)

    async def _catalog_entries(self) -> list[dict[str, Any]]:
        """The registered-server list, page by page (``limit: 100``,
        followed by ``next_cursor``). A paged catalog is never truncated;
        past the safety cap the read is unavailable, not silently
        partial."""

        entries: list[dict[str, Any]] = []
        cursor: str | None = None
        for _ in range(CATALOG_MAX_PAGES):
            params = dict(BROWSE_PARAMS, limit=CATALOG_PAGE_LIMIT)
            if cursor is not None:
                params['cursor'] = cursor
            value = await self._value(CATALOG_OPERATION, params)
            entries.extend(normalize_fleet(value))
            cursor = _next_cursor(value)
            if cursor is None:
                break
        else:
            raise CityUnavailable('The fleet catalog read exceeded its page limit')
        return entries

    async def _bounded_tool_names(self, server: str) -> list[str]:
        """Representative served tool names for one pack, under the fan-out
        cap and the per-call timeout ([] when the read fails, times out or
        is refused — the rest of the read stands, and the city marks the
        set simulated)."""

        if self._fan_out_lock is None:
            self._fan_out_lock = asyncio.Semaphore(self._concurrency)
        async with self._fan_out_lock:
            try:
                return await asyncio.wait_for(
                    self._tool_names(server), timeout=self._tool_read_timeout_s
                )
            except (TimeoutError, CityUnavailable, HTTPException):
                return []

    async def _tool_names(self, server: str) -> list[str]:
        """Representative served tool names for one pack, filtered by
        server (the existing consumer shape — not a free-text query)."""

        try:
            value = await self._value(
                CATALOG_OPERATION,
                {'servers': [server], 'kinds': ['tool'], 'limit': TOOL_NAMES_LIMIT},
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
