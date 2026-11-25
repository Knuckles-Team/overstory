"""stage16_parks_edu.py — park variants + education suite.

Parks: skatepark, dog park, standard park, child park, nature park
(landscape category, nature-first composition like stage12). Education:
daycare, middle school, high school, community college (building
category; elementary and university are covered by
building.school / building.university from stage15).

Same conventions: 4 m module grid, bottom-centre pivots, flat palette,
hard QA budgets.
"""
import math

import bpy


def _tree(K, x, y, kind, z=0.2, s=1.0):
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
                            x=x + math.cos(ang) * 1.0 * s,
                            y=y + math.sin(ang) * 1.0 * s, z=z + 4.4 * s,
                            rot=(0, 0, ang), mat=K.get_mat("leaf")))
        o.append(K.ico("crown", 0.9 * s, x=x, y=y, z=z + 4.6 * s,
                       mat=K.get_mat("leaf"), detail=1))
    else:
        o.append(K.cyl("trunk", 0.22 * s, 2.2 * s, verts=6, x=x, y=y, z=z,
                       mat=K.get_mat("palm_trunk")))
        o.append(K.ico("crown", 1.7 * s, x=x, y=y, z=z + 2.9 * s,
                       mat=K.get_mat("leaf" if s > 0.9 else "leaf_dark"), detail=1))
    return o


def _shrub(K, x, y, z=0.2, s=1.0):
    return [K.ico("shrub", 0.7 * s, x=x, y=y, z=z + 0.5 * s,
                  mat=K.get_mat("leaf_dark"), detail=1)]


def _bench(K, x, y, z=0.2, rot=0.0):
    o = [K.box("bench-seat", 1.8, 0.5, 0.08, x=x, y=y, z=z + 0.4,
               rot=(0, 0, rot), mat=K.get_mat("timber"))]
    o.append(K.box("bench-back", 1.8, 0.08, 0.45, x=x, y=y - 0.22 * math.cos(rot),
                   z=z + 0.65, rot=(0, 0, rot), mat=K.get_mat("timber")))
    for s in (-1, 1):
        o.append(K.box("bench-leg", 0.08, 0.4, 0.4, x=x + s * 0.7 * math.cos(rot),
                       y=y + s * 0.7 * math.sin(rot) * 0, z=z,
                       rot=(0, 0, rot), mat=K.get_mat("timber_dark")))
    return o


def _lamp(K, x, y, z=0.2):
    o = [K.cyl("lamp-post", 0.06, 3.2, verts=6, x=x, y=y, z=z,
               mat=K.get_mat_metal("metal_dark"))]
    o.append(K.box("lamp-head", 0.3, 0.3, 0.18, x=x, y=y, z=z + 3.2,
                   mat=K.get_mat("window_warm")))
    return o


# --------------------------------------------------------------------------
# Parks
# --------------------------------------------------------------------------

def park_standard(K):
    o = [K.box("ground", 24.0, 20.0, 0.2, mat=K.get_mat("grass"))]
    # winding path: two curved paver strips
    for (px, py, rot) in [(-7.0, -4.0, 20), (-2.5, -1.0, 55), (2.5, 2.0, 100),
                          (7.0, 4.5, 130)]:
        o.append(K.box("path", 5.0, 1.8, 0.14, x=px, y=py, z=0.2,
                       rot=(0, 0, math.radians(rot)), mat=K.get_mat("paving")))
    # fountain on the plaza
    o.append(K.cyl("fountain-ring", 2.2, 0.5, verts=12, x=-7.0, y=5.5, z=0.2,
                   mat=K.get_mat("stone_pale")))
    o.append(K.cyl("fountain-water", 1.7, 0.3, verts=12, x=-7.0, y=5.5, z=0.5,
                   mat=K.get_mat_glass("sea")))
    o.append(K.cyl("fountain-pipe", 0.15, 0.9, verts=8, x=-7.0, y=5.5, z=0.5,
                   mat=K.get_mat_metal("metal")))
    # benches + lamps along the path
    o += _bench(K, -3.0, -4.5, rot=math.radians(30))
    o += _bench(K, 4.5, 1.0, rot=math.radians(110))
    o += _lamp(K, -5.0, -1.5)
    o += _lamp(K, 5.5, -2.5)
    # trees + plantings
    o += _tree(K, 9.0, -7.5, "broadleaf", s=1.1)
    o += _tree(K, 8.5, 6.5, "palm", s=1.0)
    o += _tree(K, -9.5, -7.0, "broadleaf", s=1.0)
    o += _tree(K, -2.0, 8.0, "palm", s=0.95)
    o += _shrub(K, -8.5, 2.5, s=1.1)
    o += _shrub(K, 3.0, 7.5, s=1.0)
    o += _shrub(K, 8.5, -2.0, s=0.9)
    for (fx, fy) in [(-4.0, 4.5), (0.5, -6.5), (7.5, 1.5)]:
        for k in range(3):
            o.append(K.ico("flower", 0.22, x=fx + 0.35 * k, y=fy, z=0.45,
                           mat=K.get_mat("coral" if k % 2 else "mango"),
                           detail=1))
    return o


