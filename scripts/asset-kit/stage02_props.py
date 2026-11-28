"""stage02_props.py — public realm street furniture (families 38-51 + extras)."""
import math

import bpy


def streetlamp(K):
    o = [K.box("base", 0.35, 0.35, 0.15, mat=K.get_mat("metal_dark"))]
    o.append(K.cyl("pole", 0.06, 4.0, verts=8, z=0.15, mat=K.get_mat_metal("metal_dark")))
    o.append(K.box("arm", 1.1, 0.08, 0.08, x=0.55, z=4.1, rot=(0, 0, 0), mat=K.get_mat_metal("metal_dark")))
    o.append(K.box("head", 0.5, 0.18, 0.1, x=1.05, z=4.05, mat=K.get_mat("charcoal")))
    o.append(K.box("lamp-glow", 0.36, 0.1, 0.03, x=1.05, z=3.99, mat=K.get_mat("window_warm")))
    return o


def traffic_signal(K):
    o = [K.box("base", 0.4, 0.4, 0.1, mat=K.get_mat("metal_dark"))]
    o.append(K.cyl("pole", 0.05, 3.2, verts=8, z=0.1, mat=K.get_mat_metal("metal_dark")))
    o.append(K.box("arm", 0.9, 0.07, 0.07, x=0.45, z=3.2, mat=K.get_mat_metal("metal_dark")))
    o.append(K.box("head", 0.16, 0.46, 0.08, x=0.85, z=3.15, mat=K.get_mat("charcoal")))
    o.append(K.cyl("lens-r", 0.055, 0.05, verts=8, x=0.85, y=-0.14, z=3.15, rot=(math.radians(90), 0, 0),
                   mat=K.get_mat("red_paint")))
    o.append(K.cyl("lens-y", 0.055, 0.05, verts=8, x=0.85, y=0.0, z=3.15, rot=(math.radians(90), 0, 0),
                   mat=K.get_mat("taxi_yellow")))
    o.append(K.cyl("lens-g", 0.055, 0.05, verts=8, x=0.85, y=0.14, z=3.15, rot=(math.radians(90), 0, 0),
                   mat=K.get_mat("leaf")))
    return o


def stop_sign(K):
    o = [K.box("base", 0.3, 0.3, 0.08, mat=K.get_mat("metal_dark"))]
    o.append(K.cyl("pole", 0.045, 2.6, verts=8, z=0.08, mat=K.get_mat_metal("metal")))
    o.append(K.cyl("sign", 0.3, 0.05, verts=8, z=2.5, rot=(math.radians(90), 0, 0), mat=K.get_mat("red_paint")))
    o.append(K.cyl("rim", 0.24, 0.03, verts=8, z=2.5, rot=(math.radians(90), 0, 0), mat=K.get_mat("white")))
    return o


def shelter(K):
    o = [K.box("platform", 4.0, 2.2, 0.12, mat=K.get_mat("paving"))]
    for x in (-1.85, 1.85):
        o.append(K.box("post", 0.1, 0.1, 2.4, x=x, z=0.12, mat=K.get_mat_metal("metal_dark")))
    o.append(K.box("roof", 4.2, 2.3, 0.08, z=2.5, mat=K.get_mat("charcoal")))
    o.append(K.box("back-glass", 3.6, 0.05, 1.6, x=0.0, y=-1.0, z=1.5, mat=K.get_mat_glass("glass_cool")))
    for x in (-1.7, -0.55, 0.55, 1.7):
        o.append(K.box("mullion", 0.05, 0.05, 1.6, x=x, y=-1.0, z=1.5, mat=K.get_mat_metal("metal_dark")))
    o.append(K.box("bench-seat", 1.4, 0.35, 0.06, x=0.6, z=0.6, mat=K.get_mat("timber")))
    o.append(K.box("bench-back", 1.4, 0.05, 0.35, x=0.6, y=-0.16, z=0.85, mat=K.get_mat("timber")))
    for x in (0.1, 1.1):
        o.append(K.box("bench-leg", 0.06, 0.3, 0.5, x=x, z=0.12, mat=K.get_mat_metal("metal_dark")))
    o.append(K.box("route-panel", 0.5, 0.03, 0.7, x=-1.4, y=-1.02, z=1.7, mat=K.get_mat("white")))
    o.append(K.box("route-strip", 0.3, 0.035, 0.15, x=-1.4, y=-1.02, z=1.9, mat=K.get_mat("coral")))
    return o


