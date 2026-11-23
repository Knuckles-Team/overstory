"""Opt-in installed OIDC protocol qualification with a loopback issuer."""

import os
import time
from types import SimpleNamespace
from urllib.parse import parse_qs, urlencode, urlsplit

import pytest

pytestmark = pytest.mark.skipif(
    os.environ.get('WEBUI_INSTALLED_QUALIFICATION') != '1',
    reason='Run the installed qualification harness explicitly',
)


@pytest.fixture
def issuer():
    from .loopback_oidc import running_issuer

    with running_issuer() as owner:
        yield owner


@pytest.fixture
def browser(monkeypatch, issuer):
    from arbora.webui_host.session_boundary import identity_factory_kwargs
    from cryptography.fernet import Fernet
    from fastapi.testclient import TestClient
    from overstory import host, oidc_session
    from overstory.server import create_agent_web_app
    from pydantic_ai import Agent
    from pydantic_ai.models.test import TestModel

    settings = oidc_session.OIDCSettings(
        client_id='fixture-client',
        client_secret=issuer.client_secret,
        issuer=issuer.url,
        redirect_uri='http://testserver/auth/callback',
        scope='openid',
        session_key=Fernet.generate_key().decode(),
    )
    monkeypatch.setattr(oidc_session, 'load_settings', lambda: settings)
    for field, value in {
        'auth_jwt_jwks_uri': issuer.url + '/jwks',
        'auth_jwt_issuer': issuer.url,
        'auth_jwt_audience': 'fixture-audience',
        'allowed_hosts': 'testserver',
        'gateway_rate_limit': 0,
        'gateway_rate_burst': 0,
    }.items():
        monkeypatch.setattr(host.config, field, value, raising=False)
    monkeypatch.setenv('OVERSTORY_ACCESS_LOG_POLICY', 'disabled')

    def compose(app):
        @app.get('/api/lifecycle')
        def identity():
            actor = host.current_actor()
            return {
                'subject': actor.actor_id,
                'authenticated': actor.authenticated,
                'tenant': actor.tenant_id,
            }

    app = create_agent_web_app(
        Agent(TestModel()),
        {'get_path': lambda v: v},
        application_composer=compose,
        **identity_factory_kwargs('oidc', None, factory=create_agent_web_app),
    )
    with TestClient(app) as client:
        yield client


def sign_in(browser):
    import httpx

    login = browser.get('/auth/login?next=/api/lifecycle', follow_redirects=False)
    assert login.status_code == 302
    authorized = httpx.get(login.headers['location'], follow_redirects=False)
    assert authorized.status_code == 302
    callback = browser.get(authorized.headers['location'], follow_redirects=False)
    assert callback.status_code == 302
    assert callback.headers['location'] == '/api/lifecycle'


def test_signed_oidc_login_refresh_logout(browser, issuer, monkeypatch):
    from overstory import oidc_session

    assert browser.get('/api/lifecycle').status_code == 401
    sign_in(browser)
    assert browser.get('/api/lifecycle').json() == {
        'subject': 'disposable-user',
        'authenticated': True,
        'tenant': 'fixture-tenant',
    }
    session = browser.get('/auth/session').json()
    assert session['authenticated'] is True
    assert session['subject'] == 'disposable-user'
    assert 'access_token' not in session and 'refresh_token' not in session
    monkeypatch.setattr(
        oidc_session,
        'time',
        SimpleNamespace(time=lambda: time.time() + 400, monotonic=time.monotonic),
    )
    assert browser.get('/api/lifecycle').status_code == 200
    assert issuer.refreshes == 1
    logout = browser.get('/auth/logout', follow_redirects=False)
    assert logout.status_code == 302
    assert logout.headers['location'].startswith(issuer.url + '/logout?')
    assert browser.get('/auth/session').json() == {'authenticated': False}
    assert browser.get('/api/lifecycle').status_code == 401


@pytest.mark.parametrize('first_path', ['/api/lifecycle', '/auth/session'])
def test_expired_session_refresh_refusal_clears_browser(
    browser, issuer, monkeypatch, first_path
):
    from overstory import oidc_session

    sign_in(browser)
    issuer.reject_refresh = True
    monkeypatch.setattr(
        oidc_session,
        'time',
        SimpleNamespace(time=lambda: time.time() + 400, monotonic=time.monotonic),
    )
    response = browser.get(first_path)
    assert response.status_code == (401 if first_path.startswith('/api/') else 200)
    if first_path == '/auth/session':
        assert response.json() == {'authenticated': False}
    assert issuer.refreshes == 1
    assert browser.get('/auth/session').json() == {'authenticated': False}


