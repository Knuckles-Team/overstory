"""stage13_fleet.py — transport fleet families (R048.14).

Fire/police/hearse road vehicles, rail cars, light + regional + wide-body
aircraft, the refuse truck and the bicycle. Reuses stage04 conventions:
glTF forward is -Z, so exported vehicles face +Y; wheel/skid bottoms sit
at z=0; wheels are 10-segment cylinders; bodies are beveled boxes.
"""
import math


def wheel(K, x, y, r=0.32, w=0.24):
    o = [K.cyl("wheel", r, w, verts=10, x=x, y=y, z=r - w / 2,
               rot=(0, math.radians(90), 0), mat=K.get_mat("charcoal"))]
    o.append(K.cyl("hub", r * 0.35, w + 0.05, verts=8, x=x, y=y,
                   z=r - (w + 0.05) / 2, rot=(0, math.radians(90), 0),
                   mat=K.get_mat_metal("metal")))
    return o


# --------------------------------------------------------------------------
# Road fleet
# --------------------------------------------------------------------------

def fire_truck(K):
    o = [K.box("cab", 2.1, 1.9, 2.0, y=2.6, z=0.3, bevel=0.05, mat=K.get_mat("amb_red"))]
    o.append(K.box("cab-glass", 1.7, 0.1, 0.85, y=3.52, z=1.35,
                   mat=K.get_mat_glass("glass_dark")))
    o.append(K.box("body", 2.2, 4.6, 2.2, y=-1.1, z=0.25, bevel=0.05,
                   mat=K.get_mat("amb_red")))
    o.append(K.box("band", 2.22, 4.6, 0.3, y=-1.1, z=1.5, mat=K.get_mat("white")))
    # ladder along the +x side, front half of the body
    for xx in (0.95, 1.55):
        o.append(K.box("ladder-rail", 0.08, 2.6, 0.08, x=xx, y=0.2, z=2.45,
                       mat=K.get_mat_metal("metal")))
    for i in range(4):
        o.append(K.box("ladder-rung", 0.6, 0.06, 0.06, x=1.25, y=-0.75 + i * 0.6, z=2.45,
                       mat=K.get_mat_metal("metal")))
    # water tank on the -x side at the rear (cyl axis -> +Y after rot)
    o.append(K.cyl("tank", 0.85, 2.2, verts=10, x=-0.95, y=-2.5, z=1.4,
                   rot=(math.radians(90), 0, 0), mat=K.get_mat("white")))
    # light bar
    o.append(K.box("lightbar", 1.5, 0.25, 0.12, y=2.6, z=2.35, mat=K.get_mat("amb_red")))
    o.append(K.box("lightbar-w", 0.5, 0.27, 0.13, y=2.6, z=2.35, mat=K.get_mat("white")))
    for x in (-0.8, 0.8):
        o.append(K.box("head", 0.3, 0.08, 0.14, x=x, y=3.55, z=0.5,
                       mat=K.get_mat("window_warm")))
        o.append(K.box("tail", 0.3, 0.08, 0.12, x=x, y=-3.42, z=0.5,
                       mat=K.get_mat("red_paint")))
    for x in (-1.05, 1.05):
        for yy in (2.9, -1.8, -3.0):
            o.extend(wheel(K, x, yy, r=0.45, w=0.34))
    return o


