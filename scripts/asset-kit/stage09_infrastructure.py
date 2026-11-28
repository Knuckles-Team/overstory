"""stage09_infrastructure.py — infrastructure & utility landmark families (R048.10).

Grid: 4 m module. Storey 3.2 m. Doors 2.1-2.4 m (R048 review ruler).
Each family reads its use at street height through silhouette and
functional detail: watch towers, cooling structures, gantries, yard
track, forecourt canopies.
"""
import math


def _windows(K, w, n, z, fixed=-2.05, side=False, mat="glass_dark"):
    o = []
    span = w / n
    for i in range(n):
        p = -w / 2 + span / 2 + i * span
        if side:
            o.append(K.box("glass", 0.12, min(1.4, span * 0.6), 1.3, x=fixed, y=p, z=z,
                           mat=K.get_mat_glass(mat)))
        else:
            o.append(K.box("glass", min(1.4, span * 0.6), 0.12, 1.3, x=p, y=fixed, z=z,
                           mat=K.get_mat_glass(mat)))
    return o


def _roof(K, w, d, z, mat="stone_pale"):
    o = [K.box("roof-slab", w + 0.1, d + 0.1, 0.15, z=z, mat=K.get_mat(mat))]
    for (x, y, pw, pd) in [(-w / 2, 0, 0.25, d), (w / 2, 0, 0.25, d),
                           (0, -d / 2, w, 0.25), (0, d / 2, w, 0.25)]:
        o.append(K.box("parapet", pw, pd, 0.5, x=x, y=y, z=z + 0.15, mat=K.get_mat(mat)))
    return o


def _flag(K, x, y, z, pole_h=2.4, mat="turquoise"):
    o = [K.cyl("flag-pole", 0.05, pole_h, verts=6, x=x, y=y, z=z, mat=K.get_mat_metal("metal"))]
    o.append(K.box("flag", 0.6, 0.05, 0.4, x=x + 0.32, y=y, z=z + pole_h - 0.45,
                   mat=K.get_mat(mat)))
    return o


def police_station(K):
    o = [K.box("plinth", 12.6, 8.6, 0.6, mat=K.get_mat("stone_pale"))]
    o.append(K.box("shell", 12.0, 8.0, 6.4, z=0.6, mat=K.get_mat("white")))
    o.extend(_windows(K, 7.0, 4, 4.5, fixed=-4.05))
    o.extend(_windows(K, 7.0, 4, 4.5, fixed=4.05))
    o.extend(_windows(K, 7.0, 4, 1.9, fixed=4.05, mat="glass_cool"))
    # entry portico (front, -Y)
    for x in (-1.2, 1.2):
        o.append(K.cyl("col", 0.18, 2.4, verts=8, x=x, y=-4.6, z=0.6, mat=K.get_mat("white")))
    o.append(K.box("canopy", 3.4, 1.6, 0.12, y=-4.7, z=3.0, mat=K.get_mat("stone_pale")))
    o.append(K.box("door", 1.2, 0.1, 2.3, y=-4.02, z=0.6, mat=K.get_mat("charcoal")))
    # sign band
    o.append(K.box("sign", 5.0, 0.12, 0.6, y=-4.06, z=4.7, mat=K.get_mat("police_blue")))
    o.append(K.box("sign-bar", 3.4, 0.14, 0.1, y=-4.07, z=4.85, mat=K.get_mat("white")))
    # watch tower, rear-left corner
    o.append(K.box("tower", 3.0, 3.0, 10.0, x=-4.5, y=2.5, z=0.6, mat=K.get_mat("plaster_warm")))
    o.append(K.box("tower-win", 0.9, 0.12, 1.2, x=-5.52, y=2.5, z=7.6,
                   mat=K.get_mat_glass("glass_cool")))
    o.append(K.box("catwalk", 3.4, 3.4, 0.12, x=-4.5, y=2.5, z=9.2, mat=K.get_mat("stone_pale")))
    for (x, y, pw, pd) in [(-4.5, 4.2, 3.4, 0.16), (-4.5, 0.8, 3.4, 0.16),
                           (-6.2, 2.5, 0.16, 3.4), (-2.8, 2.5, 0.16, 3.4)]:
        o.append(K.box("catwalk-rail", pw, pd, 0.7, x=x, y=y, z=9.32, mat=K.get_mat_metal("metal")))
    o.append(K.box("tower-cap", 3.2, 3.2, 0.3, x=-4.5, y=2.5, z=10.6, mat=K.get_mat("charcoal")))
    o.extend(_flag(K, -5.2, 1.8, 10.9))
    o.extend(_roof(K, 12.0, 8.0, 7.0))
    o.append(K.box("ac", 1.0, 0.8, 0.5, x=3.0, y=1.0, z=7.15, mat=K.get_mat_metal("steel")))
    return o


