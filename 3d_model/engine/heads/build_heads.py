"""Cylinder heads (AFR 2110, 345cc Magnum BBC, 117cc chambers), Cometic C5333 MLS head
gaskets and ARP 235-4713 head studs for Drew's 540 (Gen VI BBC).

The aluminium castings only: deck, chambers, intake and exhaust ports, spark-plug holes,
rocker box (floor, spring pockets, guide bosses, rocker-stud bosses, bolt bosses),
pushrod slots, end water ports and the bolt holes; and the valvetrain: valves, springs,
retainers, one shared rocker mesh on all 16 studs, pushrods, keyed to the lifters on the crank timeline.

One casting fits either bank (BBC heads are interchangeable): the left head is built in
deck coordinates, and the right head is the same mesh turned 180 deg about the vertical.
The block's right deck is the left deck turned the same way (../block/build_block.py).

Deck coordinates (inches), as ../block/refs/deck_c5333.json: u along the deck from the
cylinder-1 bore centre towards the rear, v across the deck towards the valley, h up the
bore axis from the block deck. Tags: [spec] AFR / Cometic / ARP published, [meas] Drew's
photos or the gasket image, [derived], [est]. Sources in PARTS.md.

Run live in Blender after the block, crank, rods, cam and lifters:
    exec(open(r"C:/Users/drewm/Documents/scripts/camaro_webpage/3d_model/engine/heads/build_heads.py").read())
"""
import bpy, bmesh, json, math, os
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

HERE = (os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() and "heads" in __file__
        else r"C:\Users\drewm\Documents\scripts\camaro_webpage\3d_model\engine\heads")
ENG = os.path.join(HERE, "..")
CAM_PY = os.path.join(ENG, "cam", "build_cam.py")
_src = open(CAM_PY).read(); _src = _src[:_src.index('if __name__ == "__main__"')]
CAMNS = {"__file__": CAM_PY, "__name__": "cam_lib"}
exec(_src, CAMNS)
IN = CAMNS["IN"]
coll, clear, obj, boolean, material, loft, cyl_axis = (CAMNS[k] for k in ("coll", "clear", "obj", "boolean", "material", "loft", "cyl_axis"))
BLK = json.load(open(os.path.join(ENG, "block", "block_info.json")))["params"]
GASK = json.load(open(os.path.join(ENG, "block", "refs", "deck_c5333.json")))
BDECK = json.load(open(os.path.join(ENG, "block", "refs", "deck_block.json")))
LIFT = json.load(open(os.path.join(ENG, "lifters", "lifter_info.json")))

SP = BLK["bore_sp"]; SPAN = 3 * SP
CYL_U = [SP * k for k in range(4)]                  # left bank cylinders 1, 3, 5, 7
VALVES = ["EI"] * 4                                # E-I-E-I front to rear on the left head [meas] photo 334, NCRS; the right head, turned round, reads I-E-I-E

K = dict(
    gasket_t=0.027,          # [meas] Drew's engine: Cometic C5333 MLS, .027" compressed (block PARTS.md)
    gasket_bore=4.540,       # [spec] C5333 bore
    lip=0.65,                # [meas] photo 265: the exhaust-side deck ledge the bottom-row bolts sit on; thickness [est]
    v_exh=-2.05,             # [est] casting wall between the exhaust flanges, below the shelf
    shelf=3.40,              # [meas] photos 265/337: shelf above the exhaust ports, outside the valve cover, carrying the middle-row bolts; height [est]
    rail_v_exh=-0.65,        # [meas] photo 267: the cover rail runs ~.6" inboard of the middle-row bolts
    rail_corner=1.10, rail_end=0.35,   # [meas] photos 336/337: racetrack rail with rounded ends, a little short of the head ends
    v_int=6.40,              # plan extent of the casting on the valley side, before the intake face is cut (face_v)
    rail=4.00,               # [meas] photo 336 (square-on, scaled from the 2.435" port): intake face ~3.6-4.0" tall, rail flush with it
    int_face_top=3.55,       # [meas] Drew's close-up of the intake face: the machined manifold face stops ~.5" above the ports;
                             # above it a cast band runs on up, flush with the face, to the valve-cover flange (Drew's photos)
    rail_v_int=5.45,         # [Drew] the cover flange's intake side ends on the intake-face plane (BLK china_top_v); nothing,
                             # not even the cover-bolt lugs, stands out past it
    port_v0=6.10,            # intake runners are laid out from here and trimmed at the face (port_solid)
    wall=0.30,               # [meas] photo 267: thin machined rail
    floor=(3.50, 3.50),      # [est] rocker-box floor: ~.6" below the rail (photos 267/337)
    # Valves [spec] AFR: 2.300/1.880, 24/4 intake, 15/4 exhaust; seats 2.450 x 2.000 and 2.000 x 1.580
    vI=dict(d=2.300, ang=24.0, cant=4.0, du=0.95, dv=0.55, seat_od=2.450, seat_id=2.000, hs=0.80),
    vE=dict(d=1.880, ang=15.0, cant=4.0, du=1.13, dv=-0.15, seat_od=2.000, seat_id=1.580, hs=0.70),
    # du [derived] the lifters sit under the valves, .90" either side of the bore (../lifters); the exhaust
    # valves sit .15" closer in [est], so each exhaust spring clears the exhaust-side stud beside it;
    # du, dv [meas] photo 334 (deck face scaled from the stud holes): the valves sit nearly side by side along
    # the bank, the intake .7" nearer the valley; both stems lean towards the valley (photos 267/336); hs [est] seat
    # height above the block deck, tuned with the chamber wall to the 117cc chamber
    chamber_cc=117.0,        # [spec] AFR 2110, partial-CNC chamber
    chamber_r=2.24,          # [derived] inside the 4.499" bore and the 4.540" gasket
    spring_h=dict(I=2.82, E=2.86),  # [est] valve face to spring seat along the stem: machined pockets just below the floor (photos 336/337), the exhaust seats a little higher [Drew]
                             # the exhaust seats stand .35" higher [Drew], over the middle-row studs' spot faces
    spring_r=0.875,          # [spec] 1.725-1.750" spring pocket
    stem_l=dict(I=5.09, E=5.13),    # [derived] spring seat + 1.900" installed height + retainer and locks (.37")
    # Intake: 345cc, 2.435 x 1.765, 13/32 corner radius, stock location, 3.263 in^2 min CSA [spec]; the
    # ports pair up, cylinders 1/3 and 5/7, 2.07" apart within a pair [meas] photo 335 (perspective fit)
    int_cc=345.0, int_w=1.765, int_h=2.435, int_r=0.406, int_hc=1.85, int_pair=1.035, int_csa=3.263,
    int_pairs=(3.60, 13.28),  # [derived] 9.68" apart (manifold), placed so the pushrods clear (photo 335 fit gives 2.29/11.97 or 2.87/12.55)
    # Exhaust: 132cc, 1.720 H x 1.920 W, raised .375 [spec]; about evenly spaced, one over each
    # cylinder's exhaust valve, with the plugs between them [meas] photo 337
    # Exhaust ports sit between the bottom-row studs, each under a middle-row stud, so the bottom row is below
    # the ports and the middle row above them [meas] Drew (deck drawing, photo of the head with the springs in);
    # each port runs forward from its valve; the first port is under the front-end stud
    exh_cc=132.0, exh_w=1.920, exh_h=1.720, exh_r=0.65, exh_hc=2.25, exh_u=(-0.75, 4.09, 8.93, 13.77),
    exh_face=-2.30,          # [meas] photo 265: flange face inboard of the bottom-row bolts, which stand on the ledge outside it
    # Spark plug: 14mm x .750" reach, gasket seat [spec]; plugs exit low between the exhaust ports, angled
    # towards their own intake valve [meas] photos 265/266/337; positions [est]
    plug=dict(tip=(0.0, -0.95, 0.40), exit=(0.70, -2.75, 1.05), thread_r=0.276, reach=0.75, seat_r=0.45, boss_r=0.56),
    # Valvetrain (Drew's build doc): COMP 26924 springs (1.519" OD, 1.900" installed), COMP 749 retainers,
    # 11/32 stems, 1.7 aluminium roller rockers (CSP-S2001NP) on 7/16 studs with poly locks (CSP-PL716K), 3/8 pushrods
    # (Trick Flow 21418650 / 21417650; 8.650" intake, 7.650" exhaust). Shapes [est]; all valves drawn closed.
    vt=dict(stem_r=0.171, spring_od=1.519, wire=0.200, installed=1.900, turns=5.5, ret_r=0.74, ret_t=0.10,
            pushrod_r=0.1875, stud_r=0.2187, roller_r=0.25, trunnion_up=0.30, rocker_w=0.90,
            # one rocker for all 16 valves [Drew]: roller centre 1.55" and pushrod cup .91" from the trunnion along
            # the arm (1.7:1) [est, CSP 1.7 BBC class]; the trunnion .10" above the roller centre, the cup .25" below it
            tip_arm=1.55, cup_arm=0.91, tr_up=0.10, cup_dn=0.25,
            # body shape from Drew's photo [est]: .90" over the side plates, .68" between them over the trunnion,
            # a .50" x .38" roller, .26" trunnion; poly lock 9/16 hex with its set screw standing proud
            rk_inner=0.68, roller_w=0.38, trunnion_r=0.26, lock_hex=0.5625, lock_h=(0.27, 0.70), setscrew=(0.14, 0.16)),
    stud_hole=0.235,         # 7/16 stud clearance
    # The middle (exhaust-side) row stands outside the valve cover, above the exhaust ports: each sits on a
    # spot face at mid_seat in a slot open to the exhaust side, and the cover rail and rocker box step in
    # round it [meas] Drew; sizes [est]
    mid_seat=3.36,           # spot faces .04 into the shelf
    boss_r=0.42,             # [est] stud bosses in the rocker box
    nut_pocket=0.46,         # [est] socket clearance round the four bottom studs, above the ledge
    nut_pocket_h=0.55,       # [est] below the exhaust port; the bottom-row studs finish flush with their nuts
                             # bottom-row studs are cut to finish flush with their nuts
    pushrod_r=0.24,          # 3/8" pushrod + clearance
    hdr_bolts=((-1.50, -0.45), (1.40, 0.25)),   # [meas] photo 265: header bolts lower-front and upper-rear of each port (du, dh), 3/8-16
    int_bolts=((-1.60, 1.75), (0.90, 1.75), (6.70, 1.75), (9.90, 1.75), (15.80, 1.75), (17.90, 1.75)),   # [meas] photo 336: six intake bolts (u, h), 3/8-16
    end_ports=dict(u=(-0.45, 16.80), h=1.75, w=0.60, ht=1.00, depth=1.0),  # [meas] photo 336: water ports near the ends; size [est]
    # Valve-cover rail: the BBC seven-bolt cover pattern, four along the exhaust side and three along the
    # intake side, 1/4-20 [spec, count]; positions [est]. Each bolt sits in a lug cast on the inside of the
    # rail wall, and the rail top carries a thin outward lip (the cover-gasket land) [est] photos 335/337
    cover_bolts=dict(E=(0.22, 0.405, 0.605, 0.80), I=(0.17, 0.505, 0.84)),   # [meas] photo 336: fractions of the rail length from the rear
    cover_tap=0.105, cover_tab_r=0.25, cover_tab_h=0.50,
    cover_inset=0.30,        # [Drew] the bolt holes sit inboard of the rail's middle, in lugs on the inside of the flange
    rail_lip=0.07, rail_lip_h=0.22,
    # Spring seats [est] photo (Drew's head, exhaust side, springs in): each spring stands in a machined
    # pocket on a round boss that flares into the rocker-box floor; the guide boss stands up in the middle
    spring_boss=(0.12, 0.42, 1.25),   # boss radius over the pocket at the seat, at the foot, and its length
    spring_cbore=0.05,                # spot-faced counterbore round the seat: .05 deep, .06 over the pocket
    spring_lead=(0.12, 0.40, 0.14),   # machined lead-in round each pocket [est]; the ports run close beside the
                                      # out to .35 past the pocket wall at .70 [est]; the ports run close beside the
                                      # seats (port roof within .1 of the seat plane 1.2" off the stem), so the floor
                                      # can't be cast down round the bosses
)
H0 = K["gasket_t"]
# Head studs: 16 per head, as the block (refs/deck_block.json "studs": Drew's deck drawing and the 16-bolt
# torque-sequence figure). The two at the valley-side ends pass through the hollow head dowels [Drew]; the gasket's
# two holes over the valley (13 and 27) line up with nothing.
STUDS = BDECK["studs"]
assert len(STUDS) == 16, len(STUDS)
LOW = [h for h in STUDS if h["v"] < -2.5]                 # below the exhaust ports, on the lip
MID = [h for h in STUDS if -2.5 <= h["v"] < 0]            # above the exhaust ports, outside the cover
HIGH = [h for h in STUDS if h["v"] >= 0]                  # valley side, in the rocker box
assert (len(LOW), len(MID), len(HIGH)) == (4, 5, 7)

