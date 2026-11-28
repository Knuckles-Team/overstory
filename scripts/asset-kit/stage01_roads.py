"""stage01_roads.py — street profiles, markings, infrastructure (families 01-21).

Surface stack (road spec): asphalt top 0.12 m, curb-return top 0.22 m,
sidewalk top 0.32 m. Tiles: 4 m carriageway, 10 m long, 4 m module grid.
"""
import math

import bpy

W = 4.0
LEN = 10.0
T = 0.12  # asphalt top


def straight(K):
    o = [K.box("asphalt", W, LEN, T, mat=K.get_mat("asphalt"))]
    for y in (-4.0, -1.8, 0.4, 2.6):
        o.append(K.box("dash", 0.12, 1.5, 0.012, y=y, z=T, mat=K.get_mat("white")))
    for x in (-1.85, 1.85):
        o.append(K.box("edge", 0.07, LEN - 0.5, 0.012, x=x, z=T, mat=K.get_mat("white")))
    for y in (-4.9, 4.9):
        o.append(K.box("drain", 0.5, 0.12, 0.02, x=1.7, y=y, z=T, mat=K.get_mat("metal_dark")))
    return o


def _arc_pts(inner, outer, a0, a1, n=10):
    pts = []
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n
        pts.append((math.cos(a) * inner, math.sin(a) * inner))
    for i in range(n, -1, -1):
        a = a0 + (a1 - a0) * i / n
        pts.append((math.cos(a) * outer, math.sin(a) * outer))
    return pts


def bend(K):
    o = [K.prism("asphalt", _arc_pts(2.0, 6.0, 0.0, math.pi / 2), T, mat=K.get_mat("asphalt"))]
    o.append(K.prism("dash-arc", _arc_pts(3.94, 4.06, 0.25, math.pi / 2 - 0.25, 8), 0.012, z=T,
                     mat=K.get_mat("white")))
    o.append(K.prism("edge-in", _arc_pts(2.06, 2.14, 0.05, math.pi / 2 - 0.05, 8), 0.012, z=T,
                     mat=K.get_mat("white")))
    o.append(K.prism("edge-out", _arc_pts(5.86, 5.94, 0.05, math.pi / 2 - 0.05, 8), 0.012, z=T,
                     mat=K.get_mat("white")))
    return o


def t_junction(K):
    o = [
        K.box("asphalt-main", W, LEN, T, mat=K.get_mat("asphalt")),      # y -5..5
        K.box("asphalt-arm", LEN, W, T, y=3.0, mat=K.get_mat("asphalt"))  # x -5..5, y 1..5
    ]
    for y in (-4.0, -1.8, 0.4):
        o.append(K.box("dash", 0.12, 1.5, 0.012, y=y, z=T, mat=K.get_mat("white")))
    o.append(K.box("stop", W - 0.4, 0.16, 0.012, y=1.0, z=T, mat=K.get_mat("white")))
    for x in (-3.5, 3.5):
        o.append(K.box("dash-x", 1.5, 0.12, 0.012, x=x, y=3.0, z=T, mat=K.get_mat("white")))
    return o


def cross_junction(K):
    o = [K.box("asphalt", W, W, T, mat=K.get_mat("asphalt"))]
    for a in (-1.5, -0.45, 0.45, 1.5):
        o.append(K.box("dash-y", 0.12, 0.7, 0.012, y=a, z=T, mat=K.get_mat("white")))
        o.append(K.box("dash-x", 0.7, 0.12, 0.012, x=a, z=T, mat=K.get_mat("white")))
    o.append(K.box("manhole", 0.5, 0.5, 0.02, x=1.2, y=1.2, z=T, mat=K.get_mat("metal_dark")))
    return o


def end_cap(K):
    o = [K.box("asphalt", W, 2.0, T, mat=K.get_mat("asphalt"))]
    o.append(K.box("stop", W - 0.4, 0.16, 0.012, y=-0.8, z=T, mat=K.get_mat("white")))
    return o


def width_transition(K):
    pts = [(-2.0, -5.0), (2.0, -5.0), (3.0, 5.0), (-3.0, 5.0)]
    o = [K.prism("asphalt", pts, T, mat=K.get_mat("asphalt"))]
    for y in (-3.5, -1.5, 0.5, 2.5):
        o.append(K.box("dash", 0.12, 1.4, 0.012, y=y, z=T, mat=K.get_mat("white")))
    return o


def crosswalk(K):
    o = [K.box("asphalt", W, W, T, mat=K.get_mat("asphalt"))]
    for x in (-1.5, -0.75, 0.0, 0.75, 1.5):
        o.append(K.box("bar", 0.5, 1.6, 0.012, x=x, z=T, mat=K.get_mat("white")))
    return o


