"""stage12_wild.py — wild terrain families (R048.13).

Grid: 4 m module. Wild terrain composes with the seeded hydrology:
shoreline, bank, river-bend and vegetation-density modules, not opaque
water volumes. Wild terrain stays outside the serviced basin.
"""
import math


def _tree(K, x, y, kind, z=0.3, s=1.0):
    """Low-poly tree: trunk + icosphere crown (kind: broadleaf/conifer/palm)."""
    o = []
    if kind == "conifer":
        o.append(K.cyl("trunk", 0.18 * s, 1.2 * s, verts=6, x=x, y=y, z=z,
                       mat=K.get_mat("palm_trunk")))
        for i, (rr, zz) in enumerate([(1.5, 1.1), (1.15, 2.1), (0.75, 3.0)]):
            o.append(K.cone(f"tier{i}", rr * s, 1.5 * s, verts=8, x=x, y=y,
                            z=z + zz * s, mat=K.get_mat("leaf_dark")))
    elif kind == "palm":
        o.append(K.cyl("trunk", 0.22 * s, 4.2 * s, verts=6, x=x, y=y, z=z,
                       mat=K.get_mat("palm_trunk")))
        for a in range(5):
            ang = a * math.tau / 5 + 0.3
            o.append(K.cone("frond", 0.5 * s, 2.2 * s, verts=4,
                            x=x + math.cos(ang) * 1.0 * s, y=y + math.sin(ang) * 1.0 * s,
                            z=z + 4.4 * s, rot=(0, 0, ang),
                            mat=K.get_mat("leaf")))
        o.append(K.ico("crown", 0.9 * s, x=x, y=y, z=z + 4.6 * s,
                       mat=K.get_mat("leaf"), detail=1))
    else:  # broadleaf
        o.append(K.cyl("trunk", 0.22 * s, 2.2 * s, verts=6, x=x, y=y, z=z,
                       mat=K.get_mat("palm_trunk")))
        o.append(K.ico("crown", 1.7 * s, x=x, y=y, z=z + 2.9 * s,
                       mat=K.get_mat("leaf" if s > 0.9 else "leaf_dark"), detail=1))
        o.append(K.ico("crown2", 1.1 * s, x=x + 0.7 * s, y=y - 0.5 * s,
                       z=z + 2.6 * s, mat=K.get_mat("leaf_dark"), detail=1))
    return o


def _shrub(K, x, y, z=0.3, s=1.0):
    return [K.ico("shrub", 0.7 * s, x=x, y=y, z=z + 0.5 * s, mat=K.get_mat("leaf_dark"),
                  detail=1)]


def _rock(K, x, y, z=0.3, s=1.0, mat="stone_pale"):
    return [K.ico("rock", 0.8 * s, x=x, y=y, z=z + 0.4 * s, mat=K.get_mat(mat),
                  detail=1)]


def wild_forest(K):
    o = [K.box("ground", 24.0, 20.0, 0.3, mat=K.get_mat("grass"))]
    o.append(K.box("clearing", 5.0, 4.0, 0.06, x=2.0, y=-2.0, z=0.3,
                   mat=K.get_mat("leaf_dark")))
    # dense canopy: conifers + broadleaf, no grid
    spots = [(-9.0, -6.5, "conifer", 1.1), (-5.5, -7.5, "broadleaf", 1.0),
             (-1.5, -6.0, "conifer", 0.9), (3.5, -7.0, "conifer", 1.2),
             (8.0, -6.5, "broadleaf", 1.1), (9.5, -3.0, "conifer", 0.9),
             (-9.5, -1.0, "broadleaf", 1.2), (-7.0, 2.5, "conifer", 1.0),
             (-3.0, 4.5, "conifer", 1.15), (1.0, 5.5, "broadleaf", 0.95),
             (5.5, 4.0, "conifer", 1.05), (9.0, 0.5, "conifer", 1.0),
             (-1.0, 1.0, "broadleaf", 0.8)]
    for (x, y, kind, s) in spots:
        o += _tree(K, x, y, kind, s=s)
    for (x, y) in [(-8.0, 4.0), (-4.5, -3.5), (0.5, -1.5), (4.0, 1.0), (7.5, -1.5)]:
        o += _shrub(K, x, y, s=0.9)
    return o


