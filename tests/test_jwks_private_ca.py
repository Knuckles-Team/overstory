"""JWKS fetching trusts the configured CA bundle and reports why it failed."""

import asyncio
import datetime
import ipaddress
import json
import ssl
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from overstory import host
from overstory.host import JwksUnavailableError, fetch_jwks

JWKS = {'keys': [{'kty': 'oct', 'kid': 'k1', 'k': 'c2VjcmV0'}]}


def _name(common: str) -> x509.Name:
    return x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, common)])


def _pem(cert: x509.Certificate) -> bytes:
    return cert.public_bytes(serialization.Encoding.PEM)


def _issue(tmp_path: Path) -> tuple[Path, Path, Path]:
    now = datetime.datetime.now(datetime.UTC)
    ca_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    ca = (
        x509.CertificateBuilder()
        .subject_name(_name('private test ca'))
        .issuer_name(_name('private test ca'))
        .public_key(ca_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(minutes=1))
        .not_valid_after(now + datetime.timedelta(hours=1))
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .add_extension(
            x509.KeyUsage(
                digital_signature=True,
                content_commitment=False,
                key_encipherment=False,
                data_encipherment=False,
                key_agreement=False,
                key_cert_sign=True,
                crl_sign=True,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
        .add_extension(
            x509.SubjectKeyIdentifier.from_public_key(ca_key.public_key()),
            critical=False,
        )
        .sign(ca_key, hashes.SHA256())
    )
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    leaf = (
        x509.CertificateBuilder()
        .subject_name(_name('127.0.0.1'))
        .issuer_name(ca.subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(minutes=1))
        .not_valid_after(now + datetime.timedelta(hours=1))
        .add_extension(
            x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()),
            critical=False,
        )
        .add_extension(
            x509.SubjectAlternativeName(
                [x509.IPAddress(ipaddress.ip_address('127.0.0.1'))]
            ),
            critical=False,
        )
        .sign(ca_key, hashes.SHA256())
    )
    ca_path = tmp_path / 'ca.pem'
    cert_path = tmp_path / 'leaf.pem'
    key_path = tmp_path / 'leaf.key'
    ca_path.write_bytes(_pem(ca))
    cert_path.write_bytes(_pem(leaf))
    key_path.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    )
    return ca_path, cert_path, key_path


class _Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        body = json.dumps(JWKS).encode()
        self.send_response(200)
        self.send_header('content-type', 'application/json')
        self.send_header('content-length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args: object) -> None:
        return


@pytest.fixture
def private_ca_jwks(tmp_path: Path):
    ca_path, cert_path, key_path = _issue(tmp_path)
    server = HTTPServer(('127.0.0.1', 0), _Handler)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(cert_path, key_path)
    server.socket = context.wrap_socket(server.socket, server_side=True)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host._jwks_cache.clear()
    try:
        yield ca_path, f'https://127.0.0.1:{server.server_port}/jwks.json'
    finally:
        server.shutdown()
        server.server_close()
        host._jwks_cache.clear()


@pytest.mark.spec('OVERSTORY-IDENTITY-R003.3.3')
def test_private_ca_jwks_verifies_with_the_bundle_and_tls_failures_are_distinct(
    private_ca_jwks, monkeypatch
):
    ca_path, url = private_ca_jwks
    # Without the bundle the private certificate is untrusted: a typed, distinct reason.
    monkeypatch.delenv('SSL_CERT_FILE', raising=False)
    with pytest.raises(JwksUnavailableError) as refused:
        asyncio.run(fetch_jwks(url))
    assert refused.value.reason == 'jwks_tls_failure'
    # With the bundle configured the same URL verifies.
    monkeypatch.setenv('SSL_CERT_FILE', str(ca_path))
    document = asyncio.run(fetch_jwks(url))
    assert document == JWKS


@pytest.mark.spec('OVERSTORY-IDENTITY-R003.3.3')
def test_an_unreachable_jwks_host_is_a_distinct_reason(monkeypatch):
    host._jwks_cache.clear()
    monkeypatch.delenv('SSL_CERT_FILE', raising=False)
    with pytest.raises(JwksUnavailableError) as refused:
        asyncio.run(fetch_jwks('https://127.0.0.1:9/jwks.json'))
    assert refused.value.reason == 'jwks_unreachable'


@pytest.mark.spec('OVERSTORY-IDENTITY-R003.3.3')
def test_a_failed_verification_is_logged_without_the_token(
    private_ca_jwks, monkeypatch
):
    import logging

    from starlette.testclient import TestClient
    from test_identity_boundary import _build

    _ca, url = private_ca_jwks
    monkeypatch.delenv('SSL_CERT_FILE', raising=False)
    for field, value in (
        ('auth_jwt_jwks_uri', url),
        ('auth_jwt_issuer', 'https://issuer.example'),
        ('auth_jwt_audience', 'overstory'),
    ):
        monkeypatch.setattr(host.config, field, value, raising=False)
    secret_token = 'aGVhZGVy.c2VjcmV0LWNsYWltcw.c2lnbmF0dXJl'  # sanitizer:ignore - synthetic bearer, used only to assert it is never logged
    records: list[str] = []

    class _Capture(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            records.append(record.getMessage())

    capture = _Capture(level=logging.WARNING)
    server_logger = logging.getLogger('overstory.server')
    server_logger.addHandler(capture)
    client = TestClient(_build(), raise_server_exceptions=False)
    response = client.get(
        '/api/apps', headers={'Authorization': f'Bearer {secret_token}'}
    )
    # The boundary still owns the 401; the cause is now visible in the log.
    assert response.status_code == 401
    server_logger.removeHandler(capture)
    logged = '\n'.join(records)
    assert 'reason=jwks_tls_failure' in logged
    assert secret_token not in logged
    assert 'c2VjcmV0LWNsYWltcw' not in logged
