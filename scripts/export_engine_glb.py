"""Export the engine (3d_model/engine/bbc_block_work.blend) to a Draco-compressed
GLB for the web viewer's Engine Model page.

Every renderable mesh in a top-level BBC_* collection is exported, tagged with
that collection's name (custom property engine_part -> glTF extras -> three.js
userData), which the page's part tickboxes switch on and off. Hidden child
collections (boolean cutters, instance libraries) and the Ref_454_NA size
reference stay out. The timeline's four-stroke cycle (everything follows the
crank's crank_deg) is baked into the GLB as one looping animation. The .blend
is not saved.

Run headless via Blender:
    blender -b 3d_model/engine/bbc_block_work.blend --python scripts/export_engine_glb.py
Pass `-- --out <path>` to write somewhere other than web/public/models/engine.glb.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_PATH = os.path.join(REPO_ROOT, "web", "public", "models", "engine.glb")
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if "--out" in argv:
    OUT_PATH = os.path.abspath(argv[argv.index("--out") + 1])


def shown(coll):
    return not (coll.hide_render or coll.hide_viewport)


def meshes(coll):
    """Renderable meshes in coll and its shown child collections."""
    for o in coll.objects:
        if o.type == "MESH" and not o.hide_render:
            yield o
    for child in coll.children:
        if shown(child):
            yield from meshes(child)


def chain_links(chain):
    """Real objects for the timing chain's links, keyed along its path.

    The chain is a geometry-nodes object (cam/build_cam.py: build_chain) whose
    instances glTF can't animate, so its links are rebuilt the same way: link
    i sits on the path at i pitches plus the chain's travel, its X axis aimed
    at the next pin, inner and outer links alternating. Keyed on every frame
    of the timeline, so they move with the sprockets in the exported clip.
    """
    mod = next(m for m in chain.modifiers if m.type == "NODES")
    gn = mod.node_group
    inner = next(n.inputs["Object"].default_value for n in gn.nodes if n.bl_idname == "GeometryNodeObjectInfo" and "Inner" in n.inputs["Object"].default_value.name)
    outer = next(n.inputs["Object"].default_value for n in gn.nodes if n.bl_idname == "GeometryNodeObjectInfo" and "Outer" in n.inputs["Object"].default_value.name)
    travel_drv = next(d for d in chain.animation_data.drivers if "modifiers" in d.data_path).driver
    crank = bpy.data.objects["Crankshaft"]

    spline = chain.data.splines[0]
    pts = [chain.matrix_world @ Vector(p.co[:3]) for p in spline.points]
    seg = [(pts[i] - pts[i - 1]).length for i in range(1, len(pts))] + [(pts[0] - pts[-1]).length]
    length = sum(seg)
    n_links = next(n.inputs["Count"].default_value for n in gn.nodes if n.bl_idname == "GeometryNodePoints")
    pitch = length / n_links

    def at(s):
        s %= length
        for i, l in enumerate(seg):
            if s <= l:
                a, b = pts[i], pts[(i + 1) % len(pts)]
                return a.lerp(b, s / l)
            s -= l
        return pts[0]

    links = []
    for i in range(n_links):
        src = inner if i % 2 == 0 else outer
        o = bpy.data.objects.new(f"ChainLink_{i:02d}", src.data)  # shared mesh -> one glTF mesh, instanced
        o.rotation_mode = "XYZ"
        for c in chain.users_collection:
            c.objects.link(o)
        links.append(o)

    sc = bpy.context.scene
    for f in range(sc.frame_start, sc.frame_end + 1):
        sc.frame_set(f)
        travel = eval(travel_drv.expression, {"deg": crank["crank_deg"]})
        for i, o in enumerate(links):
            p = at(i * pitch + travel)
            d = at(i * pitch + travel + pitch) - p
            # Align Rotation to Vector, axis X, pivot Y: a turn about Y only.
            o.location = p
            o.rotation_euler = (0.0, math.atan2(-d.z, d.x), 0.0)
            o.keyframe_insert("location", frame=f)
            o.keyframe_insert("rotation_euler", frame=f)
    return links


sc = bpy.context.scene
# The timeline runs one four-stroke cycle, 0-720 crank degrees over frames
# 1-97 (frame = 1 + crank_deg / 7.5). Frame 97 repeats frame 1, so the clip
# loops without a step.
sc.frame_start, sc.frame_end = 1, 97

for o in bpy.context.view_layer.objects:
    o.select_set(False)

chain = bpy.data.objects.get("TimingChain")
if chain and chain.visible_get():
    chain_links(chain)

counts = {}
for top in bpy.context.scene.collection.children:
    if not top.name.startswith("BBC_") or not shown(top):
        continue
    for o in meshes(top):
        o["engine_part"] = top.name
        o.hide_set(False)  # select_set ignores objects hidden in the viewport
        o.select_set(True)
        counts[top.name] = counts.get(top.name, 0) + 1

for name, n in counts.items():
    print(f"  {name}: {n} objects")

os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)

bpy.ops.export_scene.gltf(
    filepath=OUT_PATH,
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_extras=True,
    # The crank's drivers and keys move the whole engine; sample them into one
    # clip ("Scene") the page plays on a loop.
    export_animations=True,
    export_animation_mode="SCENE",
    export_anim_scene_split_object=False,
    export_force_sampling=True,
    export_anim_slide_to_zero=True,  # frame 1 at t = 0, so the clip ends where it starts
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6,
)

print(f"Exported {OUT_PATH} ({os.path.getsize(OUT_PATH) / 1e6:.1f} MB)")
