"""stage07_interiors.py — furnishing families for the six landmark interior
recipes (civic, garage, grocery, restaurant, clinic, cafe).

Shared modules (floor, table, shelving, desk, bed, workbench) compose into
the furnished room presets. Floor at z=0, 4 m module cells, doors and aisles
kept clear. All placements are checked against the 4 m cell so furniture
does not overlap.
"""
import math


def _place(parts, o, dx=0.0, dy=0.0, dz=0.0):
    """Offset a built part group to its cell position and add it to o."""
    for p in parts:
        p.location.x += dx
        p.location.y += dy
        p.location.z += dz
    o.extend(parts)
    return parts


def _chair(K, x, y):
    o = [K.box("chair-seat", 0.42, 0.42, 0.06, x=x, y=y, z=0.45,
               mat=K.get_mat("timber"))]
    o.append(K.box("chair-back", 0.42, 0.06, 0.45, x=x, y=y - 0.18, z=0.5,
                   mat=K.get_mat("timber")))
    for dx in (-0.17, 0.17):
        for dy in (-0.17, 0.17):
            o.append(K.box("chair-leg", 0.05, 0.05, 0.45, x=x + dx, y=y + dy,
                           mat=K.get_mat_metal("metal_dark")))
    return o


def floor_tile(K):
    o = [K.box("floor", 4.0, 4.0, 0.12, mat=K.get_mat("tile_floor"))]
    for sy in (-2.0, 2.0):
        o.append(K.box("skirt-x", 4.0, 0.06, 0.05, y=sy, mat=K.get_mat("offwhite")))
    for sx in (-2.0, 2.0):
        o.append(K.box("skirt-y", 0.06, 4.0, 0.05, x=sx, mat=K.get_mat("offwhite")))
    return o


def dining_table(K):
    o = [K.box("top", 1.4, 0.9, 0.06, z=0.74, mat=K.get_mat("timber_light"))]
    for dx in (-0.6, 0.6):
        for dy in (-0.35, 0.35):
            o.append(K.box("leg", 0.06, 0.06, 0.74, x=dx, y=dy,
                           mat=K.get_mat_metal("metal_dark")))
    o.extend(_chair(K, 0.0, 0.75))
    o.extend(_chair(K, 0.0, -0.75))
    o.append(K.box("plate-a", 0.2, 0.03, 0.2, x=-0.25, z=0.8,
                   mat=K.get_mat("white")))
    o.append(K.box("plate-b", 0.2, 0.03, 0.2, x=0.25, z=0.8,
                   mat=K.get_mat("white")))
    return o


def shelf_stock(K):
    o = [K.box("side-l", 0.06, 0.9, 1.9, x=-0.97, mat=K.get_mat_metal("metal_dark"))]
    o.append(K.box("side-r", 0.06, 0.9, 1.9, x=0.97, mat=K.get_mat_metal("metal_dark")))
    for z in (0.02, 0.5, 0.98, 1.46):
        o.append(K.box("shelf", 2.0, 0.9, 0.05, z=z, mat=K.get_mat("timber_light")))
    mats = ["food_red", "food_green", "food_yellow", "turquoise", "coral", "mango"]
    for i, z in enumerate((0.55, 1.03, 1.51)):
        for j, x in enumerate((-0.6, -0.2, 0.2, 0.6)):
            o.append(K.box(f"stock-{i}-{j}", 0.34, 0.3, 0.3 + 0.05 * ((i + j) % 3),
                           x=x, y=0.1, z=z, mat=K.get_mat(mats[(i + j) % len(mats)])))
    return o


def reception_desk(K):
    o = [K.box("counter", 2.4, 0.9, 1.1, mat=K.get_mat("counter_dark"))]
    o.append(K.box("top", 2.5, 1.0, 0.06, z=1.1, mat=K.get_mat("timber_light")))
    o.append(K.box("accent", 2.42, 0.06, 0.4, y=-0.48, z=0.5,
                   mat=K.get_mat("turquoise")))
    o.append(K.box("register", 0.35, 0.3, 0.22, x=-0.7, y=-0.1, z=1.16,
                   mat=K.get_mat("charcoal")))
    o.append(K.box("screen", 0.3, 0.04, 0.22, x=-0.7, y=-0.28, z=1.4,
                   rot=(math.radians(-30), 0, 0), mat=K.get_mat("glass_dark")))
    o.append(K.box("partition", 1.2, 0.08, 2.2, x=1.4, y=-0.4, z=0.0,
                   mat=K.get_mat("offwhite")))
    return o


