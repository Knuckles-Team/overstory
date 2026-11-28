"""Sandboxed arbora host for the host-log browser journey (test only).

Serves arbora's real host-log routes over real, rotating log files. The browser page
reaches them through the fixture's same-origin proxy with its signed-in session cookie. A separate loopback control port
lets the test emit records (to force a rotation) and revoke or restore the grant.
Set ARBORA_CHECKOUT to an arbora source tree whose host-log routes serve version 2.
"""

import asyncio
import os
import secrets
import sys
import tempfile
import threading
from dataclasses import replace
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.environ['ARBORA_CHECKOUT'])

import uvicorn  # noqa: E402
from arbora.agent_host import build_agent_host_app  # noqa: E402
from arbora.agent_host.log_access import HostLogAccess, WorkspaceLogGrant  # noqa: E402
from arbora.agent_host.log_sink import WorkspaceLogSink  # noqa: E402
from arbora.identity.engine import Resolution  # noqa: E402
from arbora.identity.ports import SessionState  # noqa: E402

PAGE_ORIGIN = 'http://127.0.0.1:5207'
HOST_PORT, CONTROL_PORT = 5209, 5208
# The sandbox browser session token: generated per run and handed to the test.
SESSION_TOKEN = secrets.token_urlsafe(32)
TENANT = 'tenant-a'


def session() -> SessionState:
    context = {
        'tenant': TENANT,
        'principal': 'alice',
        'agent_id': 'alice',
        'audience': 'host',
        'roles': (),
        'scopes': (),
        'delegation': (),
        'policy_version': 'policy-1',
    }
    resolution = Resolution(
        principal_id='alice',
        username='alice',
        kind='human',
        status='active',
        is_bootstrap=False,
        roles=(),
        groups=(),
        scopes=(),
        mfa_required=False,
        mfa_enrolled=False,
        session_mfa_pending=False,
        request_context=context,
    )
    return SessionState(resolution, 200_000, 'session-alice', None)


class Owners:
    def __init__(self) -> None:
        self.allowed = True

    async def resolve_session(self, credential: str) -> SessionState:
        if credential != SESSION_TOKEN:
            raise PermissionError('credential refused')
        return session()

    async def authorize(self, state: SessionState, *, workspace: str):
        if not self.allowed:
            return None
        return replace(
            WorkspaceLogGrant(
                tenant=TENANT,
                principal='alice',
                session_ref=state.session_ref,
                workspace=workspace,
                policy_revision='policy-1',
                revision='grant-1',
                expires_at_ms=190_000,
                action='host.logs.read',
                source_generations=('host-1',),
            )
        )


workspace = tempfile.mkdtemp(prefix='host-log-view-')
sink = WorkspaceLogSink(workspace, 'host-1', max_bytes=1024)
owners = Owners()
access = HostLogAccess(
    sessions=owners,
    grants=owners,
    source=sink,
    workspace=sink.workspace,
    host_instance=sink.host_instance,
    interface_mode='terminal',
    web_logs=True,
    clock=lambda: 100.0,
)


def emit(request_id: str, message: str) -> None:
    asyncio.run(sink.emit(tenant=TENANT, request_id=request_id, message=message))


class Control(BaseHTTPRequestHandler):
    def log_message(self, *_args) -> None:
        return

    def do_GET(self) -> None:
        if self.path.strip('/') == 'session':
            return self._answer(200, SESSION_TOKEN.encode())
        self._answer(200)

    def do_POST(self) -> None:
        action = self.path.strip('/')
        if action == 'seed':
            emit('origin-request', 'held-text')
        elif action == 'rotate':
            for index in range(30):
                emit(str(index), 'x' * 400)
        elif action == 'revoke':
            owners.allowed = False
        elif action == 'restore':
            owners.allowed = True
        else:
            return self._answer(404)
        self._answer(200)

    def _answer(self, status: int, body: bytes = b'ok') -> None:
        self.send_response(status)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


threading.Thread(
    target=ThreadingHTTPServer(('127.0.0.1', CONTROL_PORT), Control).serve_forever,
    daemon=True,
).start()
app = build_agent_host_app(graph=None, graph_config={}, host_logs=access)
app.state.public_base_url = PAGE_ORIGIN
try:
    uvicorn.run(
        app, host='127.0.0.1', port=HOST_PORT, log_level='critical', lifespan='off'
    )
finally:
    sink.close()
