"""Two-piece timing cover for Drew's 540 (Gen VI BBC 6-bolt front face).

References (Drew's build album):
    193        the cover lid on the bench: black stamped steel, narrow rounded top,
               the crank seal near the bottom, a ring of small screws round the edge
    345        the two pieces with their gaskets: the rear frame that bolts to the
               block, and the lid
    343, 344   the frame on the block (engine upside down), sprockets showing through
    163, 169   the cover on the assembled engine
Block side (../block/refs/front_face.json, [meas] photos 29/30): six 1/4-20
bolts at (+/-2.75, 8.01), (+/-4.17, 4.87), (+/-3.23, 0.30) and two dowels at
(+/-3.69, 1.23), in face coordinates x across, z up from the crank centreline.

How it is laid out:
  frame   y 24.00-24.30, outline O (round the bolt pattern, cam and crank), opening H
          clear of the cam sprocket and chain (r 3.25 about the cam) and crank sprocket
          (r 1.82); dowel holes, six bolt holes, tapped holes for the lid screws.
  lid     sheet .07", flange on the frame, wall up to a flat front face at y 24.90
          (the cam bolts end at y 24.50); crank seal bore 3.00".
  seal    2.25" ID (balancer hub) x 3.00" OD x .40" [est].
  The lower lobe of the frame (down to z -2.35) is what the pan's curved front seal lip and gasket seal against.
Outline sizes beyond the bolt pattern, depths and sheet thickness are [est].

Axes and units as the block (inches; origin on the crank centreline at the rear
face). Run live in Blender:
    exec(open(r"C:/Users/drewm/Documents/scripts/camaro_webpage/3d_model/engine/front_cover/build_front_cover.py").read())
"""
import bpy, bmesh, json, math, os
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = (os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() and "front_cover" in __file__
        else r"C:\Users\drewm\Documents\scripts\camaro_webpage\3d_model\engine\front_cover")
CAM_PY = os.path.join(HERE, "..", "cam", "build_cam.py")
_src = open(CAM_PY).read(); _src = _src[:_src.index('if __name__ == "__main__"')]
CAMNS = {"__file__": CAM_PY, "__name__": "cam_lib"}
exec(_src, CAMNS)
IN = CAMNS["IN"]
coll, clear, obj, boolean, material, loft, ysec, ycyl, disc_pts = (CAMNS[k] for k in ("coll", "clear", "obj", "boolean", "material", "loft", "ysec", "ycyl", "disc_pts"))
FF = json.load(open(os.path.join(HERE, "..", "block", "refs", "front_face.json")))
HOLES = {h["name"]: h for h in FF["holes"]}
CAMZ = CAMNS["CAMZ"]
BOLTS = [(s * HOLES[n]["x"], HOLES[n]["z"]) for n in ("CoverBoltTop", "CoverBoltMid", "CoverBoltLow") for s in (-1, 1)]
DOWELS = [(s * HOLES["CoverDowel"]["x"], HOLES["CoverDowel"]["z"]) for s in (-1, 1)]

K = dict(
    y_face=24.002, frame_t=0.30, lid_t=0.07, lid_front=24.90,
    O=dict(bolt_r=0.50, dowel_r=0.45, cam_r=3.95, crank_r=2.35),     # outer outline [est] round the [meas] pattern
    H=dict(cam_r=3.25, crank_r=1.82),                                 # frame opening: sprocket tips 3.07, chain 3.11, crank chain z -1.63
    W=dict(cam_r=3.45, crank_r=2.00),                                 # lid wall base (inside the bolt heads)
    F=dict(cam_r=3.30, crank_r=1.90),                                 # lid front face
    seal_bore=3.00, seal_id=2.25, seal_w=0.40,                        # [est] BBC balancer hub 2.25"
    bolt_head=dict(af=0.4375, flange_r=0.30, h=0.20), bolt_r=0.125, bolt_hole=0.140,
    dowel_hole=0.135, screw=dict(n=8, head_r=0.21, h=0.14, r=0.095),
    centre=(0.0, 3.0), N=192,
)

