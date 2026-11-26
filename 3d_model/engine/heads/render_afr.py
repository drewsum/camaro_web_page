"""Render the updated engine and a close view of an AFR cylinder-head end plate.

Run from the engine folder:
    blender -b bbc_block_work.blend --python heads/render_afr.py
"""
import bpy
import os
from collections import defaultdict
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ENG = os.path.dirname(HERE)
scene = bpy.context.scene
old_camera = scene.camera

scene.render.engine = "BLENDER_WORKBENCH"
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.display.render_aa = "16"
scene.display.shading.light = "STUDIO"
scene.display.shading.studio_light = "paint.sl"
scene.display.shading.color_type = "MATERIAL"
scene.display.shading.show_shadows = True
scene.display.shading.show_cavity = True
scene.display.shading.cavity_type = "WORLD"

# Full assembly view from the camera already stored in the model.
scene.render.resolution_x, scene.render.resolution_y = 1600, 900
scene.render.resolution_percentage = 100
scene.render.filepath = os.path.join(ENG, "engine_assembly_render.png")
bpy.ops.render.render(write_still=True)

# Find the largest machined end face on the left head and aim a dedicated camera at it.
head = bpy.data.objects["CylinderHead_L"]
end_faces = [p for p in head.data.polygons
             if p.material_index == 1 and abs(p.normal.y) > 0.99 and p.area > 1e-5]
groups = defaultdict(list)
for p in end_faces:
    groups[(round(p.center.y, 2), 1 if p.normal.y > 0 else -1)].append(p)
key, faces = max(groups.items(), key=lambda item: sum(p.area for p in item[1]))
area = sum(p.area for p in faces)
center = sum((p.center * p.area for p in faces), Vector()) / area
normal = sum((p.normal * p.area for p in faces), Vector()).normalized()

cam_data = bpy.data.cameras.get("AFR_End_RenderCam") or bpy.data.cameras.new("AFR_End_RenderCam")
cam = bpy.data.objects.get("AFR_End_RenderCam") or bpy.data.objects.new("AFR_End_RenderCam", cam_data)
if cam.name not in scene.collection.objects:
    scene.collection.objects.link(cam)
cam.location = center + normal * 0.36 + Vector((0.0, 0.0, 0.025))
target = center
cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
cam.data.lens = 50
cam.data.clip_start, cam.data.clip_end = 0.005, 20
scene.camera = cam
scene.render.resolution_x, scene.render.resolution_y = 1200, 900
scene.render.filepath = os.path.join(HERE, "AFR_end_face_render.png")
print("Rendering AFR end face at", tuple(round(x, 4) for x in center), "normal", tuple(round(x, 3) for x in normal), flush=True)
bpy.ops.render.render(write_still=True)

# Keep the saved .blend opening on its original assembly camera.
scene.camera = old_camera
