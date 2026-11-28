"""stage15_civic.py — civic anchors, street life, fauna (R051/R054).

Civic and community anchors (city hall, courthouse, school, university,
waste recycling, substation), street-life micro-props (utility pole and
box, parking meter, vending machine, parked bicycle, playground,
scaffold, construction crane) and the first fauna family (seagull).
Same conventions as the other stages: 4 m module grid, bottom-centre
pivots, flat palette, hard QA budgets.
"""
import math

import bpy


def _columns(K, x0, x1, n, y, z, h, r, mat="plaster_warm"):
    o = []
    for i in range(n):
        x = x0 + (x1 - x0) * i / (n - 1) if n > 1 else (x0 + x1) / 2
        o.append(K.cyl(f"col-{i}", r, h, verts=10, x=x, y=y, z=z,
                       mat=K.get_mat(mat)))
        o.append(K.box(f"col-base-{i}", 2 * r + 0.3, 2 * r + 0.3, 0.2, x=x, y=y, z=z,
                       mat=K.get_mat("stone_pale")))
    return o


def city_hall(K):
    o = [K.box("plaza", 24.0, 18.0, 0.2, mat=K.get_mat("paving"))]
    o.append(K.box("block", 18.0, 12.0, 4.2, z=0.2, mat=K.get_mat("plaster_warm")))
    o.append(K.box("cornice", 18.4, 12.4, 0.4, z=4.4, mat=K.get_mat("offwhite")))
    # portico on the -y face
    o += _columns(K, -7.0, 7.0, 6, -6.9, 0.2, 4.6, 0.35)
    o.append(K.box("portico-lintel", 15.0, 0.9, 0.6, y=-6.9, z=4.9,
                   mat=K.get_mat("offwhite")))
    o.append(K.box("pediment", 15.0, 0.9, 1.6, y=-6.9, z=5.5,
                   mat=K.get_mat("stone_pale")))
    o.append(K.box("stair", 16.0, 2.6, 0.2, y=-8.2, z=0.2, mat=K.get_mat("stone_pale")))
    # windows
    for f in range(2):
        for i in range(6):
            x = -6.0 + i * 2.4
            for s in (-1, 1):
                o.append(K.box("win", 1.2, 0.12, 1.4, x=x, y=s * 6.05, z=1.1 + f * 1.9,
                               mat=K.get_mat_glass("glass_dark")))
    # central flag mast
    o.append(K.cyl("mast", 0.12, 7.0, verts=6, z=6.1, mat=K.get_mat_metal("metal")))
    o.append(K.box("flag", 1.4, 0.06, 0.9, x=0.75, z=12.2, mat=K.get_mat("turquoise")))
    return o


def courthouse(K):
    o = [K.box("plaza", 22.0, 16.0, 0.2, mat=K.get_mat("paving"))]
    for wx in (-5.5, 5.5):
        o.append(K.box("wing", 8.0, 10.0, 3.6, x=wx, z=0.2, mat=K.get_mat("stone_pale")))
        o.append(K.box("wing-cornice", 8.3, 10.3, 0.3, x=wx, z=3.8,
                       mat=K.get_mat("offwhite")))
    o.append(K.box("core", 6.0, 10.0, 4.6, z=0.2, mat=K.get_mat("plaster_warm")))
    # corner clock tower
    o.append(K.box("tower", 3.6, 3.6, 8.0, x=8.0, y=-4.0, z=0.2,
                   mat=K.get_mat("plaster_warm")))
    o.append(K.box("clock", 1.6, 0.12, 1.6, x=8.0, y=-5.85, z=5.6,
                   mat=K.get_mat("cream")))
    o.append(K.cyl("dome", 1.9, 0.6, verts=12, x=8.0, y=-4.0, z=8.2,
                   mat=K.get_mat("terracotta")))
    o.append(K.cone("spire", 1.3, 2.2, verts=8, x=8.0, y=-4.0, z=8.8,
                    mat=K.get_mat("terracotta")))
    # windows
    for f in range(2):
        for wx in (-5.5, 5.5):
            for i in range(3):
                x = wx - 2.4 + i * 2.4
                for s in (-1, 1):
                    o.append(K.box("win", 1.1, 0.12, 1.3, x=x, y=s * 5.05,
                                   z=0.9 + f * 1.7, mat=K.get_mat_glass("glass_dark")))
    return o


