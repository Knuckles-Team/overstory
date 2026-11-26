#!/usr/bin/env bash
# Build the venv the loopback arbora fixture runs from: arbora at the commit
# pinned in e2e/fixtures/loopback-arbora/pin.json, with the medulla engine wheel
# arbora itself pins (it carries the medulla-server binary).
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pin="$here/e2e/fixtures/loopback-arbora/pin.json"
venv="${1:?usage: loopback-arbora-venv.sh <venv dir>}"
read -r repository commit python < <(python3 -I -c '
import json, sys
p = json.load(open(sys.argv[1]))
print(p["arbora"]["repository"], p["arbora"]["commit"], p["python"])' "$pin")
uv venv --python "$python" "$venv"
uv pip install --python "$venv/bin/python" "arbora @ git+${repository}@${commit}"