def test_wrong_callback_state_never_exchanges_or_admits(browser, issuer):
    import httpx

    login = browser.get('/auth/login', follow_redirects=False)
    authorized = httpx.get(login.headers['location'], follow_redirects=False)
    query = parse_qs(urlsplit(authorized.headers['location']).query)
    response = browser.get(
        '/auth/callback?'
        + urlencode({'code': query['code'][0], 'state': 'wrong-state'})
    )
    assert response.status_code == 401
    assert issuer.codes
    assert browser.get('/api/lifecycle').status_code == 401
    assert browser.get('/auth/session').json() == {'authenticated': False}


# ---------------------------------------------------------------------------
# Live sign-in probe (OVERSTORY-IDENTITY-R001)
# ---------------------------------------------------------------------------

LIVE_PROBE_CLIENT = 'overstory-qualification'
LIVE_PROBE_ENV = ('KEYCLOAK_URL', 'WEBUI_LIVE_TEST_USERNAME', 'WEBUI_LIVE_TEST_PASSWORD')


def _load_provisioner():
    """Load ``scripts/provision_identity.py`` as a module (stdlib-only)."""
    import importlib.util
    from pathlib import Path

    path = Path(__file__).resolve().parents[2] / 'scripts' / 'provision_identity.py'
    spec = importlib.util.spec_from_file_location('overstory_provision_identity', path)
    if spec is None or spec.loader is None:
        raise RuntimeError('could not load the provisioner script')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _live_probe_driver(directory, repo_root, origin):
    """The browser half of the probe: sign in through the real provider.

    Kept outside the source tree (like the runner's logs and screenshots);
    Playwright is resolved from the repository checkout via an anchored
    ``createRequire``, so the file itself can live in a temp directory.
    """
    from pathlib import Path

    driver = Path(directory) / 'live-signin-probe.mjs'
    driver.write_text(
        """
import { createRequire } from 'node:module'
const require = createRequire(new URL('file://__REPO_ROOT__/package.json'))
const { chromium } = require('playwright')
const [origin, username, password] = process.argv.slice(2)
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
try {
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 30000 })
  // The unauthenticated browser is redirected to the provider's login page.
  await page.locator('#username').fill(username, { timeout: 30000 })
  await page.locator('#password').fill(password)
  await page.locator('#signin-submit').click()
  await page.waitForURL((url) => url.toString().startsWith(origin), { timeout: 60000 })
  const session = await page.evaluate(async () => (await (await fetch('/auth/session')).json()))
  if (session.authenticated !== true) throw new Error('sign-in did not produce an authenticated session')
  if ('access_token' in session || 'refresh_token' in session) throw new Error('the session body leaked a token')
  const lifecycle = await page.evaluate(async () => (await (await fetch('/api/lifecycle')).json()))
  if (lifecycle.authenticated !== true) throw new Error('the authenticated actor was not admitted by the API')
  console.log('PASS live sign-in probe subject=' + lifecycle.subject)
} finally {
  await browser.close()
}
""".replace('__REPO_ROOT__', str(repo_root)),
        encoding='utf-8',
    )
    return driver


