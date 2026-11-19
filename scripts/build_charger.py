"""Build 3d_model/charger.blend from the Sketchfab glTF of Ddiaz Design's
'1969 Dodge Charger R/T' (CC BY-NC-SA 4.0) for the car show, where it sits
parked. Real-world metres, nose toward -Y (+Z on the web), origin between the
wheels at ground level, everything under one `Charger` root.

Run headless:
    blender -b --python scripts/build_charger.py
Expects the Sketchfab glTF unzipped at 3d_model/charger69/gltf/.
"""
import os

import bpy
from mathutils import Matrix, Vector

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(REPO, "3d_model", "charger69", "gltf", "scene.gltf")
OUT = os.path.join(REPO, "3d_model", "charger.blend")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
scene = bpy.context.scene
bpy.context.view_layer.update()

# A leftover unit icosphere sits at the origin of the export; it isn't car.
for o in [o for o in bpy.data.objects if o.name.startswith("Icosphere")]:
    bpy.data.objects.remove(o)

meshes = [o for o in bpy.data.objects if o.type == "MESH"]
for o in meshes:
    mw = o.matrix_world.copy()
    o.parent = None
    o.matrix_world = mw
bpy.ops.object.select_all(action="DESELECT")
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.make_single_user(object=True, obdata=True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in [o for o in bpy.data.objects if o.type == "EMPTY"]:
    bpy.data.objects.remove(o)
# Like the Mach 1, the glTF comes out at 1/100 scale.
for o in meshes:
    o.data.transform(Matrix.Scale(100.0, 4))
bpy.context.view_layer.update()


def box(objs):
    pts = [v.co for o in objs for v in o.data.vertices]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return mn, mx


tyres = [o for o in meshes if o.name.startswith("polySurface26")]
assert len(tyres) == 4, [o.name for o in tyres]
centres = []
radius = 0
for t in tyres:
    mn, mx = box([t])
    centres.append((mn + mx) / 2)
    radius = max(radius, (mx.z - mn.z) / 2)
mid = sum(centres, Vector()) / 4
ground = min(c.z for c in centres) - radius
shift = Vector((-mid.x, -mid.y, -ground))
for o in meshes:
    o.data.transform(Matrix.Translation(shift))

front = [c + shift for c in centres if c.y < mid.y]
rear = [c + shift for c in centres if c.y >= mid.y]
wheelbase = abs(sum(c.y for c in rear) / 2 - sum(c.y for c in front) / 2)
track = abs(front[0].x - front[1].x)
mn, mx = box(meshes)

root = bpy.data.objects.new("Charger", None)
scene.collection.objects.link(root)
for o in meshes:
    o.parent = root
    # "Dodger:Hood6_Mesh_023_M_CarPaint_Max_006_Dodger:M_CarPaint_Max1_0" -> "Hood6_Mesh_023_M_CarPaint_Max_006"
    o.name = o.name.replace("Dodger:", "").replace("charger:", "").split("_Dodge")[0].split("_charger")[0]
root["wheel_radius"] = radius
root["wheelbase"] = wheelbase
root["track_front"] = track

bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True)
print(f"saved {OUT}: length {mx.y - mn.y:.3f} width {mx.x - mn.x:.3f} height {mx.z - mn.z:.3f} "
      f"wheelbase {wheelbase:.3f} track {track:.3f} radius {radius:.3f}")
