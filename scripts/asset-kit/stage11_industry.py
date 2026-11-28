"""stage11_industry.py — skyscraper variance, industry/services, farming
& settlement families (R048.12).

Grid: 4 m module. Storey 3.2 m. Doors 2.1-2.4 m (R048 review ruler).
Skyscrapers read their crown type from above; industry reads as a working
site (silos, tanks, racks, terraces); farming reads as rural low-poly.
"""
import math

STOREY = 3.2


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


def _roof(K, w, d, z, mat="stone_pale", x=0.0, y=0.0):
    o = [K.box("roof-slab", w + 0.1, d + 0.1, 0.15, x=x, y=y, z=z, mat=K.get_mat(mat))]
    for (dx, dy, pw, pd) in [(-w / 2, 0, 0.25, d), (w / 2, 0, 0.25, d),
                             (0, -d / 2, w, 0.25), (0, d / 2, w, 0.25)]:
        o.append(K.box("parapet", pw, pd, 0.5, x=x + dx, y=y + dy, z=z + 0.15, mat=K.get_mat(mat)))
    return o


def _panes(K, w, d, floors, z0, x=0.0, y=0.0, glass="glass_cool"):
    """Small rectangular window panes in a grid on all four facades.

    One shared glass material slot per family keeps the panes addressable:
    the engine's lit-window channel (R025) swaps/overlays emissive per pane
    under the activity schedule (R050) and night atmosphere (R053), some
    windows turning on and off dynamically at night."""
    o = []
    ny = max(2, int(round(w / 3.2)))
    nx = max(2, int(round(d / 3.2)))
    for f in range(floors):
        z = z0 + f * STOREY + 1.15
        for i in range(ny):
            p = -w / 2 + (i + 0.5) * (w / ny)
            for s in (-1, 1):
                o.append(K.box("pane", 1.25, 0.12, 1.7, x=x + p, y=y + s * (d / 2 + 0.03), z=z,
                               mat=K.get_mat_glass(glass)))
        for i in range(nx):
            p = -d / 2 + (i + 0.5) * (d / nx)
            for s in (-1, 1):
                o.append(K.box("pane", 0.12, 1.25, 1.7, x=x + s * (w / 2 + 0.03), y=y + p, z=z,
                               mat=K.get_mat_glass(glass)))
    return o


def _block(K, w, d, floors, z0, facade="offwhite", x=0.0, y=0.0, glass="glass_cool"):
    """Solid single-colour facade stack + small blue pane grid.

    The facade is one solid colour per building (the colour varies per
    family); the panes are the tower's only glass and sit in one material
    slot so the night-time lit-window channel can light individual panes."""
    o = [K.box("facade", w, d, floors * STOREY, x=x, y=y, z=z0, mat=K.get_mat(facade))]
    o += _panes(K, w, d, floors, z0, x=x, y=y, glass=glass)
    return o


def _rooftop(K, w, d, z, h=0.8):
    """Rooftop equipment cluster: plant block + water tank + vent."""
    o = [K.box("plant-block", min(w, 4.0), min(d, 3.0), h, x=-w / 4, z=z,
               mat=K.get_mat("metal_dark"))]
    o.append(K.cyl("water-tank", 0.9, 1.6, verts=8, x=w / 4, z=z, mat=K.get_mat_metal("metal")))
    o.append(K.cyl("vent", 0.3, 0.9, verts=6, x=-w / 4 + 1.2, z=z, mat=K.get_metal("metal_dark"))
             if hasattr(K, "get_metal") else K.cyl("vent", 0.3, 0.9, verts=6, x=-w / 4 + 1.2, z=z,
                                                  mat=K.get_mat("metal_dark")))
    return o


# --------------------------------------------------------------------------
# Skyscraper variance (5 families)
# --------------------------------------------------------------------------

def skyscraper_slab(K):
    w, d = 14.0, 11.0
    o = [K.box("plinth", w + 1.0, d + 1.0, 0.5, mat=K.get_mat("stone_pale"))]
    o += _block(K, w, d, 10, z0=0.5, facade="plaster_warm")
    top = 0.5 + 10 * STOREY
    o += _roof(K, w, d, top, mat="stone_pale")
    o += _rooftop(K, w, d, top + 0.65)
    return o


