"""stage05_arch.py — architecture module families (families 22-37).

Bay module: 4 m wide, 3.2 m storey, Y-up after export. Sockets: facade-edge
(4 m faces), threshold (portal/doors), roof-edge (parapet tops).
"""
import math

import bpy


def plinth(K):
    o = [K.box("plinth", 4.0, 4.0, 0.5, bevel=0.03, mat=K.get_mat("stone_pale"))]
    o.append(K.box("band", 4.1, 4.1, 0.12, z=0.5, mat=K.get_mat("paving_joint")))
    return o


def bay_solid(K):
    o = [K.box("wall", 4.0, 0.25, 3.2, mat=K.get_mat("plaster_warm"))]
    o.append(K.box("base-course", 4.0, 0.3, 1.0, mat=K.get_mat("stone_pale")))
    for x in (-1.95, 1.95):
        o.append(K.box("quoin", 0.1, 0.3, 3.2, x=x, mat=K.get_mat("stone_pale")))
    return o


def _window(K, Kx, Kz, yoff=-0.16, mat_frame="charcoal"):
    """Window on the -Y face of a bay, centred at height Kz. Bay walls are
    0.25 thick (front face at y=-0.125); glass and hardware protrude past
    it so openings read clearly."""
    o = [K.box("glass", 1.0, 0.12, 1.2, x=Kx, y=yoff, z=Kz - 0.6,
               mat=K.get_mat_glass("glass_dark"))]
    o.append(K.box("sill", 1.2, 0.22, 0.1, x=Kx, y=yoff - 0.01, z=Kz - 0.7,
                   mat=K.get_mat("stone_pale")))
    o.append(K.box("lintel", 1.2, 0.2, 0.12, x=Kx, y=yoff - 0.01, z=Kz + 0.6,
                   mat=K.get_mat("stone_pale")))
    o.append(K.box("frame-l", 0.06, 0.18, 1.2, x=Kx - 0.5, y=yoff - 0.01,
                   z=Kz - 0.6, mat=K.get_mat(mat_frame)))
    o.append(K.box("frame-r", 0.06, 0.18, 1.2, x=Kx + 0.5, y=yoff - 0.01,
                   z=Kz - 0.6, mat=K.get_mat(mat_frame)))
    return o


def bay_window(K):
    o = [K.box("wall", 4.0, 0.25, 3.2, mat=K.get_mat("plaster_warm"))]
    o.append(K.box("base-course", 4.0, 0.3, 1.0, mat=K.get_mat("stone_pale")))
    o.extend(_window(K, -1.1, 1.75))
    o.extend(_window(K, 1.1, 1.75))
    return o


def bay_storefront(K):
    o = [K.box("wall", 4.0, 0.25, 3.2, mat=K.get_mat("plaster_warm"))]
    o.append(K.box("base", 4.0, 0.3, 0.9, mat=K.get_mat("stone_pale")))
    o.append(K.box("glass", 3.4, 0.12, 2.1, y=-0.16, z=0.8, mat=K.get_mat_glass("glass_cool")))
    for x in (-1.1, 0.0, 1.1):
        o.append(K.box("mullion", 0.06, 0.18, 2.1, x=x, y=-0.17, z=0.8,
                       mat=K.get_mat("charcoal")))
    o.append(K.box("door", 0.9, 0.12, 2.0, x=1.2, y=-0.14, z=0.0, mat=K.get_mat("timber")))
    o.append(K.box("door-handle", 0.04, 0.04, 0.2, x=0.85, y=-0.21, z=1.0,
                   mat=K.get_mat_metal("metal")))
    o.append(K.box("sign-band", 3.8, 0.12, 0.5, z=3.0, mat=K.get_mat("terracotta")))
    return o