def patient_bed(K):
    o = [K.box("frame", 0.9, 2.1, 0.35, mat=K.get_mat("metal_dark"))]
    o.append(K.box("mattress", 0.85, 2.0, 0.18, z=0.35, mat=K.get_mat("white")))
    o.append(K.box("pillow", 0.7, 0.5, 0.12, y=-0.75, z=0.53,
                   mat=K.get_mat("offwhite")))
    o.append(K.box("blanket", 0.85, 1.0, 0.06, y=0.45, z=0.53,
                   mat=K.get_mat("turquoise")))
    o.append(K.cyl("pole", 0.025, 1.7, verts=6, x=-0.6, y=1.0, z=0.0,
                   mat=K.get_mat_metal("metal")))
    o.append(K.box("bag", 0.16, 0.12, 0.3, x=-0.6, y=1.0, z=1.3,
                   mat=K.get_mat("glass_cool")))
    o.append(K.box("foot-board", 0.9, 0.06, 0.4, y=1.02, z=0.35,
                   mat=K.get_mat("metal_dark")))
    return o


def workbench(K):
    o = [K.box("top", 2.0, 0.7, 0.08, z=0.85, mat=K.get_mat("timber"))]
    for x in (-0.9, 0.9):
        o.append(K.box("leg", 0.08, 0.6, 0.85, x=x, mat=K.get_mat_metal("metal_dark")))
    o.append(K.box("lower", 1.8, 0.6, 0.06, z=0.35, mat=K.get_mat("timber_light")))
    o.append(K.box("vice", 0.15, 0.15, 0.15, x=-0.6, z=0.93,
                   mat=K.get_mat_metal("metal")))
    for i, x in enumerate((-0.2, 0.1, 0.4)):
        o.append(K.box(f"tool-{i}", 0.25, 0.05, 0.04, x=x, z=0.93,
                       mat=K.get_mat("mango" if i % 2 else "metal")))
    o.append(K.cyl("lamp", 0.1, 0.25, verts=8, x=0.7, z=0.93,
                   mat=K.get_mat("charcoal")))
    return o


def civic_room(K):
    # 4x4: desk front-left, waiting front-right, notice on back wall,
    # cabinet back-left, secure partition with controlled door on the right.
    o = floor_tile(K)
    _place(reception_desk(K), o, dx=-0.4, dy=-1.3)
    o.extend(_chair(K, -1.3, 1.2))
    o.extend(_chair(K, -0.5, 1.2))
    o.append(K.box("notice", 1.0, 0.06, 0.8, x=0.5, y=-1.95, z=1.4,
                   mat=K.get_mat("offwhite")))
    for i in range(3):
        o.append(K.box(f"paper-{i}", 0.2, 0.02, 0.25, x=0.15 + i * 0.3, y=-1.9,
                       z=1.6 - 0.1 * (i % 2), mat=K.get_mat("white")))
    o.append(K.box("cabinet", 0.9, 0.45, 1.6, x=-1.7, y=1.6, z=0.0,
                   mat=K.get_mat("stone_pale")))
    o.append(K.box("cabinet-door", 0.85, 0.04, 1.5, x=-1.7, y=1.36, z=0.05,
                   mat=K.get_mat("offwhite")))
    o.append(K.box("partition", 0.08, 1.6, 2.4, x=1.6, y=0.4, z=0.0,
                   mat=K.get_mat("offwhite")))
    o.append(K.box("door", 0.06, 0.9, 2.1, x=1.6, y=0.95, z=0.0,
                   mat=K.get_mat("charcoal")))
    o.append(K.box("door-frame", 0.1, 1.1, 2.2, x=1.6, y=0.95, z=0.0,
                   mat=K.get_mat("metal_dark")))
    return o


