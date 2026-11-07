"""Trusted request-origin derivation shared by the OIDC session and browser control.

Leaf unit: depends on nothing else in the host except the lazily read
configuration, so ``oidc_session`` and ``browser_control`` can both use it
without importing each other (OVERSTORY-API-R012).
"""

from __future__ import annotations

from ipaddress import ip_address
from typing import Any
from urllib.parse import urlsplit

from .host import config


def is_secure(scope: Any) -> bool:
    """Return whether the browser reached this request over TLS.

    ``Secure`` cookies are silently dropped by browsers on plain HTTP, so the
    flag is set from the observed scheme (including the ingress' forwarded
    scheme) rather than hardcoded.  See the module's deployment notes: the
    homelab ingress currently serves ``http://au.example``.
    """

    if str(scope.get('scheme') or '').lower() in {'https', 'wss'}:
        return True
    for key, value in scope.get('headers') or []:
        if key.decode('latin-1').lower() == 'x-forwarded-proto':
            return value.decode('latin-1').strip().lower() == 'https'
    return False


def loopback_host(hostname: str) -> bool:
    if hostname == 'localhost':
        return True
    try:
        return ip_address(hostname).is_loopback
    except ValueError:
        return False


def trusted_request_origin(
    scope: Any, supplied_origin: str | None = None
) -> str | None:
    """Return the exact configured request origin or fail closed.

    Host is accepted only after the application's Host middleware and must map
    to one configured ``ALLOWED_ORIGINS`` entry.  A supplied WebSocket Origin
    must byte-normalize to that same request origin; another allowlisted origin
    is still cross-origin and is refused.
    """

    request_host = _trusted_request_host(scope)
    if request_host is None:
        return None
    host, hostname = request_host
    scheme = _trusted_request_scheme(scope, hostname)
    if scheme is None:
        return None
    origin = f'{scheme}://{host}'
    if origin not in _configured_origins():
        return None
    normalized_supplied = (
        supplied_origin.lower().removesuffix('/')
        if supplied_origin is not None
        else origin
    )
    return origin if normalized_supplied == origin else None


def _trusted_request_host(scope: Any) -> tuple[str, str] | None:
    hosts = [
        value.decode('latin-1').strip().lower()
        for key, value in scope.get('headers') or []
        if key.decode('latin-1').lower() == 'host'
    ]
    if (
        len(hosts) != 1
        or not hosts[0]
        or any(character in hosts[0] for character in '\r\n,@/\\')
    ):
        return None
    return _parsed_request_host(hosts[0])


def _parsed_request_host(host: str) -> tuple[str, str] | None:
    parsed_host = urlsplit(f'//{host}')
    if not parsed_host.hostname or parsed_host.username or parsed_host.password:
        return None
    return host, parsed_host.hostname


def _trusted_request_scheme(scope: Any, hostname: str) -> str | None:
    scope_scheme = str(scope.get('scheme') or '').lower()
    scheme = (
        'https'
        if is_secure(scope)
        else ('http' if scope_scheme in {'http', 'ws'} else '')
    )
    if scheme != 'https' and not (scheme == 'http' and loopback_host(hostname)):
        return None
    return scheme


def _configured_origins() -> set[str]:
    return {
        entry.strip().lower().removesuffix('/')
        for entry in str(config.allowed_origins or '').split(',')
        if entry.strip()
    }


__all__ = ['is_secure', 'loopback_host', 'trusted_request_origin']
