"""stage17_public.py — fountains, statues, monuments, government buildings.

Fountains: five styles at five sizes (bowl, plaza, wall cascade, column,
garden). Statues: a single figure on a plinth and a group memorial.
Monuments: obelisk, war memorial, commemorative arch. Government suite in
the same civic visual language as building.city-hall (stage15): post
office, library, government office and civic center. Police and fire are
already covered by the stage09 infrastructure landmarks
(building.police-station, building.firehouse).

Same conventions: 4 m module grid, bottom-centre pivots, flat palette,
hard QA budgets.
"""
import math

import bpy


def _flag(K, x, y, z, h, color):
    o = [K.cyl("flag-mast", 0.08, h, verts=6, x=x, y=y, z=z,
               mat=K.get_mat_metal("metal"))]
    o.append(K.box("flag", 1.1, 0.05, 0.7, x=x + 0.55, y=y, z=z + h - 0.75,
                   mat=K.get_mat(color)))
    return o


def _figure(K, mat, H, x=0.0, y=0.0, z=0.0):
    """Stylised standing figure, feet at z, total height ~1.1*H."""
    o = []
    for s in (-1, 1):
        o.append(K.box("leg", 0.13 * H, 0.13 * H, 0.45 * H,
                       x=x + s * 0.12 * H, y=y, z=z, mat=mat))
    o.append(K.box("torso", 0.4 * H, 0.22 * H, 0.42 * H, x=x, y=y,
                   z=z + 0.45 * H, mat=mat))
    for s in (-1, 1):
        o.append(K.box("arm", 0.1 * H, 0.1 * H, 0.36 * H,
                       x=x + s * 0.27 * H, y=y, z=z + 0.5 * H,
                       rot=(0, 0, math.radians(6 * s)), mat=mat))
    o.append(K.ico("head", 0.15 * H, x=x, y=y, z=z + 0.95 * H, mat=mat,
                   detail=1))
    return o


# --------------------------------------------------------------------------
# Fountains (five styles, five sizes)
# --------------------------------------------------------------------------

def fountain_bowl(K):
    """Small single-bowl fountain, ~2.5 m across, 1.4 m high."""
    o = [K.cyl("basin", 1.25, 0.5, verts=12, z=0.0, mat=K.get_mat("stone_pale"))]
    o.append(K.cyl("water", 1.05, 0.08, verts=12, z=0.42,
                   mat=K.get_mat_glass("sea")))
    o.append(K.cyl("pedestal", 0.2, 0.38, verts=8, z=0.5,
                   mat=K.get_mat("stone_pale")))
    o.append(K.ico("jet", 0.22, z=0.95, mat=K.get_mat_glass("sea"), detail=1))
    o.append(K.cone("spray", 0.12, 0.25, verts=8, z=1.1,
                    mat=K.get_mat_glass("sea")))
    return o


def fountain_plaza(K):
    """Large two-tier circular plaza fountain, ~7 m across."""
    o = [K.cyl("basin", 3.4, 0.6, verts=16, z=0.0, mat=K.get_mat("stone_pale"))]
    o.append(K.cyl("water", 3.2, 0.1, verts=16, z=0.5,
                   mat=K.get_mat_glass("sea")))
    o.append(K.cyl("pedestal", 0.55, 1.0, verts=10, z=0.55,
                   mat=K.get_mat("stone_pale")))
    o.append(K.cyl("basin-2", 1.5, 0.45, verts=12, z=1.55,
                   mat=K.get_mat("stone_pale")))
    o.append(K.cyl("water-2", 1.35, 0.08, verts=12, z=1.95,
                   mat=K.get_mat_glass("sea")))
    o.append(K.ico("jet", 0.3, z=2.35, mat=K.get_mat_glass("sea"), detail=1))
    o.append(K.cone("spray", 0.15, 0.35, verts=8, z=2.6,
                    mat=K.get_mat_glass("sea")))
    return o


