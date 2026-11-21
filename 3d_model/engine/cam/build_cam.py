"""Camshaft, thrust plate and double-roller timing set for Drew's 540, built
to sit in the Gen VI block from ../block and turn with the crank from ../crank.

Cam card (Drew's album photos 212 and 348): COMP Cams 01-000-13, grind
"3018B/13145B R 110 + 4", hydraulic roller, 0 lash.
    gross valve lift          .622 / .619      (1.7 rockers)
    duration at .006 tappet   292 / 302
    duration at .050          242 / 250
    lobe lift                 .366 / .364
    lobe separation           110, installed at 106 intake centreline
    events at .050            IO 15 BTDC, IC 47 ABDC, EO 58.8 BBDC, EC 11.2 ATDC
COMP's master lobe catalogue adds the .200" durations (165 / 171) and the
tappet lift at TDC with the lobes straight up on 110 (.087 / .102). The lift
curve passes through all of those points.

Timing: crank_deg (on Crankshaft) is the only input. 0 = cylinder 1 at TDC
firing, positive turns clockwise from the front. The cam turns the same way
at half speed (rotation_euler.y = -crank_deg / 2). The chain is a geometry-
nodes object that advances by the crank's pitch-line speed, so the rollers
stay in the sprocket teeth of both sprockets.

Lobe phasing is worked out, not typed in: for each cylinder c the card's
centrelines give the crank angle of peak lift (firing TDC + 360 + 106 for the
intake, firing TDC + 360 - 113.8 for the exhaust), and the lobe is ground so
its follower (on the block's own lifter axis, including the .11" lifter
offset) is at peak lift at exactly that crank angle. Each lobe is then checked
from the finished mesh: the script turns the crank, finds the roller lift on
every lifter axis and compares the events to the card (cam_info.json).

Axes and units as the block: X passenger side, Y forward, Z up, origin on the
crank centreline at the rear face; inches. Tags: [spec] card or published,
[meas] from Drew's photos, [derived], [est]. Sources in PARTS.md.

Run live in Blender after the block, crank and rods:
    exec(open(r"C:/Users/drewm/Documents/scripts/camaro_webpage/3d_model/engine/cam/build_cam.py").read())
"""
import bpy, bmesh, json, math, os
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

HERE = (os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals()
        else r"C:\Users\drewm\Documents\scripts\camaro_webpage\3d_model\engine\cam")
IN = 0.0254
ENG = os.path.join(HERE, "..")
BLK = json.load(open(os.path.join(ENG, "block", "block_info.json")))
SIDE = json.load(open(os.path.join(ENG, "block", "refs", "sides.json")))
CRK = json.load(open(os.path.join(ENG, "crank", "crank_info.json")))
BP, MAINS = BLK["params"], BLK["mains_y"]
LF = SIDE["lifters"]
CAMZ = BP["cam_cd"]

CARD = dict(
    part="01-000-13", grind="3018B/13145B R 110 + 4", rocker=1.7, icl=106.0,
    I=dict(lift=0.366, valve=0.622, d006=292.0, d050=242.0, d200=165.0, tdc_check=(0.087, 110.0),
           open050=-15.0, close050=180 + 47.0),            # crank deg from TDC overlap: IO 15 BTDC, IC 47 ABDC
    E=dict(lift=0.364, valve=0.619, d006=302.0, d050=250.0, d200=171.0, tdc_check=(0.102, 110.0),
           open050=-180 - 58.8, close050=11.2),             # EO 58.8 BBDC, EC 11.2 ATDC
)
CARD["I"]["cl"] = (CARD["I"]["open050"] + CARD["I"]["close050"]) / 2     # 106.0 ATDC
CARD["E"]["cl"] = (CARD["E"]["open050"] + CARD["E"]["close050"]) / 2     # -113.8 (BTDC)
assert abs(CARD["I"]["cl"] - CARD["icl"]) < 1e-9
assert abs(CARD["I"]["close050"] - CARD["I"]["open050"] - CARD["I"]["d050"]) < 1e-9
assert abs(CARD["E"]["close050"] - CARD["E"]["open050"] - CARD["E"]["d050"]) < 1e-9
assert abs((CARD["I"]["cl"] - CARD["E"]["cl"]) / 2 - 110.0) < 0.15        # LSA 109.9 from the events, 110 on the card

K = dict(
    base_r=0.585,         # [est] base-circle radius (1.170"): the nose (.951") passes the 1.949" bearings with .02"
    roller_r=0.375,       # [spec] standard .750" roller wheel (COMP lobe catalogue, unsuffixed lobes)
    lobe_w=0.58,          # [est] lobe width
    lobe_ch=0.025,        # [est] lobe edge chamfer
    core_r=0.55,          # [est] shaft between the lobes (inside the base circle)
    journal_d=1.949,      # [meas] build sheet
    journal_w=0.80,       # [est]
    cam_rear=2.30,        # [est] cam tail, flush with the rear china wall's inner face
    nose_step_d=1.75,     # [est] Gen VI step nose through the thrust plate (photo 322)
    plate_t=0.17,         # [est] thrust plate
    chest_floor=BP["y_front"] - 0.85,   # the block's timing-chest floor (front_face.json recess .85")
    endplay=0.005,        # [est]
    cam_bolt_r=0.55, cam_bolt_hex=0.50, cam_bolt_h=0.22,   # [meas] photo 321 for the bolt circle; 5/16 bolts, 1/2 hex [est]
    dowel_d=0.25, dowel_r=0.56,                            # [meas] photo 321/322 position, size [est]
    dist_y=SIDE["distributor"]["y"],                       # [meas] 3.70
    dgear_teeth=13, dgear_od=1.78, dgear_root=1.50, dgear_w=0.55, dgear_helix=45.0,   # [est]
    # Timing set: 3/8" pitch double roller, 50T cam / 25T crank, 66-link chain (BBC)
    pitch=0.375, z_cam=50, z_crank=25, links=66,            # [spec] 3/8" pitch; 66 links (Cloyes BBC chain); 50/25 [derived] from 66 links at the 5.147" centres, matches photo 321
    roller_d=0.250, roller_l=0.19, pin_d=0.141,             # [spec] .250" rollers; widths [est]
    plate_th=0.045, plate_h=0.34, row_pitch=0.40,           # [est]
    chain_y=23.85,        # [est] chain centre plane: crank seat ends at y 24.30 (crank PARTS.md)
    cam_spr_back=0.0,     # set from the nose below
    spr_w=0.90,           # [est] sprocket thickness
    holes_n=10, holes_r=1.78, holes_d=0.60,                 # [meas] photo 321 (10 lightening holes)
    keyways=9,            # [meas] photo 322: 0, A2-A8, R2-R8
)
P = K["pitch"]
FIRING = [1, 8, 4, 3, 6, 5, 7, 2]
FIRE_DEG = {c: 90.0 * i for i, c in enumerate(FIRING)}      # crank_deg at each cylinder's firing TDC


# ---- lift curve (pure numpy: natural cubic through the card points) ------------

