"""Register fauna assets in catalog and lock file."""
import hashlib
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CATALOG_PATH = os.path.join(ROOT, "public/city-assets/kit/catalog.json")
LOCK_PATH = os.path.join(ROOT, "public/city-assets/assets.lock.json")

FAUNA_FILES = [
    "city-assets/kit/fauna/fauna.seagull.glb",
    "city-assets/kit/fauna/fauna.dog.glb",
    "city-assets/kit/fauna/fauna.fish.glb",
]

# Read report
report_path = "/tmp/stage18_fauna_fauna.json"
with open(report_path) as f:
    report = json.load(f)

# Read catalog
with open(CATALOG_PATH) as f:
    catalog = json.load(f)

# Add entries
for entry in report:
    catalog["entries"].append({
        "id": entry["id"],
        "file": entry["file"],
        "category": entry["category"],
        "triangles": entry["triangles"],
        "materials": entry["materials"],
        "bytes": entry["bytes"],
        "bbox": entry["bbox"],
        "license": "CC0-1.0",
        "sha256": "",  # will be computed below
        "source": "stage18_fauna",
        "version": 1,
    })

with open(CATALOG_PATH, "w") as f:
    json.dump(catalog, f, indent=2)

print(f"Added {len(report)} entries to catalog")

# Read lock file
with open(LOCK_PATH) as f:
    lock = json.load(f)

# Compute SHA-256 and add to lock
for rel_path in FAUNA_FILES:
    full_path = os.path.join(ROOT, "public", rel_path)
    if not os.path.exists(full_path):
        print(f"ERROR: {full_path} not found")
        continue
    with open(full_path, "rb") as f:
        data = f.read()
    sha = hashlib.sha256(data).hexdigest()
    lock["files"][rel_path] = {
        "sha256": sha,
        "bytes": len(data),
        "license": "CC0-1.0",
    }
    print(f"Added {rel_path}: {len(data)} bytes, sha256={sha[:16]}...")

with open(LOCK_PATH, "w") as f:
    json.dump(lock, f, indent=2)

print("Updated lock file")
print(f"Total lock entries: {len(lock['files'])}")