def park_child(K):
    o = [K.box("ground", 24.0, 20.0, 0.2, mat=K.get_mat("grass"))]
    o.append(K.box("sand", 10.0, 8.0, 0.12, x=-4.0, z=0.2, mat=K.get_mat("sand")))
    # swing set
    for ax in (-6.5, -1.5):
        for s in (-1, 1):
            o.append(K.box("swing-leg", 0.14, 0.14, 2.4, x=ax, y=s * 1.0, z=0.3,
                           rot=(math.radians(16 * s), 0, 0),
                           mat=K.get_mat_metal("metal_dark")))
        o.append(K.box("swing-top", 2.3, 0.14, 0.14, x=ax, z=2.6,
                       mat=K.get_mat_metal("metal_dark")))
    o.append(K.box("swing-bar", 5.2, 0.12, 0.12, x=-4.0, z=2.6,
                   mat=K.get_mat_metal("metal_dark")))
    for sx in (-5.2, -4.0, -2.8):
        for s in (-1, 1):
            o.append(K.box("chain", 0.03, 0.03, 1.0, x=sx + 0.22 * s, z=1.7,
                           mat=K.get_mat("charcoal")))
        o.append(K.box("seat", 0.55, 0.14, 0.05, x=sx, z=1.2,
                       mat=K.get_mat("bus_green" if sx < -4.4 else "mango")))
    # slide
    o.append(K.box("slide-deck", 1.3, 1.3, 0.15, x=2.0, y=1.5, z=1.8,
                   mat=K.get_mat("timber")))
    for s in (-1, 1):
        for t in (-1, 1):
            o.append(K.box("slide-leg", 0.12, 0.12, 1.8, x=2.0 + 0.5 * s,
                           y=1.5 + 0.5 * t, z=0.3, mat=K.get_mat("timber_dark")))
    o.append(K.box("slide-chute", 1.0, 2.8, 0.08, x=2.0, y=3.4, z=1.15,
                   rot=(math.radians(-32), 0, 0), mat=K.get_mat("sea")))
    for i in range(4):
        o.append(K.box("slide-rung", 0.7, 0.07, 0.07, x=2.0, y=0.75 + i * 0.26,
                       z=0.35 + i * 0.32, mat=K.get_mat("timber")))
    # spring rider: post + star top
    o.append(K.cyl("rider-post", 0.12, 1.0, verts=8, x=6.5, z=0.3,
                   mat=K.get_mat_metal("metal")))
    o.append(K.ico("rider-star", 0.6, x=6.5, z=1.35, mat=K.get_mat("mango"),
                   detail=1))
    # benches + shade trees
    o += _bench(K, 7.5, -3.5, rot=math.radians(-20))
    o += _tree(K, -9.5, 7.0, "broadleaf", s=1.1)
    o += _tree(K, 8.5, 7.5, "broadleaf", s=1.0)
    o += _tree(K, -9.0, -7.5, "palm", s=1.0)
    o += _shrub(K, 7.5, 2.0, s=1.0)
    o += _shrub(K, -6.5, -5.5, s=0.9)
    return o