def clamped_spline(x, y, s0, s1):
    """Cubic spline with end slopes s0, s1. Returns f(xq)."""
    n = len(x); h = np.diff(x)
    A = np.zeros((n, n)); b = np.zeros(n)
    A[0, 0], A[0, 1] = 2 * h[0], h[0]; b[0] = 6 * ((y[1] - y[0]) / h[0] - s0)
    A[-1, -2], A[-1, -1] = h[-1], 2 * h[-1]; b[-1] = 6 * (s1 - (y[-1] - y[-2]) / h[-1])
    for i in range(1, n - 1):
        A[i, i - 1], A[i, i], A[i, i + 1] = h[i - 1], 2 * (h[i - 1] + h[i]), h[i]
        b[i] = 6 * ((y[i + 1] - y[i]) / h[i] - (y[i] - y[i - 1]) / h[i - 1])
    M = np.linalg.solve(A, b)
    def f(xq, d=0):
        xq = np.asarray(xq, float); i = np.clip(np.searchsorted(x, xq) - 1, 0, n - 2)
        t0, t1 = x[i], x[i + 1]; hh = t1 - t0; a = (t1 - xq) / hh; bb = (xq - t0) / hh
        if d == 0:
            return a * y[i] + bb * y[i + 1] + ((a ** 3 - a) * M[i] + (bb ** 3 - bb) * M[i + 1]) * hh * hh / 6
        return (y[i + 1] - y[i]) / hh + (-(3 * a * a - 1) * M[i] + (3 * bb * bb - 1) * M[i + 1]) * hh / 6
    return f

def lift_curve(c, ramp=7.0):
    """Tappet lift (in) against cam degrees from the nose. Symmetric; passes
    through lobe lift at 0, .200/.050/.006 at the card's half durations and the
    catalogue's TDC lift; a cubic seat ramp closes 7 cam degrees past .006."""
    a6 = c["d006"] / 4; end = a6 + ramp
    x = np.array([0, c["d200"] / 4, c["tdc_check"][1] / 2, c["d050"] / 4, a6])
    y = np.array([c["lift"], 0.200, c["tdc_check"][0], 0.050, 0.006])
    o = np.argsort(x); x, y = x[o], y[o]
    X = np.r_[-x[:0:-1], x, end]; Y = np.r_[y[:0:-1], y, 0.0]
    f = clamped_spline(np.r_[-end, X], np.r_[0.0, Y], 0.0, 0.0)
    s6 = float(f(a6, 1)); d = end - a6
    a, b = np.linalg.solve(np.array([[1, 1], [2, 3]]), np.array([-0.006 - s6 * d, -s6 * d]))
    def h(phi):
        ph = np.abs((np.asarray(phi, float) + 180) % 360 - 180)
        t = np.clip((ph - a6) / d, 0, 1); tail = 0.006 + s6 * d * t + a * t * t + b * t ** 3
        return np.where(ph >= end, 0.0, np.where(ph > a6, tail, f(np.minimum(ph, a6))))
    return h, end

LIFT = {v: lift_curve(CARD[v]) for v in ("I", "E")}


# ---- lobe table -----------------------------------------------------------------

def lifter_axes():
    """Lifter axis, offset and y for every lobe, from the block's own rules
    (sides.json: tilt through the cam centre, forward bore of each pair .11"
    outboard, rear .11" inboard)."""
    th = math.radians(LF["tilt_deg"]); po = LF["pair_offset"] / 2
    out = []
    for bank, sg, cyls in (("L", -1, (1, 3, 5, 7)), ("R", 1, (2, 4, 6, 8))):
        ax = (sg * math.sin(th), math.cos(th))                     # (x, z)
        w = (sg * math.cos(th), -math.sin(th))                     # out_dir: across the bank, outboard
        for k, cyl in enumerate(cyls):
            yF, yR = LF["y"][bank][k]
            front_is_exh = k in (0, 2)                             # E-I-I-E heads: 1,2,5,6 exhaust in front
            for yy, sgn in ((yF, 1), (yR, -1)):
                valve = ("E" if front_is_exh else "I") if sgn > 0 else ("I" if front_is_exh else "E")
                out.append(dict(cyl=cyl, bank=bank, valve=valve, y=yy, ax=ax, w=w, e=sgn * po))
    out.sort(key=lambda d: -d["y"])
    return out

def lobe_table():
    rows = []
    for L in lifter_axes():
        c = CARD[L["valve"]]
        peak = (FIRE_DEG[L["cyl"]] + 360.0 + c["cl"]) % 720.0
        alpha = math.degrees(math.atan2(L["ax"][0], L["ax"][1]))   # psi of the lifter axis
        rows.append(dict(L, peak_crank=peak, alpha=alpha))
    # Lobe order front to rear must be 1E 2E 1I 2I 3I 4I 3E 4E 5E 6E 5I 6I 7I 8I 7E 8E (Chevy V8).
    order = "".join(f"{r['cyl']}{r['valve']}" for r in rows)
    assert order == "1E2E1I2I3I4I3E4E5E6E5I6I7I8I7E8E", order
    return rows


def pitch_and_profile(row, n=1440):
    """Cam-frame pitch curve and cam profile (x, z about the cam axis, at
    crank_deg 0) for one lobe, by kinematic inversion: the roller centre on
    the offset lifter axis at t0 + h(phi) is rotated back into the cam frame."""
    h, _ = LIFT[row["valve"]]
    rb, rr = K["base_r"], K["roller_r"]
    e = row["e"]; ax = np.array(row["ax"]); w = np.array(row["w"])
    t0 = math.sqrt((rb + rr) ** 2 - e * e)
    phi = np.linspace(-180.0, 180.0, n, endpoint=False)            # cam deg after peak
    t = t0 + h(phi)
    W = e * w[None, :] + t[:, None] * ax[None, :]                  # world (x, z) of the roller centre
    psi_w = np.arctan2(W[:, 0], W[:, 1]); rad = np.hypot(W[:, 0], W[:, 1])
    psi_c = psi_w + np.radians(row["peak_crank"] / 2 + phi)        # local = world shifted by +crank/2
    pc = np.stack([rad * np.sin(psi_c), rad * np.cos(psi_c)], 1)
    # Inward offset by the roller radius: normal of the pitch curve, pointing to the axis side.
    d = np.roll(pc, -1, 0) - np.roll(pc, 1, 0); d /= np.linalg.norm(d, axis=1)[:, None]
    nrm = np.stack([d[:, 1], -d[:, 0]], 1)
    if np.mean(np.sum(nrm * pc, 1)) > 0: nrm = -nrm                # make it point inwards
    prof = pc + rr * nrm
    return pc, prof


# ---- mesh helpers (same as the crank's) -----------------------------------------

def coll(name, parent=None, hide=False):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    par = parent or bpy.context.scene.collection
    if c.name not in par.children: par.children.link(c)
    c.hide_viewport = c.hide_render = hide
    return c

def clear(c):
    for ch in list(c.children): clear(ch); bpy.data.collections.remove(ch)
    for o in list(c.objects): bpy.data.objects.remove(o, do_unlink=True)

