"""Connecting rods, pistons, rings, wrist pins and rod bearings for Drew's 540,
built after ../block and ../crank and driven by the crank.

Parts per cylinder (n = 1..8):
  ConRod_n          Scat forged 4340 H-beam, 6.385" centre to centre. Origin on the
                    big-end centre, local +Z up the rod to the small end, pin axis local Y.
    RodCap_n, RodBolt_n_A/B, RodBushing_n, RodBearing_n_Upper/Lower   (children of the rod)
  Piston_n          Mahle forged flat top (928957000), 1.270" compression height.
                    Origin on the wrist pin centre, local +Z up the bore, local Y = crank axis.
    WristPin_n, Circlip_n_F/R, PistonRing_n_Top/Second/OilRailUpper/OilExpander/
    OilRailLower/SupportRail   (children of the piston)

Motion: every rod and piston has drivers on Crankshaft["crank_deg"] (the same
property that turns the crank), with the exact slider-crank solution:
  throw angle psi = psi0 - deg (from +Z towards +X), bank angle beta = -45 (left, odd) / +45 (right, even)
  theta = psi - beta (crank angle from that cylinder's TDC)
  crank pin  = R (sin psi, cos psi)
  wrist pin  = s (sin beta, cos beta),  s = R cos theta + sqrt(L^2 - R^2 sin^2 theta)
  rod angle  = beta - asin(R sin theta / L)
so playback, scrubbing or keying crank_deg moves the whole rotating assembly.

Axes and units as the block. Tags: [spec] published / on Drew's parts boxes,
[meas] from Drew's photos, [derived], [est]. Sources in PARTS.md.

Run live in Blender after build_crank.py:
    exec(open(r"C:/Users/drewm/Documents/scripts/camaro_webpage/3d_model/engine/rods/build_rods.py").read())
"""
import bpy, bmesh, json, math, os
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

HERE = (os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals()
        else r"C:\Users\drewm\Documents\scripts\camaro_webpage\3d_model\engine\rods")
IN = 0.0254
BLK = json.load(open(os.path.join(HERE, "..", "block", "block_info.json")))
CRK = json.load(open(os.path.join(HERE, "..", "crank", "crank_info.json")))
BP, CP = BLK["params"], CRK["params"]
THROWS, PIN_Y = CRK["throws_psi_deg"], CRK["pin_y"]
R = CP["stroke"] / 2

K = dict(
    # ---- rod (Scat H-beam, photos 15, 424, 456, 459, 512) ----
    rod_cc=6.385,        # [derived] deck 9.800 - throw 2.125 - CH 1.270 = 6.405 at zero deck; Scat's 6.385 puts the crown .020" down
    big_bore=2.3247,     # [spec] BBC rod housing bore 2.3247-2.3252
    big_w=0.990,         # [spec] BBC big-end width (block's 1.000" stagger)
    big_r=1.52,          # [est] big-end outer radius
    boss_x=1.74, boss_top=1.15,   # [est] rod-side bolt bosses
    cap_drop=0.72,       # [est] cap bolt bosses below the parting line
    bolt_x=1.42,         # [est] bolt centres
    bolt_d=0.4375,       # [spec] Scat 7/16" cap screws
    bolt_into=0.95,      # [est] thread engagement in the rod
    head_d=0.56, head_h=0.40,     # [est] 12-point head
    beam_t=0.94,         # [est] beam and small-end thickness
    flange=0.17,         # [est] H flange (side plate) thickness
    web=0.30,            # [est] H web thickness
    beam_lo=1.30, beam_hi=1.00,   # [est] beam width at the big and small ends
    chan_z=(1.95, 5.35), # [est] H channel ends, from the big-end centre
    small_od=1.38,       # [est]
    bush_od=1.115,       # [est] bronze bushing (photo 15)
    pin_fit=0.0015,      # [est] pin clearance in the bushing, per side
    small_oil=0.16,      # [est] oil hole in the top of the small end (photo 424)
    rb_w=0.88,           # [est] rod bearing width
    rb_clear=0.0025,     # [est] diametral oil clearance
    # ---- piston (Mahle 928957000, box label photo 509; photos 456, 459, 470, 510) ----
    ch=1.270,            # [spec] compression height (box: "FT 1270CH")
    ptw=0.0045,          # [spec] piston-to-wall (box: "PTW clearance .0045")
    pin_d=0.990, pin_len=2.520, pin_wall=0.180,   # [spec] box: PIN 0.990 x 2.520 x 0.180W
    clip_wire=1.6 / 25.4,                          # [spec] box: Circlip 0.990 x 1.6mm
    top_land=0.250, land2=0.170, land3=0.160,      # [est] land heights
    ring1=1.5 / 25.4, ring2=1.5 / 25.4, oil=3.0 / 25.4,   # [spec] box: 1.5, 1.5, 3.0 mm
    rail_t=0.030,        # [est] oil support rail (box: "Oil Support Rail 4.500-4.560 3mm")
    groove_d=0.200, oil_groove_d=0.190,           # [est] groove depths
    ring_radial=0.180, rail_radial=0.100,          # [est]
    gap_top=0.025, gap_2nd=0.030, gap_rail=0.015,  # [est] file-fit gaps
    crown_t=0.33,        # [est]
    belt_in=1.95,        # [est] ring-belt inner radius
    skirt_t=0.13,        # [est]
    belt_bottom=0.32,    # [est] skirt panels start below this (photo 459)
    skirt_bottom=-0.80,  # [est] before the counterweight relief
    boss_r=0.78, boss_gap=0.53, boss_face=1.38, boss_wall=0.15,   # [est] pin bosses and their side walls
    cw_clear=0.10,       # [est] skirt relief clearance to the counterweight sweep at BDC
    relief_r=1.20,       # [derived] 2.30" intake valve + .10"
    relief_c=(0.38, 0.91),   # [est] intake valve centre: towards the intake side, along the bank; leaves a .06" rim
    relief_tilt=18.0,    # [est] relief floor angle (crescent ~.55" wide, photo 470)
    relief_depth=0.18,   # [est] deepest point, at the outer edge
)
L = K["rod_cc"]
BETA = {"L": -45.0, "R": 45.0}
# Intake valve position: heads run E-I-I-E-E-I-I-E front to rear, so the intake
# is behind the exhaust on the 1st and 3rd cylinder of each bank, ahead on the 2nd and 4th.
SEG_BORE = 64                                     # the block's bore is a 64-sided polygon
R_RING = BP["bore"] / 2 * math.cos(math.pi / SEG_BORE) - 0.0003   # ring OD, inside the polygon's flats
R_PIST = min((BP["bore"] - K["ptw"]) / 2, R_RING - 0.0005)        # piston OD (the polygon takes the .0045 clearance)
GROOVES = {}   # name: (z_bottom, z_top, root_r)