def firehouse(K):
    o = [K.box("plinth", 14.6, 10.6, 0.6, mat=K.get_mat("stone_pale"))]
    o.append(K.box("shell", 14.0, 10.0, 7.0, z=0.6, mat=K.get_mat("plaster_warm")))
    # three roller bays on the front face
    for x in (-4.0, 0.0, 4.0):
        o.append(K.box("bay-frame", 3.6, 0.1, 3.4, x=x, y=-5.02, z=1.0, mat=K.get_mat("charcoal")))
        o.append(K.box("shutter", 3.2, 0.14, 3.0, x=x, y=-5.05, z=1.2,
                       mat=K.get_mat_metal("metal_dark")))
        for z in (1.9, 2.6, 3.3, 4.0):
            o.append(K.box("slat", 3.2, 0.15, 0.04, x=x, y=-5.06, z=z, mat=K.get_mat("metal")))
    o.append(K.box("ped-door", 0.9, 0.1, 2.2, x=6.2, y=-5.04, z=0.6, mat=K.get_mat("charcoal")))
    # upper window rows
    o.extend(_windows(K, 9.0, 4, 5.6, fixed=-5.05, mat="glass_cool"))
    o.extend(_windows(K, 12.0, 5, 5.6, fixed=5.05, side=True, mat="glass_cool"))
    o.extend(_windows(K, 12.0, 5, 5.6, fixed=-5.05, side=True, mat="glass_cool"))
    # red service band
    o.append(K.box("band-f", 14.02, 0.1, 0.5, y=-5.02, z=4.6, mat=K.get_mat("red_paint")))
    o.append(K.box("band-l", 0.1, 10.02, 0.5, x=-7.02, z=4.6, mat=K.get_mat("red_paint")))
    o.append(K.box("band-r", 0.1, 10.02, 0.5, x=7.02, z=4.6, mat=K.get_mat("red_paint")))
    # standpipe over the bays
    for x in (-5.2, 5.2):
        o.append(K.cyl("stand-pipe", 0.12, 1.2, verts=8, x=x, y=-5.5, z=5.1,
                       mat=K.get_mat_metal("metal")))
    o.append(K.box("stand-rail", 10.4, 0.1, 0.1, y=-5.5, z=5.4, mat=K.get_mat_metal("metal")))
    o.extend(_roof(K, 14.0, 10.0, 7.6))
    o.append(K.box("cupola", 2.4, 2.4, 0.9, z=8.25, mat=K.get_mat("white")))
    o.append(K.box("cupola-cap", 2.6, 2.6, 0.15, z=9.15, mat=K.get_mat("charcoal")))
    return o


def hospital(K):
    o = [K.box("plinth", 20.6, 12.6, 0.6, mat=K.get_mat("stone_pale"))]
    o.append(K.box("wing", 20.0, 12.0, 6.4, z=0.6, mat=K.get_mat("white")))
    o.extend(_windows(K, 16.0, 8, 4.4, fixed=-6.05))
    o.extend(_windows(K, 16.0, 8, 4.4, fixed=6.05))
    o.extend(_windows(K, 16.0, 8, 1.8, fixed=-6.05, mat="glass_cool"))
    o.extend(_windows(K, 10.0, 5, 1.8, fixed=6.05, mat="glass_cool"))
    # central tower
    o.append(K.box("tower", 8.0, 8.0, 14.4, z=0.6, mat=K.get_mat("offwhite")))
    for f in range(5):
        z = 2.0 + f * 2.8
        o.append(K.box("tower-glass", 7.4, 0.12, 1.6, y=-4.06, z=z,
                       mat=K.get_mat_glass("glass_cool")))
        o.append(K.box("tower-band", 8.02, 8.02, 0.2, z=z - 0.7, mat=K.get_mat("terracotta")))
    # red cross panel on the tower front
    o.append(K.box("cross-v", 0.5, 0.14, 1.8, y=-4.07, z=11.0, mat=K.get_mat("red_paint")))
    o.append(K.box("cross-h", 1.8, 0.14, 0.5, y=-4.07, z=11.0, mat=K.get_mat("red_paint")))
    # entrance canopy + columns
    o.append(K.box("canopy", 8.0, 3.0, 0.14, y=-7.5, z=4.2, mat=K.get_mat("stone_pale")))
    for x in (-3.2, 3.2):
        o.append(K.cyl("col", 0.2, 3.6, verts=8, x=x, y=-8.2, z=0.6, mat=K.get_mat("white")))
    o.append(K.box("door", 3.0, 0.12, 2.6, y=-6.02, z=0.6, mat=K.get_mat_glass("glass_dark")))
    o.extend(_roof(K, 20.0, 12.0, 7.0))
    o.append(K.box("hvac-1", 1.6, 1.0, 0.7, x=-7.0, y=3.0, z=7.15, mat=K.get_mat_metal("steel")))
    o.append(K.box("hvac-2", 1.2, 1.0, 0.6, x=-5.2, y=3.0, z=7.15, mat=K.get_mat_metal("steel")))
    return o


