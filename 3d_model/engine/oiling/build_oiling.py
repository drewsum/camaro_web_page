"""Oil pan, windage tray and a one-piece billet oil pump with its pickup
machined into the body, for Drew's 540 (Gen VI BBC).

References (Drew's build album; see PARTS.md):
    163, 164, 169, 170, 340  the pan on the block, engine upside down on the stand:
                             a rear sump, a tall welded box behind a shallower
                             stamped front section, painted black
    11, 12                   the pan on the bench
    168, 188, 190, 187       the windage tray on the long studs of caps 3 and 4,
                             a flat grey plate with four square panels; the
                             pickup's rectangular screen beside it
    435, 22                  the rear cap's pump pad (block/refs/bottom.json)
Drew: the sump is 8" deep.

Pan face, rail bolt pattern, pump pad, dowel and stud positions come from
../block/refs (pan_rail.json, bottom.json). Sheet thickness, section shapes,
the front-section depth and the pump and pickup sizes are [est].

Axes and units as the block: X passenger side, Y forward, Z up, origin on the
crank centreline at the block's rear face; inches. Run live in Blender:
    exec(open(r"C:/Users/drewm/Documents/scripts/camaro_webpage/3d_model/engine/oiling/build_oiling.py").read())
"""
import bpy, bmesh, json, math, os
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = (os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() and "oiling" in __file__
        else r"C:\Users\drewm\Documents\scripts\camaro_webpage\3d_model\engine\oiling")
CAM_PY = os.path.join(HERE, "..", "cam", "build_cam.py")
_src = open(CAM_PY).read(); _src = _src[:_src.index('if __name__ == "__main__"')]
CAMNS = {"__file__": CAM_PY, "__name__": "cam_lib"}
exec(_src, CAMNS)
IN = CAMNS["IN"]
coll, clear, obj, boolean, material, loft, ysec, ycyl = (CAMNS[k] for k in ("coll", "clear", "obj", "boolean", "material", "loft", "ysec", "ycyl"))
REFS = os.path.join(HERE, "..", "block", "refs")
RAIL = json.load(open(os.path.join(REFS, "pan_rail.json")))
BOT = json.load(open(os.path.join(REFS, "bottom.json")))
MAINS_Y = [22.27, 17.43, 12.59, 7.75, 2.91]           # block_info mains_y
STUD_IN = 1.95                                          # inner main-stud x

K = dict(
    t=0.075,                       # [est] 14-gauge steel
    flange_out=6.00, flange_in=4.92, flange_t=0.096,   # [est] rail flange; the block rail is 4.75-5.95 [meas]
    y_rear=0.15, y_front=23.92,    # pan ends: just ahead of the bellhousing face, just behind the cover
    front_band=23.20,              # front flange band, under the timing chest (y 23.15-24.0 is open in the block)
    neck_y0=21.80, neck_y1=23.00, neck_x=4.55,          # front corners narrowed round the front bolt pair [est]
    wall_x=5.00, front_depth=5.00, corner_r=1.00,      # [est] stamped section, photos 163/169/170; comparable rear-sump pans list 4.75-5.25" at the front
    sump_depth=8.00,               # Drew: 8" sump, from the pan rail
    sump_x=4.25, sump_y1=11.50, sump_r=0.35,           # [est] welded box, narrower than the stamping (photo 169), about half the block long (photo 170)
    crank_notch_r=2.05,            # front wall cut round the crank; the cover's lower lobe closes it
    rear_notch_x=3.55, rear_notch_z=-3.15,             # rear wall runs under the rear main cap (bottom z -3.10)
    bolt_hole=0.34,
    drain=dict(y=5.5, z=-7.35, r=0.50, plug_af=0.62),  # [est] drain bung on the sump's passenger side
    # Windage tray on the long inner studs of caps 3 and 4 [meas photo 431/168]; sizes [est]
    tray=dict(z_top=-4.30, t=0.075, hx=4.55, y0=6.55, y1=13.95, r=0.50,
              panel=(2.2, 1.6), panel_y=(9.25, 11.15), panel_x=2.05, panel_drop=0.13,
              spacer_r=0.32, nut_af=0.50, nut_h=0.30),
    # Oil pump on the rear cap pad (bottom.json "pump"); body sizes [est], standard-volume BBC pump
    pump=dict(ear=(-3.275, -1.275, 0.275, 2.375), ear_z=(-4.00, -3.102),
              body=(-3.45, -1.05, 1.05, 3.10), body_z=(-5.55, -3.999), body_r=0.40,   # gear section, cover machined in (one billet piece)
              nipple_r=0.44, nipple_h=0.30),
    # Pickup machined into the pump body (Drew): a leg down into the sump and an inlet foot [est sizes]
    pickup=dict(leg=(-3.05, -1.45, 1.35, 2.85), leg_r=0.45, foot=(-3.55, -0.95, 0.55, 3.65), foot_r=0.35,
                foot_z=(-7.55, -7.00), inlet_inset=0.25, inlet_depth=0.30),
)
CAP_Z = -3.10                      # main-cap bottoms (block)