def police_van(K):
    o = [K.box("body", 1.8, 5.0, 1.55, z=0.25, bevel=0.06, mat=K.get_mat("white"))]
    o.append(K.box("stripe", 1.82, 5.0, 0.3, z=0.72, mat=K.get_mat("police_blue")))
    o.append(K.box("cab-glass", 1.5, 0.1, 0.7, y=2.3, z=1.35,
                   mat=K.get_mat_glass("glass_dark")))
    for s in (-1, 1):
        o.append(K.box("cab-side", 0.08, 0.9, 0.6, x=s * 0.86, y=2.0, z=1.4,
                       mat=K.get_mat_glass("glass_dark")))
    o.append(K.box("bumper-f", 1.85, 0.14, 0.3, y=2.52, z=0.3, mat=K.get_mat("charcoal")))
    o.append(K.box("bumper-r", 1.85, 0.14, 0.3, y=-2.52, z=0.3, mat=K.get_mat("charcoal")))
    for x in (-0.72, 0.72):
        o.append(K.box("head", 0.28, 0.08, 0.14, x=x, y=2.5, z=0.5,
                       mat=K.get_mat("window_warm")))
        o.append(K.box("tail", 0.24, 0.08, 0.12, x=x, y=-2.5, z=0.5,
                       mat=K.get_mat("red_paint")))
    o.append(K.box("lightbar", 0.9, 0.26, 0.12, z=1.8, mat=K.get_mat("police_blue")))
    o.append(K.box("lightbar-r", 0.3, 0.28, 0.13, x=0.3, z=1.8, mat=K.get_mat("red_paint")))
    for x in (-0.88, 0.88):
        for s in (-1, 1):
            o.extend(wheel(K, x, s * 1.9, r=0.38, w=0.3))
    return o


def police_suv(K):
    zb, hb = 0.16, 0.75
    o = [K.box("body", 1.85, 4.6, hb, z=zb, bevel=0.07, mat=K.get_mat("white"))]
    o.append(K.box("cabin", 1.6, 2.9, 0.62, x=0.2, z=zb + hb, bevel=0.05,
                   mat=K.get_mat("white")))
    zc = zb + hb
    for (yy, ww) in ((2.0, 0.1), (-1.65, 0.1)):
        o.append(K.box("glass", 1.45, ww, 0.5, x=0.2, y=yy, z=zc + 0.05,
                       mat=K.get_mat_glass("glass_dark")))
    for s in (-1, 1):
        o.append(K.box("glass-s", 0.08, 2.4, 0.48, x=0.2, y=s * 0.82, z=zc + 0.05,
                       mat=K.get_mat_glass("glass_dark")))
    o.append(K.box("stripe", 1.87, 3.4, 0.14, z=0.42, mat=K.get_mat("police_blue")))
    ztop = zc + 0.62
    o.append(K.box("lightbar", 0.85, 0.26, 0.12, x=0.2, z=ztop, mat=K.get_mat("police_blue")))
    o.append(K.box("lightbar-r", 0.26, 0.27, 0.13, x=0.5, z=ztop, mat=K.get_mat("red_paint")))
    for x in (-0.85, 0.85):
        for s in (-1, 1):
            o.extend(wheel(K, x, s * 1.55, r=0.36, w=0.28))
    return o


def police_helicopter(K):
    o = [K.box("fuselage", 1.6, 3.2, 1.5, x=0.4, z=1.5, bevel=0.15,
               mat=K.get_mat("white"))]
    o.append(K.box("nose-glass", 1.3, 0.9, 0.9, x=0.4, y=1.35, z=1.45,
                   mat=K.get_mat_glass("glass_dark")))
    o.append(K.box("tail-boom", 0.5, 3.4, 0.5, x=-1.8, z=1.7, mat=K.get_mat("white")))
    o.append(K.box("tail-fin", 0.08, 0.9, 0.7, x=-3.3, z=1.95, mat=K.get_mat("white")))
    for ang in (0.0, math.radians(70)):
        o.append(K.box("tail-blade", 0.05, 1.3, 0.05, x=-3.45, z=2.0,
                       rot=(0, 0, ang), mat=K.get_mat("charcoal")))
    # main rotor
    o.append(K.cyl("rotor-hub", 0.12, 0.2, verts=8, x=0.4, z=2.4,
                   mat=K.get_mat("charcoal")))
    for ang in (0.0, math.radians(90)):
        o.append(K.box("rotor-blade", 5.2, 0.22, 0.05, x=0.4, z=2.45,
                       rot=(0, 0, ang), mat=K.get_mat("charcoal")))
    # skids
    for x in (-0.4, 1.2):
        o.append(K.box("skid", 0.12, 3.0, 0.1, x=x, z=0.05, mat=K.get_mat("charcoal")))
        for y in (-0.9, 0.9):
            o.append(K.box("skid-leg", 0.08, 0.08, 0.55, x=x, y=y, z=0.1,
                           mat=K.get_mat("charcoal")))
    # markings + light bar
    o.append(K.box("stripe", 1.62, 3.2, 0.3, x=0.4, z=1.2, mat=K.get_mat("police_blue")))
    o.append(K.box("lightbar", 0.5, 0.2, 0.1, x=0.4, y=1.6, z=2.3,
                   mat=K.get_mat("police_blue")))
    o.append(K.box("lightbar-r", 0.2, 0.21, 0.11, x=0.4, y=1.75, z=2.3,
                   mat=K.get_mat("red_paint")))
    return o