def fountain_wall(K):
    """Recessed wall cascade with three tiers, 4.5 m wide."""
    o = [K.box("wall", 4.5, 0.6, 2.6, z=0.0, mat=K.get_mat("stone_pale"))]
    o.append(K.box("panel", 3.6, 0.1, 1.9, y=-0.32, z=0.45,
                   mat=K.get_mat("paving_joint")))
    for i, sz in enumerate((1.95, 1.45, 0.95)):
        o.append(K.box(f"spout-{i}", 0.5, 0.16, 0.14, y=-0.36, z=sz,
                       mat=K.get_mat_metal("metal_dark")))
        o.append(K.box(f"sheet-{i}", 0.34, 0.03, 0.42, y=-0.44, z=sz - 0.46,
                       mat=K.get_mat_glass("sea")))
    # base pool with the cascade landing in it
    o.append(K.box("pool", 4.5, 1.9, 0.45, y=-1.15, z=0.0,
                   mat=K.get_mat("stone_pale")))
    o.append(K.box("pool-water", 4.1, 1.5, 0.07, y=-1.15, z=0.38,
                   mat=K.get_mat_glass("sea")))
    return o


def fountain_column(K):
    """Tall column fountain, ~4.5 m across, 6.5 m high."""
    o = [K.cyl("basin", 2.2, 0.55, verts=14, z=0.0, mat=K.get_mat("stone_pale"))]
    o.append(K.cyl("water", 2.0, 0.08, verts=14, z=0.47,
                   mat=K.get_mat_glass("sea")))
    o.append(K.cyl("column-base", 0.75, 0.35, verts=10, z=0.55,
                   mat=K.get_mat("stone_pale")))
    o.append(K.cyl("column", 0.42, 4.6, verts=10, z=0.9,
                   mat=K.get_mat("stone_pale")))
    o.append(K.cyl("capital", 0.68, 0.3, verts=10, z=5.5,
                   mat=K.get_mat("stone_pale")))
    o.append(K.cyl("crown-water", 0.52, 0.08, verts=10, z=5.8,
                   mat=K.get_mat_glass("sea")))
    o.append(K.ico("jet", 0.26, z=6.08, mat=K.get_mat_glass("sea"), detail=1))
    o.append(K.cone("spray", 0.1, 0.3, verts=8, z=6.28,
                    mat=K.get_mat_glass("sea")))
    return o


def fountain_garden(K):
    """Small square garden fountain with a stone spout, 1.8 m wide."""
    o = [K.box("trough", 1.8, 1.4, 0.5, z=0.0, mat=K.get_mat("stone_pale"))]
    o.append(K.box("water", 1.5, 1.1, 0.06, z=0.42,
                   mat=K.get_mat_glass("sea")))
    o.append(K.ico("spout", 0.2, x=0.55, z=0.62, mat=K.get_mat("stone_pale"),
                   detail=1))
    o.append(K.box("sheet", 0.12, 0.03, 0.34, x=0.28, z=0.42,
                   mat=K.get_mat_glass("sea")))
    for sx in (-1, 1):
        o.append(K.ico("flower", 0.09, x=sx * 0.72, y=0.55, z=0.52,
                       mat=K.get_mat("mango" if sx > 0 else "coral"),
                       detail=1))
    return o


# --------------------------------------------------------------------------
# Statues
# --------------------------------------------------------------------------

def statue_figure(K):
    """Single bronze-style figure on a stone plinth, ~2.9 m high."""
    o = [K.box("step", 1.7, 1.7, 0.18, mat=K.get_mat("paving"))]
    o.append(K.box("plinth", 1.2, 1.2, 0.85, z=0.18, mat=K.get_mat("stone_pale")))
    o.append(K.box("cap", 1.4, 1.4, 0.12, z=1.03, mat=K.get_mat("offwhite")))
    mat = K.get_mat_metal("charcoal")
    o += _figure(K, mat, 1.6, z=1.15)
    return o


def statue_memorial(K):
    """Group memorial: three figures (family) on a wide plinth."""
    o = [K.box("step", 4.4, 3.0, 0.18, mat=K.get_mat("paving"))]
    o.append(K.box("plinth", 3.6, 2.2, 0.75, z=0.18, mat=K.get_mat("stone_pale")))
    o.append(K.box("cap", 3.9, 2.5, 0.12, z=0.93, mat=K.get_mat("offwhite")))
    mat = K.get_mat_metal("metal")
    o += _figure(K, mat, 1.7, x=-0.85, z=1.05)
    o += _figure(K, mat, 1.45, x=0.0, z=1.05)
    o += _figure(K, mat, 1.0, x=0.85, z=1.05)
    return o


# --------------------------------------------------------------------------
# Monuments
# --------------------------------------------------------------------------

