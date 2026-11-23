# Blender asset creation via blender-mcp

Playbook for authoring the city asset kit (or any low-poly GLB family) in
Blender through the `blender` MCP server, exporting it, validating it, and
landing it. Distilled from the PR-282 asset-pack build — including the bugs
that cost real review cycles and the guards that prevent them from
returning.

## When to use

- Authoring or fixing kit families under `public/city-assets/kit/`
  (spec: `specs/arbora-city/asset-pack.md`).
- Any task that says "create this asset in Blender", "re-export the kit",
  or "why does this GLB look wrong".

## Setup (one time per machine)

1. Install the `blender-mcp` package (uvx-managed tool environment).
2. Register the server in `opencode.json` under `mcp.servers.blender`.
3. Install the addon into Blender (`~/.config/blender/<ver>/scripts/addons/blender_mcp.py`).
4. Launch Blender **in GUI mode** — the addon refuses background mode:

   ```bash
   nohup env DISPLAY=:0 <blender-binary> --python <startup-script> > <log> 2>&1 &
   ss -tlnp | grep 9876   # the addon listens on 127.0.0.1:9876
   ```

Flow: opencode → `blender-mcp` (stdio) → TCP JSON socket → addon inside
Blender. `execute_blender_code` runs arbitrary `bpy`; `look` renders the
scene back to you. Always start a session with `get_addon_status` and
`get_scene_info` to see version, installed libraries, and scene state.

## The three conventions that prevent 90% of defects

### 1. Origin-centred transforms

Every primitive keeps its **mesh centred on the object origin** and carries
its placement in `obj.location` / `obj.rotation_euler`. Consequences:

- A part's rotation pivots about the part's own centre, never the world
  origin. This is what keeps rotated parts attached: wheel axles, gables,
  door leaves, awning stripes, stair stringers.
- `box`/`cyl`/`cone`: `z` is the **bottom face**. `ico`/`torus`: `z` is the
  **centre**. Keep the convention documented in the factory module header.

If a part is built with its mesh vertices in world coordinates and the
object sitting at the origin, every later operation that depends on the
object transform (rotation, join, pivot) will be wrong.

### 2. Stale dependency graph

Blender's `obj.matrix_world` and `obj.bound_box` are **stale for freshly
created objects until the depsgraph updates**. A new object reads as the
identity matrix. Therefore:

- Call `bpy.context.view_layer.update()` before **every** measurement,
  join, origin move, or export that reads transforms.
- Never trust a matrix you read in the same call that created the object.
- Symptom of a stale read: parts baked at the world origin, bounding boxes
  that don't match the parts, pivots that land in the air.

### 3. The join pitfall (Blender 5.x)

`bpy.ops.object.join()` has been observed to **bake the non-active parts at
the wrong position when the active object carries a rotation**. The active
object's own geometry lands correctly; everything else shifts. Symptom: the
joined bounding box is larger than the union of its parts, with asymmetric
growth on the axes the active part's rotation touches.

The fix — never let a join depend on object-level transforms:

```python
def _bake(obj):
    obj.data.transform(obj.matrix_world)   # bake into the mesh
    obj.location = (0.0, 0.0, 0.0)
    obj.rotation_euler = (0.0, 0.0, 0.0)
    obj.scale = (1.0, 1.0, 1.0)

def join(objs, name):
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
```

After baking, every part is identity-placed and the join is a plain mesh
merge — immune to both stale matrices and the active-object bug.

## The family factory pattern

One shared factory module (the kit was built with `kitlib.py`) plus one
builder per family. `family(fid, build_fn, category, expect)` does:

1. `objs = build_fn(lib)` — the builder returns a list of placed parts.
2. Measure the parts' union extents with a fresh depsgraph (the
   **join-mismatch baseline**).
3. `join(objs, fid)` — the baking join above.
4. **Pivot to the bottom centre** of the bounding box (cursor +
   `origin_set ORIGIN_CURSOR`). The game seats families by their origin, so
   the origin must be the footprint centre at ground level.
5. Move the object to the **world origin** before export, so the GLB root
   node carries a zero translation and the mesh extends upward from local
   z=0. Both placements agree: game overrides the root translation, or
   keeps it — either way the bottom face is the anchor.
6. Export GLB; measure the final bounding box from `bound_box` (after
   `view_layer.update()`).
7. Write the per-family report: id, file, triangles, materials, bytes,
   bbox, QA flags.

### Export-time QA (per family, every family)

- **Join-mismatch guard**: post-join extent vs pre-join parts-union extent
  per axis; flag any drift above 2 cm. This guard exists because of the
  join pitfall — a silent join bug used to inflate roof extents by ~1 m
  without any per-part symptom.
- **Size guards from design intent** (`expect=(dx, dy, dz)`): declared from
  the spec, not measured from the geometry. The exporter flags any axis
  beyond its guard. When the design legitimately grows (a two-storey bay
  curtain is 4.2 m tall, not 3.4), **update the guard in the same change**
  so the guard always means "design intent", never "what the builder
  happens to output".
- **Budgets**: per-GLB triangle and material caps (the city kit:
  4,000 triangles, 16 materials, no textures) enforced from the same
  report; the engine-side test re-checks the files.
- The report dump is PR evidence; a family with QA flags does not ship.

## glTF export contract

- Author in **metres, Z-up** in Blender; export with `export_yup=True`.
- Axis mapping: glTF.x = Blender.x, glTF.y = Blender.z, glTF.z =
  -Blender.y. glTF forward is **-Z**, which maps to **Blender +Y** — so
  **vehicles must face +Y in Blender**. (Facing -Y ships a car that drives
  backwards through its own bonnet.)