def school(K):
    o = [K.box("lawn", 24.0, 16.0, 0.2, mat=K.get_mat("grass"))]
    # L-shape: main block + wing
    o.append(K.box("main", 18.0, 8.0, 4.0, z=0.2, mat=K.get_mat("cream")))
    o.append(K.box("wing", 8.0, 10.0, 4.0, x=-8.0, y=6.0, z=0.2,
                   mat=K.get_mat("stone_pale")))
    # entry canopy
    o.append(K.box("canopy", 4.0, 2.4, 0.2, y=-4.6, z=3.0, mat=K.get_mat("timber")))
    for x in (-1.6, 1.6):
        o.append(K.box("canopy-post", 0.2, 0.2, 3.0, x=x, y=-5.4, z=0.2,
                       mat=K.get_mat("timber_dark")))
    o.append(K.box("stair", 4.4, 1.6, 0.2, y=-5.0, z=0.2, mat=K.get_mat("stone_pale")))
    # window strips
    for f in range(2):
        for i in range(5):
            x = -7.2 + i * 3.6
            o.append(K.box("win", 2.4, 0.12, 1.3, x=x, y=-4.05, z=0.8 + f * 1.9,
                           mat=K.get_mat_glass("glass_cool")))
    for i in range(3):
        y = 2.5 + i * 2.6
        o.append(K.box("win-w", 0.12, 2.0, 1.3, x=-12.05, y=y, z=0.8,
                       mat=K.get_mat_glass("glass_cool")))
    # flag
    o.append(K.cyl("mast", 0.1, 6.0, verts=6, x=7.0, y=-3.5, z=0.2,
                   mat=K.get_mat_metal("metal")))
    o.append(K.box("flag", 1.2, 0.05, 0.8, x=7.6, y=-3.5, z=5.2,
                   mat=K.get_mat("mango")))
    return o


def university(K):
    o = [K.box("quad", 26.0, 18.0, 0.2, mat=K.get_mat("paving"))]
    o.append(K.box("lawn-quad", 12.0, 8.0, 0.05, z=0.2, mat=K.get_mat("grass")))
    # main hall with portico
    o.append(K.box("hall", 16.0, 10.0, 5.2, z=0.2, mat=K.get_mat("plaster_warm")))
    o.append(K.box("cornice", 16.4, 10.4, 0.5, z=5.4, mat=K.get_mat("offwhite")))
    o += _columns(K, -6.0, 6.0, 5, -5.4, 0.2, 5.0, 0.4)
    o.append(K.box("pediment", 13.0, 1.0, 1.8, y=-5.4, z=5.9,
                   mat=K.get_mat("stone_pale")))
    o.append(K.box("stair", 13.0, 3.0, 0.25, y=-7.0, z=0.2,
                   mat=K.get_mat("stone_pale")))
    # flanking blocks
    for sx in (-1, 1):
        o.append(K.box("side", 6.0, 8.0, 3.8, x=sx * 11.0, z=0.2,
                       mat=K.get_mat("stone_pale")))
    # windows
    for f in range(2):
        for i in range(5):
            x = -5.4 + i * 2.7
            for s in (-1, 1):
                o.append(K.box("win", 1.3, 0.12, 1.5, x=x, y=s * 5.05,
                               z=1.2 + f * 2.0, mat=K.get_mat_glass("glass_dark")))
    # statue on the quad
    o.append(K.box("plinth", 1.4, 1.4, 1.0, z=0.2, mat=K.get_mat("stone_pale")))
    o.append(K.cyl("statue", 0.45, 1.6, verts=8, z=1.2, mat=K.get_mat_metal("metal")))
    return o


def waste_recycling(K):
    o = [K.box("pad", 20.0, 14.0, 0.2, mat=K.get_mat("paving"))]
    o.append(K.box("shed", 16.0, 10.0, 4.5, z=0.2, mat=K.get_mat("stone_pale")))
    o.append(K.box("roof", 16.4, 10.4, 0.3, z=4.7, mat=K.get_mat("metal_dark")))
    # three drop-off bays on the -y face
    for i, (bx, mat) in enumerate(((-4.5, "bus_green"), (0.0, "mango"), (4.5, "sea"))):
        o.append(K.box("bay-frame", 3.6, 0.3, 3.0, x=bx, y=-5.1, z=0.2,
                       mat=K.get_mat("charcoal")))
        o.append(K.box("bay-door", 3.2, 0.15, 2.6, x=bx, y=-5.25, z=0.2,
                       mat=K.get_mat(mat)))
        o.append(K.box("bay-lip", 3.2, 0.9, 0.15, x=bx, y=-5.5, z=0.2,
                       mat=K.get_mat("charcoal")))
    # recycling logo: three coloured cubes
    for i, (bx, mat) in enumerate(((-0.8, "bus_green"), (0.0, "mango"), (0.8, "sea"))):
        o.append(K.box(f"logo-{i}", 0.55, 0.55, 0.55, x=bx, y=-5.05, z=3.4,
                       rot=(0, 0, math.radians(20 * i)), mat=K.get_mat(mat)))
    o.append(K.box("sign", 3.0, 0.15, 0.8, y=-5.05, z=4.35, mat=K.get_mat("white")))
    return o


