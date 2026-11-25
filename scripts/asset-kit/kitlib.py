"""kitlib.py — Arbora City modular kit factory (runs inside Blender via MCP).

Shared helpers for the stage modules: Caribbean coastal palette, low-poly
primitives, per-family assembly, bottom-center pivots, and GLB export.

Units: metres, Z up inside Blender; the glTF exporter converts to Y up.
Vehicle families face +Y in Blender (= glTF forward -Z). Props and buildings:
free rotation. Every exported family must clear the overstory asset-QA budgets
(4000 triangles, 16 materials, no textures).

Transform convention (important): every primitive keeps its mesh centred on
the object origin and carries its placement in obj.location, so any rotation
pivots about the part's own centre, never the world origin. A box/cyl's z is
the bottom face; ico/torus z is the centre.
"""
import bmesh
import math
import os

import bpy
import mathutils
from mathutils import Color, Euler, Vector

OUT_ROOT = "/home/genius/Workspace/overstory-city-procedural-specs/public/city-assets/kit"

# --- Caribbean coastal palette (spec asset-pack.md "Visual target").
# Hex values are sRGB; converted to the linear space Blender's Principled
# BSDF expects, so the glTF baseColorFactor round-trips.
PALETTE = {
    "plaster_warm": "#e9dcc3",
    "stone_pale": "#dcd6c6",
    "cream": "#f2ead6",
    "terracotta": "#bf5f3f",
    "timber": "#6d4a2f",
    "timber_dark": "#54381f",
    "timber_light": "#a97c50",
    "asphalt": "#33363a",
    "asphalt_wet": "#26282c",
    "paving": "#c9c5b8",
    "paving_joint": "#a8a496",
    "sand": "#e3d3a4",
    "grass": "#7d9a4e",
    "glass_cool": "#9fc6d8",
    "glass_dark": "#42586b",
    "metal": "#8b9096",
    "metal_dark": "#4c5157",
    "charcoal": "#2b2d31",
    "white": "#f4f3ef",
    "offwhite": "#e6e2d4",
    "coral": "#ef6a5a",
    "mango": "#f2a53c",
    "turquoise": "#45bfb4",
    "sea": "#3a7ba6",
    "leaf": "#4d7c2f",
    "leaf_dark": "#33551f",
    "palm_trunk": "#7a5a3a",
    "brick": "#8a4a3a",
    "red_paint": "#b3352c",
    "taxi_yellow": "#f0c23a",
    "police_blue": "#2f4f8f",
    "amb_red": "#c63a2e",
    "bus_green": "#4f8a52",
    "blue_paint": "#5f88b5",
    "purple_paint": "#8a6f9e",
    "window_warm": "#d8b26a",
    "wood_floor": "#b08a5e",
    "tile_floor": "#dfe2da",
    "counter_dark": "#3a3f45",
    "food_red": "#c4573d",
    "food_green": "#7fa348",
    "food_yellow": "#e3c14f",
    "steel": "#aeb4ba",
}


def _srgb_to_linear(v):
    if v <= 0.04045:
        return v / 12.92
    return ((v + 0.055) / 1.055) ** 2.4


def _hex(srgb_hex):
    s = srgb_hex.lstrip("#")
    r = int(s[0:2], 16) / 255.0
    g = int(s[2:4], 16) / 255.0
    b = int(s[4:6], 16) / 255.0
    return (_srgb_to_linear(r), _srgb_to_linear(g), _srgb_to_linear(b))


def get_mat(name):
    """Shared palette material (one datablock per name; the glTF exporter
    dedups identical slots, keeping per-GLB material counts low)."""
    mat = bpy.data.materials.get(name)
    if mat is not None:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (*_hex(PALETTE[name]), 1.0)
    bsdf.inputs["Roughness"].default_value = 0.85
    bsdf.inputs["Metallic"].default_value = 0.0
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def get_mat_glass(name):
    mat = get_mat(name)
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Roughness"].default_value = 0.12
    bsdf.inputs["Metallic"].default_value = 0.05
    return mat


def get_mat_metal(name):
    mat = get_mat(name)
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Roughness"].default_value = 0.35
    bsdf.inputs["Metallic"].default_value = 0.75
    return mat


def _new_obj(name, bm, mat):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    if mat is not None:
        obj.data.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = False
    return obj


