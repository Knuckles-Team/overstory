"""gen_packaging.py — regenerate kit catalog + lock entries from disk.

Scans public/city-assets/kit/**/*.glb, parses each GLB (glTF 2.0 binary
layout) for the position min/max, triangle and material counts, computes
SHA-256 and byte count, and writes:

- public/city-assets/kit/catalog.json   (all families, sorted by id)
- adds entries to public/city-assets/assets.lock.json under city-assets/kit/
  (external pins robot-expressive + marker-cube are left untouched)

Source attribution per family is derived from the SPECS tables of the
stage modules under scripts/asset-kit/. Run from the repo root:

    python3 scripts/asset-kit/gen_packaging.py
"""
import ast
import hashlib
import json
import os
import re
import struct
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
KIT = os.path.join(ROOT, "public", "city-assets", "kit")
LOCK = os.path.join(ROOT, "public", "city-assets", "assets.lock.json")
STAGES_DIR = os.path.join(ROOT, "scripts", "asset-kit")


def glb_json(buf):
    off = 12
    while off < len(buf):
        ln = struct.unpack_from("<I", buf, off)[0]
        ct = struct.unpack_from("<I", buf, off + 4)[0]
        if ct == 0x4E4F534A:
            return json.loads(buf[off + 8 : off + 8 + ln])
        off += 8 + ln
    raise ValueError("no JSON chunk")


def triangles(g):
    total = 0
    for mesh in g.get("meshes", []):
        for prim in mesh.get("primitives", []):
            acc = g["accessors"][prim.get("indices", prim["attributes"]["POSITION"])]
            total += acc["count"] // 3
    return total


def bbox(g):
    """World-space bounding box from node TRS + POSITION min/max (glTF Y-up)."""
    mn = [float("inf")] * 3
    mx = [float("-inf")] * 3

    def mul(m, v):
        return [
            m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
            m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
            m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
        ]

    for node in g.get("nodes", []):
        tr = node.get("translation", [0, 0, 0])
        rot = node.get("rotation", [0, 0, 0, 1])
        sc = node.get("scale", [1, 1, 1])
        x, y, z, w = rot
        m = [
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
        ]
        for mi in range(3):
            for mj in range(3):
                m[mi][mj] *= sc[mj]
        mesh_ids = node.get("meshes")
        if mesh_ids is None and len(g.get("nodes", [])) == 1:
            mesh_ids = [0]
        for mid in mesh_ids or []:
            for prim in g["meshes"][mid].get("primitives", []):
                acc = g["accessors"][prim["attributes"]["POSITION"]]
                lo, hi = acc["min"], acc["max"]
                for sx in (lo[0], hi[0]):
                    for sy in (lo[1], hi[1]):
                        for sz in (lo[2], hi[2]):
                            p = mul(m, [sx, sy, sz])
                            p = [p[0] + tr[0], p[1] + tr[1], p[2] + tr[2]]
                            for i in range(3):
                                mn[i] = min(mn[i], p[i])
                                mx[i] = max(mx[i], p[i])
    return mn, mx


def family_source():
    """family id -> stage module path (relative to repo root), from SPECS."""
    src = {}
    for name in sorted(os.listdir(STAGES_DIR)):
        if not re.match(r"stage\d+_\w+\.py$", name):
            continue
        path = os.path.join(STAGES_DIR, name)
        tree = ast.parse(open(path).read())
        for node in tree.body:
            if isinstance(node, ast.Assign) and any(
                isinstance(t, ast.Name) and t.id == "SPECS" for t in node.targets
            ):
                for item in node.value.elts:
                    fid = item.elts[0]
                    if isinstance(fid, ast.Constant):
                        src[fid.value] = f"scripts/asset-kit/{name}"
    return src


def main():
    sources = family_source()
    entries = []
    for cat in sorted(os.listdir(KIT)):
        cdir = os.path.join(KIT, cat)
        if not os.path.isdir(cdir):
            continue
        for fn in sorted(os.listdir(cdir)):
            if not fn.endswith(".glb"):
                continue
            fid = fn[:-4]
            path = os.path.join(cdir, fn)
            buf = open(path, "rb").read()
            g = glb_json(buf)
            mn, mx = bbox(g)
            ext = [round(mx[i] - mn[i], 3) for i in range(3)]
            # glTF is Y up: footprint = (x, z), height = y
            entries.append(
                {
                    "id": fid,
                    "file": f"kit/{cat}/{fid}.glb",
                    "category": cat,
                    "footprint": [ext[0], ext[2]],
                    "height": ext[1],
                    "triangles": triangles(g),
                    "materials": len(g.get("materials", [])),
                    "bytes": len(buf),
                    "sha256": hashlib.sha256(buf).hexdigest(),
                    "license": "CC0-1.0",
                    "source": sources.get(fid, "scripts/asset-kit/"),
                }
            )
    entries.sort(key=lambda e: e["id"])
    unknown = [e["id"] for e in entries if e["source"] == "scripts/asset-kit/"]
    if unknown:
        print("WARN: no stage source for:", unknown, file=sys.stderr)

    catalog = {
        "version": 1,
        "generated": "2026-11-25",
        "spec": "specs/arbora-city/asset-pack.md",
        "units": "metres",
        "up": "Y (glTF after Blender Z-up export)",
        "pivot": "bottom centre: origin at ground level, footprint centre",
        "forward": "vehicles face +Y in the glTF frame (Blender +Y authoring)",
        "textures": "none: flat palette materials, sRGB-to-linear baseColorFactor",
        "license": "CC0-1.0",
        "budgets": {"triangles": 4000, "materials": 16, "texturePx": 2048},
        "entries": entries,
    }
    with open(os.path.join(KIT, "catalog.json"), "w") as f:
        json.dump(catalog, f, indent=1)
        f.write("\n")

    lock = json.load(open(LOCK))
    before = len(lock["files"])
    # Rebuild the kit section from disk (drop stale kit entries, keep the
    # external pins: robot rig + marker cube).
    lock["files"] = {k: v for k, v in lock["files"].items() if not k.startswith("city-assets/kit/")}
    for e in entries:
        lock["files"][f"city-assets/{e['file']}"] = {
            "source_path": e["source"],
            "sha256": e["sha256"],
            "bytes": e["bytes"],
            "license": "CC0-1.0",
        }
    with open(LOCK, "w") as f:
        json.dump(lock, f, indent=2)
        f.write("\n")
    print(f"catalog: {len(entries)} families; lock: {before} -> {len(lock['files'])} files")


if __name__ == "__main__":
    main()