def substation(K):
    o = [K.box("pad", 18.0, 12.0, 0.2, mat=K.get_mat("paving"))]
    # two transformers with cooling fins
    for tx in (-4.5, 1.5):
        o.append(K.box("xfmr-base", 4.0, 4.0, 0.4, x=tx, z=0.2,
                       mat=K.get_mat("stone_pale")))
        o.append(K.box("xfmr-body", 3.2, 3.2, 2.2, x=tx, z=0.6,
                       mat=K.get_mat_metal("steel")))
        for i in range(4):
            o.append(K.box("fin", 0.15, 3.4, 1.6, x=tx - 1.2 + i * 0.8, z=0.6,
                           mat=K.get_mat_metal("metal")))
        o.append(K.box("xfmr-cap", 3.4, 3.4, 0.25, x=tx, z=2.8,
                       mat=K.get_mat("metal_dark")))
    # control hut
    o.append(K.box("hut", 3.0, 3.0, 2.4, x=7.0, z=0.2, mat=K.get_mat("offwhite")))
    o.append(K.box("hut-door", 1.0, 0.12, 2.0, x=7.0, y=-1.55, z=0.2,
                   mat=K.get_mat("charcoal")))
    o.append(K.box("hut-glass", 1.6, 0.12, 0.8, x=7.0, y=-1.55, z=1.4,
                   mat=K.get_mat_glass("glass_cool")))
    # fence with hazard stripes
    for y in (-6.0, 6.0):
        o.append(K.box("fence-rail", 18.0, 0.1, 1.0, y=y, z=0.2,
                       mat=K.get_mat_metal("metal_dark")))
    for x in (-7.5, -3.5, 0.5, 4.5, 8.0):
        for y in (-6.0, 6.0):
            o.append(K.box("fence-post", 0.12, 0.12, 1.2, x=x, y=y, z=0.2,
                           mat=K.get_mat("charcoal")))
    for i in range(6):
        o.append(K.box("stripe", 1.4, 0.12, 0.35, x=-6.5 + i * 2.8, y=-6.0, z=0.2,
                       mat=K.get_mat("mango" if i % 2 else "white")))
    return o


def utility_pole(K):
    o = [K.cone("pole", 0.22, 8.0, verts=8, mat=K.get_mat("timber_dark"))]
    o.append(K.box("crossarm", 2.6, 0.12, 0.12, z=7.0, mat=K.get_mat("timber")))
    o.append(K.box("crossarm-2", 1.8, 0.12, 0.12, z=6.4, mat=K.get_mat("timber")))
    for x in (-1.2, 0.0, 1.2):
        o.append(K.box("insulator", 0.14, 0.14, 0.25, x=x, z=7.06,
                       mat=K.get_mat("charcoal")))
    for x in (-0.8, 0.8):
        o.append(K.box("insulator-2", 0.14, 0.14, 0.25, x=x, z=6.46,
                       mat=K.get_mat("charcoal")))
    # transformer bucket
    o.append(K.cyl("bucket", 0.45, 0.9, verts=10, x=0.9, y=0.3, z=5.6,
                   mat=K.get_mat_metal("metal")))
    o.append(K.box("ground", 1.2, 1.2, 0.15, mat=K.get_mat("paving")))
    return o


def utility_box(K):
    o = [K.box("cabinet", 1.2, 0.7, 1.4, z=0.15, mat=K.get_mat("metal_dark"))]
    o.append(K.box("door-seam", 0.03, 0.72, 1.42, x=0.0, z=0.15,
                   mat=K.get_mat("charcoal")))
    o.append(K.box("handle", 0.06, 0.06, 0.4, x=0.25, y=-0.36, z=0.8,
                   mat=K.get_mat_metal("metal")))
    for i in range(3):
        o.append(K.box("vent", 0.5, 0.02, 0.06, x=-0.3, y=-0.36, z=0.35 + i * 0.18,
                       mat=K.get_mat("charcoal")))
    o.append(K.box("base", 1.3, 0.8, 0.15, mat=K.get_mat("paving")))
    return o