def curb_return(K):
    import bmesh
    bm = bmesh.new()
    n = 8
    centre = bm.verts.new((0.0, 0.0, 0.0))
    ring = []
    for i in range(n + 1):
        a = (math.pi / 2) * i / n
        ring.append(bm.verts.new((math.cos(a) * 2.5, math.sin(a) * 2.5, 0.0)))
    face = bm.faces.new([centre] + ring)
    res = bmesh.ops.extrude_face_region(bm, geom=[face])
    up = [e for e in res["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=up, vec=(0, 0, 0.32))
    me = bpy.data.meshes.new("curb_return")
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new("curb_return", me)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(K.get_mat("paving"))
    return [obj]


def sidewalk_straight(K):
    o = [K.box("paving", 1.6, LEN, 0.32, mat=K.get_mat("paving"))]
    for y in (-3.3, -1.1, 1.1, 3.3):
        o.append(K.box("joint-x", 1.6, 0.04, 0.012, y=y, z=0.32, mat=K.get_mat("paving_joint")))
    o.append(K.box("joint-y", 0.04, LEN, 0.012, x=0.53, z=0.32, mat=K.get_mat("paving_joint")))
    o.append(K.box("curb", 0.15, LEN, 0.32, x=-0.72, mat=K.get_mat("paving_joint")))
    return o


def sidewalk_corner(K):
    o = [K.box("paving", 1.6, 1.6, 0.32, mat=K.get_mat("paving"))]
    o.append(K.box("joint", 1.6, 0.04, 0.012, y=0.53, z=0.32, mat=K.get_mat("paving_joint")))
    o.append(K.box("curb", 0.15, 1.6, 0.32, x=-0.72, mat=K.get_mat("paving_joint")))
    return o


def parking_edge(K):
    o = [K.box("asphalt", W, LEN, T, mat=K.get_mat("asphalt"))]
    for x in (-2.0, -0.9, 0.2, 1.3):
        o.append(K.box("bay", 0.1, 3.4, 0.012, x=x, y=2.5, z=T, mat=K.get_mat("white")))
    o.append(K.box("bay-end", 3.5, 0.1, 0.012, x=-0.35, y=4.3, z=T, mat=K.get_mat("white")))
    for y in (-3.5, -1.0, 1.5):
        o.append(K.box("dash", 0.12, 1.4, 0.012, y=y, z=T, mat=K.get_mat("white")))
    return o


def ramp_tactile(K):
    me = bpy.data.meshes.new("ramp")
    me.from_pydata(
        [(0, 0, 0.32), (2.6, 0, 0.12), (2.6, 2, 0.12), (0, 2, 0.32),
         (0, 0, -0.08), (2.6, 0, -0.08), (2.6, 2, -0.08), (0, 2, -0.08)],
        [],
        [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)])
    obj = bpy.data.objects.new("ramp", me)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(K.get_mat("paving"))
    o = [obj]
    for i in range(3):
        for j in range(6):
            o.append(K.cyl("bump", 0.025, 0.02, verts=6, x=-0.4 + j * 0.16, y=0.3 + i * 0.14,
                           z=0.32, mat=K.get_mat("mango")))
    return o


def planted_verge(K):
    o = [K.box("grass", 2.0, LEN, 0.1, mat=K.get_mat("grass"))]
    for y in (-4.0, -2.0, 0.0, 2.0, 4.0):
        o.append(K.box("soil", 0.25, 0.5, 0.12, x=-0.9, y=y, z=0.0, mat=K.get_mat("leaf_dark")))
    o.append(K.box("edge", 0.15, LEN, 0.32, x=0.92, mat=K.get_mat("paving_joint")))
    return o


def bridge_deck(K):
    o = [K.box("slab", 4.4, LEN + 0.4, 0.25, mat=K.get_mat("stone_pale"))]
    o.append(K.box("deck", W, LEN, 0.12, z=0.25, mat=K.get_mat("asphalt")))
    for y in (-2.5, 2.5):
        o.append(K.box("joint", W, 0.08, 0.02, y=y, z=0.37, mat=K.get_mat("metal_dark")))
    for x in (-1.9, 1.9):
        for y in (-4.5, 4.5):
            o.append(K.box("anchor", 0.3, 0.3, 0.15, x=x, y=y, z=0.37, mat=K.get_mat("metal_dark")))
    return o


def parapet_guardrail(K):
    o = [K.box("base", LEN, 0.3, 0.2, mat=K.get_mat("stone_pale"))]
    for h in (0.55, 0.75):
        o.append(K.box("rail", LEN, 0.05, 0.05, z=h, mat=K.get_mat_metal("metal")))
    for x in (-4.0, -2.0, 0.0, 2.0, 4.0):
        o.append(K.box("post", 0.08, 0.08, 0.75, x=x, mat=K.get_mat_metal("metal")))
    return o


def abutment_support(K):
    o = [K.box("base", 1.1, 1.1, 0.3, mat=K.get_mat("stone_pale"))]
    o.append(K.box("column", 0.9, 0.9, 4.2, z=0.3, mat=K.get_mat("stone_pale")))
    o.append(K.box("cap", 1.2, 1.2, 0.25, z=4.5, mat=K.get_mat("stone_pale")))
    for z in (1.4, 2.8, 4.2):
        o.append(K.box("band", 0.94, 0.94, 0.06, z=z, mat=K.get_mat("paving_joint")))
    return o


def quay_bank(K):
    o = [K.box("top", 4.0, 4.0, 0.3, z=0.4, mat=K.get_mat("paving"))]
    o.append(K.box("step1", 4.0, 1.2, 0.3, y=1.4, z=0.1, mat=K.get_mat("stone_pale")))
    o.append(K.box("step2", 4.0, 1.2, 0.22, y=2.6, z=-0.12, mat=K.get_mat("stone_pale")))
    for x in (-1.8, -0.6, 0.6, 1.8):
        o.append(K.cyl("post", 0.04, 0.9, verts=6, x=x, z=0.7, mat=K.get_mat_metal("metal_dark")))
    o.append(K.box("rail", 4.0, 0.04, 0.04, z=1.55, mat=K.get_mat_metal("metal_dark")))
    return o


def boardwalk_pier(K):
    o = [K.box("deck", 3.0, 8.0, 0.12, z=0.9, mat=K.get_mat("timber_light"))]
    for y in (-3.2, -1.6, 0.0, 1.6, 3.2):
        o.append(K.box("plank-joint", 3.0, 0.05, 0.012, y=y, z=1.02, mat=K.get_mat("timber")))
    for x in (-1.48, 1.48):
        o.append(K.box("rail", 0.06, 8.0, 0.06, z=1.45, x=x, mat=K.get_mat("timber")))
        for y in (-3.8, -1.9, 0.0, 1.9, 3.8):
            o.append(K.box("post", 0.07, 0.07, 0.55, x=x, y=y, z=1.02, mat=K.get_mat("timber")))
    for x in (-1.2, 1.2):
        for y in (-3.5, 3.5):
            o.append(K.box("pile", 0.22, 0.22, 3.2, x=x, y=y, z=-1.6, mat=K.get_mat("timber")))
    return o


def manhole_drain(K):
    o = [K.cyl("cover", 0.35, 0.04, verts=12, z=T, mat=K.get_mat_metal("metal_dark"))]
    o.append(K.box("slot-a", 0.5, 0.05, 0.012, z=T + 0.04, mat=K.get_mat("charcoal")))
    o.append(K.box("slot-b", 0.05, 0.5, 0.012, z=T + 0.04, mat=K.get_mat("charcoal")))
    return o


def paving_repair(K):
    o = [K.box("patch", 2.2, 3.2, 0.14, bevel=0.02, mat=K.get_mat("asphalt_wet"))]
    o.append(K.box("seal", 1.8, 2.8, 0.012, z=0.14, mat=K.get_mat("charcoal")))
    return o


SPECS = [
    ("road.straight-10", straight, "road"),
    ("road.bend-90", bend, "road"),
    ("road.t-junction", t_junction, "road"),
    ("road.cross-junction", cross_junction, "road"),
    ("road.end-cap", end_cap, "road"),
    ("road.width-transition", width_transition, "road"),
    ("road.crosswalk", crosswalk, "road"),
    ("road.curb-return", curb_return, "road"),
    ("road.sidewalk-straight-10", sidewalk_straight, "road"),
    ("road.sidewalk-corner", sidewalk_corner, "road"),
    ("road.parking-edge", parking_edge, "road"),
    ("road.ramp-tactile", ramp_tactile, "road"),
    ("road.planted-verge", planted_verge, "road"),
    ("road.bridge-deck", bridge_deck, "road"),
    ("road.parapet-guardrail", parapet_guardrail, "road"),
    ("road.abutment-support", abutment_support, "road"),
    ("road.quay-bank", quay_bank, "road"),
    ("road.boardwalk-pier", boardwalk_pier, "road"),
    ("road.manhole-drain", manhole_drain, "road"),
    ("road.paving-repair", paving_repair, "road"),
]


def build(lib):
    reports = []
    for i, (fid, fn, cat) in enumerate(SPECS):
        rep, obj = lib.family(fid, fn, cat, lib)
        reports.append(rep)
        lib.shelf_add(obj, i)
    lib.clear_stage()
    lib._REPORTS.extend(reports)
    return reports