def energy_plant(K):
    o = [K.box("pad", 24.6, 14.6, 0.4, mat=K.get_mat("paving"))]
    # turbine hall, stadium plan: box with vertical-cylinder rounded ends
    o.append(K.box("hall", 12.0, 7.0, 5.5, x=-2.0, z=0.4, mat=K.get_mat("metal_dark")))
    for sx in (-1.0, 1.0):
        o.append(K.cyl("hall-end", 3.5, 5.5, verts=12, x=-2.0 + sx * 6.0,
                       z=0.4, mat=K.get_mat("metal_dark")))
    for i in range(3):
        o.append(K.box("hall-rib", 0.25, 7.4, 6.0, x=-5.5 + i * 3.0, z=0.4,
                       mat=K.get_mat("metal")))
    o.extend(_windows(K, 9.0, 4, 3.0, fixed=-3.72, mat="glass_cool"))
    # hyperbolic cooling tower: three stacked cylinder segments
    o.append(K.cyl("ct-1", 4.6, 3.0, verts=12, x=7.5, y=-2.5, z=0.4, mat=K.get_mat("offwhite")))
    o.append(K.cyl("ct-2", 3.4, 4.0, verts=12, x=7.5, y=-2.5, z=3.4, mat=K.get_mat("offwhite")))
    o.append(K.cyl("ct-3", 4.2, 3.4, verts=12, x=7.5, y=-2.5, z=7.4, r2=4.4,
                   mat=K.get_mat("offwhite")))
    o.append(K.cyl("ct-flue", 2.6, 0.8, verts=12, x=7.5, y=-2.5, z=10.8,
                   mat=K.get_mat("charcoal")))
    # chimney
    o.append(K.cyl("stack", 1.4, 14.0, verts=10, x=7.5, y=3.6, z=0.4, mat=K.get_mat("steel")))
    o.append(K.cyl("stack-band", 1.45, 1.2, verts=10, x=7.5, y=3.6, z=13.0,
                   mat=K.get_mat("red_paint")))
    # fuel silos
    for i, x in enumerate((-10.5, -7.5)):
        o.append(K.cyl("silo", 1.8, 5.0, verts=10, x=x, y=4.0, z=0.4, mat=K.get_mat("steel")))
        o.append(K.cone("silo-cap", 1.8, 1.0, verts=10, x=x, y=4.0, z=5.4,
                        mat=K.get_mat_metal("metal_dark")))
    return o


