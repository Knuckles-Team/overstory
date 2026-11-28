# Kit build conventions (learned the hard way)

- `K.box`: z = bottom face; `K.cyl`/`K.cone`: z = bottom face (axis vertical, centred in x/y).
- `K.ico`/`K.torus`: z = centre.
- Laid-down cylinder (rot=(0, 90°, 0), axis → X): the object centre stays at
  `z_param + h/2`, so pass `z = axis_height - h/2`.
  A 90° rot about Z spins a cylinder about its own axis: NO geometric change.
- `K.prism(name, points, h, z, mat)`: NO x/y kwargs. Points are in world coords;
  the object is placed at the points' centroid.
- Rotated parts are fine for `join` because `join()` bakes each part's
  matrix_world first (view_layer.update() before and after).
- Hex/10-gon cylinders: topmost vertex = r·cos(phase) above the axis, not r —
  expect up to ~r·cos(π/n) instead of r for extents (n = verts).
- expect guards: design intent upper bounds; portico/canopy overhangs count.
- BOOLEAN cuts (stadium bowl/roof): cutters must OVERSHOOT every face they
  cut — a cutter bottom coplanar with the target's bottom face makes the
  EXACT solver keep a stray cap face INSIDE the hole (verified: rays from
  above hit the cap, field hidden). Extend cutters >=0.2 m past each face.
- Origin shift is NOT a bug: origin_bottom centres the pivot on the bbox;
  asymmetric parts (plazas, canopies) make per-part local bounds look
  "off-centre". Verify with the bbox extents, not per-part radii.
- Batch runs: run_batch.run(stage_mod, start, end, tag) — full clear, world/sun,
  build slice, shelf, clear_stage, purge, JSON report. ≤6 families per call.
- Memory: check `free -m` around Blender calls; close Blender before browser work.