def wild_lake(K):
    o = [K.box("bank", 22.0, 22.0, 0.3, mat=K.get_mat("grass"))]
    # water basin: shallow disc (engine composes with seeded hydrology)
    o.append(K.cyl("water", 8.5, 0.16, verts=16, z=0.3, mat=K.get_mat_glass("sea")))
    # shoreline rocks + grass tufts around the edge
    for i in range(9):
        ang = i * math.tau / 9 + 0.35
        r = 9.2
        x, y = math.cos(ang) * r, math.sin(ang) * r * 0.9
        if i % 3 == 0:
            o += _rock(K, x, y, s=0.9)
        else:
            o += _shrub(K, x, y, s=1.1)
    # bank trees on the far side
    o += _tree(K, -7.5, 8.0, "broadleaf", s=1.0)
    o += _tree(K, 7.0, 8.5, "conifer", s=1.0)
    o += _shrub(K, -3.0, 9.5, s=1.0)
    return o


def wild_river(K):
    o = [K.box("bank", 24.0, 16.0, 0.3, mat=K.get_mat("grass"))]
    # river bend: water strip following an S-curve, then banks either side
    pts = [(-11.0, -4.0, 35), (-6.5, -2.5, 25), (-1.5, -1.0, 0),
           (3.0, 1.0, -25), (8.0, 3.5, -35), (12.0, 5.5, -35)]
    for i, (px, py, rot) in enumerate(pts[:-1]):
        qx = (px + pts[i + 1][0]) / 2
        qy = (py + pts[i + 1][1]) / 2
        o.append(K.box("water", 4.6, 2.4, 0.14, x=qx, y=qy, z=0.3,
                       rot=(0, 0, math.radians(rot)), mat=K.get_mat_glass("sea")))
    # bank edging
    for i, (px, py, rot) in enumerate(pts):
        o.append(K.box("bank-edge", 4.0, 0.8, 0.18, x=px, y=py + 1.6, z=0.3,
                       rot=(0, 0, math.radians(rot)), mat=K.get_mat("sand")))
        o.append(K.box("bank-edge", 4.0, 0.8, 0.18, x=px, y=py - 1.6, z=0.3,
                       rot=(0, 0, math.radians(rot)), mat=K.get_mat("sand")))
    # reeds + log crossing
    for (rx, ry) in [(-8.5, -2.2), (-2.0, -3.2), (2.5, 3.2), (7.0, 1.5), (10.5, 4.5)]:
        for k in range(3):
            o.append(K.cone("reed", 0.05, 1.1 + 0.2 * k, verts=5,
                            x=rx + 0.25 * k, y=ry + 0.2 * k, z=0.3,
                            mat=K.get_mat("leaf_dark")))
    o.append(K.cyl("log", 0.28, 4.4, verts=8, x=0.0, y=0.0, z=0.75,
                   rot=(0, math.radians(90), 0), mat=K.get_mat("timber_dark")))
    for (lx, ly) in [(-2.0, -1.0), (2.0, 1.0)]:
        o.append(K.cyl("log-post", 0.14, 0.7, verts=6, x=lx, y=ly, z=0.3,
                       mat=K.get_mat("timber")))
    # far-bank trees
    o += _tree(K, -9.0, 5.5, "broadleaf", s=1.0)
    o += _tree(K, 9.5, -5.0, "conifer", s=1.0)
    o += _shrub(K, -4.0, 5.5, s=1.0)
    o += _rock(K, 5.5, 5.8, s=0.8)
    return o


def wild_desert(K):
    o = [K.box("sand-base", 24.0, 20.0, 0.3, mat=K.get_mat("sand"))]
    # dunes: overlapping raised pads
    for (dx, dy, dw, dd, dh) in [(-6.0, -4.0, 9.0, 7.0, 1.2), (5.0, -5.0, 8.0, 6.0, 0.9),
                                 (7.0, 5.0, 9.0, 7.0, 1.4), (-7.0, 6.0, 8.0, 6.0, 0.8),
                                 (0.0, 0.5, 7.0, 5.0, 0.5)]:
        o.append(K.box("dune", dw, dd, dh, x=dx, y=dy, z=0.3, mat=K.get_mat("sand")))
    # dry wash: pale strip
    o.append(K.box("wash", 16.0, 1.6, 0.12, x=-1.0, y=-1.0, z=0.3,
                   rot=(0, 0, math.radians(12)), mat=K.get_mat("paving")))
    # dry brush + rocks
    for (bx, by) in [(-8.0, 2.0), (-2.5, -6.0), (3.0, -3.5), (9.0, 1.0), (-4.0, 7.0),
                     (6.0, 7.5)]:
        for k in range(3):
            o.append(K.cone("dry-brush", 0.35, 0.9 + 0.15 * k, verts=6,
                            x=bx + 0.4 * k, y=by, z=0.3,
                            mat=K.get_mat("leaf_dark") if k % 2 == 0 else K.get_mat("timber")))
    o += _rock(K, -1.5, 3.0, s=1.1, mat="stone_pale")
    o += _rock(K, 2.0, 5.5, s=0.7, mat="charcoal")
    o += _rock(K, 8.0, -2.0, s=0.9, mat="stone_pale")
    return o