def skyscraper_setback(K):
    o = [K.box("plinth", 22.0, 18.0, 0.5, mat=K.get_mat("stone_pale"))]
    o += _block(K, 20.0, 16.0, 4, z0=0.5, facade="cream")
    z1 = 0.5 + 4 * STOREY
    o += _block(K, 14.0, 11.0, 6, z0=z1, facade="stone_pale")
    z2 = z1 + 6 * STOREY
    o += _block(K, 8.5, 7.0, 5, z0=z2, facade="terracotta")
    top = z2 + 5 * STOREY
    o += _roof(K, 8.5, 7.0, top, mat="stone_pale")
    o.append(K.cyl("mast", 0.12, 3.0, verts=6, x=2.0, z=top + 0.15, mat=K.get_mat_metal("metal")))
    return o


def skyscraper_tapered(K):
    o = [K.box("plinth", 17.0, 17.0, 0.5, mat=K.get_mat("stone_pale"))]
    w, d, z = 15.0, 15.0, 0.5
    for stage, (floors, dw) in enumerate([(5, 0.0), (5, 2.4), (4, 4.8)]):
        o += _block(K, w, d, floors, z0=z,
                    facade=["charcoal", "cream", "plaster_warm"][stage])
        z += floors * STOREY
        w -= dw
        d -= dw
    o += _roof(K, w, d, z, mat="stone_pale")
    o += _rooftop(K, w, d, z + 0.65)
    return o


def skyscraper_podium(K):
    o = [K.box("plinth", 24.0, 20.0, 0.5, mat=K.get_mat("stone_pale"))]
    # podium: two storeys with a storefront frontage
    for f in range(2):
        z = 0.5 + f * STOREY
        o.append(K.box("podium-floor", 22.0, 18.0, 2.2, z=z + 0.9, mat=K.get_mat_glass("glass_cool")))
        o.append(K.box("podium-band", 22.1, 18.1, 1.0, z=z, mat=K.get_mat("offwhite")))
        for x in (-8.5, -2.9, 2.9, 8.5):  # storefront mullions on -y front
            o.append(K.box("mullion", 0.25, 0.15, 2.2, x=x, y=-9.1, z=z + 0.9,
                           mat=K.get_mat("metal_dark")))
    z1 = 0.5 + 2 * STOREY
    o += _block(K, 11.0, 11.0, 9, z0=z1, facade="offwhite")
    top = z1 + 9 * STOREY
    o += _roof(K, 11.0, 11.0, top, mat="stone_pale")
    o += _rooftop(K, 11.0, 11.0, top + 0.65)
    return o


def skyscraper_twin(K):
    tw, td = 8.0, 9.0
    o = []
    for cx, facade in ((-6.5, "sand"), (6.5, "offwhite")):
        o += _block(K, tw, td, 9, z0=0.5, facade=facade, x=cx)
    z_bridge = 0.5 + 4 * STOREY + 1.4
    o.append(K.box("sky-bridge", 11.0, 4.0, 2.4, z=z_bridge, mat=K.get_mat_glass("glass_cool")))
    o.append(K.box("bridge-deck", 11.0, 4.4, 0.25, z=z_bridge - 0.25, mat=K.get_mat("offwhite")))
    top = 0.5 + 9 * STOREY
    for cx in (-6.5, 6.5):
        o += _roof(K, tw, td, top, mat="offwhite", x=cx)
        o.append(K.cyl("mast", 0.1, 2.4, verts=6, x=cx, z=top + 0.15,
                       mat=K.get_mat_metal("metal")))
    return o


# --------------------------------------------------------------------------
# Industry & services (6 families)
# --------------------------------------------------------------------------