def monument_obelisk(K):
    """Classical obelisk on a two-step base, ~7 m high."""
    o = [K.box("step-1", 4.4, 4.4, 0.5, z=0.0, mat=K.get_mat("stone_pale"))]
    o.append(K.box("step-2", 3.5, 3.5, 0.5, z=0.5, mat=K.get_mat("offwhite")))
    o.append(K.cyl("shaft", 0.95, 4.5, verts=4, z=1.0, r2=0.55,
                   mat=K.get_mat("stone_pale")))
    o.append(K.cone("pyramidion", 0.55, 0.9, verts=4, z=5.5,
                    mat=K.get_mat("offwhite")))
    o.append(K.box("plaque", 0.9, 0.12, 1.3, y=-1.05, z=2.0,
                   mat=K.get_mat("paving_joint")))
    return o


def monument_war(K):
    """War memorial: cross on a plinth with a wreath, ~4 m high."""
    o = [K.box("step", 3.2, 3.2, 0.2, mat=K.get_mat("paving"))]
    o.append(K.box("plinth", 2.4, 2.4, 0.8, z=0.2, mat=K.get_mat("stone_pale")))
    o.append(K.box("band", 2.5, 2.5, 0.3, z=0.45, mat=K.get_mat("offwhite")))
    o.append(K.box("cross-v", 0.5, 0.35, 3.0, z=1.0, mat=K.get_mat("offwhite")))
    o.append(K.box("cross-h", 2.0, 0.35, 0.5, z=2.7, mat=K.get_mat("offwhite")))
    o.append(K.torus("wreath", 0.5, 0.11, y=-1.35, z=1.1, seg=12, rad=5,
                     mat=K.get_mat("leaf_dark"), rot=(math.radians(90), 0, 0)))
    for s in (-1, 1):
        o.append(K.ico("berry", 0.08, x=s * 0.2, y=-1.38, z=0.78,
                       mat=K.get_mat("coral"), detail=1))
    return o


def monument_arch(K):
    """Commemorative arch with a relief plaque, 7 m wide, 4.4 m high."""
    o = [K.box("steps", 8.0, 3.4, 0.2, mat=K.get_mat("paving"))]
    for sx in (-1, 1):
        o.append(K.box("pier", 1.3, 1.3, 3.2, x=sx * 2.6, z=0.2,
                       mat=K.get_mat("stone_pale")))
        o.append(K.box("pier-cap", 1.7, 1.7, 0.3, x=sx * 2.6, z=3.4,
                       mat=K.get_mat("offwhite")))
    o.append(K.box("arch-span", 2.6, 1.5, 0.8, z=3.9, mat=K.get_mat("stone_pale")))
    for sx in (-1, 1):
        o.append(K.box("arch-side", 1.1, 1.5, 0.8, x=sx * 1.6, z=3.6,
                       rot=(0, 0, math.radians(18 * sx)),
                       mat=K.get_mat("stone_pale")))
    o.append(K.box("keystone", 0.7, 0.3, 0.9, z=4.5, mat=K.get_mat("offwhite")))
    o.append(K.box("plaque", 1.7, 0.12, 0.9, y=-0.78, z=3.95,
                   mat=K.get_mat("paving_joint")))
    return o


# --------------------------------------------------------------------------
# Government buildings
# --------------------------------------------------------------------------

def post_office(K):
    """Two-storey post office with mail slot and flag, 16 x 10 m."""
    o = [K.box("plaza", 20.0, 14.0, 0.2, mat=K.get_mat("paving"))]
    o.append(K.box("block", 16.0, 10.0, 5.0, z=0.2, mat=K.get_mat("plaster_warm")))
    o.append(K.box("band", 16.2, 10.2, 0.3, z=2.9, mat=K.get_mat("stone_pale")))
    o.append(K.box("cornice", 16.4, 10.4, 0.35, z=5.2, mat=K.get_mat("offwhite")))
    # recessed entry with glass door and transom
    o.append(K.box("entry", 3.4, 0.35, 3.2, y=-5.1, z=0.2,
                   mat=K.get_mat("charcoal")))
    o.append(K.box("door", 2.6, 0.2, 2.5, y=-5.25, z=0.2,
                   mat=K.get_mat_glass("glass_cool")))
    o.append(K.box("transom", 2.6, 0.18, 0.5, y=-5.25, z=2.85,
                   mat=K.get_mat_glass("glass_cool")))
    # window rows
    for f in (0, 1):
        for x in (-7.2, -3.6, 3.6, 7.2):
            o.append(K.box("win", 1.7, 0.12, 1.4, x=x, y=-5.05,
                           z=0.8 + f * 2.15, mat=K.get_mat_glass("glass_dark")))
    for y in (-3.5, 0.0, 3.5):
        o.append(K.box("win-s", 0.12, 1.7, 1.4, x=8.05, y=y, z=0.8,
                       mat=K.get_mat_glass("glass_dark")))
    # street mailbox
    o.append(K.box("mailbox", 1.3, 0.9, 0.8, x=-6.5, y=-6.4, z=0.2,
                   mat=K.get_mat("red_paint")))
    o.append(K.box("slot", 0.55, 0.06, 0.09, x=-6.5, y=-6.86, z=0.75,
                   mat=K.get_mat("charcoal")))
    o += _flag(K, 6.5, -6.4, 5.55, 2.4, "sea")
    return o


