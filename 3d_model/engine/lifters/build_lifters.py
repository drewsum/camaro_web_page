"""Hydraulic roller lifters and their guide plates for Drew's 540, built to
ride the cam from ../cam in the Gen VI block from ../block.

The lifters are OE-style Gen VI hydraulic rollers (no link bar): album photos
349-352 show each pair held square by a stainless dog-bone guide plate on the
lifter boss, with the long aluminium retainer (spider) over the guides.
    body .842" [spec], roller .750" [spec, as the cam's lobes are ground for],
    seat height 2.66" roller centre to pushrod seat [spec, COMP 850-16 class]
Everything else on the lifter is [est] (sizes in K below).

Motion: each lifter only slides along its bore. Its lift is not a formula: it
is read off the finished cam mesh by ../cam/build_cam.py's event_check (a
.375" roller pushed against the lobe vertices on the block's own lifter axis,
every 0.5 crank degree), then keyed as the lifter's location. The keys follow
the crank's timeline (frame = 1 + crank_deg / 7.5, frames 1-97 = 0-720 deg),
so the roller stays on the lobe while the crank turns. The rollers don't spin
(Drew: not needed).

Axes and units as the block: X passenger side, Y forward, Z up, origin on the
crank centreline at the rear face; inches. Run live in Blender after the cam:
    exec(open(r"C:/Users/drewm/Documents/scripts/camaro_webpage/3d_model/engine/lifters/build_lifters.py").read())
"""
import bpy, bmesh, json, math, os
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

HERE = (os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() and "lifters" in __file__
        else r"C:\Users\drewm\Documents\scripts\camaro_webpage\3d_model\engine\lifters")
CAM_PY = os.path.join(HERE, "..", "cam", "build_cam.py")
_src = open(CAM_PY).read(); _src = _src[:_src.index('if __name__ == "__main__"')]
CAMNS = {"__file__": CAM_PY, "__name__": "cam_lib"}
exec(_src, CAMNS)
IN, CAMZ, CK = CAMNS["IN"], CAMNS["CAMZ"], CAMNS["K"]
SIDE = CAMNS["SIDE"]

K = dict(
    body_d=0.837,       # [est] drawn .005" under the .842" body so it never touches the faceted bore mesh
    seat_h=2.66,        # [spec] roller centre to pushrod seat
    cup_depth=0.10,     # [est] seat cup below the lifter top
    cup_r=0.17,         # [est] cup sphere (5/16" pushrod ball)
    plunger_d=0.66, plunger_h=0.05,   # [est] pushrod-seat cap standing above the body
    body_bottom=-0.16,  # [est] yoke bottom, below the roller centre
    yoke_y=0.33, yoke_top=0.06,       # [est] yoke cheeks cut to .68" across the cam below s .06 (clears journal 4 beside lobe 7I)
    slot_w=0.38, slot_top=0.44,       # [est] yoke slot for the roller
    roller_d=CK["roller_r"] * 2, roller_w=0.36,   # .750" [spec]; width [derived]: the widest .750" wheel whose corners stay inside the .842" body
    axle_d=0.24,        # [est]
    flat_x=0.350,       # [est] two guide flats, .700" across
    oil_s=1.55, oil_w=0.12, oil_depth=0.02,       # [est] oil band
    guide_t=0.09,       # [est] stainless guide plate (photo 351)
    guide_r=0.62,       # [est] guide end radius
    guide_clear=0.006,  # [est] hole over the flats
    top_above_guide=0.10,   # [meas] photo 351: lifter tops stand about .10" above the guides on the base circle
)
BOSS_T = SIDE["valley"]["boss"]["top_t"]    # boss top, along each lifter axis (the block's top_t)


def frame3(r):
    """Lifter frame: Z along its axis, Y along the cam, X across the bank."""
    z = Vector((r["ax"][0], 0, r["ax"][1])); y = Vector((0, 1, 0)); x = y.cross(z)
    return Matrix((x, y, z)).transposed()

def centre(r, t):
    """Roller centre (inches) at distance t along the lifter axis."""
    w, a = r["w"], r["ax"]
    return Vector((r["e"] * w[0] + t * a[0], r["y"], CAMZ + r["e"] * w[1] + t * a[1]))


# ---- mesh helpers -----------------------------------------------------------------

coll, clear, obj, boolean, material = (CAMNS[k] for k in ("coll", "clear", "obj", "boolean", "material"))

def zcyl(r, s0, s1, seg=48, bm=None, x=0.0, y=0.0):
    bm = bm or bmesh.new()
    ring = [(x + r * math.cos(2 * math.pi * k / seg), y + r * math.sin(2 * math.pi * k / seg)) for k in range(seg)]
    return prism2(ring, s0, s1, bm)