def water_works(K):
    o = [K.box("pad", 18.6, 12.6, 0.4, mat=K.get_mat("paving"))]
    # four round tanks with domed caps
    for i, x in enumerate((-6.6, -2.2, 2.2, 6.6)):
        o.append(K.cyl("tank", 2.4, 4.6, verts=12, x=x, y=-2.4, z=0.4, mat=K.get_mat("steel")))
        o.append(K.ico("dome", 2.0, x=x, y=-2.4, z=5.0, mat=K.get_mat("offwhite"), detail=1))
        o.append(K.cyl("tank-ring", 2.45, 0.3, verts=12, x=x, y=-2.4, z=2.6,
                       mat=K.get_mat_metal("metal_dark")))
    # pump house
    o.append(K.box("pump", 6.0, 5.0, 3.6, x=-3.0, y=3.6, z=0.4, mat=K.get_mat("plaster_warm")))
    o.extend(_windows(K, 4.0, 2, 2.2, fixed=1.12, mat="glass_cool"))
    o.append(K.box("pump-roof", 6.3, 5.3, 0.15, x=-3.0, y=3.6, z=4.0, mat=K.get_mat("charcoal")))
    # chlorine building
    o.append(K.box("chem", 4.0, 4.0, 2.8, x=4.2, y=3.6, z=0.4, mat=K.get_mat("cream")))
    o.append(K.box("chem-roof", 4.3, 4.3, 0.15, x=4.2, y=3.6, z=3.2, mat=K.get_mat("charcoal")))
    # connecting pipes (laid along X; z = axis height - h/2)
    for z in (1.2, 1.8):
        o.append(K.cyl("pipe", 0.14, 13.0, verts=6, x=0.0, y=-2.4, z=z - 6.5,
                       rot=(0, math.radians(90), 0), mat=K.get_mat_metal("metal")))
    o.append(K.box("valve", 0.5, 0.5, 0.5, x=3.4, y=-2.4, z=1.4, mat=K.get_mat("red_paint")))
    return o


def funeral_home(K):
    o = [K.box("plinth", 12.6, 8.6, 0.5, mat=K.get_mat("stone_pale"))]
    o.append(K.box("shell", 12.0, 8.0, 4.6, z=0.5, mat=K.get_mat("cream")))
    o.extend(_windows(K, 8.0, 4, 3.2, fixed=-4.05, mat="glass_cool"))
    o.extend(_windows(K, 8.0, 4, 3.2, fixed=4.05, mat="glass_cool"))
    # portico with pediment
    for x in (-1.5, 1.5):
        o.append(K.box("col", 0.24, 0.24, 2.6, x=x, y=-4.5, z=0.5, mat=K.get_mat("white")))
    o.append(K.box("canopy", 4.2, 1.6, 0.14, y=-4.7, z=3.1, mat=K.get_mat("white")))
    o.append(K.box("pediment", 4.2, 0.8, 0.5, y=-4.5, z=3.24,
                   rot=(math.radians(-30), 0, 0), mat=K.get_mat("white")))
    o.append(K.box("door", 1.4, 0.1, 2.4, y=-4.02, z=0.5, mat=K.get_mat("timber")))
    # clock tower
    o.append(K.box("tower", 3.0, 3.0, 8.0, x=4.2, y=2.4, z=0.5, mat=K.get_mat("stone_pale")))
    o.append(K.box("clock", 1.2, 0.1, 1.2, x=5.22, y=2.4, z=6.2, mat=K.get_mat("white")))
    o.append(K.box("clock-rim", 1.4, 0.12, 1.4, x=5.22, y=2.4, z=6.2,
                   mat=K.get_mat_metal("metal_dark")))
    o.append(K.box("tower-roof", 3.3, 3.3, 1.1, x=4.2, y=2.4, z=8.5,
                   mat=K.get_mat("charcoal")))
    o.append(K.prism("tower-spire", [(2.8, 1.0), (5.6, 1.0), (5.6, 3.8),
                                     (2.8, 3.8), (4.2, 2.4)], 1.4, z=9.6,
                     mat=K.get_mat_metal("metal_dark")))
    # roof
    o.append(K.box("roof-slab", 12.3, 8.3, 0.15, z=5.1, mat=K.get_mat("charcoal")))
    for (x, y, pw, pd) in [(-6.0, 0, 0.25, 8.3), (6.0, 0, 0.25, 8.3),
                           (0, -4.15, 12.3, 0.25), (0, 4.15, 12.3, 0.25)]:
        o.append(K.box("parapet", pw, pd, 0.4, x=x, y=y, z=5.25, mat=K.get_mat("stone_pale")))
    return o