def civic_center(K):
    """Two-storey civic center: auditorium hall with glass frontage and
    flanking wing blocks, 18 x 12 m hall, ~9 m high with flag."""
    o = [K.box("plaza", 28.0, 20.0, 0.2, mat=K.get_mat("paving"))]
    # auditorium hall
    o.append(K.box("hall", 18.0, 12.0, 6.5, z=0.2, mat=K.get_mat("plaster_warm")))
    o.append(K.box("hall-cornice", 18.4, 12.4, 0.35, z=6.7, mat=K.get_mat("offwhite")))
    # glass entry frontage
    o.append(K.box("glass-front", 10.0, 0.3, 4.6, y=-6.1, z=0.6,
                   mat=K.get_mat_glass("glass_cool")))
    for x in (-3.6, 0.0, 3.6):
        o.append(K.box("mullion", 0.12, 0.12, 4.6, x=x, y=-6.25, z=0.6,
                       mat=K.get_mat("charcoal")))
    # flanking wing blocks
    for sx in (-1, 1):
        o.append(K.box(f"wing-{sx}", 5.0, 8.0, 4.5, x=sx * 11.5, z=0.2,
                       mat=K.get_mat("stone_pale")))
        o.append(K.box(f"wing-cornice-{sx}", 5.3, 8.3, 0.3, x=sx * 11.5, z=4.7,
                       mat=K.get_mat("offwhite")))
        for f in (0, 1):
            for y in (-2.5, 0.0, 2.5):
                o.append(K.box(f"wing-win-{sx}-{f}-{y}", 0.12, 1.4, 1.2,
                               x=sx * 14.05, y=y, z=0.8 + f * 1.9,
                               mat=K.get_mat_glass("glass_dark")))
    # portico columns over the glass front
    for x in (-5.5, -1.8, 1.8, 5.5):
        o.append(K.box("portico-col", 0.4, 0.4, 5.6, x=x, y=-6.9, z=0.2,
                       mat=K.get_mat("stone_pale")))
    o.append(K.box("portico-slab", 12.0, 1.6, 0.4, y=-6.9, z=5.8,
                   mat=K.get_mat("offwhite")))
    o.append(K.box("stair", 11.0, 2.6, 0.22, y=-7.6, z=0.2,
                   mat=K.get_mat("paving")))
    o += _flag(K, 13.0, -7.5, 6.0, 3.0, "sea")
    return o


def library(K):
    """Two-storey library with a glass atrium corner and facade clock."""
    o = [K.box("plaza", 20.0, 18.0, 0.2, mat=K.get_mat("paving"))]
    o.append(K.box("block", 16.0, 12.0, 5.8, z=0.2, mat=K.get_mat("plaster_warm")))
    o.append(K.box("cornice", 16.4, 12.4, 0.35, z=6.0, mat=K.get_mat("offwhite")))
    # glass atrium corner, proud of the block face
    o.append(K.box("atrium", 5.0, 5.0, 5.4, x=5.0, y=-4.0, z=0.2,
                   mat=K.get_mat_glass("glass_cool")))
    for x in (3.9, 5.0, 6.1):
        o.append(K.box("mullion", 0.09, 0.09, 5.4, x=x, y=-6.52, z=0.2,
                       mat=K.get_mat("charcoal")))
    # portico
    for x in (-2.6, 0.0, 2.6):
        o.append(K.box("portico-col", 0.4, 0.4, 4.6, x=x, y=-6.6, z=0.2,
                       mat=K.get_mat("stone_pale")))
    o.append(K.box("portico-lintel", 6.4, 1.0, 0.5, y=-6.6, z=4.8,
                   mat=K.get_mat("offwhite")))
    o.append(K.box("stair", 6.0, 2.4, 0.22, y=-7.4, z=0.2,
                   mat=K.get_mat("stone_pale")))
    # facade clock
    o.append(K.torus("clock-ring", 0.72, 0.07, y=-6.06, z=4.6, seg=12, rad=4,
                     mat=K.get_mat_metal("metal_dark"),
                     rot=(math.radians(90), 0, 0)))
    o.append(K.cyl("clock-face", 0.62, 0.06, verts=12, y=-6.04, z=4.6,
                   rot=(math.radians(90), 0, 0), mat=K.get_mat("cream")))
    # windows
    for f in (0, 1):
        for x in (-6.6, -4.0, 4.0):
            o.append(K.box("win", 1.7, 0.12, 1.4, x=x, y=-6.05,
                           z=0.9 + f * 2.3, mat=K.get_mat_glass("glass_dark")))
    o += _flag(K, -7.0, -6.8, 6.35, 2.4, "bus_green")
    return o