def hearse(K):
    o = [K.box("body", 1.8, 5.4, 1.3, z=0.2, bevel=0.08, mat=K.get_mat("charcoal"))]
    o.append(K.box("cabin", 1.5, 1.6, 0.7, y=1.7, z=1.5, bevel=0.06,
                   mat=K.get_mat("charcoal")))
    o.append(K.box("cab-glass", 1.3, 0.1, 0.55, y=2.52, z=1.55,
                   mat=K.get_mat_glass("glass_dark")))
    o.append(K.box("casket-glass", 1.3, 2.6, 0.7, y=-0.5, z=1.5,
                   mat=K.get_mat_glass("glass_dark")))
    o.append(K.box("trim", 1.82, 5.4, 0.1, z=1.15, mat=K.get_mat("stone_pale")))
    for x in (-0.7, 0.7):
        o.append(K.box("head", 0.28, 0.08, 0.12, x=x, y=2.72, z=0.5,
                       mat=K.get_mat("window_warm")))
        o.append(K.box("tail", 0.24, 0.08, 0.1, x=x, y=-2.72, z=0.5,
                       mat=K.get_mat("red_paint")))
    for x in (-0.85, 0.85):
        for s in (-1, 1):
            o.extend(wheel(K, x, s * 1.85, r=0.36, w=0.28))
    return o


def truck_garbage(K):
    o = [K.box("cab", 2.0, 1.8, 2.0, y=2.5, z=0.3, bevel=0.05,
               mat=K.get_mat("stone_pale"))]
    o.append(K.box("cab-glass", 1.6, 0.1, 0.85, y=3.42, z=1.3,
                   mat=K.get_mat_glass("glass_dark")))
    o.append(K.box("body", 2.2, 4.6, 2.3, y=-1.0, z=0.15, bevel=0.05,
                   mat=K.get_mat("metal")))
    o.append(K.box("hopper", 1.9, 1.5, 1.0, y=-2.8, z=2.45, mat=K.get_mat("metal_dark")))
    o.append(K.box("lid", 2.0, 1.6, 0.15, y=-2.8, z=3.45, mat=K.get_mat("metal_dark")))
    o.append(K.box("compactor", 1.6, 0.7, 0.6, y=-3.5, z=1.1, mat=K.get_mat("metal_dark")))
    o.append(K.box("side-door", 0.08, 1.2, 1.6, x=1.11, y=-0.4, z=0.7,
                   mat=K.get_mat("metal_dark")))
    for x in (-0.75, 0.75):
        o.append(K.box("head", 0.28, 0.08, 0.14, x=x, y=3.45, z=0.5,
                       mat=K.get_mat("window_warm")))
        o.append(K.box("tail", 0.24, 0.08, 0.12, x=x, y=-3.32, z=0.5,
                       mat=K.get_mat("red_paint")))
    for x in (-1.0, 1.0):
        for yy in (2.8, -1.7, -2.9):
            o.extend(wheel(K, x, yy, r=0.42, w=0.32))
    return o


def bicycle(K):
    o = []
    o.extend(wheel(K, 0, 0.72, r=0.34, w=0.06))
    o.extend(wheel(K, 0, -0.72, r=0.34, w=0.06))
    o.append(K.box("beam", 0.05, 1.4, 0.05, z=0.34, mat=K.get_mat("red_paint")))
    o.append(K.box("post-f", 0.05, 0.05, 0.45, y=0.72, z=0.34, mat=K.get_mat("charcoal")))
    o.append(K.box("bars", 0.5, 0.05, 0.05, y=0.72, z=0.8, mat=K.get_mat("charcoal")))
    o.append(K.box("post-r", 0.05, 0.05, 0.4, y=-0.72, z=0.34, mat=K.get_mat("charcoal")))
    o.append(K.box("saddle", 0.16, 0.3, 0.06, y=-0.72, z=0.76, mat=K.get_mat("charcoal")))
    o.append(K.box("crank", 0.12, 0.12, 0.12, z=0.34, mat=K.get_mat_metal("metal")))
    return o