def bench(K):
    o = [K.box("seat", 1.6, 0.4, 0.06, z=0.45, mat=K.get_mat("timber"))]
    for i in range(3):
        o.append(K.box("slat", 1.6, 0.1, 0.05, y=-0.12 + i * 0.12, z=0.51, mat=K.get_mat("timber_light")))
    o.append(K.box("back", 1.6, 0.05, 0.4, y=-0.18, z=0.75, rot=(math.radians(-12), 0, 0),
                   mat=K.get_mat("timber")))
    for x in (-0.7, 0.7):
        o.append(K.box("leg", 0.07, 0.35, 0.45, x=x, mat=K.get_mat_metal("metal_dark")))
    return o


def bin(K):
    o = [K.cyl("body", 0.22, 0.85, verts=10, z=0.05, r2=0.18, mat=K.get_mat("metal_dark"))]
    o.append(K.cyl("lid", 0.24, 0.08, verts=10, z=0.9, mat=K.get_mat("charcoal")))
    o.append(K.box("handle", 0.3, 0.05, 0.04, z=0.99, mat=K.get_mat("metal")))
    return o


def hydrant(K):
    o = [K.cyl("base", 0.16, 0.1, verts=8, mat=K.get_mat("red_paint"))]
    o.append(K.cyl("body", 0.14, 0.5, verts=8, z=0.1, mat=K.get_mat("red_paint")))
    o.append(K.ico("cap", 0.12, z=0.68, mat=K.get_mat("red_paint"), detail=0))
    for a in (0, math.pi / 2, math.pi, 3 * math.pi / 2):
        o.append(K.cyl("nozzle", 0.05, 0.12, verts=6,
                       x=math.cos(a) * 0.17, y=math.sin(a) * 0.17, z=0.35,
                       rot=(0, math.radians(90), a), mat=K.get_mat("red_paint")))
    o.append(K.cyl("cap-n", 0.035, 0.05, verts=6, x=0.2, z=0.35, rot=(0, math.radians(90), 0),
                   mat=K.get_mat("metal")))
    return o


def bollard(K):
    o = [K.cyl("post", 0.06, 0.75, verts=8, mat=K.get_mat("taxi_yellow"))]
    o.append(K.cyl("cap", 0.07, 0.05, verts=8, z=0.75, mat=K.get_mat("charcoal")))
    return o


def billboard(K):
    o = [K.box("post-l", 0.12, 0.12, 3.4, x=-1.6, z=0, mat=K.get_mat_metal("metal_dark"))]
    o.append(K.box("post-r", 0.12, 0.12, 3.4, x=1.6, z=0, mat=K.get_mat_metal("metal_dark")))
    o.append(K.box("frame", 4.2, 0.08, 2.6, z=3.4, mat=K.get_mat("charcoal")))
    o.append(K.box("face", 3.9, 0.06, 2.3, y=-0.03, z=3.45, mat=K.get_mat("turquoise")))
    o.append(K.box("headline", 3.2, 0.065, 0.35, y=-0.04, z=4.0, mat=K.get_mat("white")))
    o.append(K.box("photo", 1.5, 0.065, 0.9, x=1.0, y=-0.04, z=3.7, mat=K.get_mat("mango")))
    return o


