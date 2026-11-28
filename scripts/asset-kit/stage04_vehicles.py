"""stage04_vehicles.py — road vehicles (spec families 59-66).

glTF forward is -Z, which maps to +Y in Blender (y-up export): vehicle
fronts face +Y. Wheel bottoms sit exactly on z=0; bodies clear the ground.
Wheels are 10-segment cylinders; bodies are beveled boxes — kept well under
the 4000-triangle QA budget.
"""
import math


def wheel(K, x, y, r=0.32, w=0.24):
    o = [K.cyl("wheel", r, w, verts=10, x=x, y=y, z=r - w / 2,
               rot=(0, math.radians(90), 0), mat=K.get_mat("charcoal"))]
    o.append(K.cyl("hub", r * 0.35, w + 0.05, verts=8, x=x, y=y,
                   z=r - (w + 0.05) / 2, rot=(0, math.radians(90), 0),
                   mat=K.get_mat_metal("metal")))
    return o


def car(K, mat_body, length=4.0, cabin=None, roof_sign=False):
    zb = 0.12  # body bottom above ground
    hb = 0.68
    o = [K.box("body", 1.75, length, hb, z=zb, bevel=0.08, mat=mat_body)]
    if cabin is None:
        cabin = (0.0, 1.6, 0.55)
    cx, cl, ch = cabin
    zc = zb + hb
    o.append(K.box("cabin", 1.5, cl, ch, x=cx, z=zc, bevel=0.06, mat=mat_body))
    # glass: front (+Y) and rear windshields, side panes
    o.append(K.box("glass-f", 1.35, 0.1, ch * 0.72, x=cx, y=cl / 2 - 0.05,
                   z=zc + 0.04, mat=K.get_mat_glass("glass_dark")))
    o.append(K.box("glass-r", 1.35, 0.1, ch * 0.72, x=cx, y=-cl / 2 + 0.05,
                   z=zc + 0.04, mat=K.get_mat_glass("glass_dark")))
    for s in (-1, 1):
        o.append(K.box("glass-s", 0.08, cl * 0.78, ch * 0.66, x=cx, y=s * 0.755,
                       z=zc + 0.04, mat=K.get_mat_glass("glass_dark")))
    # bumpers
    o.append(K.box("bumper-f", 1.8, 0.14, 0.24, y=length / 2 - 0.02, z=zb,
                   mat=K.get_mat("charcoal")))
    o.append(K.box("bumper-r", 1.8, 0.14, 0.24, y=-length / 2 + 0.02, z=zb,
                   mat=K.get_mat("charcoal")))
    # lights: front +Y, rear -Y
    for x in (-0.62, 0.62):
        o.append(K.box("head", 0.3, 0.08, 0.14, x=x, y=length / 2 - 0.05, z=0.42,
                       mat=K.get_mat("window_warm")))
        o.append(K.box("tail", 0.28, 0.08, 0.12, x=x, y=-length / 2 + 0.05, z=0.42,
                       mat=K.get_mat("red_paint")))
    wb = min(0.6, length / 2 - 0.55)
    for x in (-0.8, 0.8):
        for s in (-1, 1):
            o.extend(wheel(K, x, s * wb))
    if roof_sign:
        o.append(K.box("roof-sign", 0.7, 0.3, 0.16, z=zc + ch,
                       mat=K.get_mat("taxi_yellow")))
        o.append(K.box("roof-sign-face", 0.64, 0.06, 0.12, y=0.15, z=zc + ch,
                       mat=K.get_mat("charcoal")))
    return o


def hatchback(K):
    return car(K, K.get_mat("blue_paint"), length=3.8, cabin=(0.0, 1.5, 0.58))


def sedan(K):
    return car(K, K.get_mat("white"), length=4.4, cabin=(0.0, 1.7, 0.56))


def taxi(K):
    return car(K, K.get_mat("taxi_yellow"), length=3.9, cabin=(0.0, 1.5, 0.58),
               roof_sign=True)


def van(K):
    o = [K.box("body", 1.8, 5.0, 1.55, z=0.25, bevel=0.06, mat=K.get_mat("cream"))]
    o.append(K.box("cab-glass", 1.5, 0.1, 0.7, y=2.3, z=0.95,
                   mat=K.get_mat_glass("glass_dark")))
    for s in (-1, 1):
        o.append(K.box("cab-side", 0.08, 0.9, 0.6, x=s * 0.86, y=2.0, z=1.0,
                       mat=K.get_mat_glass("glass_dark")))
    o.append(K.box("bumper-f", 1.85, 0.14, 0.3, y=2.52, z=0.3,
                   mat=K.get_mat("charcoal")))
    o.append(K.box("bumper-r", 1.85, 0.14, 0.3, y=-2.52, z=0.3,
                   mat=K.get_mat("charcoal")))
    for x in (-0.72, 0.72):
        o.append(K.box("head", 0.28, 0.08, 0.14, x=x, y=2.5, z=0.5,
                       mat=K.get_mat("window_warm")))
        o.append(K.box("tail", 0.24, 0.08, 0.12, x=x, y=-2.5, z=0.5,
                       mat=K.get_mat("red_paint")))
    o.append(K.box("logo", 0.8, 0.08, 0.3, y=-2.52, z=1.1, mat=K.get_mat("turquoise")))
    for x in (-0.88, 0.88):
        for s in (-1, 1):
            o.extend(wheel(K, x, s * 1.9, r=0.38, w=0.3))
    return o


