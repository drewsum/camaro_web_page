"""Flywheel, ring gear, flywheel bolts and pilot bushing for Drew's 540
(manual transmission, 4-speed), bolted to the crank from ../crank.

Album photos 25, 35 and 36 show a steel flywheel with a 168-tooth ring gear
under an 11" clutch. Published numbers for 168-tooth Chevy flywheels:
    ring gear OD 14.105", 168 teeth                      [spec]
    crank bolt circle 3.58", 6 x 7/16-20, holes .460"    [spec]
    centre hole 2.485" (crank register)                  [spec]
    crank face to friction face .960" (flat flywheel)    [spec]
    counterbore on the clutch side 6.40" x .43" deep     [spec]
    pressure-plate holes, 3/8-16, on 11.625" and 12.625" circles (GM 10.5"/11")  [spec]
The web and rim section, ring-gear width and the hole phasing are [est].
Balance: drawn neutral (internally balanced), [est]: no counterweight is
visible in the photos, and the 540's crank balance is not on the build sheet.

The parts are parented to the Crankshaft, so they turn with crank_deg.
Axes and units as the block: X passenger side, Y forward, Z up, origin on the
crank centreline at the block's rear face; inches. Run live in Blender after
the crank:
    exec(open(r"C:/Users/drewm/Documents/scripts/camaro_webpage/3d_model/engine/flywheel/build_flywheel.py").read())
"""
import bpy, bmesh, json, math, os
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

HERE = (os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() and "flywheel" in __file__
        else r"C:\Users\drewm\Documents\scripts\camaro_webpage\3d_model\engine\flywheel")
CAM_PY = os.path.join(HERE, "..", "cam", "build_cam.py")
_src = open(CAM_PY).read(); _src = _src[:_src.index('if __name__ == "__main__"')]
CAMNS = {"__file__": CAM_PY, "__name__": "cam_lib"}
exec(_src, CAMNS)
IN = CAMNS["IN"]
coll, clear, obj, boolean, material, ycyl, parent_keep = (CAMNS[k] for k in ("coll", "clear", "obj", "boolean", "material", "ycyl", "parent_keep"))
CRK = CAMNS["CRK"]["params"]

YF = CRK["flange_back"] - 0.001       # flywheel front face on the crank flange
K = dict(
    teeth=168, ring_od=14.105, pitch_d=14.0,     # [spec] 168T, 12 DP
    ring_root_d=13.80, ring_id=13.21, ring_w=0.497, ring_front=0.151,   # [est] ring gear section; front face .15" behind the flywheel's
    centre_d=2.485,                               # [spec]
    deck=0.960,                                   # [spec] crank face to friction face
    cbore_d=6.40, cbore_depth=0.43,               # [spec]
    hub_relief_r=3.10, web_t=0.76,                # [est] engine side: flat at the hub, relieved .20" outboard of r 3.1
    rim_r=6.85, friction_od=11.20,                # [est] body OD at the friction face; 11" disc
    bolt_c=CRK["fw_bolt_circle"], bolt_hole=0.460, bolt_n=6,           # [spec]
    bolt_head_d=0.60, bolt_head_h=0.30, bolt_shank_d=0.40, bolt_len=1.05,   # [est] 12-point heads, drawn round-ish
    pp_circles=(11.625, 12.625), pp_hole=0.3125, pp_depth=0.70,        # [spec] 3/8-16 (tap drill)
    pilot_od=1.090, pilot_id=0.59, pilot_len=0.70,                      # [est] bronze bushing, 1-1/8" input shaft pilot
)