FACE_TAN = 0.0      # the intake face: square to the deck, standing on the line where the deck meets the china-wall tops (Drew)
FACE_N = Vector((0, 1, -FACE_TAN)).normalized()
def face_v(z):
    """v of the intake face at height z above the block deck."""
    return BLK["china_top_v"] + z * FACE_TAN

def stud_top(h):
    """Top of a stud's clearance hole in the head: the lip, the middle-row spot face, or the rocker box."""
    return H0 + K["lip"] + 0.05 if h in LOW else (K["mid_seat"] + 0.05 if h in MID else K["rail"])

def stadium(h, r, v_out=-4.5):
    """The middle-row stud's slot: a disc round the stud run out through the exhaust side."""
    return ccw(hull(circ(h["u"], h["v"], r, 32) + circ(h["u"], v_out, r, 32)))


# ---------- 2D helpers ----------
def arc(cx, cy, r, a0, a1, n):
    return [(cx + r * math.cos(a0 + (a1 - a0) * k / n), cy + r * math.sin(a0 + (a1 - a0) * k / n)) for k in range(n + 1)]

def rrect(x0, x1, y0, y1, r, n=8):
    r = min(r, (x1 - x0) / 2 - 1e-4, (y1 - y0) / 2 - 1e-4)
    p = arc(x1 - r, y0 + r, r, -math.pi / 2, 0, n) + arc(x1 - r, y1 - r, r, 0, math.pi / 2, n)
    p += arc(x0 + r, y1 - r, r, math.pi / 2, math.pi, n) + arc(x0 + r, y0 + r, r, math.pi, 1.5 * math.pi, n)
    return p

def circ(cx, cy, r, n=32):
    return [(cx + r * math.cos(2 * math.pi * k / n), cy + r * math.sin(2 * math.pi * k / n)) for k in range(n)]

def hull(pts):
    pts = sorted(set((round(x, 6), round(y, 6)) for x, y in pts))
    def cross(o, a, b): return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0: lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(up) >= 2 and cross(up[-2], up[-1], p) <= 0: up.pop()
        up.append(p)
    return lo[:-1] + up[:-1]

def clip(poly, a, b, c):
    """Keep the part of the polygon where a*x + b*y <= c."""
    out = []
    for i in range(len(poly)):
        p, q = poly[i], poly[(i + 1) % len(poly)]
        fp, fq = a * p[0] + b * p[1] - c, a * q[0] + b * q[1] - c
        if fp <= 0: out.append(p)
        if fp * fq < 0:
            t = fp / (fp - fq); out.append((p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])))
    return out

def inset(convex, w):
    """Inset a CCW convex polygon by w (intersection of the shifted edge half-planes)."""
    out = rrect(-50, 50, -50, 50, 0.1, 1)
    n = len(convex)
    for i in range(n):
        (x0, y0), (x1, y1) = convex[i], convex[(i + 1) % n]
        ex, ey = x1 - x0, y1 - y0; L = math.hypot(ex, ey)
        if L < 1e-6: continue
        nx, ny = ey / L, -ex / L                              # outward normal of a CCW polygon
        out = clip(out, nx, ny, nx * x0 + ny * y0 - w)
    return out

def ccw(poly):
    a = sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly)))
    return poly if a > 0 else poly[::-1]


# ---------- 3D helpers (local deck coordinates, inches) ----------
def V(*a): return Vector(a)

def zprism(pts, z0, z1, bm=None):
    return loft([[V(x, y, z0) for x, y in pts], [V(x, y, z1) for x, y in pts]], bm)

def vprism(pts_uh, v0, v1, bm=None):
    return loft([[V(u, v0, h) for u, h in pts_uh], [V(u, v1, h) for u, h in pts_uh]], bm)

def seg_cyl(a, b, r, seg=24, bm=None):
    return cyl_axis(a, (b - a), r, (b - a).length, seg, bm)

def hull3(points, bm=None):
    bm = bm or bmesh.new()
    vs = [bm.verts.new(p * IN) for p in points]
    bmesh.ops.convex_hull(bm, input=vs)
    for v in [v for v in bm.verts if not v.link_faces]: bm.verts.remove(v)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm

def ring_pts(c, axis, r, seg=24):
    axis = axis.normalized(); ref = V(0, 0, 1) if abs(axis.z) < 0.9 else V(1, 0, 0)
    e1 = axis.cross(ref).normalized(); e2 = axis.cross(e1)
    return [c + (e1 * math.cos(2 * math.pi * k / seg) + e2 * math.sin(2 * math.pi * k / seg)) * r for k in range(seg)]

def catmull(pts, per=12):
    P = [pts[0]] + pts + [pts[-1]]; out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(per):
            t = k / per
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(pts[-1]); return out

def runner(ctrl, n0, prof, bm=None, segs=False, per=12):
    """Rounded-rectangle sections swept along a Catmull-Rom path from the port face inwards.
    prof(s) -> (w, h, r) at arc-length fraction s; n0 the width axis at the face."""
    path = catmull(ctrl, per)
    L = [0.0]
    for a, b in zip(path, path[1:]): L.append(L[-1] + (b - a).length)
    rings = []; n = n0.normalized()
    for i, p in enumerate(path):
        t = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        n = (n - t * n.dot(t)).normalized(); b = t.cross(n)
        w, h, r = prof(L[i] / L[-1])
        rings.append([p + n * x + b * y for x, y in rrect(-w / 2, w / 2, -h / 2, h / 2, r, 6)])
    if segs:                                         # overlapping hulls of neighbouring sections (no folds on tight
        bm = bm or bmesh.new()                       # bends); the caller merges them with a voxel remesh
        me = bpy.data.meshes.new("seg")
        for r0, r1 in zip(rings, rings[1:]):
            hb = hull3(r0 + r1); hb.to_mesh(me); hb.free(); bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        return bm, path, L[-1]
    return loft(rings, bm), path, L[-1]

def smooth_solid(o, voxel=0.035, iters=12, keep=0.15):
    """Voxel-remesh a swept solid (merges the overlapping section hulls; no folds on tight bends), then a
    volume-preserving Laplacian smooth, decimated, applied. The voxels leave ~3cc of fine-grained noise in the
    volume against port size (see size_int)."""
    m = o.modifiers.new("rm", "REMESH"); m.mode = "VOXEL"; m.voxel_size = voxel * IN; m.adaptivity = 0.0
    m = o.modifiers.new("sm", "LAPLACIANSMOOTH"); m.iterations = iters; m.lambda_factor = 0.6; m.use_volume_preserve = True
    m = o.modifiers.new("dc", "DECIMATE"); m.ratio = keep
    sc = bpy.context.scene.collection; sc.objects.link(o)        # evaluated only where it is visible: link it to
    hid = o.hide_viewport; o.hide_viewport = False                # the scene for the moment
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get(); me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    sc.objects.unlink(o); o.hide_viewport = hid
    assert len(me.polygons) and len(me.vertices) != len(o.data.vertices), "remesh did not run"
    o.modifiers.clear(); old = o.data; o.data = me; bpy.data.meshes.remove(old)

def interp(s, xs, ys):
    return float(np.interp(s, xs, ys))

def vol(o):
    bm = bmesh.new(); bm.from_mesh(o.data); v = abs(bm.calc_volume()) / IN ** 3; bm.free(); return v

def nonmanifold(o):
    bm = bmesh.new(); bm.from_mesh(o.data); n = sum(1 for e in bm.edges if not e.is_manifold); bm.free(); return n

def floor_h(v):
    return K["floor"][0]


# ---------- the left head's frame and the right head's turn ----------
C45 = math.cos(math.radians(BLK["bank"])); S45 = math.sin(math.radians(BLK["bank"]))
D_L, T_L = V(-S45, 0, C45), V(C45, 0, S45)
Y0L = BLK["y_cyl1"]; YM = Y0L - SPAN / 2 - BLK["stagger"] / 2
O_L = V(0, Y0L, 0) + D_L * BLK["deck"]
M_L = Matrix(((0, T_L.x, D_L.x, O_L.x * IN), (-1, T_L.y, D_L.y, O_L.y * IN), (0, T_L.z, D_L.z, O_L.z * IN), (0, 0, 0, 1)))
ROT_R = Matrix.Translation((0, YM * IN, 0)) @ Matrix.Rotation(math.pi, 4, "Z") @ Matrix.Translation((0, -YM * IN, 0))

def to_local(p_world_in, bank):
    m = M_L if bank == "L" else ROT_R @ M_L
    q = m.inverted() @ (Vector(p_world_in) * IN)
    return Vector(q) / IN * 1.0


# ---------- valve, chamber, plug geometry ----------
def valve(k, kind):
    """Seat centre (on the valve face plane) and stem direction of cylinder k's valve."""
    q = K["v" + kind]; pos = VALVES[k].index(kind)
    su = -1 if pos == 0 else 1                         # front valve at -u, rear at +u
    if kind == "I":
        s = V(math.tan(math.radians(q["cant"])) * su, math.tan(math.radians(q["ang"])), 1).normalized()
    else:
        s = V(math.tan(math.radians(q["cant"])) * su, math.tan(math.radians(q["ang"])), 1).normalized()   # wedge: both lean to the valley
    c = V(CYL_U[k] + su * q["du"], q["dv"], q["hs"])
    return c, s, su

def plug_line(k):
    _, _, sI = valve(k, "I"); P = K["plug"]
    tip = V(CYL_U[k] + sI * P["tip"][0], P["tip"][1], P["tip"][2])
    ex = V(CYL_U[k] + sI * P["exit"][0], P["exit"][1], P["exit"][2])
    return tip, (ex - tip).normalized(), ex

def chamber_outline(k):
    cI, _, _ = valve(k, "I"); cE, _, _ = valve(k, "E"); tip, _, _ = plug_line(k)
    pts = circ(cI.x, cI.y, K["vI"]["seat_od"] / 2 + 0.08, 48) + circ(cE.x, cE.y, K["vE"]["seat_od"] / 2 + 0.07, 48) + circ(tip.x, tip.y, 0.45, 24)
    H = hull(pts)
    out = []                                           # clip radially to the chamber circle
    for x, y in H:
        dx, dy = x - CYL_U[k], y; r = math.hypot(dx, dy)
        f = min(1.0, K["chamber_r"] / r) if r > 0 else 1.0
        out.append((CYL_U[k] + dx * f, dy * f))
    return ccw(out)

def chamber_cutter(k, wall_h, tmp, z0):
    outl = chamber_outline(k)
    c = obj("ch", zprism(outl, z0, H0 + wall_h), tmp)
    parts = []
    for kind in "IE":
        cv, s, _ = valve(k, kind); r = K["v" + kind]["d"] / 2 + 0.05
        parts.append(obj("bowl", cyl_axis(cv - s * 1.6, s, r, 1.6, 64), tmp))
    tip, dr, _ = plug_line(k)
    parts.append(obj("pp", cyl_axis(tip - dr * 0.6, dr, 0.36, 0.75, 24), tmp))
    for p in parts:
        boolean(c, "UNION", p); bpy.data.objects.remove(p, do_unlink=True)
    lim = obj("lim", zprism(outl, z0, H0 + 2.5), tmp)
    boolean(c, "INTERSECT", lim); bpy.data.objects.remove(lim, do_unlink=True)
    return c


# ---------- ports ----------
INT_U = tuple(c + s * K["int_pair"] for c in K["int_pairs"] for s in (-1, 1))
# [derived] runner centre u at v = 4.4, 3.6 and 2.1: clear of the valley-side studs (6, 10, 20, 24), the
# intake pushrods (outside each pair, v ~4.4) and the exhaust pushrods (inside each pair, v ~3.5)
INT_PATH = ((2.10, 1.85, 1.40), (4.85, 5.22, 5.45), (11.75, 11.50, 11.10), (14.50, 14.85, 15.10))