def ore_plant(K):
    o = [K.box("yard", 26.0, 22.0, 0.3, mat=K.get_mat("paving"))]
    # process hall
    o.append(K.box("hall", 10.0, 8.0, 5.6, x=-6.0, y=3.0, z=0.3, mat=K.get_mat("offwhite")))
    o.append(K.box("hall-roof", 10.4, 8.4, 0.25, x=-6.0, y=3.0, z=5.9, mat=K.get_mat("metal_dark")))
    o += _windows(K, 8.0, 4, 2.2, fixed=3.0 - 4.0, mat="glass_dark")
    # hopper + conveyor to the hall
    o.append(K.box("hopper", 3.0, 3.0, 2.2, x=4.0, y=-4.0, z=4.6, mat=K.get_mat_metal("metal")))
    o.append(K.cone("hopper-cone", 1.8, 1.6, verts=4, x=4.0, y=-4.0, z=6.8,
                    mat=K.get_mat_metal("metal")))
    o.append(K.box("conveyor", 9.0, 1.2, 0.5, x=-1.0, y=-2.5, z=4.9,
                   rot=(0, 0, math.radians(20)), mat=K.get_mat("metal_dark")))
    # silos
    for i, sx in enumerate((8.0, 11.0)):
        o.append(K.cyl(f"silo{i}", 1.6, 8.0, verts=10, x=sx, y=6.0, z=0.3,
                       mat=K.get_mat("white")))
        o.append(K.cone(f"silo-cap{i}", 1.6, 1.2, verts=10, x=sx, y=6.0, z=8.3,
                        mat=K.get_mat("stone_pale")))
    # stack + shed
    o.append(K.cyl("stack", 0.7, 9.0, verts=8, x=-10.0, y=-7.0, z=0.3,
                   mat=K.get_mat("charcoal")))
    o.append(K.box("shed", 4.0, 3.0, 2.6, x=10.5, y=-6.0, z=0.3, mat=K.get_mat("terracotta")))
    return o


def mining_site(K):
    o = []
    # terraced open pit: three nested pads stepping down
    o.append(K.box("bench0", 28.0, 24.0, 0.4, z=2.4, mat=K.get_mat("sand")))
    o.append(K.box("bench1", 20.0, 17.0, 0.4, z=1.6, mat=K.get_mat("sand")))
    o.append(K.box("bench2", 12.0, 10.0, 0.4, z=0.8, mat=K.get_mat("sand")))
    o.append(K.box("pit-floor", 8.0, 6.0, 0.2, z=0.4, mat=K.get_mat("stone_pale")))
    # haul road spiralling up one side
    o.append(K.box("haul-0", 14.0, 2.4, 0.25, x=5.5, y=-9.0, z=0.4, mat=K.get_mat("asphalt")))
    o.append(K.box("haul-1", 12.0, 2.4, 0.25, x=5.0, y=6.5, z=1.6, mat=K.get_mat("asphalt")))
    # ore stockpile
    o.append(K.cone("stockpile", 3.2, 3.4, verts=10, x=-8.5, y=8.0, z=0.4,
                    mat=K.get_mat("charcoal")))
    # headframe: A-frame + sheave
    for s in (-1, 1):
        o.append(K.box("frame-leg", 0.7, 0.7, 7.0, x=9.5, y=s * 2.6, z=0.4,
                       rot=(0, math.radians(8 * s), 0), mat=K.get_mat_metal("metal")))
    o.append(K.box("frame-top", 0.8, 7.6, 0.8, x=9.5, z=6.9, mat=K.get_mat_metal("metal")))
    o.append(K.torus("sheave", 0.9, 0.12, x=9.5, z=7.9, mat=K.get_mat("metal_dark")))
    return o