def prism2(pts, s0, s1, bm=None):
    """Closed 2D outline (x, y) extruded along Z from s0 to s1 (inches)."""
    bm = bm or bmesh.new()
    a = [bm.verts.new(Vector((x, y, s0)) * IN) for x, y in pts]
    b = [bm.verts.new(Vector((x, y, s1)) * IN) for x, y in pts]
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n; bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(a[::-1]); bm.faces.new(b)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm

def ycyl_local(r, y0, y1, seg=48, bm=None):
    bm = bm or bmesh.new()
    ring = [(r * math.cos(2 * math.pi * k / seg), r * math.sin(2 * math.pi * k / seg)) for k in range(seg)]
    a = [bm.verts.new(Vector((x, y0, z)) * IN) for x, z in ring]
    b = [bm.verts.new(Vector((x, y1, z)) * IN) for x, z in ring]
    for i in range(seg):
        j = (i + 1) % seg; bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(a[::-1]); bm.faces.new(b)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm

def flatted_circle(r, fx, seg=96):
    """Circle of radius r with two flats at x = +/-fx."""
    pts = []
    for k in range(seg):
        a = 2 * math.pi * k / seg; x, y = r * math.cos(a), r * math.sin(a)
        if abs(x) > fx: x = math.copysign(fx, x)
        pts.append((x, y))
    return pts


# ---- parts ------------------------------------------------------------------------

def lifter_mesh(name, root, tmp):
    rb = K["body_d"] / 2; top = K["seat_h"] + K["cup_depth"]
    body_top = top - K["plunger_h"]
    s_flat = BOSS_T - (CK["base_r"] + CK["roller_r"]) - 0.37 - 0.05   # guide bottom in lifter terms at full lift, less .05
    o = obj(name, zcyl(rb, K["body_bottom"], s_flat, 64), root)
    obj("flat", prism2(flatted_circle(rb, K["flat_x"]), s_flat - 0.01, body_top), tmp)
    obj("cap", zcyl(K["plunger_d"] / 2, body_top - 0.01, top, 48), tmp)
    boolean(o, "UNION", tmp); clear(tmp)
    # Cuts: roller slot (across Y), seat cup, oil band.
    sw = K["slot_w"] / 2
    obj("slot", prism2([(-rb - 0.1, -sw), (rb + 0.1, -sw), (rb + 0.1, sw), (-rb - 0.1, sw)], K["body_bottom"] - 0.1, K["slot_top"]), tmp)
    yy = K["yoke_y"]
    for sg in (1, -1):
        obj("yoke", prism2([(-rb - 0.1, sg * yy), (rb + 0.1, sg * yy), (rb + 0.1, sg * (rb + 0.1)), (-rb - 0.1, sg * (rb + 0.1))][::sg], K["body_bottom"] - 0.1, K["yoke_top"]), tmp)
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=K["cup_r"] * IN)
    bmesh.ops.translate(bm, verts=bm.verts, vec=Vector((0, 0, (K["seat_h"] + K["cup_r"]) * IN)))
    obj("cup", bm, tmp)
    ring = zcyl(rb + 0.1, K["oil_s"] - K["oil_w"] / 2, K["oil_s"] + K["oil_w"] / 2, 64)
    obj("oilband", ring, tmp)
    boolean(o, "DIFFERENCE", tmp); clear(tmp)
    obj("oilcore", zcyl(rb - K["oil_depth"], K["oil_s"] - K["oil_w"] / 2 - 0.01, K["oil_s"] + K["oil_w"] / 2 + 0.01, 64), tmp)
    boolean(o, "UNION", tmp); clear(tmp)
    # Axle bore through the cheeks.
    obj("axlehole", ycyl_local(K["axle_d"] / 2 + 0.002, -rb - 0.1, rb + 0.1, 24), tmp)
    boolean(o, "DIFFERENCE", tmp); clear(tmp)
    return o, s_flat

def roller_mesh(name, root, tmp):
    rr = K["roller_d"] / 2; hw = K["roller_w"] / 2
    o = obj(name, ycyl_local(rr, -hw, hw, 64), root)
    # A shallow chamfer ring at each edge, and the axle through the cheeks.
    obj("axle", ycyl_local(K["axle_d"] / 2, -K["yoke_y"] + 0.005, K["yoke_y"] - 0.005, 24), tmp)
    boolean(o, "UNION", tmp); clear(tmp)
    return o