SC_MID = 0.936   # the short-turn roof (t .71) keeps the height it had with the face at 6.10, clear of the spring pockets;
                 # the entry never grows past the face opening; scale widens the short-turn and the bowl

def int_runner(k, scale, bm=None, face_ext=0.0, smooth=True):
    cv, s, _ = valve(k, "I"); hc = K["int_hc"]; up = INT_U[k]; rt = K["vI"]["seat_id"] / 2
    a, b, c = INT_PATH[k]
    v0 = K["port_v0"]                                 # the runner is laid out from 6.10 and trimmed at the leaning face (port_solid)
    ctrl = [V(up, v0 + face_ext, hc), V(up, v0 - 0.4, hc), V(a, 4.4, hc), V(b, 3.6, hc),
            V(c, 2.3, hc + 0.02), cv + s * 1.15 + V(0, 0.30, 0.05), cv + s * 0.70, cv + s * 0.35, cv - s * 0.10]   # runs just past the valve face (smoothed, then cut back to the seat)
    w0, h0_, r0 = K["int_w"], K["int_h"], K["int_r"]
    def prof(t):    # pinch (t .45) held at the published minimum CSA; scale sizes the rest
        w = interp(t, [0, .15, .43, .71, .85, .94, 1], [w0, (w0 - .04) * min(scale, 1.0), 1.515, max(1.68 * scale, 1.72), 1.95 * scale, 2 * rt, 2 * rt])
        h = interp(t, [0, .15, .43, .71, .85, .94, 1], [h0_, (h0_ - .05) * min(scale, 1.0), 2.30, max(2.05 * min(scale, SC_MID), 2.08), 1.70, 2 * rt, 2 * rt])
        r = interp(t, [0, .15, .43, .71, .85, .94, 1], [r0, .45, .50, .60, .85, rt, rt])
        return w, h, min(r, w / 2, h / 2)
    return runner(ctrl, V(1, 0, 0), prof, bm, segs=smooth, per=24 if smooth else 12)

def exh_runner(k, scale, bm=None, face_ext=0.0, smooth=True):
    cv, s, _ = valve(k, "E"); hc = K["exh_hc"]; up = K["exh_u"][k]; rt = K["vE"]["seat_id"] / 2
    f = K["exh_face"]                                 # short port: up off the seat, then back over to the exhaust side
    ctrl = [V(up, f - face_ext, hc), V(up, f + 0.35, hc), V(0.5 * (up + cv.x), -1.15, hc - 0.25),
            cv + s * 0.95 + V(0, -0.35, 0), cv + s * 0.40, cv + s * 0.12, cv - s * 0.10]   # on down the stem axis past the
                                                      # valve face (smoothed, then cut back to the seat, as the intake)
    w0, h0_, r0 = K["exh_w"], K["exh_h"], K["exh_r"]
    def prof(t):
        w = interp(t, [0, .2, .5, .8, 1], [w0, w0 - .03, 1.72 * scale, 1.62, 2 * rt])
        h = interp(t, [0, .2, .5, .8, 1], [h0_, h0_ - .02, 1.62 * scale, 1.58, 2 * rt])
        r = interp(t, [0, .2, .5, .8, 1], [r0, .5, .62, .72, rt])
        return w, h, min(r, w / 2, h / 2)
    return runner(ctrl, V(1, 0, 0), prof, bm, segs=smooth, per=24 if smooth else 12)

def port_solid(k, kind, scale, tmp, face_ext=0.0, smooth=True):
    """Runner + throat down to the valve face plane: the port volume (face_ext 0) or its cutter."""
    f = int_runner if kind == "I" else exh_runner
    if isinstance(scale, (list, tuple)): scale = scale[k]
    ext = 0.3 if kind == "E" and smooth else 0.0      # the exhaust is swept .3 past its face and trimmed there (below),
    bm, path, L = f(k, scale, None, face_ext + ext, smooth)   # so the smoothing never rounds the opening
    o = obj("port", bm, tmp)
    if smooth: smooth_solid(o, *((0.03, 24, 0.5) if kind == "E" else ()))   # merge the section hulls and smooth (a plain loft folded on the
                                                       # exhaust's tight bend and left slivers in the bowl)
    sc_link = kind == "E" and smooth and o.name not in bpy.context.scene.collection.objects
    if sc_link: bpy.context.scene.collection.objects.link(o)   # a remeshed object in the hidden tmp collection takes no
                                                       # booleans (they apply as no-ops); keep it in the scene while trimmed.
                                                       # The intake still trims as before (see PARTS.md)
    _b = bmesh.new(); _b.from_mesh(o.data)             # a sweep that bends the other way comes out inside-out: turn it
    if _b.calc_volume(signed=True) < 0:
        bmesh.ops.reverse_faces(_b, faces=_b.faces[:]); _b.to_mesh(o.data)
    _b.free()
    cv, s, _ = valve(k, kind); rt = K["v" + kind]["seat_id"] / 2
    th = obj("th", cyl_axis(cv, s, rt * 1.012, 0.52, 44), tmp)   # overlaps the runner's end, off its ring, so the union is never degenerate
    if kind == "E" and not smooth: boolean(o, "UNION", th)   # a smoothed runner reaches the valve face itself
    bpy.data.objects.remove(th, do_unlink=True)
    bx = obj("bx", zprism(rrect(-9, 24, -9, 12, 0.1, 1), -3.0, 9.0), tmp)      # resolves the sweep's self-overlap on tight bends
    boolean(o, "INTERSECT", bx); bpy.data.objects.remove(bx, do_unlink=True)
    if smooth:                                         # cut back to the valve face (the smoothed end is already round, seat ID)
        sc = obj("seatcut", cyl_axis(cv - s * 0.65, s, 2.0, 0.6, 44), tmp)             # .05 past the valve face, into the
                                                                                        # chamber bowl (no coplanar faces)
        boolean(o, "DIFFERENCE", sc); bpy.data.objects.remove(sc, do_unlink=True)
    if kind == "I":                                    # trimmed at the intake face (face_ext past it for a cutter)
        e = face_ext + 0.001
        hs = obj("hs", hull3([V(u, v, z) for u in (-9.0, 24.0) for v, z in ((-9.0, -3.0), (-9.0, 9.0), (face_v(9.0) + e, 9.0), (face_v(-3.0) + e, -3.0))]), tmp)
        boolean(o, "INTERSECT", hs); bpy.data.objects.remove(hs, do_unlink=True)
    if ext:                                            # trimmed square at the exhaust face (face_ext past it for a cutter)
        fv = K["exh_face"] - face_ext - 0.001
        hs = obj("hs", zprism(rrect(-9, 24, fv, 12, 0.1, 1), -3.0, 9.0), tmp)
        boolean(o, "INTERSECT", hs); bpy.data.objects.remove(hs, do_unlink=True)
    if kind == "E":                                    # the front exhaust-side stud stands in the wall of port 1's bowl
        for h in STUDS:
            if -2.5 < h["v"] < 0 and abs(h["u"] - cv.x) < 1.4:
                pl = obj("pil", zprism(circ(h["u"], h["v"], K["stud_hole"] + 0.10, 32), -0.5, 7.0), tmp)
                boolean(o, "DIFFERENCE", pl); bpy.data.objects.remove(pl, do_unlink=True)
    if sc_link: bpy.context.scene.collection.objects.unlink(o)
    return o, path, L - ext

# ---------- pushrods (both banks' lifters, in left-head coordinates) ----------
def lifter_cups():
    """Lifter cup (top) of every lifter, keyed by (bank, cyl, valve), world inches."""
    out = {}
    top_t = LIFT["lifters"][0]["top_t_base"]
    for L in CAMNS["lifter_axes"]():
        ax, w = L["ax"], L["w"]
        x = ax[0] * top_t + w[0] * L["e"]; z = CAMNS["CAMZ"] + ax[1] * top_t + w[1] * L["e"]
        out[(L["bank"], L["cyl"], L["valve"])] = V(x, L["y"], z)
    return out

R_OF = {0: 8, 1: 6, 2: 4, 3: 2}                       # right-bank cylinder that sits at left-head slot k once turned
PUSH_TOP = dict(I=((0.25, 4.60, 5.20), (6.70, 4.60, 5.20), (10.25, 4.60, 5.20), (16.40, 4.60, 5.20)),
                E=(None, None, None, None))           # [est] intake cups just outside the paired ports; exhaust cups over their lifters
E_CUP_V, E_CUP_H = 2.60, 5.45
E_CUP_DU = -0.60                                      # the exhaust arms aim .6" forward of their lifters' mid-point, so the pushrods miss the intake ports

def design_lines():
    """Lifter cup to the design cup position: only sets the direction each rocker points in plan."""
    cups = lifter_cups(); lines = {}
    for k, cyl in enumerate((1, 3, 5, 7)):
        for kind in "IE":
            a = to_local(cups[("L", cyl, kind)], "L"); b = to_local(cups[("R", R_OF[k], kind)], "R")
            if kind == "I": top = V(*PUSH_TOP["I"][k])
            else: top = V(0.5 * (a.x + b.x) + E_CUP_DU, E_CUP_V, E_CUP_H)
            lines[(k, kind)] = [(a, top), (b, top)]
    return lines

def pushrod_lines():
    """Each bank's lifter cup to the cup of the (one, shared) rocker on that valve."""
    return {kk: g["lines"] for kk, g in rocker_geo().items()}

def line_at_h(a, b, h):
    t = (h - a.z) / (b.z - a.z); return a + (b - a) * t


# ---------- build ----------
def flat_exhaust_edge(outline):
    """The gasket outline with its exhaust edge made straight: the two ears that hang below it (u 1.7-3.0 and
    11.5-12.8, to v -3.88) are only the gasket's rivets, and the head and block edge is flat there (Drew), as it
    is through the small ripple at u 4.8-5.0. Keeps the end points of that run, drops everything between."""
    o = [tuple(p) for p in outline]
    a = next(i for i, (u, v) in enumerate(o) if abs(u + 0.819) < 0.01 and v < -3.0)
    b = next(i for i, (u, v) in enumerate(o) if abs(u - 15.313) < 0.01 and v < -3.0)
    return o[:a + 1] + o[b:]

def head_outline():
    o = flat_exhaust_edge(GASK["outline"])
    i0 = next(i for i in range(len(o)) if o[i][1] <= 0.3 and o[i - 1][1] > 0.3)
    run = []
    i = i0
    while o[i % len(o)][1] <= 0.3:
        run.append(o[i % len(o)]); i += 1
    uf, ur = run[0][0], run[-1][0]
    return ccw(run + [(ur, K["v_int"]), (uf, K["v_int"])]), uf, ur

def edge_dist(poly, x, y):
    """Distance from (x, y) to the nearest edge of a polygon."""
    best = 1e9
    for i in range(len(poly)):
        (x0, y0), (x1, y1) = poly[i], poly[(i + 1) % len(poly)]
        dx, dy = x1 - x0, y1 - y0; L2 = dx * dx + dy * dy or 1e-12
        t = max(0.0, min(1.0, ((x - x0) * dx + (y - y0) * dy) / L2))
        best = min(best, math.hypot(x - x0 - t * dx, y - y0 - t * dy))
    return best

def lead_in(k, kind):
    """Cone cutter: the machined lead-in round a spring pocket."""
    cv, s, _ = valve(k, kind); sp = cv + s * K["spring_h"][kind]; a0, a1, dr = K["spring_lead"]; r0 = K["spring_r"] + 0.06
    return loft([ring_pts(sp + s * a0, s, r0, 48), ring_pts(sp + s * a1, s, r0 + dr, 48), ring_pts(sp + s * 3.0, s, r0 + dr, 48)])

def rail_polys():
    """Valve-cover rail (outer) and rocker box (inner): a racetrack, flush with the intake face."""
    _, uf, ur = head_outline(); e, w = K["rail_end"], K["wall"]
    outer = ccw(rrect(uf + e, ur - e, K["rail_v_exh"], K["rail_v_int"], K["rail_corner"], 10))
    inner = ccw(rrect(uf + e + w, ur - e - w, K["rail_v_exh"] + w, K["rail_v_int"] - w, K["rail_corner"] - w, 10))
    return outer, inner, uf + e, ur - e

def cover_bolt_pts():
    """Valve-cover bolt centres (u, v): inset from the rail's outer edge onto the inside lugs, four on the exhaust side and three on the intake side."""
    _, _, u0, u1 = rail_polys(); L = u1 - u0; w = K["wall"]
    ci = K["cover_inset"]
    return [(u1 - f * L, K["rail_v_exh"] + ci) for f in K["cover_bolts"]["E"]] + \
           [(u1 - f * L, K["rail_v_int"] - ci) for f in K["cover_bolts"]["I"]]