# Harmonic balancer: 8" elastomer damper on the 1.600" nose (../crank), keyed,
# held by a 3/4-16 bolt and washer. Generic SFI-style shape; sizes [est] except
# the 8.00" OD (Drew) and the bore and hub, which follow the crank nose and seal.
BAL = dict(
    bore=1.600, y_back=24.32,            # against the crank sprocket's front face (24.30)
    seal_r=1.122,                        # hub through the 2.25" seal (.003" clear of the rubber)
    hub_r=1.60, hub_from=25.05, y_front=27.15,          # hub nose ahead of the lid; front face just past the crank nose (27.10)
    web=(25.95, 26.45), rim=(2.95, 3.20),               # web plate and inner rim
    elast=(3.20, 3.28), ring=(3.28, 4.00), ring_y=(25.10, 27.15), chamfer=0.06,   # rubber band, inertia ring (8.00" OD, 2.05" wide)
    marks=dict(every=2, deep=0.02, w=0.016, l=(0.18, 0.32, 0.50)),   # degree marks on the OD from the front edge: 2 deg, every 10, TDC
    pulley_holes=dict(n=3, bc=2.50, d=0.3125, depth=0.60),            # 3/8-24 tapped, for a crank pulley
    key=dict(w=0.1875, top=0.96, y=(24.36, 26.95)),                  # its own key in the crank keyway
    washer=dict(r=1.10, t=0.25), bolt=dict(af=1.125, h=0.47, r=0.36, into=1.15),
)


# ---------- 2-D outline helpers in (x, z) ----------
def circle_pts(cx, cz, r, n=96):
    return [(cx + r * math.cos(2 * math.pi * k / n), cz + r * math.sin(2 * math.pi * k / n)) for k in range(n)]

def hull(pts):
    pts = sorted(set((round(x, 6), round(z, 6)) for x, z in pts))
    def cross(o, a, b): return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0: lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(up) >= 2 and cross(up[-2], up[-1], p) <= 0: up.pop()
        up.append(p)
    return lo[:-1] + up[:-1]

def by_angle(poly, n=K["N"], c=K["centre"]):
    """Resample a convex polygon (containing c) on n rays from c, so outlines correspond."""
    out = []
    P = [Vector((x - c[0], z - c[1])) for x, z in poly]
    for k in range(n):
        a = 2 * math.pi * k / n; d = Vector((math.cos(a), math.sin(a))); best = None
        for i in range(len(P)):
            p, q = P[i], P[(i + 1) % len(P)]; e = q - p
            den = d.x * (-e.y) - d.y * (-e.x)
            if abs(den) < 1e-12: continue
            t = (p.x * (-e.y) - p.y * (-e.x)) / den
            u = (d.x * p.y - d.y * p.x) / den
            if t > 0 and -1e-9 <= u <= 1 + 1e-9: best = t if best is None else max(best, t)
        out.append((c[0] + best * d.x, c[1] + best * d.y))
    return out

def outline(spec, extra=()):
    pts = circle_pts(0, CAMZ, spec["cam_r"]) + circle_pts(0, 0, spec["crank_r"])
    for e in extra: pts += e
    return by_angle(hull(pts))

def shrink(poly, d, c=K["centre"]):
    """Approximate inward offset of a resampled convex outline (along the local normal)."""
    n = len(poly); out = []
    for i in range(n):
        p0, p1 = Vector(poly[i - 1]), Vector(poly[(i + 1) % n]); t = (p1 - p0).normalized()
        nrm = Vector((t.y, -t.x))
        if nrm.dot(Vector(poly[i]) - Vector(c)) < 0: nrm = -nrm
        out.append(tuple(Vector(poly[i]) - nrm * d))
    return out

def prism_y(poly, y0, y1, bm=None):
    return loft([ysec(poly, y0), ysec(poly, y1)], bm)

def hex_y(af, y0, y1, x, z, bm=None):
    R = af / math.sqrt(3)
    p = [(x + R * math.cos(k * math.pi / 3), z + R * math.sin(k * math.pi / 3)) for k in range(6)]
    return prism_y(p, y0, y1, bm)


