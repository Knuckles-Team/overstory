"""stage06_buildings.py — landmark building recipes (subassemblies of the
architecture families; shipped as prefabs the generator can place on lots).

Grid: 4 m module. Storey 3.2 m. Doors 2.1-2.4 m (R048 review ruler).
"""
import math


def _windows_row(K, w, n, z, fixed=-2.05, side=False):
    """Window row on a building face. front: runs along X at y=fixed;
    side: runs along Y at x=fixed. Glass sits just proud of the face."""
    o = []
    span = w / n
    for i in range(n):
        p = -w / 2 + span / 2 + i * span
        if side:
            o.append(K.box("glass", 0.12, min(1.2, span * 0.6), 1.2, x=fixed, y=p, z=z,
                           mat=K.get_mat_glass("glass_dark")))
            o.append(K.box("sill", 0.22, min(1.4, span * 0.7), 0.1, x=fixed, y=p,
                           z=z - 0.65, mat=K.get_mat("stone_pale")))
        else:
            o.append(K.box("glass", min(1.2, span * 0.6), 0.12, 1.2, x=p, y=fixed, z=z,
                           mat=K.get_mat_glass("glass_dark")))
            o.append(K.box("sill", min(1.4, span * 0.7), 0.22, 0.1, x=p, y=fixed,
                           z=z - 0.65, mat=K.get_mat("stone_pale")))
    return o


def shop_bakery(K):
    o = [K.box("shell", 4.0, 4.0, 3.4, mat=K.get_mat("plaster_warm"))]
    o.append(K.box("base", 4.05, 4.05, 1.0, mat=K.get_mat("stone_pale")))
    # storefront
    o.append(K.box("glass", 3.0, 0.12, 2.1, y=-2.02, z=2.0, mat=K.get_mat_glass("glass_cool")))
    for x in (-1.0, 0.0, 1.0):
        o.append(K.box("mullion", 0.05, 0.18, 2.1, x=x, y=-2.06, z=2.0, mat=K.get_mat("charcoal")))
    o.append(K.box("door", 0.8, 0.1, 2.0, x=1.15, y=-2.06, z=1.95, mat=K.get_mat("timber")))
    # striped awning
    for i in range(4):
        mat = K.get_mat("mango" if i % 2 else "white")
        o.append(K.box(f"stripe-{i}", 0.8, 1.5, 0.06, x=-1.35 + i * 0.85, y=-2.7, z=3.1,
                       rot=(math.radians(-24), 0, 0), mat=mat))
    # side windows (left face)
    o.extend(_windows_row(K, 3.4, 2, 2.0, fixed=-2.05, side=True))
    # sign
    o.append(K.box("sign", 2.6, 0.12, 0.5, y=-2.0, z=3.05, mat=K.get_mat("cream")))
    o.append(K.box("sign-loaf", 0.5, 0.08, 0.18, x=-0.6, y=-2.06, z=3.05, mat=K.get_mat("mango")))
    # roof
    o.append(K.box("roof-slab", 4.05, 4.05, 0.15, z=3.4, mat=K.get_mat("stone_pale")))
    for (x, y, w, d) in [(-1.9, 0.0, 0.25, 4.05), (1.9, 0.0, 0.25, 4.05),
                         (0.0, -1.9, 4.05, 0.25), (0.0, 1.9, 4.05, 0.25)]:
        o.append(K.box("parapet", w, d, 0.5, x=x, y=y, z=3.55, mat=K.get_mat("stone_pale")))
    o.append(K.box("ac", 0.8, 0.8, 0.5, x=1.1, y=1.1, z=4.05, mat=K.get_mat_metal("steel")))
    return o


