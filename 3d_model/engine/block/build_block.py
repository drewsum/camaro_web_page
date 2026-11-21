"""Gen VI big-block Chevy cylinder block (GM P/N 19170540) for Drew's 540.

The whole block is built by this script; a change to the design is a change
here, and the block rebuilds. Sources and confidence for every number are in
PARTS.md. Tags in comments: [spec] published, [meas] measured (Drew's build
sheet or the gasket image), [derived] worked out from other numbers,
[est] estimate awaiting a reference.

Run live in Blender:
    exec(open(r"C:/Users/drewm/Documents/scripts/camaro_webpage/3d_model/engine/block/build_block.py").read())
or headless:
    blender -b --python build_block.py -- --save bbc_block.blend

Axes: X to the passenger side (right bank, cylinders 2-4-6-8), Y forward
(timing cover end), Z up. Origin on the crankshaft centreline at the rear
(bellhousing) face. Built in inches, converted to metres once.
"""
import bpy, bmesh, json, math, os, sys
from mathutils import Vector, Matrix

HERE = (os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals()
        else r"C:\Users\drewm\Documents\scripts\camaro_webpage\3d_model\engine\block")
IN = 0.0254

P = dict(
    deck=9.800,          # [spec] crank centreline to deck along the bore axis
    bore=4.4990,         # [meas] build sheet, average finished bore
    bore_sp=4.840,       # [spec]
    bank=45.0,           # [spec] 90-degree V
    stagger=1.000,       # [derived] right bank behind left: rod big-end width .990 + side clearance .021
    front_to_cyl1=3.65,  # [meas] gasket front edge to cyl-1 centre; gasket flush with front face (photo 38)
    length=24.0,         # [forum] front face to bellhousing face
    main_bore=2.9375,    # [spec] line-honed housing bore
    web=1.00, web_front=1.10, web_rear=1.20,   # [est] bulkhead thicknesses; the rear (thrust) one is faced to take the 1.33" flanged thrust bearing
    rod_sweep_r=4.30,    # [derived] crankcase clearance in each bay for the rods: big-end sweep 4.21" (../rods) + .09"; opens into the cam tunnel
    rear_pocket_d=3.60,  # [est] drain-back pocket between the thrust bearing and the seal, clears the crank's rear thrust collar
    cam_cd=5.147,        # [derived] crank-to-cam centre distance
    cam_bore=2.120,      # [spec] cam bearing housing bore
    cam_plug=2.218,      # [spec] rear cam plug bore
    bore_len=6.60,       # [est] machined bore length below the deck
    deck_thk=1.10,       # [est] deck slab depth below the gasket face
    deck_v_valley=3.35, deck_v_exh=-3.15,      # [meas] valley: the deck edge at the front and rear ends (photo PXL_20251220_223513946), which is also the china-wall top plane; exhaust: gasket body edge
    deck_clip_v=3.60,    # [meas] the deck's valley edge never goes further than this (refs/deck_block.json)
    valley_wall_v=3.00,  # [meas] the valley wall drops from the deck's valley edge parallel to the bores; the edge's bulges carry down it as flutes (photo PXL_20251220_223513946, album 351/352)
    valley_wall_depth=3.2,   # [derived] from the deck down the bore axis to below the valley floor
    wall_len=4.30,       # [est] side water-jacket wall length below the deck edge
    pan_rail_z=0.0,      # [Drew] the oil pan face is one flat plane at the crank centreline (the main cap parting line), full length
    rail_x=5.95, rail_t=0.40, rail_inner=4.75,   # [meas] photo 431 rectified: rail flange outer/inner half-width; thickness [est]
    valley_floor_z=7.30, valley_top_half=3.60, valley_floor_half=2.40, china_wall=0.45,   # [est]
    case_half=5.15,      # [est] crankcase cavity half-width above the rail
    cap_half=3.45, cap_drop=3.10, cap_chamfer=0.30,   # [meas] photos 22/24, scaled by the 2.9375" saddle: cap width and depth
    cap_step_x=2.45, cap_outer_drop=1.85,   # [meas] photo 435: outer studs sit on shoulders ~60% of the cap depth (shorter outer studs)
    main_stud_x=(1.95, 3.00),   # [meas] photo 22: inner pair just outside the saddle, outer pair ~1.05" further; all vertical
    main_stud_d=0.50, main_nut_d=0.80, main_nut_h=0.55, main_washer_d=0.95, main_stud_out=0.85,  # [est] ARP 235-5701 hardware
    stud_tap=0.4375, stud_depth=1.75,          # [spec] 7/16-14 blind-tapped head stud holes
    dowel_d=0.609, dowel_depth=0.35,           # [meas] head dowel counterbore (gasket hole)
    port_depth=0.70,     # [est] coolant ports cut as pockets; the jacket itself is not modelled
    front_wall=1.15,     # [est] valley starts behind the timing-chest floor (recess .85 + .30 wall); the window is the only opening
)
P["y_front"] = P["length"]
P["y_cyl1"] = P["length"] - P["front_to_cyl1"]

C45 = math.cos(math.radians(P["bank"])); S45 = math.sin(math.radians(P["bank"]))
BANKS = {
    # d: bore axis (up, outwards), t: across the deck towards the valley, y0: cylinder-1/2 centre
    "L": dict(d=Vector((-S45, 0, C45)), t=Vector((C45, 0, S45)), y0=P["y_cyl1"], cyls=[1, 3, 5, 7]),
    "R": dict(d=Vector((S45, 0, C45)), t=Vector((-C45, 0, S45)), y0=P["y_cyl1"] - P["stagger"], cyls=[2, 4, 6, 8]),
}
DECK = json.load(open(os.path.join(HERE, "refs", "deck_c5333.json")))
BLK = json.load(open(os.path.join(HERE, "refs", "deck_block.json")))   # the block's own deck, traced from Drew's photo, see PARTS.md
FRONT = json.load(open(os.path.join(HERE, "refs", "front_face.json")))   # photos 29/30, see PARTS.md
PAN = json.load(open(os.path.join(HERE, "refs", "pan_rail.json")))       # album photo 431
REAR = json.load(open(os.path.join(HERE, "refs", "rear_face.json")))     # GM bell pattern, Fel-Pro 2920
BOT = json.load(open(os.path.join(HERE, "refs", "bottom.json")))         # rail ears, filter pad, starter pad, pump
SIDE = json.load(open(os.path.join(HERE, "refs", "sides.json")))        # freeze plugs, mounts, fuel pump, lifters