def market_stall(K):
    o = [K.box("counter", 2.4, 1.0, 0.85, z=0.05, mat=K.get_mat("timber"))]
    o.append(K.box("counter-top", 2.5, 1.1, 0.06, z=0.9, mat=K.get_mat("timber_light")))
    for x in (-1.15, 1.15):
        for y in (-0.45, 0.45):
            o.append(K.box("post", 0.08, 0.08, 2.3, x=x, y=y, z=0.9, mat=K.get_mat("timber")))
    for i in range(4):
        mat = K.get_mat("coral" if i % 2 else "white")
        o.append(K.box("stripe", 0.62, 1.6, 0.05, x=-1.36 + i * 0.62, z=3.25,
                       rot=(math.radians(-14), 0, 0), mat=mat))
    for x in (-0.6, 0.1, 0.7):
        o.append(K.box("good", 0.3, 0.3, 0.25, x=x, z=0.96, mat=K.get_mat("food_yellow")))
    o.append(K.box("sign", 1.2, 0.04, 0.4, y=-0.75, z=2.6, mat=K.get_mat("white")))
    return o


def cafe_patio(K):
    o = [K.cyl("table-ped", 0.05, 0.7, verts=6, mat=K.get_mat_metal("metal_dark"))]
    o.append(K.box("table-top", 0.7, 0.7, 0.05, z=0.7, mat=K.get_mat("timber_light")))
    for x in (-0.45, 0.45):
        o.append(K.box("chair-seat", 0.4, 0.4, 0.05, x=x, z=0.4, mat=K.get_mat("blue_paint")))
        o.append(K.box("chair-back", 0.4, 0.05, 0.45, x=x + 0.18 if x < 0 else x - 0.18,
                       y=-0.18 if x < 0 else 0.18, z=0.65, mat=K.get_mat("blue_paint")))
        for dx in (-0.15, 0.15):
            o.append(K.box("chair-leg", 0.04, 0.04, 0.4, x=x + dx, z=0.0, mat=K.get_mat_metal("metal_dark")))
    o.append(K.cyl("umbrella-pole", 0.035, 2.2, verts=6, x=-0.9, z=0.0, mat=K.get_mat_metal("metal_dark")))
    o.append(K.cone("umbrella", 1.3, 0.4, verts=8, x=-0.9, z=2.2, mat=K.get_mat("coral")))
    return o


def fountain(K):
    o = [K.cyl("basin", 1.6, 0.5, verts=12, mat=K.get_mat("stone_pale"))]
    o.append(K.cyl("water", 1.45, 0.05, verts=12, z=0.45, mat=K.get_mat("sea")))
    o.append(K.cyl("column", 0.15, 0.9, verts=8, z=0.5, mat=K.get_mat("stone_pale")))
    o.append(K.cyl("upper", 0.55, 0.12, verts=10, z=1.4, mat=K.get_mat("stone_pale")))
    o.append(K.cyl("upper-water", 0.48, 0.04, verts=10, z=1.5, mat=K.get_mat("sea")))
    o.append(K.ico("spout", 0.12, z=1.66, mat=K.get_mat("stone_pale"), detail=0))
    return o


def planter(K):
    o = [K.box("box", 1.2, 0.6, 0.45, mat=K.get_mat("timber"))]
    o.append(K.box("soil", 1.1, 0.5, 0.06, z=0.45, mat=K.get_mat("leaf_dark")))
    o.append(K.ico("bush-a", 0.35, x=-0.3, z=0.75, mat=K.get_mat("leaf")))
    o.append(K.ico("bush-b", 0.28, x=0.25, z=0.72, mat=K.get_mat("leaf_dark")))
    o.append(K.ico("flower", 0.1, x=0.0, z=0.95, mat=K.get_mat("coral"), detail=0))
    return o