def shop_mechanic(K):
    o = [K.box("shell", 8.0, 4.0, 3.6, mat=K.get_mat("terracotta"))]
    o.append(K.box("base", 8.05, 4.05, 1.0, mat=K.get_mat("stone_pale")))
    # two roller bays + pedestrian door
    for x in (-2.5, 0.5):
        o.append(K.box("frame", 2.4, 0.1, 2.6, x=x, y=-2.02, z=2.3, mat=K.get_mat("charcoal")))
        o.append(K.box("shutter", 2.1, 0.14, 2.3, x=x, y=-2.05, z=2.15, mat=K.get_mat_metal("metal_dark")))
        for z in (1.5, 2.0, 2.5, 3.0):
            o.append(K.box("slat", 2.1, 0.15, 0.03, x=x, y=-2.06, z=z, mat=K.get_mat("metal")))
    o.append(K.box("door", 0.9, 0.1, 2.1, x=2.7, y=-2.05, z=2.05, mat=K.get_mat("charcoal")))
    # sign band with tool marks
    o.append(K.box("sign", 7.0, 0.12, 0.5, y=-2.02, z=3.35, mat=K.get_mat("charcoal")))
    o.append(K.box("wrench", 0.5, 0.08, 0.15, x=-1.0, y=-2.08, z=3.35, mat=K.get_mat("mango")))
    o.append(K.box("plate", 1.6, 0.08, 0.22, x=0.9, y=-2.08, z=3.35, mat=K.get_mat("white")))
    # side windows (right face)
    o.extend(_windows_row(K, 3.2, 2, 2.0, fixed=4.05, side=True))
    # roof plant
    o.append(K.box("roof-slab", 8.05, 4.05, 0.15, z=3.6, mat=K.get_mat("stone_pale")))
    for (x, y, w, d) in [(-3.9, 0.0, 0.25, 4.05), (3.9, 0.0, 0.25, 4.05),
                         (0.0, -1.9, 8.05, 0.25), (0.0, 1.9, 8.05, 0.25)]:
        o.append(K.box("parapet", w, d, 0.5, x=x, y=y, z=3.75, mat=K.get_mat("stone_pale")))
    o.append(K.box("hvac-1", 1.2, 0.8, 0.6, x=-2.0, y=1.0, z=4.25, mat=K.get_mat_metal("steel")))
    o.append(K.box("hvac-2", 0.8, 0.8, 0.55, x=-0.6, y=1.0, z=4.25, mat=K.get_mat_metal("steel")))
    o.append(K.box("duct", 2.0, 0.5, 0.5, x=1.8, y=1.0, z=4.25, mat=K.get_mat_metal("metal")))
    o.append(K.cyl("vent", 0.15, 0.9, verts=8, x=3.2, y=1.2, z=4.25, mat=K.get_mat_metal("steel")))
    return o


def apartment_rowhouse(K):
    o = [K.box("shell", 4.0, 4.0, 10.0, mat=K.get_mat("plaster_warm"))]
    o.append(K.box("base", 4.05, 4.05, 1.1, mat=K.get_mat("brick")))
    o.append(K.box("entry", 1.1, 0.1, 2.2, x=1.0, y=-2.05, z=2.1, mat=K.get_mat("timber")))
    o.append(K.box("step", 1.6, 0.3, 0.15, x=1.0, y=-2.3, mat=K.get_mat("stone_pale")))
    for f in range(3):
        z = 2.2 + f * 3.2
        o.append(K.box("glass", 1.6, 0.12, 1.3, x=-0.9, y=-2.05, z=z, mat=K.get_mat_glass("glass_dark")))
        o.append(K.box("sill", 1.8, 0.2, 0.1, x=-0.9, y=-2.08, z=z - 0.7, mat=K.get_mat("stone_pale")))
        o.append(K.box("side-win", 0.12, 1.3, 1.2, x=-2.05, y=-0.9, z=z, mat=K.get_mat_glass("glass_dark")))
        if f == 1:
            o.append(K.box("balcony-slab", 1.6, 0.9, 0.12, x=-0.9, y=-2.55, z=z - 1.15,
                           mat=K.get_mat("stone_pale")))
            o.append(K.box("balcony-rail", 1.6, 0.05, 0.85, x=-0.9, y=-2.98, z=z - 1.15,
                           mat=K.get_mat_metal("metal")))
            o.append(K.box("balcony-door", 0.9, 0.1, 2.0, x=-0.9, y=-2.08, z=z - 0.5,
                           mat=K.get_mat_glass("glass_dark")))
        o.append(K.box("band", 4.05, 4.05, 0.15, z=z - 1.4, mat=K.get_mat("terracotta")))
    # roof
    o.append(K.box("roof-slab", 4.05, 4.05, 0.15, z=10.0, mat=K.get_mat("stone_pale")))
    for (x, y, w, d) in [(-1.9, 0.0, 0.25, 4.05), (1.9, 0.0, 0.25, 4.05),
                         (0.0, -1.9, 4.05, 0.25), (0.0, 1.9, 4.05, 0.25)]:
        o.append(K.box("parapet", w, d, 0.5, x=x, y=y, z=10.15, mat=K.get_mat("stone_pale")))
    o.append(K.box("ac", 0.8, 0.8, 0.5, x=1.0, y=1.0, z=10.65, mat=K.get_mat_metal("steel")))
    return o


