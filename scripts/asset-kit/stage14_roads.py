"""stage14_roads.py — advanced road classes (R048.15) + yield sign.

Highway classes, country/dirt/one-way/asymmetric lanes, boulevard,
elevated viaduct, flyover ramp, stacked interchange, rail track,
runway, roundabout and plaza tile. Road surface stack: asphalt top
0.12 m (T); elevated decks sit on piers; markings are 0.012 m thin
boxes at z=T. Tiles are 10 m long on the module grid unless the
class needs a wider section.
"""
import math

import bpy

T = 0.12
LEN = 10.0


def _ring_pts(inner, outer, n=28):
    pts = []
    for i in range(n + 1):
        a = math.tau * i / n
        pts.append((math.cos(a) * outer, math.sin(a) * outer))
    for i in range(n, -1, -1):
        a = math.tau * i / n
        pts.append((math.cos(a) * inner, math.sin(a) * inner))
    return pts


def _arc_pts(inner, outer, a0, a1, n=10):
    pts = []
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n
        pts.append((math.cos(a) * inner, math.sin(a) * inner))
    for i in range(n, -1, -1):
        a = a0 + (a1 - a0) * i / n
        pts.append((math.cos(a) * outer, math.sin(a) * outer))
    return pts


def _arrows(K, y, z=T, n=2, mat="white"):
    o = []
    for i in range(n):
        yy = y + i * 4.0
        o.append(K.box("arrow-shaft", 0.25, 1.6, 0.012, y=yy, z=z, mat=K.get_mat(mat)))
        for s in (-1, 1):
            o.append(K.box("arrow-wing", 0.5, 0.5, 0.012, x=s * 0.3, y=yy + 1.0,
                           z=z, rot=(0, 0, math.radians(45 * s)), mat=K.get_mat(mat)))
    return o


def highway_4(K):
    w = 15.0
    o = [K.box("asphalt", w, LEN, T, mat=K.get_mat("asphalt"))]
    for x in (-3.5, 0.0, 3.5):
        for y in (-4.0, 0.4, 4.0):
            o.append(K.box("dash", 0.12, 1.5, 0.012, x=x, y=y, z=T,
                           mat=K.get_mat("white")))
    o.append(K.box("center-l", 0.09, LEN - 0.4, 0.012, x=-0.18, z=T,
                   mat=K.get_mat("white")))
    o.append(K.box("center-r", 0.09, LEN - 0.4, 0.012, x=0.18, z=T,
                   mat=K.get_mat("white")))
    for x in (-w / 2 + 0.15, w / 2 - 0.15):
        o.append(K.box("edge", 0.08, LEN - 0.5, 0.012, x=x, z=T,
                       mat=K.get_mat("white")))
    return o


def highway_6(K):
    w = 21.0
    o = [K.box("asphalt", w, LEN, T, mat=K.get_mat("asphalt"))]
    for x in (-5.25, -1.75, 1.75, 5.25):
        for y in (-4.0, 0.4, 4.0):
            o.append(K.box("dash", 0.12, 1.5, 0.012, x=x, y=y, z=T,
                           mat=K.get_mat("white")))
    o.append(K.box("center-l", 0.09, LEN - 0.4, 0.012, x=-0.18, z=T,
                   mat=K.get_mat("white")))
    o.append(K.box("center-r", 0.09, LEN - 0.4, 0.012, x=0.18, z=T,
                   mat=K.get_mat("white")))
    for x in (-w / 2 + 0.15, w / 2 - 0.15):
        o.append(K.box("edge", 0.08, LEN - 0.5, 0.012, x=x, z=T,
                       mat=K.get_mat("white")))
    return o


def highway_8(K):
    w = 27.0
    o = [K.box("asphalt", w, LEN, T, mat=K.get_mat("asphalt"))]
    for x in (-7.0, -3.5, 3.5, 7.0):
        for y in (-4.0, 0.4, 4.0):
            o.append(K.box("dash", 0.12, 1.5, 0.012, x=x, y=y, z=T,
                           mat=K.get_mat("white")))
    # raised median barrier
    o.append(K.box("barrier", 0.35, LEN, 0.9, z=T, mat=K.get_mat("metal_dark")))
    for x in (-w / 2 + 0.15, w / 2 - 0.15):
        o.append(K.box("edge", 0.08, LEN - 0.5, 0.012, x=x, z=T,
                       mat=K.get_mat("white")))
    return o