def guide_mesh(name, root, ra, rb_, frame_inv, t0):
    """Dog-bone guide plate square to the lifter axes, on the boss top.
    ra, rb_ are the two lifters' rows; outline and holes in the guide frame. Each
    hole is centred where its lifter's axis crosses the plate and cut along that axis."""
    tc = {}
    for r in (ra, rb_):                               # distance along the lifter axis to the plate's mid-plane
        a = frame_inv.to_3x3() @ Vector((r["ax"][0], 0, r["ax"][1])); o_ = frame_inv @ centre(r, 0.0)
        tc[id(r)] = (t0 + K["guide_t"] / 2 - o_.z) / a.z
    pa = frame_inv @ centre(ra, tc[id(ra)]); pb = frame_inv @ centre(rb_, tc[id(rb_)])
    pa, pb = (pa.x, pa.y), (pb.x, pb.y)
    R = K["guide_r"]
    d = Vector((pb[0] - pa[0], pb[1] - pa[1])); L = d.length; u = d / L; n = Vector((-u.y, u.x))
    pts = []
    for k in range(25):                               # end round about b
        a = -math.pi / 2 + math.pi * k / 24
        v = u * math.cos(a) + n * math.sin(a); pts.append((pb[0] + R * v.x, pb[1] + R * v.y))
    for k in range(25):                               # end round about a
        a = math.pi / 2 + math.pi * k / 24
        v = u * math.cos(a) + n * math.sin(a); pts.append((pa[0] + R * v.x, pa[1] + R * v.y))
    bm = prism2(pts, t0, t0 + K["guide_t"])
    o = obj(name, bm, root)
    tmp = coll("Lifter_tmp", root, hide=True)
    hole = flatted_circle(K["body_d"] / 2 + 0.01, K["flat_x"] + K["guide_clear"], 96)
    for r in (ra, rb_):
        bm = prism2(hole, -0.3, 0.3)
        M = frame_inv @ Matrix.Translation(centre(r, tc[id(r)])) @ frame3(r).to_4x4()
        bmesh.ops.transform(bm, matrix=Matrix.Scale(IN, 4) @ M @ Matrix.Scale(1 / IN, 4), verts=bm.verts)
        obj("hole", bm, tmp)
    boolean(o, "DIFFERENCE", tmp); clear(tmp); bpy.data.collections.remove(tmp)
    return o


def key_lift(o, r, degs, lift, t_base):
    """Keys the lifter's location along its axis: frame = 1 + crank_deg/7.5."""
    o.animation_data_clear()
    a = Vector((r["ax"][0], 0, r["ax"][1]))
    base = centre(r, t_base) * IN
    fr = list(1 + degs / 7.5) + [97.0]; li = list(lift) + [lift[0]]
    for f, l in zip(fr, li):
        o.location = base + a * (float(l) * IN)
        o.keyframe_insert("location", frame=float(f))
    for fc in o.animation_data.action.layers[0].strips[0].channelbag(o.animation_data.action_slot).fcurves:
        for kp in fc.keyframe_points: kp.interpolation = "LINEAR"
        fc.modifiers.new("CYCLES")


def build():
    root = coll("BBC_Lifters"); clear(root)
    tmp = coll("Lifter_tmp", root, hide=True)
    cam = bpy.data.objects["Camshaft"]
    rows = CAMNS["lobe_table"]()
    ev, degs, lifts = CAMNS["event_check"](cam, rows, step=0.5)
    body_m = material("Lifter_Body", (0.55, 0.55, 0.57, 1), 1.0, 0.25)
    roll_m = material("Lifter_Roller", (0.70, 0.70, 0.72, 1), 1.0, 0.15)
    guide_m = material("Lifter_GuideStainless", (0.80, 0.80, 0.78, 1), 1.0, 0.28)
    rr = CK["roller_r"]
    out = []
    for i, r in enumerate(rows):
        name = f"{r['cyl']}{r['valve']}"
        o, s_flat = lifter_mesh(f"Lifter_{name}", root, tmp)
        ro = roller_mesh(f"LifterRoller_{name}", root, tmp)
        for ob, m in ((o, body_m), (ro, roll_m)):
            ob.data.materials.append(m); ob.data.shade_smooth(); ob.data.set_sharp_from_angle(angle=math.radians(35))
        t_base = math.sqrt((CK["base_r"] + rr) ** 2 - r["e"] ** 2)
        F = frame3(r)
        o.rotation_mode = "QUATERNION"; o.rotation_quaternion = F.to_quaternion()
        o.location = centre(r, t_base) * IN
        ro.parent = o                                    # rides with its lifter, does not spin
        key_lift(o, r, degs, lifts[i], t_base)
        out.append(dict(lifter=o.name, cyl=r["cyl"], valve=r["valve"], y=r["y"], e=r["e"], t_base=round(t_base, 4),
                        lift_max=round(float(lifts[i].max()), 4), top_t_base=round(t_base + K["seat_h"] + K["cup_depth"], 4)))
    clear(tmp); bpy.data.collections.remove(tmp)
    # Guides: one per cylinder, on the boss top.
    by_cyl = {}
    for r in rows: by_cyl.setdefault(r["cyl"], []).append(r)
    guides = []
    for c, (ra, rb_) in sorted(by_cyl.items()):
        # The pair's two bores are 6.25 deg apart (38.75 / 45): the plate is square to their bisector, on the boss top.
        am = (Vector((ra["ax"][0], 0, ra["ax"][1])) + Vector((rb_["ax"][0], 0, rb_["ax"][1]))).normalized()
        half = Vector((ra["ax"][0], 0, ra["ax"][1])).angle(Vector((rb_["ax"][0], 0, rb_["ax"][1]))) / 2
        F = frame3(dict(ax=(am.x, am.z)))
        # Guide frame origin on the cam axis at the pair's mid y: lifter centres project onto (x, y), height = t.
        mid = (ra["y"] + rb_["y"]) / 2
        Fi4 = (Matrix.Translation(Vector((0, mid, CAMZ))) @ F.to_4x4()).inverted()
        g = guide_mesh(f"LifterGuide_{c}", root, ra, rb_, Fi4, BOSS_T * math.cos(half) + 0.002)
        g.matrix_world = Matrix.Translation(Vector((0, mid, CAMZ)) * IN) @ F.to_4x4()
        g.data.materials.append(guide_m); g.data.shade_smooth(); g.data.set_sharp_from_angle(angle=math.radians(35))
        guides.append(g)
    bpy.context.scene.frame_set(1)
    return rows, out, guides, degs, lifts


