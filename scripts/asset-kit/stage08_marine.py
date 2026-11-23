"""stage08_marine.py — marine registry entries (outside the 66-family target).

Hull: profile in the y/z plane (bow at +Y = glTF forward), extruded along x
(beam), normals recalculated. Waterline at z=0 (pivot bottom centre).
"""
import bmesh
import math

import bpy


def hull(K, name, L, W, D, mat, x=0.0, y=0.0, z=0.0):
    """Low-poly boat hull. L along y (bow +y), W beam along x, D depth."""
    bm = bmesh.new()
    bow = L * 0.22
    pts = [(-L / 2, 0.0), (L / 2 - bow, 0.0), (L / 2, D * 0.65),
           (L / 2 - bow * 0.7, D), (-L / 2, D)]
    vs = [bm.verts.new((0.0, py, pz)) for py, pz in pts]
    f = bm.faces.new(vs)
    res = bmesh.ops.extrude_face_region(bm, geom=[f])
    up = [e for e in res["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=up, vec=(W, 0.0, 0.0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = False
    obj.location = (x - W / 2.0, y, z)
    return obj


def fishing_boat(K):
    W = 2.2
    o = [hull(K, "hull", 5.5, W, 0.9, K.get_mat("timber"))]
    o.append(K.box("deck", W * 0.9, 4.6, 0.06, y=-0.2, z=0.9,
                   mat=K.get_mat("timber_light")))
    o.append(K.box("cabin", 1.6, 1.6, 0.85, y=-1.4, z=0.96,
                   mat=K.get_mat("cream")))
    o.append(K.box("cabin-glass", 1.4, 0.08, 0.5, y=-0.62, z=1.2,
                   mat=K.get_mat_glass("glass_cool")))
    o.append(K.cyl("mast", 0.05, 3.0, verts=8, y=0.6, z=0.9,
                   mat=K.get_mat_metal("metal_dark")))
    o.append(K.box("boom", 0.08, 2.2, 0.08, y=0.6, z=3.6,
                   mat=K.get_mat_metal("metal_dark")))
    o.append(K.box("sail", 0.06, 1.9, 0.4, y=0.45, z=3.4,
                   mat=K.get_mat("offwhite")))
    return o


def cargo_ship(K):
    W = 2.8
    o = [hull(K, "hull", 8.0, W, 1.4, K.get_mat("charcoal"))]
    o.append(K.box("boot-top", W + 0.1, 7.4, 0.25, z=0.15, mat=K.get_mat("red_paint")))
    o.append(K.box("deck", W, 7.6, 0.1, z=1.4, mat=K.get_mat("steel")))
    o.append(K.box("box-a", 1.9, 1.5, 0.95, x=0.0, y=-2.2, z=1.5,
                   mat=K.get_mat("mango")))
    o.append(K.box("box-b", 1.9, 1.5, 0.95, x=0.0, y=-0.6, z=1.5,
                   mat=K.get_mat("turquoise")))
    o.append(K.box("box-c", 1.7, 1.4, 0.9, x=0.0, y=-1.4, z=2.45,
                   mat=K.get_mat("coral")))
    o.append(K.box("bridge", 2.0, 1.6, 1.7, y=2.6, z=1.5,
                   mat=K.get_mat("white")))
    o.append(K.box("bridge-deck", 2.4, 1.8, 0.15, y=2.6, z=3.2,
                   mat=K.get_mat("offwhite")))
    o.append(K.box("bridge-glass", 1.8, 0.1, 0.7, y=3.45, z=2.6,
                   mat=K.get_mat_glass("glass_dark")))
    o.append(K.box("funnel", 0.6, 0.8, 0.9, y=3.4, z=3.35,
                   mat=K.get_mat("charcoal")))
    return o


def yacht(K):
    W = 1.6
    o = [hull(K, "hull", 4.5, W, 0.7, K.get_mat("white"))]
    o.append(K.box("deck", W * 0.85, 2.2, 0.06, y=0.3, z=0.7,
                   mat=K.get_mat("cream")))
    o.append(K.box("cabin", 1.2, 1.2, 0.55, y=-1.0, z=0.76,
                   mat=K.get_mat("cream")))
    o.append(K.box("cabin-glass", 1.0, 0.08, 0.35, y=-0.42, z=0.95,
                   mat=K.get_mat_glass("glass_cool")))
    o.append(K.cyl("mast", 0.04, 2.6, verts=8, y=0.5, z=0.7,
                   mat=K.get_mat_metal("metal_dark")))
    o.append(K.box("sail", 0.05, 1.5, 0.3, y=0.35, z=2.6,
                   mat=K.get_mat("offwhite")))
    return o


def kayak(K):
    W = 0.7
    o = [hull(K, "hull", 3.2, W, 0.35, K.get_mat("turquoise"))]
    o.append(K.box("rim-f", 0.5, 0.05, 0.08, y=0.5, z=0.3,
                   mat=K.get_mat("charcoal")))
    o.append(K.box("rim-b", 0.5, 0.05, 0.08, y=-0.5, z=0.3,
                   mat=K.get_mat("charcoal")))
    o.append(K.box("rim-l", 0.05, 1.0, 0.08, x=-0.22, z=0.3,
                   mat=K.get_mat("charcoal")))
    o.append(K.box("rim-r", 0.05, 1.0, 0.08, x=0.22, z=0.3,
                   mat=K.get_mat("charcoal")))
    o.append(K.box("seat", 0.5, 0.06, 0.25, z=0.3, mat=K.get_mat("charcoal")))
    o.append(K.box("bow-pad", 0.3, 0.2, 0.05, y=1.3, z=0.3,
                   mat=K.get_mat("coral")))
    return o


def pwc(K):
    W = 0.8
    o = [hull(K, "hull", 2.2, W, 0.45, K.get_mat("charcoal"))]
    o.append(K.box("nose", 0.3, 0.5, 0.12, y=0.85, z=0.42,
                   mat=K.get_mat("coral")))
    o.append(K.box("deck", W * 0.8, 1.2, 0.06, y=-0.2, z=0.42,
                   mat=K.get_mat("offwhite")))
    o.append(K.box("seat", 0.5, 0.7, 0.18, y=-0.4, z=0.48,
                   mat=K.get_mat("metal_dark")))
    o.append(K.cyl("stem", 0.03, 0.45, verts=6, y=0.45, z=0.48,
                   mat=K.get_mat_metal("metal")))
    o.append(K.box("bar", 0.4, 0.05, 0.05, y=0.5, z=0.92,
                   mat=K.get_mat("charcoal")))
    return o


def buoy(K):
    o = [K.cyl("float", 0.35, 0.5, verts=10, z=0.0, mat=K.get_mat("coral"))]
    o.append(K.cyl("stripe", 0.36, 0.12, verts=10, z=0.2, mat=K.get_mat("white")))
    o.append(K.ico("ball", 0.3, z=0.75, mat=K.get_mat("white")))
    o.append(K.cyl("pole", 0.03, 0.25, verts=6, z=1.0, mat=K.get_mat_metal("metal")))
    o.append(K.cyl("light", 0.08, 0.14, verts=8, z=1.2,
                   mat=K.get_mat("window_warm")))
    return o


SPECS = [
    ("marine.fishing-boat", fishing_boat, "marine", (2.4, 5.9, 4.2)),
    ("marine.cargo-ship", cargo_ship, "marine", (3.0, 8.4, 4.4)),
    ("marine.yacht", yacht, "marine", (1.8, 4.9, 3.6)),
    ("marine.kayak", kayak, "marine", (0.9, 3.5, 0.8)),
    ("marine.pwc", pwc, "marine", (1.0, 2.4, 1.1)),
    ("marine.buoy", buoy, "marine", (0.8, 0.8, 1.4)),
]


def build(lib):
    reports = []
    for entry in SPECS:
        fid, fn, cat, expect = entry
        rep, obj = lib.family(fid, fn, cat, lib, expect=expect)
        reports.append(rep)
        lib.shelf_add(obj, cat)
    lib.clear_stage()
    lib._REPORTS.extend(reports)
    return reports