def toll_portal(K):
    w = 15.0
    o = [K.box("asphalt", w, LEN, T, mat=K.get_mat("asphalt"))]
    for x in (-3.5, 3.5):
        for y in (-4.0, 0.4, 4.0):
            o.append(K.box("dash", 0.12, 1.5, 0.012, x=x, y=y, z=T,
                           mat=K.get_mat("white")))
    # booths
    for x in (-5.25, 0.0, 5.25):
        o.append(K.box("booth", 1.6, 2.4, 2.2, x=x, z=T, mat=K.get_mat("offwhite")))
        o.append(K.box("booth-glass", 1.2, 0.12, 1.2, x=x, y=-1.0, z=0.6,
                       mat=K.get_mat_glass("glass_cool")))
        o.append(K.box("canopy", 2.0, 2.8, 0.12, x=x, y=-0.2, z=2.35,
                       mat=K.get_mat("offwhite")))
    # overhead beam + posts
    o.append(K.box("beam", w, 0.6, 0.35, z=3.6, mat=K.get_mat_metal("steel")))
    for x in (-w / 2 + 0.4, w / 2 - 0.4):
        o.append(K.box("post", 0.4, 0.4, 3.5, x=x, z=T, mat=K.get_mat_metal("steel")))
    return o


def country_2(K):
    w = 7.0
    o = [K.box("verge-l", w / 2 + 1.5, LEN, 0.08, x=-(w / 2 + 0.75), mat=K.get_mat("grass"))]
    o.append(K.box("verge-r", w / 2 + 1.5, LEN, 0.08, x=w / 2 + 0.75, mat=K.get_mat("grass")))
    o.append(K.box("asphalt", w, LEN, T, mat=K.get_mat("asphalt")))
    for y in (-4.0, 0.4, 4.0):
        o.append(K.box("dash", 0.12, 1.5, 0.012, y=y, z=T, mat=K.get_mat("white")))
    return o


def dirt_road(K):
    w = 6.0
    o = [K.box("shoulder", w + 2.0, LEN, 0.06, mat=K.get_mat("grass"))]
    o.append(K.box("dirt", w, LEN, T, mat=K.get_mat("sand")))
    # wheel ruts
    for x in (-1.3, 1.3):
        o.append(K.box("rut", 0.5, LEN - 0.4, 0.03, x=x, z=T + 0.005,
                       mat=K.get_mat("paving_joint")))
    # worn centre patch
    o.append(K.box("centre", w - 2.4, 4.0, 0.035, z=T + 0.005,
                   mat=K.get_mat("paving_joint")))
    return o


def one_way_2(K):
    w = 9.0
    o = [K.box("asphalt", w, LEN, T, mat=K.get_mat("asphalt"))]
    for y in (-4.0, 0.4, 4.0):
        o.append(K.box("dash", 0.12, 1.5, 0.012, y=y, z=T, mat=K.get_mat("white")))
    for x in (-w / 2 + 0.15, w / 2 - 0.15):
        o.append(K.box("edge", 0.08, LEN - 0.5, 0.012, x=x, z=T,
                       mat=K.get_mat("white")))
    o += _arrows(K, -3.0, n=2)
    return o


def asymmetric_32(K):
    w = 20.0
    o = [K.box("asphalt", w, LEN, T, mat=K.get_mat("asphalt"))]
    # solid centre: 3 lanes left, 2 right
    o.append(K.box("centre", 0.12, LEN - 0.4, 0.012, z=T, mat=K.get_mat("white")))
    for x in (-6.67, -3.33, 3.33):
        for y in (-4.0, 0.4, 4.0):
            o.append(K.box("dash", 0.12, 1.5, 0.012, x=x, y=y, z=T,
                           mat=K.get_mat("white")))
    for x in (-w / 2 + 0.15, w / 2 - 0.15):
        o.append(K.box("edge", 0.08, LEN - 0.5, 0.012, x=x, z=T,
                       mat=K.get_mat("white")))
    return o