def box(name, w, d, h, x=0.0, y=0.0, z=0.0, mat=None, rot=None, bevel=0.0):
    """Box resting on z (its bottom face), centred in x/y. Mesh is centred on
    the object origin (at the box centre) so rot pivots about the part."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= w
        v.co.y *= d
        v.co.z *= h
    if bevel > 0:
        bmesh.ops.bevel(
            bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
            offset=bevel, segments=1, profile=0.5, affect="EDGES",
        )
    obj = _new_obj(name, bm, mat)
    obj.location = (x, y, z + h / 2.0)
    if rot:
        obj.rotation_euler = Euler(rot)
    return obj


def cyl(name, r, h, verts=8, x=0.0, y=0.0, z=0.0, mat=None, rot=None, r2=None, cap=True):
    """Cylinder (or cone when r2 given) standing on z (bottom face at z)."""
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=cap, segments=verts,
        radius1=r, radius2=r2 if r2 is not None else r, depth=h,
    )
    obj = _new_obj(name, bm, mat)
    obj.location = (x, y, z + h / 2.0)
    if rot:
        obj.rotation_euler = Euler(rot)
    return obj


def cone(name, r, h, verts=8, x=0.0, y=0.0, z=0.0, mat=None, rot=None):
    """Cone standing on z (apex up)."""
    return cyl(name, r, h, verts=verts, x=x, y=y, z=z, mat=mat, rot=rot, r2=0.0)


def ico(name, r, x=0.0, y=0.0, z=0.0, mat=None, detail=1):
    """Icosphere centred at (x, y, z)."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=detail, radius=r)
    obj = _new_obj(name, bm, mat)
    obj.location = (x, y, z)
    return obj


def torus(name, R, r, x=0.0, y=0.0, z=0.0, mat=None, seg=10, rad=6, rot=None):
    """Torus centred at (x, y, z), ring in the x/y plane."""
    bm = bmesh.new()
    ring = []
    for i in range(seg):
        a = i / seg * 2 * math.pi
        cx, cy = math.cos(a) * R, math.sin(a) * R
        for j in range(rad):
            b = j / rad * 2 * math.pi
            rx = cx + math.cos(b) * r * math.cos(a)
            ry = cy + math.cos(b) * r * math.sin(a)
            rz = math.sin(b) * r
            ring.append(bm.verts.new((rx, ry, rz)))
    for i in range(seg):
        for j in range(rad):
            v1 = ring[i * rad + j]
            v2 = ring[i * rad + (j + 1) % rad]
            v3 = ring[((i + 1) % seg) * rad + j]
            v4 = ring[((i + 1) % seg) * rad + (j + 1) % rad]
            bm.edges.new((v1, v2))
            bm.edges.new((v1, v3))
    for i in range(seg):
        for j in range(rad):
            v1 = ring[i * rad + j]
            v2 = ring[i * rad + (j + 1) % rad]
            v3 = ring[((i + 1) % seg) * rad + j]
            v4 = ring[((i + 1) % seg) * rad + (j + 1) % rad]
            bm.faces.new((v1, v2, v4, v3))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = _new_obj(name, bm, mat)
    obj.location = (x, y, z)
    if rot:
        obj.rotation_euler = Euler(rot)
    return obj