# ---- helpers ------------------------------------------------------------------

def coll(name, parent=None, hide=False):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    par = parent or bpy.context.scene.collection
    if c.name not in par.children: par.children.link(c)
    c.hide_render = hide; c.hide_viewport = hide
    return c

def clear(c):
    for o in list(c.objects): bpy.data.objects.remove(o, do_unlink=True)
    for ch in list(c.children): clear(ch)

def obj(name, bm, c):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); c.objects.link(o)
    return o

def prism(pts, axis, depth, bm=None):
    """Closed prism: a planar polygon (3D points, inches) swept along axis*depth."""
    bm = bm or bmesh.new()
    a = [bm.verts.new(p * IN) for p in pts]
    b = [bm.verts.new((p + axis * depth) * IN) for p in pts]
    bm.faces.new(a[::-1]); bm.faces.new(b)
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm

def circle(center, axis, r, seg=24):
    axis = axis.normalized(); ref = Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))
    e1 = axis.cross(ref).normalized(); e2 = axis.cross(e1)
    return [center + (e1 * math.cos(2 * math.pi * k / seg) + e2 * math.sin(2 * math.pi * k / seg)) * r for k in range(seg)]

def cyl(center, axis, r, length, seg=32, bm=None):
    """Cylinder starting at center, running length along axis."""
    return prism(circle(center, axis, r, seg), axis.normalized(), length, bm)

def deck_pt(bank, u, v, h=0.0):
    b = BANKS[bank]
    return Vector((0, b["y0"], 0)) + b["d"] * (P["deck"] + h) + b["t"] * v + Vector((0, -1, 0)) * u

def deck_outline():
    """The machined deck in (u, v): the gasket outline on the exhaust side and
    the ends, the valley edge traced from the photo (refs/deck_block.json)."""
    o = DECK["outline"]
    keep = [tuple(p) for p in o[2:64]]           # front-valley corner, down the front, exhaust side, up the rear
    assert keep[0][1] < 2.6 and keep[-1][1] < 2.6 and all(v < 2.6 for _, v in keep)
    edge = [tuple(p) for p in BLK["valley_edge"]]
    u_f, u_r = keep[0][0], keep[-1][0]
    top = [(u_r, edge[-1][1])] + [p for p in reversed(edge) if u_f < p[0] < u_r] + [(u_f, edge[0][1])]
    return keep + top

def clip_v(poly, v0):
    """Sutherland-Hodgman: the part of a (u, v) polygon with v >= v0."""
    out = []
    for i, a in enumerate(poly):
        b = poly[(i + 1) % len(poly)]
        ina, inb = a[1] >= v0, b[1] >= v0
        if ina: out.append(a)
        if ina != inb:
            t = (v0 - a[1]) / (b[1] - a[1]); out.append((a[0] + t * (b[0] - a[0]), v0))
    return out

def boolean(target, kind, operand):
    m = target.modifiers.new(kind, "BOOLEAN"); m.operation = kind; m.solver = "MANIFOLD"   # robust on these closed operands; EXACT dropped or inverted some valley bosses and left ~1,100 non-manifold edges
    if isinstance(operand, bpy.types.Collection): m.operand_type = "COLLECTION"; m.collection = operand
    else: m.object = operand
    with bpy.context.temp_override(object=target, active_object=target):
        bpy.ops.object.modifier_apply(modifier=m.name)


# ---- build --------------------------------------------------------------------

def mirror_xz(pts):
    return pts + [Vector((-p.x, p.y, p.z)) for p in reversed(pts)]

def body_section():
    """Half cross-section (left), XZ, from the top centre round to the bottom centre."""
    b = BANKS["L"]
    v1 = b["d"] * P["deck"] + b["t"] * P["deck_v_valley"]
    v2 = b["d"] * P["deck"] + b["t"] * P["deck_v_exh"]
    s1 = v2 - b["d"] * P["wall_len"]
    z0 = P["pan_rail_z"]
    # The skirt tapers in from the water-jacket wall to the pan rail flange.
    half = [Vector((0, 0, v1.z)), v1, v2, s1,
            Vector((-P["rail_x"], 0, z0 + P["rail_t"])),
            Vector((-P["rail_x"], 0, z0)), Vector((0, 0, z0))]
    return half