def tune(f, target, lo, hi, it=14):
    vlo, vhi = f(lo), f(hi)
    for _ in range(it):
        mid = 0.5 * (lo + hi); vm = f(mid)
        if (vm - target) * (vlo - target) > 0: lo, vlo = mid, vm
        else: hi, vhi = mid, vm
    return 0.5 * (lo + hi)

# Head ends [Drew's photos of the rear of his engine]: each end carries a flat machined triangle: along the deck from
# the exhaust-side lip to the intake face, a short edge up the exhaust side leaning in, and a long top edge running back
# down to the intake-deck corner. Above that edge the casting rolls back (as cast) to the foot of the valve-cover
# flange, following the cover's rounded end in plan, so the intake face's end edge is that same curve. A small
# chamfer round the deck and exhaust edges, three 3/8-16 accessory holes, one near each corner, and an engraving.
# One casting serves both banks (the right head is the left turned round), so both ends carry it. Sizes [est],
# scaled off the photos on the deck edge. The engraving is our own: the photo's is the maker's logo and part number.
END = dict(
    face=((-2.05, 0.0), (5.45, 0.0), (4.90, 1.00), (-1.90, 3.40)),   # (v, z), z from the block deck: exhaust-deck,
                                                         # intake-deck, the short edge up off the china wall [Drew's 3rd
                                                         # photo: it leans back from the intake face], apex. The machined
                                                         # face stops at the exhaust wall: it does not run out to the deck's
                                                         # exhaust edge (Drew's close-up of the front corner)
    inner=((-1.95, 0.0), (5.45, 0.0), (4.90, 1.00), (-1.45, 3.40)),   # where the corner has faired into the exhaust wall (v_exh)
    chamfer_edges=(True, False, False, True),            # deck, the two top edges (meet the cast roll-back), exhaust side
    full=0.60, blend=1.40, chamfer=0.08,
    roll0=20.0, roll_top=3.40, roll_exh=0.85,            # roll-back: leaves the face at 20 deg, meets the flange foot at the
                                                         # shelf height; .85" in from the end beyond the rail's exhaust side
    holes=((4.60, 0.45), (-1.60, 0.45), (-1.50, 2.80)), hole_r=0.156, hole_d=0.55,
    mark=dict(text="345", at=(-0.45, 1.60), h=1.25, line=0.035, depth=0.030),        # outline-cut lettering
    small=dict(text="CNC\n2.30 - 1.88", at=(-1.15, 0.90), h=0.20, depth=0.020),     # solid-cut
)

def end_axes(s):
    """Lettering axes (baseline, up) in (v, z) on the end whose face points along s*u, level as installed."""
    return Vector((0.7071 * s, -0.7071 * s)), Vector((0.7071, 0.7071))

def end_blocks(uf, ur, tmp):
    """Each end's casting behind the machined face: the face's outline for END["full"], then faired by a cosine
    blend into the casting by END["blend"]. The face starts at the exhaust wall, so nothing stands out beside it
    on the exhaust side; the deck lip runs on to the end below it (Drew's close-up of the front corner)."""
    face, inner = END["face"], END["inner"]
    D, F = END["blend"], END["full"]
    ds = [0.0, F] + [F + (D - F) * k / 8 for k in range(1, 9)]
    for ue, s in ((ur, 1), (uf, -1)):
        rings = []
        for d in ds:
            f = 1.0 if d <= F else 0.5 * (1 + math.cos(math.pi * (d - F) / (D - F)))
            poly = [(vi + (vf - vi) * f, z) for (vf, z), (vi, _) in zip(face, inner)]
            rings.append([V(ue - s * d, v, max(z, H0)) for v, z in poly])
        obj("endb", loft(rings), tmp)

def end_sweep(uf, ur, tmp):
    """Cutters for the cast roll-back above each end's machined triangle: in each slice across the bank (fixed v) the
    surface leaves the triangle's top edge at roll0 and curves back, a quarter ellipse, to the foot of the cover flange
    at roll_top, where the rail's rounded end (or, past its exhaust side, roll_exh) sets how far in that is."""
    (bv, bz), (av, az), (kv, kz), (cv, cz) = END["face"]
    th0 = math.radians(END["roll0"]); zt_top = END["roll_top"]
    e, R = K["rail_end"], K["rail_corner"]; v0, v1 = K["rail_v_exh"] + R, K["rail_v_int"] - R
    def z_edge(v):                                     # the face's top edge: up off the china wall, then on to the apex
        v = min(v, av)
        z = az + (kz - az) * (v - av) / (kv - av) if v >= kv else kz + (cz - kz) * (v - kv) / (cv - kv)
        return max(H0, z)
    vstart = kv + (zt_top - 0.08 - kz) * (cv - kv) / (cz - kz)
    vs = list(np.linspace(vstart, v0, 9)) + list(np.linspace(v0, v1, 6))[1:] + list(np.linspace(v1, kv, 8))[1:] + list(np.linspace(kv, av, 6))[1:] + [av + 0.45]
    for ue, s in ((ur, 1), (uf, -1)):
        rings = []
        for v in vs:
            d = min(R, max(0.0, v0 - v, v - v1))
            inset = e + R - math.sqrt(R * R - d * d)
            if v < v0: inset = min(inset, END["roll_exh"])
            zt = z_edge(v); du, dz = inset + 0.004, zt_top - zt
            ring = [V(ue + s * 0.5, v, zt)]
            for k in range(13):
                th = th0 + (math.pi / 2 - th0) * k / 12
                ring.append(V(ue - s * du * (math.cos(th0) - math.cos(th)) / math.cos(th0), v,
                              zt + dz * (math.sin(th) - math.sin(th0)) / (1 - math.sin(th0))))
            ring += [V(ue - s * du, v, zt_top + 3.0), V(ue + s * 0.5, v, zt_top + 3.0)]
            rings.append(ring)
        obj("eroll", loft(rings), tmp)

def text_obj(name, body, h, offset, extrude, ue, s, at, tmp):
    """Lettering as a closed mesh: cap height h, centred on at (v, z), spanning u from ue-s*extrude to ue+s*extrude."""
    cu = bpy.data.curves.new(name, "FONT"); cu.body = "8"; cu.size = 1.0
    ob = bpy.data.objects.new(name, cu); tmp.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get(); me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    cap = max(v.co.y for v in me.vertices) - min(v.co.y for v in me.vertices); bpy.data.meshes.remove(me)
    cu.body = body; cu.size = h / cap; cu.align_x = "CENTER"; cu.offset = offset; cu.extrude = 0.0
    cu.resolution_u = 3; cu.fill_mode = "BOTH"
    dg = bpy.context.evaluated_depsgraph_get(); flat = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob); bpy.data.curves.remove(cu)
    bm = bmesh.new(); bm.from_mesh(flat); bpy.data.meshes.remove(flat)      # the flat fill, extruded here: closed letters
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    for v in bm.verts: v.co.z = -extrude
    r = bmesh.ops.extrude_face_region(bm, geom=list(bm.faces))
    for v in r["geom"]:
        if isinstance(v, bmesh.types.BMVert): v.co.z = extrude
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    b, up = end_axes(s)
    for v in me.vertices:
        x, y, z = v.co.x - cx, v.co.y - cy, v.co.z
        w = Vector((at[0], at[1])) + b * x + up * y
        v.co = Vector((ue + s * z, w.x, w.y)) * IN
    o = bpy.data.objects.new(name, me); tmp.objects.link(o)
    return o

def end_finish(head, tmp, uf, ur):
    """Chamfer round each end face, then the accessory holes and the engraving."""
    c, poly = END["chamfer"], [Vector((v, max(z, H0))) for v, z in END["face"]]
    for ue, s in ((ur, 1), (uf, -1)):
        for i in range(len(poly)):
            if not END["chamfer_edges"][i]: continue
            a, b = poly[i], poly[(i + 1) % len(poly)]
            t = (b - a).normalized(); n = Vector((t.y, -t.x))          # outward: the face outline runs ccw in (v, z)
            pts = []
            for e in (a - t * 0.3, b + t * 0.3):
                for q, du in ((e, -c), (e - n * c, 0.0), (e + n * 0.5, 0.5), (e + n * 0.5, -c), (e - n * c, 0.5)):
                    pts.append(V(ue + s * du, q.x, q.y))
            obj("ech", hull3(pts), tmp)
        for v, z in END["holes"]:
            obj("eh", cyl_axis(V(ue + s * 0.1, v, z), V(-s, 0, 0), END["hole_r"], END["hole_d"] + 0.1, 20), tmp)
    boolean(head, "DIFFERENCE", tmp); clear(tmp)
    for ue, s in ((ur, 1), (uf, -1)):
        m = END["mark"]; e = 0.10
        o = text_obj("eng_o", m["text"], m["h"], m["line"] / 2, e, ue + s * (e - m["depth"]), s, m["at"], tmp)
        i = text_obj("eng_i", m["text"], m["h"], -m["line"] / 2, e + 0.05, ue + s * (e - m["depth"]), s, m["at"], tmp)
        boolean(o, "DIFFERENCE", i); bpy.data.objects.remove(i, do_unlink=True)
        m = END["small"]
        text_obj("eng_s", m["text"], m["h"], 0.0, e, ue + s * (e - m["depth"]), s, m["at"], tmp)
    boolean(head, "DIFFERENCE", tmp); clear(tmp)