def build():
    root = coll("BBC_FrontCover"); clear(root)
    tmp = coll("FrontCover_tmp", root, hide=True)
    CAMNS["set_crank"](0.0); bpy.context.view_layer.update()
    k = K; y0 = k["y_face"]; y1 = y0 + k["frame_t"]; lt = k["lid_t"]
    O = outline(k["O"], [circle_pts(x, z, k["O"]["bolt_r"], 24) for x, z in BOLTS] + [circle_pts(x, z, k["O"]["dowel_r"], 24) for x, z in DOWELS])
    H = outline(k["H"]); W = outline(k["W"]); F = outline(k["F"])
    # Frame: outline O, opening H.
    frame = obj("TimingCoverFrame", prism_y(O, y0, y1), root)
    obj("op", prism_y(H, y0 - 0.1, y1 + 0.1), tmp)
    for x, z in BOLTS: obj("bh", ycyl(k["bolt_hole"], y0 - 0.1, y1 + 0.1, 20, x, z), tmp)
    for x, z in DOWELS: obj("dh", ycyl(k["dowel_hole"], y0 - 0.1, y1 + 0.1, 20, x, z), tmp)
    # Lid screw positions: on the flange band between W and O, away from the six bolts.
    cands = []
    for i in range(0, k["N"], 2):
        po, pw = Vector(O[i]), Vector(W[i])
        band = (po - pw).length; m = (po + pw) / 2
        if band < 0.62: continue
        dmin = min((m - Vector(b)).length for b in BOLTS + DOWELS)
        cands.append((dmin, i, m))
    screws = []
    for dmin, i, m in sorted(cands, key=lambda c: -c[0]):
        if dmin < 0.85: break
        if all((m - s).length > 2.4 for s in screws): screws.append(m)
        if len(screws) == k["screw"]["n"]: break
    for s in screws: obj("st", ycyl(k["screw"]["r"] - 0.01, y0 + 0.08, y1 + 0.1, 16, s.x, s.y), tmp)
    boolean(frame, "DIFFERENCE", tmp); clear(tmp)
    # Lid: flange on the frame face, wall up to the front face; hollowed from behind.
    lid = obj("TimingCoverLid", loft([ysec(O, y1 + 0.001), ysec(O, y1 + 0.001 + lt), ysec(W, y1 + 0.001 + lt), ysec(F, k["lid_front"])]), root)
    Wi = shrink(W, lt); Fi = shrink(F, lt)
    obj("in", loft([ysec(Wi, y1 - 0.05), ysec(Wi, y1 + 0.001 + lt), ysec(Fi, k["lid_front"] - lt)]), tmp)
    obj("sb", ycyl(k["seal_bore"] / 2, y1 - 0.2, k["lid_front"] + 0.2, 64), tmp)
    for x, z in BOLTS: obj("bh", ycyl(k["bolt_hole"], y1 - 0.1, y1 + 0.2, 20, x, z), tmp)
    for s in screws: obj("sh", ycyl(k["screw"]["r"] + 0.02, y1 - 0.1, y1 + 0.2, 16, s.x, s.y), tmp)
    boolean(lid, "DIFFERENCE", tmp); clear(tmp)
    # Seal boss: a short collar round the seal bore, inside the lid.
    sb = obj("TimingCoverSeal", ycyl(k["seal_bore"] / 2 - 0.004, k["lid_front"] - k["seal_w"], k["lid_front"] + 0.02, 64), root)
    obj("si", ycyl(k["seal_id"] / 2, k["lid_front"] - 1, k["lid_front"] + 1, 64), tmp)
    boolean(sb, "DIFFERENCE", tmp); clear(tmp)
    bpy.data.collections.remove(tmp)
    # Hardware: six flanged block bolts through lid and frame, the lid screws.
    bm = bmesh.new(); yl = y1 + 0.001 + lt; bh = k["bolt_head"]
    for x, z in BOLTS:
        ycyl(bh["flange_r"], yl + 0.001, yl + 0.05, 24, x, z, bm)
        hex_y(bh["af"], yl + 0.05, yl + bh["h"], x, z, bm)
        ycyl(k["bolt_r"] - 0.005, y0 - 0.70, yl + 0.002, 16, x, z, bm)
    for s in screws:
        ycyl(k["screw"]["head_r"], yl + 0.001, yl + k["screw"]["h"], 20, s.x, s.y, bm)
        ycyl(k["screw"]["r"] - 0.012, y0 + 0.09, yl + 0.002, 12, s.x, s.y, bm)
    hw = obj("TimingCoverBolts", bm, root)
    lid_m = material("TimingCover_SatinBlack", (0.02, 0.02, 0.022, 1), 0.4, 0.45)
    frame_m = material("TimingCover_BlackComposite", (0.03, 0.03, 0.032, 1), 0.0, 0.6)
    seal_m = material("TimingCover_SealRubber", (0.04, 0.04, 0.04, 1), 0.0, 0.5)
    oxide = material("FrontCover_BoltOxide", (0.05, 0.05, 0.05, 1), 0.8, 0.40)
    for o, m in ((frame, frame_m), (lid, lid_m), (sb, seal_m), (hw, oxide)):
        o.data.materials.clear(); o.data.materials.append(m); o.data.polygons.foreach_set("material_index", [0] * len(o.data.polygons)); o.data.shade_smooth(); o.data.set_sharp_from_angle(angle=math.radians(30))
    return [frame, lid, sb, hw], dict(screws=[(round(s.x, 3), round(s.y, 3)) for s in screws],
                                       outline_z=(round(min(p[1] for p in O), 3), round(max(p[1] for p in O), 3)),
                                       outline_half_w=round(max(p[0] for p in O), 3))