def house_detached(K):
    o = [K.box("shell", 6.0, 5.0, 3.2, mat=K.get_mat("plaster_warm"))]
    o.append(K.box("base", 6.05, 5.05, 0.6, mat=K.get_mat("stone_pale")))
    # door + porch
    o.append(K.box("door", 1.0, 0.1, 2.2, x=-1.2, y=-2.55, z=2.3, mat=K.get_mat("timber")))
    for x in (-2.2, -0.2):
        o.append(K.box("porch-post", 0.12, 0.12, 2.2, x=x, y=-3.1, z=2.2, mat=K.get_mat("timber")))
    o.append(K.box("porch-roof", 2.6, 1.2, 0.1, x=-1.2, y=-3.0, z=3.6, mat=K.get_mat("timber_light")))
    # windows with shutters
    for x in (0.8, 2.0):
        o.append(K.box("glass", 0.9, 0.12, 1.1, x=x, y=-2.55, z=2.2, mat=K.get_mat_glass("glass_dark")))
        for s in (-0.62, 0.62):
            o.append(K.box("shutter", 0.3, 0.06, 1.1, x=x + s, y=-2.52, z=2.2,
                           mat=K.get_mat("turquoise")))
    o.append(K.box("glass-side", 0.12, 0.9, 1.1, x=3.05, y=-0.8, z=2.2, mat=K.get_mat_glass("glass_dark")))
    # gable roof
    for s in (-1, 1):
        o.append(K.box("slope", 6.4, 2.6, 0.1, y=s * 1.15, z=4.3, rot=(math.radians(-s * 26), 0, 0),
                       mat=K.get_mat("terracotta")))
    o.append(K.box("ridge", 6.4, 0.16, 0.16, z=4.95, mat=K.get_mat("terracotta")))
    # chimney
    o.append(K.box("chimney", 0.5, 0.5, 1.6, x=1.8, y=1.2, z=4.6, mat=K.get_mat("brick")))
    o.append(K.box("chimney-cap", 0.6, 0.6, 0.12, x=1.8, y=1.2, z=6.2, mat=K.get_mat("stone_pale")))
    return o


def clinic(K):
    o = [K.box("shell", 8.0, 4.0, 6.6, mat=K.get_mat("white"))]
    o.append(K.box("base", 8.05, 4.05, 1.0, mat=K.get_mat("stone_pale")))
    # sign band with cross
    o.append(K.box("sign", 5.0, 0.12, 0.6, y=-2.02, z=5.6, mat=K.get_mat("turquoise")))
    o.append(K.box("cross-v", 0.3, 0.08, 0.34, x=-1.8, y=-2.08, z=5.6, mat=K.get_mat("white")))
    o.append(K.box("cross-h", 0.34, 0.08, 0.3, x=-1.8, y=-2.08, z=5.6, mat=K.get_mat("white")))
    # portal entrance
    o.append(K.box("portal-frame", 2.4, 0.15, 2.6, y=-2.05, z=2.3, mat=K.get_mat("stone_pale")))
    o.append(K.box("glass-door", 1.0, 0.1, 2.1, y=-2.08, z=2.1, mat=K.get_mat_glass("glass_cool")))
    o.append(K.box("canopy", 2.8, 0.9, 0.1, y=-2.45, z=3.6, mat=K.get_mat("stone_pale")))
    # ground-floor glazing flanking the portal (upper windows above)
    for x in (-2.7, 2.7):
        o.append(K.box("glass-gf", 1.1, 0.12, 1.2, x=x, y=-2.05, z=2.1,
                       mat=K.get_mat_glass("glass_dark")))
        o.append(K.box("sill-gf", 1.3, 0.22, 0.1, x=x, y=-2.08, z=1.45,
                       mat=K.get_mat("stone_pale")))
    for x in (-2.8, -1.4, 1.4, 2.8):
        o.append(K.box("glass-2f", 0.9, 0.12, 1.1, x=x, y=-2.05, z=5.4, mat=K.get_mat_glass("glass_dark")))
    # roof
    o.append(K.box("roof-slab", 8.05, 4.05, 0.15, z=6.6, mat=K.get_mat("stone_pale")))
    for (x, y, w, d) in [(-3.9, 0.0, 0.25, 4.05), (3.9, 0.0, 0.25, 4.05),
                         (0.0, -1.9, 8.05, 0.25), (0.0, 1.9, 8.05, 0.25)]:
        o.append(K.box("parapet", w, d, 0.5, x=x, y=y, z=6.75, mat=K.get_mat("white")))
    o.append(K.box("ac", 1.0, 0.8, 0.6, x=2.5, y=1.0, z=7.25, mat=K.get_mat_metal("steel")))
    return o