def truck(K):
    o = [K.box("cab", 1.9, 1.7, 1.9, y=2.3, z=0.3, bevel=0.05,
               mat=K.get_mat("bus_green"))]
    o.append(K.box("cab-glass", 1.5, 0.1, 0.8, y=3.1, z=1.25,
                   mat=K.get_mat_glass("glass_dark")))
    o.append(K.box("body", 2.2, 4.4, 2.3, y=-0.9, z=0.15, bevel=0.05,
                   mat=K.get_mat("stone_pale")))
    o.append(K.box("hopper", 1.9, 1.4, 0.9, y=-2.9, z=2.45,
                   mat=K.get_mat("metal_dark")))
    o.append(K.box("compactor", 1.6, 0.7, 0.55, y=-3.4, z=1.1,
                   mat=K.get_mat("metal")))
    for x in (-0.9, 0.9):
        for yy in (2.6, -1.6, -2.9):
            o.extend(wheel(K, x, yy, r=0.42, w=0.32))
    return o


def bus(K):
    o = [K.box("body", 2.45, 10.0, 2.7, z=0.35, bevel=0.08,
               mat=K.get_mat("bus_green"))]
    o.append(K.box("band", 2.47, 10.0, 0.45, z=1.75, mat=K.get_mat("cream")))
    o.append(K.box("windshield", 2.05, 0.1, 1.0, y=4.92, z=1.7,
                   mat=K.get_mat_glass("glass_dark")))
    for yy in (3.9, 2.4, 0.9, -0.6, -2.1, -3.6):
        for s in (-1, 1):
            o.append(K.box("window", 0.08, 1.1, 0.85, x=s * 1.235, y=yy, z=1.75,
                           mat=K.get_mat_glass("glass_dark")))
    o.append(K.box("door", 0.08, 1.4, 1.8, x=-1.235, y=3.95, z=0.4,
                   mat=K.get_mat_glass("glass_dark")))
    o.append(K.box("door-frame", 0.12, 1.6, 2.0, x=-1.26, y=3.95, z=0.35,
                   mat=K.get_mat("charcoal")))
    for x in (-1.15, 1.15):
        for s in (-1, 1):
            o.extend(wheel(K, x, s * 3.3, r=0.55, w=0.36))
    return o


def ambulance(K):
    o = van(K)
    o.append(K.box("cross-v", 0.08, 0.5, 0.16, x=0.92, y=0.6, z=1.5,
                   mat=K.get_mat("amb_red")))
    o.append(K.box("cross-h", 0.08, 0.16, 0.5, x=0.92, y=0.6, z=1.5,
                   mat=K.get_mat("amb_red")))
    o.append(K.box("lightbar", 0.9, 0.28, 0.12, y=1.9, z=1.8,
                   mat=K.get_mat("amb_red")))
    o.append(K.box("lightbar-w", 0.3, 0.3, 0.13, y=1.9, z=1.8,
                   mat=K.get_mat("white")))
    return o


def patrol(K):
    o = car(K, K.get_mat("white"), length=4.4, cabin=(0.0, 1.7, 0.56))
    o.append(K.box("stripe", 1.77, 2.4, 0.12, z=0.28, mat=K.get_mat("police_blue")))
    ztop = 0.12 + 0.68 + 0.56  # cabin roof
    o.append(K.box("lightbar", 0.85, 0.26, 0.12, z=ztop, mat=K.get_mat("police_blue")))
    o.append(K.box("lightbar-r", 0.26, 0.27, 0.13, x=0.3, z=ztop,
                   mat=K.get_mat("red_paint")))
    o.append(K.box("roof-box", 0.6, 0.5, 0.14, y=1.1, z=ztop - 0.02,
                   mat=K.get_mat("white")))
    return o


def motorcycle(K):
    o = []
    o.extend(wheel(K, 0.0, 0.7, r=0.3, w=0.18))
    o.extend(wheel(K, 0.0, -0.7, r=0.3, w=0.18))
    o.append(K.box("frame", 0.25, 1.2, 0.3, z=0.3, mat=K.get_mat("charcoal")))
    o.append(K.box("tank", 0.3, 0.55, 0.28, y=0.15, z=0.62, mat=K.get_mat("turquoise")))
    o.append(K.box("seat", 0.3, 0.55, 0.14, y=-0.45, z=0.6, mat=K.get_mat("charcoal")))
    o.append(K.box("fork", 0.08, 0.08, 0.55, y=0.75, z=0.5,
                   rot=(math.radians(-20), 0, 0), mat=K.get_mat_metal("metal")))
    o.append(K.box("handlebar", 0.55, 0.06, 0.06, y=0.85, z=0.92,
                   mat=K.get_mat("charcoal")))
    o.append(K.box("head", 0.16, 0.1, 0.12, y=0.95, z=0.72,
                   mat=K.get_mat("window_warm")))
    return o


SPECS = [
    ("vehicle.hatchback", hatchback, "vehicle", (2.0, 4.2, 2.0)),
    ("vehicle.sedan", sedan, "vehicle", (2.0, 4.8, 2.0)),
    ("vehicle.taxi", taxi, "vehicle", (2.0, 4.3, 2.1)),
    ("vehicle.van", van, "vehicle", (2.1, 5.3, 2.0)),
    ("vehicle.truck", truck, "vehicle", (2.5, 7.2, 3.5)),
    ("vehicle.bus", bus, "vehicle", (2.8, 10.4, 3.2)),
    ("vehicle.ambulance", ambulance, "vehicle", (2.1, 5.3, 2.2)),
    ("vehicle.patrol", patrol, "vehicle", (2.0, 4.8, 2.1)),
    ("vehicle.motorcycle", motorcycle, "vehicle", (0.8, 2.2, 1.2)),
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
