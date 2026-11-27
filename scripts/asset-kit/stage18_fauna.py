"""stage18_fauna.py — Fauna and water life for R054 (seagulls, companion dogs, fish).

All families are tiny mesh groups (< 200 tris each) for the flock-rule on R041.
"""
import math

import bpy


def seagull(K):
    """Compact seagull for waterfront deterministic routes (R054, one tiny flock mesh per R041)."""
    o = []
    # Body - elongated ellipsoid
    o.append(K.cyl("body", 0.18, 0.4, verts=8, rot=(0, 0, math.radians(90)), mat=K.get_mat("white")))
    # Head (icosahedron)
    o.append(K.ico("head", 0.08, x=0, z=0.02, mat=K.get_mat("white")))
    # Beak
    o.append(K.cone("beak", 0.03, 0.12, verts=4, x=0.05, z=0.02, rot=(0, math.radians(15), 0),
                    mat=K.get_mat("mango")))
    # Wings - swept back
    for side in (-1, 1):
        o.append(K.box("wing", 0.5, 0.04, 0.15, x=0.0, y=side * 0.35, z=0.0,
                       rot=(0, math.radians(-15), side * math.radians(20)),
                       mat=K.get_mat("stone_pale")))
    # Tail
    o.append(K.box("tail", 0.2, 0.04, 0.06, x=-0.2, z=0.0,
                   rot=(0, 0, math.radians(10)), mat=K.get_mat("charcoal")))
    return o


def dog(K):
    """Companion animal for pedestrian routes (R054)."""
    o = []
    # Body
    o.append(K.cyl("body", 0.15, 0.45, verts=8, rot=(0, 0, math.radians(90)), mat=K.get_mat("timber")))
    # Head (icosahedron)
    o.append(K.ico("head", 0.1, x=0.08, mat=K.get_mat("timber")))
    # Snout
    o.append(K.cyl("snout", 0.06, 0.12, verts=6, x=0.12, rot=(0, 0, math.radians(90)),
                   mat=K.get_mat("timber_dark")))
    # Ears
    for side in (-1, 1):
        o.append(K.box("ear", 0.06, 0.02, 0.08, x=0.04, y=side * 0.09, z=0.1,
                       mat=K.get_mat("timber_dark")))
    # Legs
    for x in (-0.15, 0.15):
        for y in (-0.1, 0.1):
            o.append(K.cyl("leg", 0.035, 0.25, verts=6, x=x, y=y, mat=K.get_mat("timber_dark")))
    # Tail
    o.append(K.cyl("tail", 0.025, 0.2, verts=4, x=-0.22, z=0.12,
                   rot=(0, 0, math.radians(-40)), mat=K.get_mat("timber_dark")))
    return o


def fish(K):
    """Small fish for shoal beneath reef shallows (R054, one tiny flock mesh per R041)."""
    o = []
    # Body (elongated cylinder)
    o.append(K.cyl("body", 0.1, 0.25, verts=8, rot=(0, 0, math.radians(90)), mat=K.get_mat("sea")))
    # Head (cone front)
    o.append(K.cone("head", 0.1, 0.08, verts=8, x=0.14, rot=(0, 0, math.radians(90)),
                    mat=K.get_mat("sea")))
    # Tail fin
    o.append(K.box("tail", 0.04, 0.15, 0.03, x=-0.2, rot=(0, 0, math.radians(90)),
                   mat=K.get_mat("sea")))
    # Dorsal fin
    o.append(K.box("dorsal", 0.03, 0.08, 0.02, z=0.1, mat=K.get_mat("sea")))
    return o


SPECS = [
    ("fauna.seagull", seagull, "fauna", (0.6, 0.2, 0.25)),
    ("fauna.dog", dog, "fauna", (0.55, 0.4, 0.25)),
    ("fauna.fish", fish, "fauna", (0.3, 0.2, 0.2)),
]


def build(lib):
    reports = []
    for i, (fid, fn, cat) in enumerate(SPECS):
        rep, obj = lib.family(fid, fn, cat, lib)
        reports.append(rep)
        lib.shelf_add(obj, 60 + i)
    lib.clear_stage()
    lib._REPORTS.extend(reports)
    return reports
