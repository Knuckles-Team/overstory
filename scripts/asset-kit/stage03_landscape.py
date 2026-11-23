"""stage03_landscape.py — vegetation and shoreline dressing (families 52-58)."""
import math

import bpy


def broadleaf(K):
    o = [K.cyl("trunk", 0.14, 2.2, verts=7, z=0.0, r2=0.19, mat=K.get_mat("palm_trunk"))]
    o.append(K.ico("canopy-a", 1.15, x=0.0, z=3.3, mat=K.get_mat("leaf")))
    o.append(K.ico("canopy-b", 0.85, x=0.8, y=0.3, z=2.9, mat=K.get_mat("leaf")))
    o.append(K.ico("canopy-c", 0.8, x=-0.75, y=-0.35, z=2.85, mat=K.get_mat("leaf_dark")))
    o.append(K.ico("canopy-d", 0.7, x=0.2, y=-0.85, z=3.1, mat=K.get_mat("leaf")))
    o.append(K.ico("canopy-e", 0.6, x=-0.3, y=0.7, z=3.5, mat=K.get_mat("leaf_dark")))
    return o


def palm(K):
    o = []
    # segmented leaning trunk
    seg_h = 0.85
    for i in range(4):
        tilt = math.radians(3 * i)
        x = 0.09 * i * i * 0.4
        o.append(K.cyl(f"trunk-{i}", 0.16 - i * 0.015, seg_h, verts=7,
                       z=i * seg_h, x=x, rot=(0, tilt, 0), r2=0.19 - i * 0.015, mat=K.get_mat("palm_trunk")))
    top = (0.35, 3.4)
    # fronds
    for i in range(6):
        a = i / 6 * 2 * math.pi
        o.append(K.ico(f"frond-{i}", 0.75, x=top[0] + math.cos(a) * 0.75, y=math.sin(a) * 0.75,
                       z=top[1] + 0.1, mat=K.get_mat("leaf_dark"), detail=0))
    o.append(K.ico("crown", 0.5, x=top[0], z=top[1] + 0.25, mat=K.get_mat("leaf"), detail=0))
    for i in range(3):
        o.append(K.ico("coco", 0.07, x=top[0] + 0.1 * i, z=top[1] - 0.15, mat=K.get_mat("timber"), detail=0))
    return o


def conifer(K):
    o = [K.cyl("trunk", 0.1, 0.8, verts=6, mat=K.get_mat("palm_trunk"))]
    o.append(K.cone("tier-1", 1.0, 1.5, verts=8, z=0.5, mat=K.get_mat("leaf_dark")))
    o.append(K.cone("tier-2", 0.75, 1.3, verts=8, z=1.7, mat=K.get_mat("leaf")))
    o.append(K.cone("tier-3", 0.5, 1.1, verts=8, z=2.8, mat=K.get_mat("leaf_dark")))
    return o


def shrub(K):
    o = [K.ico("a", 0.4, x=-0.25, z=0.35, mat=K.get_mat("leaf"))]
    o.append(K.ico("b", 0.35, x=0.25, z=0.32, mat=K.get_mat("leaf_dark")))
    o.append(K.ico("c", 0.28, x=0.05, z=0.5, mat=K.get_mat("leaf")))
    return o


def flower_cluster(K):
    o = [K.ico("grass-a", 0.4, x=-0.3, z=0.15, mat=K.get_mat("grass"), detail=0)]
    o.append(K.ico("grass-b", 0.35, x=0.25, z=0.13, mat=K.get_mat("grass"), detail=0))
    flowers = [("coral", -0.4, 0.1), ("mango", 0.0, -0.25), ("turquoise", 0.35, 0.15),
               ("white", -0.15, 0.35), ("coral", 0.45, -0.15), ("mango", -0.45, -0.3)]
    for i, (m, x, y) in enumerate(flowers):
        o.append(K.cyl(f"stem-{i}", 0.015, 0.3, verts=4, x=x, y=y, z=0.15, mat=K.get_mat("leaf")))
        o.append(K.ico(f"head-{i}", 0.07, x=x, y=y, z=0.45, mat=K.get_mat(m), detail=0))
    return o


def reef_rocks(K):
    o = [K.ico("rock-a", 0.55, x=-0.4, z=0.25, mat=K.get_mat("paving"))]
    o.append(K.ico("rock-b", 0.4, x=0.35, z=0.2, mat=K.get_mat("stone_pale")))
    o.append(K.ico("rock-c", 0.3, x=0.1, y=0.5, z=0.15, mat=K.get_mat("paving_joint")))
    o.append(K.cyl("shallows", 1.5, 0.08, verts=12, mat=K.get_mat("sea")))
    o.append(K.ico("shallow-crest", 0.9, z=0.05, mat=K.get_mat("sea"), detail=0))
    return o


def sand_dune(K):
    o = [K.box("sand", 4.0, 4.0, 0.3, mat=K.get_mat("sand"))]
    o.append(K.ico("dune-a", 0.8, x=-0.8, z=0.35, mat=K.get_mat("sand"), detail=0))
    o.append(K.ico("dune-b", 0.6, x=0.9, y=0.5, z=0.32, mat=K.get_mat("sand"), detail=0))
    o.append(K.ico("pebble-a", 0.12, x=0.5, y=-0.8, z=0.32, mat=K.get_mat("paving_joint"), detail=0))
    o.append(K.ico("pebble-b", 0.09, x=-1.2, y=1.0, z=0.32, mat=K.get_mat("paving_joint"), detail=0))
    return o


SPECS = [
    ("landscape.broadleaf", broadleaf, "landscape"),
    ("landscape.palm", palm, "landscape"),
    ("landscape.conifer", conifer, "landscape"),
    ("landscape.shrub", shrub, "landscape"),
    ("landscape.flower-cluster", flower_cluster, "landscape"),
    ("landscape.reef-rocks", reef_rocks, "landscape"),
    ("landscape.sand-dune", sand_dune, "landscape"),
]


def build(lib):
    reports = []
    for i, (fid, fn, cat) in enumerate(SPECS):
        rep, obj = lib.family(fid, fn, cat, lib)
        reports.append(rep)
        lib.shelf_add(obj, i + 36)
    lib.clear_stage()
    lib._REPORTS.extend(reports)
    return reports