def security_station(K):
    o = [K.box("shell", 6.0, 4.0, 5.0, mat=K.get_mat("stone_pale"))]
    o.append(K.box("base", 6.05, 4.05, 1.0, mat=K.get_mat("paving_joint")))
    # entrance
    o.append(K.box("portal-frame", 2.2, 0.15, 2.6, y=-2.05, z=2.3, mat=K.get_mat("plaster_warm")))
    o.append(K.box("door", 1.0, 0.1, 2.1, y=-2.08, z=2.1, mat=K.get_mat("charcoal")))
    # windows with bars
    for x in (-2.0, 2.0):
        o.append(K.box("glass", 0.9, 0.12, 1.1, x=x, y=-2.05, z=2.2, mat=K.get_mat_glass("glass_dark")))
        for i in range(3):
            o.append(K.box("bar", 0.04, 0.06, 1.1, x=x - 0.3 + i * 0.3, y=-2.12, z=2.2,
                           mat=K.get_mat("metal_dark")))
        o.append(K.box("glass-2", 0.9, 0.12, 1.1, x=x, y=-2.05, z=4.4, mat=K.get_mat_glass("glass_dark")))
    # sign
    o.append(K.box("sign", 2.4, 0.12, 0.4, y=-2.0, z=4.9, mat=K.get_mat("charcoal")))
    o.append(K.box("shield", 0.3, 0.08, 0.3, x=-0.7, y=-2.06, z=4.9, mat=K.get_mat("police_blue")))
    # flag
    o.append(K.cyl("flagpole", 0.03, 3.0, verts=6, x=2.5, z=5.0, mat=K.get_mat_metal("metal")))
    o.append(K.box("flag", 0.5, 0.02, 0.3, x=2.75, z=7.5, mat=K.get_mat("coral")))
    # roof
    o.append(K.box("roof-slab", 6.05, 4.05, 0.15, z=5.0, mat=K.get_mat("plaster_warm")))
    for (x, y, w, d) in [(-2.9, 0.0, 0.25, 4.05), (2.9, 0.0, 0.25, 4.05),
                         (0.0, -1.9, 6.05, 0.25), (0.0, 1.9, 6.05, 0.25)]:
        o.append(K.box("parapet", w, d, 0.5, x=x, y=y, z=5.15, mat=K.get_mat("stone_pale")))
    o.append(K.cyl("vent", 0.12, 0.8, verts=8, x=0.5, y=0.8, z=5.65, mat=K.get_mat_metal("steel")))
    return o


def garage(K):
    o = [K.box("shell", 10.0, 6.0, 4.5, mat=K.get_mat("stone_pale"))]
    o.append(K.box("base", 10.05, 6.05, 0.6, mat=K.get_mat("paving_joint")))
    # three roller bays + door
    for x in (-3.4, -0.8, 1.8):
        o.append(K.box("frame", 2.4, 0.1, 3.2, x=x, y=-3.02, z=3.1, mat=K.get_mat("charcoal")))
        o.append(K.box("shutter", 2.1, 0.14, 2.9, x=x, y=-3.05, z=2.9, mat=K.get_mat_metal("metal_dark")))
        for z in (2.0, 2.6, 3.2, 3.8):
            o.append(K.box("slat", 2.1, 0.15, 0.03, x=x, y=-3.06, z=z, mat=K.get_mat("metal")))
        o.append(K.box("canopy", 2.6, 0.7, 0.08, x=x, y=-3.45, z=4.6, mat=K.get_mat("charcoal")))
    o.append(K.box("ped-door", 1.0, 0.1, 2.2, x=4.0, y=-3.05, z=2.2, mat=K.get_mat("charcoal")))
    # signage
    o.append(K.box("sign", 4.0, 0.12, 0.5, x=1.5, y=-3.02, z=4.2, mat=K.get_mat("mango")))
    # roof
    o.append(K.box("roof-slab", 10.05, 6.05, 0.15, z=4.5, mat=K.get_mat("plaster_warm")))
    for (x, y, w, d) in [(-4.9, 0.0, 0.25, 6.05), (4.9, 0.0, 0.25, 6.05),
                         (0.0, -2.9, 10.05, 0.25), (0.0, 2.9, 10.05, 0.25)]:
        o.append(K.box("parapet", w, d, 0.5, x=x, y=y, z=4.65, mat=K.get_mat("stone_pale")))
    o.append(K.box("hvac", 1.6, 1.0, 0.7, x=-2.5, y=1.8, z=5.2, mat=K.get_mat_metal("steel")))
    o.append(K.box("duct", 2.4, 0.6, 0.6, x=0.5, y=1.8, z=5.2, mat=K.get_mat_metal("metal")))
    return o