# ---------- geometry helpers (inches) ----------
def arc(cx, cy, r, a0, a1, n):
    return [(cx + r * math.cos(a0 + (a1 - a0) * k / n), cy + r * math.sin(a0 + (a1 - a0) * k / n)) for k in range(n + 1)]

def rrect(x0, x1, y0, y1, r, n=8):
    """Rounded rectangle, CCW, 4*(n+1) points."""
    r = min(r, (x1 - x0) / 2 - 1e-4, (y1 - y0) / 2 - 1e-4)
    p = arc(x1 - r, y0 + r, r, -math.pi / 2, 0, n) + arc(x1 - r, y1 - r, r, 0, math.pi / 2, n)
    p += arc(x0 + r, y1 - r, r, math.pi / 2, math.pi, n) + arc(x0 + r, y0 + r, r, math.pi, 1.5 * math.pi, n)
    return p

def zsec(pts, z):
    return [Vector((float(x), float(y), z)) for x, y in pts]

def zprism(pts, z0, z1, bm=None):
    return loft([zsec(pts, z0), zsec(pts, z1)], bm)

def zcyl(r, z0, z1, x, y, seg=32, bm=None):
    return zprism([(x + r * math.cos(2 * math.pi * k / seg), y + r * math.sin(2 * math.pi * k / seg)) for k in range(seg)], z0, z1, bm)

def xcyl(r, x0, x1, y, z, seg=32, bm=None):
    rings = []
    for x in (x0, x1):
        rings.append([Vector((x, y + r * math.cos(2 * math.pi * k / seg), z + r * math.sin(2 * math.pi * k / seg))) for k in range(seg)])
    return loft(rings, bm)

def hexagon_z(af, z0, z1, x, y, bm=None):
    R = af / math.sqrt(3)
    return zprism([(x + R * math.cos(math.pi / 6 + k * math.pi / 3), y + R * math.sin(math.pi / 6 + k * math.pi / 3)) for k in range(6)], z0, z1, bm)

def u_section(hw, zb, r, ztop, n=10):
    """Pan cross-section in (x, z): vertical walls at +/-hw, rounded bottom corners."""
    return ([(-hw, ztop)] + arc(-hw + r, zb + r, r, math.pi, 1.5 * math.pi, n)
            + arc(hw - r, zb + r, r, 1.5 * math.pi, 2 * math.pi, n) + [(hw, ztop)])[::-1]

def sweep_tube(path, r, seg=20, bm=None):
    """Circle swept along a polyline of Vectors (parallel-transport frames)."""
    rings = []; t0 = (path[1] - path[0]).normalized()
    ref = Vector((1, 0, 0)) if abs(t0.x) < 0.9 else Vector((0, 1, 0))
    n = t0.cross(ref).normalized()
    for i, p in enumerate(path):
        t = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        n = (n - t * n.dot(t)).normalized(); b = t.cross(n)
        rings.append([p + (n * math.cos(2 * math.pi * k / seg) + b * math.sin(2 * math.pi * k / seg)) * r for k in range(seg)])
    return loft(rings, bm)

def catmull(pts, per=10):
    P = [pts[0]] + pts + [pts[-1]]; out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(per):
            t = k / per
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(pts[-1]); return out