def oil_gas_plant(K):
    o = [K.box("yard", 28.0, 24.0, 0.3, mat=K.get_mat("paving"))]
    # storage tanks
    for i, (tx, ty) in enumerate([(-9.0, 6.0), (-3.5, 7.5), (-8.5, -1.0), (-3.0, 0.5)]):
        o.append(K.cyl(f"tank{i}", 2.6, 4.4, verts=12, x=tx, y=ty, z=0.3,
                       mat=K.get_mat("offwhite")))
        o.append(K.cyl(f"tank-band{i}", 2.66, 0.5, verts=12, x=tx, y=ty, z=3.2,
                       mat=K.get_mat("steel")))
    # pipe rack across the yard
    for py in (-4.0, 4.0):
        o.append(K.cyl("pipe-rail", 0.16, 20.0, verts=6, x=0, y=py, z=2.0,
                       rot=(0, math.radians(90), 0), mat=K.get_mat("steel")))
    for px in (-6.0, -2.0, 2.0, 6.0):
        o.append(K.box("rack-post", 0.3, 0.3, 1.9, x=px, y=-4.0, z=0.3, mat=K.get_mat_metal("metal")))
        o.append(K.box("rack-post", 0.3, 0.3, 1.9, x=px, y=4.0, z=0.3, mat=K.get_mat_metal("metal")))
    # flare stack + burner
    o.append(K.cyl("flare-stack", 0.5, 13.0, verts=8, x=9.5, y=8.0, z=0.3,
                   mat=K.get_mat_metal("metal")))
    o.append(K.cone("flare-tip", 0.6, 0.8, verts=8, x=9.5, y=8.0, z=13.3,
                    mat=K.get_mat("charcoal")))
    # pump shed
    o.append(K.box("pump-shed", 6.0, 5.0, 3.2, x=9.0, y=-7.0, z=0.3, mat=K.get_mat("offwhite")))
    o.append(K.box("pump-roof", 6.4, 5.4, 0.25, x=9.0, y=-7.0, z=3.5, mat=K.get_mat("metal_dark")))
    return o


def datacenter(K):
    o = [K.box("pad", 24.0, 20.0, 0.3, mat=K.get_mat("paving"))]
    # two long secure cool blocks: no windows
    for i, bx in enumerate((-5.5, 5.5)):
        o.append(K.box(f"block{i}", 16.0, 6.5, 5.4, x=bx, z=0.3, mat=K.get_mat("cream")))
        o.append(K.box(f"block-roof{i}", 16.4, 6.9, 0.3, x=bx, z=5.7, mat=K.get_mat("stone_pale")))
        # roof HVAC rows
        for hx in (-5.0, 0.0, 5.0):
            o.append(K.box(f"hvac{i}{hx}", 2.6, 4.5, 1.1, x=bx + hx, z=6.0,
                           mat=K.get_mat_metal("metal")))
    # perimeter fence: corner + mid posts with rail
    for (fx, fy) in [(-11.5, -9.0), (11.5, -9.0), (-11.5, 9.0), (11.5, 9.0),
                     (0.0, -9.0), (0.0, 9.0), (-11.5, 0.0), (11.5, 0.0)]:
        o.append(K.cyl("fence-post", 0.09, 1.6, verts=6, x=fx, y=fy, z=0.3,
                       mat=K.get_mat("metal_dark")))
    # access canopy + guard booth
    o.append(K.box("canopy", 5.0, 3.0, 0.15, x=-8.0, y=-8.5, z=3.4, mat=K.get_mat("charcoal")))
    for (cx, cy) in [(-10.0, -9.8), (-6.0, -9.8)]:
        o.append(K.cyl("canopy-col", 0.14, 3.1, verts=6, x=cx, y=cy, z=0.3,
                       mat=K.get_mat_metal("metal")))
    o.append(K.box("booth", 3.0, 2.6, 2.8, x=8.0, y=-8.5, z=0.3, mat=K.get_mat("offwhite")))
    o.append(K.box("booth-roof", 3.4, 3.0, 0.2, x=8.0, y=-8.5, z=3.1, mat=K.get_mat("charcoal")))
    return o