def build_balancer(root):
    """Balancer parts, parented to the crank so they turn with it; in the cover's
    collection so hiding the cover hides them too."""
    b = BAL; tmp = coll("Balancer_tmp", root, hide=True)
    CAMNS["set_crank"](0.0); bpy.context.view_layer.update()
    r0 = b["bore"] / 2; yf = b["y_front"]
    # Hub: through the seal, then the nose, the web and the inner rim.
    bm = bmesh.new()
    loft([ysec(disc_pts(b["seal_r"], 96), b["y_back"]), ysec(disc_pts(b["seal_r"], 96), b["hub_from"]),
          ysec(disc_pts(b["hub_r"], 96), b["hub_from"] + 0.04), ysec(disc_pts(b["hub_r"], 96), yf)], bm)
    hub = obj("BalancerHub", bm, root)
    # Rim and web as a disc, hollowed in front of and behind the web, then the nose put back.
    obj("disc", ycyl(b["rim"][1], b["ring_y"][0] + 0.05, yf - 0.05, 128), tmp)
    boolean(hub, "UNION", tmp); clear(tmp)
    obj("in", ycyl(b["rim"][0], b["ring_y"][0], b["web"][0], 128), tmp)
    obj("in", ycyl(b["rim"][0], b["web"][1], yf + 0.1, 128), tmp)
    boolean(hub, "DIFFERENCE", tmp); clear(tmp)
    obj("nose", ycyl(b["hub_r"], b["hub_from"] + 0.03, yf, 96), tmp)
    boolean(hub, "UNION", tmp); clear(tmp)
    obj("bore", ycyl(r0, b["y_back"] - 0.1, yf + 0.1, 96), tmp)
    kw = b["key"]["w"] / 2
    obj("kslot", loft([ysec([(-kw, 0.5), (kw, 0.5), (kw, b["key"]["top"] + 0.01), (-kw, b["key"]["top"] + 0.01)], y) for y in (b["y_back"] - 0.1, yf + 0.1)]), tmp)
    ph = b["pulley_holes"]
    for k in range(ph["n"]):
        a = 2 * math.pi * (k + 0.5) / ph["n"]
        obj("ph", ycyl(ph["d"] / 2, yf - ph["depth"], yf + 0.1, 20, ph["bc"] / 2 * math.sin(a), ph["bc"] / 2 * math.cos(a)), tmp)
    boolean(hub, "DIFFERENCE", tmp); clear(tmp)
    # Rubber band and the inertia ring, its OD edges chamfered and marked.
    y0r, y1r = b["ring_y"]; e0, e1 = b["elast"]
    rub = obj("BalancerElastomer", loft([ysec(disc_pts(e1, 128), y0r + 0.04), ysec(disc_pts(e1, 128), y1r - 0.04)]), root)
    obj("ri", ycyl(e0 + 0.001, y0r, y1r, 128), tmp); boolean(rub, "DIFFERENCE", tmp); clear(tmp)
    ri, ro = b["ring"]; c = b["chamfer"]
    ring = obj("BalancerRing", loft([ysec(disc_pts(ro - c, 180), y0r), ysec(disc_pts(ro, 180), y0r + c),
                                     ysec(disc_pts(ro, 180), y1r - c), ysec(disc_pts(ro - c, 180), y1r)]), root)
    obj("ri", ycyl(ri + 0.001, y0r - 0.1, y1r + 0.1, 128), tmp)
    mk = b["marks"]; bm = bmesh.new()
    for deg in range(0, 360, mk["every"]):
        L = mk["l"][2] if deg == 0 else mk["l"][1] if deg % 10 == 0 else mk["l"][0]
        a = math.radians(deg); rd = Vector((math.sin(a), 0, math.cos(a))); tg = Vector((math.cos(a), 0, -math.sin(a)))
        pts = [rd * r + tg * t for r in (ro - mk["deep"], ro + 0.1) for t in (-mk["w"] / 2, mk["w"] / 2)]
        loft([[p + Vector((0, y, 0)) for p in (pts[0], pts[1], pts[3], pts[2])] for y in (y1r - c - L, y1r + 0.1)], bm)
    obj("marks", bm, tmp)
    boolean(ring, "DIFFERENCE", tmp); clear(tmp)
    # Key, washer and bolt.
    key = obj("BalancerKey", loft([ysec([(-kw + 0.002, 0.715), (kw - 0.002, 0.715), (kw - 0.002, b["key"]["top"]), (-kw + 0.002, b["key"]["top"])], y)
                                   for y in b["key"]["y"]]), root)
    w, bt = b["washer"], b["bolt"]; bm = bmesh.new()
    ycyl(w["r"], yf + 0.001, yf + w["t"], 64, bm=bm)
    hex_y(bt["af"], yf + w["t"] + 0.001, yf + w["t"] + bt["h"], 0, 0, bm)
    ycyl(bt["r"], yf - bt["into"], yf + 0.002, 32, bm=bm)
    bolt = obj("BalancerBolt", bm, root)
    bpy.data.collections.remove(tmp)
    steel = material("Balancer_SatinSteel", (0.55, 0.55, 0.57, 1), 1.0, 0.35)
    rubber = material("Balancer_Elastomer", (0.025, 0.025, 0.025, 1), 0.0, 0.6)
    oxide = material("FrontCover_BoltOxide", (0.05, 0.05, 0.05, 1), 0.8, 0.40)
    parts = [hub, rub, ring, key, bolt]
    for o, m in ((hub, steel), (rub, rubber), (ring, steel), (key, steel), (bolt, oxide)):
        o.data.materials.clear(); o.data.materials.append(m); o.data.shade_smooth(); o.data.set_sharp_from_angle(angle=math.radians(30))
        CAMNS["parent_keep"](o, bpy.data.objects["Crankshaft"])
    return parts


