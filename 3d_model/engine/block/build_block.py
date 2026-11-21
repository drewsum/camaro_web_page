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
    web=1.00, web_front=1.10, web_rear=1.60,   # [est] bulkhead thicknesses
    cam_cd=5.147,        # [derived] crank-to-cam centre distance
    cam_bore=2.120,      # [spec] cam bearing housing bore
    cam_plug=2.218,      # [spec] rear cam plug bore
    bore_len=6.60,       # [est] machined bore length below the deck
    deck_thk=1.10,       # [est] deck slab depth below the gasket face
    deck_v_valley=3.30, deck_v_exh=-3.15,      # [meas] gasket body edges (tabs/bosses go further)
    deck_clip_v=3.80,    # [meas] gasket ears beyond this hang over the valley (photo 38)
    wall_len=4.30,       # [est] side water-jacket wall length below the deck edge
    pan_rail_z=0.0,      # [Drew] the oil pan face is one flat plane at the crank centreline (the main cap parting line), full length
    rail_x=5.65, rail_t=0.40, rail_inner=4.85,   # [est] pan rail flange outer/inner half-width, thickness
    valley_floor_z=7.30, valley_top_half=3.60, valley_floor_half=2.40, china_wall=0.45,   # [est]
    case_half=5.15,      # [est] crankcase cavity half-width above the rail
    cap_half=3.45, cap_drop=3.10, cap_chamfer=0.30,   # [meas] photos 22/24, scaled by the 2.9375" saddle: cap width and depth
    main_stud_x=(1.95, 3.00),   # [meas] photo 22: inner pair just outside the saddle, outer pair ~1.05" further; all vertical
    main_stud_d=0.50, main_nut_d=0.80, main_nut_h=0.55, main_washer_d=0.95, main_stud_out=0.85,  # [est] ARP 235-5701 hardware
    stud_tap=0.4375, stud_depth=1.75,          # [spec] 7/16-14 blind-tapped head stud holes
    dowel_d=0.609, dowel_depth=0.35,           # [meas] head dowel counterbore (gasket hole)
    port_depth=0.70,     # [est] coolant ports cut as pockets; the jacket itself is not modelled
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