def recreation(K):
    o = []
    # swing frame
    for x in (-1.1, 1.1):
        for s in (-0.35, 0.35):
            o_x = K.box("leg", 0.08, 0.08, 2.2, x=x, y=s, z=0.0, mat=K.get_mat("metal_dark"))
            o.append(o_x)
        o.append(K.box("top-bar", 0.1, 0.9, 0.08, x=x, z=2.2, mat=K.get_mat("metal_dark")))
    for x in (-0.6, 0.2):
        for s in (-0.15, 0.15):
            o.append(K.box("chain", 0.03, 0.03, 1.5, x=x + 0.2 if s < 0 else x + 0.2, y=s, z=1.45,
                           mat=K.get_mat_metal("metal")))
        o.append(K.box("seat", 0.45, 0.1, 0.05, x=x + 0.2, z=0.72, mat=K.get_mat("red_paint")))
    return o


def construction_zone(K):
    cones = [K.box("cone-base", 0.4, 0.4, 0.03, mat=K.get_mat("mango"))]
    for i, (r, z) in enumerate([(0.16, 0.03), (0.12, 0.16), (0.08, 0.3), (0.04, 0.44)]):
        cones.append(K.cone(f"cone-t{i}", r, 0.13, verts=8, z=z, mat=K.get_mat("mango")))
    cones.append(K.box("cone-stripe", 0.2, 0.2, 0.04, x=0, z=0.24, mat=K.get_mat("white")))
    # barrier
    cones.append(K.box("barrier-panel", 1.8, 0.06, 0.5, x=1.6, z=0.75, mat=K.get_mat("white")))
    cones.append(K.box("barrier-stripe", 0.3, 0.065, 0.5, x=1.0, z=0.75, mat=K.get_mat("mango")))
    cones.append(K.box("barrier-stripe2", 0.3, 0.065, 0.5, x=1.9, z=0.75, mat=K.get_mat("mango")))
    for x in (0.85, 2.35):
        cones.append(K.box("barrier-leg", 0.08, 0.5, 0.5, x=x, mat=K.get_mat("metal_dark")))
    return cones


def postbox(K):
    o = [K.box("body", 0.35, 0.28, 0.75, z=0.25, mat=K.get_mat("coral"))]
    o.append(K.cyl("top", 0.175, 0.12, verts=8, z=1.0, rot=(0, math.radians(90), 0), mat=K.get_mat("coral")))
    o.append(K.box("slot", 0.2, 0.02, 0.06, y=-0.15, z=0.8, mat=K.get_mat("charcoal")))
    o.append(K.box("base", 0.4, 0.33, 0.25, mat=K.get_mat("metal_dark")))
    o.append(K.box("flag", 0.05, 0.12, 0.04, x=0.2, y=-0.08, z=0.95, mat=K.get_mat("white")))
    return o


SPECS = [
    ("prop.streetlamp", streetlamp, "prop"),
    ("prop.traffic-signal", traffic_signal, "prop"),
    ("prop.stop-sign", stop_sign, "prop"),
    ("prop.shelter", shelter, "prop"),
    ("prop.bench", bench, "prop"),
    ("prop.bin", bin, "prop"),
    ("prop.hydrant", hydrant, "prop"),
    ("prop.bollard", bollard, "prop"),
    ("prop.billboard", billboard, "prop"),
    ("prop.market-stall", market_stall, "prop"),
    ("prop.cafe-patio", cafe_patio, "prop"),
    ("prop.fountain", fountain, "prop"),
    ("prop.planter", planter, "prop"),
    ("prop.recreation", recreation, "prop"),
    ("prop.construction-zone", construction_zone, "prop"),
    ("prop.postbox", postbox, "prop"),
]


def build(lib):
    reports = []
    for i, (fid, fn, cat) in enumerate(SPECS):
        rep, obj = lib.family(fid, fn, cat, lib)
        reports.append(rep)
        lib.shelf_add(obj, i + 20)
    lib.clear_stage()
    lib._REPORTS.extend(reports)
    return reports