def balancer_checks(bal, step=15.0):
    """Turn the crank: the balancer against the cover, block, pan and cam hardware."""
    mesh_world, set_crank = CAMNS["mesh_world"], CAMNS["set_crank"]
    def tree(o):
        v, f = mesh_world(o); return BVHTree.FromPolygons([Vector(x) for x in v], f)
    fixed = [n for n in ("Block", "OilPan", "OilPanBolts", "OilPanGasket", "TimingCoverFrame", "TimingCoverLid", "TimingCoverSeal",
                         "TimingCoverBolts", "CamBolts", "CamSprocket", "TimingChain") if n in bpy.data.objects]
    FT = {n: tree(bpy.data.objects[n]) for n in fixed if n not in ("CamBolts", "CamSprocket", "TimingChain")}
    hits = set(); gap = 9.0
    for d in np.arange(0, 360, step):
        set_crank(float(d))
        for n in ("CamBolts", "CamSprocket", "TimingChain"):
            if n in fixed: FT[n] = tree(bpy.data.objects[n])
        for o in bal:
            t = tree(o)
            for n, ft in FT.items():
                if t.overlap(ft): hits.add((o.name, n))
    set_crank(0.0)
    lid_v, _ = mesh_world(bpy.data.objects["TimingCoverLid"]); ring_v, _ = mesh_world(bal[2])
    gap = float(ring_v[:, 1].min() - lid_v[:, 1].max())
    inner = set()
    for i, a in enumerate(bal):
        for b in bal[i + 1:] + [bpy.data.objects["Crankshaft"], bpy.data.objects["CrankSprocket"]]:
            if tree(a).overlap(tree(b)): inner.add((a.name, b.name))
    return dict(clash=sorted(hits), touching=sorted(inner), ring_to_lid_in=round(gap, 3))