def prism(name, points, h, z=0.0, mat=None):
    """Extruded polygon (points in x/y), base at z, mesh centred in x/y on
    the points' centroid (z runs 0..h in local space)."""
    bm = bmesh.new()
    c = sum((Vector((px, py)) for px, py in points), Vector((0.0, 0.0))) / len(points)
    verts = [bm.verts.new((px - c.x, py - c.y, 0.0)) for px, py in points]
    face = bm.faces.new(verts)
    res = bmesh.ops.extrude_face_region(bm, geom=[face])
    up = [e for e in res["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=up, vec=(0, 0, h))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = _new_obj(name, bm, mat)
    obj.location = (c.x, c.y, z)
    return obj


def _bake(obj):
    """Bake the object's world transform into its mesh, then reset the
    object to identity. The join operator must never depend on
    object-level transforms: with a rotated active object Blender bakes
    the other parts at the wrong position. After baking, every part is
    identity-placed and the join is a plain mesh merge."""
    obj.data.transform(obj.matrix_world)
    obj.location = (0.0, 0.0, 0.0)
    obj.rotation_euler = (0.0, 0.0, 0.0)
    obj.scale = (1.0, 1.0, 1.0)


def join(objs, name):
    """Merge objects into one mesh (materials become shared slots).
    Bakes each part's transform into its mesh first, so the result is
    independent of object-level transforms and depsgraph freshness."""
    bpy.context.view_layer.update()
    for o in objs:
        _bake(o)
    bpy.context.view_layer.update()
    if len(objs) == 1:
        objs[0].name = name
        return objs[0]
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    out = bpy.context.view_layer.objects.active
    out.name = name
    return out


def tri_count(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def origin_bottom(obj, cx=None, cy=None):
    """Pivot to the bounding box's bottom centre (or given x/y centre).
    Forces a depsgraph update so bound_box/matrix_world are current."""
    bpy.context.view_layer.update()
    bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    minz = min(v.z for v in bb)
    if cx is None:
        cx = sum(v.x for v in bb) / 8.0
    if cy is None:
        cy = sum(v.y for v in bb) / 8.0
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.scene.cursor.location = Vector((cx, cy, minz))
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")


def ensure_outdir(category):
    d = os.path.join(OUT_ROOT, category)
    os.makedirs(d, exist_ok=True)
    return d


def export_glb(obj, path, category):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    ensure_outdir(category)
    bpy.ops.export_scene.gltf(
        filepath=path,
        use_selection=True,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_animations=False,
        export_skins=False,
        export_materials="EXPORT",
        export_extras=True,
    )


def _union_ext(objs):
    """World-space extents of the parts' union, measured with a fresh
    depsgraph. Baseline for the join-mismatch guard in family()."""
    xs, ys, zs = [], [], []
    for p in objs:
        for v in p.data.vertices:
            c = p.matrix_world @ v.co
            xs.append(c.x)
            ys.append(c.y)
            zs.append(c.z)
    if not xs:
        return (0.0, 0.0, 0.0)
    return (round(max(xs) - min(xs), 3),
            round(max(ys) - min(ys), 3),
            round(max(zs) - min(zs), 3))


def family(fid, build_fn, category, lib=None, outdir=None, expect=None):
    """Build one family: assemble, pivot, export, report. Returns (report, obj).
    Builders receive the kitlib module as their single argument.
    expect: optional (dx, dy, dz) max extents used as a size guard in the
    export-time QA report."""
    objs = build_fn(lib)
    if not isinstance(objs, (list, tuple)):
        objs = [objs]
    bpy.context.view_layer.update()
    pre = _union_ext(objs)
    obj = join(objs, fid)
    origin_bottom(obj)
    obj.location = (0.0, 0.0, 0.0)  # export with the pivot at the world origin
    bpy.context.view_layer.update()  # refresh bound_box before measuring
    tri = tri_count(obj)
    nmat = len(obj.data.materials)
    bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    ext = tuple(round(max(v[i] for v in bb) - min(v[i] for v in bb), 3) for i in (0, 1, 2))
    qa = []
    for i, lim in enumerate(ext):
        if abs(lim - pre[i]) > 0.02:
            qa.append(f"join-mismatch axis {i} {pre[i]:.2f}!={lim:.2f}m")
    if expect is not None:
        for i, lim in enumerate(expect):
            if ext[i] > lim + 0.05:
                qa.append(f"oversize {ext[i]:.1f}>{lim:.1f}m")
    path = os.path.join(outdir or ensure_outdir(category), fid + ".glb")
    export_glb(obj, path, category)
    size = os.path.getsize(path)
    report = {
        "id": fid,
        "category": category,
        "file": f"city-assets/kit/{category}/{fid}.glb",
        "triangles": tri,
        "materials": nmat,
        "bytes": size,
        "bbox": list(ext),
        "path": path,
        "qa": qa,
    }
    return report, obj


def collect_reports(reports):
    """Aggregate the stage's family reports into the running log."""
    global _REPORTS
    for r in reports:
        _REPORTS.append(r)


_REPORTS = []


def report_dump():
    import json

    print("KIT_REPORT_JSON " + json.dumps(_REPORTS, indent=1))
    return list(_REPORTS)


_SHELF = {"y": 0.0}
_ROW = {}


def shelf_reset():
    """Clear the review shelf collection and its layout state."""
    global _SHELF, _ROW
    col = bpy.data.collections.get("KitShelf")
    if col:
        for o in list(col.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(col)
    _SHELF = {"y": 0.0}
    _ROW = {}


def shelf_add(obj, cat):
    """Copy a family onto the review shelf. Placement is adaptive: items in
    the same category share rows with gaps sized to the widest item so far,
    and rows wrap at 90 m — so nothing overlaps whatever the family size."""
    col = bpy.data.collections.get("KitShelf")
    if col is None:
        col = bpy.data.collections.new("KitShelf")
        bpy.context.scene.collection.children.link(col)
    copy = obj.copy()
    copy.data = obj.data.copy()
    copy.name = "shelf_" + obj.name
    col.objects.link(copy)

    bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    ex = max(v.x for v in bb) - min(v.x for v in bb)
    ey = max(v.y for v in bb) - min(v.y for v in bb)
    ez = max(v.z for v in bb) - min(v.z for v in bb)

    gap = 1.2
    st = _ROW.get(cat)
    if st is None:
        st = _ROW[cat] = {"x": 0.0, "y": _SHELF["y"], "pitch": 0.0, "depth": 0.0}
    if st["x"] + ex > 90.0 and st["x"] > 0.0:
        st["y"] += st["depth"] + 1.5
        st["x"] = 0.0
        st["pitch"] = 0.0
    st["pitch"] = max(st["pitch"], ex)
    st["depth"] = max(st["depth"], ey, ez)
    copy.location = (st["x"] + ex / 2.0, st["y"] + ey / 2.0, 0.0)
    st["x"] += st["pitch"] + gap
    _SHELF["y"] = st["y"] + st["depth"] + 1.5
    return copy


def clear_stage():
    """Remove non-shelf scene objects (the stage built everything fresh)."""
    keep = {"KitShelf"}
    for obj in list(bpy.data.objects):
        linked = any(c.name in keep for c in obj.users_collection)
        if not linked and obj.type == "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)
    for col in list(bpy.data.collections):
        if col.name.startswith("stage_"):
            bpy.data.collections.remove(col)