# ---- checks -------------------------------------------------------------------------

def checks(rows, degs_step=15.0):
    set_crank, mesh_world = CAMNS["set_crank"], CAMNS["mesh_world"]
    def tree(o):
        v, f = mesh_world(o); return BVHTree.FromPolygons([Vector(x) for x in v], f)
    mine = list(bpy.data.collections["BBC_Lifters"].objects)        # (the block's hidden bore cutters are also called Lifter_*)
    lifters = [o for o in mine if o.name.startswith("Lifter_")]
    rollers = [o for o in mine if o.name.startswith("LifterRoller_")]
    guides = [o for o in mine if o.name.startswith("LifterGuide_")]
    others = [n for n in ["Block", "Crankshaft", "CamThrustPlate", "TimingChain"] if n in bpy.data.objects]
    others += [o.name for o in bpy.data.objects if o.type == "MESH" and o.name.startswith(("ConRod_", "RodCap_", "RodBolt_", "Piston_", "MainCap_", "MainStuds_"))]
    hits = set()
    for d in np.arange(0, 720, degs_step):
        set_crank(float(d))
        T = {o.name: tree(o) for o in lifters + rollers}
        fixed = {n: tree(bpy.data.objects[n]) for n in others + [g.name for g in guides] + ["Camshaft"]}
        for o in lifters + rollers:
            for n, ft in fixed.items():
                if n == "Camshaft" and o.name.startswith("LifterRoller_"): continue     # the roller rides the lobe
                if T[o.name].overlap(ft): hits.add((o.name, n))
            for o2 in lifters + rollers:
                if o2.name > o.name and o2.parent != o and o.parent != o2 and T[o.name].overlap(T[o2.name]): hits.add((o.name, o2.name))
    # Roller on the lobe: penetration / gap of the roller mesh against the cam, every 5 deg.
    worst_pen, worst_gap = 0.0, 0.0
    cam = bpy.data.objects["Camshaft"]
    for d in np.arange(0, 720, 5.0):
        set_crank(float(d))
        vc, fc_ = mesh_world(cam); tc = BVHTree.FromPolygons([Vector(x) for x in vc], fc_)
        for ro in rollers:
            v, _ = mesh_world(ro)
            dmin = min(tc.find_nearest(Vector(x), 1.0)[3] or 1.0 for x in v)
            worst_gap = max(worst_gap, dmin)
        hits_cam = [ro.name for ro in rollers if tree(ro).overlap(tc)]
        if hits_cam: worst_pen = max(worst_pen, len(hits_cam))
    set_crank(0.0)
    return dict(clash=sorted(hits), roller_max_gap_to_lobe_in=round(worst_gap, 4), max_rollers_in_contact_with_lobes=worst_pen)


if __name__ == "__main__" or "bpy" in globals():
    rows, out, guides, degs, lifts = build()
    res = checks(rows, degs_step=5.0)
    info = dict(params=K, boss_top_t=BOSS_T, lifters=out, checks=res)
    with open(os.path.join(HERE, "lifter_info.json"), "w") as f: json.dump(info, f, indent=1, default=float)
    print(json.dumps(dict(checks=res, first=out[:2]), default=float))