# ---------- parts ----------
def wall(y):
    """Side-wall half-width: necks in at the front so the front pair of pan bolts (x 4.88) clears it."""
    k = K
    if y <= k["neck_y0"]: return k["wall_x"]
    if y >= k["neck_y1"]: return k["neck_x"]
    return k["wall_x"] + (k["neck_x"] - k["wall_x"]) * (y - k["neck_y0"]) / (k["neck_y1"] - k["neck_y0"])


def build_pan(root, tmp):
    k = K; t = k["t"]
    y0, y1 = k["y_rear"], k["y_front"]
    # Stamped section + welded box, as outer solid minus inner solid.
    A = obj("PanA", loft([ysec(u_section(wall(y), -k["front_depth"], k["corner_r"], -0.05), y)
                          for y in (y0, k["neck_y0"], k["neck_y1"], y1)]), root)
    B = obj("PanB", loft([zsec(rrect(-k["sump_x"], k["sump_x"], y0, k["sump_y1"], k["sump_r"]), -k["front_depth"] + 0.40),
                          zsec(rrect(-k["sump_x"], k["sump_x"], y0, k["sump_y1"], k["sump_r"]), -k["sump_depth"] + 0.30),
                          zsec(rrect(-k["sump_x"] + 0.30, k["sump_x"] - 0.30, y0 + 0.15, k["sump_y1"] - 0.30, 0.10), -k["sump_depth"])]), tmp)
    boolean(A, "UNION", B)
    obj("Ai", loft([ysec(u_section(wall(y) - t, -k["front_depth"] + t, k["corner_r"] - t, 0.5), y)
                    for y in (y0 + t, k["neck_y0"], k["neck_y1"], y1 - t)]), tmp)
    obj("Bi", loft([zsec(rrect(-k["sump_x"] + t, k["sump_x"] - t, y0 + t, k["sump_y1"] - t, k["sump_r"] - t), -k["front_depth"] + 0.50),
                    zsec(rrect(-k["sump_x"] + t, k["sump_x"] - t, y0 + t, k["sump_y1"] - t, k["sump_r"] - t), -k["sump_depth"] + 0.30),
                    zsec(rrect(-k["sump_x"] + 0.30 + t * 0.6, k["sump_x"] - 0.30 - t * 0.6, y0 + 0.15 + t, k["sump_y1"] - 0.30 - t * 0.6, 0.06),
                         -k["sump_depth"] + t)]), tmp)
    bpy.data.objects.remove(B, do_unlink=True)
    boolean(A, "DIFFERENCE", tmp); clear(tmp)
    # Rail flange, with the front band under the timing chest.
    fl = obj("PanFlange", zprism(rrect(-k["flange_out"], k["flange_out"], y0, y1, 0.50), -k["flange_t"] - 0.004, -0.004), root)
    fi, fn = k["flange_in"], k["neck_x"] - t - 0.005
    hole = [(-fi, y0 + 0.07), (fi, y0 + 0.07), (fi, k["neck_y0"]), (fn, k["neck_y1"]), (fn, k["front_band"]),
            (-fn, k["front_band"]), (-fn, k["neck_y1"]), (-fi, k["neck_y0"])]
    obj("flo", zprism(hole, -0.5, 0.5), tmp)
    boolean(fl, "DIFFERENCE", tmp); clear(tmp)
    boolean(A, "UNION", fl); bpy.data.objects.remove(fl, do_unlink=True)
    # Drain bung (passenger side of the sump).
    d = k["drain"]
    obj("bung", xcyl(d["r"], k["sump_x"] - 0.20, k["sump_x"] + 0.30, d["y"], d["z"], 32), tmp)
    boolean(A, "UNION", tmp); clear(tmp)
    # Cuts: crank notch at the front, rear notch under the rear cap, bolt holes, drain thread.
    obj("cn", ycyl(k["crank_notch_r"], 22.95, 24.2, 64), tmp)
    obj("rn", loft([ysec(rrect(-k["rear_notch_x"], k["rear_notch_x"], k["rear_notch_z"], 1.0, 0.35), y) for y in (-0.3, 0.45)]), tmp)
    for h in RAIL["holes"]:
        for s in (-1, 1):
            obj("bh", zcyl(k["bolt_hole"] / 2, -0.6, 0.2, s * h["x"], h["y"], 20), tmp)
    obj("dt", xcyl(0.27, k["sump_x"] - 0.5, k["sump_x"] + 0.5, d["y"], d["z"], 24), tmp)
    boolean(A, "DIFFERENCE", tmp); clear(tmp)
    A.name = "OilPan"; A.data.name = "OilPan"
    # Pan bolts (5/16 flanged heads under the flange) and the drain plug.
    bm = bmesh.new(); zf = -k["flange_t"] - 0.004
    for h in RAIL["holes"]:
        for s in (-1, 1):
            x, y = s * h["x"], h["y"]
            zcyl(0.30, zf - 0.07, zf - 0.001, x, y, 24, bm)
            hexagon_z(0.50, zf - 0.30, zf - 0.07, x, y, bm)
            zcyl(0.15, zf - 0.002, 0.70, x, y, 16, bm)
    bolts = obj("OilPanBolts", bm, root)
    bm = bmesh.new()
    xcyl(0.26, k["sump_x"] - 0.12, k["sump_x"] + 0.30, d["y"], d["z"], 24, bm)
    R = d["plug_af"] / math.sqrt(3)
    loft([[Vector((x, d["y"] + R * math.cos(math.pi / 6 + i * math.pi / 3), d["z"] + R * math.sin(math.pi / 6 + i * math.pi / 3))) for i in range(6)]
          for x in (k["sump_x"] + 0.301, k["sump_x"] + 0.60)], bm)
    plug = obj("OilPanDrainPlug", bm, root)
    return A, bolts, plug