def boulevard_tree(K):
    w = 14.0
    o = [K.box("asphalt", w, LEN, T, mat=K.get_mat("asphalt"))]
    for x in (-3.5, 3.5):
        for y in (-4.0, 0.4, 4.0):
            o.append(K.box("dash", 0.12, 1.5, 0.012, x=x, y=y, z=T,
                           mat=K.get_mat("white")))
    # green median
    o.append(K.box("median", 4.0, LEN, 0.16, z=T - 0.02, mat=K.get_mat("grass")))
    for y in (-4.0, 0.0, 4.0):
        o.append(K.cyl("trunk", 0.18, 1.6, verts=6, y=y, z=T + 0.14,
                       mat=K.get_mat("palm_trunk")))
        o.append(K.ico("crown", 1.5, y=y, z=T + 2.6, mat=K.get_mat("leaf"), detail=1))
    for x in (-2.05, 2.05):
        o.append(K.box("curb", 0.15, LEN, 0.3, x=x, z=0.0, mat=K.get_mat("paving")))
    return o


def viaduct_elevated(K):
    o = []
    for x in (-3.5, 3.5):
        for y in (-3.0, 3.0):
            o.append(K.box("pier", 1.4, 1.4, 3.8, x=x, y=y, mat=K.get_mat("stone_pale")))
    o.append(K.box("deck", LEN, 8.0, 0.25, z=3.8, mat=K.get_mat("asphalt")))
    for y in (-3.9, 3.9):
        o.append(K.box("guard", LEN, 0.18, 0.8, y=y, z=4.05,
                       mat=K.get_mat_metal("steel")))
    for x in (-4.0, 0.4, 4.0):
        o.append(K.box("dash", 0.12, 1.5, 0.012, x=x, z=4.06, mat=K.get_mat("white")))
    return o


def flyover_ramp(K):
    o = [K.prism("deck", _arc_pts(8.0, 14.0, 0.0, math.pi / 2), 0.25, z=3.2,
                 mat=K.get_mat("asphalt"))]
    # guardrail along the inner edge
    o.append(K.prism("guard", _arc_pts(8.0, 8.2, 0.1, math.pi / 2 - 0.1, 10), 0.7,
                     z=3.45, mat=K.get_mat_metal("steel")))
    # outer curb
    o.append(K.prism("curb", _arc_pts(13.7, 14.0, 0.1, math.pi / 2 - 0.1, 10), 0.3,
                     z=3.45, mat=K.get_mat("paving")))
    # supporting piers at the arc ends
    for (px, py) in ((14.0, 0.7), (0.7, 14.0)):
        o.append(K.box("pier", 1.2, 1.2, 3.2, x=px, y=py, mat=K.get_mat("stone_pale")))
    return o


def interchange_double(K):
    o = []
    # lower road, running in X
    o.append(K.box("road-lower", 20.0, 12.0, T, mat=K.get_mat("asphalt")))
    for x in (-7.5, 7.5):
        for y in (-4.0, 0.4, 4.0):
            o.append(K.box("dash", 0.12, 1.5, 0.012, x=x, y=y, z=T,
                           mat=K.get_mat("white")))
    # upper crossing road, running in Y, on piers
    o.append(K.box("road-upper", 12.0, 20.0, 0.25, z=3.4, mat=K.get_mat("asphalt")))
    for x in (-4.5, 0.0, 4.5):
        for y in (-7.0, -2.5, 2.0, 6.5):
            o.append(K.box("dash-u", 0.12, 1.5, 0.012, x=x, y=y, z=3.66,
                           mat=K.get_mat("white")))
    for (px, py) in ((-5.5, -5.5), (-5.5, 5.5), (5.5, -5.5), (5.5, 5.5)):
        o.append(K.box("pier", 1.3, 1.3, 3.4, x=px, y=py, mat=K.get_mat("stone_pale")))
    for x in (-5.9, 5.9):
        o.append(K.box("guard", 0.18, 20.0, 0.8, x=x, z=3.65,
                       mat=K.get_mat_metal("steel")))
    return o


