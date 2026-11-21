"""Crankshaft and main bearings for Drew's 540 (Scat forged steel, 4.250" stroke,
internally balanced), built to sit in the Gen VI block from ../block.

The crank is one object, "Crankshaft", with its origin on the crank axis. It
turns about Y through its custom property "crank_deg" (a driver sets the
rotation): 0 is cylinder 1 at TDC on its firing stroke, and positive degrees
turn the crank clockwise seen from the front, as a Chevy runs. The property is
keyframed 0 -> 720 over frames 1-97 with a Cycles modifier, so playback spins it.

The bearings do not turn: upper shells sit in the block saddles, lower shells
in the caps, split at the parting line. The thrust bearing is #5 (rear).

Throw angles come from the firing order and are checked, not typed in:
cylinder c fires at 90 * (its place in 1-8-4-3-6-5-7-2) crank degrees, when its
throw points up its bank (left bank 45 deg to the driver side, right bank 45
deg to the passenger side). Both cylinders on each throw must agree (mod 360).

Axes and units as the block: X passenger side, Y forward, Z up, origin on the
crank centreline at the rear face; inches, converted once. Tags: [spec]
published, [derived], [est] estimate awaiting a reference. Sources in PARTS.md.

Run live in Blender after the block:
    exec(open(r"C:/Users/drewm/Documents/scripts/camaro_webpage/3d_model/engine/crank/build_crank.py").read())
"""
import bpy, bmesh, json, math, os
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

HERE = (os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals()
        else r"C:\Users\drewm\Documents\scripts\camaro_webpage\3d_model\engine\crank")
IN = 0.0254
BLK = json.load(open(os.path.join(HERE, "..", "block", "block_info.json")))
BP, MAINS = BLK["params"], BLK["mains_y"]          # main bulkhead centres, front (#1) to rear (#5)

K = dict(
    stroke=4.250,        # [spec] Drew's build page: 4.5 x 4.25
    main_d=2.7488,       # [spec] BBC main journal 2.7485-2.7495
    rod_d=2.1990,        # [spec] BBC rod journal 2.1985-2.1995
    pin_len=2 * BP["stagger"],   # [derived] two .990 big ends plus side clearance, the block's 1.000" bank stagger
    jl_gap=0.05,         # [est] cheek-to-bulkhead clearance each side of a main journal
    hub_r=1.60,          # [est] cheek radius around the main journal
    pin_r=1.45,          # [est] cheek radius around the rod journal
    cw_r=3.55,           # [est] counterweight radius (clears the bay ceiling at 3.80" and the cam lobes)
    cw_half=62.0, cw_taper=26.0,   # [est] counterweight arc half-angle and shoulder
    # Bearings
    oil_clear=0.0025,    # [est] diametral oil clearance
    brg_w=0.90,          # [est] shell width, mains 1-4
    thrust_t=0.065, thrust_od=3.55,   # [est] thrust flange thickness and OD (#5, flanges on the bulkhead faces)
    groove_w=0.20, groove_d=0.035, brg_hole=0.25,    # [est] upper-shell oil groove and feed hole
    # Nose
    gear_d=1.750, gear_to=24.30,     # [est] timing-sprocket seat, inside the timing chest
    snout_d=1.600, snout_to=27.10,   # [est] balancer seat, to the nose
    key_w=0.1875, key_depth=0.09, key_from=23.30,   # [est] keyway (1/4" key stock in a .1875 slot)
    nose_bore=0.75, nose_bore_depth=1.25,          # [est] balancer bolt hole (3/4-16)
    # Tail (one-piece seal rides on the flange OD)
    flange_d=4.250,      # [derived] Fel-Pro 2920 seal ID 4.245 (rear_face.json)
    flange_back=-0.40,   # [est] flywheel face behind the block's rear face
    flange_front=0.85,   # [derived] inside the 0.90"-deep seal clearance
    collar_d=3.40,       # [est] rear thrust collar / oil slinger, in the block's 3.60" pocket
    fw_bolt_circle=3.58, fw_bolt_d=0.4375, fw_bolt_n=6, fw_bolt_depth=0.75,   # [spec] BBC flywheel pattern, 7/16-20
    pilot_d=1.094, pilot_depth=0.80,   # [est] pilot bushing bore (manual transmission)
    oil_hole=0.25,       # [est] journal oil holes
)
R = K["stroke"] / 2
FIRING = [1, 8, 4, 3, 6, 5, 7, 2]
BANK_PSI = {"L": -45.0, "R": 45.0}    # psi: angle in the XZ plane from +Z towards +X (passenger)