def parking_meter(K):
    o = [K.box("post", 0.1, 0.1, 1.1, z=0.0, mat=K.get_mat_metal("metal_dark"))]
    o.append(K.box("head", 0.35, 0.2, 0.4, z=1.1, mat=K.get_mat("metal_dark")))
    o.append(K.box("display", 0.25, 0.02, 0.15, z=1.28,
                   mat=K.get_mat("window_warm")))
    o.append(K.box("coin-door", 0.18, 0.02, 0.12, x=0.0, y=0.1, z=1.05,
                   mat=K.get_mat("charcoal")))
    o.append(K.box("base", 0.3, 0.3, 0.08, mat=K.get_mat("charcoal")))
    return o


def vending_machine(K):
    o = [K.box("body", 1.1, 0.8, 1.9, z=0.1, mat=K.get_mat("offwhite"))]
    o.append(K.box("glass-front", 0.85, 0.05, 1.3, x=-0.1, y=-0.42, z=0.5,
                   mat=K.get_mat_glass("glass_cool")))
    o.append(K.box("panel", 0.3, 0.05, 0.9, x=0.35, y=-0.42, z=0.6,
                   mat=K.get_mat("charcoal")))
    for i in range(3):
        for j in range(2):
            o.append(K.box("btn", 0.08, 0.02, 0.08, x=0.28 + j * 0.1, y=-0.44,
                           z=0.9 - i * 0.25,
                           mat=K.get_mat("bus_green" if (i + j) % 2 else "mango")))
    o.append(K.box("tray", 0.7, 0.3, 0.1, x=-0.1, y=-0.4, z=0.35,
                   mat=K.get_mat("charcoal")))
    for i in range(4):
        o.append(K.box("shelf-glow", 0.8, 0.04, 0.05, x=-0.1, y=-0.44, z=0.75 + i * 0.3,
                       mat=K.get_mat("window_warm")))
    return o


def bicycle_parked(K):
    # bike rack: two inverted-U hoops
    o = []
    for y in (-1.2, 1.2):
        o.append(K.box("hoop-leg-l", 0.06, 0.06, 0.7, x=-0.5, y=y, z=0.0,
                       mat=K.get_mat_metal("metal_dark")))
        o.append(K.box("hoop-leg-r", 0.06, 0.06, 0.7, x=0.5, y=y, z=0.0,
                       mat=K.get_mat_metal("metal_dark")))
        o.append(K.box("hoop-top", 1.06, 0.06, 0.06, y=y, z=0.7,
                       mat=K.get_mat_metal("metal_dark")))
    # parked bike leaning on the rack
    o.append(K.cyl("wheel-f", 0.34, 0.05, verts=12, x=0.12, y=0.75, z=0.3,
                   rot=(0, math.radians(90), 0), mat=K.get_mat("charcoal")))
    o.append(K.cyl("wheel-r", 0.34, 0.05, verts=12, x=-0.18, y=-0.75, z=0.3,
                   rot=(0, math.radians(90), 0), mat=K.get_mat("charcoal")))
    o.append(K.box("beam", 0.05, 1.4, 0.05, x=-0.02, z=0.34,
                   rot=(math.radians(8), 0, 0), mat=K.get_mat("bus_green")))
    o.append(K.box("post-f", 0.05, 0.05, 0.5, x=0.1, y=0.72, z=0.34,
                   mat=K.get_mat("charcoal")))
    o.append(K.box("bars", 0.5, 0.05, 0.05, x=0.1, y=0.72, z=0.85,
                   mat=K.get_mat("charcoal")))
    o.append(K.box("saddle", 0.16, 0.3, 0.06, x=-0.2, y=-0.7, z=0.82,
                   mat=K.get_mat("charcoal")))
    return o