def bay_roller(K):
    o = [K.box("wall", 4.0, 0.25, 3.2, mat=K.get_mat("plaster_warm"))]
    o.append(K.box("base", 4.0, 0.3, 0.9, mat=K.get_mat("stone_pale")))
    o.append(K.box("frame", 3.2, 0.1, 2.6, y=-0.15, z=0.9, mat=K.get_mat("charcoal")))
    o.append(K.box("shutter", 2.9, 0.14, 2.3, y=-0.17, z=0.95, mat=K.get_mat_metal("metal_dark")))
    for z in (1.4, 1.9, 2.4, 2.9):
        o.append(K.box("slat", 2.9, 0.15, 0.03, y=-0.2, z=z, mat=K.get_mat("metal")))
    o.append(K.box("sign-band", 3.8, 0.12, 0.4, z=3.05, mat=K.get_mat("charcoal")))
    return o


def bay_corner(K):
    o = [K.box("wall-a", 4.0, 0.25, 3.2, x=-1.875, y=-0.125, mat=K.get_mat("plaster_warm"))]
    o.append(K.box("wall-b", 0.25, 4.0, 3.2, x=1.875, y=1.875, mat=K.get_mat("plaster_warm")))
    o.append(K.box("pier", 0.34, 0.34, 3.2, x=1.9, y=-0.125, mat=K.get_mat("stone_pale")))
    o.append(K.box("base-a", 4.0, 0.32, 1.0, x=-1.875, y=-0.125, mat=K.get_mat("stone_pale")))
    o.append(K.box("base-b", 0.32, 4.0, 1.0, x=1.875, y=1.875, mat=K.get_mat("stone_pale")))
    o.extend(_window(K, -1.1, 1.75, yoff=-0.26))
    o.extend(_window(K, -2.5, 1.75, yoff=-0.26))
    return o


def bay_curtain(K):
    o = [K.box("wall", 4.0, 0.2, 3.2, mat=K.get_mat("plaster_warm"))]
    o.append(K.box("base", 4.0, 0.3, 0.3, mat=K.get_mat("stone_pale")))
    o.append(K.box("glass", 3.6, 0.1, 2.6, y=-0.15, z=1.6, mat=K.get_mat_glass("glass_cool")))
    for x in (-1.2, 0.0, 1.2):
        o.append(K.box("mullion", 0.06, 0.16, 2.6, x=x, y=-0.16, z=0.3,
                       mat=K.get_mat("charcoal")))
    return o


def portal(K):
    o = [K.box("column-l", 0.3, 0.3, 2.6, x=-1.2, mat=K.get_mat("stone_pale"))]
    o.append(K.box("column-r", 0.3, 0.3, 2.6, x=1.2, mat=K.get_mat("stone_pale")))
    o.append(K.box("lintel", 2.9, 0.35, 0.4, z=2.6, mat=K.get_mat("stone_pale")))
    # raised threshold: two steps up to a 0.24 m door sill
    o.append(K.box("step-2", 2.6, 0.6, 0.12, y=-0.5, z=0.0, mat=K.get_mat("stone_pale")))
    o.append(K.box("step-1", 2.4, 0.35, 0.12, y=-0.35, z=0.12, mat=K.get_mat("stone_pale")))
    o.append(K.box("door", 1.0, 0.1, 2.1, z=0.24, mat=K.get_mat("timber")))
    o.append(K.box("door-rail", 1.0, 0.06, 0.6, z=0.74, mat=K.get_mat("timber_light")))
    o.append(K.box("handle", 0.05, 0.05, 0.3, x=0.4, z=1.29, mat=K.get_mat_metal("metal")))
    return o


def awning(K):
    o = [K.box("bar", 4.0, 0.08, 0.08, z=2.4, mat=K.get_mat_metal("metal_dark"))]
    for i in range(4):
        mat = K.get_mat("mango" if i % 2 else "white")
        o.append(K.box(f"stripe-{i}", 1.0, 1.7, 0.06, x=-1.5 + i * 1.0, y=-0.85, z=2.05,
                       rot=(math.radians(-22), 0, 0), mat=mat))
    for x in (-1.5, -0.5, 0.5, 1.5):
        o.append(K.box("rod", 0.04, 0.04, 0.5, x=x, y=-1.5, z=2.25, rot=(math.radians(-40), 0, 0),
                       mat=K.get_mat_metal("metal_dark")))
    return o