def boolean(target, kind, operand):
    m = target.modifiers.new(kind, "BOOLEAN"); m.operation = kind; m.solver = "EXACT"
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

    # Deck slabs: the gasket outline (ears clipped) swept down the bore axis.
    for bank in "LR":
        pts = [(u, min(v, P["deck_clip_v"])) for u, v in DECK["outline"]]
        poly = [deck_pt(bank, u, v) for u, v in pts]
        slab = obj(f"DeckSlab_{bank}", prism(poly, -BANKS[bank]["d"], P["deck_thk"]), parts)
        boolean(block, "UNION", slab); bpy.data.objects.remove(slab)

    # ---- cutters
    def C(name, bm):
        info["cutters"] += 1
        return obj(name, bm, cut)

    # Lifter valley between the china walls.
    vt, vf = P["valley_top_half"], P["valley_floor_half"]
    vsec = [Vector((-vt - 2, 0, 12)), Vector((-vt, 0, 9.5)), Vector((-vf, 0, P["valley_floor_z"])),
            Vector((vf, 0, P["valley_floor_z"])), Vector((vt, 0, 9.5)), Vector((vt + 2, 0, 12))]
    C("Valley", prism([p + Vector((0, P["china_wall"], 0)) for p in vsec], Vector((0, 1, 0)),
                       P["length"] - 2 * P["china_wall"]))

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

    # Cylinder bores and every deck feature from the gasket.
    counts = {}
    for bank, b in BANKS.items():
        for k, n in enumerate(b["cyls"]):
            top = deck_pt(bank, P["bore_sp"] * k, 0, 0.05)
            C(f"Bore_{n}", cyl(top, -b["d"], P["bore"] / 2, P["bore_len"] + 0.05, 64))
        for i, h in enumerate(DECK["holes"]):
            kind = h["kind"]
            if kind in ("bore", "valley_cutout"): continue
            counts[kind] = counts.get(kind, 0) + 1
            c = deck_pt(bank, h["u"], h["v"], 0.05)
            if kind == "stud":
                C(f"Stud_{bank}{i}", cyl(c, -b["d"], P["stud_tap"] / 2, P["stud_depth"] + 0.05, 20))
            elif kind == "stud_dowel":
                C(f"Dowel_{bank}{i}", cyl(c, -b["d"], P["dowel_d"] / 2, P["dowel_depth"] + 0.05, 24))
                C(f"Stud_{bank}{i}", cyl(c, -b["d"], P["stud_tap"] / 2, P["stud_depth"] + 0.05, 20))
            else:
                poly = [deck_pt(bank, u, v, 0.05) for u, v in h["contour"]]
                C(f"Port_{bank}{i}", prism(poly, -b["d"], P["port_depth"] + 0.05))
    info["deck_features_per_bank"] = {k: v // 2 for k, v in counts.items()}

    boolean(block, "DIFFERENCE", cut)

    # Main caps: separate parts hanging under each bulkhead, bored with the
    # block, four vertical studs each (inner and outer pair), ARP nuts.
    hw, dz, ch_ = P["cap_half"], P["cap_drop"], P["cap_chamfer"]
    cap_sec = [Vector((-hw, 0, 0)), Vector((-hw, 0, -dz + ch_)), Vector((-hw + ch_, 0, -dz)),
               Vector((hw - ch_, 0, -dz)), Vector((hw, 0, -dz + ch_)), Vector((hw, 0, 0))]
    for i, (a, b) in enumerate(webs):
        cap = obj(f"MainCap_{i+1}", prism([p + Vector((0, a, 0)) for p in cap_sec], Vector((0, 1, 0)), b - a), parts)
        capcut = coll("Cap_Cutters_tmp", root, hide=True)
        obj("bore", cyl(Vector((0, a - 0.1, 0)), Vector((0, 1, 0)), P["main_bore"] / 2, b - a + 0.2, 48), capcut)
        hw_bm = bmesh.new()
        ym = (a + b) / 2
        for x in P["main_stud_x"]:
            for sx in (-x, x):
                obj("stud", cyl(Vector((sx, ym, -dz - 0.1)), Vector((0, 0, 1)), P["main_stud_d"] / 2 + 0.015, dz + 0.2, 20), capcut)
                base = Vector((sx, ym, -dz))
                # Stud: threaded ~1" up into the bulkhead, down through the cap, past the nut.
                cyl(Vector((sx, ym, 1.0)), Vector((0, 0, -1)), P["main_stud_d"] / 2, 1.0 + dz + P["main_stud_out"], 16, hw_bm)
                cyl(base, Vector((0, 0, -1)), P["main_washer_d"] / 2, 0.10, 24, hw_bm)
                cyl(base - Vector((0, 0, 0.10)), Vector((0, 0, -1)), P["main_nut_d"] / 2, P["main_nut_h"], 12, hw_bm)
        boolean(cap, "DIFFERENCE", capcut)
        clear(capcut); bpy.data.collections.remove(capcut)
        studs = obj(f"MainStuds_{i+1}", hw_bm, parts)

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
        "paint": material("Block_ChevyOrange", (0.85, 0.24, 0.05, 1), 0.0, 0.45),   # painted (photo 26)
        "iron": material("Block_BareIron", (0.30, 0.30, 0.31, 1), 0.85, 0.5),      # unpainted caps (photo 24)
        "arp": material("ARP_BlackOxide", (0.03, 0.03, 0.03, 1), 0.8, 0.35),       # ARP studs and nuts
    }
    for o in parts.objects:
        kind = "arp" if o.name.startswith("MainStuds") else "iron" if o.name.startswith("MainCap") else "paint"
        o.data.materials.clear(); o.data.materials.append(mats[kind])
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