def throw_angles():
    """psi of each throw at crank_deg = 0. Cylinders: left bank odd, right bank even;
    throw k carries cylinders 2k+1 (left, front) and 2k+2 (right)."""
    ang = {}
    for i, c in enumerate(FIRING):
        a = (BANK_PSI["L" if c % 2 else "R"] + 90.0 * i) % 360.0   # clockwise: psi(t) = psi0 - t
        k = (c - 1) // 2
        if k in ang:
            assert abs(((ang[k] - a + 180) % 360) - 180) < 1e-6, f"firing order disagrees on throw {k+1}"
        else:
            ang[k] = a
    return [ang[k] for k in range(4)]


THROWS = throw_angles()
PIN_Y = [BP["y_cyl1"] - BP["stagger"] / 2 - BP["bore_sp"] * k for k in range(4)]
WEBS = [BP["web_front"], BP["web"], BP["web"], BP["web"], BP["web_rear"]]
JL = [w + 2 * K["jl_gap"] for w in WEBS[:4]] + [WEBS[4] + 2 * K["thrust_t"] + 0.006]   # thrust: .003 end play each side


# ---- helpers ------------------------------------------------------------------

def coll(name, parent=None):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    par = parent or bpy.context.scene.collection
    if c.name not in par.children: par.children.link(c)
    return c

def clear(c):
    for ch in list(c.children): clear(ch); bpy.data.collections.remove(ch)
    for o in list(c.objects): bpy.data.objects.remove(o, do_unlink=True)

def obj(name, bm, c):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); c.objects.link(o)
    return o

def prism(pts, axis, depth, bm=None):
    bm = bm or bmesh.new()
    a = [bm.verts.new(p * IN) for p in pts]
    b = [bm.verts.new((p + axis * depth) * IN) for p in pts]
    bm.faces.new(a[::-1]); bm.faces.new(b)
    for i in range(len(pts)):
        j = (i + 1) % len(pts)
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm

def circle(center, axis, r, seg=24, phase=0.0):
    axis = axis.normalized(); ref = Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))
    e1 = axis.cross(ref).normalized(); e2 = axis.cross(e1)
    return [center + (e1 * math.cos(2 * math.pi * k / seg + phase) + e2 * math.sin(2 * math.pi * k / seg + phase)) * r for k in range(seg)]

def cyl(center, axis, r, length, seg=32, bm=None):
    return prism(circle(center, axis, r, seg), axis.normalized(), length, bm)

def ycyl(r, y0, y1, seg=96, x=0.0, z=0.0, bm=None):
    return cyl(Vector((x, y0, z)), Vector((0, 1, 0)), r, y1 - y0, seg, bm)

def psi_vec(psi_deg, r=1.0):
    p = math.radians(psi_deg)
    return Vector((math.sin(p) * r, 0, math.cos(p) * r))