def wild_jungle(K):
    o = [K.box("ground", 24.0, 20.0, 0.3, mat=K.get_mat("leaf_dark"))]
    # palms + dense broadleaf, layered canopies
    spots = [(-9.0, -6.0, "palm", 1.1), (-4.5, -7.0, "broadleaf", 1.2),
             (0.5, -5.5, "palm", 0.95), (5.5, -7.0, "broadleaf", 1.1),
             (9.5, -4.0, "palm", 1.05), (-9.5, 1.0, "broadleaf", 1.15),
             (-5.0, 3.5, "palm", 1.0), (0.0, 2.0, "broadleaf", 1.25),
             (5.0, 4.5, "palm", 1.15), (9.0, 1.5, "broadleaf", 1.0),
             (3.0, -1.5, "broadleaf", 0.9), (-2.0, -2.0, "palm", 0.9)]
    for (x, y, kind, s) in spots:
        o += _tree(K, x, y, kind, s=s)
    # fern clusters: small cone tufts
    for (fx, fy) in [(-7.0, 5.5), (-1.5, 6.5), (3.5, 7.0), (7.5, 6.0), (1.0, 0.0),
                     (-4.0, 0.5)]:
        for k in range(4):
            o.append(K.cone("fern", 0.5, 0.7 + 0.2 * k, verts=5,
                            x=fx + 0.5 * k, y=fy + 0.2 * k, z=0.3,
                            mat=K.get_mat("leaf")))
    o += _rock(K, 6.5, -2.5, s=1.0)
    return o


def recreational_lake(K):
    o = [K.box("bank", 26.0, 22.0, 0.3, mat=K.get_mat("grass"))]
    o.append(K.cyl("water", 9.0, 0.16, verts=16, z=0.3, mat=K.get_mat_glass("sea")))
    # beach arc on the -y shore
    for i in range(5):
        ang = math.pi * (0.35 + i * 0.12)
        x, y = math.cos(ang) * 9.6, math.sin(ang) * 9.6
        o.append(K.box("beach", 3.2, 2.2, 0.12, x=x, y=y, z=0.3,
                       rot=(0, 0, -ang), mat=K.get_mat("sand")))
    # timber pier out into the water
    o.append(K.box("pier-deck", 3.0, 7.0, 0.25, x=0.0, y=-10.5, z=0.9,
                   mat=K.get_mat("timber")))
    for px in (-1.2, 1.2):
        for py in (-9.0, -11.5, -13.5):
            o.append(K.cyl("pier-post", 0.12, 1.2, verts=6, x=px, y=py, z=0.3,
                           mat=K.get_mat("timber_dark")))
    o.append(K.box("pier-deck", 3.0, 3.0, 0.25, x=0.0, y=-14.5, z=1.1,
                   mat=K.get_mat("timber")))
    # palms + bench on the shore
    o += _tree(K, -8.0, -8.5, "palm", s=1.0)
    o += _tree(K, 8.5, -8.0, "palm", s=0.95)
    o += _shrub(K, -5.0, -10.0, s=1.0)
    o.append(K.box("bench", 1.8, 0.5, 0.45, x=5.5, y=-10.5, z=0.3,
                   rot=(0, 0, math.radians(-20)), mat=K.get_mat("timber")))
    o.append(K.box("bench-back", 1.8, 0.1, 0.5, x=5.5, y=-10.5, z=0.85,
                   rot=(0, 0, math.radians(-20)), mat=K.get_mat("timber")))
    return o


SPECS = [
    ("landscape.wild-forest", wild_forest, "landscape", (24.5, 20.5, 7.5)),
    ("landscape.wild-lake", wild_lake, "landscape", (22.5, 22.5, 6.5)),
    ("landscape.wild-river", wild_river, "landscape", (27.5, 17.5, 5.5)),
    ("landscape.wild-desert", wild_desert, "landscape", (24.5, 20.5, 2.5)),
    ("landscape.wild-jungle", wild_jungle, "landscape", (24.5, 20.5, 10.5)),
    ("landscape.recreational-lake", recreational_lake, "landscape", (26.5, 28.0, 9.5)),
]


def build(lib):
    reports = []
    for entry in SPECS:
        fid, fn, cat, expect = entry
        rep, obj = lib.family(fid, fn, cat, lib, expect=expect)
        reports.append(rep)
        lib.shelf_add(obj, cat)
    return reports