def park_nature(K):
    o = [K.box("ground", 24.0, 20.0, 0.2, mat=K.get_mat("leaf_dark"))]
    # small pond
    o.append(K.cyl("pond", 4.5, 0.3, verts=14, x=6.0, y=5.0, z=0.2,
                   mat=K.get_mat_glass("sea")))
    for i in range(7):
        ang = i * math.tau / 7 + 0.4
        x, y = 6.0 + math.cos(ang) * 5.1, 5.0 + math.sin(ang) * 5.1
        o.append(K.ico("pond-rock", 0.55, x=x, y=y, z=0.45,
                       mat=K.get_mat("stone_pale"), detail=1))
    # stepping-stone path
    for (sx, sy) in [(-9.0, -6.0), (-7.0, -4.0), (-4.8, -4.6), (-2.8, -2.8),
                     (-0.8, -3.4), (1.2, -1.6), (3.0, 0.2)]:
        o.append(K.box("stone", 1.1, 0.8, 0.12, x=sx, y=sy, z=0.2,
                       rot=(0, 0, math.radians((sx + sy) * 17)),
                       mat=K.get_mat("paving_joint")))
    # dense mixed canopy
    spots = [(-10.0, 5.0, "conifer", 1.2), (-7.0, 7.5, "broadleaf", 1.1),
             (-3.0, 7.0, "conifer", 1.0), (1.0, 7.5, "broadleaf", 1.0),
             (10.5, -5.5, "conifer", 1.1), (9.0, -8.0, "broadleaf", 1.2),
             (-9.5, -1.0, "palm", 1.0), (-4.0, -7.5, "conifer", 0.95),
             (0.0, -7.0, "broadleaf", 1.05), (10.5, 2.5, "palm", 0.95),
             (4.5, -5.5, "conifer", 1.0), (-10.0, -5.5, "broadleaf", 1.0)]
    for (x, y, kind, s) in spots:
        o += _tree(K, x, y, kind, s=s)
    for (x, y) in [(-6.0, 2.5), (-1.0, 4.0), (8.0, 0.5), (3.0, -3.5),
                   (-5.5, -2.5)]:
        o += _shrub(K, x, y, s=1.0)
    # lookout platform on posts
    for sx in (-1, 1):
        for sy in (-1, 1):
            o.append(K.cyl("lookout-post", 0.14, 3.0, verts=6,
                           x=6.5 + 1.3 * sx, y=-7.5 + 1.3 * sy, z=0.2,
                           mat=K.get_mat("timber_dark")))
    o.append(K.box("lookout-deck", 3.2, 3.2, 0.15, x=6.5, y=-7.5, z=3.2,
                   mat=K.get_mat("timber")))
    for (sx, sy, pw, pd) in [(-1.5, 0, 0.12, 3.2), (1.5, 0, 0.12, 3.2),
                             (0, -1.5, 3.2, 0.12), (0, 1.5, 3.2, 0.12)]:
        o.append(K.box("lookout-rail", pw, pd, 0.9, x=6.5 + sx, y=-7.5 + sy,
                       z=3.35, mat=K.get_mat("timber")))
    return o


def park_dog(K):
    o = [K.box("ground", 24.0, 20.0, 0.2, mat=K.get_mat("grass"))]
    # woodchip run
    o.append(K.box("chips", 12.0, 10.0, 0.12, z=0.2, mat=K.get_mat("timber_light")))
    # perimeter fence
    for y in (-5.0, 5.0):
        o.append(K.box("fence-rail", 12.0, 0.08, 0.9, y=y, z=0.3,
                       mat=K.get_mat_metal("metal_dark")))
    for x in (-6.0, 0.0, 6.0):
        for y in (-5.0, 5.0):
            o.append(K.box("fence-post", 0.1, 0.1, 1.1, x=x, y=y, z=0.2,
                           mat=K.get_mat("charcoal")))
    # gate gap on the -y side: two posts + swing gate
    for x in (-3.0, 3.0):
        o.append(K.box("gate-post", 0.14, 0.14, 1.1, x=x, y=-5.0, z=0.2,
                       mat=K.get_mat("charcoal")))
    o.append(K.box("gate", 2.4, 0.08, 0.8, z=0.35,
                   rot=(0, 0, math.radians(18)), mat=K.get_mat_metal("metal_dark")))
    # water station + shade
    o.append(K.box("water-station", 1.2, 0.6, 0.8, x=-4.5, y=-3.5, z=0.3,
                   mat=K.get_mat("offwhite")))
    o.append(K.cyl("water-bowl", 0.3, 0.15, verts=8, x=-4.5, y=-4.1, z=0.3,
                   mat=K.get_mat_glass("sea")))
    o += _bench(K, 3.5, 3.0, rot=math.radians(15))
    o += _tree(K, -5.5, 4.0, "broadleaf", s=1.1)
    o += _tree(K, 4.5, -4.5, "palm", s=1.0)
    # agility: low hoop + tunnel
    o.append(K.cyl("agility-hoop", 0.8, 0.1, verts=10, x=1.5, y=0.0, z=1.0,
                   rot=(math.radians(90), 0, 0), mat=K.get_mat("bus_green")))
    for s in (-1, 1):
        o.append(K.box("hoop-leg", 0.08, 0.08, 1.0, x=1.5 + s * 0.8, y=0.0, z=0.3,
                       mat=K.get_mat("charcoal")))
    o.append(K.cyl("tunnel", 0.7, 2.2, verts=10, x=-1.5, y=2.5, z=0.85,
                   rot=(0, math.radians(90), 0), mat=K.get_mat("mango")))
    o += _shrub(K, 5.0, 3.5, s=0.9)
    return o