- Bottom-centre pivot, root node translation zero (step 5 above).
- **Flat palette materials**: a shared datablock per palette name (one
  `get_mat(name)`), base colour converted **sRGB → linear** so the glTF
  `baseColorFactor` round-trips the authored hex. No textures: the game
  loads the GLB and gets the colours; the renderer may tint instances later.
- Glass/metal variants tweak the same palette slot (roughness/metallic) —
  keep the per-GLB material count low.
- Export flags used: `use_selection=True, export_format="GLB",
  export_apply=True, export_yup=True, export_animations=False,
  export_materials="EXPORT", export_extras=True`.

## Review protocol

1. **Adaptive review shelf**: after each family exports, copy it onto a
   `KitShelf` collection. Same-category items share rows; the row pitch is
   the widest item seen so far plus a gap; rows wrap at a fixed width.
   Nothing overlaps regardless of family size. Name the copies
   `shelf_<family-id>` — those names are the `look` targets.
2. **Multi-angle render per stage**:

   ```python
   look(mode="angles", target=[stage shelf names], views=["top", "three_quarter"])
   ```

   Top view catches shelf overlap and footprint shape; three-quarter
   catches floaters, detached parts, and wrong-facing vehicles.
3. **Check in the render, in order**: wheels touch the ground and the
   front faces +Y; parts stay inside the family silhouette (windshields sit
   in the cabin face, not beside the body; windows sit proud of the wall
   face, not floating in front of it); nothing floats; shelf items do not
   overlap.
4. **Localise defects by measuring parts**, not the assembly: build the
   family's parts, `view_layer.update()`, then print each part's
   world-space vertex bounds (`p.matrix_world @ v.co`). The part whose
   bounds disagree with the code is the bug. A whole-assembly bbox that
   disagrees with the parts' union is a join bug, not a builder bug.

A review render is part of the deliverable: fix what you see, re-export the
stage, and re-render.

## Re-export policy

A fix to shared code (factory, palette, one builder helper) re-exports
**every family it touches** — in practice, regenerate the whole stage.
Never leave a GLB on disk that predates the last authoring fix: stale
files break the catalog digests and the engine-side QA silently lies about
them.

## Packaging and the license gate

- GLBs land under `public/city-assets/kit/<category>/<family-id>.glb`.
- `catalog.json` is versioned: family id, file, category, footprint/bbox,
  triangles, materials, bytes, sha256, license, tags — generated from the
  factory's report dump plus `sha256sum` of the final files.
- `assets.lock.json` records sha256 + bytes + license **per file**.
- License allowlist: MIT, CC0-1.0, CC-BY-4.0, Apache-2.0. Original authored
  geometry is CC0-1.0. Anything outside the allowlist does not ship.
- The engine-side test (`assetQa.test.ts`) re-checks budgets against the
  actual files on disk — it is the last line of defence after Blender-side
  QA. Keep its expected path count in sync with the kit size.

## blender-mcp tool notes

- Find shader nodes **by type, never by name** (names are localized):
  `next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")`.
- Never hardcode enum identifiers; read them:
  `[i.identifier for i in bpy.types.RenderSettings.bl_rna.properties["file_format"].enum_items]`.
- `scene.render.engine` under-reports; assign a new engine inside
  `try/except TypeError` — the exception message lists the valid engines.
- Material colour goes on shader node inputs; `material.diffuse_color`
  only affects the viewport.
- `look` is how you see your work; use it as much as needed, with a
  modest `max_size` in long sessions (images accumulate in context).
- Mesh data uses `.vertices`; bmesh uses `.verts`. Evaluated meshes come
  from `obj.evaluated_get(depsgraph).to_mesh()`.
- `bound_box` entries are `bpy_prop_array`; convert with `Vector(c)`
  before matrix multiplication.
- When a test deletes the objects a list still references, clean up with
  a guard — dead `StructRNA` references raise on the next touch.

## Pitfall log (real bugs, real cost)

| Bug | Symptom | Guard that prevents recurrence |
| --- | --- | --- |
| Stale `matrix_world` on fresh objects | parts baked at the origin, pivots in the air | `view_layer.update()` before every measure/join/pivot |
| Join with a rotated active object | joined bbox larger than the parts' union, asymmetric growth | bake transforms into meshes before joining |
| Pivot moved, geometry not lifted | "below-ground" readings that are world-placement artifacts | normalize the object to the world origin before export; pivot is the anchor |
| X/Y swapped on a placed part (windshields beside the body) | vehicle 0.5 m wider than its bumper line | per-part world-bounds measurement; silhouette check in the review render |
| Review shelf overlap | items unreadable at review time | adaptive shelf pitch from the widest item in the row |
| Window row longer than the face it runs on | glass floating 1 m past the building corner | size guards (`expect`) measured in the parts, not the assembly |
| Expect guards set from old geometry | every rebuild flags "oversize" on correct parts | guards are design intent; update them with the design, in the same change |
| Stale GLBs after a shared-code fix | catalog digests and engine QA describe the old files | full stage re-export on any shared change |

## Definition of done for an asset stage

1. Every family in the stage exports with a clean QA report (no
   join-mismatch, no oversize against design-intent guards).
2. Top + three-quarter shelf renders reviewed; visible defects fixed and
   the stage re-exported.
3. All GLBs on disk were produced by the final factory run; digests in the
   catalog and lock match the files.
4. The engine-side asset-QA test passes against the files.