def cornice_band(K):
    o = [K.box("ledge", 4.0, 0.35, 0.12, z=0.25, mat=K.get_mat("stone_pale"))]
    o.append(K.box("frieze", 4.0, 0.25, 0.2, z=0.1, mat=K.get_mat("plaster_warm")))
    for i in range(8):
        o.append(K.box("dentil", 0.15, 0.2, 0.12, x=-1.75 + i * 0.5, z=0.37, mat=K.get_mat("stone_pale")))
    return o


def roof_flat(K):
    o = [K.box("slab", 4.0, 4.0, 0.15, z=0.4, mat=K.get_mat("stone_pale"))]
    for (x, y, w, d) in [(-1.85, 0.0, 0.3, 4.0), (1.85, 0.0, 0.3, 4.0),
                         (0.0, -1.85, 4.0, 0.3), (0.0, 1.85, 4.0, 0.3)]:
        o.append(K.box("parapet", w, d, 0.55, x=x, y=y, z=0.55, mat=K.get_mat("stone_pale")))
        o.append(K.box("cap", w + 0.06, d + 0.06, 0.06, x=x, y=y, z=1.1, mat=K.get_mat("paving_joint")))
    return o


def roof_pitch(K):
    o = []
    for s in (-1, 1):
        o.append(K.box("slope", 4.0, 2.1, 0.1, y=s * 0.85, z=1.15,
                       rot=(math.radians(-s * 24), 0, 0), mat=K.get_mat("terracotta")))
    # gable ends
    import bmesh
    for sx in (-1, 1):
        bm = bmesh.new()
        pts = [bm.verts.new((sx * 2.0, -1.6, 0.0)),
               bm.verts.new((sx * 2.0, 1.6, 0.0)),
               bm.verts.new((sx * 2.0, 0.0, 1.62))]
        bm.faces.new(pts)
        me = bpy.data.meshes.new("gable")
        bm.to_mesh(me)
        bm.free()
        g = bpy.data.objects.new("gable", me)
        bpy.context.scene.collection.objects.link(g)
        g.data.materials.append(K.get_mat("plaster_warm"))
        o.append(g)
    o.append(K.box("ridge", 4.0, 0.15, 0.15, z=1.62, mat=K.get_mat("terracotta")))
    return o


def rooftop_plant(K):
    o = [K.box("ac-1", 0.8, 0.8, 0.5, x=-1.2, z=0.0, mat=K.get_mat_metal("steel"))]
    o.append(K.cyl("fan-1", 0.28, 0.08, verts=10, x=-1.2, z=0.5, mat=K.get_mat("metal_dark")))
    o.append(K.box("ac-2", 0.6, 0.6, 0.45, x=-0.2, z=0.0, mat=K.get_mat_metal("steel")))
    o.append(K.box("duct", 1.2, 0.5, 0.5, x=1.0, z=0.0, mat=K.get_mat_metal("metal")))
    o.append(K.box("duct-cap", 1.3, 0.6, 0.08, x=1.0, z=0.5, mat=K.get_mat("metal_dark")))
    o.append(K.cyl("vent", 0.12, 1.1, verts=8, x=1.7, z=0.0, mat=K.get_mat_metal("steel")))
    o.append(K.cyl("tank", 0.4, 1.3, verts=10, x=-1.8, z=0.0, mat=K.get_mat("white")))
    o.append(K.cyl("tank-cap", 0.42, 0.1, verts=10, x=-1.8, z=1.3, mat=K.get_mat("metal_dark")))
    return o