def office_campus(K):
    o = [K.box("plaza", 30.0, 24.0, 0.3, mat=K.get_mat("paving"))]
    courtyard = (-3.0, 3.0)
    # three four-storey blocks around the courtyard
    blocks = [(-9.5, -6.5, 12.0, 8.0), (9.5, -6.5, 12.0, 8.0), (0.0, 9.0, 16.0, 8.0)]
    for i, (bx, by, bw, bd) in enumerate(blocks):
        o.append(K.box(f"block-base{i}", bw, bd, 0.4, x=bx, y=by, z=0.3,
                       mat=K.get_mat("stone_pale")))
        for f in range(4):
            z = 0.7 + f * STOREY
            o.append(K.box(f"block-glass{i}{f}", bw, bd, 2.1, x=bx, y=by, z=z + 0.9,
                           mat=K.get_mat_glass("glass_cool")))
            o.append(K.box(f"block-slab{i}{f}", bw + 0.12, bd + 0.12, 1.0, x=bx, y=by, z=z,
                           mat=K.get_mat("offwhite")))
        top = 0.7 + 4 * STOREY
        o.append(K.box(f"block-roof{i}", bw + 0.1, bd + 0.1, 0.2, x=bx, y=by, z=top,
                       mat=K.get_mat("stone_pale")))
    # courtyard planters + trees
    for (px, py) in [(-4.5, 1.0), (4.5, 1.0)]:
        o.append(K.box("planter", 1.6, 1.6, 0.6, x=px, y=py, z=0.3, mat=K.get_mat("stone_pale")))
        o.append(K.cyl("tree-trunk", 0.25, 2.2, verts=6, x=px, y=py, z=0.9,
                       mat=K.get_mat("palm_trunk")))
        o.append(K.ico("tree-crown", 1.3, x=px, y=py, z=3.6, mat=K.get_mat("leaf"), detail=1))
    return o


def warehouse(K):
    o = [K.box("yard", 28.0, 20.0, 0.3, mat=K.get_mat("paving"))]
    # long gable hall
    o.append(K.box("hall", 20.0, 12.0, 5.0, y=1.0, z=0.3, mat=K.get_mat("offwhite")))
    # gable roof: two slabs meeting at the ridge (centre-facing edge rises)
    for s in (-1, 1):
        o.append(K.box("gable", 20.4, 6.8, 0.25, y=s * 3.1, z=6.55,
                       rot=(math.radians(-22 * s), 0, 0), mat=K.get_mat("metal_dark")))
    # loading dock: ramp + three dock doors + canopy
    o.append(K.box("dock-ramp", 8.0, 2.0, 0.25, x=-4.0, y=-6.6, z=0.3, mat=K.get_mat("paving")))
    for dx in (-7.0, -4.0, -1.0):
        o.append(K.box("dock-door", 2.0, 0.15, 2.6, x=dx, y=-5.05, z=0.3,
                       mat=K.get_mat("metal_dark")))
    o.append(K.box("dock-canopy", 10.0, 3.0, 0.15, x=-4.0, y=-6.2, z=3.6,
                   mat=K.get_mat("charcoal")))
    # container stacks in the yard
    for i, (cx, cy) in enumerate([(9.5, -5.5), (9.5, -2.5)]):
        o.append(K.box(f"container{i}", 5.5, 2.4, 2.6, x=cx, y=cy, z=0.3,
                       mat=K.get_mat("food_red") if i == 0 else K.get_mat("police_blue")))
    o.append(K.box("container", 5.5, 2.4, 2.6, x=9.5, y=-5.5, z=2.9,
                   mat=K.get_mat("food_yellow")))
    return o


# --------------------------------------------------------------------------
# Farming & settlement (6 families)
# --------------------------------------------------------------------------

def _barn_roof(K, w, d, z, mat="terracotta"):
    """Gambrel-approximation roof: two slabs meeting at a ridge.
    The centre-facing edge of each slab must rise: rot = -angle*s."""
    rise = d * 0.35
    ang = math.degrees(math.atan2(rise, d / 2))
    run = math.hypot(d / 2, rise) + 0.2
    for s in (-1, 1):
        o = K.box("barn-roof", w + 0.4, run, 0.22,
                  z=z + rise / 2.0, rot=(math.radians(-ang * s), 0, 0))
        o.location.y += s * d / 4
        yield o