def checks(parts, step=10.0):
    mesh_world, set_crank = CAMNS["mesh_world"], CAMNS["set_crank"]
    def tree(o):
        v, f = mesh_world(o); return BVHTree.FromPolygons([Vector(x) for x in v], f)
    fixed = [n for n in ("Block", "DowelPins", "OilPan", "OilPanBolts", "CamThrustPlate", "CamPlateScrews") if n in bpy.data.objects]
    movers = [n for n in ("Crankshaft", "CrankSprocket", "CrankKey", "CamSprocket", "CamBolts", "CamDowel", "Camshaft", "TimingChain") if n in bpy.data.objects]
    PT = {o.name: tree(o) for o in parts}; hits = set()
    for n in fixed:
        ft = tree(bpy.data.objects[n])
        for o in parts:
            if PT[o.name].overlap(ft): hits.add((o.name, n))
    for i, a in enumerate(parts):
        for b in parts[i + 1:]:
            if PT[a.name].overlap(PT[b.name]): hits.add((a.name, b.name))
    gap = 9.0
    lid_v, _ = mesh_world(parts[1]); lid_back = float(lid_v[:, 1].max()) - K["lid_t"]
    for d in np.arange(0, 720, step):
        set_crank(float(d))
        for n in movers:
            v, f = mesh_world(bpy.data.objects[n])
            mt = BVHTree.FromPolygons([Vector(x) for x in v], f)
            for p in parts:
                if PT[p.name].overlap(mt): hits.add((p.name, n))
            if n in ("CamBolts", "CamSprocket", "TimingChain"): gap = min(gap, lid_back - float(v[:, 1].max()))
    set_crank(0.0)
    allowed = {("TimingCoverBolts", "Block"), ("TimingCoverBolts", "TimingCoverFrame"), ("TimingCoverBolts", "TimingCoverLid"),
               ("TimingCoverFrame", "DowelPins")}
    return dict(clash=sorted(h for h in hits if h not in allowed and h[::-1] not in allowed),
                contacts_expected=sorted(allowed), lid_to_timing_set_in=round(gap, 3))


def manifold(o):
    bm = bmesh.new(); bm.from_mesh(o.data)
    n = sum(1 for e in bm.edges if not e.is_manifold); bm.free(); return n


if __name__ == "__main__" or "bpy" in globals():
    parts, geo = build()
    res = checks(parts)
    bal = build_balancer(bpy.data.collections["BBC_FrontCover"])
    bres = balancer_checks(bal)
    info = dict(params=K, balancer=BAL, bolts=BOLTS, dowels=DOWELS, geometry=geo, manifold={o.name: manifold(o) for o in parts + bal},
                checks=res, balancer_checks=bres,
                tris={o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in parts + bal})
    with open(os.path.join(HERE, "front_cover_info.json"), "w") as f: json.dump(info, f, indent=1, default=float)
    print(json.dumps({k: info[k] for k in ("geometry", "manifold", "checks", "balancer_checks", "tris")}, default=float))