def train_station(K):
    o = [K.box("plinth", 24.6, 14.6, 0.6, mat=K.get_mat("stone_pale"))]
    o.append(K.box("shell", 24.0, 14.0, 6.0, z=0.6, mat=K.get_mat("plaster_warm")))
    # grand window row
    o.extend(_windows(K, 16.0, 8, 3.6, fixed=-7.05, mat="glass_cool"))
    o.extend(_windows(K, 16.0, 8, 3.6, fixed=7.05, mat="glass_cool"))
    # arched entrance (front)
    o.append(K.box("entry", 4.0, 0.14, 3.4, y=-7.03, z=0.6, mat=K.get_mat("charcoal")))
    o.append(K.box("arch", 4.4, 0.2, 1.2, y=-7.05, z=4.0, mat=K.get_mat("stone_pale")))
    # clock tower
    o.append(K.box("tower", 4.0, 4.0, 10.0, y=-2.0, z=0.6, mat=K.get_mat("stone_pale")))
    o.append(K.box("clock", 2.0, 0.12, 2.0, x=0.0, y=-4.07, z=8.4, mat=K.get_mat("white")))
    o.append(K.box("clock-rim", 2.3, 0.14, 2.3, x=0.0, y=-4.07, z=8.4,
                   mat=K.get_mat_metal("metal_dark")))
    for (x, y) in [(-1.2, -3.2), (1.2, -3.2), (-1.2, -0.8), (1.2, -0.8)]:
        o.append(K.box("tower-win", 0.6, 0.1, 1.0, x=x, y=-4.02, z=6.0,
                       mat=K.get_mat_glass("glass_cool")))
    o.append(K.prism("tower-roof", [(-2.1, -4.1), (2.1, -4.1), (2.1, 0.1),
                                    (-2.1, 0.1), (0.0, -2.0)], 1.6, z=10.6,
                     mat=K.get_mat_metal("metal_dark")))
    # platform canopies (front)
    for x in (-7.0, 7.0):
        o.append(K.box("canopy", 5.0, 3.0, 0.14, x=x, y=-9.0, z=4.6, mat=K.get_mat("charcoal")))
        for cx in (x - 2.2, x + 2.2):
            o.append(K.cyl("canopy-post", 0.12, 4.0, verts=6, x=cx, y=-9.0, z=0.6,
                           mat=K.get_mat_metal("metal")))
    o.extend(_roof(K, 24.0, 14.0, 6.6))
    return o


def bus_station(K):
    o = [K.box("plinth", 20.6, 10.6, 0.5, mat=K.get_mat("paving"))]
    o.append(K.box("shell", 20.0, 9.0, 4.2, z=0.5, mat=K.get_mat("offwhite")))
    # long glass front
    o.append(K.box("glazing", 18.0, 0.14, 2.4, y=-4.52, z=1.0, mat=K.get_mat_glass("glass_cool")))
    for x in range(-8, 9, 4):
        o.append(K.box("mullion", 0.1, 0.2, 2.4, x=x, y=-4.54, z=1.0, mat=K.get_mat("charcoal")))
    o.append(K.box("door", 1.6, 0.1, 2.4, x=7.0, y=-4.54, z=1.0, mat=K.get_mat_glass("glass_dark")))
    # route sign band
    o.append(K.box("sign", 16.0, 0.12, 0.55, y=-4.56, z=3.7, mat=K.get_mat("charcoal")))
    for i, x in enumerate((-6.0, -2.0, 2.0, 6.0)):
        o.append(K.box("sign-tab", 1.4, 0.14, 0.3, x=x, y=-4.57, z=3.7,
                       mat=K.get_mat("turquoise" if i % 2 else "mango")))
    # forecourt canopy over the bays
    o.append(K.box("canopy", 18.0, 4.0, 0.12, y=-8.0, z=4.0, mat=K.get_mat("charcoal")))
    for x in (-7.0, 0.0, 7.0):
        o.append(K.cyl("canopy-post", 0.14, 3.5, verts=8, x=x, y=-9.0, z=0.5,
                       mat=K.get_mat_metal("metal")))
    o.extend(_roof(K, 20.0, 9.0, 4.7))
    o.append(K.box("ac", 1.4, 1.0, 0.5, x=8.0, y=2.0, z=4.85, mat=K.get_mat_metal("steel")))
    return o


