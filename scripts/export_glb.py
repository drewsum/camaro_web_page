"""Export the open .blend (camaro.blend, mustang.blend) to a Draco-compressed
GLB of the same name for the web viewer.

Run headless via Blender:
    blender -b 3d_model/camaro.blend --python scripts/export_glb.py
"""
import os

import bpy

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NAME = os.path.splitext(os.path.basename(bpy.data.filepath))[0]
OUT_PATH = os.path.join(REPO_ROOT, "web", "public", "models", f"{NAME}.glb")

os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)

bpy.ops.export_scene.gltf(
    filepath=OUT_PATH,
    export_format="GLB",
    use_visible=True,
    export_apply=True,
    # Custom properties -> glTF "extras" -> three.js userData. The rig metadata on
    # the root node and the lamp_* properties on Lamp_* materials live here.
    export_extras=True,
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6,
)

print(f"Exported {OUT_PATH} ({os.path.getsize(OUT_PATH) / 1e6:.1f} MB)")
