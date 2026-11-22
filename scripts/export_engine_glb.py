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
import json
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


ENG_DIR = os.path.join(REPO_ROOT, "3d_model", "engine")

# Parts the page groups under another tickbox than their collection's, to keep
# the list short: the plugs and lifters go with the valvetrain, the flywheel
# with the crank, and the main bearings and the oiling parts with the block.
PART_OVERRIDE = {"SparkPlugs": "BBC_Valvetrain"}
PREFIX_OVERRIDE = {"MainBearing_": "BBC_Block"}
COLL_OVERRIDE = {"BBC_Lifters": "BBC_Valvetrain", "BBC_Flywheel": "BBC_Crank", "BBC_Oiling": "BBC_Block"}


def part_of(o, top):
    if o.name in PART_OVERRIDE:
        return PART_OVERRIDE[o.name]
    for prefix, part in PREFIX_OVERRIDE.items():
        if o.name.startswith(prefix):
            return part
    return COLL_OVERRIDE.get(top.name, top.name)

# Firing order at 90 crank degrees apart, cylinder 1 firing at 0 (cam/PARTS.md).
FIRING_ORDER = (1, 8, 4, 3, 6, 5, 7, 2)


def flow_data():
    """Geometry for the page's four-stroke overlay, in glTF coordinates (metres, Y up).

    Per cylinder: the bore axis, the piston crown's height along it on every
    frame of the clip, the spark-plug tip, and the intake and exhaust port
    centre lines (heads/build_heads.py's runner paths, port face to valve).
    Stored on the scene as a JSON string (glTF scene extras -> three.js
    gltf.scene.userData.engine_flow).
    """
    heads_py = os.path.join(ENG_DIR, "heads", "build_heads.py")
    src = open(heads_py).read()
    H = {"__file__": heads_py, "__name__": "heads_lib"}
    exec(src[:src.rindex('if __name__ == "__main__"')], H)   # its own guard is the last one
    IN, K = H["IN"], H["K"]
    hinfo = json.load(open(os.path.join(ENG_DIR, "heads", "heads_info.json")))
    rinfo = json.load(open(os.path.join(ENG_DIR, "rods", "rods_info.json")))
    blk = json.load(open(os.path.join(ENG_DIR, "block", "block_info.json")))["params"]

    def gl(p):
        return [round(p.x, 5), round(p.z, 5), round(-p.y, 5)]

    def bm_free(res):
        if res[0] is not None:
            res[0].free()
        return res[1]

    cyls = []
    for bank in "LR":
        m = H["M_L"] if bank == "L" else H["ROT_R"] @ H["M_L"]
        r3 = m.to_3x3()

        def W(q, m=m):
            return m @ (Vector(q) * IN)

        for k in range(4):
            deck_c = W((H["CYL_U"][k], 0, 0))
            c = min((c for c in rinfo["cylinders"] if c["bank"] == bank), key=lambda c: abs(c["y"] * IN - deck_c.y))
            n = c["cyl"]
            axis = (r3 @ Vector((0, 0, 1))).normalized()
            origin = deck_c - axis * blk["deck"] * IN       # on the crank centre line
            ip = bm_free(H["int_runner"](k, hinfo["port_scale"]["I"][k], None, 0.0, False))
            ep = bm_free(H["exh_runner"](k, hinfo["port_scale"]["E"][k], None, 0.0, False))
            cyls.append(dict(
                n=n, bank=bank, origin=gl(origin), axis=gl(axis),
                deck=round(blk["deck"] * IN, 5),
                roof=round((blk["deck"] + K["gasket_t"] + hinfo["chamber_wall_h"]) * IN, 5),
                bore_r=round(blk["bore"] / 2 * IN, 5),
                plug=gl(W(H["plug_line"](k)[0])),
                valve_i=gl(W(H["valve"](k, "I")[0])),
                valve_e=gl(W(H["valve"](k, "E")[0])),
                intake=[gl(W(p)) for p in ip[::3] + [ip[-1]]],             # port face -> valve
                exhaust=[gl(W(p)) for p in (ep[::3] + [ep[-1]])[::-1]],     # valve -> port face
                exhaust_dir=gl((r3 @ Vector((0, -1, 0.1))).normalized()),   # out of the port face, a touch off the deck
                fire_deg=90 * FIRING_ORDER.index(n),
                crown=[],
            ))

    # Crown height along each bore axis on every frame (the piston's top, by
    # its mesh at frame 1, carried by the piston's travel).
    pistons = {c["n"]: bpy.data.objects[f"Piston_{c['n']}"] for c in cyls}
    ax = {c["n"]: Vector((c["axis"][0], -c["axis"][2], c["axis"][1])) for c in cyls}
    org = {c["n"]: Vector((c["origin"][0], -c["origin"][2], c["origin"][1])) for c in cyls}
    sc = bpy.context.scene
    sc.frame_set(sc.frame_start)
    dg = bpy.context.evaluated_depsgraph_get()
    top = {}
    for n, p in pistons.items():
        e = p.evaluated_get(dg)
        me = e.to_mesh()
        mw = p.matrix_world
        top[n] = max((mw @ v.co - org[n]).dot(ax[n]) for v in me.vertices) - (mw.translation - org[n]).dot(ax[n])
        off = ((mw.translation - org[n]) - ax[n] * (mw.translation - org[n]).dot(ax[n])).length
        print(f"  piston {n}: {off / IN:.3f} in off its bore axis")
        e.to_mesh_clear()
    for f in range(sc.frame_start, sc.frame_end + 1):
        sc.frame_set(f)
        for c in cyls:
            p = pistons[c["n"]].matrix_world.translation
            c["crown"].append(round((p - org[c["n"]]).dot(ax[c["n"]]) + top[c["n"]], 5))
    for c in cyls:
        print(f"  cyl {c['n']}: crown {min(c['crown']) / IN:.3f}-{max(c['crown']) / IN:.3f} in, fires at {c['fire_deg']}")
    cyls.sort(key=lambda c: c["n"])
    return dict(
        clip_deg=720,
        # Valve events at .050" (cam/PARTS.md, cam card), relative to each
        # cylinder's firing TDC; the spark at 20 degrees before it.
        events=dict(spark=-20.0, eo=180 - 58.8, ec=360 + 11.2, io=360 - 15.0, ic=540 + 47.0),
        cylinders=cyls,
    )


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
        part = part_of(o, top)
        o["engine_part"] = part
        o.hide_set(False)  # select_set ignores objects hidden in the viewport
        o.select_set(True)
        counts[part] = counts.get(part, 0) + 1

for name, n in counts.items():
    print(f"  {name}: {n} objects")

sc["engine_flow"] = json.dumps(flow_data(), separators=(",", ":"))
sc.frame_set(sc.frame_start)

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
