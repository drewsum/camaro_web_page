"""Build 3d_model/mustang.blend from the Sketchfab glTF of Ddiaz Design's
'1969 Ford Mustang Mach-1 428 Cobra Jet' (CC BY-NC-SA 4.0), rigged like the
Camaro so the web viewer can drive it:

  Mustang                 root at ground level; custom props carry the rig metadata
  ├─ Body                 sprung mass (everything that isn't a wheel or brake)
  ├─ Hub_FL/FR/RL/RR      at each wheel centre (front ones steer)
  │  ├─ caliper           doesn't spin
  │  └─ Wheel_XX          tyre + rim + rotor, spins about X

Lamp lenses are split by side into Lamp_<Role>_<L|R> materials carrying the
same lamp_* properties as the Camaro's, so carRig.applyLamps lights them.

Run headless:
    blender -b --python scripts/build_mustang.py
Expects the Sketchfab glTF unzipped at 3d_model/mustang69/gltf/.
"""
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(REPO, "3d_model", "mustang69", "gltf", "scene.gltf")
OUT = os.path.join(REPO, "3d_model", "mustang.blend")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
scene = bpy.context.scene
bpy.context.view_layer.update()

# ---- Flatten to real-world metres, one object per mesh ---------------------

meshes = [o for o in bpy.data.objects if o.type == "MESH"]
for o in meshes:
    mw = o.matrix_world.copy()
    o.parent = None
    o.matrix_world = mw