# spec: OVERSTORY-IDENTITY-R001
def test_live_signin_probe(monkeypatch, tmp_path):
    """A real browser sign-in probe against the provisioned test client and user.

    Unlike the synthetic tests in this file, this probe targets the live
    identity provider: the dedicated qualification client
    (``overstory-qualification``) is reconciled by the repository
    provisioner, the installed app is served on loopback with its OIDC
    settings pointed at the live issuer, and a real browser signs in
    through ``SignInPanel`` as the dedicated test user. The loopback
    issuer is the synthetic path and is never a stand-in for this row:
    without the live prerequisites the probe skips with the explicit
    reason instead of fabricating acceptance.
    """
    import os
    import shutil
    import socket
    import subprocess
    import time
    import urllib.error
    import urllib.request
    from pathlib import Path

    missing = [name for name in LIVE_PROBE_ENV if not os.environ.get(name)]
    if missing:
        pytest.skip(
            'live sign-in probe prerequisites absent: '
            + ', '.join(missing)
            + ' (see tests/qualification/README.md)'
        )
    repo_root = Path(__file__).resolve().parents[2]
    node = shutil.which('node')
    if node is None:
        pytest.skip('node is required for the live browser probe')
    assert node  # unreachable: pytest.skip raises; narrows for the type checker
    check = subprocess.run(
        [node, '--input-type=module', '-e', 'await import("playwright")'],
        cwd=repo_root,
        capture_output=True,
    )
    if check.returncode != 0:
        pytest.skip('Playwright is not installed (pnpm exec playwright install chromium)')

    provisioner = _load_provisioner()
    issuer_url = f'{provisioner.KEYCLOAK_URL}/realms/{provisioner.REALM}'

    sock = socket.socket()
    sock.bind(('127.0.0.1', 0))
    origin = f'http://127.0.0.1:{sock.getsockname()[1]}'

    try:
        token = provisioner._admin_token()
    except Exception as exc:
        pytest.skip(
            f'Keycloak administrator sign-in failed (check KEYCLOAK_ADMIN_USER/KEYCLOAK_ADMIN_PASSWORD): {exc}'
        )
    client = provisioner._reconcile_client(
        token,
        {
            'clientId': LIVE_PROBE_CLIENT,
            'name': 'Overstory (live qualification probe)',
            'description': 'Confidential authorization-code client for the live sign-in probe.',
            'enabled': True,
            'protocol': 'openid-connect',
            'publicClient': False,
            'clientAuthenticatorType': 'client-secret',
            'standardFlowEnabled': True,
            'redirectUris': [origin + '/auth/callback'],
            'webOrigins': [origin],
            'defaultClientScopes': [
                'web-origins',
                'acr',
                'profile',
                'roles',
                'email',
                provisioner.FLEET_SCOPE,
            ],
        },
        dry_run=False,
    )
    client_secret = provisioner._client_secret(token, client['id'])

    # Serve the installed app on loopback against the live issuer -- the same
    # shape as qualification.serve_browser.build_app (same /api/lifecycle
    # probe route and host policy), with the OIDC settings pointed at the
    # provisioned issuer instead of the disposable loopback one.
    import threading

    import uvicorn
    from cryptography.fernet import Fernet
    from arbora.webui_host.session_boundary import identity_factory_kwargs
    from overstory import host, oidc_session
    from overstory.server import create_agent_web_app
    from pydantic_ai import Agent
    from pydantic_ai.models.test import TestModel

    settings = oidc_session.OIDCSettings(
        client_id=LIVE_PROBE_CLIENT,
        client_secret=client_secret,
        issuer=issuer_url,
        redirect_uri=origin + '/auth/callback',
        scope='openid profile email',
        session_key=Fernet.generate_key().decode(),
    )
    monkeypatch.setattr(oidc_session, 'load_settings', lambda: settings)
    for field, value in {
        'auth_jwt_jwks_uri': issuer_url + '/protocol/openid-connect/certs',
        'auth_jwt_issuer': issuer_url,
        'auth_jwt_audience': provisioner.FLEET_SCOPE,
        'allowed_hosts': '127.0.0.1,localhost',
        'allowed_origins': origin,
        'gateway_rate_limit': 0,
        'gateway_rate_burst': 0,
    }.items():
        monkeypatch.setattr(host.config, field, value, raising=False)
    monkeypatch.setenv('OVERSTORY_ACCESS_LOG_POLICY', 'disabled')

    def compose(app):
        @app.get('/api/lifecycle')
        def identity():
            actor = host.current_actor()
            return {
                'subject': actor.actor_id,
                'authenticated': actor.authenticated,
                'tenant': actor.tenant_id,
            }

    app = create_agent_web_app(
        Agent(TestModel()),
        {'get_path': lambda value: value},
        listener_host='127.0.0.1',
        application_composer=compose,
        **identity_factory_kwargs('oidc', None, factory=create_agent_web_app),
    )
    server = uvicorn.Server(
        uvicorn.Config(app, log_level='warning', access_log=False)
    )
    thread = threading.Thread(target=lambda: server.run(sockets=[sock]), daemon=True)
    thread.start()
    try:
        deadline = time.monotonic() + 45
        while True:
            try:
                with urllib.request.urlopen(origin + '/auth/session', timeout=2) as response:
                    response.read()
                break
            except urllib.error.URLError:
                if time.monotonic() > deadline:
                    raise RuntimeError('live qualification server did not start')
                time.sleep(0.1)

        driver = _live_probe_driver(tmp_path, repo_root, origin)
        result = subprocess.run(
            [
                node,
                str(driver),
                origin,
                os.environ['WEBUI_LIVE_TEST_USERNAME'],
                os.environ['WEBUI_LIVE_TEST_PASSWORD'],
            ],
            cwd=repo_root,
            capture_output=True,
            text=True,
            timeout=180,
        )
        assert result.returncode == 0, (
            f'live sign-in probe failed:\n{result.stdout}\n{result.stderr}'
        )
        assert 'PASS live sign-in probe subject=' in result.stdout
    finally:
        server.should_exit = True
        thread.join(timeout=5)
        sock.close()