def build_left(root, tmp, info):
    outl, uf, ur = head_outline()
    core = ccw(hull(clip(outl, 0, -1, -K["v_exh"])))       # the casting below the shelf
    rail_ol, cav, _, _ = rail_polys()
    head = obj("CylinderHead_L", zprism(outl, H0, H0 + K["lip"]), root)
    obj("core", zprism(core, H0, K["shelf"]), tmp)
    obj("upper", zprism(rail_ol, K["shelf"] - 0.5, K["rail"]), tmp)   # the rocker box, inboard of the middle-row bolts
    end_blocks(uf, ur, tmp)                            # the flat machined end faces (END)
    boolean(head, "UNION", tmp); clear(tmp)
    end_sweep(uf, ur, tmp)                             # the cast roll-back above them, to the cover flange
    boolean(head, "DIFFERENCE", tmp); clear(tmp)
    # the intake face: square to the deck on the deck/china-wall line, one plane from the deck to the cover-flange
    # top; machined up to int_face_top, cast band above (material pass)
    zt = K["rail"] + 2
    obj("iface", hull3([V(u, v, z) for u in (-9.0, 24.0) for v, z in ((face_v(-1.0), -1.0), (face_v(zt), zt), (12.0, zt), (12.0, -1.0))]), tmp)
    boolean(head, "DIFFERENCE", tmp); clear(tmp)

    # exhaust flanges, the cast fin above each middle-row bolt
    for k in range(4):
        up, hc = K["exh_u"][k], K["exh_hc"]; w, h = K["exh_w"], K["exh_h"]
        pts = rrect(up - w / 2 - .28, up + w / 2 + .28, hc - h / 2 - .28, hc + h / 2 + .28, .80, 8)
        for du, dh in K["hdr_bolts"]: pts += circ(up + du, hc + dh, 0.36, 20)
        obj("pad", vprism(ccw(hull(pts)), K["v_exh"] + 0.10, K["exh_face"]), tmp)
        # no plug boss: the plugs thread straight into the side wall between the ports [Drew]
    for h in MID:
        v0 = K["rail_v_exh"]
        obj("fin", hull3([V(h["u"] + du, v, z) for du in (-0.07, 0.07)
                          for v, z in ((v0 + 0.02, K["shelf"] - 0.1), (v0 - 0.16, K["shelf"] - 0.1), (v0 + 0.02, K["rail"] - 0.15))]), tmp)
    boolean(head, "UNION", tmp); clear(tmp)

    # rocker box, and the cover-bolt tabs on the rail
    bot = [V(x, y, floor_h(y)) for x, y in cav]; top = [V(x, y, K["rail"] + 1) for x, y in cav]
    o = obj("box", loft([bot, top]), tmp); boolean(head, "DIFFERENCE", o); clear(tmp)
    for u, v in cover_bolt_pts():
        obj("tab", zprism(circ(u, v, K["cover_tab_r"], 24), K["rail"] - K["cover_tab_h"], K["rail"]), tmp)
    boolean(head, "UNION", tmp); clear(tmp)
    for h in MID:                                      # spot faces for the middle-row nuts
        obj("msf", zprism(circ(h["u"], h["v"], 0.50, 32), K["mid_seat"], K["rail"] + 1.0), tmp)
    boolean(head, "DIFFERENCE", tmp); clear(tmp)

    # bosses in the box: studs, spring seats, guides, rocker studs
    studs = STUDS
    info["studs"] = [(round(h["u"], 3), round(h["v"], 3)) for h in studs]
    low, high = LOW, HIGH
    for h in high:
        obj("sb", zprism(circ(h["u"], h["v"], K["boss_r"], 32), H0 + 1.0, floor_h(h["v"]) + 0.10), tmp)
    for k in range(4):
        for kind in "IE":
            cv, s, _ = valve(k, kind); sp = cv + s * K["spring_h"][kind]
            rt, rf, ln = K["spring_boss"]
            obj("spb", loft([ring_pts(sp - s * ln, s, K["spring_r"] + rf, 48), ring_pts(sp - s * 0.5, s, K["spring_r"] + rt + 0.10, 48),
                             ring_pts(sp, s, K["spring_r"] + rt, 48)]), tmp)
            obj("gb", cyl_axis(sp - s * 0.05, s, 0.34, 0.62, 24), tmp)
    lines = pushrod_lines(); pivots = {}
    for (k, kind), g in rocker_geo().items():
        pv = rocker_stud(g["tr"], g["s"], g["side"])[2]; pivots[(k, kind)] = pv
        obj("rb", zprism(circ(pv.x, pv.y, 0.45, 32), floor_h(pv.y) - 0.5, floor_h(pv.y) + 0.60), tmp)
    boolean(head, "UNION", tmp); clear(tmp)
    info["rocker_pivots"] = {f"{k}{kind}": [round(c, 2) for c in p] for (k, kind), p in pivots.items()}

    # tune and cut: chambers
    def cc(wh):
        c = chamber_cutter(0, wh, tmp, H0); v = vol(c); clear(tmp); return v / 0.0610237
    wall_h = tune(cc, K["chamber_cc"], 0.02, 0.70, 12)
    info["chamber_wall_h"] = round(wall_h, 4); info["chamber_cc"] = round(cc(wall_h), 1)
    # ports
    def pcc(kind):
        def f(sc):
            vs = []
            for k in range(4):
                o, _, _ = port_solid(k, kind, sc, tmp); vs.append(vol(o)); clear(tmp)
            return float(np.mean(vs)) / 0.0610237
        return f
    def pk(k, smooth=False):                        # each intake port sized alone (the paired runners bend differently)
        def f(sc):
            o, _, _ = port_solid(k, "I", sc, tmp, smooth=smooth); v = vol(o); clear(tmp); return v / 0.0610237
        return f
    def size_int(k):
        """Bisect on the remeshed, smoothed port, then the closest of a few sizes nearby: the voxels leave
        ~3cc of fine-grained noise in its volume."""
        sm, T = pk(k, True), K["int_cc"]
        c = tune(sm, T, 0.70, 1.45, 10); best = (abs(sm(c) - T), c)
        for d in (-0.006, -0.004, -0.002, 0.002, 0.004, 0.006):
            best = min(best, (abs(sm(c + d) - T), c + d))
        return best[1]
    def pe(k):
        def f(sc):
            o, _, _ = port_solid(k, "E", sc, tmp); v = vol(o); clear(tmp); return v / 0.0610237
        return f
    sI = [size_int(k) for k in range(4)]
    sE = [tune(pe(k), K["exh_cc"], 0.45, 1.40, 10) for k in range(4)]
    info["port_scale"] = dict(I=[round(x, 4) for x in sI], E=[round(x, 4) for x in sE])
    iv, ev, lens = [], [], {}
    for k in range(4):
        o, _, L = port_solid(k, "I", sI, tmp); iv.append(round(vol(o) / 0.0610237, 1)); lens[f"I{k}"] = round(L, 2); clear(tmp)
        o, _, L = port_solid(k, "E", sE, tmp); ev.append(round(vol(o) / 0.0610237, 1)); lens[f"E{k}"] = round(L, 2); clear(tmp)
    info["intake_cc"] = iv; info["exhaust_cc"] = ev; info["runner_len"] = lens
    info["intake_min_csa"] = round(min(1.515 * 2.30 - (4 - math.pi) * 0.50 ** 2, (max(1.68 * min(sI), 1.72) * max(2.05 * min(sI), 2.08)) - (4 - math.pi) * 0.60 ** 2), 3)

    cutters = []
    for k in range(4):
        cutters.append(chamber_cutter(k, wall_h, tmp, H0 - 0.15))
        cutters.append(port_solid(k, "I", sI, tmp, face_ext=0.15)[0])
        cutters.append(port_solid(k, "E", sE, tmp, face_ext=0.15)[0])
    boolean(head, "DIFFERENCE", tmp); clear(tmp)
    info["cutters_1"] = len(cutters)

    # spring pockets, stem holes, plug holes, stud holes, nut pockets, pushrod slots, rocker-stud taps
    for k in range(4):
        for kind in "IE":
            cv, s, _ = valve(k, kind); sp = cv + s * K["spring_h"][kind]
            obj("spk", cyl_axis(sp, s, K["spring_r"], 3.0, 48), tmp)
            obj("spf", cyl_axis(sp + s * K["spring_cbore"], s, K["spring_r"] + 0.06, 3.0, 48), tmp)
            obj("stem", cyl_axis(cv + s * 0.3, s, 0.172, K["spring_h"][kind] + 1.0, 16), tmp)
        tip, dr, ex = plug_line(k); P = K["plug"]
        obj("pth", cyl_axis(tip - dr * 0.2, dr, P["thread_r"], P["reach"] + 0.25, 32), tmp)   # into the seat bore: no coplanar end
        obj("pse", seg_cyl(tip + dr * P["reach"], ex + dr * 0.6, P["seat_r"], 32), tmp)
    lim = obj("lim", zprism(cav, 0.0, K["rail"] + 2.0), root)
    keep = bmesh.new()
    for h in high: zprism(circ(h["u"], h["v"], K["boss_r"] + 0.04, 32), 0.0, 9.0, keep)
    for pv in pivots.values(): zprism(circ(pv.x, pv.y, 0.49, 32), 0.0, 9.0, keep)
    keep = obj("keep", keep, root)
    for k in range(4):
        for kind in "IE":
            o = obj("lead", lead_in(k, kind), tmp)
            boolean(o, "DIFFERENCE", keep); boolean(o, "INTERSECT", lim)
    bpy.data.objects.remove(lim, do_unlink=True); bpy.data.objects.remove(keep, do_unlink=True)
    for h in studs:
        obj("shl", zprism(circ(h["u"], h["v"], K["stud_hole"], 24), H0 - 0.2, stud_top(h)), tmp)
    for h in low:
        obj("np", zprism(circ(h["u"], h["v"], K["nut_pocket"], 32), H0 + K["lip"], H0 + K["lip"] + K["nut_pocket_h"]), tmp)
    for h in high:                                     # socket relief where a stud stands close to the box wall (rear end)
        if edge_dist(cav, h["u"], h["v"]) < K["nut_pocket"] + 0.05:
            obj("np", zprism(circ(h["u"], h["v"], K["nut_pocket"], 32), floor_h(h["v"]) + 0.101, K["rail"] + 0.5), tmp)
    for (k, kind), ln in pushrod_sweep().items():
        for half in (ln[:len(ln) // 2], ln[len(ln) // 2:]):           # left- and right-bank pushrod, swept over the lift
            pts = []
            for a, b in half:
                for hh in (-0.4, floor_h(4.5) + 1.0):
                    p = line_at_h(a, b, hh); pts += ring_pts(p, b - a, K["pushrod_r"], 20)
            obj("prs", hull3(pts), tmp)
    for (k, kind), pv in pivots.items():
        obj("rst", zprism(circ(pv.x, pv.y, 0.19, 20), floor_h(pv.y) - 0.40, floor_h(pv.y) + 0.7), tmp)
    boolean(head, "DIFFERENCE", tmp); clear(tmp)

    # header and intake bolt holes, end water ports, deck water ports, dowels, valve-cover bolts
    for k in range(4):
        for du, dh in K["hdr_bolts"]:
            obj("hb", loft([ring_pts(V(K["exh_u"][k] + du, K["exh_face"] - 0.1, K["exh_hc"] + dh), V(0, 1, 0), 0.156, 16),
                            ring_pts(V(K["exh_u"][k] + du, K["exh_face"] + 0.75, K["exh_hc"] + dh), V(0, 1, 0), 0.156, 16)]), tmp)
    for u, h in K["int_bolts"]:
        obj("ib", loft([ring_pts(V(u, face_v(h) + 0.1, h), -FACE_N, 0.156, 16), ring_pts(V(u, face_v(h), h) - FACE_N * 0.9, -FACE_N, 0.156, 16)]), tmp)
    ep = K["end_ports"]
    for u in ep["u"]:
        obj("ewp", vprism(rrect(u - ep["w"] / 2, u + ep["w"] / 2, ep["h"] - ep["ht"] / 2, ep["h"] + ep["ht"] / 2, 0.15, 4),
                          face_v(ep["h"]) + 0.1, face_v(ep["h"]) - ep["depth"]), tmp)
    for i, h in enumerate(GASK["holes"]):
        if h["kind"] in ("coolant",) and i not in (2, 3, 29, 30):   # 3/29 are the dowels, 2/30 studs (deck drawing)
            if "contour" in h and len(h["contour"]) > 5:
                obj("wp", zprism(ccw([tuple(p) for p in h["contour"]]), H0 - 0.1, H0 + 0.60), tmp)
    for dw in BDECK["dowels"]:
        obj("dw", zprism(circ(dw["u"], dw["v"], BLK["dowel_d"] / 2, 32), H0 - 0.1, H0 + 0.30), tmp)
    for u, v in cover_bolt_pts():
        obj("vcb", zprism(circ(u, v, K["cover_tap"], 16), K["rail"] - 0.65, K["rail"] + 0.1), tmp)
    boolean(head, "DIFFERENCE", tmp); clear(tmp)
    end_finish(head, tmp, uf, ur)
    info["head_outline_u"] = (round(uf, 3), round(ur, 3))
    info["breaches"] = breaches(tmp, studs, low, lines, sI, sE)
    return head, studs, low, high, lines, (sI, sE, wall_h)


def breaches(tmp, studs, low, lines, sI, sE, gap=0.06):
    """Cutters that would break into a port: each port grown by `gap` (wall left) against the
    stud holes, nut pockets, pushrod slots, plug bores and spring pockets."""
    def bvh(o):
        bm = bmesh.new(); bm.from_mesh(o.data)
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        t = BVHTree.FromPolygons([v.co / IN for v in bm.verts], [[v.index for v in f.verts] for f in bm.faces]); bm.free(); return t
    ports = {}
    for k in range(4):
        for kind, sc in (("I", sI), ("E", sE)):
            o, _, _ = port_solid(k, kind, sc, tmp)
            for v in o.data.vertices: v.co += v.normal * gap * IN
            ports[f"{kind}{k}"] = bvh(o)
    others = {}
    for h in studs: others[f"stud{h['u']:.1f},{h['v']:.1f}"] = obj("x", zprism(circ(h["u"], h["v"], K["stud_hole"], 24), H0, stud_top(h)), tmp)
    for h in low: others[f"nut{h['u']:.1f}"] = obj("x", zprism(circ(h["u"], h["v"], K["nut_pocket"], 32), H0 + K["lip"], H0 + K["lip"] + K["nut_pocket_h"]), tmp)
    for (k, kind), ln in pushrod_sweep().items():
        for j, half in enumerate((ln[:len(ln) // 2], ln[len(ln) // 2:])):
            pts = []
            for a, b in half:
                for hh in (-0.4, floor_h(4.5) + 1.0): pts += ring_pts(line_at_h(a, b, hh), b - a, K["pushrod_r"], 20)
            others[f"push{k}{kind}{'LR'[j]}"] = obj("x", hull3(pts), tmp)
    for k in range(4):
        tip, dr, ex = plug_line(k)
        others[f"plug{k}"] = obj("x", seg_cyl(tip + dr * K["plug"]["reach"], ex + dr * 0.6, K["plug"]["seat_r"], 32), tmp)
        for kind in "IE":
            cv, s, _ = valve(k, kind)
            others[f"spring{k}{kind}"] = obj("x", cyl_axis(cv + s * K["spring_h"][kind], s, K["spring_r"], 3.0, 48), tmp)
            others[f"lead{k}{kind}"] = obj("x", lead_in(k, kind), tmp)
    out = []
    for pn, pt in ports.items():
        for on, o in others.items():
            if pt.overlap(bvh(o)): out.append(f"{pn}-{on}")
    clear(tmp)
    return out


def assign_head_materials(head, cast, mach):
    head.data.materials.clear(); head.data.materials.append(cast); head.data.materials.append(mach)
    me = head.data; idx = []
    _, uf, ur = head_outline()
    cyls = [V(u, 0, 0) for u in CYL_U]
    for p in me.polygons:
        c = p.center / IN; n = p.normal; m = 0
        if n.z < -0.99 and abs(c.z - H0) < 0.004: m = 1                       # deck
        elif n.dot(FACE_N) > 0.999 and abs(c.y - face_v(c.z)) < 0.004 and c.z < K["int_face_top"]: m = 1   # intake face
        elif n.y < -0.99 and abs(c.y - K["exh_face"]) < 0.004: m = 1          # exhaust pads
        elif abs(n.x) > 0.999 and min(abs(c.x - ur), abs(c.x - uf)) < 0.004: m = 1   # end faces (END); the engraving stays cast
        elif n.z > 0.99 and abs(c.z - K["rail"]) < 0.004: m = 1               # cover rail
        elif n.z > 0.99 and abs(c.z - K["mid_seat"]) < 0.004: m = 1           # middle-row spot faces
        elif c.z < H0 + 1.25 and any(math.hypot(c.x - q.x, c.y) < K["chamber_r"] + 0.02 for q in cyls): m = 1   # CNC chambers and seats
        idx.append(m)
    me.polygons.foreach_set("material_index", idx)


def build_gasket(name, root, tmp):
    g = obj(name, zprism(ccw([tuple(p) for p in GASK["outline"]]), 0.002, H0 - 0.002), root)
    for i, h in enumerate(GASK["holes"]):
        if h["kind"] == "bore": continue
        if h["kind"] in ("stud", "stud_dowel"):
            obj("gh", zprism(circ(h["u"], h["v"], h["d_eq"] / 2, 24), -0.1, 0.2), tmp)
        else:
            obj("gh", zprism(ccw([tuple(p) for p in h["contour"]]), -0.1, 0.2), tmp)
    for h in STUDS: obj("gs", zprism(circ(h["u"], h["v"], 0.24, 24), -0.1, 0.2), tmp)
    for dw in BDECK["dowels"]: obj("gd", zprism(circ(dw["u"], dw["v"], 0.33, 24), -0.1, 0.2), tmp)
    for u in CYL_U:
        obj("gb", zprism(circ(u, 0, K["gasket_bore"] / 2, 96), -0.1, 0.2), tmp)
    boolean(g, "DIFFERENCE", tmp); clear(tmp)
    # fire rings: a raised stainless ring round each bore (visual, inside the thickness)
    return g


def build_studs(name, root, low, high):
    high = high + MID
    """ARP 235-4713: 7/16 studs, parallel washers, 12-point nuts [spec]; lengths [derived]."""
    bm = bmesh.new()
    def star(u, v, z0, z1):
        pts = [(u + (0.36 if i % 2 == 0 else 0.315) * math.cos(math.pi * i / 12), v + (0.36 if i % 2 == 0 else 0.315) * math.sin(math.pi * i / 12)) for i in range(24)]
        zprism(pts, z0, z1, bm)
    for h, seat in [(h, H0 + K["lip"]) for h in low] + [(h, K["mid_seat"] if h in MID else floor_h(h["v"]) + 0.10) for h in high]:
        u, v = h["u"], h["v"]
        zprism(circ(u, v, 0.2187, 20), -BLK["stud_depth"] + 0.03, seat + 0.12 + 0.44 + (0.02 if h in low else 0.28), bm)
        zprism(circ(u, v, 0.44, 32), seat + 0.001, seat + 0.12, bm)
        star(u, v, seat + 0.121, seat + 0.56)
    return obj(name, bm, root)


def build_dowels(name, root, tmp):
    """Hollow head dowels: the valley-end head studs pass through them [Drew]."""
    bm = bmesh.new()
    for dw in BDECK["dowels"]:
        zprism(circ(dw["u"], dw["v"], BLK["dowel_d"] / 2 - 0.004, 32), -BLK["dowel_depth"] + 0.01, H0 + 0.28, bm)
    o = obj(name, bm, root)
    for dw in BDECK["dowels"]:
        obj("dwi", zprism(circ(dw["u"], dw["v"], K["vt"]["stud_r"] + 0.012, 24), -BLK["dowel_depth"] - 0.1, H0 + 0.4), tmp)
    boolean(o, "DIFFERENCE", tmp); clear(tmp)
    return o


# ---------- valvetrain ----------
def rocker_stud(tr, s, side=None):
    """Rocker stud through the trunnion: direction (half the valve's lean, BBC studs are not parallel to
    their valves, and square to the trunnion axis so the poly lock sits straight between the rocker's side
    plates), trunnion centre and the point where it meets its boss top."""
    sd = s + V(0, 0, 1)
    if side is not None: sd -= side * sd.dot(side)
    sd = sd.normalized()
    zb = K["floor"][0] + 0.60
    return sd, tr, tr - sd * ((tr.z - zb) / sd.z)

def rocker_geo(lines=None):
    """Per valve, the one rocker placed with its roller on the closed valve's tip: frame (a along the arm
    towards the pushrod, side = trunnion axis, s = stem), roller centre, trunnion, cup. The arm points in plan
    towards the design cup; the cup itself, and so the pushrod line, follow from the rocker."""
    T = K["vt"]; out = {}
    for (k, kind), ln in design_lines().items():
        cv, s, _ = valve(k, kind); tipv = cv + s * K["stem_l"][kind]
        d = ln[0][1] - tipv; a = (d - s * d.dot(s)).normalized(); side = s.cross(a).normalized()
        rc = tipv + s * T["roller_r"]
        tr = rc + a * T["tip_arm"] + s * T["tr_up"]
        cup = tr + a * T["cup_arm"] - s * T["cup_dn"]
        out[(k, kind)] = dict(cv=cv, s=s, tip=tipv, rc=rc, tr=tr, cup=cup, a=a, side=side, lines0=ln,
                              lines=[(ln[0][0], cup), (ln[1][0], cup)])
    return out

def frame(o, x, y, z):
    """4x4 (inches to metres) with origin o and axes x, y, z (head-local)."""
    m = Matrix.Identity(4)
    for i in range(3): m[i][0], m[i][1], m[i][2], m[i][3] = x[i], y[i], z[i], o[i] * IN
    return m

def axes_z(z):
    ref = V(0, 0, 1) if abs(z.z) < 0.9 else V(1, 0, 0); x = ref.cross(z).normalized(); return x, z.cross(x), z

def lifter_dir_local(bank, cyl, kind):
    """The lifter's bore axis (upwards) in head-local coordinates."""
    L = next(x for x in CAMNS["lifter_axes"]() if x["bank"] == bank and x["cyl"] == cyl and x["valve"] == kind)
    return to_local(V(L["ax"][0], 0, L["ax"][1]), bank) - to_local(V(0, 0, 0), bank)

def solve_rocker(g, a0, dl, L, lift):
    """Rocker angle (about its trunnion axis) that puts the cup a pushrod length L from the lifted lifter cup.
    Returns angle, lifter cup, rocker cup, roller centre."""
    tr, side, cup0, rc0 = g["tr"], g["side"], g["cup"], g["rc"]
    a = a0 + dl * float(lift)
    f = lambda th: (tr + Matrix.Rotation(th, 3, side) @ (cup0 - tr) - a).length - L
    sg = 1.0 if side.cross(cup0 - tr).dot((cup0 - a0).normalized()) > 0 else -1.0
    lo, hi = 0.0, sg * 0.5
    if f(lo) < 0:
        for _ in range(40):
            mid = 0.5 * (lo + hi)
            if f(mid) < 0: lo = mid
            else: hi = mid
    Rm = Matrix.Rotation(lo, 3, side)
    return lo, a, tr + Rm @ (cup0 - tr), tr + Rm @ (rc0 - tr)

LIFT_MAX = max(r["lift_max"] for r in LIFT["lifters"]) + 0.01

def pushrod_sweep(n=7):
    """(k, kind) -> pushrod lines (lifter cup, rocker cup) for both banks from closed to full lift, so the slots
    in the head and the guide plates clear the pushrod as it moves."""
    out = {}
    for (k, kind), g in rocker_geo().items():
        ls = []
        for j, bank in enumerate("LR"):
            a0, cup = g["lines"][j]; L = (cup - a0).length; dl = lifter_dir_local(bank, CYLS[bank][k], kind)
            for i in range(n):
                _, a, c, _ = solve_rocker(g, a0, dl, L, LIFT_MAX * i / (n - 1)); ls.append((a, c))
        out[(k, kind)] = ls
    return out

CYLS = dict(L=(1, 3, 5, 7), R=tuple(R_OF[k] for k in range(4)))
BANK_M = dict(L=lambda: M_L, R=lambda: ROT_R @ M_L)

def rocker_body_pts():
    """Side profile of the rocker (x along the arm towards the pushrod, z up the stem; origin at the trunnion):
    a squared-off box [Drew's photo of his rockers]: tallest over the trunnion, square ends over the roller and the
    pushrod cup, small corner breaks only. Inches."""
    return [(-1.10, 0.38), (-0.60, 0.44), (0.0, 0.46), (0.55, 0.42), (1.10, 0.34), (1.22, 0.30), (1.25, 0.24),
            (1.25, -0.16), (1.21, -0.22), (1.00, -0.25), (0.75, -0.32), (0.40, -0.52), (-0.45, -0.52), (-0.85, -0.42),
            (-1.25, -0.32), (-1.89, -0.27), (-1.95, -0.21), (-1.95, 0.25), (-1.89, 0.31), (-1.55, 0.34)]

def rocker_mesh(tmp):
    """The one rocker (CSP-S2001NP class, shaped from Drew's photo): a square-ended box, open over the trunnion
    for the stud and poly lock, a fork closed over the top of the roller, and the pushrod end full width with the
    ball socket underneath. Rocker frame (x along the arm, y = trunnion axis, z = stem),
    origin at the trunnion centre. Inches."""
    T = K["vt"]; W = T["rocker_w"] / 2; wi = T["rk_inner"] / 2; xr, zr = -T["tip_arm"], -T["tr_up"]
    prof = rocker_body_pts()
    bm = loft([[V(x, -W, z) for x, z in prof], [V(x, W, z) for x, z in prof]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    body = obj("rk_body", bm, tmp)
    cuts = [zprism(rrect(-0.55, 0.55, -wi, wi, 0.10), -1.0, 1.0),                               # open over the trunnion
            zprism(rrect(xr - 0.6, xr + 0.47, -T["roller_w"] / 2 - 0.02, T["roller_w"] / 2 + 0.02, 0.02), -1.0, zr + 0.22),  # roller pocket
            seg_cyl(V(T["cup_arm"], 0, -T["cup_dn"] - 0.3), V(T["cup_arm"], 0, -T["cup_dn"] + 0.12), 0.24, 24),  # ball socket, room for the shoulder
            # pushrod relief: the pushrod leans up to ~20 deg in the rocker's frame through the lift on the 16 valves
            hull3([V(T["cup_arm"], 0, -T["cup_dn"]) + q for dx, dy in ((-0.36, -0.24), (-0.36, 0.37), (0.26, -0.24), (0.26, 0.37))
                   for d in [V(-dx, -dy, -1).normalized()] for t in (0.12, 1.2) for q in ring_pts(d * t, d, 0.23, 12)])]
    for c_bm in cuts:
        c = obj("rk_cut", c_bm, tmp); boolean(body, "DIFFERENCE", c); bpy.data.objects.remove(c, do_unlink=True)
    m = body.modifiers.new("bev", "BEVEL"); m.width = 0.025 * IN; m.segments = 2; m.limit_method = "ANGLE"; m.angle_limit = math.radians(40)
    with bpy.context.temp_override(object=body, active_object=body): bpy.ops.object.modifier_apply(modifier=m.name)
    out = bmesh.new(); out.from_mesh(body.data); bpy.data.objects.remove(body, do_unlink=True)
    return out

def roller_mesh_rk():
    """Steel parts that ride in the rocker: the small roller on its axle (ends showing through both cheeks)
    and the needle-bearing trunnion across the channel, its caps just proud of the sides. Inches."""
    T = K["vt"]; W = T["rocker_w"] / 2; bm = bmesh.new()
    rc = V(-T["tip_arm"], 0, -T["tr_up"]); hw = T["roller_w"] / 2; r = T["roller_r"]
    loft([ring_pts(rc + V(0, y, 0), V(0, 1, 0), rr, 32) for y, rr in ((-hw, r - 0.03), (-hw + 0.03, r), (hw - 0.03, r), (hw, r - 0.03))], bm)
    seg_cyl(rc - V(0, W + 0.02, 0), rc + V(0, W + 0.02, 0), 0.085, 16, bm)                                 # axle
    seg_cyl(V(0, -(W + 0.03), 0), V(0, W + 0.03, 0), T["trunnion_r"], 24, bm)                               # trunnion
    return bm

def valve_mesh(kind):
    """Valve in its own frame: origin at the seat centre on the face plane, z up the stem. Inches."""
    T = K["vt"]; q = K["v" + kind]; R = q["d"] / 2; Z = V(0, 0, 1); bm = bmesh.new()
    loft([ring_pts(-Z * 0.11, Z, R - 0.03, 48), ring_pts(-Z * 0.05, Z, R, 48), ring_pts(Z * 0.02, Z, R, 48),
          ring_pts(Z * 0.12, Z, R - 0.12, 48), ring_pts(Z * 0.50, Z, 0.36, 48), ring_pts(Z * 0.95, Z, T["stem_r"], 48)], bm)
    seg_cyl(Z * 0.90, Z * K["stem_l"][kind], T["stem_r"], 16, bm)
    return bm

def retainer_mesh(kind):
    T = K["vt"]; Z = V(0, 0, 1); rt = Z * (K["spring_h"][kind] + T["installed"]); bm = bmesh.new()
    loft([ring_pts(rt - Z * 0.22, Z, 0.36, 32), ring_pts(rt - Z * 0.02, Z, 0.50, 32), ring_pts(rt, Z, T["ret_r"], 32),
          ring_pts(rt + Z * T["ret_t"], Z, T["ret_r"], 32), ring_pts(rt + Z * (T["ret_t"] + 0.08), Z, 0.42, 32)], bm)
    return bm

def spring_mesh():
    """Wire helix on its seat (origin), z up, closed ends; the object is scaled in z as the valve opens."""
    T = K["vt"]; rw = T["wire"] / 2; Rm = T["spring_od"] / 2 - rw; s = V(0, 0, 1); bm = bmesh.new()
    n = int(T["turns"] * 16); rings = []
    for i in range(n + 1):
        f = i / n; th = 2 * math.pi * T["turns"] * f
        z = rw + (T["installed"] - 2 * rw) * (3 * f * f - 2 * f ** 3) * 0.35 + (T["installed"] - 2 * rw) * f * 0.65
        rad = V(math.cos(th), math.sin(th), 0); c = s * z + rad * Rm
        rings.append([c + (rad * math.cos(a) + s * math.sin(a)) * rw for a in (2 * math.pi * j / 8 for j in range(8))])
    loft(rings, bm); return bm

def pushrod_mesh(L):
    T = K["vt"]; Z = V(0, 0, 1); bm = bmesh.new(); r = T["pushrod_r"]
    loft([ring_pts(Z * 0.0, Z, 0.08, 16), ring_pts(Z * 0.10, Z, r, 16), ring_pts(Z * (L - 0.10), Z, r, 16), ring_pts(Z * L, Z, 0.08, 16)], bm)
    return bm

def build_valvetrain(root, tmp, lines, info):
    """Static parts (rocker studs, poly locks, guide plates) are returned per bank for place(); the moving
    parts are one object per valve (pushrod, rocker + roller, valve + retainer, spring), each in its own
    frame, keyed on the crank timeline by animate_valvetrain()."""
    T = K["vt"]; G = rocker_geo()
    mats = dict(
        Valves=material("VT_ValveStainless", (0.62, 0.62, 0.63, 1), 1.0, 0.28),
        ValveSprings=material("VT_SpringSteel", (0.16, 0.15, 0.14, 1), 1.0, 0.40),
        Retainers=material("VT_RetainerSteel", (0.07, 0.07, 0.075, 1), 1.0, 0.35),
        RockerStuds=material("VT_StudOxide", (0.05, 0.05, 0.055, 1), 0.9, 0.38),
        RockerArms=material("VT_RockerOrangeAnodize", (0.85, 0.30, 0.03, 1), 1.0, 0.32),
        RockerRollers=material("VT_RollerSteel", (0.70, 0.70, 0.71, 1), 1.0, 0.22),
        PolyLocks=material("VT_PolyLock", (0.06, 0.06, 0.065, 1), 0.9, 0.35),
        Pushrods=material("VT_PushrodSteel", (0.10, 0.10, 0.105, 1), 1.0, 0.33))
    vt = coll("BBC_Valvetrain"); clear(vt)              # its own top-level collection, so the castings can be hidden on their own
    for a in [a for a in bpy.data.actions if a.name.startswith("VT_")]: bpy.data.actions.remove(a)
    for m in [m for m in bpy.data.meshes if m.users == 0]: bpy.data.meshes.remove(m)

    def shared(name, bm, mat):
        me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(mat)
        me.shade_smooth(); me.set_sharp_from_angle(angle=math.radians(35)); return me
    ME = dict(rocker=shared("RockerArm", rocker_mesh(tmp), mats["RockerArms"]), roller=shared("RockerRoller", roller_mesh_rk(), mats["RockerRollers"]),
              spring=shared("ValveSpring", spring_mesh(), mats["ValveSprings"]))
    for kind in "IE":
        ME["valve" + kind] = shared("Valve_" + kind, valve_mesh(kind), mats["Valves"])
        ME["ret" + kind] = shared("Retainer_" + kind, retainer_mesh(kind), mats["Retainers"])

    def mk(name, me, parent=None, m=None):
        o = bpy.data.objects.new(name, me); vt.objects.link(o); o.rotation_mode = "QUATERNION"
        if parent: o.parent = parent; o.matrix_parent_inverse = Matrix.Identity(4)
        else: o.matrix_world = m
        return o

    studs, locks = bmesh.new(), bmesh.new()
    rig = []; plens = {}
    for (k, kind), g in G.items():
        cv, s, tr, side, a_ = g["cv"], g["s"], g["tr"], g["side"], g["a"]
        sd, _, base = rocker_stud(tr, s, side); g["base"] = base
        h0, h1 = T["lock_h"]; rh = T["lock_hex"] / 2 / math.cos(math.pi / 6); rs, hs = T["setscrew"]
        seg_cyl(base - sd * 0.02, tr + sd * (h1 - 0.02), T["stud_r"], 16, studs)              # stud ends under the set screw
        loft([ring_pts(base + sd * 0.10, sd, 0.36, 6), ring_pts(base + sd * 0.38, sd, 0.36, 6)], studs)
        loft([ring_pts(tr + sd * hh, sd, rr, 6) for hh, rr in ((h0, rh - 0.04), (h0 + 0.04, rh), (h1 - 0.04, rh), (h1, rh - 0.04))], locks)
        loft([ring_pts(tr + sd * hh, sd, rr, 24) for hh, rr in ((h1 - 0.02, rs), (h1 + hs - 0.02, rs), (h1 + hs, rs - 0.02),
                                                                 (h1 + hs, 0.075), (h1 + hs - 0.09, 0.075))], locks)   # set screw, hex socket
        Fv = frame(cv, *axes_z(s)); Fs = frame(cv + s * K["spring_h"][kind], *axes_z(s)); Fr = frame(tr, a_, side, s)
        for j, bank in enumerate("LR"):
            Mb = BANK_M[bank](); cyl = CYLS[bank][k]; tag = f"{cyl}{kind}"
            a0, cup = g["lines"][j]; L = (cup - a0).length; plens[f"{bank}{k}{kind}"] = round(L, 3)
            pr = mk(f"Pushrod_{tag}", shared(f"Pushrod_{tag}", pushrod_mesh(L), mats["Pushrods"]), m=Mb @ frame(a0, *axes_z((cup - a0).normalized())))
            rk = mk(f"Rocker_{tag}", ME["rocker"], m=Mb @ Fr); mk(f"RockerRoller_{tag}", ME["roller"], rk)
            va = mk(f"Valve_{tag}", ME["valve" + kind], m=Mb @ Fv); mk(f"Retainer_{tag}", ME["ret" + kind], va)
            sp = mk(f"ValveSpring_{tag}", ME["spring"], m=Mb @ Fs)
            rig.append(dict(bank=bank, k=k, kind=kind, cyl=cyl, g=g, a0=a0, L=L, Mb=Mb, Fr=Fr, Fv=Fv, pr=pr, rk=rk, va=va, sp=sp))
    # no pushrod guide plates: outside this model's scope [Drew]
    info["pushrod_len"] = plens
    info["pushrod_spec"] = dict(I=8.650, E=7.650)
    info["rocker"] = dict(tip_arm=T["tip_arm"], cup_arm=T["cup_arm"], shared_mesh="RockerArm", users=ME["rocker"].users)
    left, right = [], []
    for nm, bm_ in (("RockerStuds", studs), ("PolyLocks", locks)):
        o = obj(nm + "_L", bm_, vt); o.data.materials.append(mats[nm]); left.append(o)
        r = o.copy(); r.data = o.data.copy(); r.name = nm + "_R"; r.data.name = r.name; vt.objects.link(r)
        right.append(r)
    for o in left + right:
        o.data.shade_smooth(); o.data.set_sharp_from_angle(angle=math.radians(35))
    info["valve_motion"] = animate_valvetrain(rig)
    return left, right


def lifter_lift(cyl, kind, frames):
    """Lift (inches) of a lifter along its bore at the given frames, read from its keyed location."""
    o = bpy.data.objects[f"Lifter_{cyl}{kind}"]; ad = o.animation_data
    fcs = ad.action.layers[0].strips[0].channelbag(ad.action_slot).fcurves
    loc = np.array([[fcs.find("location", index=i).evaluate(f) for i in range(3)] for f in frames])
    L = next(x for x in CAMNS["lifter_axes"]() if x["cyl"] == cyl and x["valve"] == kind)
    ax = np.array((L["ax"][0], 0.0, L["ax"][1])); p = loc @ ax / IN
    return p - p.min(), Vector(ax)

def key_object(o, frames, channels):
    """channels: {(data_path, index): values}; linear keys, cycled."""
    ad = o.animation_data_create(); act = bpy.data.actions.new("VT_" + o.name); ad.action = act
    for (path, idx), vals in channels.items():
        fc = act.fcurve_ensure_for_datablock(o, path, index=idx)
        fc.keyframe_points.add(len(frames))
        co = np.empty(2 * len(frames)); co[0::2] = frames; co[1::2] = vals
        fc.keyframe_points.foreach_set("co", co)
        try: fc.keyframe_points.foreach_set("interpolation", [1] * len(frames))
        except Exception:
            for kp in fc.keyframe_points: kp.interpolation = "LINEAR"
        fc.update(); fc.modifiers.new("CYCLES")

def animate_valvetrain(rig, step=1.0):
    """Each lifter's keyed lift drives its pushrod; the rocker turns on its trunnion until the cup is a pushrod
    length from the lifter cup; the roller's travel along the stem opens the valve and closes the spring."""
    T = K["vt"]; degs = np.arange(0.0, 720.0 + step / 2, step); frames = 1 + degs / 7.5; out = {}
    for r in rig:
        g = r["g"]; s, tr, side = g["s"], g["tr"], g["side"]; cup0, rc0 = g["cup"], g["rc"]; a0, L, Mb = r["a0"], r["L"], r["Mb"]
        lift, ax_w = lifter_lift(r["cyl"], r["kind"], frames)
        dl = lifter_dir_local(r["bank"], r["cyl"], r["kind"])
        P = {("location", i): [] for i in range(3)}; P.update({("rotation_quaternion", i): [] for i in range(4)})
        Rk = {("rotation_quaternion", i): [] for i in range(4)}; Vl = {("location", i): [] for i in range(3)}; Sp = {("scale", 2): []}
        vlift = []; qp = qr = None
        for l in lift:
            th, a, cup, rc = solve_rocker(g, a0, dl, L, l)
            vl = max(0.0, -(rc - rc0).dot(s)); vlift.append(vl)
            loc, q, _ = (Mb @ frame(a, *axes_z((cup - a).normalized()))).decompose()
            if qp is not None: q.make_compatible(qp)
            qp = q
            for i in range(3): P[("location", i)].append(loc[i])
            for i in range(4): P[("rotation_quaternion", i)].append(q[i])
            _, q2, _ = (Mb @ r["Fr"] @ Matrix.Rotation(th, 4, "Y")).decompose()
            if qr is not None: q2.make_compatible(qr)
            qr = q2
            for i in range(4): Rk[("rotation_quaternion", i)].append(q2[i])
            lv = (Mb @ r["Fv"] @ Matrix.Translation((0, 0, -vl * IN))).translation
            for i in range(3): Vl[("location", i)].append(lv[i])
            Sp[("scale", 2)].append((T["installed"] - vl) / T["installed"])
        key_object(r["pr"], frames, P); key_object(r["rk"], frames, Rk); key_object(r["va"], frames, Vl); key_object(r["sp"], frames, Sp)
        vlift = np.array(vlift)
        out[f"{r['cyl']}{r['kind']}"] = dict(lifter_max=round(float(lift.max()), 4), valve_max=round(float(vlift.max()), 4),
                                             ratio=round(float(vlift.max() / lift.max()), 3), open_deg=round(float(degs[vlift > 0.001].size * step), 1))
    bpy.context.scene.frame_set(1)
    return out


def place(o, m):
    o.data.transform(m); o.data.update()


def build_spark_plugs(name, root):
    """All eight plugs as one mesh in world space [est shapes; 14mm x .750 reach, gasket seat, 5/8 hex per K["plug"]]:
    plated shell, white insulator, steel terminal. Each threads into its bore with .02 clearance (the faceted bore) and its gasket
    stands .002 off the spot face, so it touches nothing. t runs out along the plug bore from the chamber end."""
    P = K["plug"]; seg = 32
    def lathe(prof, bm, tip, a):
        a = a.normalized(); ref = V(0, 0, 1) if abs(a.z) < 0.9 else V(1, 0, 0)
        e1 = a.cross(ref).normalized(); e2 = a.cross(e1)
        rings = [[tip + a * t + (e1 * math.cos(2 * math.pi * j / seg) + e2 * math.sin(2 * math.pi * j / seg)) * r
                  for j in range(seg)] for t, r in prof]
        return loft(rings, bm), e1, e2
    tr = P["thread_r"] - 0.02; pitch = 0.0492                      # 14 x 1.25; clear of the bore's facets
    shell = [(0.0, 0.205), (0.0, 0.240)]
    t = 0.02
    while t < P["reach"] - 0.06:
        shell += [(t, tr), (t + pitch * 0.35, tr), (t + pitch * 0.5, tr - 0.028), (t + pitch * 0.85, tr - 0.028)]
        t += pitch
    g0 = P["reach"] + 0.002
    shell += [(P["reach"] - 0.04, tr - 0.02), (g0, tr - 0.02), (g0, 0.395), (g0 + 0.07, 0.395), (g0 + 0.07, 0.33),
              (0.90, 0.33), (0.90, 0.29), (1.20, 0.29), (1.20, 0.325), (1.27, 0.325), (1.31, 0.27), (1.31, 0.235)]
    ins = [(1.25, 0.255)]
    for i in range(5):                                             # ribbed insulator
        z = 1.40 + i * 0.17
        ins += [(z, 0.255), (z + 0.09, 0.255), (z + 0.11, 0.238), (z + 0.15, 0.238)]
    ins += [(2.30, 0.245), (2.40, 0.20), (2.44, 0.13)]
    term = [(2.40, 0.10), (2.50, 0.10), (2.50, 0.150), (2.68, 0.150), (2.74, 0.12), (2.78, 0.09)]
    hex_r = 0.625 / 2 / math.cos(math.radians(30))
    out = bmesh.new(); me = bpy.data.meshes.new("_sp")
    for bank, M in (("L", M_L), ("R", ROT_R @ M_L)):
        for k in range(4):
            tip, dr, _ = plug_line(k)
            parts = []
            b = bmesh.new(); _, e1, e2 = lathe(shell, b, tip, dr); parts.append((b, 0))
            hx = [tip + dr * tt + (e1 * math.cos(math.radians(60 * j + 30)) + e2 * math.sin(math.radians(60 * j + 30))) * hex_r
                  for tt in (0.92, 1.18) for j in range(6)]
            b = bmesh.new(); hull3(hx, b); parts.append((b, 0))
            strap = [tip + dr * tt + e1 * x + e2 * y for tt in (-0.005, -0.085) for x in (0.165, 0.225) for y in (-0.05, 0.05)]
            b = bmesh.new(); hull3(strap, b); parts.append((b, 0))
            strap = [tip + dr * tt + e1 * x + e2 * y for tt in (-0.085, -0.135) for x in (-0.02, 0.225) for y in (-0.05, 0.05)]
            b = bmesh.new(); hull3(strap, b); parts.append((b, 0))
            b = bmesh.new(); cyl_axis(tip + dr * 0.01, -dr, 0.040, 0.05, 16, b); parts.append((b, 2))   # centre electrode
            b = bmesh.new(); cyl_axis(tip + dr * 0.08, -dr, 0.16, 0.075, 24, b); parts.append((b, 1))    # insulator nose
            b = bmesh.new(); lathe(ins, b, tip, dr); parts.append((b, 1))
            b = bmesh.new(); lathe(term, b, tip, dr); parts.append((b, 2))
            for b, mi in parts:
                for f in b.faces: f.material_index = mi
                b.transform(M); b.to_mesh(me); b.free(); out.from_mesh(me)
    bpy.data.meshes.remove(me)
    bmesh.ops.recalc_face_normals(out, faces=out.faces)
    o = obj(name, out, root)
    for m in (material("SparkPlug_Shell", (0.74, 0.74, 0.72, 1), 1.0, 0.30),
              material("SparkPlug_Insulator", (0.93, 0.92, 0.88, 1), 0.0, 0.22),
              material("SparkPlug_Terminal", (0.55, 0.56, 0.57, 1), 1.0, 0.35)):
        o.data.materials.append(m)
    o.data.shade_smooth(); o.data.set_sharp_from_angle(angle=math.radians(40))
    return o


def build():
    root = coll("BBC_Heads"); clear(root)
    tmp = coll("Heads_tmp", root, hide=True)
    info = dict(params={k: v for k, v in K.items()})
    head, studs, low, high, lines, scales = build_left(root, tmp, info)
    cast = material("Head_A356_AsCast", (0.60, 0.61, 0.62, 1), 1.0, 0.58)
    mach = material("Head_Machined", (0.80, 0.80, 0.81, 1), 1.0, 0.24)
    assign_head_materials(head, cast, mach)
    gL = build_gasket("HeadGasket_L", root, tmp)
    sL = build_studs("HeadStuds_L", root, low, high)
    dL = build_dowels("HeadDowels_L", root, tmp)
    vtL, vtR = build_valvetrain(root, tmp, lines, info)
    bpy.data.collections.remove(tmp)
    mls = material("HeadGasket_MLS", (0.05, 0.05, 0.055, 1), 0.4, 0.45)
    oxide = material("Heads_StudOxide", (0.04, 0.04, 0.045, 1), 0.8, 0.38)
    steel = material("Heads_DowelSteel", (0.55, 0.56, 0.57, 1), 1.0, 0.35)
    for o, m in ((gL, mls), (sL, oxide), (dL, steel)):
        o.data.materials.clear(); o.data.materials.append(m)
    for o in (head, gL, sL, dL):
        o.data.shade_smooth(); o.data.set_sharp_from_angle(angle=math.radians(32))
    rights = []
    for o in (head, gL, sL, dL):
        r = o.copy(); r.data = o.data.copy(); r.name = o.name[:-2] + "_R"; r.data.name = r.name
        root.objects.link(r); rights.append(r)
    for o in [head, gL, sL, dL] + vtL: place(o, M_L)
    for r in rights + vtR: place(r, ROT_R @ M_L)
    info["lines"] = {f"{k}{kind}": [[round(c, 3) for c in p] for pair in ln for p in pair] for (k, kind), ln in lines.items()}
    info["valvetrain"] = [o.name for o in vtL + vtR]
    plugs = build_spark_plugs("SparkPlugs", root)
    return [head, gL, sL, dL] + rights + [plugs], info


def tree(o):
    bm = bmesh.new(); bm.from_mesh(o.data); bm.transform(o.matrix_world)
    bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method="BEAUTY", ngon_method="BEAUTY")
    t = BVHTree.FromPolygons([v.co / IN for v in bm.verts], [[v.index for v in f.verts] for f in bm.faces]); bm.free(); return t


def checks(parts, step=15.0):
    mesh_world, set_crank = CAMNS["mesh_world"], CAMNS["set_crank"]
    fixed = [n for n in ["Block", "DowelPins", "GalleryPlugs", "FreezePlugs", "TimingCoverFrame", "TimingCoverLid",
                         "TimingCoverBolts", "TimingCoverSeal", "WaterPump", "Distributor"] if n in bpy.data.objects]
    movers = [o.name for o in bpy.data.objects if o.type == "MESH" and o.visible_get() and
              o.name.startswith(("Piston_", "ConRod_", "Lifter", "Camshaft", "CamSprocket", "TimingChain"))]
    PT = {o.name: tree(o) for o in parts}
    hits = set()
    for n in fixed:
        ft = tree(bpy.data.objects[n])
        for o in parts:
            if PT[o.name].overlap(ft): hits.add((o.name, n))
    for i, a in enumerate(parts):
        for b in parts[i + 1:]:
            if PT[a.name].overlap(PT[b.name]): hits.add((a.name, b.name))
    for d in np.arange(0, 720, step):
        set_crank(float(d))
        for n in movers:
            o = bpy.data.objects[n]
            v, f = mesh_world(o)
            if len(f) == 0: continue
            mt = BVHTree.FromPolygons([Vector(x) for x in v], f)
            for p in parts:
                if p.name.startswith(("CylinderHead", "HeadGasket", "SparkPlugs")) and PT[p.name].overlap(mt): hits.add((p.name, n))
    set_crank(0.0)
    allowed = set()
    for s in "LR":
        allowed |= {(f"HeadStuds_{s}", "Block"), (f"HeadDowels_{s}", "Block"), (f"HeadStuds_{s}", f"CylinderHead_{s}"),
                    (f"HeadDowels_{s}", f"CylinderHead_{s}"), (f"HeadDowels_{s}", f"HeadGasket_{s}")}
    return dict(clash=sorted(h for h in hits if h not in allowed and h[::-1] not in allowed), movers=len(movers))


def pushrod_check(head_names=("CylinderHead_L", "CylinderHead_R")):
    """A 3/8" pushrod on every lifter-to-cup line (each bank's own lifter) against the heads."""
    lines = pushrod_lines(); res = []
    trees = {n: tree(bpy.data.objects[n]) for n in head_names}
    for (k, kind), ln in lines.items():
        for j, (a, b) in enumerate(ln):
            bank = "LR"[j]; m = M_L if bank == "L" else ROT_R @ M_L
            bm = bmesh.new(); cyl_axis(a, (b - a), 0.1875, (b - a).length * 0.98, 16, bm); bm.transform(m)
            t = BVHTree.FromPolygons([v.co / IN for v in bm.verts], [[v.index for v in f.verts] for f in bm.faces]); bm.free()
            if t.overlap(trees[f"CylinderHead_{bank}"]): res.append(f"{bank}{k}{kind}")
    return res



if __name__ == "__main__" or "bpy" in globals():
    CAMNS["set_crank"](0.0); bpy.context.view_layer.update()
    parts, info = build()
    info["manifold"] = {o.name: nonmanifold(o) for o in parts}
    info["tris"] = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in parts}
    info["pushrod_clash"] = pushrod_check()
    info["checks"] = checks(parts)
    with open(os.path.join(HERE, "heads_info.json"), "w") as f: json.dump(info, f, indent=1, default=float)
    print(json.dumps({k: info[k] for k in ("breaches", "chamber_cc", "intake_cc", "exhaust_cc", "port_scale", "intake_min_csa", "manifold", "pushrod_clash", "checks", "tris")}, default=float))
