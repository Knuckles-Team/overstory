"""The City app (OVERSTORY-CITY): the platform as a living city.

Browser: ``/apps/city`` renders the city over the deterministic simulation.
Host: ``/api/apps/city/status`` and ``/api/apps/city/fleet`` — the fleet
route reads the served Arbora operation ``fleet.catalog.list`` as the bound
actor and answers a strict normalized catalog (server name, served tool
count, representative tool names, pack status) cached for 60 s. The
browser never sees anything else; when the fleet read is unavailable the
city degrades to its bundled snapshot (SIMULATED).
"""

from .gateway import CityGateway, CityUnavailable, FleetRead, normalize_fleet
from .router import build_city_router

__all__ = [
    'CityGateway',
    'CityUnavailable',
    'FleetRead',
    'build_city_router',
    'normalize_fleet',
]