def rail_track(K):
    o = [K.box("ballast", 4.0, LEN, 0.15, mat=K.get_mat("paving_joint"))]
    # sleepers
    for y in range(-5, 5):
        o.append(K.box("sleeper", 3.2, 0.25, 0.08, y=y * 0.5, z=0.15,
                       mat=K.get_mat("timber_dark")))
    # rails
    for x in (-0.75, 0.75):
        o.append(K.box("rail", 0.09, LEN, 0.1, x=x, z=0.23,
                       mat=K.get_mat_metal("steel")))
    return o


def runway(K):
    w = 24.0
    o = [K.box("surface", w, 30.0, T, mat=K.get_mat("asphalt"))]
    # dashed centreline
    for y in range(-13, 14, 4):
        o.append(K.box("center", 0.5, 2.2, 0.015, y=y, z=T, mat=K.get_mat("white")))
    # threshold ticks
    for x in (-9.0, -6.0, -3.0, 0.0, 3.0, 6.0, 9.0):
        o.append(K.box("tick", 1.2, 1.6, 0.015, x=x, y=-13.5, z=T,
                       mat=K.get_mat("white")))
    for x in (-9.0, -6.0, -3.0, 0.0, 3.0, 6.0, 9.0):
        o.append(K.box("tick2", 1.2, 1.6, 0.015, x=x, y=13.5, z=T,
                       mat=K.get_mat("white")))
    # edge lights: small white cubes
    for x in (-w / 2 + 0.5, w / 2 - 0.5):
        for y in range(-14, 15, 4):
            o.append(K.box("edgelight", 0.18, 0.18, 0.18, x=x, y=y, z=T,
                           mat=K.get_mat("window_warm")))
    return o


def roundabout(K):
    o = [K.prism("ring", _ring_pts(4.5, 8.0), T, mat=K.get_mat("asphalt"))]
    # island
    o.append(K.cyl("island", 4.5, 0.14, verts=16, mat=K.get_mat("grass")))
    o.append(K.box("monument", 1.2, 1.2, 0.9, mat=K.get_mat("stone_pale")))
    o.append(K.ico("monument-top", 0.8, z=0.9, mat=K.get_mat("stone_pale"), detail=1))
    for (sx, sy) in ((-2.6, -2.2), (2.8, -2.4), (-2.9, 2.3), (2.5, 2.6)):
        o.append(K.ico("island-shrub", 0.6, x=sx, y=sy, z=0.74,
                       mat=K.get_mat("leaf_dark"), detail=1))
    # four approach stubs joining the ring to the tile edges
    o.append(K.box("approach-n", 6.0, 2.0, T, x=0.0, y=9.0, z=0.0, mat=K.get_mat("asphalt")))
    o.append(K.box("approach-s", 6.0, 2.0, T, x=0.0, y=-9.0, z=0.0, mat=K.get_mat("asphalt")))
    o.append(K.box("approach-e", 2.0, 6.0, T, x=9.0, y=0.0, z=0.0, mat=K.get_mat("asphalt")))
    o.append(K.box("approach-w", 2.0, 6.0, T, x=-9.0, y=0.0, z=0.0, mat=K.get_mat("asphalt")))
    # yield dashes across each approach, just outside the ring
    for d in (-1.8, 0.0, 1.8):
        o.append(K.box("yd-n", 1.1, 0.15, 0.012, x=d, y=8.55, z=T, mat=K.get_mat("white")))
        o.append(K.box("yd-s", 1.1, 0.15, 0.012, x=d, y=-8.55, z=T, mat=K.get_mat("white")))
        o.append(K.box("yd-e", 0.15, 1.1, 0.012, x=8.55, y=d, z=T, mat=K.get_mat("white")))
        o.append(K.box("yd-w", 0.15, 1.1, 0.012, x=-8.55, y=d, z=T, mat=K.get_mat("white")))
    return o