def farm_barn(K):
    o = [K.box("pad", 16.0, 12.0, 0.3, mat=K.get_mat("grass"))]
    o.append(K.box("barn", 12.0, 8.0, 4.6, z=0.3, mat=K.get_mat("food_red")))
    for part in _barn_roof(K, 12.0, 8.0, 4.9):
        o.append(part)
    # hayloft door + ground door
    o.append(K.box("hay-door", 2.2, 0.15, 2.0, y=-4.02, z=2.8, mat=K.get_mat("timber")))
    o.append(K.box("main-door", 2.0, 0.15, 2.6, x=3.0, y=-4.02, z=0.3, mat=K.get_mat("timber")))
    # cross bracing on the gable
    for s in (-1, 1):
        o.append(K.box("brace", 0.18, 0.18, 4.4, x=0, y=-4.05, z=2.6,
                       rot=(0, 0, math.radians(28 * s)), mat=K.get_mat("timber_light")))
    # attached silo
    o.append(K.cyl("silo", 1.8, 7.5, verts=10, x=7.2, y=1.5, z=0.3, mat=K.get_mat("offwhite")))
    o.append(K.cone("silo-cap", 1.8, 1.4, verts=10, x=7.2, y=1.5, z=7.8,
                    mat=K.get_mat("stone_pale")))
    # hay bales
    for (bx, by) in [(-8.5, 3.5), (-7.0, 4.8)]:
        o.append(K.box("hay", 1.4, 1.0, 1.0, x=bx, y=by, z=0.3,
                       rot=(0, 0, math.radians(18)), mat=K.get_mat("food_yellow")))
    return o


def farm_house(K):
    o = [K.box("lawn", 14.0, 11.0, 0.3, mat=K.get_mat("grass"))]
    o.append(K.box("house", 10.0, 7.0, 3.4, z=0.3, mat=K.get_mat("plaster_warm")))
    o.append(K.box("upper", 10.0, 7.0, 2.6, z=3.7, mat=K.get_mat("cream")))
    for s in (-1, 1):
        o.append(K.box("pitch", 10.3, 4.4, 0.2, y=s * 1.9, z=6.3 + 1.1,
                       rot=(math.radians(-20 * s), 0, 0), mat=K.get_mat("terracotta")))
    # porch
    o.append(K.box("porch", 4.0, 1.8, 0.2, x=-2.5, y=-4.4, z=0.3, mat=K.get_mat("timber")))
    for (px, py) in [(-4.3, -5.1), (-0.7, -5.1)]:
        o.append(K.cyl("porch-col", 0.12, 2.4, verts=6, x=px, y=py, z=0.3,
                       mat=K.get_mat_metal("metal")))
    o.append(K.box("porch-roof", 4.4, 2.2, 0.15, x=-2.5, y=-4.5, z=2.7, mat=K.get_mat("timber")))
    # chimney
    o.append(K.box("chimney", 0.7, 0.7, 2.4, x=3.2, y=1.5, z=5.9, mat=K.get_mat("brick")))
    # windows + door
    o += _windows(K, 8.0, 3, 1.4, fixed=-3.5, mat="glass_dark")
    o.append(K.box("door", 1.1, 0.15, 2.2, x=1.5, y=-3.52, z=0.3, mat=K.get_mat("timber")))
    return o


