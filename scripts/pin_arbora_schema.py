"""Pin Arbora's operation schema for the typed client.

Usage: pin_arbora_schema.py <arbora openapi.json> [out]

Arbora's projection embeds each Pydantic model's own `$defs` inside the
operation schema, so a `#/$defs/X` reference points at a sibling of the
operation, which OpenAPI tooling cannot resolve. This script hoists every
embedded `$defs` entry into `components.schemas` under a name unique to the
operation and rewrites the references, leaving the operation ids, paths and
the registry digest untouched. Then run `pnpm run arbora:client:gen`.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

OPS_PREFIX = '/api/v1/ops/'
DEFAULT_OUT = Path(__file__).resolve().parent.parent / 'src/lib/arbora-api/generated/openapi.json'


def _safe(text: str) -> str:
    return re.sub(r'[^A-Za-z0-9_]', '_', text)


def _rewrite(node: Any, prefix: str) -> Any:
    if isinstance(node, dict):
        out = {k: _rewrite(v, prefix) for k, v in node.items() if k != '$defs'}
        mapping = out.get('mapping')
        if isinstance(mapping, dict) and 'propertyName' in out:
            # A discriminator maps each tag to a schema by a bare reference string.
            out['mapping'] = {
                tag: f'#/components/schemas/{prefix}__{_safe(target[len("#/$defs/") :])}'
                if isinstance(target, str) and target.startswith('#/$defs/')
                else target
                for tag, target in mapping.items()
            }
        ref = out.get('$ref')
        if isinstance(ref, str) and ref.startswith('#/$defs/'):
            out['$ref'] = f'#/components/schemas/{prefix}__{_safe(ref[len("#/$defs/") :])}'
        return out
    if isinstance(node, list):
        return [_rewrite(v, prefix) for v in node]
    return node


def _hoist(node: Any, prefix: str, schemas: dict[str, Any]) -> None:
    if isinstance(node, dict):
        for name, body in (node.get('$defs') or {}).items():
            schemas[f'{prefix}__{_safe(name)}'] = _rewrite(body, prefix)
        for value in node.values():
            _hoist(value, prefix, schemas)
    elif isinstance(node, list):
        for value in node:
            _hoist(value, prefix, schemas)


def pin(document: dict[str, Any]) -> dict[str, Any]:
    schemas: dict[str, Any] = dict(document.get('components', {}).get('schemas', {}))
    paths: dict[str, Any] = {}
    seen: set[str] = set()
    for path, methods in sorted(document['paths'].items(), key=lambda item: (not item[0].startswith(OPS_PREFIX), item[0])):
        prefix = _safe(path.removeprefix(OPS_PREFIX))
        _hoist(methods, prefix, schemas)
        rewritten = _rewrite(methods, prefix)
        for method, operation in rewritten.items():
            op_id = operation.get('operationId')
            if op_id in seen:
                # A REST alias of an operation already listed at /api/v1/ops/<id>.
                operation['operationId'] = f'{op_id}@{method}{_safe(path)}'
            seen.add(operation['operationId'])
        paths[path] = rewritten
    pinned = dict(document)
    pinned['paths'] = paths
    pinned['components'] = {**document.get('components', {}), 'schemas': dict(sorted(schemas.items()))}
    return pinned


def main(argv: list[str]) -> int:
    if not 2 <= len(argv) <= 3:
        print(__doc__)
        return 2
    document = json.loads(Path(argv[1]).read_text())
    out = Path(argv[2]) if len(argv) == 3 else DEFAULT_OUT
    out.write_text(json.dumps(pin(document), indent=2) + '\n')
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv))