# --------------------------------------------------------------------------
# Rail
# --------------------------------------------------------------------------

def _bogies(K, y1, y2, xw=1.1, r=0.45, w=0.28):
    o = []
    for y in (y1, y2):
        for x in (-xw, xw):
            o.extend(wheel(K, x, y, r=r, w=w))
    return o


def train_cargo(K):
    o = [K.box("car", 2.8, 14.0, 2.6, z=0.9, bevel=0.08, mat=K.get_mat_metal("steel"))]
    for yy in (-5.6, -2.8, 2.8, 5.6):
        o.append(K.box("rib", 2.82, 0.25, 2.6, y=yy, z=0.9, mat=K.get_mat("metal_dark")))
    o.append(K.box("door", 0.5, 0.1, 1.6, x=1.42, z=1.4, mat=K.get_mat("metal_dark")))
    o += _bogies(K, -5.0, 5.0)
    for s in (-1, 1):
        o.append(K.box("coupler", 0.5, 0.5, 0.5, y=s * 7.25, z=1.1,
                       mat=K.get_mat("charcoal")))
    return o


def train_passenger(K):
    o = [K.box("car", 2.8, 14.0, 2.9, z=0.9, bevel=0.08, mat=K.get_mat("turquoise"))]
    o.append(K.box("roof", 2.6, 13.6, 0.3, z=3.8, mat=K.get_mat("cream")))
    o.append(K.box("stripe", 2.82, 14.0, 0.4, z=1.9, mat=K.get_mat("cream")))
    for i in range(6):
        for s in (-1, 1):
            o.append(K.box("window", 0.08, 1.3, 0.9, x=s * 1.42, y=-5.25 + i * 2.1, z=2.3,
                           mat=K.get_mat_glass("glass_dark")))
    for s in (-1, 1):
        o.append(K.box("door", 0.08, 1.5, 2.1, x=s * 1.42, z=1.0,
                       mat=K.get_mat("metal_dark")))
    o += _bogies(K, -5.0, 5.0)
    for s in (-1, 1):
        o.append(K.box("coupler", 0.5, 0.5, 0.5, y=s * 7.25, z=1.1,
                       mat=K.get_mat("charcoal")))
    return o


# --------------------------------------------------------------------------
# Aircraft (nose to +Y, gear on z=0)
# --------------------------------------------------------------------------

def _jet(K, length, span, bw, bh, twin=False, mat="white"):
    o = [K.box("fuselage", bw, length * 0.82, bh, z=bh * 0.35, bevel=bw * 0.08,
               mat=K.get_mat(mat))]
    o.append(K.cyl("nose", bw / 2, length * 0.18, verts=10, y=length * 0.4,
                   z=bh * 0.3, rot=(math.radians(-90), 0, 0), mat=K.get_mat(mat)))
    o.append(K.box("glass", bw * 0.7, 0.12, bh * 0.45, y=length * 0.44, z=bh * 0.62,
                   mat=K.get_mat_glass("glass_dark")))
    o.append(K.box("wing", span, length * 0.14, 0.12, y=length * 0.08, z=bh * 0.42,
                   mat=K.get_mat("offwhite")))
    o.append(K.box("h-stab", span * 0.3, length * 0.1, 0.1, y=-length * 0.42,
                   z=bh * 0.5, mat=K.get_mat("offwhite")))
    o.append(K.box("v-fin", 0.12, length * 0.16, bh * 0.75, y=-length * 0.42,
                   z=bh * 0.5, mat=K.get_mat(mat)))
    if twin:
        for sx in (-1, 1):
            for sy in (-1, 1):
                o.append(K.cyl("engine", bw * 0.22, length * 0.16, verts=10,
                               x=sx * span * 0.15, y=sy * length * 0.05 - length * 0.04,
                               z=bh * 0.3, rot=(math.radians(-90), 0, 0),
                               mat=K.get_mat_metal("metal")))
    else:
        for sy in (-1, 1):
            o.append(K.cyl("engine", bw * 0.2, length * 0.15, verts=10,
                           x=sy * span * 0.14, y=-length * 0.05, z=bh * 0.3,
                           rot=(math.radians(-90), 0, 0), mat=K.get_mat_metal("metal")))
    for sx in (-1, 1):
        for sy in (-1, 1):
            o.extend(wheel(K, sx * bw * 0.4, sy * length * 0.1, r=0.35, w=0.25))
    o.extend(wheel(K, 0, -length * 0.42, r=0.2, w=0.2))
    return o


