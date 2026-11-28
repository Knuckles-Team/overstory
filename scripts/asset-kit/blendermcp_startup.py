"""Arbora City kit build: start the MCP-for-Blender server on launch.

Loads the user-addon 'blender_mcp' (installed via `blender-mcp install-addon`),
turns on auto-start so the server survives scene reloads, and starts the
server on 127.0.0.1:9876 once the GUI is ready.
"""
import traceback

import addon_utils
import bpy


def _enable_and_start():
    try:
        if "blender_mcp" not in bpy.context.preferences.addons:
            addon_utils.enable("blender_mcp", default_set=True)
        for scene in bpy.data.scenes:
            try:
                scene.blendermcp_auto_start_server = True
                scene.blendermcp_port = 9876
            except Exception:
                pass
        try:
            bpy.ops.blendermcp.start_server()
            print("ARBORA-BLENDERMCP: server start issued", flush=True)
        except Exception:
            traceback.print_exc()
        running = bool(
            getattr(bpy.types, "blendermcp_server", None)
            and bpy.types.blendermcp_server.running
        )
        print(f"ARBORA-BLENDERMCP: server running={running}", flush=True)
        return None
    except Exception:
        traceback.print_exc()
        return 2.0


bpy.app.timers.register(_enable_and_start, first_interval=3.0)