# Bake transforms (the export is in cm under a 0.01 root) into the vertices.
bpy.ops.object.select_all(action="DESELECT")
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
# Shared mesh data would block applying; make single-user first.
bpy.ops.object.make_single_user(object=True, obdata=True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in [o for o in bpy.data.objects if o.type == "EMPTY"]:
    bpy.data.objects.remove(o)
# The glTF comes out at 1/100 scale (the FBX relied on a unit scale).
for o in meshes:
    o.data.transform(Matrix.Scale(100.0, 4))
bpy.context.view_layer.update()


def short(o):
    # "Mustang:Ani_Wheel_FL62_Mustang:MI_Rim1_0" -> part "Ani_Wheel_FL62", material "MI_Rim1"
    n = o.name.replace("Mustang:", "")
    return n


def box(objs):
    pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return mn, mx


# ---- Rig -----------------------------------------------------------------

WHEEL_KEYS = {"FL": "Ani_Wheel_FL", "FR": "Ani_Wheel_FR", "RL": "Ani_Wheel_BL", "RR": "Ani_Wheel_BR"}
CALIPER_KEYS = {"FL": "SK_Brake_101", "FR": "Ani_Wheel_Caliper_FR", "RL": "Ani_Wheel_Caliper_BL", "RR": "Ani_Wheel_Caliper_BR"}

wheels = {k: [o for o in meshes if short(o).startswith(v)] for k, v in WHEEL_KEYS.items()}
calipers = {k: [o for o in meshes if short(o).startswith(v)] for k, v in CALIPER_KEYS.items()}

centres = {}
radius = 0
for k, objs in wheels.items():
    tyre = [o for o in objs if "Tyre" in o.name]
    mn, mx = box(tyre)
    centres[k] = (mn + mx) / 2
    radius = max(radius, (mx.z - mn.z) / 2)
print("wheel centres", {k: tuple(round(c, 3) for c in v) for k, v in centres.items()}, "radius", round(radius, 3))

# Sit the tyres on z = 0.
lift = -(min(c.z for c in centres.values()) - radius)
for o in meshes:
    o.location.z += lift
for c in centres.values():
    c.z += lift

front_y = (centres["FL"].y + centres["FR"].y) / 2
rear_y = (centres["RL"].y + centres["RR"].y) / 2
wheelbase = abs(rear_y - front_y)
track_front = abs(centres["FL"].x - centres["FR"].x)


def empty(name, loc, parent=None):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.15
    scene.collection.objects.link(e)
    e.location = loc
    if parent:
        e.parent = parent
        e.matrix_parent_inverse = Matrix.Identity(4)
        e.location = loc - parent.matrix_world.translation
    bpy.context.view_layer.update()
    return e


def parent_keep(child, parent):
    mw = child.matrix_world.copy()
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()
    child.matrix_world = mw


root = empty("Mustang", Vector((0, 0, 0)))
body = empty("Body", Vector((0, (front_y + rear_y) / 2, radius + 0.02)), root)
for k in WHEEL_KEYS:
    hub = empty(f"Hub_{k}", centres[k], root)
    wheel = empty(f"Wheel_{k}", centres[k], hub)
    for o in wheels[k]:
        parent_keep(o, wheel)
    for o in calipers[k]:
        parent_keep(o, hub)
rigged = {o for v in wheels.values() for o in v} | {o for v in calipers.values() for o in v}
for o in meshes:
    if o not in rigged:
        parent_keep(o, body)
steering = empty("SteeringWheel", body.matrix_world.translation, body)  # no mesh of its own

root["wheel_radius"] = radius
root["wheelbase"] = wheelbase
root["track_front"] = track_front
root["max_steer_deg"] = 32.0
root["steering_ratio"] = 16.0

# ---- Lamps -------------------------------------------------------------

light = bpy.data.materials["MustangMI_Light1"]
LAMPS = {
    # part prefix: (role, rgb, intensities)
    "SM_Light_B_101": ("tail", (1.0, 0.012, 0.006), {"tail": 1.5, "brake": 6.0}),
    "SM_Light_F_101": ("headlight", (1.0, 0.92, 0.75), {"low": 2.0, "high": 3.0}),
    "SM_Bumper_F_101": ("park_turn", (1.0, 0.3, 0.0), {"park": 2.0, "turn": 4.0}),
    "SM_Bumper_B_101": ("reverse", (1.0, 1.0, 0.95), {"on": 2.5}),
    "SM_Fender_B_101": ("marker_rear", (1.0, 0.012, 0.006), {"on": 1.5}),
}


def lamp_material(role, side, rgb, intensities):
    name = f"Lamp_{role.title().replace('_', '')}_{side}"
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = light.copy()
    m.name = name
    # Glow in the lamp's own colour (set at runtime) rather than through the
    # atlas's emissive texture, which tints every lens the same peach.
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    for link in list(m.node_tree.links):
        if link.to_socket == bsdf.inputs["Emission Color"]:
            m.node_tree.links.remove(link)
    bsdf.inputs["Emission Color"].default_value = (1, 1, 1, 1)
    bsdf.inputs["Emission Strength"].default_value = 0.0
    # The atlas shades every lens as a near-mirror metal, which reflects the
    # sky and drowns out a red or amber glow. Coloured lenses are plastic.
    lens = {"tail": (0.32, 0.01, 0.01), "marker_rear": (0.32, 0.01, 0.01), "park_turn": (0.75, 0.3, 0.02)}.get(role)
    if lens:
        for link in list(m.node_tree.links):
            if link.to_socket in (bsdf.inputs["Base Color"], bsdf.inputs["Metallic"], bsdf.inputs["Roughness"]):
                m.node_tree.links.remove(link)
        bsdf.inputs["Base Color"].default_value = (*lens, 1)
        bsdf.inputs["Metallic"].default_value = 0.0
        bsdf.inputs["Roughness"].default_value = 0.25
    m["lamp_role"] = role
    m["lamp_side"] = side
    m["lamp_color"] = list(rgb)
    for k, v in intensities.items():
        m[f"intensity_{k}"] = v
    return m


for o in meshes:
    n = short(o)
    if "MI_Light1" not in n:
        continue
    spec = next((v for k, v in LAMPS.items() if n.startswith(k)), None)
    if not spec:
        continue
    role, rgb, inten = spec
    mats = [lamp_material(role, s, rgb, inten) for s in ("L", "R")]
    o.data.materials.clear()
    for m in mats:
        o.data.materials.append(m)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    for f in bm.faces:
        # Driver side (L) is +X.
        f.material_index = 0 if f.calc_center_median().x >= 0 else 1
    bm.to_mesh(o.data)
    bm.free()
    print("lamp", n, "->", [m.name for m in mats])

# ---- Tidy names, pack textures, save ------------------------------------

for o in meshes:
    o.name = short(o).replace("_101", "")
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True)
print(f"saved {OUT}: wheelbase {wheelbase:.3f} track {track_front:.3f} radius {radius:.3f}")