def park_skate(K):
    o = [K.box("pad", 24.0, 20.0, 0.2, mat=K.get_mat("asphalt"))]
    o.append(K.box("concrete", 18.0, 14.0, 0.1, z=0.2, mat=K.get_mat("paving")))
    # quarter-pipe: wedge prism along the -y edge
    bm = bpy.data.meshes
    import bmesh
    def wedge(name, x0, x1, depth, hgt, y, mat):
        b = bmesh.new()
        pts = [(x0, y - depth, 0.0), (x1, y - depth, 0.0),
               (x1, y, 0.0), (x1, y, hgt)]
        vs = [b.verts.new((px, py, pz)) for (px, py, pz) in pts]
        b.faces.new(vs)
        m = bm.new(name)
        b.to_mesh(m)
        b.free()
        g = bpy.data.objects.new(name, m)
        bpy.context.scene.collection.objects.link(g)
        g.data.materials.append(K.get_mat(mat))
        return g
    o.append(wedge("qpipe-l", -9.0, -5.0, 3.0, 2.2, -5.5, "paving"))
    o.append(wedge("qpipe-r", 5.0, 9.0, 3.0, 2.2, -5.5, "paving"))
    # flat boxes
    o.append(K.box("box-1", 3.0, 3.0, 0.9, x=-3.5, y=-2.5, z=0.3,
                   mat=K.get_mat("stone_pale")))
    o.append(K.box("box-2", 2.0, 2.0, 0.6, x=-0.5, y=-2.5, z=0.3,
                   mat=K.get_mat("stone_pale")))
    # ledge + rail
    o.append(K.box("ledge", 6.0, 1.4, 0.5, x=2.5, y=-3.5, z=0.3,
                   mat=K.get_mat("stone_pale")))
    o.append(K.box("rail", 6.0, 0.08, 0.08, x=2.5, y=-3.5, z=0.95,
                   mat=K.get_mat_metal("steel")))
    for px in (-2.4, 0.0, 2.4):
        o.append(K.box("rail-post", 0.08, 0.08, 0.65, x=2.5 + px, y=-3.5, z=0.3,
                       mat=K.get_mat("charcoal")))
    # stairs feature
    for i in range(4):
        o.append(K.box(f"step-{i}", 3.0, 0.5, 0.3 + i * 0.3, x=-5.0, y=3.5,
                       z=0.3, mat=K.get_mat("stone_pale")))
    # bank ramp
    o.append(K.box("bank", 4.0, 3.0, 0.5, x=5.5, y=3.0, z=0.3,
                   rot=(math.radians(-14), 0, 0), mat=K.get_mat("paving")))
    # safety border + street trees
    o += _tree(K, -9.5, 8.0, "broadleaf", s=1.0)
    o += _tree(K, 9.5, 8.0, "broadleaf", s=1.0)
    o += _tree(K, 9.5, -8.0, "palm", s=1.0)
    o += _bench(K, -8.0, 0.0, rot=math.radians(90))
    o += _lamp(K, 8.0, 0.0)
    return o


# --------------------------------------------------------------------------
# Education suite
# --------------------------------------------------------------------------