def airport_terminal(K):
    o = [K.box("pad", 28.6, 12.6, 0.4, mat=K.get_mat("paving"))]
    o.append(K.box("terminal", 28.0, 12.0, 4.6, z=0.4, mat=K.get_mat_glass("glass_cool")))
    for i in range(11):
        o.append(K.box("mullion", 0.12, 12.1, 4.6, x=-12.5 + i * 2.5, z=0.4,
                       mat=K.get_mat("charcoal")))
    o.append(K.box("floor", 28.0, 12.0, 0.5, z=0.4, mat=K.get_mat("offwhite")))
    # upturned roof edges
    o.append(K.box("roof", 28.4, 12.4, 0.18, z=5.0, mat=K.get_mat("white")))
    o.append(K.box("roof-wing-l", 28.4, 1.6, 0.5, y=-6.2, z=5.0,
                   rot=(math.radians(-14), 0, 0), mat=K.get_mat("white")))
    o.append(K.box("roof-wing-r", 28.4, 1.6, 0.5, y=6.2, z=5.0,
                   rot=(math.radians(14), 0, 0), mat=K.get_mat("white")))
    # control tower
    o.append(K.cyl("tower-stem", 1.2, 7.0, verts=10, x=13.0, y=4.0, z=0.4,
                   mat=K.get_mat("offwhite")))
    o.append(K.box("tower-cab", 4.0, 4.0, 1.8, x=13.0, y=4.0, z=7.4,
                   mat=K.get_mat_glass("glass_dark")))
    o.append(K.box("tower-cap", 4.4, 4.4, 0.3, x=13.0, y=4.0, z=9.2,
                   mat=K.get_mat("charcoal")))
    o.append(K.cyl("radar", 0.9, 0.25, verts=8, x=13.0, y=4.0, z=9.5,
                   mat=K.get_mat("white")))
    # jet-bridge stubs
    for y in (-3.0, 3.0):
        o.append(K.box("bridge", 0.9, 4.0, 0.8, x=13.6, y=y - 1.6, z=2.4,
                       rot=(math.radians(8), 0, 0), mat=K.get_mat_metal("metal")))
    return o


def shipyard(K):
    o = [K.box("quay", 24.6, 16.6, 0.4, mat=K.get_mat("paving"))]
    # gantry crane: portal legs + beam + trolley + cable + container
    for x in (-8.0, -2.0):
        o.append(K.box("crane-leg", 0.6, 2.4, 8.0, x=x, z=0.4, mat=K.get_mat("mango")))
    o.append(K.box("crane-beam", 8.0, 0.8, 0.9, x=-5.0, z=8.4, mat=K.get_mat("mango")))
    o.append(K.box("trolley", 1.2, 1.0, 0.5, x=-5.0, z=8.0, mat=K.get_mat_metal("metal_dark")))
    o.append(K.box("cable", 0.06, 0.06, 3.0, x=-5.0, z=5.0, mat=K.get_mat_metal("metal_dark")))
    o.append(K.box("load", 2.4, 1.6, 1.4, x=-5.0, z=3.6, mat=K.get_mat("sea")))
    # warehouse with gable roof
    o.append(K.box("ware", 12.0, 8.0, 4.0, x=6.0, y=-3.0, z=0.4, mat=K.get_mat("offwhite")))
    o.append(K.box("ware-roof-l", 12.4, 4.2, 0.15, x=6.0, y=-5.0, z=4.4,
                   rot=(math.radians(22), 0, 0), mat=K.get_mat("charcoal")))
    o.append(K.box("ware-roof-r", 12.4, 4.2, 0.15, x=6.0, y=-1.0, z=4.4,
                   rot=(math.radians(-22), 0, 0), mat=K.get_mat("charcoal")))
    for i in range(3):
        o.append(K.box("ware-door", 2.4, 0.14, 2.8, x=3.5 + i * 3.0, y=-7.06, z=0.4,
                       mat=K.get_mat_metal("metal_dark")))
    # dry-dock basin
    o.append(K.box("dock-rim", 8.0, 6.0, 0.6, x=-3.0, y=5.2, z=0.4,
                   mat=K.get_mat("stone_pale")))
    o.append(K.box("dock-floor", 6.8, 4.8, 0.2, x=-3.0, y=5.2, z=0.1,
                   mat=K.get_mat("asphalt_wet")))
    # pipe rack: three parallel pipes on short trestles (laid along X)
    for i in range(3):
        o.append(K.cyl("pipe", 0.18, 8.0, verts=6, x=5.0, y=6.0 + i * 0.45, z=-2.4,
                       rot=(0, math.radians(90), 0), mat=K.get_mat("steel")))
    for x in (1.5, 8.5):
        o.append(K.box("rack", 0.3, 1.6, 1.2, x=x, y=6.45, z=0.4,
                       mat=K.get_mat_metal("metal_dark")))
    return o