def playground_set(K):
    o = [K.box("sandbox", 8.0, 8.0, 0.15, mat=K.get_mat("sand"))]
    # swing frame: two A-frames + crossbar
    for ax in (-3.0, 3.0):
        for s in (-1, 1):
            o.append(K.box("a-leg", 0.15, 0.15, 2.6, x=ax, y=s * 0.9, z=0.15,
                           rot=(math.radians(14 * s), 0, 0),
                           mat=K.get_mat_metal("metal_dark")))
        o.append(K.box("a-top", 2.2, 0.15, 0.15, x=ax, z=2.7,
                       mat=K.get_mat_metal("metal_dark")))
    o.append(K.box("crossbar", 6.4, 0.12, 0.12, z=2.7,
                   mat=K.get_mat_metal("metal_dark")))
    for sx in (-1.5, 1.5):
        for s in (-1, 1):
            o.append(K.box("chain", 0.03, 0.03, 1.1, x=sx + 0.25 * s, z=1.7,
                           mat=K.get_mat("charcoal")))
        o.append(K.box("seat", 0.6, 0.15, 0.06, x=sx, z=1.15,
                       mat=K.get_mat("bus_green" if sx < 0 else "mango")))
    # slide: platform + chute + ladder
    o.append(K.box("platform", 1.2, 1.2, 0.15, x=4.0, y=3.0, z=1.6,
                   mat=K.get_mat("timber")))
    for s in (-1, 1):
        for t in (-1, 1):
            o.append(K.box("platform-leg", 0.12, 0.12, 1.6, x=4.0 + 0.45 * s,
                           y=3.0 + 0.45 * t, z=0.15, mat=K.get_mat("timber_dark")))
    o.append(K.box("chute", 1.0, 2.6, 0.08, x=4.0, y=4.6, z=1.1,
                   rot=(math.radians(-30), 0, 0), mat=K.get_mat("sea")))
    for i in range(4):
        o.append(K.box("ladder-rung", 0.7, 0.08, 0.08, x=4.0, y=2.0 + i * 0.28,
                       z=0.35 + i * 0.3, mat=K.get_mat("timber")))
    for s in (-1, 1):
        o.append(K.box("ladder-rail", 0.08, 1.6, 0.08, x=4.0 + 0.35 * s, y=2.6,
                       z=0.9, rot=(math.radians(-32), 0, 0),
                       mat=K.get_mat("timber_dark")))
    return o


def scaffold_section(K):
    h = 6.0
    o = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            o.append(K.box("post", 0.12, 0.12, h, x=sx * 2.0, y=sy * 2.0, z=0.0,
                           mat=K.get_mat_metal("metal")))
    for z in (0.05, h / 2, h):
        for sy in (-1, 1):
            o.append(K.box("frame-x", 4.2, 0.1, 0.1, y=sy * 2.0, z=z,
                           mat=K.get_mat("metal_dark")))
        for sx in (-1, 1):
            o.append(K.box("frame-y", 0.1, 4.2, 0.1, x=sx * 2.0, z=z,
                           mat=K.get_mat("metal_dark")))
    # deck
    o.append(K.box("deck", 4.4, 4.4, 0.08, z=h / 2 + 0.1, mat=K.get_mat("timber_light")))
    # diagonal brace on one face
    o.append(K.box("brace", 0.08, 5.2, 0.08, x=2.0, rot=(math.radians(45), 0, 0),
                   z=h / 2, mat=K.get_mat_metal("metal")))
    # toe boards
    for sy in (-1, 1):
        o.append(K.box("toe", 4.2, 0.06, 0.25, y=sy * 2.1, z=h / 2 + 0.1,
                       mat=K.get_mat("mango")))
    return o