def farmers_market(K):
    o = [K.box("plaza", 20.0, 16.0, 0.3, mat=K.get_mat("paving"))]
    # three canopy stalls
    for i, (sx, sy, mat) in enumerate([(-6.0, -4.0, "coral"), (0.5, -4.5, "turquoise"),
                                       (6.5, -3.5, "food_yellow")]):
        for (cx, cy) in [(sx - 2.2, sy - 1.6), (sx + 2.2, sy - 1.6),
                         (sx - 2.2, sy + 1.6), (sx + 2.2, sy + 1.6)]:
            o.append(K.cyl("stall-post", 0.1, 2.6, verts=6, x=cx, y=cy, z=0.3,
                           mat=K.get_mat_metal("metal")))
        o.append(K.box("stall-canopy", 5.6, 4.4, 0.18, x=sx, y=sy, z=2.9,
                       mat=K.get_mat(mat)))
        o.append(K.box("stall-table", 3.6, 1.6, 0.9, x=sx, y=sy, z=0.3,
                       mat=K.get_mat("timber")))
        # produce crates
        for (px, py) in [(sx - 0.8, sy), (sx + 0.9, sy)]:
            o.append(K.box("crate", 0.8, 0.8, 0.6, x=px, y=py, z=1.2,
                           mat=K.get_mat("food_red") if i % 2 == 0 else K.get_mat("food_green")))
    # central shade tree + well
    o.append(K.cyl("tree-trunk", 0.35, 3.0, verts=6, x=0.0, y=4.5, z=0.3,
                   mat=K.get_mat("palm_trunk")))
    o.append(K.ico("tree-crown", 2.4, x=0.0, y=4.5, z=4.4, mat=K.get_mat("leaf"), detail=1))
    o.append(K.cyl("well", 0.9, 1.0, verts=8, x=-5.5, y=5.0, z=0.3, mat=K.get_mat("stone_pale")))
    o.append(K.box("well-roof", 1.6, 1.6, 0.15, x=-5.5, y=5.0, z=2.2, mat=K.get_mat("timber")))
    for (wx, wy) in [(-6.0, 4.5), (-5.0, 5.5)]:
        o.append(K.cyl("well-post", 0.08, 1.9, verts=6, x=wx, y=wy, z=0.3,
                       mat=K.get_mat_metal("metal")))
    return o


def orchard_row(K):
    o = [K.box("plot", 14.0, 12.0, 0.3, mat=K.get_mat("grass"))]
    # two rows of fruit trees
    for row_i, ry in enumerate((-3.5, 3.5)):
        for i, tx in enumerate((-5.0, 0.0, 5.0)):
            o.append(K.cyl(f"trunk{row_i}{i}", 0.22, 2.0, verts=6, x=tx, y=ry, z=0.3,
                           mat=K.get_mat("palm_trunk")))
            o.append(K.ico(f"crown{row_i}{i}", 1.5, x=tx, y=ry, z=3.1,
                           mat=K.get_mat("leaf" if row_i == 0 else "leaf_dark"), detail=1))
    # dirt path between the rows
    o.append(K.box("path", 13.0, 1.8, 0.12, z=0.3, mat=K.get_mat("sand")))
    # crate + fence corner
    o.append(K.box("crate", 1.0, 1.0, 0.9, x=6.0, y=-5.2, z=0.3, mat=K.get_mat("timber")))
    for (fx, fy) in [(-6.8, -5.6), (-6.8, 0.0), (-6.8, 5.6)]:
        o.append(K.cyl("fence-post", 0.08, 1.1, verts=6, x=fx, y=fy, z=0.3,
                       mat=K.get_mat("timber")))
    return o


def house_suburban(K):
    o = [K.box("lot", 14.0, 12.0, 0.3, mat=K.get_mat("grass"))]
    # two-storey block
    o.append(K.box("house", 9.0, 6.5, 6.2, x=-1.0, z=0.3, mat=K.get_mat("plaster_warm")))
    for s in (-1, 1):
        o.append(K.box("pitch", 9.3, 4.2, 0.2, x=-1.0, y=s * 2.0, z=6.5 + 0.9,
                       rot=(math.radians(-18 * s), 0, 0), mat=K.get_mat("terracotta")))
    # garage bay
    o.append(K.box("garage", 4.0, 5.5, 3.2, x=4.8, z=0.3, mat=K.get_mat("cream")))
    o.append(K.box("garage-door", 2.6, 0.15, 2.2, x=4.8, y=-2.82, z=0.3,
                   mat=K.get_mat("metal_dark")))
    # porch
    o.append(K.box("porch", 3.4, 1.6, 0.2, x=-3.2, y=-4.1, z=0.3, mat=K.get_mat("stone_pale")))
    for (px, py) in [(-4.7, -4.8), (-1.7, -4.8)]:
        o.append(K.cyl("porch-col", 0.11, 2.6, verts=6, x=px, y=py, z=0.3,
                       mat=K.get_mat_metal("metal")))
    # windows both floors + chimney
    o += _windows(K, 7.0, 3, 1.5, fixed=-3.25, mat="glass_cool")
    o += _windows(K, 7.0, 3, 4.2, fixed=-3.25, mat="glass_cool")
    o.append(K.box("door", 1.0, 0.15, 2.2, x=0.8, y=-3.27, z=0.3, mat=K.get_mat("timber")))
    o.append(K.box("chimney", 0.6, 0.6, 1.9, x=1.5, y=1.0, z=6.6, mat=K.get_mat("brick")))
    return o