def setup_camera(parts, view=(-0.55, 0.75, 0.42), margin=1.04):
    """A scene camera that fills the frame with the block (three-quarter view
    from the front, driver side, slightly above), set as the scene camera, and
    every 3D viewport put in camera view so the .blend opens on it."""
    sc = bpy.context.scene
    cam_data = bpy.data.cameras.get("BlockCam") or bpy.data.cameras.new("BlockCam")
    cam_data.lens = 50; cam_data.clip_start = 0.01; cam_data.clip_end = 50
    cam = bpy.data.objects.get("BlockCam") or bpy.data.objects.new("BlockCam", cam_data)
    if cam.name not in sc.collection.objects: sc.collection.objects.link(cam)
    sc.camera = cam
    sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
    # Aim at the centre of everything in the block collection, then let
    # Blender fit the distance to the corners of every part.
    from mathutils import Vector
    pts = [o.matrix_world @ Vector(c) for o in parts.objects for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    centre = (lo + hi) / 2
    d = Vector(view).normalized()
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    cam.location = centre + d * 10
    bpy.context.view_layer.update()
    flat = [c for p in pts for c in ((p - centre) * margin + centre)]
    loc, _ = cam.camera_fit_coords(bpy.context.evaluated_depsgraph_get(), flat)
    cam.location = loc
    frame_viewports()
    return cam


def frame_viewports():
    """Put every 3D viewport in camera view, with the camera frame fitted to the
    viewport (View > Frame Camera Bounds). Skipped when running headless."""
    wm = bpy.context.window_manager
    for win in (wm.windows if wm else []):
        for area in win.screen.areas:
            if area.type != "VIEW_3D": continue
            reg = next(r for r in area.regions if r.type == "WINDOW")
            reg.data.view_perspective = "CAMERA"
            with bpy.context.temp_override(window=win, area=area, region=reg):
                if bpy.ops.view3d.view_center_camera.poll():
                    bpy.ops.view3d.view_center_camera()


def build():
    root = coll("BBC_Block")
    clear(root)
    parts = coll("Block_Parts", root)
    cut = coll("Block_Cutters", root, hide=True)
    info = {"parts": {}, "cutters": 0}

    # Casting: the cross-section swept front to rear (left half + mirrored right half).
    half = body_section()
    sec = [Vector((p.x, 0, p.z)) for p in half[1:-1]]
    sec = [Vector((0, 0, half[0].z))] + sec + [Vector((0, 0, half[-1].z))]
    full = sec + [Vector((-p.x, 0, p.z)) for p in reversed(sec[1:-1])]
    block = obj("Block", prism(full, Vector((0, 1, 0)), P["length"]), parts)

    # Lifter valley between the china walls, cut before the decks go on. Each
    # side wall runs straight down from the deck's valley edge, parallel to the
    # bores, into the valley floor (photo PXL_20251220_223513946): no ledge
    # between the deck and the valley. The china walls keep the body's flat top,
    # which is the plane the deck's valley edge ends in at the front and rear.
    def wall_xz(sg, h):
        p = deck_pt("L", 0, P["valley_wall_v"], h); return Vector((sg * -p.x, 0, p.z))
    fz = P["valley_floor_z"]
    top = wall_xz(-1, 0); s_low = (top.z - (fz + 0.30)) / C45    # wall reaches .30 above the floor, then a chamfer
    lw = wall_xz(-1, -s_low)
    half_v = [wall_xz(-1, 3.0), top, lw, Vector((lw.x + 0.30, 0, fz))]
    vsec = half_v + [Vector((-p.x, 0, p.z)) for p in reversed(half_v)]
    vcut0 = obj("Valley", prism([p + Vector((0, P["china_wall"], 0)) for p in vsec], Vector((0, 1, 0)),
                                P["length"] - P["china_wall"] - P["front_wall"]), parts)
    boolean(block, "DIFFERENCE", vcut0); bpy.data.objects.remove(vcut0)
    info["cutters"] += 1

    # Deck slabs: the block's own deck outline swept down the bore axis, and
    # the part of it past the valley wall swept on down to below the floor, so
    # the deck edge's bulges (round the ports and bolt bosses) run down the
    # valley wall as the flutes in the photos.
    outline = deck_outline()
    wall_part = clip_v(outline, P["valley_wall_v"] - 0.15)
    for bank in "LR":
        poly = [deck_pt(bank, u, v) for u, v in outline]
        slab = obj(f"DeckSlab_{bank}", prism(poly, -BANKS[bank]["d"], P["deck_thk"]), parts)
        boolean(block, "UNION", slab); bpy.data.objects.remove(slab)
        poly = [deck_pt(bank, u, v) for u, v in wall_part]
        wall = obj(f"ValleyWall_{bank}", prism(poly, -BANKS[bank]["d"], P["valley_wall_depth"]), parts)
        boolean(block, "UNION", wall); bpy.data.objects.remove(wall)

    # Front plate: wider than the skirt at the bottom, so the lower accessory
    # holes have metal round them (photo 30).
    fl = FRONT["flange"]
    fsec = [Vector((-fl["half"], P["length"] - fl["depth"], 0)), Vector((fl["half"], P["length"] - fl["depth"], 0)),
            Vector((fl["half"], P["length"] - fl["depth"], fl["top"])), Vector((-fl["half"], P["length"] - fl["depth"], fl["top"]))]
    flange = obj("FrontFlange", prism(fsec, Vector((0, 1, 0)), fl["depth"]), parts)
    boolean(block, "UNION", flange); bpy.data.objects.remove(flange)

    # Rear flange ears for the lower bellhousing bolts and dowels.
    rf = REAR["flange"]
    rsec = [Vector((-rf["half"], 0, 0)), Vector((rf["half"], 0, 0)), Vector((rf["half"], 0, rf["top"])), Vector((-rf["half"], 0, rf["top"]))]
    ears = obj("RearEars", prism(rsec, Vector((0, 1, 0)), rf["depth"]), parts)
    boolean(block, "UNION", ears); bpy.data.objects.remove(ears)

    # Bottom bosses: rail ears, the oil filter pad and the starter pad.
    up = Vector((0, 0, 1))
    adds = []
    for e in BOT["ears"]:
        adds.append(prism([Vector((e["side"] * x, y, 0)) for x, y in e["outline"]], up, e["thk"]))
    fp = BOT["filter_pad"]
    adds.append(cyl(Vector((fp["x"], fp["y"], 0)), up, fp["r"], fp["height"], 48))
    sp = BOT["starter_pad"]
    adds.append(prism([Vector((sp["x0"], sp["y0"], 0)), Vector((sp["x1"], sp["y0"], 0)),
                       Vector((sp["x1"], sp["y1"], 0)), Vector((sp["x0"], sp["y1"], 0))], up, sp["height"]))
    # Side water-jacket wall: a point h up the wall from its lower edge, and
    # the wall's outward normal (-t) for each bank.
    def wall_pt(bank, y, h):
        b = BANKS[bank]
        v2 = b["d"] * P["deck"] + b["t"] * P["deck_v_exh"]
        s1 = v2 - b["d"] * P["wall_len"]
        return Vector((s1.x, y, s1.z)) + b["d"] * h, -b["t"]
    mh = SIDE["mount_holes"]; fz = SIDE["freeze_plugs"]
    for bank in "LR":
        yp = fz[bank][mh["plug"]]
        for dy_, h in mh["offsets"]:
            c, n = wall_pt(bank, yp + dy_, h)
            adds.append(cyl(c - n * 0.05, n, mh["pad_r"], mh["pad_h"] + 0.05, 20))
    fpp = SIDE["fuel_pump"]
    adds.append(cyl(Vector((5.8, fpp["y"], fpp["z"])), Vector((1, 0, 0)), fpp["r"], fpp["x_face"] - 5.8, 40))
    for k, bm_ in enumerate(adds):
        o = obj(f"Boss_{k}", bm_, parts); boolean(block, "UNION", o); bpy.data.objects.remove(o)

    # ---- cutters
    def C(name, bm):
        info["cutters"] += 1
        return obj(name, bm, cut)

    # Main bulkhead positions: centred between rod journals.
    j0 = P["y_cyl1"] - P["stagger"] / 2          # journal 1 (cyl 1 & 2)
    mains = [j0 + P["bore_sp"] / 2 - P["bore_sp"] * i for i in range(5)]
    widths = [P["web_front"], P["web"], P["web"], P["web"], P["web_rear"]]
    webs = [(m - w / 2, m + w / 2) for m, w in zip(mains, widths)]
    info["mains_y"] = [round(m, 3) for m in mains]

    # Crankcase bays between bulkheads (open to the bores above, the pan below).
    # Through the rail the opening narrows to the flange's inner edge.
    ch, ri, zr = P["case_half"], P["rail_inner"], P["pan_rail_z"]
    def case_sec(top):
        lo = [Vector((-ri, 0, zr - 1)), Vector((ri, 0, zr - 1)), Vector((ri, 0, zr + P["rail_t"])),
              Vector((ch, 0, zr + P["rail_t"] + 0.35))]
        if top == "bay":
            return lo + [Vector((ch, 0, 1.0)), Vector((1.6, 0, P["cam_cd"] - 1.35)),
                         Vector((-1.6, 0, P["cam_cd"] - 1.35)), Vector((-ch, 0, 1.0)),
                         Vector((-ch, 0, zr + P["rail_t"] + 0.35)), Vector((-ri, 0, zr + P["rail_t"]))]
        return lo + [Vector((ch, 0, 0)), Vector((-ch, 0, 0)),
                     Vector((-ch, 0, zr + P["rail_t"] + 0.35)), Vector((-ri, 0, zr + P["rail_t"]))]
    for i in range(4):
        y_a, y_b = webs[i + 1][1], webs[i][0]
        C(f"Bay_{i+1}", prism([p + Vector((0, y_a, 0)) for p in case_sec("bay")], Vector((0, 1, 0)), y_b - y_a))
        C(f"RodSweep_{i+1}", cyl(Vector((0, y_a, 0)), Vector((0, 1, 0)), P["rod_sweep_r"], y_b - y_a, 96))
    # Below the parting line the bulkheads end: the crankcase is open the full
    # width under every web, and the caps hang free (no side bolts, no pockets).
    y_a, y_b = webs[4][0], webs[0][1]
    if zr < 0: C("UnderWebs", prism([p + Vector((0, y_a, 0)) for p in case_sec("under")], Vector((0, 1, 0)), y_b - y_a))

    # The whole bottom of the block is the oil pan face, flat at the main cap
    # parting line (the crank centreline), from front to rear: the caps hang
    # below it into the pan, and nothing else does.

    # Main line bore and cam tunnel, full length.
    C("MainBore", cyl(Vector((0, -0.5, 0)), Vector((0, 1, 0)), P["main_bore"] / 2, P["length"] + 1, 48))
    C("CamBore", cyl(Vector((0, -0.5, P["cam_cd"])), Vector((0, 1, 0)), P["cam_bore"] / 2, P["length"] + 1, 40))
    C("CamPlug", cyl(Vector((0, -0.05, P["cam_cd"])), Vector((0, 1, 0)), P["cam_plug"] / 2, 0.45, 40))

    # Cylinder bores and every deck feature: bolt holes from the gasket, water
    # ports traced from the block itself (refs/deck_block.json), which are
    # larger than the gasket's holes.
    counts = {}
    drop = set(BLK["drop_gasket_holes"]); small_d = BLK["small_ports"]["d"]
    for bank, b in BANKS.items():
        for k, n in enumerate(b["cyls"]):
            top = deck_pt(bank, P["bore_sp"] * k, 0, 0.05)
            C(f"Bore_{n}", cyl(top, -b["d"], P["bore"] / 2, P["bore_len"] + 0.05, 64))
        for i, h in enumerate(DECK["holes"]):
            kind = h["kind"]
            if kind in ("bore", "valley_cutout") or i in drop: continue
            if kind == "stud_dowel": kind = "stud"      # the gasket's dowel hole is not where the block's dowels are
            counts[kind] = counts.get(kind, 0) + 1
            c = deck_pt(bank, h["u"], h["v"], 0.05)
            if kind == "stud":
                C(f"Stud_{bank}{i}", cyl(c, -b["d"], P["stud_tap"] / 2, P["stud_depth"] + 0.05, 20))
            elif kind == "stud_dowel":
                C(f"Dowel_{bank}{i}", cyl(c, -b["d"], P["dowel_d"] / 2, P["dowel_depth"] + 0.05, 24))
                C(f"Stud_{bank}{i}", cyl(c, -b["d"], P["stud_tap"] / 2, P["stud_depth"] + 0.05, 20))
            elif h["d_eq"] < 0.3:
                C(f"Port_{bank}{i}", cyl(c, -b["d"], small_d / 2, P["port_depth"] + 0.05, 20))
            else:
                poly = [deck_pt(bank, u, v, 0.05) for u, v in h["contour"]]
                C(f"Port_{bank}{i}", prism(poly, -b["d"], P["port_depth"] + 0.05))
        for pt in BLK["ports"]:
            counts["coolant"] = counts.get("coolant", 0) + 1
            poly = [deck_pt(bank, u, v, 0.05) for u, v in pt["contour"]]
            C(f"Port_{bank}_{pt['name']}", prism(poly, -b["d"], P["port_depth"] + 0.05))
        for pt in BLK["round_ports"]:
            counts["coolant"] = counts.get("coolant", 0) + 1
            C(f"Port_{bank}_{pt['name']}", cyl(deck_pt(bank, pt["u"], pt["v"], 0.05), -b["d"], pt["d"] / 2, P["port_depth"] + 0.05, 24))
        pd = BLK["pad"]
        C(f"Pad_{bank}", prism([deck_pt(bank, u, v, 0.05) for u, v in pd["contour"]], -b["d"], pd["depth"] + 0.05))
        for k, dw in enumerate(BLK["dowels"]):
            counts["dowel"] = counts.get("dowel", 0) + 1
            C(f"Dowel_{bank}{k}", cyl(deck_pt(bank, dw["u"], dw["v"], 0.05), -b["d"], P["dowel_d"] / 2, P["dowel_depth"] + 0.05, 24))
    info["deck_features_per_bank"] = {k: v // 2 for k, v in counts.items()}

    # Front face: water-pump inlets and bolts, Gen VI 6-bolt cover pattern and
    # dowels, accessory holes, the timing-chest recess with its cam-plate bolts,
    # gallery plugs and valley window, and the water-pump leg pockets.
    yf, back = P["length"], Vector((0, -1, 0))
    def xs(h): return (h["x"], -h["x"]) if h["mirror"] else (h["x"],)
    def holes(group, y0):
        for h in FRONT[group]:
            for i, x in enumerate(xs(h)):
                C(f"F_{h['name']}_{i}", cyl(Vector((x, y0 + 0.05, h["z"])), back, h["d"] / 2, h["depth"] + 0.05,
                                            48 if h["d"] > 1 else 24))
    holes("holes", yf)
    rec = FRONT["recess"]; hz = rec["half_width_vs_z"]; yr = yf - rec["depth"]
    rp = ([Vector((hz[0][0], yr, -1.0))] + [Vector((w, yr, z)) for w, z in hz]
          + [Vector((-w, yr, z)) for w, z in reversed(hz[:-1])] + [Vector((-hz[0][0], yr, -1.0))])
    C("F_TimingRecess", prism(rp, Vector((0, 1, 0)), rec["depth"] + 0.1))
    holes("floor_holes", yr)
    pk = FRONT["pocket"]
    for side, sx in (("R", 1), ("L", -1)):
        C(f"F_LegPocket_{side}", prism([Vector((sx * x, yf - pk["depth"], z)) for x, z in pk["outline"]],
                                       Vector((0, 1, 0)), pk["depth"] + 0.1))
    # Outside the machined plate the front is cast, a little behind the plate.
    pl = FRONT["plate"]; yrel = yf - pl["relief"]
    half = [Vector((0, yrel, 16))] + [Vector((x, yrel, z)) for x, z in pl["half_outline"]] + \
           [Vector((pl["half_outline"][-1][0], yrel, -1)), Vector((12, yrel, -1)), Vector((12, yrel, 16))]
    for side, sx in (("R", 1), ("L", -1)):
        C(f"F_CastRelief_{side}", prism([Vector((sx * p.x, p.y, p.z)) for p in half], Vector((0, 1, 0)), pl["relief"] + 0.1))
    # Oil pan rail bolt holes, tapped up from the pan face.
    for h in PAN["holes"]:
        for i, x in enumerate((h["x"], -h["x"])):
            C(f"Pan_{h['y']:.2f}_{i}", cyl(Vector((x, h["y"], -0.05)), Vector((0, 0, 1)), h["d"] / 2, h["depth"] + 0.05, 16))
    # Bottom boss holes: ear holes, filter thread and oil port, starter holes,
    # and the oil-pump outlet passage up into the block.
    for e in BOT["ears"]:
        h = e["hole"]; C(f"EarHole_{e['side']}", cyl(Vector((e["side"] * h["x"], h["y"], -0.05)), up, h["d"] / 2, h["depth"] + 0.1, 24))
    C("FilterThread", cyl(Vector((fp["x"], fp["y"], -0.05)), up, fp["thread_d"] / 2, fp["thread_depth"] + 0.05, 32))
    pt = fp["port"]; C("FilterPort", cyl(Vector((pt["x"], pt["y"], -0.05)), up, pt["d"] / 2, pt["depth"] + 0.05, 24))
    for k, (x, y) in enumerate(sp["holes"]):
        C(f"StarterHole_{k}", cyl(Vector((x, y, -0.05)), up, sp["d"] / 2, sp["depth"] + 0.05, 20))
    pp = BOT["pump"]["port"]
    C("PumpPortBlock", cyl(Vector((pp["x"], pp["y"], -0.05)), up, pp["d"] / 2, pp["up_into_block"] + 0.05, 24))
    # Sides: freeze-plug bores, motor-mount holes, the fuel-pump boss.
    for bank in "LR":
        for k, y in enumerate(fz[bank]):
            c, n = wall_pt(bank, y, fz["h"])
            C(f"FreezePlug_{bank}{k}", cyl(c + n * 0.3, -n, fz["d"] / 2, fz["bore_depth"] + 0.3, 40))
        yp = fz[bank][mh["plug"]]
        for k, (dy_, h) in enumerate(mh["offsets"]):
            c, n = wall_pt(bank, yp + dy_, h)
            C(f"MountHole_{bank}{k}", cyl(c + n * (mh["pad_h"] + 0.05), -n, mh["d"] / 2, mh["pad_h"] + mh["depth"] + 0.05, 16))
    xf = Vector((-1, 0, 0))
    C("FuelPumpOpening", cyl(Vector((fpp["x_face"] + 0.05, fpp["y"], fpp["z"])), xf, fpp["open_d"] / 2, fpp["open_depth"] + 0.05, 32))
    for k, (dy_, dz_) in enumerate(fpp["bolts"]):
        C(f"FuelPumpBolt_{k}", cyl(Vector((fpp["x_face"] + 0.05, fpp["y"] + dy_, fpp["z"] + dz_)), xf, fpp["bolt_d"] / 2, fpp["bolt_depth"] + 0.05, 16))
    # Rear oil-gallery plug bores.
    for k, g in enumerate(SIDE["rear_plugs"]):
        for x in ((g["x"], -g["x"]) if g["mirror"] else (g["x"],)):
            C(f"RearGallery_{k}_{x:+.2f}", cyl(Vector((x, -0.05, g["z"])), Vector((0, 1, 0)), SIDE["rear_plug_d"] / 2, SIDE["rear_plug_depth"] + 0.05, 6))
    # Rear face: bellhousing bolts and dowel holes, the one-piece seal bore.
    fwd = Vector((0, 1, 0))
    for h in REAR["bell_holes"]:
        for i, x in enumerate((h["x"], -h["x"])):
            C(f"Bell_{h['z']:.2f}_{i}", cyl(Vector((x, -0.05, h["z"])), fwd, REAR["bell_d"] / 2, REAR["bell_depth"] + 0.05, 20))
    dw = REAR["dowel"]
    for i, x in enumerate((dw["x"], -dw["x"])):
        C(f"BellDowel_{i}", cyl(Vector((x, -0.05, dw["z"])), fwd, dw["d"] / 2, dw["hole_depth"] + 0.05, 24))
    sl = REAR["seal"]
    def seal_cuts(coll_):
        obj("SealBore", cyl(Vector((0, -0.05, 0)), fwd, sl["bore_d"] / 2, sl["bore_depth"] + 0.05, 64), coll_)
        obj("SealClear", cyl(Vector((0, -0.05, 0)), fwd, sl["clear_d"] / 2, sl["clear_depth"] + 0.05, 64), coll_)
        y_th = webs[4][0]   # rear face of the thrust bulkhead
        obj("RearPocket", cyl(Vector((0, sl["clear_depth"] - 0.05, 0)), fwd, P["rear_pocket_d"] / 2, y_th - sl["clear_depth"] + 0.05, 64), coll_)
    seal_cuts(cut); info["cutters"] += 3
    info["front_features"] = sum(len(xs(h)) for g in ("holes", "floor_holes") for h in FRONT[g])

    boolean(block, "DIFFERENCE", cut)

    # ---- valley (photos 545/547): after the valley is opened, add the lifter
    # bosses, retainer bosses and distributor boss, then cut the lifter
    # bores, the cam drain windows, the retainer taps, the distributor bore
    # and the oil galleries.
    V, lf = SIDE["valley"], SIDE["lifters"]
    camc = Vector((0, 0, P["cam_cd"])); th = math.radians(lf["tilt_deg"])
    def lifter_axis(b): return Vector((math.copysign(math.sin(th), b["d"].x), 0, math.cos(th)))
    def stadium(c, ax, half, r, seg=12, e1=Vector((0, 1, 0))):
        e1 = e1.normalized(); e2 = ax.cross(e1).normalized()
        pts = []
        for k in range(seg + 1):
            a_ = math.pi * k / seg
            pts.append(c + e1 * (half + r * math.sin(a_)) + e2 * (r * math.cos(a_)))
        for k in range(seg + 1):
            a_ = math.pi + math.pi * k / seg
            pts.append(c + e1 * (-half + r * math.sin(a_)) + e2 * (r * math.cos(a_)))
        return pts
    def out_dir(ax): return Vector((math.copysign(ax.z, ax.x), 0, -abs(ax.x)))   # across the bank, outboard
    def bore_c(yc, ax, sgn, t):
        """Centre of a lifter bore at distance t along its axis from the cam
        centre: pairs are .65" either side of the cylinder centre, and the
        forward bore (sgn +1) sits outboard of the rear one (photos 545/27)."""
        return camc + Vector((0, yc + sgn * lf["dy"], 0)) + ax * t + out_dir(ax) * (sgn * lf["pair_offset"] / 2)
    pairs = []
    for bank, b in BANKS.items():
        ax = lifter_axis(b)
        for k in range(4):
            yc = b["y0"] - P["bore_sp"] * k
            pairs.append((bank, k, yc, ax))
    bo = V["boss"]
    for bank, k, yc, ax in pairs:
        t_top = (bo["top_z"] - P["cam_cd"]) / ax.z
        c1, c2 = bore_c(yc, ax, -1, t_top - bo["height"]), bore_c(yc, ax, 1, t_top - bo["height"])
        o = obj(f"LifterBoss_{bank}{k}", prism(stadium((c1 + c2) / 2, ax, (c2 - c1).length / 2, bo["r"], e1=c2 - c1), ax, bo["height"]), parts)
        boolean(block, "UNION", o); bpy.data.objects.remove(o)
    ds, db, sb = SIDE["distributor"], V["dist_boss"], V["spider_boss"]
    slot_y = [P["y_cyl1"] - P["stagger"] / 2 - P["bore_sp"] * k for k in range(4)]
    extra = [cyl(Vector((0, ds["y"], P["valley_floor_z"] - 0.3)), up, db["r"], db["h"] + 0.3, 40)]
    for y in slot_y:
        extra.append(cyl(Vector((0, y + sb["dy"], P["valley_floor_z"] - 0.3)), up, sb["r"], sb["h"] + 0.3, 24))
    for k, bm_ in enumerate(extra):
        o = obj(f"ValleyBoss_{k}", bm_, parts); boolean(block, "UNION", o); bpy.data.objects.remove(o)

    vcut = coll("Block_Cutters_Valley", root, hide=True)
    def VC(name, bm_):
        info["cutters"] += 1; return obj(name, bm_, vcut)
    for bank, k, yc, ax in pairs:
        for j, sgn in enumerate((-1, 1)):
            VC(f"Lifter_{bank}{k}{j}", cyl(bore_c(yc, ax, sgn, lf["from_cam"]), ax, lf["d"] / 2,
                                          (bo["top_z"] - P["cam_cd"]) / ax.z - lf["from_cam"] + 0.3, 32))
    dsl = V["drain_slots"]
    for k, y in enumerate(slot_y):
        r = dsl["w"] / 2; half = dsl["len"] / 2 - r
        pts = stadium(Vector((0, y, dsl["z_bot"])), up, half, r)
        VC(f"CamDrain_{k}", prism(pts, up, dsl["z_top"] - dsl["z_bot"]))
        VC(f"SpiderTap_{k}", cyl(Vector((0, y + sb["dy"], P["valley_floor_z"] + sb["h"] + 0.05)), Vector((0, 0, -1)),
                                 sb["tap_d"] / 2, sb["tap_depth"] + 0.05, 16))
    VC("Distributor", cyl(Vector((0, ds["y"], ds["z_top"])), Vector((0, 0, -1)), ds["d"] / 2, ds["z_top"] - ds["z_bot"], 32))
    for g in V["galleries"]:
        for x in ((g["x"], -g["x"]) if g["mirror"] else (g["x"],)):
            VC(f"Gallery_{x:+.2f}", cyl(Vector((x, 0.3, g["z"])), Vector((0, 1, 0)), V["gallery_d"] / 2, P["length"] - 0.3 - FRONT["recess"]["depth"] + 0.05, 16))
    boolean(block, "DIFFERENCE", vcut)

    # Main caps: separate parts hanging under each bulkhead, bored with the
    # block, four vertical studs each (inner and outer pair), ARP nuts.
    hw, dz, ch_ = P["cap_half"], P["cap_drop"], P["cap_chamfer"]
    xs_, sd = P["cap_step_x"], P["cap_outer_drop"]
    def cap_section(step_l, step_r):
        """XZ section: the centre runs full depth; stepped sides carry the
        outer studs on shoulders (photo 435)."""
        def side(sg, step):
            if step:
                return [Vector((sg * hw, 0, 0)), Vector((sg * hw, 0, -sd)), Vector((sg * xs_, 0, -sd)),
                        Vector((sg * xs_, 0, -dz + ch_)), Vector((sg * (xs_ - ch_), 0, -dz))]
            return [Vector((sg * hw, 0, 0)), Vector((sg * hw, 0, -dz + ch_)), Vector((sg * (hw - ch_), 0, -dz))]
        return side(-1, step_l) + list(reversed(side(1, step_r)))
    for i, (a, b) in enumerate(webs):
        ym = (a + b) / 2
        if i == 4: a = 0.0   # the rear cap runs to the rear face and carries the lower half of the seal bore (photo 435)
        rear = i == 4
        cap = obj(f"MainCap_{i+1}", prism([p + Vector((0, a, 0)) for p in cap_section(not rear, True)], Vector((0, 1, 0)), b - a), parts)
        if rear:   # passenger-side outer stud stands on a full-depth round column (photo 435)
            rc = BOT["rear_cap"]
            col = obj("col_tmp", cyl(Vector((rc["column_x"], ym, -sd + 0.05)), Vector((0, 0, -1)), rc["column_r"], dz - sd - 0.05, 32), parts)
            boolean(cap, "UNION", col); bpy.data.objects.remove(col)
        capcut = coll("Cap_Cutters_tmp", root, hide=True)
        obj("bore", cyl(Vector((0, a - 0.1, 0)), Vector((0, 1, 0)), P["main_bore"] / 2, b - a + 0.2, 48), capcut)
        if i == 4:
            seal_cuts(capcut)
            obj("pump_port", cyl(Vector((pp["x"], pp["y"], -dz - 0.1)), up, pp["d"] / 2, dz + 0.2, 24), capcut)
            obj("pump_pocket", cyl(Vector((pp["x"], pp["y"], -dz - 0.05)), up, pp["pocket_d"] / 2, pp["pocket_depth"] + 0.05, 32), capcut)
            ps = BOT["pump"]["stud"]
            obj("pump_stud", cyl(Vector((ps["x"], ps["y"], -dz - 0.05)), up, ps["d"] / 2, ps["depth"] + 0.05, 20), capcut)
            pdw = BOT["pump"]["dowel"]
            obj("pump_dowel", cyl(Vector((pdw["x"], pdw["y"], -dz - 0.05)), up, pdw["d"] / 2, pdw["depth"] + 0.05, 16), capcut)
        hw_bm = bmesh.new()
        for x in P["main_stud_x"]:
            for sx in (-x, x):
                obj("stud", cyl(Vector((sx, ym, -dz - 0.1)), Vector((0, 0, 1)), P["main_stud_d"] / 2 + 0.015, dz + 0.2, 20), capcut)
                # Outer studs land on the shoulders (shorter), except the rear
                # cap's driver side (full depth, pump pad) and its column.
                outer = x == max(P["main_stud_x"])
                zb = -sd if (outer and not rear) else -dz
                if rear and outer and sx > 0: zb = -dz
                base = Vector((sx, ym, zb))
                # Stud: threaded ~1" up into the bulkhead, down through the cap, past the nut.
                extra = BOT["windage_studs"]["extra"] if (i + 1 in BOT["windage_studs"]["caps"] and x == min(P["main_stud_x"])) else 0
                cyl(Vector((sx, ym, 1.0)), Vector((0, 0, -1)), P["main_stud_d"] / 2, 1.0 - zb + P["main_stud_out"] + extra, 16, hw_bm)
                cyl(base, Vector((0, 0, -1)), P["main_washer_d"] / 2, 0.10, 24, hw_bm)
                cyl(base - Vector((0, 0, 0.10)), Vector((0, 0, -1)), P["main_nut_d"] / 2, P["main_nut_h"], 12, hw_bm)
        boolean(cap, "DIFFERENCE", capcut)
        clear(capcut); bpy.data.collections.remove(capcut)
        studs = obj(f"MainStuds_{i+1}", hw_bm, parts)

    # Front hardware: timing-cover dowel pins (stand .30 proud) and the
    # hex-socket gallery plugs in the timing chest (flush).
    hw_bm = bmesh.new()
    for h in FRONT["holes"]:
        if h["name"] == "CoverDowel":
            for x in xs(h): cyl(Vector((x, yf - 0.45, h["z"])), Vector((0, 1, 0)), h["d"] / 2 - 0.002, 0.75, 16, hw_bm)
    for x in (dw["x"], -dw["x"]):
        cyl(Vector((x, dw["hole_depth"] - 0.02, dw["z"])), Vector((0, -1, 0)), dw["d"] / 2 - 0.002, dw["hole_depth"] + dw["proud"], 24, hw_bm)
    pdw = BOT["pump"]["dowel"]
    cyl(Vector((pdw["x"], pdw["y"], -dz + pdw["depth"] - 0.02)), Vector((0, 0, -1)), pdw["d"] / 2 - 0.002, pdw["depth"] + pdw["proud"], 16, hw_bm)
    obj("DowelPins", hw_bm, parts)   # timing-cover, bellhousing and oil-pump dowels
    cups = bmesh.new()
    for bank in "LR":
        for y in fz[bank]:
            c, n = wall_pt(bank, y, fz["h"])
            cyl(c - n * fz["cup_recess"], -n, fz["d"] / 2 - 0.003, fz["cup_len"], 40, cups)
    obj("FreezePlugs", cups, parts)
    hw_bm = bmesh.new()
    for k, g in enumerate(SIDE["rear_plugs"]):
        for x in ((g["x"], -g["x"]) if g["mirror"] else (g["x"],)):
            cyl(Vector((x, 0.03, g["z"])), Vector((0, 1, 0)), SIDE["rear_plug_d"] / 2 - 0.005, 0.42, 6, hw_bm)
    for h in FRONT["floor_holes"]:
        if h["name"].endswith("Plug"):
            for x in xs(h): cyl(Vector((x, yr - 0.45, h["z"])), Vector((0, 1, 0)), h["d"] / 2 - 0.005, 0.42, 6, hw_bm)
    obj("GalleryPlugs", hw_bm, parts)

    for o in parts.objects:
        o.data.shade_smooth(); o.data.set_sharp_from_angle(angle=math.radians(35))
        info["parts"][o.name] = dict(tris=sum(len(p.vertices) - 2 for p in o.data.polygons),
                                     dims_in=[round(d / IN, 3) for d in o.dimensions])
    def material(name, rgba, metal, rough):
        m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        m.diffuse_color = rgba
        bsdf = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf:
            bsdf.inputs["Base Color"].default_value = rgba
            bsdf.inputs["Metallic"].default_value = metal
            bsdf.inputs["Roughness"].default_value = rough
        return m
    mats = {
        "paint": material("Block_ChevyOrange", (0.85, 0.18, 0.02, 1), 0.0, 0.25),   # gloss orange outer faces (photos 26, 28)
        "cast": material("Block_CastIron", (0.20, 0.20, 0.205, 1), 0.25, 0.85),     # as-cast grey iron: valley, crankcase, chest, caps (photos 27, 28)
        "iron": material("Block_MachinedIron", (0.62, 0.62, 0.63, 1), 0.6, 0.32),  # machined faces: decks, pan rail, ends (photos 27-29)
        "arp": material("ARP_BlackOxide", (0.03, 0.03, 0.03, 1), 0.8, 0.35),       # ARP studs and nuts
        "brass": material("Brass_FreezePlug", (0.80, 0.62, 0.22, 1), 1.0, 0.3),       # brass cups (photo 431)
    }
    for o in parts.objects:
        kind = ("brass" if o.name == "FreezePlugs" else "arp" if o.name.startswith("MainStuds") else
                "cast" if o.name.startswith("MainCap") else
                "iron" if o.name.startswith(("DowelPins", "GalleryPlugs")) else "cast")
        o.data.materials.clear(); o.data.materials.append(mats[kind])
    # Block surfaces (photos 26-29): everything is iron, as-cast grey by
    # default; machined faces (decks, pan face, front and rear faces) are
    # bright; the outer faces of the casting are painted orange. A face is
    # "outer" when a ray along its normal leaves the block without hitting it
    # again, unless it opens into the valley or the crankcase.
    blk = parts.objects["Block"]; blk.data.materials.append(mats["iron"]); blk.data.materials.append(mats["paint"])
    dl, dr = BANKS["L"]["d"], BANKS["R"]["d"]
    vh = P["valley_top_half"] + 0.3
    def machined(c, n):
        return ((n.y > 0.999 and c.y > P["length"] - 0.01) or (n.z < -0.999 and abs(c.z) < 0.01)
                or any(n.dot(d) > 0.999 and abs(c.dot(d) - P["deck"]) < 0.01 for d in (dl, dr))
                or (n.z > 0.999 and c.z > P["valley_floor_z"] + 1.0 and abs(c.x) < P["deck_clip_v"] + 3.0))   # intake rails and china-wall tops
    hz = FRONT["recess"]["half_width_vs_z"]
    def rec_w(z):
        for (w0, z0), (w1, z1) in zip(hz, hz[1:]):
            if z0 <= z <= z1: return w0 + (w1 - w0) * (z - z0) / (z1 - z0)
        return -1
    seal_r = REAR["seal"]["bore_d"] / 2 + 0.05
    def inside(c, n):
        # The timing chest and the rear seal bore are bare iron (photos 29, 435).
        if P["length"] - FRONT["recess"]["depth"] - 0.05 < c.y < P["length"] - 0.01 and c.z > -0.01 and abs(c.x) < rec_w(c.z) + 0.02: return True
        if c.y < webs[4][0] + 0.05 and math.hypot(c.x, c.z) < seal_r: return True
        # Valley and crankcase, inside the block's length only, so the painted
        # rear face (photo 50) and the front leg pockets (photo 30) stay orange.
        if not (0.05 < c.y < P["length"] - 1.2): return False
        if c.z > P["valley_floor_z"] - 0.5 and abs(c.x) < vh and n.z > -0.2: return True       # valley
        if c.z < P["cam_cd"] + 1.0 and abs(c.x) < P["case_half"] + 0.2 and n.z < 0.2: return True  # crankcase
        return False
    for poly in blk.data.polygons:
        c, n = poly.center / IN, poly.normal
        if machined(c, n): poly.material_index = 1; continue
        if inside(c, n): continue
        # Floors of the water-port and bolt-hole pockets just under each deck:
        # bare iron (the jacket isn't modelled, so their rays would escape).
        if any(n.dot(d) > 0.99 and P["deck"] - P["port_depth"] - 0.1 < c.dot(d) < P["deck"] - 0.02 for d in (dl, dr)): continue
        # Strips beside the decks on the valley side (under the intake gasket)
        # are bare cast iron, not painted (photos 27, 545).
        if c.z > P["valley_floor_z"] and abs(c.x) < P["deck_clip_v"] + 1.7 and (any(n.dot(d) > 0.99 for d in (dl, dr)) or n.x * c.x < 0): continue
        hit, *_ = blk.ray_cast(poly.center + n * 0.0005, n)
        if not hit: poly.material_index = 2
    setup_camera(parts)
    # The cutters stay in the hidden collection for inspection; the block is final.
    with open(os.path.join(HERE, "block_info.json"), "w") as f:
        json.dump(dict(params=P, **info), f, indent=1, default=str)
    return info


if __name__ == "__main__" or "bpy" in globals():
    result = build()
    print(json.dumps({k: v for k, v in result.items() if k != "parts"}, default=str))
    for k, v in result["parts"].items(): print(k, v)
    if "--save" in sys.argv:
        bpy.ops.wm.save_as_mainfile(filepath=sys.argv[sys.argv.index("--save") + 1])
