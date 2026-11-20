"""The City app (OVERSTORY-CITY): the platform as a living city.

Browser: ``/apps/city`` renders the city over the deterministic simulation.
Host: ``/api/apps/city/status`` and ``/api/apps/city/fleet`` — the fleet
route reads the served Arbora operation ``fleet.catalog.list`` as the bound
actor and answers a strict normalized catalog (server name, served tool
count, representative tool names, pack status) cached for 60 s. The
browser never sees anything else; when the fleet read is unavailable the
city degrades to its bundled snapshot (SIMULATED).

The layout routes (R032): ``GET /layout`` serves the stored override
document (30 s cache) and ``PUT /layout`` persists one through the served
write operation; both degrade to a stated 503 when the served layout is
absent.
"""

from .gateway import (
    LAYOUT_READ_OP,
    LAYOUT_WRITE_OP,
    CityGateway,
    CityUnavailable,
    FleetRead,
    LayoutRead,
    normalize_fleet,
    normalize_layout_doc,
)
from .router import build_city_router

__all__ = [
    'LAYOUT_READ_OP',
    'LAYOUT_WRITE_OP',
    'CityGateway',
    'CityUnavailable',
    'FleetRead',
    'LayoutRead',
    'build_city_router',
    'normalize_fleet',
    'normalize_layout_doc',
]