def revolve_half(profile, upper, seg=48, bm=None):
    """Half-ring solid: a closed (r, y) profile swept through 180 deg, upper
    (z >= 0) or lower half, capped at the parting line."""
    bm = bm or bmesh.new()
    a0, a1 = (0.0, math.pi) if upper else (math.pi, 2 * math.pi)
    rings = []
    for s in range(seg + 1):
        a = a0 + (a1 - a0) * s / seg
        rings.append([bm.verts.new(Vector((r * math.cos(a), y, r * math.sin(a))) * IN) for r, y in profile])
    n = len(profile)
    for s in range(seg):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((rings[s][i], rings[s][j], rings[s + 1][j], rings[s + 1][i]))
    bm.faces.new(rings[0]); bm.faces.new(rings[-1][::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm

def boolean(target, kind, operand):
    m = target.modifiers.new(kind, "BOOLEAN"); m.operation = kind; m.solver = "MANIFOLD"
    if isinstance(operand, bpy.types.Collection): m.operand_type = "COLLECTION"; m.collection = operand
    else: m.object = operand
    with bpy.context.temp_override(object=target, active_object=target):
        bpy.ops.object.modifier_apply(modifier=m.name)

def hull2d(pts):
    pts = sorted(set(pts))
    def cross(o, a, b): return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, hi = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0: lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(hi) >= 2 and cross(hi[-2], hi[-1], p) <= 0: hi.pop()
        hi.append(p)
    return lo[:-1] + hi[:-1]

def ray_poly(poly, ang):
    """Distance from the origin to a convex polygon around it, along angle ang."""
    d = (math.cos(ang), math.sin(ang)); best = 0.0
    for i in range(len(poly)):
        p, q = poly[i], poly[(i + 1) % len(poly)]
        e = (q[0] - p[0], q[1] - p[1]); den = d[0] * e[1] - d[1] * e[0]
        if abs(den) < 1e-12: continue
        t = (p[0] * e[1] - p[1] * e[0]) / den; u = (p[0] * d[1] - p[1] * d[0]) / den
        if t > 0 and -1e-9 <= u <= 1 + 1e-9: best = max(best, t)
    return best

def cheek_section(psi, n=180):
    """Cheek outline in XZ: the hull of the main hub and the pin boss, with the
    counterweight opposite the pin. Local polar angle phi is 0 along the throw."""
    hub = [(K["hub_r"] * math.cos(t), K["hub_r"] * math.sin(t)) for t in (2 * math.pi * i / 96 for i in range(96))]
    pin = [(R + K["pin_r"] * math.cos(t), K["pin_r"] * math.sin(t)) for t in (2 * math.pi * i / 96 for i in range(96))]
    hull = hull2d(hub + pin)
    u, v = psi_vec(psi), psi_vec(psi + 90.0)
    pts = []
    for i in range(n):
        phi = 2 * math.pi * i / n
        r = ray_poly(hull, phi)
        dlt = abs(((math.degrees(phi) - 180.0) + 180) % 360 - 180)
        if dlt <= K["cw_half"]: rc = K["cw_r"]
        elif dlt < K["cw_half"] + K["cw_taper"]:
            s = (dlt - K["cw_half"]) / K["cw_taper"]; s = s * s * (3 - 2 * s)
            rc = K["cw_r"] - (K["cw_r"] - K["hub_r"]) * s
        else: rc = 0.0
        r = max(r, rc)
        pts.append(u * (r * math.cos(phi)) + v * (r * math.sin(phi)))
    return pts


def material(name, rgba, metal, rough):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True; m.diffuse_color = rgba
    bsdf = next((nd for nd in m.node_tree.nodes if nd.type == "BSDF_PRINCIPLED"), None)
    if bsdf:
        bsdf.inputs["Base Color"].default_value = rgba
        bsdf.inputs["Metallic"].default_value = metal
        bsdf.inputs["Roughness"].default_value = rough
    return m


# ---- build --------------------------------------------------------------------

def build_crank(root):
    tmp = coll("Crank_Pieces_tmp", root); tmp.hide_viewport = tmp.hide_render = True
    y_th0 = MAINS[4] - JL[4] / 2
    # Main journals (run .05 into the cheeks so the union is clean).
    for i, y in enumerate(MAINS):
        obj(f"main{i}", ycyl(K["main_d"] / 2, y - JL[i] / 2 - (0 if i == 4 else 0.05), y + JL[i] / 2 + (0 if i == 0 else 0.05), 96), tmp)
    # Throws: rod journal plus a cheek either side, each cheek between a main journal end and the pin end.
    for k, (psi, yp) in enumerate(zip(THROWS, PIN_Y)):
        c = psi_vec(psi, R)
        obj(f"pin{k}", ycyl(K["rod_d"] / 2, yp - K["pin_len"] / 2 - 0.05, yp + K["pin_len"] / 2 + 0.05, 96, c.x, c.z), tmp)
        sec = cheek_section(psi)
        y_front = MAINS[k] - JL[k] / 2;  y_rear = MAINS[k + 1] + JL[k + 1] / 2
        obj(f"cheekF{k}", prism([p + Vector((0, yp + K["pin_len"] / 2, 0)) for p in sec], Vector((0, 1, 0)), y_front - yp - K["pin_len"] / 2), tmp)
        obj(f"cheekR{k}", prism([p + Vector((0, y_rear, 0)) for p in sec], Vector((0, 1, 0)), yp - K["pin_len"] / 2 - y_rear), tmp)
    # Nose: sprocket seat, then balancer seat.
    y_n0 = MAINS[0] + JL[0] / 2
    obj("gear", ycyl(K["gear_d"] / 2, y_n0 - 0.05, K["gear_to"], 96), tmp)
    obj("snout", ycyl(K["snout_d"] / 2, K["gear_to"] - 0.05, K["snout_to"], 96), tmp)
    # Tail: thrust collar, then the seal flange.
    obj("collar", ycyl(K["collar_d"] / 2, K["flange_front"] - 0.05, y_th0 - 0.003 + 0.0, 96), tmp)
    obj("neck", ycyl(K["main_d"] / 2, y_th0 - 0.05, y_th0 + 0.05, 96), tmp)
    obj("flange", ycyl(K["flange_d"] / 2, K["flange_back"], K["flange_front"], 128), tmp)

    crank = tmp.objects["main0"]; tmp.objects.unlink(crank); root.objects.link(crank)
    crank.name = "Crankshaft"; crank.data.name = "Crankshaft"
    boolean(crank, "UNION", tmp); clear(tmp)

    # Holes: oil holes in each journal, keyway, balancer bolt, flywheel bolts, pilot bore.
    for i, y in enumerate(MAINS):
        d = psi_vec(THROWS[min(i, 3)] + 90.0)        # main oil hole a quarter turn off the nearest throw [est]
        obj("oh", cyl(d * (K["main_d"] / 2 + 0.1) + Vector((0, y, 0)), -d, K["oil_hole"] / 2, 0.8, 16), tmp)
    for k, (psi, yp) in enumerate(zip(THROWS, PIN_Y)):
        c = psi_vec(psi, R); d = psi_vec(psi - 30.0)  # rod oil hole 30 deg ahead of the throw, on the leading side [est]
        obj("oh", cyl(c + d * (K["rod_d"] / 2 + 0.1) + Vector((0, yp, 0)), -d, K["oil_hole"] / 2, 0.8, 16), tmp)
    kw = K["key_w"] / 2; top = K["gear_d"] / 2
    key = [Vector((-kw, K["key_from"], top - K["key_depth"])), Vector((kw, K["key_from"], top - K["key_depth"])),
           Vector((kw, K["key_from"], top + 0.2)), Vector((-kw, K["key_from"], top + 0.2))]
    obj("key", prism(key, Vector((0, 1, 0)), K["snout_to"] + 0.1 - K["key_from"]), tmp)
    obj("nose", ycyl(K["nose_bore"] / 2, K["snout_to"] - K["nose_bore_depth"], K["snout_to"] + 0.1, 32), tmp)
    for j in range(K["fw_bolt_n"]):
        a = 2 * math.pi * j / K["fw_bolt_n"] + math.pi / 6
        x, z = K["fw_bolt_circle"] / 2 * math.sin(a), K["fw_bolt_circle"] / 2 * math.cos(a)
        obj("fw", ycyl(K["fw_bolt_d"] / 2, K["flange_back"] - 0.1, K["flange_back"] + K["fw_bolt_depth"], 24, x, z), tmp)
    obj("pilot", ycyl(K["pilot_d"] / 2, K["flange_back"] - 0.1, K["flange_back"] + K["pilot_depth"], 48), tmp)
    boolean(crank, "DIFFERENCE", tmp); clear(tmp)
    bpy.data.collections.remove(tmp)

    # Finish: journals, seal flange, nose seats and the flywheel face ground; the rest as forged.
    forged = material("Crank_ForgedSteel", (0.30, 0.30, 0.31, 1), 0.9, 0.45)
    ground = material("Crank_GroundSteel", (0.80, 0.80, 0.82, 1), 1.0, 0.12)
    crank.data.materials.append(forged); crank.data.materials.append(ground)
    radii = [K["main_d"] / 2, K["flange_d"] / 2, K["gear_d"] / 2, K["snout_d"] / 2]
    pins = [(psi_vec(p, R), y) for p, y in zip(THROWS, PIN_Y)]
    n_g = 0
    for poly in crank.data.polygons:
        c, n = poly.center / IN, poly.normal
        g = False
        if abs(n.y) < 0.2:
            rr = math.hypot(c.x, c.z)
            if any(abs(rr - r) < 0.01 for r in radii): g = True
            for pc, yp in pins:
                if abs(c.y - yp) < K["pin_len"] / 2 + 0.01 and abs(math.hypot(c.x - pc.x, c.z - pc.z) - K["rod_d"] / 2) < 0.01: g = True
        elif n.y < -0.99 and abs(c.y - K["flange_back"]) < 0.01: g = True
        if g: poly.material_index = 1; n_g += 1
    crank.data.shade_smooth(); crank.data.set_sharp_from_angle(angle=math.radians(35))

    # Rotation: crank_deg drives rotation about Y (clockwise from the front = negative about +Y).
    crank["crank_deg"] = 0.0
    crank.id_properties_ui("crank_deg").update(min=-1e6, max=1e6, soft_min=0, soft_max=720,
                                               description="Crank angle, degrees clockwise from the front; 0 = cylinder 1 TDC firing")
    crank.rotation_mode = "XYZ"
    crank.driver_remove("rotation_euler", 1)
    fc = crank.driver_add("rotation_euler", 1); drv = fc.driver; drv.type = "SCRIPTED"
    var = drv.variables.new(); var.name = "deg"; var.type = "SINGLE_PROP"
    var.targets[0].id = crank; var.targets[0].data_path = '["crank_deg"]'
    drv.expression = "-deg * 0.017453292519943295"
    ad = crank.animation_data or crank.animation_data_create()
    for f, v in ((1, 0.0), (97, 720.0)):
        crank["crank_deg"] = v; crank.keyframe_insert('["crank_deg"]', frame=f)
    act = ad.action
    curves = act.fcurves if hasattr(act, "fcurves") else [c for l in act.layers for s in l.strips for b in s.channelbags for c in b.fcurves]
    for cv in curves:
        if cv.data_path == '["crank_deg"]':
            for kp in cv.keyframe_points: kp.interpolation = "LINEAR"
            if not any(m.type == "CYCLES" for m in cv.modifiers): cv.modifiers.new("CYCLES")
    crank["crank_deg"] = 0.0
    sc = bpy.context.scene
    sc.frame_start, sc.frame_end = 1, 96
    return crank, n_g


def build_bearings(root):
    bc = coll("Main_Bearings", root)
    mat = material("Bearing_Shell", (0.63, 0.61, 0.57, 1), 0.85, 0.35)
    ri = (K["main_d"] + K["oil_clear"]) / 2
    ro = BP["main_bore"] / 2 - 0.001          # a thou inside the saddle so the faces don't coincide
    out = []
    for i, y in enumerate(MAINS):
        thrust = i == 4
        hw = (WEBS[4] / 2) if thrust else K["brg_w"] / 2
        for upper in (True, False):
            if thrust:
                tf, fo = K["thrust_t"], K["thrust_od"] / 2
                prof = [(ri, y - hw - tf), (fo, y - hw - tf), (fo, y - hw), (ro, y - hw), (ro, y + hw),
                        (fo, y + hw), (fo, y + hw + tf), (ri, y + hw + tf)]
            else:
                prof = [(ri, y - hw), (ro, y - hw), (ro, y + hw), (ri, y + hw)]
            if upper:   # upper shells carry the oil groove (the feed comes down from the main gallery)
                g = K["groove_w"] / 2; rg = ri + K["groove_d"]
                prof = prof + [(ri, y + g), (rg, y + g), (rg, y - g), (ri, y - g)]
            o = obj(f"MainBearing_{i+1}_{'Upper' if upper else 'Lower'}", revolve_half(prof, upper, 64), bc)
            if upper:
                hole = obj("brg_hole", cyl(Vector((0, y, ri - 0.05)), Vector((0, 0, 1)), K["brg_hole"] / 2, ro - ri + 0.1, 20), bc)
                boolean(o, "DIFFERENCE", hole); bpy.data.objects.remove(hole)
            o.data.materials.append(mat); o.data.shade_smooth(); o.data.set_sharp_from_angle(angle=math.radians(35))
            out.append(o)
    return out


def clash_check(crank, steps=24):
    """Turn the crank a full revolution and test it against the block, caps,
    studs and bearings. Returns the angles and parts that touch."""
    dg = bpy.context.evaluated_depsgraph_get()
    others = [o for o in bpy.data.objects if o.type == "MESH" and o is not crank and o.visible_get()
              and (o.name.startswith(("Block", "MainCap", "MainStuds", "MainBearing")))]
    def tree(o):
        e = o.evaluated_get(dg); m = e.to_mesh()
        mw = o.matrix_world
        t = BVHTree.FromPolygons([mw @ v.co for v in m.vertices], [tuple(p.vertices) for p in m.polygons])
        e.to_mesh_clear(); return t
    fixed = {o.name: tree(o) for o in others}
    hits = []
    for s in range(steps):
        crank["crank_deg"] = 360.0 * s / steps
        crank.rotation_euler.y = -math.radians(crank["crank_deg"])
        bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get()
        t = tree(crank)
        for name, ft in fixed.items():
            if t.overlap(ft): hits.append((crank["crank_deg"], name))
    crank["crank_deg"] = 0.0; crank.rotation_euler.y = 0.0
    bpy.context.view_layer.update()
    return hits, [o.name for o in others]


def build():
    root = coll("BBC_Crank"); clear(root)
    crank, n_g = build_crank(root)
    brg = build_bearings(root)
    hits, against = clash_check(crank)
    info = dict(throws_psi_deg=THROWS, pin_y=PIN_Y, mains_y=MAINS, journal_len=JL,
                ground_faces=n_g, crank_tris=sum(len(p.vertices) - 2 for p in crank.data.polygons),
                crank_dims_in=[round(d / IN, 3) for d in crank.dimensions],
                bearings=len(brg), clash=hits, clash_checked_against=len(against))
    with open(os.path.join(HERE, "crank_info.json"), "w") as f: json.dump(dict(params=K, **info), f, indent=1)
    return info


if __name__ == "__main__" or "bpy" in globals():
    print(json.dumps(build(), default=str))