def plane_small(K):
    o = [K.box("fuselage", 1.4, 3.4, 1.1, z=0.35, bevel=0.1, mat=K.get_mat("white"))]
    o.append(K.cyl("nose", 0.55, 0.8, verts=10, y=1.7, z=0.4,
                   rot=(math.radians(-90), 0, 0), mat=K.get_mat("white")))
    o.append(K.box("glass", 1.0, 0.1, 0.6, y=1.45, z=0.95,
                   mat=K.get_mat_glass("glass_dark")))
    o.append(K.box("wing", 6.4, 1.3, 0.1, y=0.3, z=0.75, mat=K.get_mat("offwhite")))
    o.append(K.box("h-stab", 2.4, 0.9, 0.08, y=-1.7, z=0.8, mat=K.get_mat("offwhite")))
    o.append(K.box("v-fin", 0.1, 1.1, 0.9, y=-1.75, z=0.8, mat=K.get_mat("red_paint")))
    for ang in (0.0, math.radians(90)):
        o.append(K.box("prop", 0.9, 0.06, 0.06, y=2.2, z=0.9, rot=(0, 0, ang),
                       mat=K.get_mat("charcoal")))
    for sy in (-1, 1):
        o.extend(wheel(K, sy * 0.55, 0.6, r=0.28, w=0.18))
    o.extend(wheel(K, 0, -1.7, r=0.18, w=0.14))
    return o


def plane_medium(K):
    return _jet(K, length=16.0, span=18.0, bw=2.2, bh=1.9, twin=False, mat="white")


def plane_large(K):
    return _jet(K, length=22.0, span=26.0, bw=2.8, bh=2.4, twin=True, mat="stone_pale")


SPECS = [
    ("vehicle.fire-truck", fire_truck, "vehicle", (3.5, 7.3, 3.4)),
    ("vehicle.police-van", police_van, "vehicle", (2.1, 5.3, 2.0)),
    ("vehicle.police-suv", police_suv, "vehicle", (2.1, 5.0, 2.1)),
    ("vehicle.police-helicopter", police_helicopter, "vehicle", (7.2, 5.3, 3.0)),
    ("vehicle.hearse", hearse, "vehicle", (2.0, 5.7, 2.2)),
    ("vehicle.truck-garbage", truck_garbage, "vehicle", (2.5, 7.3, 3.7)),
    ("vehicle.bicycle", bicycle, "vehicle", (0.8, 2.2, 1.0)),
    ("vehicle.train-cargo", train_cargo, "vehicle", (3.1, 15.1, 3.6)),
    ("vehicle.train-passenger", train_passenger, "vehicle", (2.9, 15.1, 4.1)),
    ("vehicle.plane-small", plane_small, "vehicle", (6.6, 4.9, 1.9)),
    ("vehicle.plane-medium", plane_medium, "vehicle", (18.3, 17.0, 3.4)),
    ("vehicle.plane-large", plane_large, "vehicle", (26.3, 22.5, 4.6)),
]


def build(lib):
    reports = []
    for entry in SPECS:
        fid, fn, cat, expect = entry
        rep, obj = lib.family(fid, fn, cat, lib, expect=expect)
        reports.append(rep)
        lib.shelf_add(obj, cat)
    return reports