def build_tray(root, tmp):
    T = K["tray"]; zt, zb = T["z_top"], T["z_top"] - T["t"]
    tray = obj("WindageTray", zprism(rrect(-T["hx"], T["hx"], T["y0"], T["y1"], T["r"]), zb, zt), root)
    pw, pl = T["panel"]
    for xs in (-1, 1):
        for yc in T["panel_y"]:
            x0, x1 = xs * T["panel_x"] - pw / 2, xs * T["panel_x"] + pw / 2
            obj("pn", zprism(rrect(x0, x1, yc - pl / 2, yc + pl / 2, 0.15), zt - T["panel_drop"] - T["t"], zb + 0.01), tmp)
    boolean(tray, "UNION", tmp); clear(tmp)
    for xs in (-1, 1):
        for yc in T["panel_y"]:
            for j in (-1, 0, 1):                     # three drain slots per panel
                xc = xs * T["panel_x"] + j * 0.55
                obj("sl", zprism(rrect(xc - 0.08, xc + 0.08, yc - 0.55, yc + 0.55, 0.079), zb - 0.5, zt + 0.5), tmp)
    for ym in (MAINS_Y[2], MAINS_Y[3]):
        for s in (-1, 1):
            obj("th", zcyl(0.28, zb - 0.5, zt + 0.5, s * STUD_IN, ym, 20), tmp)
    boolean(tray, "DIFFERENCE", tmp); clear(tmp)
    bm = bmesh.new()
    for ym in (MAINS_Y[2], MAINS_Y[3]):
        for s in (-1, 1):
            x = s * STUD_IN
            zcyl(T["spacer_r"], zt + 0.001, CAP_Z - 0.852, x, ym, 24, bm)       # spacer up to the cap nut (bottom z -3.95)
            hexagon_z(T["nut_af"], zb - 0.001 - T["nut_h"], zb - 0.001, x, ym, bm)
    hw = obj("WindageTrayNuts", bm, root)
    return tray, hw