def obj(name, bm, c):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); c.objects.link(o)
    return o

def loft(rings, bm=None, cap=True):
    """Closed rings of Vectors (inches), same count, joined in order; caps at both ends."""
    bm = bm or bmesh.new()
    vs = [[bm.verts.new(p * IN) for p in r] for r in rings]
    n = len(rings[0])
    for a, b in zip(vs, vs[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if cap: bm.faces.new(vs[0][::-1]); bm.faces.new(vs[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm

def ysec(pts2, y):
    """(x, z) pairs to Vectors at y."""
    return [Vector((float(x), y, float(z))) for x, z in pts2]

def disc_pts(r, seg, cx=0.0, cz=0.0, phase=0.0):
    return [(cx + r * math.sin(phase + 2 * math.pi * k / seg), cz + r * math.cos(phase + 2 * math.pi * k / seg)) for k in range(seg)]

def ycyl(r, y0, y1, seg=64, x=0.0, z=0.0, bm=None):
    return loft([ysec(disc_pts(r, seg, x, z), y0), ysec(disc_pts(r, seg, x, z), y1)], bm)

def cyl_axis(c, axis, r, length, seg=24, bm=None):
    axis = axis.normalized(); ref = Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))
    e1 = axis.cross(ref).normalized(); e2 = axis.cross(e1)
    ring = [c + (e1 * math.cos(2 * math.pi * k / seg) + e2 * math.sin(2 * math.pi * k / seg)) * r for k in range(seg)]
    return loft([ring, [p + axis * length for p in ring]], bm)

def hexagon(af, cx, cz, phase=0.0):
    r = af / 2 / math.cos(math.pi / 6)
    return disc_pts(r, 6, cx, cz, phase + math.pi / 6)

def boolean(target, kind, operand):
    m = target.modifiers.new(kind, "BOOLEAN"); m.operation = kind; m.solver = "MANIFOLD"
    if isinstance(operand, bpy.types.Collection): m.operand_type = "COLLECTION"; m.collection = operand
    else: m.object = operand
    with bpy.context.temp_override(object=target, active_object=target):
        bpy.ops.object.modifier_apply(modifier=m.name)

def material(name, rgba, metal, rough):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True; m.diffuse_color = rgba
    bsdf = next((nd for nd in m.node_tree.nodes if nd.type == "BSDF_PRINCIPLED"), None)
    if bsdf:
        bsdf.inputs["Base Color"].default_value = rgba
        bsdf.inputs["Metallic"].default_value = metal
        bsdf.inputs["Roughness"].default_value = rough
    return m

def finish(o, mat, sharp=35):
    o.data.materials.append(mat); o.data.shade_smooth(); o.data.set_sharp_from_angle(angle=math.radians(sharp))

def to_local_z(o, z):
    """Meshes are built about the cam axis at z = CAMZ; move the data so the
    object origin sits on that axis."""
    o.data.transform(Matrix.Translation((0, 0, -z * IN))); o.location = (0, 0, z * IN)


# ---- sprocket tooth profile --------------------------------------------------------

def sprocket_profile(z, r_seat_c, r_tip, phase, n_per=24):
    """Polar outline of a roller-chain sprocket: z circular seats of radius
    roller/2 + .004 centred on r_seat_c (where the chain's pins run), straight-
    ish flanks to a rounded tip. phase = psi of a seat centre."""
    rs = K["roller_d"] / 2 + 0.004
    pa = 2 * math.pi / z
    pts = []
    for i in range(z):
        for j in range(n_per):
            d = (j / n_per - 0.5) * pa                            # -half pitch .. +half pitch, seat at 0
            s = r_seat_c * math.sin(d)
            if abs(s) < rs:
                r = r_seat_c * math.cos(d) - math.sqrt(rs * rs - s * s)   # circular seat
            else:
                r = r_seat_c * math.cos(d) + (abs(s) - rs) * 1.7          # flank, straight to the tip
            psi = phase + i * pa + d
            pts.append((r * math.sin(psi), r * math.cos(psi)))
    # round the tips: clamp to the tip circle
    out = []
    for x, zz in pts:
        r = math.hypot(x, zz)
        if r > r_tip: x, zz = x * r_tip / r, zz * r_tip / r
        out.append((x, zz))
    return out


# ---- chain path -----------------------------------------------------------------

def chain_path():
    """Pitch-line path of the chain round the two sprockets, clockwise from the
    front (psi decreasing), starting at the top of the cam sprocket. Radii are
    the sprockets' 'effective' pitch radii z*p/2pi scaled by k so the path is
    exactly 66 pitches at the block's 5.147" centres; then the chain speed that
    matches the crank teeth also matches the cam teeth (the cam turns at half
    speed on twice the radius)."""
    C = CAMZ
    R1e, R2e = K["z_cam"] * P / (2 * math.pi), K["z_crank"] * P / (2 * math.pi)
    def length(k):
        R1, R2 = k * R1e, k * R2e
        b = math.asin((R1 - R2) / C)
        return 2 * math.sqrt(C * C - (R1 - R2) ** 2) + R1 * (math.pi + 2 * b) + R2 * (math.pi - 2 * b)
    lo, hi = 0.9, 1.1
    for _ in range(80):
        mid = (lo + hi) / 2
        if length(mid) > K["links"] * P: hi = mid
        else: lo = mid
    k = (lo + hi) / 2; R1, R2 = k * R1e, k * R2e
    psn = math.acos(-(R1 - R2) / C)            # tangent-point psi (~106.6 deg), + passenger side
    def arc(cx, cz, R, a0, a1, step):
        n = max(2, int(abs(a1 - a0) / step) + 1)
        return [(cx + R * math.sin(a0 + (a1 - a0) * i / (n - 1)), cz + R * math.cos(a0 + (a1 - a0) * i / (n - 1))) for i in range(n)]
    st = math.radians(0.25)
    pts = arc(0, C, R1, 0.0, -psn, st)                         # over the top, towards the driver side
    pts += arc(0, 0, R2, -psn, -(2 * math.pi - psn), st)       # down the driver side, round under the crank
    pts += arc(0, C, R1, psn, 0.0, st)                         # up the passenger side, back to the top
    clean = [pts[0]]
    for p_ in pts[1:]:
        if math.hypot(p_[0] - clean[-1][0], p_[1] - clean[-1][1]) > 1e-6: clean.append(p_)
    if math.hypot(clean[-1][0] - clean[0][0], clean[-1][1] - clean[0][1]) < 1e-6: clean.pop()
    return dict(k=k, R_cam=R1, R_crank=R2, psi_tangent=math.degrees(psn), pts=clean, L=length(k))

def path_point(path, s):
    """Point at arc length s along the path polyline (for phasing the teeth)."""
    pts = path["pts"]; n = len(pts); acc = 0.0; s = s % path["L"]
    for i in range(n):
        a, b = pts[i], pts[(i + 1) % n]; l = math.hypot(b[0] - a[0], b[1] - a[1])
        if acc + l >= s:
            t = (s - acc) / l; return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
        acc += l
    return pts[0]


# ---- build ----------------------------------------------------------------------

def build_cam(root, lib, rows):
    tmp = coll("Cam_Pieces_tmp", root, hide=True)
    nose_front = K["chest_floor"] + K["plate_t"] + K["endplay"] + 0.02
    K["cam_spr_back"] = nose_front
    j_y = list(MAINS)
    # Core, journals (journal 1 runs forward to the chest floor), step nose.
    obj("core", ycyl(K["core_r"], K["cam_rear"], j_y[0], 48), tmp)
    for i, y in enumerate(j_y):
        y0, y1 = y - K["journal_w"] / 2, y + K["journal_w"] / 2
        if i == 0: y1 = K["chest_floor"] - K["endplay"]            # shoulder just behind the plate
        if i == 4: y0 = K["cam_rear"]
        obj(f"journal{i+1}", ycyl(K["journal_d"] / 2, y0, y1, 96), tmp)
    obj("nose", ycyl(K["nose_step_d"] / 2, K["chest_floor"] - K["endplay"] - 0.05, nose_front, 96), tmp)
    # Distributor drive gear: 13 helical teeth, twisted along the cam axis.
    zt, ro, rt = K["dgear_teeth"], K["dgear_od"] / 2, K["dgear_root"] / 2
    rp = (ro + rt) / 2; tw = K["dgear_w"] * math.tan(math.radians(K["dgear_helix"])) / rp
    rings = []
    for s in range(9):
        y = K["dist_y"] - K["dgear_w"] / 2 + K["dgear_w"] * s / 8; ph = tw * (s / 8 - 0.5)
        ring = []
        for i in range(zt * 8):
            a = 2 * math.pi * i / (zt * 8); u = (i % 8) / 8
            r = rt + (ro - rt) * (1 if 0.2 <= u <= 0.55 else (u / 0.2 if u < 0.2 else max(0.0, (0.75 - u) / 0.2)))
            ring.append((r * math.sin(a + ph), r * math.cos(a + ph)))
        rings.append(ysec(ring, y))
    obj("dgear", loft(rings), tmp)
    # Lobes.
    lobes = []
    for r in rows:
        _, prof = pitch_and_profile(r)
        prof = prof[::3]                                             # 480 points
        cx = prof - prof.mean(0) * 0                                 # about the cam axis
        rad = np.hypot(prof[:, 0], prof[:, 1])
        inset = prof * ((rad - K["lobe_ch"]) / rad)[:, None]
        y0, y1, ch = r["y"] - K["lobe_w"] / 2, r["y"] + K["lobe_w"] / 2, K["lobe_ch"]
        o = obj(f"lobe_{r['cyl']}{r['valve']}", loft([ysec(inset, y0), ysec(prof, y0 + ch), ysec(prof, y1 - ch), ysec(inset, y1)]), tmp)
        lobes.append(o)
    cam = obj("Camshaft", ycyl(K["journal_d"] / 2 - 0.3, j_y[2] - 0.1, j_y[2] + 0.1, 16), root)
    boolean(cam, "UNION", tmp); clear(tmp)
    # Nose face: three tapped holes, oil hole.
    for k_, a in enumerate((150.0, 270.0, 30.0)):
        x, z = K["cam_bolt_r"] * math.sin(math.radians(a)), K["cam_bolt_r"] * math.cos(math.radians(a))
        obj("tap", ycyl(0.135, nose_front - 0.75, nose_front + 0.05, 16, x, z), tmp)
    xd, zd = K["dowel_r"] * math.sin(math.radians(90)), K["dowel_r"] * math.cos(math.radians(90))
    obj("dowelhole", ycyl(K["dowel_d"] / 2 + 0.001, nose_front - 0.35, nose_front + 0.05, 16, xd, zd), tmp)
    obj("oil", ycyl(0.17, nose_front - 0.6, nose_front + 0.05, 24), tmp)
    obj("rearbore", ycyl(0.35, K["cam_rear"] - 0.05, K["cam_rear"] + 0.5, 24), tmp)
    boolean(cam, "DIFFERENCE", tmp); clear(tmp); bpy.data.collections.remove(tmp)
    cam.data.transform(Matrix.Translation((0, 0, CAMZ * IN)))
    to_local_z(cam, CAMZ)
    # Materials: ground journals and lobe faces, the rest as-machined steel; dark oxide gear.
    ground = material("Cam_GroundSteel", (0.78, 0.78, 0.80, 1), 1.0, 0.14)
    body = material("Cam_Steel", (0.36, 0.36, 0.38, 1), 0.9, 0.35)
    cam.data.materials.append(body); cam.data.materials.append(ground)
    for poly in cam.data.polygons:
        c, n = poly.center / IN, poly.normal
        if abs(n.y) < 0.3:
            rr_ = math.hypot(c.x, c.z)
            if abs(rr_ - K["journal_d"] / 2) < 0.01 or any(abs(c.y - r["y"]) < K["lobe_w"] / 2 - K["lobe_ch"] for r in rows) and rr_ > K["base_r"] - 0.02:
                poly.material_index = 1
    cam.data.shade_smooth(); cam.data.set_sharp_from_angle(angle=math.radians(30))
    # Dowel pin (in the nose, into the sprocket).
    dow = obj("CamDowel", ycyl(K["dowel_d"] / 2, nose_front - 0.30, nose_front + 0.40, 20, xd, zd + CAMZ), root)
    to_local_z(dow, CAMZ); finish(dow, ground)
    return cam, dow, nose_front


def build_thrust_plate(root):
    """Gen VI cam retainer (photo 322): plate on the chest floor round the step
    nose, two Torx screws in the block's cam-plate holes (z 6.74, 3.44), relieved
    round the two lifter-gallery plugs and the main-gallery plug."""
    ff = json.load(open(os.path.join(ENG, "block", "refs", "front_face.json")))
    y0 = K["chest_floor"]; y1 = y0 + K["plate_t"]
    bolts = [(0.0, 6.74), (0.0, 3.44)]
    plugs = [(1.22, 6.46), (-1.22, 6.46), (-1.53, 5.57)]
    circles = [(0.0, CAMZ, 1.28)] + [(x, z, 0.36) for x, z in bolts] + [(x, z, 0.42) for x, z in plugs]
    # Outline: radial max over the circles, then a light smoothing.
    n = 360; outline = []
    for i in range(n):
        a = 2 * math.pi * i / n; d = (math.sin(a), math.cos(a)); best = 0.0
        for cx, cz, r in circles:
            px, pz = cx, cz - CAMZ; b_ = px * d[0] + pz * d[1]; cc = px * px + pz * pz - r * r
            disc = b_ * b_ - cc
            if disc >= 0: best = max(best, b_ + math.sqrt(disc))
        outline.append(best)
    sm = [sum(outline[(i + j) % n] for j in range(-4, 5)) / 9 for i in range(n)]
    pts = [(r * math.sin(2 * math.pi * i / n), r * math.cos(2 * math.pi * i / n) + CAMZ) for i, r in enumerate(sm)]
    plate = obj("CamThrustPlate", loft([ysec(pts, y0 + 0.001), ysec(pts, y1)]), root)
    tmp = coll("Plate_tmp", root, hide=True)
    obj("bore", ycyl(K["nose_step_d"] / 2 + 0.003, y0 - 0.1, y1 + 0.1, 96, 0, CAMZ), tmp)
    for x, z in bolts:
        obj("bh", ycyl(0.165, y0 - 0.1, y1 + 0.1, 24, x, z), tmp)
        obj("csk", loft([ysec(disc_pts(0.165, 32, x, z), y1 - 0.10), ysec(disc_pts(0.27, 32, x, z), y1 + 0.001), ysec(disc_pts(0.27, 32, x, z), y1 + 0.1)]), tmp)
    for x, z in plugs: obj("ph", ycyl(0.30, y0 - 0.1, y1 + 0.1, 32, x, z), tmp)
    boolean(plate, "DIFFERENCE", tmp); clear(tmp); bpy.data.collections.remove(tmp)
    finish(plate, material("Cam_PlateSteel", (0.42, 0.42, 0.43, 1), 0.85, 0.4))
    # Torx flat-head screws, countersunk flush (they sit behind the cam sprocket).
    screws = bmesh.new()
    for x, z in bolts:
        loft([ysec(disc_pts(0.155, 24, x, z), y0 - 0.45), ysec(disc_pts(0.155, 24, x, z), y1 - 0.105),
              ysec(disc_pts(0.262, 32, x, z), y1 - 0.008)], screws)
    so = obj("CamPlateScrews", screws, root)
    finish(so, material("Cam_BlackOxide", (0.05, 0.05, 0.055, 1), 0.7, 0.45))
    return plate, so


def build_cam_sprocket(root, path, nose_front):
    y0 = nose_front; y1 = y0 + K["spr_w"]; yc = K["chain_y"]; rp = K["row_pitch"] / 2
    R = path["R_cam"]; tip = R + 0.17; root_r = R - K["roller_d"] / 2
    rows_y = [(yc - rp - K["roller_l"] / 2 - 0.0, yc - rp + K["roller_l"] / 2), (yc + rp - K["roller_l"] / 2, yc + rp + K["roller_l"] / 2)]
    phase = 0.0                                                    # pin 0 sits at psi 0 at crank_deg 0
    prof = sprocket_profile(K["z_cam"], R, tip, phase)
    web_r = R - 0.30                                               # clear of the chain plates
    tmp = coll("Spr_tmp", root, hide=True)
    # body web (clear of the chain plates), two tooth rows, the ring between them, raised front hub
    spr = obj("CamSprocket", loft([ysec(disc_pts(web_r, 200), y0), ysec(disc_pts(web_r, 200), y1)]), root)
    for a, b in rows_y:
        obj("row", loft([ysec(prof, a), ysec(prof, b)]), tmp)
    obj("mid", loft([ysec(disc_pts(R - 0.24, 200), rows_y[0][1] - 0.01), ysec(disc_pts(R - 0.24, 200), rows_y[1][0] + 0.01)]), tmp)
    obj("hub", ycyl(1.02, y1 - 0.05, y1 + 0.04, 96), tmp)
    boolean(spr, "UNION", tmp); clear(tmp)
    for i in range(K["holes_n"]):
        a = 2 * math.pi * i / K["holes_n"]
        obj("lh", ycyl(K["holes_d"] / 2, y0 - 0.1, y1 + 0.1, 32, K["holes_r"] * math.sin(a), K["holes_r"] * math.cos(a)), tmp)
    for a in (150.0, 270.0, 30.0):
        obj("bh", ycyl(0.17, y0 - 0.1, y1 + 0.1, 20, K["cam_bolt_r"] * math.sin(math.radians(a)), K["cam_bolt_r"] * math.cos(math.radians(a))), tmp)
    obj("dh", ycyl(K["dowel_d"] / 2 + 0.003, y0 - 0.1, y1 + 0.1, 16, K["dowel_r"], 0.0), tmp)
    obj("ch", ycyl(0.26, y0 - 0.1, y1 + 0.1, 32), tmp)
    # front face: rim recess outside the hub, the timing dot at the top
    ring = [ysec(disc_pts(R - 0.55, 160), y1 - 0.03), ysec(disc_pts(R - 0.55, 160), y1 + 0.1)]
    hole_ = [ysec(disc_pts(1.12, 96), y1 - 0.031), ysec(disc_pts(1.12, 96), y1 + 0.1)]
    rec = obj("recess", loft(ring), root); hl = obj("recess_in", loft(hole_), root)
    boolean(rec, "DIFFERENCE", hl); bpy.data.objects.remove(hl); tmp.objects.link(rec); root.objects.unlink(rec)
    obj("dot", ycyl(0.05, y1 - 0.06, y1 + 0.1, 16, 0.0, R - 0.42), tmp)
    boolean(spr, "DIFFERENCE", tmp); clear(tmp); bpy.data.collections.remove(tmp)
    spr.data.transform(Matrix.Translation((0, 0, CAMZ * IN))); to_local_z(spr, CAMZ)
    finish(spr, material("Timing_BilletSteel", (0.72, 0.72, 0.74, 1), 1.0, 0.22))
    # Cam bolts: 5/16 hex heads with washers faces.
    bm = bmesh.new()
    for a in (150.0, 270.0, 30.0):
        x, z = K["cam_bolt_r"] * math.sin(math.radians(a)), K["cam_bolt_r"] * math.cos(math.radians(a)) + CAMZ
        loft([ysec(disc_pts(0.30, 24, x, z), y1 + 0.04), ysec(disc_pts(0.30, 24, x, z), y1 + 0.08)], bm)
        loft([ysec(hexagon(K["cam_bolt_hex"], x, z, math.radians(a)), y1 + 0.08), ysec(hexagon(K["cam_bolt_hex"], x, z, math.radians(a)), y1 + 0.04 + K["cam_bolt_h"])], bm)
    bolts = obj("CamBolts", bm, root); to_local_z(bolts, CAMZ)
    finish(bolts, material("Cam_BlackOxide", (0.05, 0.05, 0.055, 1), 0.7, 0.45), 30)
    return spr, bolts, (y0, y1)


def build_crank_sprocket(root, path):
    gs = CRK["params"]; yc = K["chain_y"]; rp = K["row_pitch"] / 2
    y1 = gs["gear_to"]; y0 = y1 - K["spr_w"]
    R = path["R_crank"]; tip = R + 0.15
    # Phase the teeth on the pin nearest the bottom of the crank wrap at crank_deg 0.
    best = None
    for i in range(K["links"]):
        x, z = path_point(path, i * path["L"] / K["links"])
        psi = math.degrees(math.atan2(x, z))
        if z < 1.0 and (best is None or abs(abs(psi) - 180) < abs(abs(best) - 180)): best = psi
    phase = math.radians(best)
    prof = sprocket_profile(K["z_crank"], R, tip, phase)
    rows_y = [(yc - rp - K["roller_l"] / 2, yc - rp + K["roller_l"] / 2), (yc + rp - K["roller_l"] / 2, yc + rp + K["roller_l"] / 2)]
    tmp = coll("CSpr_tmp", root, hide=True)
    spr = obj("CrankSprocket", loft([ysec(disc_pts(R - 0.27, 160), y0), ysec(disc_pts(R - 0.27, 160), y1)]), root)
    for a, b in rows_y: obj("row", loft([ysec(prof, a), ysec(prof, b)]), tmp)
    obj("mid", loft([ysec(disc_pts(R - 0.22, 160), rows_y[0][1] - 0.01), ysec(disc_pts(R - 0.22, 160), rows_y[1][0] + 0.01)]), tmp)
    boolean(spr, "UNION", tmp); clear(tmp)
    obj("bore", ycyl(gs["gear_d"] / 2 + 0.001, y0 - 0.1, y1 + 0.1, 96), tmp)
    # 9 keyways, 40 deg apart, "0" on top over the crank key [meas photo 322; spacing est]
    kw = gs["key_w"] / 2; top = gs["gear_d"] / 2
    for i in range(K["keyways"]):
        a = math.radians(40.0 * i)
        ca, sa = math.cos(a), math.sin(a)
        sq = [(-kw, top - 0.05), (kw, top - 0.05), (kw, top + 0.10), (-kw, top + 0.10)]
        rot = [(x * ca + z * sa, -x * sa + z * ca) for x, z in sq]
        obj("kw", loft([ysec(rot, y0 - 0.1), ysec(rot, y1 + 0.1)]), tmp)
    obj("dot", ycyl(0.045, y1 - 0.05, y1 + 0.1, 16, 0.0, R - 0.30), tmp)
    boolean(spr, "DIFFERENCE", tmp); clear(tmp); bpy.data.collections.remove(tmp)
    finish(spr, material("Timing_BilletSteel", (0.72, 0.72, 0.74, 1), 1.0, 0.22))
    # Key in the crank keyway, under the sprocket.
    key = obj("CrankKey", loft([ysec([(-kw + 0.002, top - gs["key_depth"] + 0.002), (kw - 0.002, top - gs["key_depth"] + 0.002),
                                      (kw - 0.002, top + 0.085), (-kw + 0.002, top + 0.085)], y0 + 0.02),
                                ysec([(-kw + 0.002, top - gs["key_depth"] + 0.002), (kw - 0.002, top - gs["key_depth"] + 0.002),
                                      (kw - 0.002, top + 0.085), (-kw + 0.002, top + 0.085)], y1 - 0.02)]), root)
    finish(key, material("Cam_GroundSteel", (0.78, 0.78, 0.80, 1), 1.0, 0.14))
    return spr, key, phase


def build_chain(root, lib, path):
    """Two link meshes in the library (inner link with its four rollers, outer
    link with its pins), placed by geometry nodes along the path every pitch,
    each aimed at the next pin. Input 'Travel' is the chain's travel along the
    path in metres, driven from crank_deg."""
    yc = 0.0; rp = K["row_pitch"] / 2; pt = K["plate_th"]; rl = K["roller_l"] / 2
    def plate(y, bm):
        # figure-8 plate along +X from pin 0 to pin 1, in the XZ plane, thickness pt at y
        ro, waist = K["plate_h"] / 2, K["plate_h"] * 0.36
        ring = []
        for i in range(48):
            a = 2 * math.pi * i / 48
            x, z = math.cos(a) * (P / 2 + ro * 0.92), math.sin(a) * ro
            # pinch the middle
            f = 1 - (1 - waist / ro) * math.exp(-((x / (P * 0.55)) ** 2) * 3)
            ring.append((x + P / 2, z * f))
        loft([[Vector((x, y - pt / 2, z)) for x, z in ring], [Vector((x, y + pt / 2, z)) for x, z in ring]], bm)
    inner = bmesh.new()
    for ry in (-rp, rp):
        for px in (0.0, P):
            loft([[Vector((px + K["roller_d"] / 2 * math.cos(2 * math.pi * k / 20), ry - rl, K["roller_d"] / 2 * math.sin(2 * math.pi * k / 20))) for k in range(20)],
                  [Vector((px + K["roller_d"] / 2 * math.cos(2 * math.pi * k / 20), ry + rl, K["roller_d"] / 2 * math.sin(2 * math.pi * k / 20))) for k in range(20)]], inner)
        plate(ry - rl - pt / 2 - 0.002, inner); plate(ry + rl + pt / 2 + 0.002, inner)
    outer = bmesh.new()
    yo = rp + rl + pt * 1.5 + 0.006
    for y_ in (-yo, 0.0, yo): plate(y_, outer)
    for px in (0.0, P):
        loft([[Vector((px + K["pin_d"] / 2 * math.cos(2 * math.pi * k / 16), -yo - pt / 2 - 0.03, K["pin_d"] / 2 * math.sin(2 * math.pi * k / 16))) for k in range(16)],
              [Vector((px + K["pin_d"] / 2 * math.cos(2 * math.pi * k / 16), yo + pt / 2 + 0.03, K["pin_d"] / 2 * math.sin(2 * math.pi * k / 16))) for k in range(16)]], outer)
    lmat = material("Chain_Steel", (0.55, 0.55, 0.57, 1), 1.0, 0.3)
    li = obj("ChainLink_Inner", inner, lib); finish(li, lmat)
    lo = obj("ChainLink_Outer", outer, lib); finish(lo, lmat)

    cu = bpy.data.curves.new("TimingChain", "CURVE"); cu.dimensions = "3D"
    sp = cu.splines.new("POLY"); pts = path["pts"]; sp.points.add(len(pts) - 1)
    for p_, (x, z) in zip(sp.points, pts): p_.co = (x * IN, K["chain_y"] * IN, z * IN, 1.0)
    sp.use_cyclic_u = True
    ch = bpy.data.objects.new("TimingChain", cu); root.objects.link(ch)

    ng = bpy.data.node_groups.get("TimingChainGN")
    if ng: bpy.data.node_groups.remove(ng)
    ng = bpy.data.node_groups.new("TimingChainGN", "GeometryNodeTree")
    it = ng.interface
    it.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    s_travel = it.new_socket("Travel", in_out="INPUT", socket_type="NodeSocketFloat")
    it.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    N = ng.nodes; Lk = ng.links.new
    gi = N.new("NodeGroupInput"); go = N.new("NodeGroupOutput")
    clen = N.new("GeometryNodeCurveLength"); Lk(gi.outputs["Geometry"], clen.inputs["Curve"])
    pitch = N.new("ShaderNodeMath"); pitch.operation = "DIVIDE"; Lk(clen.outputs["Length"], pitch.inputs[0]); pitch.inputs[1].default_value = K["links"]
    pnts = N.new("GeometryNodePoints"); pnts.inputs["Count"].default_value = K["links"]
    idx = N.new("GeometryNodeInputIndex")
    m1 = N.new("ShaderNodeMath"); m1.operation = "MULTIPLY_ADD"
    Lk(idx.outputs["Index"], m1.inputs[0]); Lk(pitch.outputs[0], m1.inputs[1]); Lk(gi.outputs["Travel"], m1.inputs[2])
    md = N.new("ShaderNodeMath"); md.operation = "FLOORED_MODULO"; Lk(m1.outputs[0], md.inputs[0]); Lk(clen.outputs["Length"], md.inputs[1])
    a2 = N.new("ShaderNodeMath"); a2.operation = "ADD"; Lk(md.outputs[0], a2.inputs[0]); Lk(pitch.outputs[0], a2.inputs[1])
    md2 = N.new("ShaderNodeMath"); md2.operation = "FLOORED_MODULO"; Lk(a2.outputs[0], md2.inputs[0]); Lk(clen.outputs["Length"], md2.inputs[1])
    sc1 = N.new("GeometryNodeSampleCurve"); sc1.mode = "LENGTH"; Lk(gi.outputs["Geometry"], sc1.inputs["Curves"]); Lk(md.outputs[0], sc1.inputs["Length"])
    sc2 = N.new("GeometryNodeSampleCurve"); sc2.mode = "LENGTH"; Lk(gi.outputs["Geometry"], sc2.inputs["Curves"]); Lk(md2.outputs[0], sc2.inputs["Length"])
    sp_ = N.new("GeometryNodeSetPosition"); Lk(pnts.outputs["Points"], sp_.inputs["Geometry"]); Lk(sc1.outputs["Position"], sp_.inputs["Position"])
    dv = N.new("ShaderNodeVectorMath"); dv.operation = "SUBTRACT"; Lk(sc2.outputs["Position"], dv.inputs[0]); Lk(sc1.outputs["Position"], dv.inputs[1])
    al = N.new("FunctionNodeAlignRotationToVector"); al.axis = "X"; al.pivot_axis = "Y"; Lk(dv.outputs["Vector"], al.inputs["Vector"])
    par = N.new("ShaderNodeMath"); par.operation = "FLOORED_MODULO"; Lk(idx.outputs["Index"], par.inputs[0]); par.inputs[1].default_value = 2
    ev = N.new("ShaderNodeMath"); ev.operation = "LESS_THAN"; Lk(par.outputs[0], ev.inputs[0]); ev.inputs[1].default_value = 0.5
    od = N.new("ShaderNodeMath"); od.operation = "GREATER_THAN"; Lk(par.outputs[0], od.inputs[0]); od.inputs[1].default_value = 0.5
    join = N.new("GeometryNodeJoinGeometry")
    for sel, src in ((ev, li), (od, lo)):
        oi = N.new("GeometryNodeObjectInfo"); oi.inputs["Object"].default_value = src; oi.transform_space = "ORIGINAL"
        io = N.new("GeometryNodeInstanceOnPoints")
        Lk(sp_.outputs["Geometry"], io.inputs["Points"]); Lk(sel.outputs[0], io.inputs["Selection"])
        Lk(oi.outputs["Geometry"], io.inputs["Instance"]); Lk(al.outputs["Rotation"], io.inputs["Rotation"])
        Lk(io.outputs["Instances"], join.inputs["Geometry"])
    rz = N.new("GeometryNodeRealizeInstances"); Lk(join.outputs["Geometry"], rz.inputs["Geometry"])
    Lk(rz.outputs["Geometry"], go.inputs["Geometry"])
    mod = ch.modifiers.new("TimingChainGN", "NODES"); mod.node_group = ng
    # Travel = crank angle (rad) x crank pitch-line radius (path radius), in metres.
    crank = bpy.data.objects["Crankshaft"]
    fc = ch.driver_add(f'modifiers["TimingChainGN"].properties.inputs.{s_travel.identifier}.value')   # Blender 5.x modifier inputs
    drv = fc.driver; drv.type = "SCRIPTED"
    v = drv.variables.new(); v.name = "deg"; v.type = "SINGLE_PROP"; v.targets[0].id = crank; v.targets[0].data_path = '["crank_deg"]'
    drv.expression = f"deg * {math.pi / 180 * path['R_crank'] * IN:.12f}"
    return ch, (li, lo)


def drive_cam(cam):
    crank = bpy.data.objects["Crankshaft"]
    cam.rotation_mode = "XYZ"; cam.driver_remove("rotation_euler", 1)
    fc = cam.driver_add("rotation_euler", 1); drv = fc.driver; drv.type = "SCRIPTED"
    v = drv.variables.new(); v.name = "deg"; v.type = "SINGLE_PROP"; v.targets[0].id = crank; v.targets[0].data_path = '["crank_deg"]'
    drv.expression = "-deg * 0.008726646259971648"          # half the crank's -deg * pi/180


def parent_keep(child, parent):
    mw = child.matrix_world.copy(); child.parent = parent; child.matrix_parent_inverse = parent.matrix_world.inverted(); child.matrix_world = mw


# ---- checks ---------------------------------------------------------------------

def set_crank(deg):
    sc = bpy.context.scene
    f = 1 + deg / 7.5; fi = math.floor(f)
    sc.frame_set(int(fi), subframe=f - fi)

def mesh_world(o):
    dg = bpy.context.evaluated_depsgraph_get(); e = o.evaluated_get(dg); m = e.to_mesh()
    mw = e.matrix_world
    v = np.array([(mw @ x.co)[:] for x in m.vertices]) / IN
    f = [tuple(p.vertices) for p in m.polygons]; e.to_mesh_clear()
    return v, f

def event_check(cam, rows, step=0.5):
    """Lift on every lifter axis from the cam mesh as the crank turns. The
    roller (radius rr) on the axis line c + e*w + t*a is pushed up to the
    highest t at which it touches a lobe vertex."""
    me = cam.data; rr = K["roller_r"]
    V0 = np.array([v.co[:] for v in me.vertices]) / IN          # cam local (about the cam axis)
    res = {}
    lobes = []
    for r in rows:
        sel = np.abs(V0[:, 1] - r["y"]) < K["lobe_w"] / 2 - K["lobe_ch"] + 0.001   # the two full-radius rings
        lobes.append(V0[sel][:, [0, 2]])
    t0s = [math.sqrt((K["base_r"] + rr) ** 2 - r["e"] ** 2) for r in rows]
    degs = np.arange(0, 720, step)
    lifts = np.zeros((len(rows), len(degs)))
    for j, d in enumerate(degs):
        set_crank(float(d))
        a = cam.matrix_world.to_euler().y                           # evaluated rotation about Y
        ca, sa = math.cos(a), math.sin(a)
        for i, (r, P2) in enumerate(zip(rows, lobes)):
            xw = P2[:, 0] * ca + P2[:, 1] * sa; zw = -P2[:, 0] * sa + P2[:, 1] * ca
            ax, w = r["ax"], r["w"]
            t = xw * ax[0] + zw * ax[1]; q = xw * w[0] + zw * w[1] - r["e"]
            m_ = np.abs(q) < rr
            lifts[i, j] = (t[m_] + np.sqrt(rr * rr - q[m_] ** 2)).max() - t0s[i]
    set_crank(0.0)
    out = []
    for i, r in enumerate(rows):
        L = lifts[i]; tdc_ov = (FIRE_DEG[r["cyl"]] + 360.0) % 720.0
        rel = ((degs - tdc_ov + 360) % 720) - 360                   # crank deg from this cylinder's overlap TDC
        o = np.argsort(rel); rel, L = rel[o], L[o]
        def crossings(th):
            above = L >= th; idx = np.where(np.diff(above.astype(int)) != 0)[0]
            xs = []
            for k in idx:
                x0, x1, y0, y1 = rel[k], rel[k + 1], L[k], L[k + 1]
                xs.append(x0 + (th - y0) * (x1 - x0) / (y1 - y0))
            return xs
        c50, c6 = crossings(0.050), crossings(0.006)
        pk = rel[np.argmax(L)]
        out.append(dict(lobe=f"{r['cyl']}{r['valve']}", y=r["y"], lift=round(float(L.max()), 4),
                        valve_lift=round(float(L.max()) * CARD["rocker"], 4),
                        open050=round(c50[0], 2), close050=round(c50[-1], 2), dur050=round(c50[-1] - c50[0], 2),
                        dur006=round(c6[-1] - c6[0], 2), centre=round((c50[0] + c50[-1]) / 2, 2), peak_at=round(float(pk), 2)))
    return out, degs, lifts

def clash(movers, fixed_names, degs):
    dg = bpy.context.evaluated_depsgraph_get()
    def tree(o):
        v, f = mesh_world(o); return BVHTree.FromPolygons([Vector(x) for x in v], f)
    fixed = {}
    for n in fixed_names:
        o = bpy.data.objects.get(n)
        if o is not None: fixed[n] = tree(o)
    hits = []
    for d in degs:
        set_crank(float(d))
        for o in movers:
            t = tree(o)
            for n, ft in fixed.items():
                if n != o.name and t.overlap(ft): hits.append((float(d), o.name, n))
    set_crank(0.0)
    return hits

def min_gap(a_names, b_obj, degs):
    """Smallest distance (in) from the vertices of the a objects to b's surface."""
    best = (1e9, None, None)
    for d in degs:
        set_crank(float(d))
        vb, fb = mesh_world(b_obj); tb = BVHTree.FromPolygons([Vector(x) for x in vb], fb)
        for n in a_names:
            va, _ = mesh_world(bpy.data.objects[n])
            for x in va[::1]:
                loc, nrm, i, dist = tb.find_nearest(Vector(x), 1.0)
                if dist is not None and dist < best[0]: best = (dist, float(d), n)
    set_crank(0.0)
    return best


def rod_cam_clearance(cam, step=2.0):
    """Closest approach (in) of any rod, cap or rod bolt to the cam over two
    turns: rod vertices within 1.6" of the cam axis, nearest point on the cam."""
    names = [o.name for o in bpy.data.objects if o.name.startswith(("ConRod_", "RodCap_", "RodBolt_")) and o.type == "MESH"]
    best = (1e9, None, None)
    for d in np.arange(0, 720, step):
        set_crank(float(d))
        vc, fc_ = mesh_world(cam); tc = BVHTree.FromPolygons([Vector(x) for x in vc], fc_)
        for n in names:
            v, _ = mesh_world(bpy.data.objects[n])
            near = v[np.hypot(v[:, 0], v[:, 2] - CAMZ) < 1.6]
            for x in near:
                loc, nrm, i, dist = tc.find_nearest(Vector(x), 1.0)
                if dist is not None and dist < best[0]: best = (float(dist), float(d), n)
    set_crank(0.0)
    return dict(min_in=best[0], crank_deg=best[1], part=best[2])


def build():
    root = coll("BBC_Cam_Timing"); clear(root)
    lib = coll("Cam_Library", root, hide=True)
    rows = lobe_table()
    path = chain_path()
    cam, dow, nose_front = build_cam(root, lib, rows)
    plate, screws = build_thrust_plate(root)
    spr, bolts, spr_y = build_cam_sprocket(root, path, nose_front)
    cspr, key, cphase = build_crank_sprocket(root, path)
    chain, links = build_chain(root, lib, path)
    crank = bpy.data.objects["Crankshaft"]
    drive_cam(cam)
    set_crank(0.0); bpy.context.view_layer.update()
    for o in (spr, bolts, dow): parent_keep(o, cam)
    for o in (cspr, key): parent_keep(o, crank)

    # Lobe nose angles (cam frame, crank_deg 0), from the profiles.
    for r in rows:
        pc, _ = pitch_and_profile(r)
        rad = np.hypot(pc[:, 0], pc[:, 1]); i = int(np.argmax(rad))
        r["nose_psi"] = round(math.degrees(math.atan2(pc[i, 0], pc[i, 1])) % 360, 2)
    i1 = next(r for r in rows if r["cyl"] == 1 and r["valve"] == "I")["nose_psi"]
    for r in rows: r["from_1I_cam_deg"] = round((i1 - r["nose_psi"]) % 360, 2)   # later lobes come round after #1 intake

    ev, degs, lifts = event_check(cam, rows)
    rods = [o.name for o in bpy.data.objects if o.name.startswith(("ConRod_", "RodCap_", "RodBolt_")) and o.type == "MESH"]
    clash_fixed = ["Block", "CamThrustPlate", "CamPlateScrews"] + [f"MainCap_{i}" for i in range(1, 6)] + [f"MainStuds_{i}" for i in range(1, 6)]
    hits = clash([cam, spr, bolts, cspr, chain], clash_fixed + ["Crankshaft"], np.arange(0, 720, 15))
    rod_hits = clash([cam], rods + ["Crankshaft"], np.arange(0, 720, 5))
    rod_gap = rod_cam_clearance(cam)
    info = dict(rod_to_cam=rod_gap, card=CARD, params=K, chain=dict(k=path["k"], R_cam=path["R_cam"], R_crank=path["R_crank"], L=path["L"],
                                                 psi_tangent=path["psi_tangent"], crank_teeth_phase_deg=math.degrees(cphase)),
                lobes=[{k_: (v if not isinstance(v, tuple) else list(v)) for k_, v in r.items()} for r in rows],
                events=ev, clash=hits, cam_vs_rods=rod_hits, rods_checked=len(rods),
                cam_tris=sum(len(p.vertices) - 2 for p in cam.data.polygons))
    with open(os.path.join(HERE, "cam_info.json"), "w") as f: json.dump(info, f, indent=1, default=float)
    np.save(os.path.join(HERE, "lift_trace.npy"), lifts)
    return info


if __name__ == "__main__" or "bpy" in globals():
    info = build()
    print(json.dumps(dict(events=info["events"], clash=info["clash"][:20], cam_vs_rods=info["cam_vs_rods"][:20], rod_to_cam=info["rod_to_cam"],
                          chain=info["chain"], tris=info["cam_tris"]), default=float))
