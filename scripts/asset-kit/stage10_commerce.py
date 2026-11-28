"""stage10_commerce.py — commerce, entertainment & recreation families (R048.11).

Grid: 4 m module. Storey 3.2 m. Doors 2.1-2.4 m (R048 review ruler).
Every family carries distinct frontage, signage and queue/forecourt geometry:
marquees, blade signs, awnings, terraces, forecourt pads, bigtop tenting.
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


def _awning(K, w, x=0.0, y=0.0, z=0.0, mat="coral"):
    return [K.box("awning", w, 1.6, 0.1, x=x, y=y, z=z,
                  rot=(math.radians(-12), 0, 0), mat=K.get_mat(mat))]


def _blade_sign(K, w, h, x, y, z, mat="coral"):
    """Roof-mounted blade sign: stem + panel."""
    o = [K.cyl("sign-stem", 0.06, 1.6, verts=6, x=x, y=y, z=z, mat=K.get_mat_metal("metal"))]
    o.append(K.box("sign-panel", w, 0.25, h, x=x, y=y, z=z + 1.6, mat=K.get_mat(mat)))
    return o


def _ferris(K, x, y, ground, R=6.5, mat="turquoise"):
    """Low-poly ferris wheel: pad, mast, hub, ring, spokes, cabins."""
    z_top = ground + 9.5
    o = [K.box("wheel-base", 5.0, 5.0, 0.5, x=x, y=y, z=ground, mat=K.get_mat("paving"))]
    o.append(K.box("wheel-mast", 0.9, 0.9, 8.5, x=x, y=y, z=ground + 0.5, mat=K.get_mat_metal("metal_dark")))
    o.append(K.box("wheel-hub", 1.3, 1.3, 1.3, x=x, y=y, z=z_top - 0.65, mat=K.get_mat_metal("metal")))
    ring = K.torus("wheel-ring", R, 0.14, x=x, y=y, z=z_top, seg=12, rad=5)
    ring.rotation_euler = (math.radians(90), 0, 0)
    o.append(ring)
    for i in range(8):
        ang = i * math.pi / 4
        o.append(K.box("wheel-spoke", R, 0.12, 0.12,
                       x=x + (R / 2) * math.cos(ang), y=y,
                       z=z_top - 0.06, rot=(0, -ang, 0), mat=K.get_mat_metal("metal")))
        o.append(K.box("wheel-cabin", 0.8, 0.6, 0.55,
                       x=x + R * math.cos(ang), y=y,
                       z=z_top + R * math.sin(ang) - 0.6, mat=K.get_mat(mat if i % 2 else "mango")))
    return o


def movie_theater(K):
    o = [K.box("plinth", 20.6, 14.6, 0.5, mat=K.get_mat("stone_pale"))]
    o.append(K.box("shell", 20.0, 13.0, 9.6, z=0.5, mat=K.get_mat("offwhite")))
    # two-storey curtain front
    o.extend(_windows(K, 14.0, 7, 7.2, fixed=-6.55, mat="glass_dark"))
    o.extend(_windows(K, 14.0, 7, 3.4, fixed=-6.55, mat="glass_cool"))
    # marquee canopy over the entrance
    o.append(K.box("marquee", 7.0, 2.4, 0.15, y=-7.4, z=4.2, mat=K.get_mat("mango")))
    for x in (-2.8, 0.0, 2.8):
        o.append(K.cyl("marquee-col", 0.14, 3.7, verts=8, x=x, y=-8.2, z=0.5,
                       mat=K.get_mat_metal("metal")))
    o.append(K.box("ticket", 2.2, 1.2, 2.4, x=-4.6, y=-7.2, z=0.5, mat=K.get_mat("charcoal")))
    # tall roof sign blade
    o.extend(_blade_sign(K, 6.0, 2.2, 0.0, 2.0, 10.1, mat="mango"))
    o.append(K.box("roof-slab", 20.3, 13.3, 0.15, z=10.1, mat=K.get_mat("charcoal")))
    o.append(K.box("ac-1", 1.4, 1.0, 0.6, x=6.0, y=3.0, z=10.25, mat=K.get_mat_metal("steel")))
    o.append(K.box("ac-2", 1.0, 0.8, 0.5, x=7.8, y=3.0, z=10.25, mat=K.get_mat_metal("steel")))
    return o


def arcade(K):
    o = [K.box("plinth", 12.6, 10.6, 0.5, mat=K.get_mat("stone_pale"))]
    o.append(K.box("shell", 12.0, 10.0, 5.6, z=0.5, mat=K.get_mat("purple_paint")))
    # big glowing front band
    o.append(K.box("glaze", 10.0, 0.14, 2.2, y=-5.05, z=1.2, mat=K.get_mat_glass("glass_cool")))
    for x in range(-5, 6, 5):
        o.append(K.box("mullion", 0.12, 0.2, 2.2, x=x, y=-5.08, z=1.2, mat=K.get_mat("charcoal")))
    o.append(K.box("door", 1.6, 0.12, 2.4, x=4.2, y=-5.08, z=0.5, mat=K.get_mat_glass("glass_dark")))
    # neon sign band above the glazing
    o.append(K.box("sign-band", 10.4, 0.12, 0.9, y=-5.07, z=3.6, mat=K.get_mat("turquoise")))
    o.append(K.box("sign-cap", 10.6, 0.14, 0.15, y=-5.07, z=4.5, mat=K.get_mat("charcoal")))
    # flat roof with AC
    o.append(K.box("roof-slab", 12.3, 10.3, 0.15, z=6.1, mat=K.get_mat("charcoal")))
    o.append(K.box("ac", 1.2, 0.9, 0.5, x=4.0, y=2.5, z=6.25, mat=K.get_mat_metal("steel")))
    # forecourt with two queue posts
    o.append(K.cyl("queue-1", 0.08, 0.9, verts=8, x=-2.5, y=-6.6, z=0.0, mat=K.get_mat_metal("metal")))
    o.append(K.cyl("queue-2", 0.08, 0.9, verts=8, x=2.5, y=-6.6, z=0.0, mat=K.get_mat_metal("metal")))
    o.append(K.box("queue-rail", 5.4, 0.06, 0.06, y=-6.6, z=0.8, mat=K.get_mat_metal("metal")))
    return o


def restaurant_row(K):
    o = [K.box("plinth", 16.6, 12.6, 0.5, mat=K.get_mat("stone_pale"))]
    o.append(K.box("shell", 16.0, 10.0, 5.8, z=0.5, mat=K.get_mat("plaster_warm")))
    # two storefronts with awnings
    for i, x in enumerate((-4.0, 4.0)):
        o.append(K.box("shop-glass", 5.6, 0.14, 2.6, x=x, y=-5.05, z=1.0,
                       mat=K.get_mat_glass("glass_cool")))
        o.append(K.box("shop-door", 1.2, 0.12, 2.4, x=x + 2.0, y=-5.08, z=0.5,
                       mat=K.get_mat_glass("glass_dark")))
        o.extend(_awning(K, 5.8, x=x, y=-5.7, z=3.7, mat="coral" if i == 0 else "turquoise"))
        o.append(K.box("shop-sign", 3.6, 0.12, 0.7, x=x, y=-5.07, z=3.9,
                       mat=K.get_mat("charcoal")))
    # terrace with tables and chairs
    for x in (-3.0, -0.5, 2.0, 4.5):
        o.append(K.cyl("table-top", 0.45, 0.08, verts=8, x=x, y=-7.2, z=1.0,
                       mat=K.get_mat("timber_light")))
        o.append(K.cyl("table-leg", 0.05, 1.0, verts=6, x=x, y=-7.2, z=0.0,
                       mat=K.get_mat_metal("metal_dark")))
        for dx in (-0.8, 0.8):
            o.append(K.box("chair", 0.4, 0.4, 0.45, x=x + dx, y=-7.2, z=0.0,
                           mat=K.get_mat("timber")))
    o.append(K.box("roof-slab", 16.3, 10.3, 0.15, z=6.3, mat=K.get_mat("charcoal")))
    return o


def mall(K):
    o = [K.box("plinth", 28.6, 18.6, 0.5, mat=K.get_mat("stone_pale"))]
    o.append(K.box("shell", 28.0, 17.0, 7.4, z=0.5, mat=K.get_mat("white")))
    # long glass curtain front
    o.append(K.box("curtain", 24.0, 0.14, 4.6, y=-8.55, z=1.2, mat=K.get_mat_glass("glass_cool")))
    for x in range(-12, 13, 4):
        o.append(K.box("mullion", 0.14, 0.2, 4.6, x=x, y=-8.58, z=1.2, mat=K.get_mat("charcoal")))
    # twin entrance canopies
    for x in (-5.0, 5.0):
        o.append(K.box("canopy", 4.4, 2.2, 0.12, x=x, y=-9.6, z=3.4, mat=K.get_mat("stone_pale")))
        for cx in (x - 1.6, x + 1.6):
            o.append(K.cyl("canopy-col", 0.14, 2.9, verts=8, x=cx, y=-10.4, z=0.5,
                           mat=K.get_mat_metal("metal")))
    # roof plant
    o.append(K.box("roof-slab", 28.3, 17.3, 0.15, z=7.9, mat=K.get_mat("charcoal")))
    for (x, y) in [(-9.0, 4.0), (-6.0, 4.0), (8.0, 4.0)]:
        o.append(K.box("hvac", 1.8, 1.2, 0.8, x=x, y=y, z=8.05, mat=K.get_mat_metal("steel")))
    # parking forecourt strip
    o.append(K.box("forecourt", 26.0, 4.0, 0.06, y=-11.4, z=0.0, mat=K.get_mat("asphalt")))
    for x in range(-12, 13, 3):
        o.append(K.box("park-line", 0.1, 3.6, 0.012, x=x, y=-11.4, z=0.06, mat=K.get_mat("white")))
    return o


def clothing_store(K):
    o = [K.box("plinth", 10.6, 8.6, 0.5, mat=K.get_mat("stone_pale"))]
    o.append(K.box("shell", 10.0, 8.0, 6.6, z=0.5, mat=K.get_mat("cream")))
    # display windows
    o.append(K.box("display-l", 2.8, 0.14, 2.2, x=-2.8, y=-4.05, z=1.0,
                   mat=K.get_mat_glass("glass_cool")))
    o.append(K.box("display-r", 2.8, 0.14, 2.2, x=2.8, y=-4.05, z=1.0,
                   mat=K.get_mat_glass("glass_cool")))
    o.append(K.box("door", 1.6, 0.12, 2.4, y=-4.08, z=0.5, mat=K.get_mat_glass("glass_dark")))
    o.extend(_awning(K, 3.0, x=-2.8, y=-4.7, z=3.4, mat="coral"))
    o.extend(_awning(K, 3.0, x=2.8, y=-4.7, z=3.4, mat="coral"))
    # upper sign band
    o.append(K.box("sign", 8.0, 0.12, 1.0, y=-4.07, z=4.6, mat=K.get_mat("police_blue")))
    o.extend(_windows(K, 6.0, 3, 4.7, fixed=4.05, side=True, mat="glass_cool"))
    o.append(K.box("roof-slab", 10.3, 8.3, 0.15, z=7.1, mat=K.get_mat("charcoal")))
    return o


def furniture_store(K):
    o = [K.box("plinth", 16.6, 10.6, 0.5, mat=K.get_mat("stone_pale"))]
    o.append(K.box("shell", 16.0, 9.0, 5.4, z=0.5, mat=K.get_mat("offwhite")))
    # wide glazing with a deep overhang roof
    o.append(K.box("glaze", 13.0, 0.14, 2.8, y=-4.55, z=1.0, mat=K.get_mat_glass("glass_cool")))
    for x in range(-7, 8, 3):
        o.append(K.box("mullion", 0.12, 0.2, 2.8, x=x, y=-4.58, z=1.0, mat=K.get_mat("charcoal")))
    o.append(K.box("roof-over", 17.4, 11.0, 0.2, z=5.9, mat=K.get_mat("timber")))
    for x in (-8.2, 8.2):
        o.append(K.box("roof-post", 0.24, 0.24, 5.4, x=x, y=-5.0, z=0.5,
                       mat=K.get_mat("timber")))
    # blade sign on the roof
    o.extend(_blade_sign(K, 4.6, 1.4, -4.0, 3.0, 6.1, mat="turquoise"))
    return o


def fast_food(K):
    o = [K.box("pad", 16.6, 14.6, 0.4, mat=K.get_mat("paving"))]
    o.append(K.box("shell", 10.0, 8.0, 5.6, x=-2.0, z=0.4, mat=K.get_mat("white")))
    # front glazing + service window
    o.append(K.box("glaze", 6.0, 0.14, 2.2, x=-2.0, y=-4.05, z=1.2,
                   mat=K.get_mat_glass("glass_cool")))
    o.append(K.box("service-win", 1.6, 0.14, 0.9, x=3.6, y=-4.05, z=1.6,
                   mat=K.get_mat_glass("glass_dark")))
    # red band + big roof sign
    o.append(K.box("band", 10.02, 0.1, 0.6, x=-2.0, y=-4.02, z=4.6, mat=K.get_mat("food_red")))
    o.append(K.box("roof-slab", 10.3, 8.3, 0.15, x=-2.0, z=6.0, mat=K.get_mat("charcoal")))
    o.extend(_blade_sign(K, 4.0, 1.8, -2.0, 2.0, 6.15, mat="food_red"))
    # drive-thru loop pad + menu board + queue lane
    o.append(K.box("drive-pad", 8.0, 9.0, 0.06, x=9.0, y=-2.5, z=0.0, mat=K.get_mat("asphalt")))
    o.append(K.box("menu-board", 2.0, 0.16, 2.6, x=6.6, y=-5.2, z=0.4, mat=K.get_mat("charcoal")))
    o.append(K.box("menu-face", 1.8, 0.1, 2.2, x=6.6, y=-5.3, z=0.7, mat=K.get_mat("food_yellow")))
    o.append(K.box("queue-lane", 0.12, 7.0, 0.02, x=9.0, y=-2.5, z=0.06, mat=K.get_mat("white")))
    for y in (-5.5, -2.5, 0.5):
        o.append(K.cyl("bollard", 0.06, 0.7, verts=6, x=7.0, y=y, z=0.0,
                       mat=K.get_mat_metal("metal_dark")))
    return o


def pier_carnival(K):
    o = [K.box("pier-deck", 14.6, 18.6, 0.5, mat=K.get_mat("timber"))]
    for x in (-6.0, 0.0, 6.0):
        for y in (-7.5, 0.0, 7.5):
            o.append(K.cyl("pier-post", 0.25, 2.4, verts=8, x=x, y=y, z=-2.4,
                           mat=K.get_mat("timber_dark")))
    # row of game booths with striped canopies
    for i, x in enumerate((-4.5, 0.0, 4.5)):
        o.append(K.box("booth", 3.6, 3.2, 2.8, x=x, y=-4.5, z=0.5,
                       mat=K.get_mat("cream" if i != 1 else "coral")))
        o.append(K.box("booth-counter", 3.0, 0.14, 1.2, x=x, y=-6.2, z=0.5,
                       mat=K.get_mat("timber")))
        o.extend(_awning(K, 3.8, x=x, y=-6.4, z=3.3, mat="mango" if i % 2 else "turquoise"))
    # small ferris wheel at the far end
    o.extend(_ferris(K, 0.0, 5.0, 0.5, R=5.0, mat="coral"))
    o.append(K.cyl("flag-pole", 0.05, 3.2, verts=6, x=6.0, y=-6.5, z=0.5,
                   mat=K.get_mat_metal("metal")))
    o.append(K.box("flag", 0.7, 0.05, 0.45, x=6.38, y=-6.5, z=3.1, mat=K.get_mat("mango")))
    return o


def carnival_bigtop(K):
    o = [K.box("ground-pad", 20.6, 20.6, 0.3, mat=K.get_mat("paving"))]
    # big striped tent: cone + ring band + entrance canopy
    o.append(K.cone("tent", 8.0, 9.0, verts=14, z=0.3, mat=K.get_mat("coral")))
    o.append(K.cyl("tent-ring", 8.15, 0.5, verts=14, z=0.3, mat=K.get_mat("white")))
    o.append(K.cyl("tent-ring-2", 6.9, 0.3, verts=14, z=4.3, mat=K.get_mat("white")))
    o.append(K.cyl("tent-spire", 0.12, 1.4, verts=6, z=9.3, mat=K.get_mat_metal("metal")))
    o.append(K.box("flag", 0.9, 0.05, 0.5, x=0.5, z=10.4, mat=K.get_mat("mango")))
    # entrance gate with canopy
    o.append(K.box("gate-canopy", 4.0, 1.8, 0.12, y=-8.4, z=3.2, mat=K.get_mat("coral")))
    for x in (-1.6, 1.6):
        o.append(K.cyl("gate-col", 0.14, 2.9, verts=8, x=x, y=-9.0, z=0.3,
                       mat=K.get_mat_metal("metal")))
    # ticket booth
    o.append(K.box("ticket", 2.4, 1.6, 2.4, x=6.5, y=-7.5, z=0.3, mat=K.get_mat("cream")))
    o.append(K.box("ticket-roof", 2.7, 1.9, 0.15, x=6.5, y=-7.5, z=2.7, mat=K.get_mat("charcoal")))
    o.append(K.box("ticket-sign", 1.8, 0.1, 0.5, x=6.5, y=-8.32, z=2.0, mat=K.get_mat("mango")))
    # queue rail
    for y in (-8.5, -0.5):
        o.append(K.cyl("queue-post", 0.06, 0.9, verts=6, x=4.6, y=y, z=0.3,
                       mat=K.get_mat_metal("metal")))
    o.append(K.box("queue-rail", 0.08, 8.0, 0.08, x=4.6, y=-4.5, z=1.1,
                   mat=K.get_mat_metal("metal")))
    return o


def theme_park(K):
    o = [K.box("pad", 26.6, 20.6, 0.3, mat=K.get_mat("grass"))]
    # entrance gate: two pylons + arch sign
    for x in (-7.0, 7.0):
        o.append(K.box("gate-pylon", 1.6, 1.6, 5.0, x=x, y=-8.5, z=0.3,
                       mat=K.get_mat("stone_pale")))
        o.append(K.box("pylon-cap", 2.0, 2.0, 0.5, x=x, y=-8.5, z=5.3, mat=K.get_mat("mango")))
    o.append(K.box("gate-arch", 16.6, 0.9, 0.9, y=-8.5, z=5.0, mat=K.get_mat("mango")))
    o.append(K.box("gate-sign", 9.0, 0.14, 0.7, y=-9.0, z=5.2, mat=K.get_mat("charcoal")))
    # ferris wheel, mid-park
    o.extend(_ferris(K, -6.0, 3.0, 0.3, R=6.5, mat="coral"))
    # carousel: base disc + canopy + pole horses
    o.append(K.cyl("carousel-base", 3.4, 0.4, verts=12, x=6.0, y=3.0, z=0.3,
                   mat=K.get_mat_metal("metal_dark")))
    o.append(K.cone("carousel-canopy", 4.0, 1.4, verts=12, x=6.0, y=3.0, z=3.2,
                    mat=K.get_mat("turquoise")))
    o.append(K.cyl("carousel-hub", 0.14, 2.8, verts=8, x=6.0, y=3.0, z=0.7,
                   mat=K.get_mat_metal("metal")))
    for i in range(6):
        ang = i * math.pi / 3
        x = 6.0 + 2.4 * math.cos(ang)
        y = 3.0 + 2.4 * math.sin(ang)
        o.append(K.cyl("horse", 0.22, 0.7, verts=8, x=x, y=y, z=0.7, mat=K.get_mat("white")))
        o.append(K.ico("horse-head", 0.2, x=x, y=y + 0.28, z=1.55, mat=K.get_mat("mango"), detail=1))
    # snack kiosk by the gate
    o.append(K.box("kiosk", 3.0, 2.4, 2.6, x=11.0, y=-6.0, z=0.3, mat=K.get_mat("cream")))
    o.extend(_awning(K, 3.2, x=11.0, y=-7.4, z=3.0, mat="mango"))
    o.append(K.box("kiosk-roof", 3.3, 2.7, 0.15, x=11.0, y=-6.0, z=2.9, mat=K.get_mat("charcoal")))
    return o


def stadium(K):
    # Oval bowl: build the circular ring parts, boolean them, then squash
    # in y so the reads as an ellipse at city scale.
    SY = 0.78
    o = [K.box("apron", 33.5, 24.0, 0.4, mat=K.get_mat("paving"))]
    # outer wall: solid disc minus a core hole so the bowl is open
    # cutters must overshoot the faces they cut (coplanar bottoms make the
    # EXACT solver keep a stray cap face inside the hole)
    outer = K.cyl("bowl-outer", 13.6, 8.0, verts=18, z=0.4, mat=K.get_mat("offwhite"))
    core = K.cyl("bowl-core", 11.0, 8.6, verts=18, z=0.2, mat=K.get_mat("white"))
    cut2 = outer.modifiers.new("bowl-cut", "BOOLEAN")
    cut2.operation = "DIFFERENCE"
    cut2.object = core
    bpy = K.bpy
    bpy.context.view_layer.objects.active = outer
    bpy.ops.object.modifier_apply(modifier="bowl-cut")
    bpy.data.objects.remove(core, do_unlink=True)
    o.append(outer)
    inner = K.cyl("bowl-inner", 10.8, 1.4, verts=18, z=0.4, mat=K.get_mat("white"))
    o.append(inner)
    # roof ring: solid disc minus a hole so the field reads from above
    roof = K.cyl("bowl-roof", 14.2, 1.0, verts=18, z=8.4, mat=K.get_mat("stone_pale"))
    hole = K.cyl("roof-hole", 11.0, 1.8, verts=18, z=8.2, mat=K.get_mat("white"))
    cut = roof.modifiers.new("roof-cut", "BOOLEAN")
    cut.operation = "DIFFERENCE"
    cut.object = hole
    bpy = K.bpy
    bpy.context.view_layer.objects.active = roof
    bpy.ops.object.modifier_apply(modifier="roof-cut")
    bpy.data.objects.remove(hole, do_unlink=True)
    o.append(roof)
    field = K.cyl("field", 10.4, 0.16, verts=18, z=1.8, mat=K.get_mat("grass"))
    strip = K.cyl("field-strip", 5.2, 0.2, verts=18, z=1.8, mat=K.get_mat("grass"))
    o.append(field)
    o.append(strip)
    # squash the bowl into an ellipse (baked into the mesh in family()'s join)
    for p in (outer, inner, roof, field, strip):
        p.scale = (1.0, SY, 1.0)
    # entrance plaza + canopy on the -y end
    o.append(K.box("plaza", 10.0, 7.0, 0.4, y=-12.5, z=0.0, mat=K.get_mat("paving")))
    o.append(K.box("canopy", 9.0, 4.0, 0.14, y=-11.5, z=4.0, mat=K.get_mat("charcoal")))
    for x in (-3.5, 3.5):
        o.append(K.cyl("canopy-col", 0.16, 3.6, verts=8, x=x, y=-12.8, z=0.4,
                       mat=K.get_mat_metal("metal")))
    # corner light masts
    for (x, y) in [(-15.0, -11.5), (15.0, -11.5), (-15.0, 11.5), (15.0, 11.5)]:
        o.append(K.cyl("mast", 0.18, 13.0, verts=8, x=x, y=y, z=0.0,
                       mat=K.get_mat_metal("metal")))
        o.append(K.box("light-head", 1.4, 0.5, 0.8, x=x, y=y, z=13.0,
                       mat=K.get_mat("white")))
    return o


SPECS = [
    ("building.movie-theater", movie_theater, "building", (21.5, 16.0, 14.5)),
    ("building.arcade", arcade, "building", (13.0, 12.0, 7.0)),
    ("building.restaurant-row", restaurant_row, "building", (17.0, 14.5, 7.0)),
    ("building.mall", mall, "building", (29.5, 24.0, 9.5)),
    ("building.clothing-store", clothing_store, "building", (11.0, 10.0, 8.0)),
    ("building.furniture-store", furniture_store, "building", (18.0, 12.0, 9.5)),
    ("building.fast-food", fast_food, "building", (23.0, 15.5, 9.6)),
    ("building.pier-carnival", pier_carnival, "building", (15.5, 22.0, 17.6)),
    ("building.carnival-bigtop", carnival_bigtop, "building", (21.5, 22.0, 12.0)),
    ("building.theme-park", theme_park, "building", (27.5, 22.0, 17.0)),
    ("building.stadium", stadium, "building", (33.5, 28.0, 14.0)),
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