def plaza_tile(K):
    o = [K.box("pavers", 10.0, 10.0, 0.08, mat=K.get_mat("paving"))]
    # joint grid
    for y in (-5.0, -2.5, 0.0, 2.5, 5.0):
        o.append(K.box("joint-h", 10.0, 0.08, 0.09, y=y, z=0.0,
                       mat=K.get_mat("paving_joint")))
    for x in (-5.0, -2.5, 0.0, 2.5, 5.0):
        o.append(K.box("joint-v", 0.08, 10.0, 0.09, x=x, z=0.0,
                       mat=K.get_mat("paving_joint")))
    # tree planter in the corner
    o.append(K.box("planter", 2.0, 2.0, 0.4, x=3.5, y=3.5, z=0.08,
                   mat=K.get_mat("stone_pale")))
    o.append(K.cyl("trunk", 0.2, 2.0, verts=6, x=3.5, y=3.5, z=0.45,
                   mat=K.get_mat("palm_trunk")))
    o.append(K.ico("crown", 1.4, x=3.5, y=3.5, z=2.4, mat=K.get_mat("leaf"), detail=1))
    return o


def yield_sign(K):
    o = [K.cyl("post", 0.05, 1.9, verts=6, mat=K.get_mat_metal("steel"))]
    # inverted triangle: red panel with white inset
    import bmesh
    for (size, mat, dy) in ((0.75, "red_paint", 0.0), (0.62, "white", 0.012)):
        bm = bmesh.new()
        pts = [bm.verts.new((-size, 0.35 * size - dy, 0.0)),
               bm.verts.new((size, 0.35 * size - dy, 0.0)),
               bm.verts.new((0.0, -0.72 * size - dy, 0.0))]
        bm.faces.new(pts)
        me = bpy.data.meshes.new("yield-panel")
        bm.to_mesh(me)
        bm.free()
        g = bpy.data.objects.new("yield-panel", me)
        bpy.context.scene.collection.objects.link(g)
        g.data.materials.append(K.get_mat(mat))
        g.location = (0.0, 0.0, 1.45)
        o.append(g)
    return o


SPECS = [
    ("road.highway-4", highway_4, "road", (15.2, 10.2, 0.2)),
    ("road.highway-6", highway_6, "road", (21.2, 10.2, 0.2)),
    ("road.highway-8", highway_8, "road", (27.2, 10.2, 1.1)),
    ("road.toll-portal", toll_portal, "road", (15.2, 10.2, 4.0)),
    ("road.country-2", country_2, "road", (13.6, 10.2, 0.2)),
    ("road.dirt-road", dirt_road, "road", (8.2, 10.2, 0.2)),
    ("road.one-way-2", one_way_2, "road", (9.2, 10.2, 0.2)),
    ("road.asymmetric-32", asymmetric_32, "road", (20.2, 10.2, 0.2)),
    ("road.boulevard-tree", boulevard_tree, "road", (14.2, 11.1, 4.3)),
    ("road.viaduct-elevated", viaduct_elevated, "road", (10.2, 8.3, 4.9)),
    ("road.flyover-ramp", flyover_ramp, "road", (14.7, 14.7, 4.2)),
    ("road.interchange-double", interchange_double, "road", (20.3, 20.3, 4.5)),
    ("road.rail-track", rail_track, "road", (4.2, 10.2, 0.35)),
    ("road.runway", runway, "road", (24.2, 30.2, 0.3)),
    ("road.roundabout", roundabout, "road", (20.2, 20.2, 1.8)),
    ("road.plaza-tile", plaza_tile, "road", (10.2, 10.2, 3.9)),
    ("prop.yield-sign", yield_sign, "prop", (1.6, 0.6, 2.0)),
]


def build(lib):
    reports = []
    for entry in SPECS:
        fid, fn, cat, expect = entry
        rep, obj = lib.family(fid, fn, cat, lib, expect=expect)
        reports.append(rep)
        lib.shelf_add(obj, cat)
    return reports