def build_pump(root, tmp):
    """One-piece billet pump (Drew): ear on the rear-cap pad, gear body, and the
    pickup machined into the body as a leg down into the sump, ending in an
    inlet foot with a screen."""
    P, PK = K["pump"], K["pickup"]; pb = BOT["pump"]
    x0, x1, y0, y1 = P["ear"]
    pump = obj("OilPump", zprism(rrect(x0, x1, y0, y1, 0.20), *P["ear_z"]), root)
    bx0, bx1, by0, by1 = P["body"]
    obj("bd", zprism(rrect(bx0, bx1, by0, by1, P["body_r"]), *P["body_z"]), tmp)
    obj("nip", zcyl(P["nipple_r"], P["ear_z"][1] - 0.01, P["ear_z"][1] + P["nipple_h"], pb["port"]["x"], pb["port"]["y"], 32), tmp)
    lx0, lx1, ly0, ly1 = PK["leg"]; fx0, fx1, fy0, fy1 = PK["foot"]
    leg_r, n = PK["leg_r"], 8
    fz0, fz1 = PK["foot_z"]
    obj("leg", loft([zsec(rrect(lx0, lx1, ly0, ly1, leg_r, n), P["body_z"][0] + 0.05),
                     zsec(rrect(lx0, lx1, ly0, ly1, leg_r, n), fz1 + 0.35),
                     zsec(rrect(fx0, fx1, fy0, fy1, PK["foot_r"], n), fz1),
                     zsec(rrect(fx0, fx1, fy0, fy1, PK["foot_r"], n), fz0)]), tmp)
    boolean(pump, "UNION", tmp); clear(tmp)
    ins = PK["inlet_inset"]
    obj("sh", zcyl(0.205, -6, 0, pb["stud"]["x"], pb["stud"]["y"], 20), tmp)
    obj("dw", zcyl(0.135, -4.5, 0, pb["dowel"]["x"], pb["dowel"]["y"], 16), tmp)
    obj("ol", zcyl(0.28, P["ear_z"][0] + 0.3, 0.5, pb["port"]["x"], pb["port"]["y"], 24), tmp)
    obj("inl", zprism(rrect(fx0 + ins, fx1 - ins, fy0 + ins, fy1 - ins, max(PK["foot_r"] - ins, 0.08)), fz0 - 0.1, fz0 + PK["inlet_depth"]), tmp)
    boolean(pump, "DIFFERENCE", tmp); clear(tmp)
    bm = bmesh.new()                                   # pump stud and nut, body screws
    sx, sy = pb["stud"]["x"], pb["stud"]["y"]
    zcyl(0.18, P["ear_z"][0] - 0.40, CAP_Z + 0.95, sx, sy, 20, bm)
    hexagon_z(0.56, P["ear_z"][0] - 0.34, P["ear_z"][0] - 0.001, sx, sy, bm)
    zb = P["body_z"][0]
    for cx, cy in ((bx0 + 0.22, by0 + 0.20), (bx1 - 0.22, by0 + 0.20), (bx0 + 0.22, by1 - 0.20), (bx1 - 0.22, by1 - 0.20)):
        zcyl(0.16, zb - 0.19, zb - 0.001, cx, cy, 20, bm)
    hw = obj("OilPumpHardware", bm, root)
    i2 = ins + 0.01
    scr = obj("OilPickupScreen", zprism(rrect(fx0 + i2, fx1 - i2, fy0 + i2, fy1 - i2, max(PK["foot_r"] - i2, 0.07)), fz0 + 0.002, fz0 + 0.05), root)
    return pump, hw, scr


def build():
    root = coll("BBC_Oiling"); clear(root)
    tmp = coll("Oiling_tmp", root, hide=True)
    CAMNS["set_crank"](0.0); bpy.context.view_layer.update()
    pan, bolts, plug = build_pan(root, tmp)
    tray, tray_hw = build_tray(root, tmp)
    pump, pump_hw, scr = build_pump(root, tmp)
    bpy.data.collections.remove(tmp)
    black = material("Pan_GlossBlack", (0.015, 0.015, 0.016, 1), 0.3, 0.22)
    grey = material("Tray_Grey", (0.33, 0.34, 0.35, 1), 0.5, 0.55)
    billet = material("Pump_BilletAluminium", (0.78, 0.79, 0.80, 1), 1.0, 0.28)
    zinc = material("Pickup_Steel", (0.55, 0.56, 0.57, 1), 1.0, 0.40)
    mesh = material("Pickup_Screen", (0.12, 0.12, 0.13, 1), 0.9, 0.55)
    oxide = material("Oiling_BoltOxide", (0.05, 0.05, 0.05, 1), 0.8, 0.40)
    for o, m in ((pan, black), (bolts, oxide), (plug, zinc), (tray, grey), (tray_hw, zinc), (pump, billet),
                 (pump_hw, oxide), (scr, mesh)):
        o.data.materials.clear(); o.data.materials.append(m); o.data.polygons.foreach_set("material_index", [0] * len(o.data.polygons)); o.data.shade_smooth(); o.data.set_sharp_from_angle(angle=math.radians(30))
    for n in ("OilPumpCover", "OilPickupTube"):          # parts of the earlier three-piece pump
        if n in bpy.data.objects: bpy.data.objects.remove(bpy.data.objects[n], do_unlink=True)
    parts = [pan, bolts, plug, tray, tray_hw, pump, pump_hw, scr]
    return parts