def train_yard(K):
    o = [K.box("ballast", 24.6, 16.6, 0.3, mat=K.get_mat("paving_joint"))]
    # rail lines
    for y in (-5.0, -1.0, 3.0):
        for x in (-9.0, 9.0):
            pass
        for r in (-0.6, 0.6):
            o.append(K.box("rail", 18.0, 0.12, 0.1, x=0.0, y=y + r, z=0.4,
                           mat=K.get_mat_metal("metal_dark")))
        for i in range(12):
            o.append(K.box("sleeper", 0.5, 1.6, 0.08, x=-8.0 + i * 1.45, y=y, z=0.34,
                           mat=K.get_mat("timber")))
    # parked freight cars
    o.append(K.box("boxcar-frame", 2.2, 6.0, 0.5, x=-3.0, y=-5.0, z=0.5,
                   mat=K.get_mat_metal("metal_dark")))
    o.append(K.box("boxcar", 2.4, 6.0, 2.6, x=-3.0, y=-5.0, z=1.0, mat=K.get_mat("sea")))
    o.append(K.cyl("tankcar", 1.2, 5.6, verts=10, x=3.0, y=-5.0, z=-0.7,
                   rot=(0, math.radians(90), 0), mat=K.get_mat_metal("steel")))
    o.append(K.box("tank-frame", 2.0, 5.0, 0.4, x=3.0, y=-5.0, z=0.5,
                   mat=K.get_mat_metal("metal_dark")))
    # roundhouse shed
    o.append(K.box("shed", 8.0, 5.0, 3.4, x=8.0, y=6.0, z=0.4, mat=K.get_mat("terracotta")))
    o.append(K.box("shed-roof", 8.3, 5.3, 0.15, x=8.0, y=6.0, z=3.8,
                   mat=K.get_mat("charcoal")))
    o.append(K.box("shed-door", 3.0, 0.14, 2.6, x=8.0, y=3.46, z=0.4,
                   mat=K.get_mat_metal("metal_dark")))
    # signal masts
    for x in (-10.0, 10.0):
        o.append(K.cyl("mast", 0.1, 3.4, verts=6, x=x, y=-8.0, z=0.3,
                       mat=K.get_mat_metal("metal")))
        o.append(K.box("signal", 0.5, 0.3, 0.9, x=x, y=-8.0, z=2.8,
                       mat=K.get_mat("charcoal")))
        o.append(K.box("light-r", 0.14, 0.14, 0.14, x=x, y=-7.8, z=3.4,
                       mat=K.get_mat("red_paint")))
        o.append(K.box("light-g", 0.14, 0.14, 0.14, x=x, y=-7.8, z=3.0,
                       mat=K.get_mat("food_green")))
    return o


def nuclear_plant(K):
    o = [K.box("pad", 24.6, 14.6, 0.4, mat=K.get_mat("paving"))]
    # two dome containment buildings
    for x in (-6.0, 0.0):
        o.append(K.cyl("pedestal", 4.4, 3.0, verts=14, x=x, y=-2.0, z=0.4,
                       mat=K.get_mat("offwhite")))
        o.append(K.ico("dome", 4.0, x=x, y=-2.0, z=3.4, mat=K.get_mat("white"), detail=2))
        o.append(K.box("door", 1.6, 0.14, 2.4, x=x, y=-6.45, z=0.4,
                       mat=K.get_mat_metal("metal_dark")))
    # turbine hall
    o.append(K.box("hall", 9.0, 7.0, 4.6, x=7.5, z=0.4, mat=K.get_mat("metal_dark")))
    for i in range(3):
        o.append(K.box("hall-rib", 0.22, 7.3, 4.9, x=5.0 + i * 2.0, z=0.4,
                       mat=K.get_mat("metal")))
    # control building
    o.append(K.box("control", 6.0, 5.0, 4.0, x=9.0, y=4.8, z=0.4, mat=K.get_mat("white")))
    o.extend(_windows(K, 4.0, 2, 2.6, fixed=2.28, mat="glass_cool"))
    o.append(K.box("control-roof", 6.3, 5.3, 0.15, x=9.0, y=4.8, z=4.4,
                   mat=K.get_mat("charcoal")))
    # trefoil marker panel
    o.append(K.box("marker", 1.6, 0.12, 1.6, x=3.6, y=4.8, z=2.2, mat=K.get_mat("taxi_yellow")))
    for a in range(3):
        ang = math.radians(90 + a * 120)
        o.append(K.box("marker-wedge", 0.5, 0.14, 0.5,
                       x=3.6 + math.cos(ang) * 0.45, y=4.86, z=2.2 + math.sin(ang) * 0.45,
                       mat=K.get_mat("charcoal")))
    # cooling pond
    o.append(K.box("pond-rim", 6.0, 4.0, 0.4, x=-9.0, y=4.8, z=0.4,
                   mat=K.get_mat("stone_pale")))
    o.append(K.box("pond", 5.2, 3.2, 0.16, x=-9.0, y=4.8, z=0.62,
                   mat=K.get_mat_glass("sea")))
    return o


