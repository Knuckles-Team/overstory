"""Reusable per-batch runner for the Arbora City kit stages.

Each run(): full scene clear + orphan purge, world/sun setup, build a slice of
a stage module's SPECS, shelf them for review, clear the non-shelf stage
objects, purge orphans, and dump a JSON report. Safe to call repeatedly across
separate execute_blender_code invocations (no state leaked between calls).
"""
import importlib
import json
import math
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import kitlib as K  # noqa: E402

TRIS_CAP = 4000
MATS_CAP = 16


def _full_clear():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images,
                  bpy.data.lights, bpy.data.cameras, bpy.data.collections):
        for b in list(block):
            if b.users == 0:
                block.remove(b)


def _setup_scene():
    world = bpy.data.worlds.get("KitWorld") or bpy.data.worlds.new("KitWorld")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg is not None:
        bg.inputs[0].default_value = (0.55, 0.56, 0.58, 1.0)
    ld = bpy.data.lights.new("KitSun", "SUN")
    ld.energy = 3.0
    so = bpy.data.objects.new("KitSun", ld)
    bpy.context.scene.collection.objects.link(so)
    so.rotation_euler = (math.radians(50), math.radians(10), math.radians(140))


def _purge():
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for b in list(block):
            if b.users == 0:
                block.remove(b)


def run(stage_mod, start, end, tag):
    _full_clear()
    _setup_scene()
    mod = importlib.import_module(stage_mod)
    importlib.reload(mod)
    batch = mod.SPECS[start:end]
    reports = []
    for fid, fn, cat, expect in batch:
        rep, obj = K.family(fid, fn, cat, K, expect=expect)
        reports.append(rep)
        K.shelf_add(obj, cat)
    K.clear_stage()
    _purge()
    out = os.path.join(os.environ.get("KIT_REPORT_DIR", tempfile.gettempdir()),
                       stage_mod + "_" + tag + ".json")
    json.dump(reports, open(out, "w"), indent=1)
    mt = max(r["triangles"] for r in reports)
    mm = max(r["materials"] for r in reports)
    over = sum(r["triangles"] > TRIS_CAP or r["materials"] > MATS_CAP for r in reports)
    qa = [f'{r["id"]}: {q}' for r in reports for q in r["qa"]]
    print(f"STAGE_DONE n={len(reports)} max_tris={mt} max_mats={mm} "
          f"over_budget={over} qa_flags={len(qa)}")
    for r in reports:
        print(f"REPORT {r['id']} tri={r['triangles']} mat={r['materials']} "
              f"bytes={r['bytes']} bbox={r['bbox']} qa={r['qa']}")
    names = [f"shelf_{r['id']}" for r in reports]
    print("SHELF " + ",".join(names))
    return reports