def construction_crane(K):
    h = 14.0
    o = [K.box("base", 3.0, 3.0, 1.0, mat=K.get_mat("charcoal"))]
    # lattice tower (stacked frames)
    for i in range(5):
        z = 1.0 + i * (h / 5)
        for sx in (-1, 1):
            for sy in (-1, 1):
                o.append(K.box("t-post", 0.14, 0.14, h / 5, x=sx * 0.8, y=sy * 0.8,
                               z=z, mat=K.get_mat_metal("metal_dark")))
        for sy in (-1, 1):
            o.append(K.box("t-frame", 1.8, 0.1, 0.1, y=sy * 0.8, z=z + h / 10,
                           mat=K.get_mat("metal_dark")))
    # cab + jib
    o.append(K.box("cab", 1.2, 1.2, 1.0, z=1.0 + h, mat=K.get_mat("mango")))
    o.append(K.box("cab-glass", 1.0, 0.1, 0.7, z=1.0 + h + 0.15, y=-0.6,
                   mat=K.get_mat_glass("glass_cool")))
    o.append(K.box("jib", 0.3, 11.0, 0.5, y=5.2, z=2.2 + h, mat=K.get_mat("mango")))
    o.append(K.box("counter-jib", 0.3, 4.0, 0.5, y=-2.0, z=2.2 + h,
                   mat=K.get_mat("mango")))
    o.append(K.box("counterweight", 1.0, 1.4, 0.8, y=-3.6, z=2.2 + h,
                   mat=K.get_mat_metal("metal_dark")))
    # tie rods: tower top down to the jib
    for sx in (-1, 1):
        o.append(K.box("tie", 0.06, 7.5, 0.06, x=sx * 0.35, y=2.9,
                       z=15.2, rot=(math.radians(-32), 0, 0),
                       mat=K.get_mat("charcoal")))
    # trolley, cable, hook
    o.append(K.box("trolley", 0.4, 0.4, 0.3, y=6.5, z=1.8 + h,
                   mat=K.get_mat("charcoal")))
    o.append(K.box("cable", 0.05, 0.05, 4.5, y=6.5, z=-2.3 + h,
                   mat=K.get_mat("charcoal")))
    o.append(K.box("hook", 0.2, 0.2, 0.5, y=6.5, z=-2.85 + h,
                   mat=K.get_mat_metal("metal")))
    return o


def seagull(K):
    o = [K.ico("body", 0.28, z=0.42, mat=K.get_mat("white"), detail=1)]
    o.append(K.ico("head", 0.16, x=0.0, y=0.3, z=0.62, mat=K.get_mat("white"),
                   detail=1))
    o.append(K.cone("beak", 0.05, 0.22, verts=6, y=0.45, z=0.6,
                    rot=(math.radians(-90), 0, 0), mat=K.get_mat("food_yellow")))
    for sx in (-1, 1):
        o.append(K.box("eye", 0.03, 0.03, 0.03, x=sx * 0.11, y=0.4, z=0.66,
                       mat=K.get_mat("charcoal")))
    # folded wings
    for sx in (-1, 1):
        o.append(K.box("wing", 0.22, 0.7, 0.06, x=sx * 0.26, y=-0.05, z=0.52,
                       rot=(0, 0, math.radians(-14 * sx)),
                       mat=K.get_mat("metal")))
    o.append(K.cone("tail", 0.12, 0.3, verts=6, y=-0.42, z=0.48,
                    rot=(math.radians(90), 0, 0), mat=K.get_mat("white")))
    for sx in (-1, 1):
        o.append(K.box("leg", 0.025, 0.025, 0.18, x=sx * 0.08, z=0.12,
                       mat=K.get_mat("food_yellow")))
        o.append(K.box("foot", 0.05, 0.1, 0.02, x=sx * 0.08, z=0.0,
                       mat=K.get_mat("food_yellow")))
    return o


SPECS = [
    ("building.city-hall", city_hall, "building", (24.2, 18.6, 13.2)),
    ("building.courthouse", courthouse, "building", (22.2, 16.2, 11.5)),
    ("building.school", school, "building", (24.3, 19.1, 7.2)),
    ("building.university", university, "building", (28.1, 18.2, 8.5)),
    ("building.waste-recycling", waste_recycling, "building", (20.2, 14.2, 5.5)),
    ("building.substation", substation, "building", (18.2, 12.2, 3.2)),
    ("prop.utility-pole", utility_pole, "prop", (3.0, 3.0, 8.5)),
    ("prop.utility-box", utility_box, "prop", (1.5, 1.0, 1.7)),
    ("prop.parking-meter", parking_meter, "prop", (0.6, 0.6, 1.7)),
    ("prop.vending-machine", vending_machine, "prop", (1.3, 1.0, 2.1)),
    ("prop.bicycle-parked", bicycle_parked, "prop", (1.8, 3.0, 1.0)),
    ("prop.playground-set", playground_set, "prop", (8.5, 8.5, 2.9)),
    ("prop.scaffold-section", scaffold_section, "prop", (4.6, 4.6, 6.2)),
    ("prop.construction-crane", construction_crane, "prop", (4.5, 17.5, 18.5)),
    ("prop.seagull", seagull, "prop", (1.0, 1.1, 1.0)),
]


def build(lib):
    reports = []
    for entry in SPECS:
        fid, fn, cat, expect = entry
        rep, obj = lib.family(fid, fn, cat, lib, expect=expect)
        reports.append(rep)
        lib.shelf_add(obj, cat)
    return reports