def fuel_station(K):
    o = []
    # canopy on two posts
    for x in (-3.5, 3.5):
        o.append(K.box("post", 0.5, 0.5, 4.4, x=x, mat=K.get_mat("white")))
    o.append(K.box("canopy", 10.0, 6.5, 0.3, z=4.4, mat=K.get_mat("white")))
    o.append(K.box("canopy-edge", 10.1, 6.6, 0.12, z=4.7, mat=K.get_mat("turquoise")))
    for x in (-4.4, 4.4):
        o.append(K.box("light", 0.2, 0.2, 0.1, x=x, z=4.25, mat=K.get_mat("window_warm")))
    # pump islands
    for x in (-2.2, 2.2):
        o.append(K.box("pad", 1.4, 3.0, 0.15, x=x, mat=K.get_mat("paving_joint")))
        for y in (-1.0, 1.0):
            o.append(K.box("pump", 0.5, 0.4, 1.25, x=x, y=y, z=0.15, mat=K.get_mat("coral")))
            o.append(K.box("pump-screen", 0.4, 0.06, 0.5, x=x, y=y - 0.2, z=0.9,
                           mat=K.get_mat_glass("glass_cool")))
    # sign totem
    o.append(K.box("totem", 1.2, 0.5, 4.5, x=-4.5, y=3.5, z=0.0, mat=K.get_mat("white")))
    o.append(K.box("totem-band", 1.24, 0.54, 0.8, x=-4.5, y=3.5, z=4.0, mat=K.get_mat("mango")))
    o.append(K.box("totem-cap", 1.4, 0.7, 0.15, x=-4.5, y=3.5, z=4.5, mat=K.get_mat("charcoal")))
    # convenience shop block
    o.append(K.box("shop", 3.0, 3.0, 3.0, x=4.5, y=3.5, z=0.0, mat=K.get_mat("plaster_warm")))
    o.append(K.box("shop-glass", 2.4, 0.1, 2.0, x=4.5, y=1.95, z=1.9, mat=K.get_mat_glass("glass_cool")))
    o.append(K.box("shop-sign", 2.8, 0.1, 0.5, x=4.5, y=1.9, z=2.9, mat=K.get_mat("charcoal")))
    return o


def grocery(K):
    o = [K.box("shell", 8.0, 6.0, 6.4, mat=K.get_mat("plaster_warm"))]
    o.append(K.box("base", 8.05, 6.05, 1.0, mat=K.get_mat("stone_pale")))
    # storefront
    o.append(K.box("glass", 6.5, 0.12, 2.3, y=-3.02, z=2.1, mat=K.get_mat_glass("glass_cool")))
    for x in (-2.0, -0.65, 0.65, 2.0):
        o.append(K.box("mullion", 0.06, 0.18, 2.3, x=x, y=-3.06, z=2.1, mat=K.get_mat("charcoal")))
    o.append(K.box("door", 1.0, 0.1, 2.2, x=2.6, y=-3.06, z=2.1, mat=K.get_mat("timber")))
    o.append(K.box("canopy", 7.0, 1.0, 0.1, y=-3.5, z=3.5, mat=K.get_mat("stone_pale")))
    # sign
    o.append(K.box("sign", 4.5, 0.12, 0.6, y=-3.02, z=5.7, mat=K.get_mat("turquoise")))
    # upper windows (front face)
    o.extend(_windows_row(K, 6.0, 3, 5.0, fixed=-3.05))
    # roof
    o.append(K.box("roof-slab", 8.05, 6.05, 0.15, z=6.4, mat=K.get_mat("stone_pale")))
    for (x, y, w, d) in [(-3.9, 0.0, 0.25, 6.05), (3.9, 0.0, 0.25, 6.05),
                         (0.0, -2.9, 8.05, 0.25), (0.0, 2.9, 8.05, 0.25)]:
        o.append(K.box("parapet", w, d, 0.5, x=x, y=y, z=6.55, mat=K.get_mat("plaster_warm")))
    o.append(K.box("ac-1", 1.0, 0.8, 0.6, x=-2.0, y=1.8, z=7.05, mat=K.get_mat_metal("steel")))
    o.append(K.box("ac-2", 0.8, 0.8, 0.6, x=-0.8, y=1.8, z=7.05, mat=K.get_mat_metal("steel")))
    return o