def garage_room(K):
    # 4x4: two-post lift along the back wall, workbench centre, tool cabinet
    # and tyre stack in the corners, marked service aisle beside the lift.
    o = floor_tile(K)
    for x in (-1.4, 1.4):
        o.append(K.box("post", 0.3, 0.3, 3.4, x=x, y=-1.5, z=0.12,
                       mat=K.get_mat_metal("metal_dark")))
        ax = x + 0.55 if x < 0 else x - 0.55
        o.append(K.box("arm", 1.1, 0.12, 0.12, x=ax, y=-1.5, z=0.9,
                       mat=K.get_mat("mango")))
    o.append(K.box("beam", 3.1, 0.25, 0.2, y=-1.5, z=3.4,
                   mat=K.get_mat_metal("metal_dark")))
    _place(workbench(K), o, dy=1.4)
    o.append(K.box("tool-cab", 0.8, 0.5, 1.5, x=-1.6, y=-1.7, z=0.12,
                   mat=K.get_mat("red_paint")))
    for z in (0.45, 0.9, 1.35):
        o.append(K.box("drawer", 0.7, 0.04, 0.3, x=-1.6, y=-1.43, z=z,
                       mat=K.get_mat("charcoal")))
    for i in range(3):
        o.append(K.cyl(f"tyre-{i}", 0.32, 0.22, verts=10, x=1.68, y=-1.7,
                       z=0.12 + i * 0.24, mat=K.get_mat("charcoal")))
    for y in (-0.6, 0.2):
        o.append(K.box("aisle-mark", 2.6, 0.12, 0.02, y=y, z=0.12,
                       mat=K.get_mat("taxi_yellow")))
    return o


def grocery_room(K):
    # 4x8: two shelving bays down the back, produce stand and chiller on the
    # front wall, checkout counter to the right — a clear circulation loop.
    o = [K.box("floor", 4.0, 8.0, 0.12, mat=K.get_mat("tile_floor"))]
    _place(shelf_stock(K), o, dy=-2.6)
    _place(shelf_stock(K), o, dy=-0.6)
    for i, (x, m) in enumerate([(-0.6, "food_green"), (0.0, "food_red"),
                                (0.6, "food_yellow")]):
        o.append(K.box(f"produce-bin-{i}", 0.6, 0.5, 0.4, x=x, y=2.2, z=0.12,
                       mat=K.get_mat("timber")))
        o.append(K.ico(f"produce-{i}", 0.25, x=x, y=2.2, z=0.55,
                       mat=K.get_mat(m), detail=0))
    o.append(K.box("chiller", 2.2, 0.8, 2.2, x=-0.9, y=3.4, z=0.12,
                   mat=K.get_mat("white")))
    o.append(K.box("chiller-glass", 2.0, 0.06, 1.8, x=-0.9, y=3.0, z=0.3,
                   mat=K.get_mat_glass("glass_cool")))
    o.append(K.box("checkout", 1.6, 0.9, 1.0, x=1.2, y=1.0, z=0.12,
                   mat=K.get_mat("counter_dark")))
    o.append(K.box("checkout-top", 1.7, 1.0, 0.06, x=1.2, y=1.0, z=1.12,
                   mat=K.get_mat("timber_light")))
    o.append(K.box("basket", 0.3, 0.3, 0.25, x=1.2, y=1.35, z=1.18,
                   mat=K.get_mat_metal("metal")))
    return o


def restaurant_room(K):
    # 4x4: host counter back-left, two dining sets in the middle, service
    # counter and planter to the right.
    o = floor_tile(K)
    o.append(K.box("host", 1.6, 0.7, 1.05, x=-1.2, y=-1.5, z=0.12,
                   mat=K.get_mat("counter_dark")))
    o.append(K.box("host-top", 1.7, 0.8, 0.06, x=-1.2, y=-1.5, z=1.17,
                   mat=K.get_mat("timber_light")))
    o.append(K.box("menu-board", 1.0, 0.06, 1.2, x=-1.2, y=-1.95, z=1.6,
                   mat=K.get_mat("charcoal")))
    _place(dining_table(K), o, dx=0.6, dy=0.4)
    _place(dining_table(K), o, dx=-0.9, dy=1.2)
    o.append(K.box("service", 1.4, 0.6, 0.95, x=1.4, y=1.5, z=0.12,
                   mat=K.get_mat("timber")))
    o.append(K.box("service-shelf", 1.4, 0.3, 0.5, x=1.4, y=1.7, z=1.07,
                   mat=K.get_mat("timber_light")))
    o.append(K.box("planter", 0.4, 0.4, 0.3, x=1.7, y=-0.9, z=0.12,
                   mat=K.get_mat("terracotta")))
    o.append(K.ico("plant", 0.3, x=1.7, y=-0.9, z=0.6, mat=K.get_mat("leaf"),
                   detail=0))
    return o


