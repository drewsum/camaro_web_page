"""Cylinder heads (AFR 2110, 345cc Magnum BBC, 117cc chambers), Cometic C5333 MLS head
gaskets and ARP 235-4713 head studs for Drew's 540 (Gen VI BBC).

The aluminium castings only: deck, chambers, intake and exhaust ports, spark-plug holes,
rocker box (floor, spring pockets, guide bosses, rocker-stud bosses, bolt bosses),
pushrod slots, end water ports and the bolt holes. No valves, springs or rockers.

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
    lip=0.85,                # [est] exhaust-side deck flange (the scalloped lip with the bottom stud bosses, photo 337)
    v_exh=-2.95,             # [est] exhaust-side wall of the casting above the lip
    v_int=5.45,              # [derived] intake face: where the deck plane meets the china-wall top plane (z 10.78)
    rail=4.65,               # [meas] valve-cover rail top above the block deck: photo 335, the rail stands ~.6" over the 3.9" intake face
    int_face_top=3.90,       # [meas] photo 335: the intake face is ~1.6 port heights tall
    rail_v_int=5.05,         # [est] the rail steps in from the intake face above it
    wall=0.45,               # [est] rocker-box wall / rail width (perimeter-bolt rail)
    floor=(3.75, 3.95),      # [est] rocker-box floor height, exhaust side and intake side
    # Valves [spec] AFR: 2.300/1.880, 24/4 intake, 15/4 exhaust; seats 2.450 x 2.000 and 2.000 x 1.580
    vI=dict(d=2.300, ang=24.0, cant=4.0, du=0.90, dv=0.48, seat_od=2.450, seat_id=2.000, hs=0.80),
    vE=dict(d=1.880, ang=15.0, cant=4.0, du=0.90, dv=-0.87, seat_od=2.000, seat_id=1.580, hs=0.70),
    # du [derived] the lifters sit under the valves, .90" either side of the bore (../lifters);
    # dv [derived] seats 2.25" apart so the seat rings clear, both inside the 4.5" bore; hs [est] seat
    # height above the block deck, tuned with the chamber wall to the 117cc chamber
    chamber_cc=117.0,        # [spec] AFR 2110, partial-CNC chamber
    chamber_r=2.24,          # [derived] inside the 4.499" bore and the 4.540" gasket
    spring_h=3.15,           # [est] valve face to spring seat along the stem (5.3" valve): seat ~.4" above the port roof
    spring_r=0.875,          # [spec] 1.725-1.750" spring pocket
    stem_l=5.30,             # [est] valve length, face to tip
    # Intake: 345cc, 2.435 x 1.765, 13/32 corner radius, stock location, 3.263 in^2 min CSA [spec]; the
    # ports pair up, cylinders 1/3 and 5/7, 2.07" apart within a pair [meas] photo 335 (perspective fit)
    int_cc=345.0, int_w=1.765, int_h=2.435, int_r=0.406, int_hc=2.35, int_pair=1.035, int_csa=3.263,
    int_pairs=(3.60, 13.28),  # [derived] 9.68" apart (manifold), placed so the pushrods clear (photo 335 fit gives 2.29/11.97 or 2.87/12.55)
    # Exhaust: 132cc, 1.720 H x 1.920 W, raised .375 [spec]; about evenly spaced, one over each
    # cylinder's exhaust valve, with the plugs between them [meas] photo 337
    exh_cc=132.0, exh_w=1.920, exh_h=1.720, exh_r=0.45, exh_hc=2.60, exh_u=(-0.70, 4.20, 9.00, 13.90),
    exh_face=-3.15,          # [est] machined port pads stand .20 proud of the casting wall
    # Spark plug: 14mm x .750" reach, gasket seat [spec]; plugs exit low between the exhaust ports, angled
    # towards their own intake valve [meas] photos 265/266/337; positions [est]
    plug=dict(tip=(0.45, -1.50, 0.32), exit=(1.70, -3.00, 1.25), thread_r=0.276, reach=0.75, seat_r=0.45, boss_r=0.56),
    stud_hole=0.235,         # 7/16 stud clearance
    boss_r=0.42,             # [est] stud bosses in the rocker box
    nut_pocket=0.50,         # [est] socket clearance round the four bottom studs, above the lip
    pushrod_r=0.24,          # 3/8" pushrod + clearance
    hdr_bolts=((-1.20, 0.70), (1.20, -0.70)),   # [est] header bolts per port (du, dh), 3/8-16
    int_bolts=((-0.75, 3.30), (7.00, 3.05), (9.30, 3.05), (16.05, 3.30)),   # [est] intake bolts (u, h), 3/8-16
    end_ports=dict(u=(-2.45, 17.30), h=2.55, w=0.55, ht=0.80, depth=1.0),  # [meas] photo 335 water ports at the ends; size [est]
    cover_bolts_u=(-1.60, 3.00, 7.26, 11.52, 16.12),                       # [est] perimeter-bolt valve cover
)
H0 = K["gasket_t"]


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

def runner(ctrl, n0, prof, bm=None):
    """Rounded-rectangle sections swept along a Catmull-Rom path from the port face inwards.
    prof(s) -> (w, h, r) at arc-length fraction s; n0 the width axis at the face."""
    path = catmull(ctrl)
    L = [0.0]
    for a, b in zip(path, path[1:]): L.append(L[-1] + (b - a).length)
    rings = []; n = n0.normalized()
    for i, p in enumerate(path):
        t = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        n = (n - t * n.dot(t)).normalized(); b = t.cross(n)
        w, h, r = prof(L[i] / L[-1])
        rings.append([p + n * x + b * y for x, y in rrect(-w / 2, w / 2, -h / 2, h / 2, r, 6)])
    return loft(rings, bm), path, L[-1]

def interp(s, xs, ys):
    return float(np.interp(s, xs, ys))

def vol(o):
    bm = bmesh.new(); bm.from_mesh(o.data); v = abs(bm.calc_volume()) / IN ** 3; bm.free(); return v

def nonmanifold(o):
    bm = bmesh.new(); bm.from_mesh(o.data); n = sum(1 for e in bm.edges if not e.is_manifold); bm.free(); return n

def floor_h(v):
    f0, f1 = K["floor"]; a, b = K["v_exh"] + K["wall"], K["rail_v_int"] - K["wall"]
    return f0 + (f1 - f0) * min(1.0, max(0.0, (v - a) / (b - a)))


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
        s = V(math.tan(math.radians(q["cant"])) * su, -math.tan(math.radians(q["ang"])), 1).normalized()
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
INT_PATH = ((2.40, 2.15, 1.45), (4.79, 5.12, 5.40), (12.08, 11.85, 11.20), (14.42, 14.73, 15.05))

def int_runner(k, scale, bm=None, face_ext=0.0):
    cv, s, _ = valve(k, "I"); hc = K["int_hc"]; up = INT_U[k]; rt = K["vI"]["seat_id"] / 2
    a, b, c = INT_PATH[k]
    ctrl = [V(up, K["v_int"] + face_ext, hc), V(up, K["v_int"] - 0.4, hc), V(a, 4.4, hc - 0.05), V(b, 3.6, hc - 0.15),
            V(c, 2.1, hc - 0.40), cv + s * 1.15 + V(0, 0.30, 0.05), cv + s * 0.70, cv + s * 0.40]
    w0, h0_, r0 = K["int_w"], K["int_h"], K["int_r"]
    def prof(t):    # pinch (t .45) held at the published minimum CSA; scale sizes the rest
        w = interp(t, [0, .15, .45, .75, .9, 1], [w0, (w0 - .04) * scale, 1.515, 1.68 * scale, 1.88 * scale, 2 * rt])
        h = interp(t, [0, .15, .45, .75, .9, 1], [h0_, (h0_ - .05) * scale, 2.30, 2.05 * scale, 1.98 * scale, 2 * rt])
        r = interp(t, [0, .15, .45, .75, .9, 1], [r0, .45, .50, .60, .85, rt])
        return w, h, min(r, w / 2, h / 2)
    return runner(ctrl, V(1, 0, 0), prof, bm)

def exh_runner(k, scale, bm=None, face_ext=0.0):
    cv, s, _ = valve(k, "E"); hc = K["exh_hc"]; up = K["exh_u"][k]; rt = K["vE"]["seat_id"] / 2
    um = 0.5 * (up + cv.x)
    ctrl = [V(up, K["exh_face"] - face_ext, hc), V(up, K["exh_face"] + 0.35, hc), V(0.5 * (up + um), -2.35, hc - 0.10),
            V(um, -1.60, hc - 0.50), cv + s * 1.00, cv + s * 0.40]
    w0, h0_, r0 = K["exh_w"], K["exh_h"], K["exh_r"]
    def prof(t):
        w = interp(t, [0, .2, .5, .8, 1], [w0, w0 - .03, 1.72 * scale, 1.62, 2 * rt])
        h = interp(t, [0, .2, .5, .8, 1], [h0_, h0_ - .02, 1.62 * scale, 1.58, 2 * rt])
        r = interp(t, [0, .2, .5, .8, 1], [r0, .5, .62, .72, rt])
        return w, h, min(r, w / 2, h / 2)
    return runner(ctrl, V(1, 0, 0), prof, bm)

def port_solid(k, kind, scale, tmp, face_ext=0.0):
    """Runner + throat down to the valve face plane: the port volume (face_ext 0) or its cutter."""
    f = int_runner if kind == "I" else exh_runner
    bm, path, L = f(k, scale, None, face_ext)
    o = obj("port", bm, tmp)
    cv, s, _ = valve(k, kind); rt = K["v" + kind]["seat_id"] / 2
    th = obj("th", cyl_axis(cv, s, rt, 0.42, 48), tmp)
    boolean(o, "UNION", th); bpy.data.objects.remove(th, do_unlink=True)
    return o, path, L

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
PUSH_TOP = dict(I=((0.25, 4.35, 5.30), (6.70, 4.35, 5.30), (10.25, 4.35, 5.30), (16.25, 4.35, 5.30)),
                E=(None, None, None, None))           # [est] intake cups just outside the paired ports; exhaust cups over their lifters
E_CUP_V, E_CUP_H = 2.75, 5.50

def pushrod_lines():
    cups = lifter_cups(); lines = {}
    for k, cyl in enumerate((1, 3, 5, 7)):
        for kind in "IE":
            a = to_local(cups[("L", cyl, kind)], "L"); b = to_local(cups[("R", R_OF[k], kind)], "R")
            if kind == "I": top = V(*PUSH_TOP["I"][k])
            else: top = V(0.5 * (a.x + b.x), E_CUP_V, E_CUP_H)
            lines[(k, kind)] = [(a, top), (b, top)]
    return lines

def line_at_h(a, b, h):
    t = (h - a.z) / (b.z - a.z); return a + (b - a) * t


# ---------- build ----------
def head_outline():
    o = [tuple(p) for p in GASK["outline"]]
    i0 = next(i for i in range(len(o)) if o[i][1] <= 0.3 and o[i - 1][1] > 0.3)
    run = []
    i = i0
    while o[i % len(o)][1] <= 0.3:
        run.append(o[i % len(o)]); i += 1
    uf, ur = run[0][0], run[-1][0]
    return ccw(run + [(ur, K["v_int"]), (uf, K["v_int"])]), uf, ur

def tune(f, target, lo, hi, it=14):
    vlo, vhi = f(lo), f(hi)
    for _ in range(it):
        mid = 0.5 * (lo + hi); vm = f(mid)
        if (vm - target) * (vlo - target) > 0: lo, vlo = mid, vm
        else: hi, vhi = mid, vm
    return 0.5 * (lo + hi)

def build_left(root, tmp, info):
    outl, uf, ur = head_outline()
    core = ccw(hull(clip(outl, 0, -1, -K["v_exh"])))
    head = obj("CylinderHead_L", zprism(outl, H0, H0 + K["lip"]), root)
    o = obj("core", zprism(core, H0, K["rail"]), tmp); boolean(head, "UNION", o); clear(tmp)
    o = obj("step", zprism(rrect(uf - 1, ur + 1, K["rail_v_int"], K["v_int"] + 1, 0.05, 1), K["int_face_top"], K["rail"] + 1), tmp)
    boolean(head, "DIFFERENCE", o); clear(tmp)

    # exhaust port pads, plug bosses
    for k in range(4):
        up, hc = K["exh_u"][k], K["exh_hc"]; w, h = K["exh_w"], K["exh_h"]
        pts = rrect(up - w / 2 - .28, up + w / 2 + .28, hc - h / 2 - .28, hc + h / 2 + .28, .55, 6)
        for du, dh in K["hdr_bolts"]: pts += circ(up + du, hc + dh, 0.40, 20)
        obj("pad", vprism(ccw(hull(pts)), K["v_exh"] + 0.10, K["exh_face"]), tmp)
        tip, dr, ex = plug_line(k)
        obj("pb", seg_cyl(tip + dr * 1.45, ex + dr * 0.06, K["plug"]["boss_r"], 32), tmp)
    boolean(head, "UNION", tmp); clear(tmp)

    # rocker box
    cav = ccw(clip(inset(core, K["wall"]), 0, 1, K["rail_v_int"] - K["wall"]))
    bot = [V(x, y, floor_h(y)) for x, y in cav]; top = [V(x, y, K["rail"] + 1) for x, y in cav]
    o = obj("box", loft([bot, top]), tmp); boolean(head, "DIFFERENCE", o); clear(tmp)

    # bosses in the box: studs, spring seats, guides, rocker studs
    studs = [h for i, h in enumerate(GASK["holes"]) if h["kind"] in ("stud", "stud_dowel") and i not in BDECK["drop_gasket_holes"]]
    info["studs"] = [(round(h["u"], 3), round(h["v"], 3)) for h in studs]
    low = [h for h in studs if h["v"] < -2.5]; high = [h for h in studs if h["v"] >= -2.5]
    for h in high:
        obj("sb", zprism(circ(h["u"], h["v"], K["boss_r"], 32), H0 + 1.0, floor_h(h["v"]) + 0.45), tmp)
    for k in range(4):
        for kind in "IE":
            cv, s, _ = valve(k, kind); sp = cv + s * K["spring_h"]
            obj("spb", cyl_axis(cv + s * (K["spring_h"] - 0.9), s, K["spring_r"] + 0.13, 0.9, 48), tmp)
            obj("gb", cyl_axis(sp - s * 0.05, s, 0.34, 0.62, 24), tmp)
    lines = pushrod_lines(); pivots = {}
    for (k, kind), ln in lines.items():
        cv, s, _ = valve(k, kind); tipv = cv + s * K["stem_l"]
        cup = line_at_h(ln[0][0], ln[0][1], tipv.z - 0.25)
        pv = tipv + (cup - tipv) * (1.7 / 2.7); pivots[(k, kind)] = pv
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
    sI = tune(pcc("I"), K["int_cc"], 0.75, 1.35, 10); sE = tune(pcc("E"), K["exh_cc"], 0.75, 1.40, 10)
    info["port_scale"] = dict(I=round(sI, 4), E=round(sE, 4))
    iv, ev, lens = [], [], {}
    for k in range(4):
        o, _, L = port_solid(k, "I", sI, tmp); iv.append(round(vol(o) / 0.0610237, 1)); lens[f"I{k}"] = round(L, 2); clear(tmp)
        o, _, L = port_solid(k, "E", sE, tmp); ev.append(round(vol(o) / 0.0610237, 1)); lens[f"E{k}"] = round(L, 2); clear(tmp)
    info["intake_cc"] = iv; info["exhaust_cc"] = ev; info["runner_len"] = lens
    info["intake_min_csa"] = round(min(1.515 * 2.30 - (4 - math.pi) * 0.50 ** 2, (1.68 * 2.05 * sI * sI) - (4 - math.pi) * 0.60 ** 2), 3)

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
            cv, s, _ = valve(k, kind); sp = cv + s * K["spring_h"]
            obj("spk", cyl_axis(sp, s, K["spring_r"], 3.0, 48), tmp)
            obj("stem", cyl_axis(cv + s * 0.3, s, 0.172, K["spring_h"] + 1.0, 16), tmp)
        tip, dr, ex = plug_line(k); P = K["plug"]
        obj("pth", cyl_axis(tip - dr * 0.2, dr, P["thread_r"], P["reach"] + 0.2, 24), tmp)
        obj("pse", seg_cyl(tip + dr * P["reach"], ex + dr * 0.6, P["seat_r"], 32), tmp)
    for h in studs:
        obj("shl", zprism(circ(h["u"], h["v"], K["stud_hole"], 24), H0 - 0.2, (H0 + K["lip"] + 0.05) if h in low else K["rail"]), tmp)
    for h in low:
        obj("np", zprism(circ(h["u"], h["v"], K["nut_pocket"], 32), H0 + K["lip"], H0 + K["lip"] + 0.62), tmp)
    for (k, kind), ln in lines.items():
        pts = []
        for a, b in ln:
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
        obj("ib", loft([ring_pts(V(u, K["v_int"] + 0.1, h), V(0, -1, 0), 0.156, 16), ring_pts(V(u, K["v_int"] - 0.9, h), V(0, -1, 0), 0.156, 16)]), tmp)
    ep = K["end_ports"]
    for u in ep["u"]:
        obj("ewp", vprism(rrect(u - ep["w"] / 2, u + ep["w"] / 2, ep["h"] - ep["ht"] / 2, ep["h"] + ep["ht"] / 2, 0.15, 4),
                          K["v_int"] + 0.1, K["v_int"] - ep["depth"]), tmp)
    for i, h in enumerate(GASK["holes"]):
        if h["kind"] in ("coolant",):
            if "contour" in h and len(h["contour"]) > 5:
                obj("wp", zprism(ccw([tuple(p) for p in h["contour"]]), H0 - 0.1, H0 + 0.60), tmp)
    for dw in BDECK["dowels"]:
        obj("dw", zprism(circ(dw["u"], dw["v"], BLK["dowel_d"] / 2, 32), H0 - 0.1, H0 + 0.30), tmp)
    vcx = [(u, K["v_exh"] + K["wall"] / 2) for u in K["cover_bolts_u"]] + [(u, K["rail_v_int"] - K["wall"] / 2) for u in K["cover_bolts_u"]]
    vcx += [(uf + K["wall"] / 2, 1.25), (ur - K["wall"] / 2, 1.25)]
    for u, v in vcx:
        obj("vcb", zprism(circ(u, v, 0.10, 12), K["rail"] - 0.6, K["rail"] + 0.1), tmp)
    boolean(head, "DIFFERENCE", tmp); clear(tmp)
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
    for h in studs: others[f"stud{h['u']:.1f},{h['v']:.1f}"] = obj("x", zprism(circ(h["u"], h["v"], K["stud_hole"], 24), H0, (H0 + K["lip"] + 0.05) if h in low else K["rail"]), tmp)
    for h in low: others[f"nut{h['u']:.1f}"] = obj("x", zprism(circ(h["u"], h["v"], K["nut_pocket"], 32), H0 + K["lip"], H0 + K["lip"] + 0.62), tmp)
    for (k, kind), ln in lines.items():
        pts = []
        for a, b in ln:
            for hh in (-0.4, floor_h(4.5) + 1.0): pts += ring_pts(line_at_h(a, b, hh), b - a, K["pushrod_r"], 20)
        others[f"push{k}{kind}"] = obj("x", hull3(pts), tmp)
    for k in range(4):
        tip, dr, ex = plug_line(k)
        others[f"plug{k}"] = obj("x", seg_cyl(tip + dr * K["plug"]["reach"], ex + dr * 0.6, K["plug"]["seat_r"], 32), tmp)
        for kind in "IE":
            cv, s, _ = valve(k, kind)
            others[f"spring{k}{kind}"] = obj("x", cyl_axis(cv + s * K["spring_h"], s, K["spring_r"], 3.0, 48), tmp)
    out = []
    for pn, pt in ports.items():
        for on, o in others.items():
            if pt.overlap(bvh(o)): out.append(f"{pn}-{on}")
    clear(tmp)
    return out


def assign_head_materials(head, cast, mach):
    head.data.materials.clear(); head.data.materials.append(cast); head.data.materials.append(mach)
    me = head.data; idx = []
    cyls = [V(u, 0, 0) for u in CYL_U]
    for p in me.polygons:
        c = p.center / IN; n = p.normal; m = 0
        if n.z < -0.99 and abs(c.z - H0) < 0.004: m = 1                       # deck
        elif n.y > 0.99 and abs(c.y - K["v_int"]) < 0.004: m = 1              # intake face
        elif n.y < -0.99 and abs(c.y - K["exh_face"]) < 0.004: m = 1          # exhaust pads
        elif n.z > 0.99 and abs(c.z - K["rail"]) < 0.004: m = 1               # cover rail
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
    for u in CYL_U:
        obj("gb", zprism(circ(u, 0, K["gasket_bore"] / 2, 96), -0.1, 0.2), tmp)
    boolean(g, "DIFFERENCE", tmp); clear(tmp)
    # fire rings: a raised stainless ring round each bore (visual, inside the thickness)
    return g


def build_studs(name, root, low, high):
    """ARP 235-4713: 7/16 studs, parallel washers, 12-point nuts [spec]; lengths [derived]."""
    bm = bmesh.new()
    def star(u, v, z0, z1):
        pts = [(u + (0.36 if i % 2 == 0 else 0.315) * math.cos(math.pi * i / 12), v + (0.36 if i % 2 == 0 else 0.315) * math.sin(math.pi * i / 12)) for i in range(24)]
        zprism(pts, z0, z1, bm)
    for h, seat in [(h, H0 + K["lip"]) for h in low] + [(h, floor_h(h["v"]) + 0.45) for h in high]:
        u, v = h["u"], h["v"]
        zprism(circ(u, v, 0.2187, 20), -BLK["stud_depth"] + 0.03, seat + 0.12 + 0.44 + 0.28, bm)
        zprism(circ(u, v, 0.44, 32), seat + 0.001, seat + 0.12, bm)
        star(u, v, seat + 0.121, seat + 0.56)
    return obj(name, bm, root)


def build_dowels(name, root):
    bm = bmesh.new()
    for dw in BDECK["dowels"]:
        zprism(circ(dw["u"], dw["v"], BLK["dowel_d"] / 2 - 0.004, 32), -BLK["dowel_depth"] + 0.01, H0 + 0.28, bm)
    return obj(name, bm, root)


def place(o, m):
    o.data.transform(m); o.data.update()


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
    dL = build_dowels("HeadDowels_L", root)
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
    for o in (head, gL, sL, dL): place(o, M_L)
    for r in rights: place(r, ROT_R @ M_L)
    info["lines"] = {f"{k}{kind}": [[round(c, 3) for c in p] for pair in ln for p in pair] for (k, kind), ln in lines.items()}
    return [head, gL, sL, dL] + rights, info


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
                if p.name.startswith(("CylinderHead", "HeadGasket")) and PT[p.name].overlap(mt): hits.add((p.name, n))
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