def cyl_layout():
    """(cyl, bank, throw index, bore-centre y) for all eight."""
    out = []
    for k in range(4):
        out.append((2 * k + 1, "L", k, PIN_Y[k] + BP["stagger"] / 2))
        out.append((2 * k + 2, "R", k, PIN_Y[k] - BP["stagger"] / 2))
    return out


# ---- helpers (as build_crank.py) ---------------------------------------------

def coll(name, parent=None):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    par = parent or bpy.context.scene.collection
    if c.name not in par.children: par.children.link(c)
    return c

def clear(c):
    for ch in list(c.children): clear(ch); bpy.data.collections.remove(ch)
    for o in list(c.objects):
        me = o.data if o.type == "MESH" else None
        bpy.data.objects.remove(o, do_unlink=True)
        if me and me.users == 0: bpy.data.meshes.remove(me)

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

def zcyl(r, z0, z1, seg=128, bm=None):
    return prism([Vector((r * math.cos(2 * math.pi * k / seg), r * math.sin(2 * math.pi * k / seg), z0)) for k in range(seg)],
                 Vector((0, 0, 1)), z1 - z0, bm)

def ycyl(r, y0, y1, seg=64, x=0.0, z=0.0, bm=None):
    return prism([Vector((x + r * math.cos(2 * math.pi * k / seg), y0, z + r * math.sin(2 * math.pi * k / seg))) for k in range(seg)],
                 Vector((0, 1, 0)), y1 - y0, bm)

def box(x0, x1, y0, y1, z0, z1, bm=None):
    return prism([Vector((x0, y0, z0)), Vector((x1, y0, z0)), Vector((x1, y1, z0)), Vector((x0, y1, z0))], Vector((0, 0, 1)), z1 - z0, bm)