def coal_plant(K):
    o = [K.box("pad", 22.6, 14.6, 0.4, mat=K.get_mat("paving"))]
    # boiler house
    o.append(K.box("boiler", 10.0, 7.0, 6.0, x=-4.0, z=0.4, mat=K.get_mat("metal_dark")))
    for i in range(3):
        o.append(K.box("boiler-rib", 0.24, 7.3, 6.3, x=-7.0 + i * 3.0, z=0.4,
                       mat=K.get_mat("metal")))
    o.append(K.cyl("boiler-dome", 2.4, 2.6, verts=12, x=-4.0, y=-1.8, z=6.4,
                   mat=K.get_mat("metal")))
    # stack
    o.append(K.cyl("stack", 1.6, 12.0, verts=10, x=-4.0, y=2.6, z=0.4,
                   mat=K.get_mat("charcoal")))
    o.append(K.cyl("stack-band", 1.65, 1.4, verts=10, x=-4.0, y=2.6, z=11.0,
                   mat=K.get_mat("red_paint")))
    # coal tipple: conveyor up to a stockpile
    o.append(K.box("pile", 4.0, 4.0, 2.6, x=7.0, y=-3.0, z=0.4, mat=K.get_mat("charcoal")))
    o.append(K.prism("pile-top", [(5.0, -5.0), (9.0, -5.0), (9.0, -1.0),
                                  (5.0, -1.0), (7.0, -3.0)], 1.2, z=3.0,
                     mat=K.get_mat("charcoal")))
    o.append(K.box("conveyor", 6.0, 0.7, 0.5, x=2.5, y=-3.0, z=2.2,
                   rot=(0, math.radians(-12), 0), mat=K.get_mat_metal("metal_dark")))
    for sx in (-1.0, 1.0):
        o.append(K.box("conveyor-leg", 0.3, 0.3, 2.2, x=2.5 + sx * 2.2, y=-3.0, z=0.4,
                       mat=K.get_mat_metal("metal")))
    # rail spur to the tipple
    for r in (-0.6, 0.6):
        o.append(K.box("rail", 0.12, 4.0, 0.1, x=8.0, y=-3.0 + r, z=0.4,
                       rot=(0, 0, math.radians(90)), mat=K.get_mat_metal("metal_dark")))
    # washery building
    o.append(K.box("washery", 5.0, 5.0, 3.0, x=7.0, y=4.0, z=0.4,
                   mat=K.get_mat("offwhite")))
    o.append(K.box("washery-roof", 5.3, 5.3, 0.15, x=7.0, y=4.0, z=3.4,
                   mat=K.get_mat("charcoal")))
    o.append(K.box("hopper", 2.0, 2.0, 1.4, x=7.0, y=4.0, z=3.55,
                   mat=K.get_mat_metal("steel")))
    return o


SPECS = [
    ("building.police-station", police_station, "building", (13.2, 9.9, 14.0)),
    ("building.firehouse", firehouse, "building", (15.0, 11.2, 10.0)),
    ("building.hospital", hospital, "building", (21.0, 15.8, 16.0)),
    ("building.energy-plant", energy_plant, "building", (24.8, 14.8, 14.6)),
    ("building.water-works", water_works, "building", (19.0, 13.0, 8.0)),
    ("building.funeral-home", funeral_home, "building", (13.0, 9.9, 11.5)),
    ("building.train-station", train_station, "building", (25.0, 18.0, 13.0)),
    ("building.bus-station", bus_station, "building", (21.0, 15.6, 5.5)),
    ("building.airport-terminal", airport_terminal, "building", (29.5, 14.2, 10.0)),
    ("building.shipyard", shipyard, "building", (25.2, 17.0, 10.0)),
    ("building.train-yard", train_yard, "building", (25.0, 17.0, 6.0)),
    ("building.nuclear-plant", nuclear_plant, "building", (25.0, 15.0, 9.0)),
    ("building.coal-plant", coal_plant, "building", (23.0, 15.0, 14.5)),
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