def hotel(K):
    o = [K.box("shell", 6.0, 5.0, 13.0, mat=K.get_mat("cream"))]
    o.append(K.box("base", 6.05, 5.05, 1.0, mat=K.get_mat("stone_pale")))
    # entrance canopy + door
    o.append(K.box("canopy", 3.2, 1.2, 0.12, y=-2.9, z=3.6, mat=K.get_mat("terracotta")))
    for x in (-1.3, 1.3):
        o.append(K.box("canopy-post", 0.15, 0.15, 2.4, x=x, y=-3.3, z=3.5,
                       mat=K.get_mat_metal("metal_dark")))
    o.append(K.box("door", 1.2, 0.1, 2.3, y=-2.55, z=2.3, mat=K.get_mat("timber")))
    # window grid
    for f in range(4):
        z = 2.4 + f * 3.0
        for x in (-2.0, 0.0, 2.0):
            o.append(K.box("glass", 1.1, 0.12, 1.4, x=x, y=-2.55, z=z, mat=K.get_mat_glass("glass_dark")))
            o.append(K.box("sill", 1.3, 0.2, 0.1, x=x, y=-2.58, z=z - 0.75, mat=K.get_mat("stone_pale")))
        o.append(K.box("band", 6.05, 5.05, 0.15, z=z - 1.35, mat=K.get_mat("terracotta")))
    # side windows
    for f in range(4):
        z = 2.4 + f * 3.0
        o.append(K.box("side-win", 0.12, 1.2, 1.3, x=3.05, y=0.0, z=z, mat=K.get_mat_glass("glass_dark")))
    # roof + terrace
    o.append(K.box("roof-slab", 6.05, 5.05, 0.15, z=13.0, mat=K.get_mat("stone_pale")))
    for (x, y, w, d) in [(-2.9, 0.0, 0.25, 5.05), (2.9, 0.0, 0.25, 5.05),
                         (0.0, -2.4, 6.05, 0.25), (0.0, 2.4, 6.05, 0.25)]:
        o.append(K.box("parapet", w, d, 0.6, x=x, y=y, z=13.15, mat=K.get_mat("cream")))
    o.append(K.box("terrace-rail", 5.4, 4.4, 0.05, z=13.9, mat=K.get_mat_metal("metal")))
    o.append(K.box("plant", 0.8, 0.5, 0.4, x=-2.0, y=1.8, z=13.75, mat=K.get_mat("timber")))
    o.append(K.ico("bush", 0.35, x=-2.0, y=1.8, z=14.3, mat=K.get_mat("leaf")))
    o.append(K.box("ac", 0.9, 0.7, 0.5, x=1.8, y=1.6, z=13.75, mat=K.get_mat_metal("steel")))
    return o