def exterior_stair(K):
    o = []
    for i in range(6):
        o.append(K.box(f"step-{i}", 0.9, 0.3, 0.08, y=-1.4 + i * 0.35, z=0.35 * i,
                       mat=K.get_mat("metal_dark")))
    o.append(K.box("stringer", 0.06, 2.6, 0.1, y=-0.5, z=0.9,
                   rot=(math.radians(38), 0, 0), mat=K.get_mat("metal_dark")))
    o.append(K.box("rail", 0.04, 2.6, 0.04, y=-0.6, z=1.6,
                   rot=(math.radians(38), 0, 0), mat=K.get_mat_metal("metal")))
    o.append(K.box("landing", 1.4, 0.9, 0.1, y=1.3, z=1.48,
                   mat=K.get_mat("metal_dark")))
    return o


def balcony(K):
    o = [K.box("slab", 1.8, 0.8, 0.12, z=0.0, mat=K.get_mat("stone_pale"))]
    o.append(K.box("rail-f", 1.8, 0.05, 0.9, y=-0.37, z=0.12, mat=K.get_mat_metal("metal")))
    for x in (-0.85, 0.85):
        o.append(K.box("rail-s", 0.05, 0.8, 0.9, x=x, z=0.12, mat=K.get_mat_metal("metal")))
    o.append(K.box("rail-top", 1.8, 0.85, 0.05, z=1.0, mat=K.get_mat_metal("metal")))
    o.append(K.box("door", 0.9, 0.08, 2.0, y=0.3, z=0.0, mat=K.get_mat_glass("glass_dark")))
    o.append(K.box("door-frame", 1.0, 0.06, 2.1, y=0.35, z=0.0, mat=K.get_mat("charcoal")))
    return o


def setback_adapter(K):
    o = [K.box("platform", 2.0, 2.0, 0.3, mat=K.get_mat("stone_pale"))]
    o.append(K.box("edge", 2.1, 2.1, 0.08, z=0.3, mat=K.get_mat("paving_joint")))
    return o


SPECS = [
    ("arch.plinth", plinth, "arch", (4.3, 4.3, 0.8)),
    ("arch.bay-solid", bay_solid, "arch", (4.3, 0.8, 3.4)),
    ("arch.bay-window", bay_window, "arch", (4.3, 0.8, 3.4)),
    ("arch.bay-corner", bay_corner, "arch", (6.2, 4.3, 3.4)),
    ("arch.bay-curtain", bay_curtain, "arch", (4.3, 0.8, 4.4)),
    ("arch.bay-storefront", bay_storefront, "arch", (4.3, 0.8, 3.7)),
    ("arch.bay-roller", bay_roller, "arch", (4.3, 0.8, 3.7)),
    ("arch.portal", portal, "arch", (3.3, 1.6, 3.0)),
    ("arch.awning", awning, "arch", (4.3, 2.2, 2.7)),
    ("arch.cornice-band", cornice_band, "arch", (4.3, 0.6, 0.7)),
    ("arch.roof-flat", roof_flat, "arch", (4.5, 4.5, 1.3)),
    ("arch.roof-pitch", roof_pitch, "arch", (4.2, 3.9, 1.9)),
    ("arch.rooftop-plant", rooftop_plant, "arch", (4.4, 4.4, 1.6)),
    ("arch.exterior-stair", exterior_stair, "arch", (1.8, 3.4, 2.8)),
    ("arch.balcony", balcony, "arch", (2.1, 1.3, 2.3)),
    ("arch.setback-adapter", setback_adapter, "arch", (2.4, 2.4, 0.5)),
]


def build(lib):
    reports = []
    for i, (fid, fn, cat) in enumerate(SPECS):
        rep, obj = lib.family(fid, fn, cat, lib)
        reports.append(rep)
        lib.shelf_add(obj, i + 61)
    lib.clear_stage()
    lib._REPORTS.extend(reports)
    return reports