def school_daycare(K):
    o = [K.box("yard", 20.0, 14.0, 0.2, mat=K.get_mat("grass"))]
    o.append(K.box("house", 12.0, 8.0, 3.4, z=0.2, mat=K.get_mat("cream")))
    o.append(K.box("roof-band", 12.2, 8.2, 0.3, z=3.6, mat=K.get_mat("offwhite")))
    # playful accents
    o.append(K.box("door-frame", 1.6, 0.2, 2.4, y=-4.1, z=0.2,
                   mat=K.get_mat("turquoise")))
    o.append(K.box("door", 1.2, 0.15, 2.1, y=-4.15, z=0.2,
                   mat=K.get_mat("sea")))
    for x in (-4.0, -1.5, 1.5, 4.0):
        o.append(K.box("win", 1.6, 0.12, 1.6, x=x, y=-4.05, z=0.9,
                       mat=K.get_mat_glass("glass_cool")))
    for x in (-3.0, 3.0):
        o.append(K.box("win-w", 0.12, 1.6, 1.6, x=x, y=-2.0, z=0.9,
                       rot=(0, 0, math.radians(90)),
                       mat=K.get_mat_glass("glass_cool")))
    # low fence + small play corner
    for x in (-8.5, -4.5, 4.5, 8.5):
        o.append(K.box("fence-post", 0.12, 0.12, 0.9, x=x, y=5.5, z=0.2,
                       mat=K.get_mat("timber")))
    o.append(K.box("fence-rail", 17.0, 0.06, 0.5, y=5.5, z=0.5,
                   mat=K.get_mat("timber")))
    o.append(K.cyl("rider", 0.5, 0.7, verts=8, x=6.0, y=4.5, z=0.3,
                   mat=K.get_mat("coral")))
    o.append(K.box("climb-frame", 2.0, 0.12, 1.4, x=-6.0, y=4.5, z=0.3,
                   mat=K.get_mat("bus_green")))
    for i in range(3):
        o.append(K.box("climb-rung", 1.8, 0.07, 0.07, x=-6.0, y=4.5,
                       z=0.6 + i * 0.4, mat=K.get_mat("mango")))
    o += _tree(K, -9.0, -4.5, "broadleaf", s=1.0)
    o += _tree(K, 9.0, -5.0, "broadleaf", s=0.95)
    o += _shrub(K, 7.5, 1.5, s=1.0)
    o += _shrub(K, -7.5, 2.0, s=0.9)
    return o


def school_middle(K):
    o = [K.box("courtyard", 28.0, 20.0, 0.2, mat=K.get_mat("paving"))]
    o.append(K.box("lawn", 14.0, 8.0, 0.05, z=0.2, mat=K.get_mat("grass")))
    # L-shape main block
    o.append(K.box("block-a", 20.0, 9.0, 5.0, x=-4.0, y=-3.0, z=0.2,
                   mat=K.get_mat("stone_pale")))
    o.append(K.box("block-b", 8.0, 12.0, 5.0, x=9.0, z=0.2,
                   mat=K.get_mat("cream")))
    o.append(K.box("cornice-a", 20.3, 9.3, 0.4, x=-4.0, y=-3.0, z=5.2,
                   mat=K.get_mat("offwhite")))
    o.append(K.box("cornice-b", 8.3, 12.3, 0.4, x=9.0, z=5.2,
                   mat=K.get_mat("offwhite")))
    # window bands
    for f in range(2):
        for i in range(5):
            x = -12.0 + i * 4.0
            o.append(K.box("win", 2.6, 0.12, 1.5, x=x, y=-7.55, z=1.0 + f * 2.1,
                           mat=K.get_mat_glass("glass_dark")))
            o.append(K.box("win-2", 2.6, 0.12, 1.5, x=x, y=1.05, z=1.0 + f * 2.1,
                           mat=K.get_mat_glass("glass_dark")))
        for i in range(3):
            y = -3.0 + i * 3.6
            o.append(K.box("win-b", 0.12, 2.4, 1.5, x=13.05, y=y, z=1.0,
                           mat=K.get_mat_glass("glass_dark")))
    # entry canopy + stairs
    o.append(K.box("canopy", 5.0, 2.6, 0.2, x=-4.0, y=-8.2, z=3.2,
                   mat=K.get_mat("timber")))
    for x in (-6.0, -2.0):
        o.append(K.box("canopy-post", 0.25, 0.25, 3.2, x=x, y=-9.2, z=0.2,
                       mat=K.get_mat("timber_dark")))
    o.append(K.box("stair", 5.5, 2.0, 0.25, x=-4.0, y=-8.4, z=0.2,
                   mat=K.get_mat("stone_pale")))
    # courtyard trees + benches
    o += _tree(K, 0.0, 4.5, "broadleaf", s=1.1)
    o += _tree(K, -3.5, 4.0, "broadleaf", s=0.95)
    o += _tree(K, 3.0, 3.5, "palm", s=1.0)
    o += _bench(K, -1.0, 2.0, rot=math.radians(10))
    o += _bench(K, 2.5, 5.5, rot=math.radians(-15))
    o += _lamp(K, -6.5, 2.5)
    o += _lamp(K, 5.5, 2.5)
    # flag
    o.append(K.cyl("mast", 0.1, 6.5, verts=6, x=9.0, y=5.0, z=0.2,
                   mat=K.get_mat_metal("metal")))
    o.append(K.box("flag", 1.3, 0.05, 0.85, x=9.65, y=5.0, z=5.7,
                   mat=K.get_mat("blue_paint")))
    return o