def revolve(prof, seg=180):
    """Closed (r, y) profile revolved about Y (inches) -> closed manifold bmesh."""
    bm = bmesh.new(); rings = []
    for k in range(seg):
        a = 2 * math.pi * k / seg; s, c = math.sin(a), math.cos(a)
        rings.append([bm.verts.new(Vector((r * s, y, r * c)) * IN) for r, y in prof])
    n = len(prof)
    for k in range(seg):
        A, B = rings[k], rings[(k + 1) % seg]
        for i in range(n):
            j = (i + 1) % n; bm.faces.new((A[i], A[j], B[j], B[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm

def ring_gear():
    """168 teeth, straight-sided, extruded along Y."""
    z = K["teeth"]; ro, rr = K["ring_od"] / 2, K["ring_root_d"] / 2
    pts = []
    for i in range(z):
        a0 = 2 * math.pi * i / z; p = 2 * math.pi / z
        for u, r in ((0.0, rr), (0.18, rr), (0.36, ro), (0.64, ro), (0.82, rr)):
            a = a0 + u * p; pts.append((r * math.sin(a), r * math.cos(a)))
    y0 = YF - K["ring_front"]; y1 = y0 - K["ring_w"]
    bm = CAMNS["loft"]([CAMNS["ysec"](pts, y0), CAMNS["ysec"](pts, y1)])
    return bm


def build():
    root = coll("BBC_Flywheel"); clear(root)
    tmp = coll("Flywheel_tmp", root, hide=True)
    crank = bpy.data.objects["Crankshaft"]
    CAMNS["set_crank"](0.0); bpy.context.view_layer.update()
    yf = YF; yh = yf - (K["deck"] - K["cbore_depth"]); yr = yf - K["deck"]
    rc, rcb, rel = K["centre_d"] / 2, K["cbore_d"] / 2, K["hub_relief_r"]
    yw = yr + K["web_t"]                                   # relieved engine-side face
    rin = K["ring_id"] / 2 - 0.004; y_ring0 = yf - K["ring_front"]; y_ring1 = y_ring0 - K["ring_w"]
    prof = [(rc, yf), (rel, yf), (rel + 0.4, yw), (rin - 0.35, yw), (rin - 0.25, y_ring0 + 0.0),
            (rin, y_ring0), (rin, y_ring1 - 0.003), (K["rim_r"], y_ring1 - 0.003), (K["rim_r"], yr),
            (rcb, yr), (rcb, yh), (rc, yh)]
    fw = obj("Flywheel", revolve(prof), root)
    # Holes: crank bolts (phased like the crank's), pressure-plate taps.
    for j in range(K["bolt_n"]):
        a = 2 * math.pi * j / K["bolt_n"] + math.pi / 6
        x, zz = K["bolt_c"] / 2 * math.sin(a), K["bolt_c"] / 2 * math.cos(a)
        obj("bh", ycyl(K["bolt_hole"] / 2, yh - 0.1, yf + 0.1, 24, x, zz), tmp)
    for ci, dc in enumerate(K["pp_circles"]):
        for j in range(6):
            a = 2 * math.pi * j / 6 + (0.0 if ci == 0 else math.pi / 6)
            x, zz = dc / 2 * math.sin(a), dc / 2 * math.cos(a)
            obj("pp", ycyl(K["pp_hole"] / 2, yr - 0.05, yr + K["pp_depth"], 20, x, zz), tmp)
    boolean(fw, "DIFFERENCE", tmp); clear(tmp)
    rg = obj("FlywheelRingGear", ring_gear(), root)
    obj("bore", ycyl(K["ring_id"] / 2, y_ring0 + 0.1, y_ring1 - 0.1, 180), tmp)
    boolean(rg, "DIFFERENCE", tmp); clear(tmp)
    # Bolts: head on the hub's clutch-side face, shank into the crank flange.
    bm = bmesh.new()
    for j in range(K["bolt_n"]):
        a = 2 * math.pi * j / K["bolt_n"] + math.pi / 6
        x, zz = K["bolt_c"] / 2 * math.sin(a), K["bolt_c"] / 2 * math.cos(a)
        ycyl(K["bolt_head_d"] / 2, yh - 0.001 - K["bolt_head_h"], yh - 0.001, 12, x, zz, bm)
        ycyl(K["bolt_shank_d"] / 2, yh - 0.002, yh + K["bolt_len"], 20, x, zz, bm)
    bolts2 = obj("FlywheelBolts", bm, root)
    # Pilot bushing in the crank's pilot bore.
    pb = obj("PilotBushing", ycyl(K["pilot_od"] / 2, CRK["flange_back"] + 0.02, CRK["flange_back"] + 0.02 + K["pilot_len"], 48), root)
    obj("pid", ycyl(K["pilot_id"] / 2, CRK["flange_back"] - 0.1, CRK["flange_back"] + 1.0, 32), tmp)
    boolean(pb, "DIFFERENCE", tmp); clear(tmp); bpy.data.collections.remove(tmp)
    # Materials.
    body = material("Flywheel_Steel", (0.42, 0.42, 0.43, 1), 1.0, 0.45)
    ground = material("Flywheel_Ground", (0.78, 0.78, 0.79, 1), 1.0, 0.12)
    gear = material("Flywheel_RingGear", (0.30, 0.30, 0.31, 1), 1.0, 0.35)
    oxide = material("Flywheel_BoltOxide", (0.05, 0.05, 0.05, 1), 0.8, 0.40)
    bronze = material("PilotBronze", (0.72, 0.52, 0.28, 1), 1.0, 0.30)
    fw.data.materials.append(body); fw.data.materials.append(ground)
    for poly in fw.data.polygons:
        c, n = poly.center / IN, poly.normal
        if n.y < -0.99 and abs(c.y - yr) < 0.01 and math.hypot(c.x, c.z) > rcb: poly.material_index = 1
    for o, m in ((rg, gear), (bolts2, oxide), (pb, bronze)): o.data.materials.append(m)
    for o in (fw, rg, bolts2, pb):
        o.data.shade_smooth(); o.data.set_sharp_from_angle(angle=math.radians(30))
        parent_keep(o, crank)
    # Mass (steel .284 lb/in^3), from the closed meshes.
    def vol(o):
        bm_ = bmesh.new(); bm_.from_mesh(o.data); v = bm_.calc_volume() / IN ** 3; bm_.free(); return v
    mass = dict(flywheel_lb=round(vol(fw) * 0.284, 1), ring_gear_lb=round(vol(rg) * 0.284, 1))
    return [fw, rg, bolts2, pb], mass


def checks(parts, step=10.0):
    mesh_world, set_crank = CAMNS["mesh_world"], CAMNS["set_crank"]
    def tree(o):
        v, f = mesh_world(o); return BVHTree.FromPolygons([Vector(x) for x in v], f)
    fixed = [n for n in ["Block", "Crankshaft", "MainCap_5", "MainStuds_5"] if n in bpy.data.objects]
    fixed += [o.name for o in bpy.data.objects if o.type == "MESH" and o.name.startswith(("ConRod_7", "ConRod_8", "RodCap_7", "RodCap_8", "RodBolt_7", "RodBolt_8"))]
    hits = set()
    for d in np.arange(0, 360, step):
        set_crank(float(d))
        T = {o.name: tree(o) for o in parts}
        for n in fixed:
            ft = tree(bpy.data.objects[n])
            for o in parts:
                if T[o.name].overlap(ft): hits.add((o.name, n))
        for i, a in enumerate(parts):
            for b in parts[i + 1:]:
                if T[a.name].overlap(T[b.name]): hits.add((a.name, b.name))
    set_crank(0.0)
    # Gap from the flywheel's engine-side face to the block's rear face.
    v, _ = mesh_world(bpy.data.objects["Flywheel"])
    return dict(clash=sorted(hits), block_face_gap_in=round(-float(v[:, 1].max()), 3))


if __name__ == "__main__" or "bpy" in globals():
    parts, mass = build()
    res = checks(parts)
    info = dict(params=K, front_face_y=YF, mass=mass, checks=res,
                tris={o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in parts})
    with open(os.path.join(HERE, "flywheel_info.json"), "w") as f: json.dump(info, f, indent=1, default=float)
    print(json.dumps(info, default=float))