def manifold(o):
    bm = bmesh.new(); bm.from_mesh(o.data)
    n = sum(1 for e in bm.edges if not e.is_manifold); v = abs(bm.calc_volume()) / IN ** 3; bm.free(); return n, v


def checks(parts, step=10.0):
    mesh_world, set_crank = CAMNS["mesh_world"], CAMNS["set_crank"]
    def tree(o):
        v, f = mesh_world(o); return BVHTree.FromPolygons([Vector(x) for x in v], f)
    fixed = [n for n in ["Block", "DowelPins", "GalleryPlugs", "FreezePlugs"] + [f"MainCap_{i}" for i in range(1, 6)]
             + [f"MainStuds_{i}" for i in range(1, 6)] if n in bpy.data.objects]
    movers = [o.name for o in bpy.data.objects if o.type == "MESH" and
              (o.name.startswith(("ConRod_", "RodCap_", "RodBolt_", "Piston_")) or o.name in ("Crankshaft", "Camshaft", "Flywheel", "FlywheelBolts"))]
    PT = {o.name: tree(o) for o in parts}
    hits = set()
    for n in fixed:
        ft = tree(bpy.data.objects[n])
        for o in parts:
            if PT[o.name].overlap(ft): hits.add((o.name, n))
    for i, a in enumerate(parts):
        for b in parts[i + 1:]:
            if PT[a.name].overlap(PT[b.name]): hits.add((a.name, b.name))
    # rotating assembly: clash, and the smallest gap from the rotating parts to the tray and pan
    low = 0.0
    for d in np.arange(0, 720, step):
        set_crank(float(d))
        for n in movers:
            o = bpy.data.objects[n]
            v, f = mesh_world(o); low = min(low, float(v[:, 2].min())) if n.startswith(("ConRod", "RodCap", "RodBolt", "Crank")) else low
            mt = BVHTree.FromPolygons([Vector(x) for x in v], f)
            for p in parts:
                if PT[p.name].overlap(mt): hits.add((p.name, n))
    set_crank(0.0)
    allowed = {("OilPumpHardware", "OilPump"),                 # stud and nut through the pump ear
               ("WindageTrayNuts", "MainStuds_3"), ("WindageTrayNuts", "MainStuds_4")}  # spacers and nuts on the long studs (.50" at the tray, from the block)
    return dict(clash=sorted(h for h in hits if h not in allowed and h[::-1] not in allowed),
                contacts_expected=sorted(allowed), rotating_lowest_z_in=round(low, 3),
                tray_gap_to_rotating_in=round(low - K["tray"]["z_top"], 3))


def capacity_qt(pan):
    """Oil the pan holds below the rail plane: interior volume of the sump region,
    sampled on a grid (in^3 -> US qt)."""
    v, f = CAMNS["mesh_world"](pan); bvh = BVHTree.FromPolygons([Vector(x) for x in v], f)
    vol_full, vol_sump = 0.0, 0.0; h = 0.25
    for x in np.arange(-4.9, 4.9, h):
        for y in np.arange(0.25, 23.8, h):
            hit = bvh.ray_cast(Vector((x + h / 2, y + h / 2, 0.0)), Vector((0, 0, -1)))
            if hit[0] is None: continue
            depth = -hit[0].z
            if depth < 0.5: continue
            vol_full += depth * h * h; vol_sump += max(0.0, depth - K["front_depth"]) * h * h
    return dict(volume_below_rail_qt=round(vol_full / 57.75, 1), sump_box_below_front_floor_qt=round(vol_sump / 57.75, 1))


if __name__ == "__main__" or "bpy" in globals():
    parts = build()
    res = checks(parts)
    info = dict(params=K, manifold={o.name: manifold(o) for o in parts}, checks=res, capacity=capacity_qt(parts[0]),
                tris={o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in parts})
    with open(os.path.join(HERE, "oiling_info.json"), "w") as f: json.dump(info, f, indent=1, default=float)
    print(json.dumps({k: info[k] for k in ("manifold", "checks", "capacity")}, default=float))
