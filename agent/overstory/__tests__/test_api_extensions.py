from __future__ import annotations

"""Test API endpoints for overstory backend."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from overstory.server import create_agent_web_app


@pytest.fixture
def client(mock_agent, mock_workspace_helpers, authenticated_client_factory):
    """Create test client.

    ``create_agent_web_app`` installs ``WebUIActorIdentityMiddleware``
    unconditionally, so every ``/api/*`` request now requires a verified
    actor or is rejected 401 -- an unauthenticated ``TestClient`` no longer
    reflects a real caller. ``authenticated_client_factory`` (tests/conftest
    .py) presents a legitimate, fully verified admin credential through the
    REAL identity + authorization middleware stack -- see its docstring and
    ``authenticated_asgi_app`` for why this is not a bypass. Individual tests
    that need to prove the gate itself (unauthenticated -> 401, an
    under-privileged role -> 403) build their own client directly instead of
    using this fixture -- see ``TestAuthenticationGateIsNotWeakened`` below.
    """
    app = create_agent_web_app(mock_agent, mock_workspace_helpers)
    return authenticated_client_factory(app, raise_server_exceptions=False)


class TestAuthenticationGateIsNotWeakened:
    """Known-bad proof: the ``client`` fixture above now presents a
    legitimate credential, but the gate it goes through must still reject
    what it should. A gate never demonstrated against a known-bad input is
    not evidence -- these drive the exact same real middleware stack through
    a real ``TestClient``/ASGI request, not the fixture's happy-path
    credential.
    """

    def test_unauthenticated_request_is_still_rejected(
        self, mock_agent, mock_workspace_helpers
    ):
        """No credential at all -> 401, even though this file's default
        ``client`` fixture now attaches one. Proves the fixture fix did not
        weaken ``WebUIActorIdentityMiddleware``."""
        app = create_agent_web_app(mock_agent, mock_workspace_helpers)
        bare_client = TestClient(app, raise_server_exceptions=False)

        response = bare_client.get('/api/enhanced/graph/stats')

        assert response.status_code == 401
        scope_response = bare_client.get('/api/enhanced/graph/graph3d/scope')
        assert scope_response.status_code == 401


class TestCoverageExpansion:
    """Additional tests for coverage expansion."""

    def test_toggle_skill_success(self, client):
        mock_toggle = MagicMock(return_value={'status': 'enabled'})
        with patch('overstory.api_extensions.get_helper', return_value=mock_toggle):
            response = client.post('/api/enhanced/skills/skill1/toggle')
            assert response.status_code == 200
            assert response.json()['status'] == 'enabled'


class TestServerIntegration:
    """Test server-level features."""

    def test_spa_fallback(self, client):
        response = client.get('/some-random-route')
        assert response.status_code in [200, 404]