def school_high(K):
    o = [K.box("field", 36.0, 34.0, 0.2, mat=K.get_mat("grass"))]
    # playing field markings
    for (fx, fw, fd) in [(-6.0, 16.0, 0.3), (14.0, 2.0, 10.0)]:
        o.append(K.box("mark", fw, fd, 0.02, x=fx, z=0.22, mat=K.get_mat("white")))
    # main academic block: 3 storeys
    o.append(K.box("block", 24.0, 12.0, 8.4, x=-4.0, z=0.2,
                   mat=K.get_mat("plaster_warm")))
    o.append(K.box("band-1", 24.2, 12.2, 0.3, x=-4.0, z=3.0, mat=K.get_mat("stone_pale")))
    o.append(K.box("band-2", 24.2, 12.2, 0.3, x=-4.0, z=5.8, mat=K.get_mat("stone_pale")))
    o.append(K.box("cornice", 24.4, 12.4, 0.4, x=-4.0, z=8.6, mat=K.get_mat("offwhite")))
    # window grid
    for f in range(3):
        for i in range(7):
            x = -13.2 + i * 3.2
            o.append(K.box("win", 1.8, 0.12, 1.5, x=x, y=-6.05, z=0.9 + f * 2.8,
                           mat=K.get_mat_glass("glass_dark")))
            o.append(K.box("win-2", 1.8, 0.12, 1.5, x=x, y=6.05, z=0.9 + f * 2.8,
                           mat=K.get_mat_glass("glass_dark")))
    # corner clock tower
    o.append(K.box("tower", 3.4, 3.4, 11.0, x=9.0, y=-6.0, z=0.2,
                   mat=K.get_mat("brick")))
    o.append(K.box("clock", 1.5, 0.12, 1.5, x=9.0, y=-7.75, z=8.8,
                   mat=K.get_mat("cream")))
    o.append(K.cone("tower-roof", 2.4, 2.2, verts=8, x=9.0, y=-6.0, z=11.2,
                    mat=K.get_mat("terracotta")))
    # gymnasium: wide low block
    o.append(K.box("gym", 14.0, 16.0, 6.0, x=11.0, y=8.0, z=0.2,
                   mat=K.get_mat("stone_pale")))
    o.append(K.box("gym-roof", 14.4, 16.4, 0.35, x=11.0, y=8.0, z=6.2,
                   mat=K.get_mat("metal_dark")))
    for i in range(4):
        o.append(K.box("gym-win", 2.2, 0.12, 2.0, x=6.5 + i * 3.0, y=16.05, z=3.4,
                       mat=K.get_mat_glass("glass_cool")))
    # entry canopy
    o.append(K.box("canopy", 6.0, 3.0, 0.2, x=-4.0, y=-8.0, z=3.4,
                   mat=K.get_mat("timber")))
    for x in (-6.5, -1.5):
        o.append(K.box("canopy-post", 0.3, 0.3, 3.4, x=x, y=-9.2, z=0.2,
                       mat=K.get_mat("timber_dark")))
    o.append(K.box("stair", 6.5, 2.4, 0.25, x=-4.0, y=-8.2, z=0.2,
                   mat=K.get_mat("stone_pale")))
    o += _tree(K, -14.0, 6.5, "broadleaf", s=1.1)
    o += _tree(K, -14.0, -3.0, "broadleaf", s=1.0)
    o += _tree(K, 2.0, 15.0, "palm", s=1.0)
    o += _bench(K, -2.0, 10.0, rot=math.radians(-10))
    o += _lamp(K, -9.0, 9.0)
    o += _lamp(K, 17.0, 2.0)
    return o