def government_office(K):
    """Four-storey government office, 14 x 14 m, 11 m high."""
    o = [K.box("plaza", 20.0, 20.0, 0.2, mat=K.get_mat("paving"))]
    o.append(K.box("block", 14.0, 14.0, 10.8, z=0.2, mat=K.get_mat("offwhite")))
    for f in range(4):
        o.append(K.box(f"band-{f}", 14.3, 14.3, 0.25,
                       z=0.2 + f * 2.7, mat=K.get_mat("stone_pale")))
    # window grid: three bays per floor, front and back
    for f in range(4):
        for x in (-4.2, 0.0, 4.2):
            o.append(K.box(f"win-f-{f}-{x}", 2.6, 0.12, 1.8, x=x, y=-7.05,
                           z=1.0 + f * 2.7, mat=K.get_mat_glass("glass_cool")))
            o.append(K.box(f"win-b-{f}-{x}", 2.6, 0.12, 1.8, x=x, y=7.05,
                           z=1.0 + f * 2.7, mat=K.get_mat_glass("glass_cool")))
    # entry portico
    for x in (-3.6, -1.2, 1.2, 3.6):
        o.append(K.box("portico-col", 0.38, 0.38, 3.4, x=x, y=-7.7, z=0.2,
                       mat=K.get_mat("stone_pale")))
    o.append(K.box("portico-slab", 9.0, 1.8, 0.5, y=-7.7, z=3.6,
                   mat=K.get_mat("offwhite")))
    o.append(K.box("door", 2.2, 0.2, 3.0, y=-7.15, z=0.2,
                   mat=K.get_mat_glass("glass_cool")))
    o.append(K.box("stair", 8.0, 2.6, 0.22, y=-8.6, z=0.2,
                   mat=K.get_mat("paving")))
    o += _flag(K, 8.6, -8.6, 0.2, 9.0, "turquoise")
    return o


SPECS = [
    ("prop.fountain-bowl", fountain_bowl, "prop", (2.6, 2.6, 1.6)),
    ("prop.fountain-plaza", fountain_plaza, "prop", (7.0, 7.0, 3.2)),
    ("prop.fountain-wall", fountain_wall, "prop", (4.7, 2.6, 2.8)),
    ("prop.fountain-column", fountain_column, "prop", (4.5, 4.5, 6.8)),
    ("prop.fountain-garden", fountain_garden, "prop", (1.9, 1.5, 1.0)),
    ("prop.statue-figure", statue_figure, "prop", (1.8, 1.8, 3.1)),
    ("prop.statue-memorial", statue_memorial, "prop", (4.5, 3.1, 3.1)),
    ("prop.monument-obelisk", monument_obelisk, "prop", (4.6, 4.6, 6.6)),
    ("prop.monument-war", monument_war, "prop", (3.4, 3.4, 4.3)),
    ("prop.monument-arch", monument_arch, "prop", (8.2, 3.6, 5.6)),
    ("building.post-office", post_office, "building", (20.4, 14.4, 8.2)),
    ("building.civic-center", civic_center, "building", (28.4, 20.4, 9.4)),
    ("building.library", library, "building", (20.4, 18.4, 8.9)),
    ("building.government-office", government_office, "building",
     (20.4, 20.4, 11.4)),
]


def build(lib):
    reports = []
    for entry in SPECS:
        fid, fn, cat, expect = entry
        rep, obj = lib.family(fid, fn, cat, lib, expect=expect)
        reports.append(rep)
        lib.shelf_add(obj, cat)
    return reports