def clinic_room(K):
    # 4x4: reception desk front-left, waiting seats front-right, ward bed
    # back-right, exam cart back-centre, storage back-left.
    o = floor_tile(K)
    _place(reception_desk(K), o, dx=-0.9, dy=-1.2)
    o.extend(_chair(K, 0.9, -1.3))
    o.extend(_chair(K, 1.7, -1.3))
    _place(patient_bed(K), o, dx=1.0, dy=0.9)
    o.append(K.box("cart", 0.7, 0.5, 0.85, x=0.0, y=1.5, z=0.12,
                   mat=K.get_mat("steel")))
    o.append(K.box("cart-top", 0.75, 0.55, 0.06, x=0.0, y=1.5, z=0.97,
                   mat=K.get_mat("white")))
    for dx in (-0.25, 0.25):
        for dy in (-0.2, 0.2):
            o.append(K.cyl("cart-wheel", 0.05, 0.05, verts=6, x=dx,
                           y=1.5 + dy, z=0.07, mat=K.get_mat("charcoal")))
    o.append(K.box("storage", 1.0, 0.45, 1.7, x=-1.65, y=1.3, z=0.12,
                   mat=K.get_mat("white")))
    for z in (0.5, 0.9, 1.3):
        o.append(K.box("storage-d", 0.9, 0.04, 0.3, x=-1.65, y=1.07, z=z,
                       mat=K.get_mat("offwhite")))
    return o


def cafe_room(K):
    # 4x4: counter + espresso + pastry display along the back wall, shelf
    # stock back-left, two dining sets in the open middle.
    o = floor_tile(K)
    o.append(K.box("counter", 2.6, 0.8, 1.0, x=0.0, y=-1.5, z=0.12,
                   mat=K.get_mat("timber")))
    o.append(K.box("counter-top", 2.7, 0.9, 0.06, x=0.0, y=-1.5, z=1.12,
                   mat=K.get_mat("timber_light")))
    o.append(K.box("espresso", 0.5, 0.45, 0.55, x=-0.9, y=-1.6, z=1.18,
                   mat=K.get_mat_metal("metal_dark")))
    o.append(K.box("espresso-glow", 0.3, 0.06, 0.2, x=-0.9, y=-1.35, z=1.3,
                   mat=K.get_mat("window_warm")))
    o.append(K.box("pastry-case", 1.2, 0.6, 0.9, x=0.8, y=-1.55, z=1.18,
                   mat=K.get_mat_glass("glass_cool")))
    for i, x in enumerate((0.5, 0.9, 1.3)):
        o.append(K.ico(f"pastry-{i}", 0.08, x=x, y=-1.55, z=1.5,
                       mat=K.get_mat("food_yellow"), detail=0))
    o.append(K.box("menu-board", 1.2, 0.06, 0.9, x=0.0, y=-1.95, z=1.7,
                   mat=K.get_mat("charcoal")))
    _place(shelf_stock(K), o, dx=-1.0, dy=1.4)
    _place(dining_table(K), o, dx=0.7, dy=0.9)
    _place(dining_table(K), o, dx=1.2, dy=-0.7)
    return o


SPECS = [
    ("interior.floor-tile-4", floor_tile, "interior", (4.3, 4.3, 0.3)),
    ("interior.dining-table", dining_table, "interior", (1.9, 2.2, 1.2)),
    ("interior.shelf-stock", shelf_stock, "interior", (2.2, 1.2, 2.1)),
    ("interior.reception-desk", reception_desk, "interior", (3.4, 1.8, 2.4)),
    ("interior.patient-bed", patient_bed, "interior", (1.6, 2.5, 1.9)),
    ("interior.workbench", workbench, "interior", (2.2, 1.0, 1.3)),
    ("interior.civic", civic_room, "interior", (4.3, 4.3, 2.6)),
    ("interior.garage", garage_room, "interior", (4.3, 4.3, 3.8)),
    ("interior.grocery", grocery_room, "interior", (4.3, 8.4, 2.6)),
    ("interior.restaurant", restaurant_room, "interior", (4.3, 4.3, 3.0)),
    ("interior.clinic", clinic_room, "interior", (4.3, 4.3, 2.4)),
    ("interior.cafe", cafe_room, "interior", (4.3, 4.3, 2.8)),
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