def school_community_college(K):
    o = [K.box("plaza", 34.0, 24.0, 0.2, mat=K.get_mat("paving"))]
    # two 3-storey wings + glass atrium core
    for wx in (-9.0, 9.0):
        o.append(K.box("wing", 14.0, 10.0, 8.4, x=wx, z=0.2,
                       mat=K.get_mat("offwhite")))
        o.append(K.box("wing-cornice", 14.2, 10.2, 0.35, x=wx, z=8.6,
                       mat=K.get_mat("charcoal")))
        for f in range(3):
            for i in range(4):
                x = wx - 4.8 + i * 3.2
                o.append(K.box("win", 2.4, 0.12, 2.0, x=x, y=-5.05,
                               z=0.9 + f * 2.8, mat=K.get_mat_glass("glass_cool")))
                o.append(K.box("win-2", 2.4, 0.12, 2.0, x=x, y=5.05,
                               z=0.9 + f * 2.8, mat=K.get_mat_glass("glass_cool")))
    o.append(K.box("atrium-glass", 10.0, 12.0, 6.5, z=1.8,
                   mat=K.get_mat_glass("glass_cool")))
    for f in range(3):
        o.append(K.box("atrium-band", 10.2, 12.2, 0.25, z=0.2 + f * 2.8,
                       mat=K.get_mat("charcoal")))
    o.append(K.box("atrium-roof", 10.4, 12.4, 0.3, z=8.4,
                   mat=K.get_mat("charcoal")))
    # entrance portico
    for x in (-4.0, -1.3, 1.3, 4.0):
        o.append(K.box("portico-col", 0.4, 0.4, 5.0, x=x, y=-8.5, z=0.2,
                       mat=K.get_mat("charcoal")))
    o.append(K.box("portico-slab", 11.0, 2.0, 0.35, y=-8.5, z=5.2,
                   mat=K.get_mat("charcoal")))
    o.append(K.box("stair", 10.0, 3.0, 0.25, y=-9.5, z=0.2,
                   mat=K.get_mat("paving")))
    # lawn + trees
    o.append(K.box("lawn", 12.0, 6.0, 0.05, y=8.8, z=0.2, mat=K.get_mat("grass")))
    o += _tree(K, -14.0, 9.5, "broadleaf", s=1.1)
    o += _tree(K, 14.0, 9.5, "broadleaf", s=1.0)
    o += _tree(K, 0.0, 10.5, "palm", s=1.05)
    o += _shrub(K, -8.0, 10.5, s=1.0)
    o += _shrub(K, 8.0, 10.5, s=1.0)
    o += _lamp(K, -6.0, -6.5)
    o += _lamp(K, 6.0, -6.5)
    # mast with banner
    o.append(K.cyl("mast", 0.12, 7.5, verts=6, x=0.0, y=7.5, z=0.2,
                   mat=K.get_mat_metal("metal")))
    o.append(K.box("banner", 1.6, 0.06, 1.1, x=0.85, y=7.5, z=6.5,
                   mat=K.get_mat("mango")))
    return o


SPECS = [
    ("landscape.park-standard", park_standard, "landscape", (24.2, 20.2, 7.0)),
    ("landscape.park-child", park_child, "landscape", (24.2, 20.2, 7.0)),
    ("landscape.park-nature", park_nature, "landscape", (24.4, 20.5, 7.0)),
    ("landscape.park-dog", park_dog, "landscape", (24.2, 20.2, 7.0)),
    ("landscape.park-skate", park_skate, "landscape", (24.2, 20.2, 7.0)),
    ("building.school-daycare", school_daycare, "building", (21.2, 14.2, 5.0)),
    ("building.school-middle", school_middle, "building", (28.2, 20.2, 7.5)),
    ("building.school-high", school_high, "building", (36.2, 34.2, 13.6)),
    ("building.school-community-college", school_community_college, "building",
     (34.2, 24.2, 9.5)),
]


def build(lib):
    reports = []
    for entry in SPECS:
        fid, fn, cat, expect = entry
        rep, obj = lib.family(fid, fn, cat, lib, expect=expect)
        reports.append(rep)
        lib.shelf_add(obj, cat)
    return reports