def rural_plot(K):
    o = [K.box("field", 16.0, 14.0, 0.3, mat=K.get_mat("grass"))]
    # crop rows
    for row_i, ry in enumerate((-4.0, -1.5, 1.0, 3.5)):
        for i in range(5):
            cx = -6.0 + i * 3.0
            o.append(K.box(f"crop{row_i}{i}", 1.8, 0.5, 0.5, x=cx, y=ry, z=0.3,
                           mat=K.get_mat("food_green" if row_i % 2 == 0 else "leaf"),
                           rot=(0, 0, math.radians(4 if i % 2 else -4))))
    # corner shed + well
    o.append(K.box("shed", 2.6, 2.2, 1.8, x=6.5, y=5.5, z=0.3, mat=K.get_mat("timber")))
    o.append(K.box("shed-roof", 2.9, 2.5, 0.18, x=6.5, y=5.5, z=2.1,
                   mat=K.get_mat("timber_dark")))
    o.append(K.cyl("well", 0.8, 0.9, verts=8, x=6.5, y=-5.5, z=0.3,
                   mat=K.get_mat("stone_pale")))
    # fence line along the -x edge
    for fy in (-5.6, -2.0, 2.0, 5.6):
        o.append(K.cyl("fence-post", 0.08, 1.1, verts=6, x=-7.4, y=fy, z=0.3,
                       mat=K.get_mat("timber")))
    return o


SPECS = [
    ("building.skyscraper-slab", skyscraper_slab, "building", (15.5, 12.5, 35.5)),
    ("building.skyscraper-setback", skyscraper_setback, "building", (22.5, 18.5, 52.5)),
    ("building.skyscraper-tapered", skyscraper_tapered, "building", (17.5, 17.5, 48.5)),
    ("building.skyscraper-podium", skyscraper_podium, "building", (24.5, 20.5, 38.5)),
    ("building.skyscraper-twin", skyscraper_twin, "building", (26.0, 9.5, 32.0)),
    ("building.ore-plant", ore_plant, "building", (27.0, 23.0, 10.5)),
    ("landscape.mining-site", mining_site, "landscape", (28.5, 24.5, 9.0)),
    ("building.oil-gas-plant", oil_gas_plant, "building", (29.0, 25.0, 14.5)),
    ("building.datacenter", datacenter, "building", (27.5, 20.5, 7.5)),
    ("building.office-campus", office_campus, "building", (31.5, 25.5, 14.5)),
    ("building.warehouse", warehouse, "building", (28.5, 20.5, 9.5)),
    ("building.farm-barn", farm_barn, "building", (18.5, 12.5, 9.5)),
    ("building.farm-house", farm_house, "building", (14.5, 11.5, 8.5)),
    ("building.farmers-market", farmers_market, "building", (20.5, 16.5, 7.0)),
    ("landscape.orchard-row", orchard_row, "landscape", (14.5, 12.5, 5.5)),
    ("building.house-suburban", house_suburban, "building", (14.5, 12.5, 9.5)),
    ("landscape.rural-plot", rural_plot, "landscape", (16.5, 14.5, 2.5)),
]


def build(lib):
    reports = []
    for entry in SPECS:
        fid, fn, cat, expect = entry
        rep, obj = lib.family(fid, fn, cat, lib, expect=expect)
        reports.append(rep)
        lib.shelf_add(obj, cat)
    return reports