def office_tower(K):
    o = [K.box("core", 5.0, 4.0, 19.0, mat=K.get_mat("plaster_warm"))]
    # small blue pane grid: one shared glass slot for the lit-window channel
    for f in range(6):
        z = 2.6 + f * 3.0
        for i in range(2):
            p = -1.25 + i * 2.5
            for s in (-1, 1):
                o.append(K.box("pane", 1.25, 0.12, 1.5, x=p, y=s * 2.03, z=z,
                               mat=K.get_mat_glass("glass_cool")))
        for i in range(2):
            p = -1.0 + i * 2.0
            for s in (-1, 1):
                o.append(K.box("pane", 0.12, 1.25, 1.5, x=s * 2.53, y=p, z=z,
                               mat=K.get_mat_glass("glass_cool")))
    # parapet + mechanical room
    o.append(K.box("roof-slab", 5.05, 4.05, 0.15, z=19.0, mat=K.get_mat("stone_pale")))
    for (x, y, w, d) in [(-2.4, 0.0, 0.25, 4.05), (2.4, 0.0, 0.25, 4.05),
                         (0.0, -1.9, 5.05, 0.25), (0.0, 1.9, 5.05, 0.25)]:
        o.append(K.box("parapet", w, d, 0.6, x=x, y=y, z=19.15, mat=K.get_mat("stone_pale")))
    o.append(K.box("mech", 2.4, 1.8, 1.4, x=-1.0, y=0.8, z=19.75, mat=K.get_mat("plaster_warm")))
    o.append(K.box("ac-1", 0.8, 0.8, 0.5, x=1.5, y=1.2, z=19.75, mat=K.get_mat_metal("steel")))
    o.append(K.box("ac-2", 0.8, 0.8, 0.5, x=1.5, y=-1.2, z=19.75, mat=K.get_mat_metal("steel")))
    # entrance
    o.append(K.box("portal", 2.4, 0.15, 2.8, y=-2.05, z=2.5, mat=K.get_mat("stone_pale")))
    o.append(K.box("glass-door", 1.2, 0.1, 2.3, y=-2.08, z=2.3, mat=K.get_mat_glass("glass_cool")))
    o.append(K.box("canopy", 2.8, 0.8, 0.1, y=-2.4, z=3.9, mat=K.get_mat("charcoal")))
    return o


def waterfront_pavilion(K):
    o = [K.box("deck", 6.0, 6.0, 0.15, z=0.9, mat=K.get_mat("timber_light"))]
    for x in (-2.7, 2.7):
        for y in (-2.7, 2.7):
            o.append(K.box("post", 0.25, 0.25, 3.0, x=x, y=y, z=0.9, mat=K.get_mat("timber")))
    o.append(K.box("roof", 7.0, 7.0, 0.2, z=3.9, mat=K.get_mat("timber")))
    o.append(K.box("roof-cap", 6.2, 6.2, 0.08, z=4.1, mat=K.get_mat("terracotta")))
    for x in (-1.5, 1.5):
        o.append(K.box("bench", 1.8, 0.45, 0.12, x=x, z=1.3, mat=K.get_mat("timber")))
        o.append(K.box("bench-leg", 0.1, 0.4, 0.3, x=x, z=1.05, mat=K.get_mat("timber")))
    o.append(K.ico("plant", 0.4, x=2.3, y=2.3, z=1.6, mat=K.get_mat("leaf")))
    o.append(K.box("plant-box", 0.5, 0.5, 0.35, x=2.3, y=2.3, z=1.1, mat=K.get_mat("terracotta")))
    for x in (-1.2, 1.2):
        for y in (-1.2, 1.2):
            o.append(K.box("pile", 0.3, 0.3, 2.6, x=x, y=y, z=-0.6, mat=K.get_mat("timber")))
    return o


SPECS = [
    ("building.shop-bakery", shop_bakery, "building", (4.4, 6.2, 4.7)),
    ("building.shop-mechanic", shop_mechanic, "building", (8.4, 4.3, 5.4)),
    ("building.apartment-rowhouse", apartment_rowhouse, "building", (4.4, 5.3, 11.4)),
    ("building.house-detached", house_detached, "building", (6.6, 7.6, 6.4)),
    ("building.clinic", clinic, "building", (8.4, 5.2, 7.9)),
    ("building.security-station", security_station, "building", (6.4, 4.4, 8.2)),
    ("building.garage", garage, "building", (10.4, 7.2, 6.5)),
    ("building.fuel-station", fuel_station, "building", (12.5, 8.6, 5.2)),
    ("building.grocery", grocery, "building", (8.4, 7.2, 7.7)),
    ("building.hotel", hotel, "building", (6.4, 6.3, 14.9)),
    ("building.office-tower", office_tower, "building", (5.4, 5.1, 21.5)),
    ("building.waterfront-pavilion", waterfront_pavilion, "building", (7.4, 7.4, 5.0)),
]


def build(lib):
    reports = []
    for i, (fid, fn, cat) in enumerate(SPECS):
        rep, obj = lib.family(fid, fn, cat, lib)
        reports.append(rep)
        lib.shelf_add(obj, i + 75)
    lib.clear_stage()
    lib._REPORTS.extend(reports)
    return reports