def revolve(profile, axis="z", a0=0.0, a1=2 * math.pi, seg=128, bm=None):
    """Closed (r, h) profile swept about local Z (axis "z": point (r cos a, r sin a, h))
    or Y (axis "y": point (r cos a, h, r sin a)). A full sweep is closed; a partial one is capped."""
    bm = bm or bmesh.new()
    full = abs(a1 - a0 - 2 * math.pi) < 1e-9
    n_s = seg if full else seg + 1
    rings = []
    for s in range(n_s):
        a = a0 + (a1 - a0) * s / seg
        if axis == "z": pts = [Vector((r * math.cos(a), r * math.sin(a), h)) for r, h in profile]
        else:           pts = [Vector((r * math.cos(a), h, r * math.sin(a))) for r, h in profile]
        rings.append([bm.verts.new(p * IN) for p in pts])
    n = len(profile)
    for s in range(seg if full else seg):
        s1 = (s + 1) % n_s
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((rings[s][i], rings[s][j], rings[s1][j], rings[s1][i]))
    if not full: bm.faces.new(rings[0]); bm.faces.new(rings[-1][::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm

def revolve_half(profile, upper, seg=64, bm=None):
    a0, a1 = (0.0, math.pi) if upper else (math.pi, 2 * math.pi)
    return revolve(profile, "y", a0, a1, seg, bm)

def boolean(target, kind, operand):
    m = target.modifiers.new(kind, "BOOLEAN"); m.operation = kind; m.solver = "MANIFOLD"
    if isinstance(operand, bpy.types.Collection): m.operand_type = "COLLECTION"; m.collection = operand
    else: m.object = operand
    with bpy.context.temp_override(object=target, active_object=target):
        bpy.ops.object.modifier_apply(modifier=m.name)

def hull2d(pts):
    pts = sorted(set((round(p[0], 9), round(p[1], 9)) for p in pts))
    def cross(o, a, b): return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, hi = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0: lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(hi) >= 2 and cross(hi[-2], hi[-1], p) <= 0: hi.pop()
        hi.append(p)
    return lo[:-1] + hi[:-1]

def xz_prism(pts2d, y0, y1, bm=None):
    """Outline in the local XZ plane (x, z), extruded along Y from y0 to y1."""
    return prism([Vector((x, y0, z)) for x, z in pts2d], Vector((0, 1, 0)), y1 - y0, bm)

def arc(cx, cz, r, a0, a1, n=48):
    return [(cx + r * math.cos(a0 + (a1 - a0) * i / n), cz + r * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]

def material(name, rgba, metal, rough):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True; m.diffuse_color = rgba
    bsdf = next((nd for nd in m.node_tree.nodes if nd.type == "BSDF_PRINCIPLED"), None)
    if bsdf:
        bsdf.inputs["Base Color"].default_value = rgba
        bsdf.inputs["Metallic"].default_value = metal
        bsdf.inputs["Roughness"].default_value = rough
    return m

def finish(o, mats, smooth=35):
    for m in mats: o.data.materials.append(m)
    o.data.shade_smooth(); o.data.set_sharp_from_angle(angle=math.radians(smooth))

def make_from(tmp, name, root):
    """Union everything in tmp into its first-built object, moved to root and renamed."""
    first = tmp.objects[0]; tmp.objects.unlink(first); root.objects.link(first)
    first.name = name; first.data.name = name
    if len(tmp.objects): boolean(first, "UNION", tmp)
    clear(tmp)
    return first

def cut(target, tmp):
    if len(tmp.objects): boolean(target, "DIFFERENCE", tmp)
    clear(tmp)


# ---- rod ----------------------------------------------------------------------

def stadium_x(y_half, z0, z1, x0, x1, n=16):
    """Channel cutter: a slot rounded at both ends in the YZ plane, extruded along X."""
    r = y_half; pts = []
    for i in range(n + 1):
        a = math.pi + math.pi * i / n; pts.append(Vector((x0, r * math.cos(a), z0 + r + r * math.sin(a))))
    for i in range(n + 1):
        a = math.pi * i / n; pts.append(Vector((x0, r * math.cos(a), z1 - r + r * math.sin(a))))
    return prism(pts, Vector((1, 0, 0)), x1 - x0)

def build_rod_meshes(lib):
    """One set of rod meshes, shared (linked) by all eight rods. Returns {part: mesh}."""
    tmp = coll("Rod_tmp", lib); tmp.hide_viewport = tmp.hide_render = True
    bw, bt = K["big_w"] / 2, K["beam_t"] / 2
    # Rod body: big end (half disc + bolt bosses + flare), beam, small end.
    er = K["boss_x"] - K["bolt_x"]                     # bolt-boss ears are round about the bolt (photos 15, 512)
    ez = K["boss_top"] - er
    # Right half of the rod-side big end: up the ear, round its top, then a concave
    # flare into the beam (photos 15, 459); mirrored for the left.
    half = [(K["boss_x"], 0.0)] + arc(K["bolt_x"], ez, er, 0, math.pi / 2, 16)[:-1]
    p0, c, p1 = (K["bolt_x"], K["boss_top"]), (K["beam_lo"] / 2 + 0.02, K["boss_top"] + 0.10), (K["beam_lo"] / 2, 2.45)
    half += [((1 - t) ** 2 * p0[0] + 2 * t * (1 - t) * c[0] + t * t * p1[0], (1 - t) ** 2 * p0[1] + 2 * t * (1 - t) * c[1] + t * t * p1[1])
             for t in (i / 16 for i in range(17))]
    big = half + [(-x, z) for x, z in reversed(half)]
    bm = xz_prism(big, -bw, bw); bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    obj("big", bm, tmp)
    beam = [(-K["beam_lo"] / 2, 1.3), (K["beam_lo"] / 2, 1.3), (K["beam_hi"] / 2, L - 0.45), (-K["beam_hi"] / 2, L - 0.45)]
    obj("beam", xz_prism(beam, -bt, bt), tmp)
    small = arc(0, L, K["small_od"] / 2, 0, 2 * math.pi, 64)[:-1] + [(K["beam_hi"] / 2, L - 1.0), (-K["beam_hi"] / 2, L - 1.0)]
    obj("small", xz_prism(hull2d(small), -bt, bt), tmp)
    rod = make_from(tmp, "ConRod", lib)
    # Cuts: big-end bore, H channels, small-end bore, bolt holes, small-end oil hole.
    obj("bore", ycyl(K["big_bore"] / 2, -1, 1, 128), tmp)
    ch_half = bt - K["flange"]
    for sgn in (1, -1):
        x0, x1 = (K["web"] / 2, 2.0) if sgn > 0 else (-2.0, -K["web"] / 2)
        obj("chan", stadium_x(ch_half, K["chan_z"][0], K["chan_z"][1], x0, x1), tmp)
    obj("pinbore", ycyl(K["bush_od"] / 2, -1, 1, 96, 0, L), tmp)
    for sx in (1, -1):
        obj("bolt", cyl(Vector((sx * K["bolt_x"], 0, -0.1)), Vector((0, 0, 1)), K["bolt_d"] / 2, K["bolt_into"] + 0.1, 24), tmp)
    obj("oil", cyl(Vector((0, 0, L)), Vector((0, 0, 1)), K["small_oil"] / 2, 1.0, 16), tmp)
    cut(rod, tmp)
    # Cap.
    cap_pts = arc(0, 0, K["big_r"], math.pi, 2 * math.pi, 64) + [(K["boss_x"], 0), (-K["boss_x"], 0)]
    for sx in (1, -1): cap_pts += arc(sx * K["bolt_x"], -K["cap_drop"] + er, er, math.pi, 2 * math.pi, 24)
    obj("cap", xz_prism(hull2d(cap_pts), -bw, bw), tmp)
    cap = make_from(tmp, "RodCap", lib)
    obj("bore", ycyl(K["big_bore"] / 2, -1, 1, 128), tmp)
    for sx in (1, -1):
        obj("bolt", cyl(Vector((sx * K["bolt_x"], 0, -K["cap_drop"] - 0.1)), Vector((0, 0, 1)), K["bolt_d"] / 2 + 0.008, K["cap_drop"] + 0.2, 24), tmp)
    cut(cap, tmp)
    # Bolt (A on +X; B uses the same mesh, placed at -X).
    bolt = cyl(Vector((0, 0, -K["cap_drop"] - K["head_h"])), Vector((0, 0, 1)), K["head_d"] / 2, K["head_h"], 12)
    cyl(Vector((0, 0, -K["cap_drop"] - 0.002)), Vector((0, 0, 1)), K["bolt_d"] / 2 - 0.004, K["cap_drop"] + K["bolt_into"] - 0.05, 24, bolt)
    bolt_o = obj("RodBolt", bolt, lib)
    # Bushing and bearing shells.
    ri = K["pin_d"] / 2 + K["pin_fit"]
    bush = obj("RodBushing", revolve([(ri, -bt + 0.001), (K["bush_od"] / 2 - 0.0005, -bt + 0.001), (K["bush_od"] / 2 - 0.0005, bt - 0.001), (ri, bt - 0.001)], "y", seg=128), lib)
    bush.location = (0, 0, 0)
    bush.data.transform(Matrix.Translation(Vector((0, 0, L * IN))))
    rbi, rbo, hw = (CP["rod_d"] + K["rb_clear"]) / 2, K["big_bore"] / 2 - 0.001, K["rb_w"] / 2
    prof = [(rbi, -hw), (rbo, -hw), (rbo, hw), (rbi, hw)]
    up = obj("RodBearing_Upper", revolve_half(prof, True, 64), lib)
    lo = obj("RodBearing_Lower", revolve_half(prof, False, 64), lib)
    bpy.data.collections.remove(tmp)
    return dict(rod=rod, cap=cap, bolt=bolt_o, bush=bush, upper=up, lower=lo)


# ---- piston -------------------------------------------------------------------

def ring_stack():
    """Groove z ranges, crown downward."""
    z = K["ch"] - K["top_land"]
    g = {}
    g["Top"] = (z - K["ring1"], z); z -= K["ring1"] + K["land2"]
    g["Second"] = (z - K["ring2"], z); z -= K["ring2"] + K["land3"]
    g["Oil"] = (z - K["oil"] - K["rail_t"], z)          # deepened by the support rail
    return g

def build_piston_mesh(lib, s_int, y_int):
    """Piston with its intake relief on local +X (s_int=+1) or -X, at +Y (front, y_int=+1) or -Y."""
    tmp = coll("Piston_tmp", lib); tmp.hide_viewport = tmp.hide_render = True
    ch, Rp = K["ch"], R_PIST
    obj("body", zcyl(Rp, K["skirt_bottom"], ch, 128), tmp)
    pis = make_from(tmp, f"Piston_{'I' if s_int > 0 else 'E'}{'F' if y_int > 0 else 'R'}", lib)
    G = ring_stack()
    # 1. Ring grooves, side windows, hollow.
    for name, (z0, z1) in G.items():
        root = Rp - (K["oil_groove_d"] if name == "Oil" else K["groove_d"])
        obj("groove", revolve([(root, z0), (Rp + 0.1, z0), (Rp + 0.1, z1), (root, z1)], "z", seg=128), tmp)
    bf, bb = K["boss_face"], K["belt_bottom"]
    for sy in (1, -1):
        obj("window", box(-3, 3, bf if sy > 0 else -3, 3 if sy > 0 else -bf, K["skirt_bottom"] - 0.1, bb), tmp)
    obj("hollow", zcyl(Rp - K["skirt_t"], K["skirt_bottom"] - 0.1, bb, 96), tmp)
    obj("hollow", zcyl(K["belt_in"], bb - 0.01, ch - K["crown_t"], 96), tmp)
    cut(pis, tmp)
    # 2. Pin bosses (towers up to the crown) and the boss side walls out to the skirts.
    for sy in (1, -1):
        y0, y1 = (K["boss_gap"], bf) if sy > 0 else (-bf, -K["boss_gap"])
        obj("boss", ycyl(K["boss_r"], y0, y1, 48), tmp)
        obj("tower", box(-K["boss_r"], K["boss_r"], y0, y1, 0, ch - K["crown_t"] + 0.05), tmp)
        w0, w1 = (bf - K["boss_wall"], bf) if sy > 0 else (-bf, -bf + K["boss_wall"])
        obj("wall", box(-(Rp - 0.05), Rp - 0.05, w0, w1, K["skirt_bottom"], bb + 0.05), tmp)
    obj("keep", zcyl(Rp - 0.02, K["skirt_bottom"], bb + 0.05, 96), tmp)
    # walls clipped to the skirt: union only their part inside the piston
    keep = tmp.objects["keep"]; tmp.objects.unlink(keep)
    walls = [o for o in tmp.objects if o.name.startswith("wall")]
    for w in walls:
        m = w.modifiers.new("i", "BOOLEAN"); m.operation = "INTERSECT"; m.solver = "MANIFOLD"; m.object = keep
        with bpy.context.temp_override(object=w, active_object=w): bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.data.objects.remove(keep)
    boolean(pis, "UNION", tmp); clear(tmp)
    # 3. Pin bore, circlip grooves, counterweight relief, valve relief.
    rp = K["pin_d"] / 2 + 0.0005
    obj("pinbore", ycyl(rp, -3, 3, 128), tmp)
    cw = K["clip_wire"]; yc = K["pin_len"] / 2 + 0.002 + cw / 2
    for sy in (1, -1):
        obj("clipgroove", revolve([(rp - 0.01, sy * yc - cw / 2 - 0.0015), (rp + 0.055, sy * yc - cw / 2 - 0.0015),
                                   (rp + 0.055, sy * yc + cw / 2 + 0.0015), (rp - 0.01, sy * yc + cw / 2 + 0.0015)], "y", seg=64), tmp)
    zc = -(L - R)                                     # crank axis seen from the piston at BDC
    obj("cwrelief", ycyl(CP["cw_r"] + K["cw_clear"], -3, 3, 192, 0, zc), tmp)
    cx, cy = s_int * K["relief_c"][0], y_int * K["relief_c"][1]
    w = Vector((cx, cy, 0)).normalized(); t = math.radians(K["relief_tilt"])
    d = (w * math.sin(t) + Vector((0, 0, 1)) * math.cos(t)).normalized()
    Q = Vector((cx, cy, ch)); P0 = Q + w * K["relief_r"] - Vector((0, 0, K["relief_depth"]))
    B = Q + d * (P0 - Q).dot(d)
    obj("relief", cyl(B, d, K["relief_r"], 2.0, 96), tmp)
    cut(pis, tmp)
    bpy.data.collections.remove(tmp)
    # Finish: crown, lands and bosses bare forged aluminium; skirt panels coated (photo 510).
    alu = material("Piston_Aluminium", (0.72, 0.72, 0.74, 1), 0.9, 0.38)
    coat = material("Piston_SkirtCoat", (0.17, 0.17, 0.18, 1), 0.2, 0.6)
    finish(pis, [alu, coat], 30)
    for p in pis.data.polygons:
        c, n = p.center / IN, p.normal
        r = math.hypot(c.x, c.y)
        if c.z < K["belt_bottom"] - 0.005 and abs(r - Rp) < 0.01 and (n.x * c.x + n.y * c.y) / max(r, 1e-6) > 0.8:
            p.material_index = 1
    return pis

def ring_meshes(lib):
    """Rings and the support rail, shared by all pistons. Gap angles measured in the
    piston's local XY plane from +Y (engine front) towards +X."""
    G = ring_stack(); out = {}
    def ring(name, z0, z1, ri, ro, gap, at_deg):
        ga = gap / ro                             # gap as an angle
        a0 = math.radians(90 - at_deg) + ga / 2   # local angle from +X
        out[name] = obj(f"PistonRing_{name}", revolve([(ri, z0), (ro, z0), (ro, z1), (ri, z1)], "z", a0, a0 + 2 * math.pi - ga, 128), lib)
    sc = 0.0008                                    # axial side clearance each side
    z0, z1 = G["Top"];    ring("Top", z0 + sc, z1 - sc, R_RING - K["ring_radial"], R_RING, K["gap_top"], 135)       # [est]
    z0, z1 = G["Second"]; ring("Second", z0 + sc, z1 - sc, R_RING - K["ring_radial"], R_RING, K["gap_2nd"], 315)    # [est] opposite the top
    z0, z1 = G["Oil"]; zs = z0 + K["rail_t"]       # support rail occupies the bottom of the oil groove
    rt = 0.6 / 25.4                                 # [est] .6 mm rails
    root = R_PIST - K["oil_groove_d"]
    ring("OilRailLower", zs + 0.001, zs + 0.001 + rt, R_RING - K["rail_radial"], R_RING, K["gap_rail"], 0)       # Mahle sheet (photo 382): front, on the pin line
    ring("OilRailUpper", z1 - 0.001 - rt, z1 - 0.001, R_RING - K["rail_radial"], R_RING, K["gap_rail"], 180)     # [est]
    ring("OilExpander", zs + 0.003 + rt, z1 - 0.003 - rt, root + 0.01, R_RING - 0.045, 0.06, 100)              # [est]
    ring("SupportRail", z0 + 0.001, zs - 0.001, root + 0.01, R_PIST - 0.004, 0.05, 90)                          # [est] gap off the pin bores
    return out

def pin_meshes(lib):
    ro, ri, hl = K["pin_d"] / 2, K["pin_d"] / 2 - K["pin_wall"], K["pin_len"] / 2
    pin = obj("WristPin", revolve([(ri, -hl), (ro, -hl), (ro, hl), (ri, hl)], "y", seg=64), lib)
    cw = K["clip_wire"]; yc = hl + 0.002 + cw / 2; rc = K["pin_d"] / 2 + 0.0005 + 0.055 - cw / 2 - 0.002
    def clip(sy):
        prof = [(rc + cw / 2 * math.cos(2 * math.pi * i / 10), sy * yc + cw / 2 * math.sin(2 * math.pi * i / 10)) for i in range(10)]
        return obj(f"Circlip_{'F' if sy > 0 else 'R'}", revolve(prof, "y", math.radians(20), math.radians(340), 64), lib)
    return pin, clip(1), clip(-1)


# ---- assembly and drivers -----------------------------------------------------

def place(name, mesh, c, parent=None, loc=(0, 0, 0)):
    o = bpy.data.objects.new(name, mesh); c.objects.link(o)
    if parent: o.parent = parent; o.matrix_parent_inverse = Matrix.Identity(4)
    o.location = Vector(loc) * IN
    return o

def drive(o, path, idx, expr, crank):
    o.driver_remove(path, idx)
    fc = o.driver_add(path, idx); d = fc.driver; d.type = "SCRIPTED"
    v = d.variables.new(); v.name = "deg"; v.type = "SINGLE_PROP"
    v.targets[0].id = crank; v.targets[0].data_path = '["crank_deg"]'
    d.expression = expr
    return d.is_simple_expression

def f(x): return f"{x:.10g}"

def rig(rod, pis, psi0, beta, crank):
    D = math.pi / 180
    A, B = psi0 * D, beta * D
    a = f"({f(A)}-deg*{f(D)})"                 # throw angle psi
    t = f"({f(A - B)}-deg*{f(D)})"             # crank angle from this cylinder's TDC
    s = f"({f(R)}*cos({t})+sqrt({f(L * L)}-{f(R * R)}*sin({t})*sin({t})))"
    ok = []
    rod.rotation_mode = pis.rotation_mode = "XYZ"
    ok.append(drive(rod, "location", 0, f"{f(R * IN)}*sin({a})", crank))
    ok.append(drive(rod, "location", 2, f"{f(R * IN)}*cos({a})", crank))
    ok.append(drive(rod, "rotation_euler", 1, f"{f(B)}-asin({f(R / L)}*sin({t}))", crank))
    ok.append(drive(pis, "location", 0, f"{f(IN * math.sin(B))}*{s}", crank))
    ok.append(drive(pis, "location", 2, f"{f(IN * math.cos(B))}*{s}", crank))
    pis.rotation_euler = (0, B, 0)
    return all(ok)


def build():
    crank = bpy.data.objects["Crankshaft"]
    root = coll("BBC_Rods_Pistons"); clear(root)
    lib = coll("RP_Library", root); lib.hide_viewport = lib.hide_render = True
    rods_c, pist_c = coll("Rods", root), coll("Pistons", root)
    rm = build_rod_meshes(lib)
    steel = material("Rod_Steel", (0.55, 0.55, 0.56, 1), 1.0, 0.48)
    black = material("Rod_Bolt", (0.05, 0.05, 0.055, 1), 0.8, 0.4)
    bronze = material("Bronze", (0.72, 0.50, 0.27, 1), 1.0, 0.3)
    shell = bpy.data.materials.get("Bearing_Shell") or material("Bearing_Shell", (0.63, 0.61, 0.57, 1), 0.85, 0.35)
    for k, m in (("rod", steel), ("cap", steel), ("bolt", black), ("bush", bronze), ("upper", shell), ("lower", shell)):
        finish(rm[k], [m])
    pistons = {}
    for s_int in (1, -1):
        for y_int in (1, -1):
            pistons[(s_int, y_int)] = build_piston_mesh(lib, s_int, y_int)
    rings = ring_meshes(lib)
    ring_steel = material("Ring_Steel", (0.30, 0.30, 0.32, 1), 1.0, 0.3)
    chrome = material("Ring_Chrome", (0.85, 0.85, 0.87, 1), 1.0, 0.1)
    for n, o in rings.items(): finish(o, [chrome if "Rail" in n and "Support" not in n else ring_steel])
    pin, clipF, clipR = pin_meshes(lib)
    finish(pin, [material("Pin_Steel", (0.78, 0.78, 0.80, 1), 1.0, 0.15)])
    for c in (clipF, clipR): finish(c, [material("Circlip_Steel", (0.12, 0.12, 0.13, 1), 0.9, 0.35)])

    simple, made = True, []
    for cyl_n, bank, k, yb in cyl_layout():
        beta = BETA[bank]
        s_int = 1 if bank == "L" else -1
        nth = [1, 3, 5, 7].index(cyl_n) if bank == "L" else [2, 4, 6, 8].index(cyl_n)
        y_int = 1 if nth % 2 else -1                       # E-I-I-E: 1st and 3rd of each bank have the intake behind
        rod = place(f"ConRod_{cyl_n}", rm["rod"].data, rods_c, loc=(0, yb, 0))
        place(f"RodCap_{cyl_n}", rm["cap"].data, rods_c, rod)
        place(f"RodBolt_{cyl_n}_A", rm["bolt"].data, rods_c, rod, (K["bolt_x"], 0, 0))
        place(f"RodBolt_{cyl_n}_B", rm["bolt"].data, rods_c, rod, (-K["bolt_x"], 0, 0))
        place(f"RodBushing_{cyl_n}", rm["bush"].data, rods_c, rod)
        place(f"RodBearing_{cyl_n}_Upper", rm["upper"].data, rods_c, rod)
        place(f"RodBearing_{cyl_n}_Lower", rm["lower"].data, rods_c, rod)
        pis = place(f"Piston_{cyl_n}", pistons[(s_int, y_int)].data, pist_c, loc=(0, yb, 0))
        place(f"WristPin_{cyl_n}", pin.data, pist_c, pis)
        place(f"Circlip_{cyl_n}_F", clipF.data, pist_c, pis)
        place(f"Circlip_{cyl_n}_R", clipR.data, pist_c, pis)
        for n, o in rings.items(): place(f"PistonRing_{cyl_n}_{n}", o.data, pist_c, pis)
        simple &= rig(rod, pis, THROWS[k], beta, crank)
        made.append(dict(cyl=cyl_n, bank=bank, throw=k + 1, y=round(yb, 3), intake=("+" if y_int > 0 else "-") + "Y"))
    bpy.context.view_layer.update()
    return root, made, simple


# ---- checks -------------------------------------------------------------------

def mesh_arrays(o):
    me = o.data
    v = np.empty(len(me.vertices) * 3); me.vertices.foreach_get("co", v)
    return v.reshape(-1, 3), [tuple(p.vertices) for p in me.polygons]

def tree_world(parts):
    """One BVH for a group of objects at their current world matrices."""
    V, F, off = [], [], 0
    for o in parts:
        v, polys = mesh_arrays(o)
        mw = np.array(o.matrix_world)
        w = v @ mw[:3, :3].T + mw[:3, 3]
        V.append(w); F.extend(tuple(i + off for i in p) for p in polys); off += len(v)
    return BVHTree.FromPolygons(np.vstack(V).tolist(), F)

def check(root, frames=range(1, 49)):
    """Frames 1-48 = crank 0-352.5 deg in 7.5 deg steps. Tests every rod group and
    piston group against the crank, the block, caps, studs and main bearings, the other
    rod on its throw, and its own piston; reports any overlap."""
    sc = bpy.context.scene; f0 = sc.frame_current
    crank = bpy.data.objects["Crankshaft"]
    static = [o for o in bpy.data.objects if o.type == "MESH" and o.visible_get()
              and o.name.startswith(("Block", "MainCap", "MainStuds", "MainBearing"))]
    st = {o.name: tree_world([o]) for o in static}
    groups = {}
    for o in root.all_objects:
        if o.type != "MESH" or o.users_collection[0].name == "RP_Library": continue
        n = int(o.name.split("_")[1])
        kind = "rod" if o.name.startswith(("ConRod", "RodCap", "RodBolt", "RodBushing", "RodBearing")) else "pis"
        groups.setdefault((kind, n), []).append(o)
    partner = {1: 2, 2: 1, 3: 4, 4: 3, 5: 6, 6: 5, 7: 8, 8: 7}
    hits, tdc = [], {}
    for fr in frames:
        sc.frame_set(fr)
        deg = crank["crank_deg"]
        ct = tree_world([crank])
        T = {key: tree_world(objs) for key, objs in groups.items()}
        for (kind, n), t in T.items():
            if t.overlap(ct): hits.append((round(deg, 1), f"{kind}{n}", "Crankshaft"))
            for name, s in st.items():
                if t.overlap(s): hits.append((round(deg, 1), f"{kind}{n}", name))
            if kind == "rod":
                if n < partner[n] and t.overlap(T[("rod", partner[n])]): hits.append((round(deg, 1), f"rod{n}", f"rod{partner[n]}"))
                if t.overlap(T[("pis", n)]): hits.append((round(deg, 1), f"rod{n}", f"pis{n}"))
        for n in range(1, 9):
            p = bpy.data.objects[f"Piston_{n}"]
            t = p.matrix_world.translation; z = math.hypot(t.x, t.z) / IN
            if n not in tdc or z > tdc[n][1]: tdc[n] = (deg, z)
    sc.frame_set(f0)
    return hits, {n: (round(d, 1), round(z + K["ch"], 4)) for n, (d, z) in tdc.items()}, len(static)


def run():
    root, made, simple = build()
    hits, tdc, n_static = check(root)
    info = dict(params=K, R_piston=R_PIST, R_ring=R_RING, grooves=ring_stack(), cylinders=made,
                drivers_simple=simple, crown_at_tdc={n: dict(deg=d, crown_from_crank=z, below_deck=round(BP["deck"] - z, 4)) for n, (d, z) in tdc.items()},
                clash=hits, clash_checked_against=n_static)
    with open(os.path.join(HERE, "rods_info.json"), "w") as fh: json.dump(info, fh, indent=1, default=str)
    return info


if __name__ == "__main__" or "bpy" in globals():
    _info = run()
    print(json.dumps(dict(simple=_info["drivers_simple"], clash=_info["clash"][:40], n_clash=len(_info["clash"]),
                          tdc=_info["crown_at_tdc"]), default=str))
