"""Finish pass for the engine model (bbc_block_work.blend): surface textures, UVs and normals.

Run it after any build_*.py script, inside the open .blend (Blender's Python console / the MCP bridge):
    exec(open(r"<repo>/3d_model/engine/materials/finish_materials.py").read())
or headless, saving the file:
    blender -b 3d_model/engine/bbc_block_work.blend --python 3d_model/engine/materials/finish_materials.py -- --save

What it does, for every mesh in the BBC_* collections:
  0. Slots. Drops the empty material slot some build steps leave in front of the real ones (slots_pass).
  1. Materials. Each material the build scripts make (flat colours) is rebuilt as an image-textured
     Principled BSDF: base colour, a normal map and an ORM map (occlusion 1, roughness, metal), all
     tileable, generated here with numpy from the finish named for it in MATS, written to materials/tex
     (gitignored; scripts/export_engine_glb.py runs this stage before every export, so they're always there).
     The finishes follow Drew's build photos: orange-peel gloss paint over the cast-iron block, sand-cast
     aluminium heads with bright fly-cut decks and rails, satin moly-coated piston skirts, black-oxide
     fasteners, orange anodised billet rockers, shot-peened springs, a gloss powder-coated pan, ground
     journals. The oil filter gets a wrap label (oil_filter_label.png, made by make_label.py).
  2. UVs. A box projection in each part's own space, in metres over the material's tile size, so the
     texture scale is the same everywhere and rides along with the moving parts.
  3. Normals. Edges between two materials are made sharp, and the corner normals are weighted by face
     area, so a big flat face (the heads' machined ends, the deck) shades flat right up to its edges
     instead of bending towards a small neighbouring face.
  4. Clean. Removes the grime colour layers an earlier version baked (Drew: not realistic enough).
"""
import math
import os
import sys

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else \
    os.path.join(os.path.dirname(bpy.data.filepath), "materials")
TEX_DIR = os.path.join(HERE, "tex")

# ----------------------------------------------------------------------------------------------------
# Material table: finish, linear colour, metal, roughness range, tile (m), normal strength, albedo
# variation, texture size.

def M(f, c, metal, rough, tile=0.05, ns=1.0, av=0.10, n=512, seed=0):
    return dict(f=f, c=c, metal=metal, rough=rough, tile=tile, ns=ns, av=av, n=n, seed=seed)

OXIDE = M("oxide", (0.030, 0.030, 0.034), 0.75, (0.30, 0.50), 0.03, 0.3, 0.35)
GROUND = M("ground", (0.74, 0.74, 0.76), 1.0, (0.08, 0.20), 0.03, 0.2, 0.05)

MATS = {
    # block, caps, plugs
    "Block_ChevyOrange":        M("peel", (0.80, 0.150, 0.012), 0.0, (0.14, 0.30), 0.10, 0.55, 0.06, 1024),
    "Block_CastIron":           M("sandcast", (0.085, 0.085, 0.088), 0.7, (0.60, 0.85), 0.06, 1.2, 0.30),
    "Block_MachinedIron":       M("milled", (0.50, 0.50, 0.52), 1.0, (0.20, 0.40), 0.05, 0.5, 0.10),
    "Block_WaterJacket":        M("sandcast", (0.035, 0.022, 0.015), 0.3, (0.75, 0.95), 0.05, 1.2, 0.40),
    "Brass_FreezePlug":         M("stamped", (0.72, 0.50, 0.19), 1.0, (0.25, 0.50), 0.04, 0.5, 0.25),
    "ARP_BlackOxide":           OXIDE,
    # crank, rods, pistons
    "Crank_ForgedSteel":        M("forged", (0.24, 0.24, 0.25), 1.0, (0.36, 0.48), 0.08, 0.23, 0.06),
    "Crank_GroundSteel":        GROUND,
    "Rod_Steel":                M("peened", (0.40, 0.40, 0.41), 0.9, (0.42, 0.58), 0.02, 0.25, 0.08),
    "Rod_Bolt":                 OXIDE,
    "Bronze":                   M("ground", (0.70, 0.47, 0.25), 1.0, (0.18, 0.32), 0.02, 0.2, 0.08),
    "Bearing_Shell":            M("ground", (0.62, 0.60, 0.56), 0.9, (0.22, 0.38), 0.03, 0.2, 0.08),
    "Piston_Aluminium":         M("turned", (0.70, 0.70, 0.72), 1.0, (0.22, 0.40), 0.03, 0.25, 0.06),
    "Piston_SkirtCoat":         M("coat", (0.030, 0.030, 0.032), 0.0, (0.42, 0.55), 0.04, 0.15, 0.06),
    "Pin_Steel":                GROUND,
    "Circlip_Steel":            OXIDE,
    "Ring_Chrome":              M("ground", (0.86, 0.86, 0.88), 1.0, (0.05, 0.14), 0.02, 0.15, 0.03),
    "Ring_Steel":               M("ground", (0.30, 0.30, 0.32), 1.0, (0.28, 0.42), 0.02, 0.2, 0.10),
    # flywheel
    "Flywheel_Steel":           M("turned", (0.34, 0.34, 0.35), 1.0, (0.30, 0.45), 0.05, 0.35, 0.12),
    "Flywheel_Ground":          M("turned", (0.74, 0.74, 0.76), 1.0, (0.10, 0.22), 0.05, 0.25, 0.05),
    "Flywheel_RingGear":        M("forged", (0.26, 0.26, 0.27), 1.0, (0.35, 0.50), 0.05, 0.2, 0.06),
    "Flywheel_BoltOxide":       OXIDE,
    "PilotBronze":              M("ground", (0.70, 0.49, 0.26), 1.0, (0.20, 0.35), 0.02, 0.2, 0.08),
    # cam and timing set
    "Cam_Steel":                M("forged", (0.30, 0.30, 0.32), 1.0, (0.32, 0.45), 0.06, 0.2, 0.06),
    "Cam_GroundSteel":          GROUND,
    "Cam_PlateSteel":           M("ground", (0.42, 0.42, 0.43), 0.9, (0.30, 0.45), 0.03, 0.25, 0.10),
    "Cam_BlackOxide":           OXIDE,
    "Timing_BilletSteel":       M("milled", (0.70, 0.70, 0.72), 1.0, (0.16, 0.30), 0.03, 0.5, 0.06),
    "Chain_Steel":              M("ground", (0.52, 0.52, 0.54), 1.0, (0.25, 0.40), 0.02, 0.2, 0.10),
    # front cover and balancer
    "TimingCover_BlackComposite": M("coat", (0.028, 0.028, 0.030), 0.0, (0.55, 0.70), 0.04, 0.8, 0.15),
    "TimingCover_SatinBlack":   M("powder", (0.018, 0.018, 0.020), 0.3, (0.30, 0.45), 0.05, 0.4, 0.10),
    "TimingCover_SealRubber":   M("rubber", (0.030, 0.030, 0.030), 0.0, (0.70, 0.90), 0.02, 0.6, 0.15),
    "TimingPointer_Zinc":       M("stamped", (0.64, 0.65, 0.60), 1.0, (0.28, 0.45), 0.03, 0.5, 0.15),
    "FrontCover_BoltOxide":     OXIDE,
    "Balancer_SatinBlack":      M("powder", (0.014, 0.014, 0.018), 0.3, (0.28, 0.42), 0.05, 0.4, 0.10),
    "Balancer_SatinSteel":      M("milled", (0.58, 0.58, 0.60), 1.0, (0.25, 0.40), 0.03, 0.6, 0.08),
    "Balancer_ScaleWhite":      M("coat", (0.80, 0.80, 0.78), 0.0, (0.40, 0.55), 0.02, 0.4, 0.06),
    "Balancer_Elastomer":       M("rubber", (0.030, 0.030, 0.030), 0.0, (0.70, 0.90), 0.02, 0.6, 0.15),
    # heads, gaskets, plugs
    "Head_A356_AsCast":         M("sandcast", (0.62, 0.63, 0.64), 0.85, (0.50, 0.68), 0.08, 0.9, 0.07, 1024),
    "Head_Machined":            M("milled", (0.82, 0.82, 0.83), 1.0, (0.20, 0.34), 0.06, 0.5, 0.05, 1024),
    "HeadGasket_MLS":           M("coat", (0.045, 0.045, 0.048), 0.4, (0.35, 0.55), 0.03, 0.6, 0.20),
    "Heads_DowelSteel":         GROUND,
    "Heads_StudOxide":          OXIDE,
    "SparkPlug_Insulator":      M("glaze", (0.84, 0.83, 0.79), 0.0, (0.08, 0.20), 0.02, 0.15, 0.04),
    "SparkPlug_Shell":          M("stamped", (0.70, 0.71, 0.69), 1.0, (0.22, 0.38), 0.02, 0.5, 0.10),
    "SparkPlug_Terminal":       GROUND,
    # valvetrain, lifters
    "VT_ValveStainless":        M("turned", (0.60, 0.60, 0.61), 1.0, (0.18, 0.32), 0.02, 0.25, 0.08),
    "VT_SpringSteel":           M("peened", (0.085, 0.085, 0.090), 1.0, (0.30, 0.48), 0.015, 0.5, 0.15),
    "VT_RetainerSteel":         M("turned", (0.055, 0.055, 0.060), 1.0, (0.25, 0.40), 0.02, 0.25, 0.15),
    "VT_RockerOrangeAnodize":   M("anodize", (0.86, 0.24, 0.012), 1.0, (0.22, 0.38), 0.03, 0.25, 0.06),
    "VT_RollerSteel":           GROUND,
    "VT_StudOxide":             OXIDE,
    "VT_PolyLock":              OXIDE,
    "VT_PushrodSteel":          M("turned", (0.075, 0.075, 0.080), 1.0, (0.22, 0.34), 0.03, 0.2, 0.15),
    "Lifter_Body":              M("ground", (0.52, 0.52, 0.54), 1.0, (0.18, 0.32), 0.02, 0.2, 0.08),
    "Lifter_Roller":            GROUND,
    "Lifter_GuideStainless":    M("milled", (0.72, 0.72, 0.70), 1.0, (0.22, 0.36), 0.02, 0.5, 0.06),
    # oiling
    "Pan_GlossBlack":           M("powder", (0.012, 0.012, 0.014), 0.2, (0.10, 0.20), 0.06, 0.35, 0.08, 1024),
    "Pan_PaintPen":             M("powder", (0.70, 0.70, 0.68), 0.0, (0.45, 0.65), 0.05, 0.15, 0.08, 256),   # signatures, white paint pen
    "PanGasket_Blue":           M("rubber", (0.035, 0.17, 0.62), 0.0, (0.55, 0.75), 0.02, 0.5, 0.10),
    "Pump_BlackAnodize":        M("anodize", (0.018, 0.018, 0.022), 0.8, (0.28, 0.42), 0.03, 0.25, 0.15),
    "Pickup_Steel":             M("stamped", (0.55, 0.56, 0.57), 1.0, (0.32, 0.50), 0.03, 0.6, 0.12),
    "Tray_Grey":                M("stamped", (0.30, 0.31, 0.32), 0.8, (0.40, 0.60), 0.05, 0.6, 0.18),
    "Oiling_BoltOxide":         OXIDE,
    "OilFilter_Can":            M("powder", (0.014, 0.014, 0.016), 0.2, (0.12, 0.22), 0.04, 0.3, 0.05),
    "OilFilter_Gasket":         M("rubber", (0.030, 0.030, 0.030), 0.0, (0.70, 0.90), 0.02, 0.6, 0.15),
}

# Label on the filter's can: printed paper under a gloss film.
LABEL = dict(name="OilFilter_Label", image="oil_filter_label.png", rough=(0.18, 0.28))

# ----------------------------------------------------------------------------------------------------
# Tileable fields (periodic by construction: shaped white noise through the FFT).

def _freqs(n):
    f = np.fft.fftfreq(n) * n
    return np.meshgrid(f, f)                       # fx along columns (u), fy along rows (v)

def field(rng, n, lo, hi, stretch=(1.0, 1.0)):
    """Band-limited Gaussian noise, features between lo and hi cycles per tile; std 1.
    stretch < 1 on an axis gives longer features along that axis (streaks)."""
    fx, fy = _freqs(n)
    r = np.hypot(fx * stretch[0], fy * stretch[1])
    band = np.exp(-(r / hi) ** 2) * (1 - np.exp(-(r / max(lo, 1e-3)) ** 2))
    a = np.real(np.fft.ifft2(np.fft.fft2(rng.standard_normal((n, n))) * band))
    return (a - a.mean()) / (a.std() + 1e-9)

def blur(a, sigma):
    fx, fy = _freqs(a.shape[0]); n = a.shape[0]
    g = np.exp(-2 * (math.pi * sigma / n) ** 2 * (fx ** 2 + fy ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * g))

def pits(rng, n, count, radius):
    """Sparse round dents, 0..1 deep (casting porosity, shot-peen dimples)."""
    a = np.zeros((n, n)); idx = rng.integers(0, n, (count, 2))
    np.add.at(a, (idx[:, 0], idx[:, 1]), rng.uniform(0.5, 1.0, count))
    a = blur(a, radius)
    return a / (a.max() + 1e-9)

def highpass(a, lo):
    """Remove features coarser than lo cycles per tile (soft cut), then rescale to std 1."""
    fx, fy = _freqs(a.shape[0])
    r = np.hypot(fx, fy)
    b = np.real(np.fft.ifft2(np.fft.fft2(a) * (1 - np.exp(-(r / max(lo, 1e-3)) ** 2))))
    return b / (b.std() + 1e-9)

# Shortest blotch any field may keep, in metres. Coarser variation in colour, sheen or height, repeated
# every few centimetres, is what read as a sponge (Drew): real cast, machined and painted surfaces vary
# at grain scale or along tool marks, not in centimetre blobs. Roughness/colour: 2.5 mm, at
# reduced contrast, so the grain that's left reads as surface, not speckle; height: 6 mm.
HP_SHEEN = 0.0025
HP_HEIGHT = 0.006

def norm01(a):
    return (a - a.min()) / (a.max() - a.min() + 1e-9)

def finish(kind, n, rng):
    """(height, roughness variation, albedo variation), each roughly -1..1 (height arbitrary units)."""
    v = np.arange(n)[:, None] / n
    if kind == "peel":                             # gloss paint: ~2 mm peel over the iron casting's texture
        h = 0.55 * field(rng, n, 30, 55) + 0.45 * field(rng, n, 6, 16) + 0.25 * field(rng, n, 90, 160) - 0.8 * pits(rng, n, 220, 1.6)
        return h, 0.7 * field(rng, n, 2, 6) + 0.3 * field(rng, n, 40, 80), 0.6 * field(rng, n, 1, 5) + 0.4 * field(rng, n, 60, 120)
    if kind == "sandcast":                         # sand-cast skin: fine grain, soft lumps, porosity
        h = 0.6 * field(rng, n, 80, 180) + 0.5 * field(rng, n, 10, 28) - 1.0 * pits(rng, n, 600, 1.2)
        return h, 0.6 * field(rng, n, 3, 9) + 0.4 * field(rng, n, 80, 180), 0.5 * field(rng, n, 60, 160) + 0.5 * field(rng, n, 2, 7)
    if kind == "milled":                           # fly-cut / milled face: tool passes and fine feed lines
        lines = np.sin(2 * math.pi * (n // 10) * v + 0.6 * field(rng, n, 2, 6, (1, 0.2)))   # 10 px apart: no moire
        streak = field(rng, n, 8, 220, (0.04, 1.0))
        h = 0.35 * lines + 0.65 * streak
        return h, 0.7 * streak + 0.3 * field(rng, n, 2, 6), 0.6 * field(rng, n, 4, 120, (0.05, 1.0)) + 0.4 * field(rng, n, 1, 4)
    if kind == "turned":                           # lathe-turned: finer and more even than milled
        lines = np.sin(2 * math.pi * (n // 8) * v)
        streak = field(rng, n, 8, 90, (0.03, 1.0))
        return 0.4 * lines + 0.6 * streak, 0.6 * streak + 0.4 * field(rng, n, 2, 6), 0.5 * streak + 0.5 * field(rng, n, 1, 5)
    if kind == "ground":                           # ground journals, pins, rollers: barely any texture
        streak = field(rng, n, 10, 100, (0.02, 1.0))
        return 0.5 * streak, 0.5 * streak + 0.5 * field(rng, n, 2, 6), 0.4 * streak + 0.6 * field(rng, n, 1, 4)
    if kind == "forged":                           # forging scale: mottled, lumpy, a few pits
        h = 0.85 * field(rng, n, 4, 14) + 0.15 * field(rng, n, 30, 70)
        return h, 0.7 * field(rng, n, 2, 8), 0.8 * field(rng, n, 2, 8) + 0.2 * field(rng, n, 40, 100)
    if kind == "peened":                           # shot-peened: dense overlapping dimples
        h = -pits(rng, n, n * n // 40, 1.4) + 0.3 * field(rng, n, 60, 160)
        return h, 0.6 * field(rng, n, 3, 8) + 0.4 * field(rng, n, 60, 160), 0.6 * field(rng, n, 2, 8) + 0.4 * field(rng, n, 80, 200)
    if kind == "oxide":                            # black oxide: smooth, oily, uneven sheen
        return 0.4 * field(rng, n, 40, 120), field(rng, n, 2, 7), 0.7 * field(rng, n, 2, 7) + 0.3 * field(rng, n, 40, 120)
    if kind == "coat":                             # sprayed moly / graphite coat: satin, fine speckle
        h = 0.6 * field(rng, n, 30, 80) + 0.4 * field(rng, n, 8, 20)
        return h, 0.7 * field(rng, n, 2, 6) + 0.3 * field(rng, n, 40, 100), 0.8 * field(rng, n, 2, 6) + 0.2 * field(rng, n, 60, 140)
    if kind == "powder":                           # powder coat: fine, soft orange peel
        h = 0.7 * field(rng, n, 40, 80) + 0.3 * field(rng, n, 8, 20)
        return h, 0.6 * field(rng, n, 2, 6) + 0.4 * field(rng, n, 40, 80), 0.6 * field(rng, n, 1, 4) + 0.4 * field(rng, n, 60, 140)
    if kind == "anodize":                          # anodised billet: brushed under the dye, slightly blotchy
        streak = field(rng, n, 30, 240, (0.03, 1.0))
        return 0.5 * streak, 0.5 * streak + 0.5 * field(rng, n, 2, 6), 0.5 * field(rng, n, 1, 5) + 0.5 * streak
    if kind == "stamped":                          # stamped / plated sheet: faint roll marks, mottled plating
        h = 0.4 * field(rng, n, 10, 200, (0.05, 1.0)) + 0.4 * field(rng, n, 40, 120)
        return h, field(rng, n, 2, 8), 0.6 * field(rng, n, 2, 8) + 0.4 * field(rng, n, 40, 120)
    if kind == "rubber":
        h = 0.7 * field(rng, n, 60, 180) + 0.3 * field(rng, n, 10, 30)
        return h, 0.5 * field(rng, n, 2, 6) + 0.5 * field(rng, n, 60, 180), 0.6 * field(rng, n, 2, 6) + 0.4 * field(rng, n, 60, 180)
    if kind == "glaze":                            # ceramic glaze: glassy, faint ripple
        return 0.4 * field(rng, n, 6, 20), field(rng, n, 2, 6), 0.6 * field(rng, n, 1, 4) + 0.4 * field(rng, n, 30, 80)
    raise ValueError(kind)

def to_normal(h, strength):
    """Height to a tangent-space (OpenGL, +Y) normal map. strength sets the RMS surface slope (x 0.1), so
    the bumpiness reads the same whatever the height field's frequency."""
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) / 2
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) / 2
    k = 0.1 * strength / (np.sqrt((dx ** 2 + dy ** 2).mean()) + 1e-9)
    nx, ny, nz = -dx * k, -dy * k, np.ones_like(h)
    l = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2)
    return np.stack([nx / l, ny / l, nz / l], -1) * 0.5 + 0.5

def lin_to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * c ** (1 / 2.4) - 0.055)

def rel(path):
    """Path relative to the .blend (//...), so the file works from any checkout."""
    return bpy.path.relpath(path) if bpy.data.filepath else path

def put_image(name, rgb, srgb):
    """Write an n x n x 3 array (rows = v from the bottom) to materials/tex/<name>.png and its image
    datablock. The PNGs are generated output (gitignored, remade by every run and by the GLB export),
    so they are not packed into the .blend."""
    n = rgb.shape[0]
    path = os.path.join(TEX_DIR, name + ".png")
    os.makedirs(TEX_DIR, exist_ok=True)
    old = bpy.data.images.get(name)
    if old:
        bpy.data.images.remove(old)                # the material is rebuilt on the new one
    img = bpy.data.images.new(name, n, n, alpha=False, float_buffer=False)
    img.colorspace_settings.name = "sRGB" if srgb else "Non-Color"
    px = np.ones((n, n, 4), np.float32); px[..., :3] = rgb
    img.pixels.foreach_set(px.ravel())
    img.filepath_raw = path; img.file_format = "PNG"
    img.save()
    img.source = "FILE"; img.filepath = rel(path); img.reload()
    return img

# Bumpiness kept in full only where it reads from across the room (the block's orange peel, sand-cast
# skins, shot peening); finished surfaces get less, or they shimmer when the page shows them small.
NS_GAIN = dict(peel=1.0, sandcast=1.0, peened=0.8, rubber=0.8)
RV_GAIN = dict(forged=0.5, anodize=0.3, ground=0.5, turned=0.5, milled=0.6, powder=0.4, glaze=0.4, coat=0.6, peel=0.6, stamped=0.7)

def make_textures(name, s):
    rng = np.random.default_rng(s["seed"] or sum(ord(ch) * (i + 1) for i, ch in enumerate(name)))   # stable across runs
    n = s["n"]
    h, rv, av = finish(s["f"], n, rng)
    t = s["tile"]
    rv = 0.6 * highpass(rv, t / HP_SHEEN)          # cycles per tile for a 2.5 mm wavelength
    av = 0.6 * highpass(av, t / HP_SHEEN)
    h = highpass(h, t / HP_HEIGHT)
    c = np.array(s["c"])
    alb = c[None, None, :] * (1 + s["av"] * np.clip(av, -2.5, 2.5)[..., None])
    base = lin_to_srgb(alb)
    r0, r1 = s["rough"]
    rv = rv * RV_GAIN.get(s["f"], 1.0)             # how blotchy the sheen is: much less on finished surfaces
    rough = np.clip((r0 + r1) / 2 + (r1 - r0) / 2 * np.clip(rv / 1.6, -1, 1), 0.02, 1)
    orm = np.stack([np.ones_like(rough), rough, np.full_like(rough, s["metal"])], -1)
    return (put_image(f"T_{name}_base", base, True), put_image(f"T_{name}_orm", orm, False),
            put_image(f"T_{name}_nrm", to_normal(h, s["ns"] * NS_GAIN.get(s["f"], 0.6)), False))

# ----------------------------------------------------------------------------------------------------
# Materials

def build_material(mat, base, orm, nrm, rough=None):
    """Image-textured Principled BSDF the glTF exporter reads as baseColor, metallicRoughness
    and normal textures. rough=(lo, hi) instead of an ORM map for a material with no metal map."""
    mat.use_nodes = True
    nt = mat.node_tree; nt.nodes.clear(); N = nt.nodes; L = nt.links
    out = N.new("ShaderNodeOutputMaterial"); out.location = (600, 0)
    bsdf = N.new("ShaderNodeBsdfPrincipled"); bsdf.location = (300, 0)
    L.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    tb = N.new("ShaderNodeTexImage"); tb.image = base; tb.location = (-500, 300)
    L.new(tb.outputs["Color"], bsdf.inputs["Base Color"])
    if orm is not None:
        to = N.new("ShaderNodeTexImage"); to.image = orm; to.location = (-500, 0)
        sep = N.new("ShaderNodeSeparateColor"); sep.location = (-150, 0)
        L.new(to.outputs["Color"], sep.inputs["Color"])
        L.new(sep.outputs["Green"], bsdf.inputs["Roughness"]); L.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    else:
        bsdf.inputs["Roughness"].default_value = sum(rough) / 2; bsdf.inputs["Metallic"].default_value = 0.0
    if nrm is not None:
        tn = N.new("ShaderNodeTexImage"); tn.image = nrm; tn.location = (-500, -300)
        nm = N.new("ShaderNodeNormalMap"); nm.location = (-150, -300)
        L.new(tn.outputs["Color"], nm.inputs["Color"]); L.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    bsdf.inputs["Coat Weight"].default_value = 0.0
    mat["finish"] = MATS.get(mat.name, {}).get("f", "label")
    return mat

def engine_objects():
    objs = []
    for top in bpy.context.scene.collection.children:
        if top.name.startswith("BBC_"):
            objs += [o for o in top.all_objects if o.type == "MESH"]
    return objs

def slots_pass():
    """Several build scripts' boolean steps leave an empty material slot in front of the ones they then
    append, so the face indices they set (0, 1, ...) land one slot early, on nothing. Drop that slot and
    keep the indices, which puts every face on the material it was meant to have."""
    fixed = set()
    for o in engine_objects():
        me = o.data; mats = list(me.materials)
        if me.name in fixed or len(mats) < 2 or mats[0] is not None or any(m is None for m in mats[1:]):
            continue
        mi = np.empty(len(me.polygons), np.int64); me.polygons.foreach_get("material_index", mi)
        me.materials.clear()
        for m in mats[1:]:
            me.materials.append(m)
        me.polygons.foreach_set("material_index", np.clip(mi, 0, len(mats) - 2))
        fixed.add(me.name)
    print(f"  slots: {len(fixed)} meshes fixed")

def materials_pass():
    used = {s.material for o in engine_objects() for s in o.material_slots if s.material}
    missing = sorted(m.name for m in used if m.name not in MATS and m.name != LABEL["name"])
    if missing:
        raise RuntimeError(f"no finish for: {missing}")
    for m in sorted(used, key=lambda m: m.name):
        if m.name == LABEL["name"]:
            continue
        build_material(m, *make_textures(m.name, MATS[m.name]))
    print(f"  materials: {len(used)} rebuilt")

# ----------------------------------------------------------------------------------------------------
# Oil-filter label: the can's straight side gets the label material and a cylindrical UV.

def label_pass():
    o = bpy.data.objects.get("OilFilter")
    if not o:
        return
    me = o.data
    lab = bpy.data.materials.get(LABEL["name"]) or bpy.data.materials.new(LABEL["name"])
    path = os.path.join(HERE, LABEL["image"])
    img = bpy.data.images.get(LABEL["image"]) or bpy.data.images.load(path)
    if img.packed_file: img.unpack(method="REMOVE")
    img.filepath = rel(path); img.reload()
    rng = np.random.default_rng(7)
    nrm = put_image("T_OilFilter_Label_nrm", to_normal(0.5 * field(rng, 512, 30, 90), 0.06), False)
    orm_px = np.stack([np.ones((512, 512)), 0.22 + 0.05 * field(rng, 512, 2, 6) / 1.6, np.zeros((512, 512))], -1)
    orm = put_image("T_OilFilter_Label_orm", orm_px, False)
    build_material(lab, img, orm, nrm)
    if LABEL["name"] not in [m.name for m in me.materials]:
        me.materials.append(lab)
    li = [m.name for m in me.materials].index(LABEL["name"])
    co = np.array([v.co[:] for v in me.vertices])
    cx, cy = (co[:, 0].min() + co[:, 0].max()) / 2, (co[:, 1].min() + co[:, 1].max()) / 2
    R = max(np.hypot(co[:, 0] - cx, co[:, 1] - cy))
    def height(p): zz = [me.vertices[v].co.z for v in p.vertices]; return max(zz) - min(zz)
    wall = [p for p in me.polygons                 # the straight wall: horizontal normal, inside the seam band's radius
            if abs(p.normal.z) < 0.05 and math.hypot(p.center.x - cx, p.center.y - cy) < R - 0.0005]
    hmax = max(height(p) for p in wall)
    zs = []
    for p in me.polygons:
        if p.material_index == li: p.material_index = 0
    for p in wall:
        if height(p) > 0.5 * hmax:
            p.material_index = li; zs += [me.vertices[v].co.z for v in p.vertices]
    z0, z1 = min(zs), max(zs)
    pad = (z1 - z0) * 0.02
    if not me.uv_layers: me.uv_layers.new(name="UVMap")
    uv = me.uv_layers.active.data
    for p in me.polygons:
        if p.material_index != li:
            continue
        angs = [math.atan2(me.vertices[me.loops[i].vertex_index].co.y - cy, me.vertices[me.loops[i].vertex_index].co.x - cx) for i in p.loop_indices]
        ref = angs[0]
        for i, a in zip(p.loop_indices, angs):
            a = ref + (a - ref + math.pi) % (2 * math.pi) - math.pi        # keep a face on one side of the seam
            z = me.vertices[me.loops[i].vertex_index].co.z
            uv[i].uv = (((a / (2 * math.pi)) % 1.0) if i == p.loop_indices[0] else (uv[p.loop_indices[0]].uv[0] + (a - ref) / (2 * math.pi)),
                        (z - z0 + pad) / (z1 - z0 + 2 * pad))
    print(f"  label: {len(zs) // 4} faces, band {z0:.4f}-{z1:.4f} m")

# ----------------------------------------------------------------------------------------------------
# UVs: box projection in the part's own space, in tiles.

def uv_pass():
    done = set()
    for o in engine_objects():
        me = o.data
        if me.name in done:
            continue
        done.add(me.name)
        if not me.uv_layers:
            me.uv_layers.new(name="UVMap")
        uvl = me.uv_layers.active
        nl, npoly = len(me.loops), len(me.polygons)
        if nl == 0:
            continue
        co = np.empty(len(me.vertices) * 3); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
        lv = np.empty(nl, np.int64); me.loops.foreach_get("vertex_index", lv)
        pn = np.empty(npoly * 3); me.polygons.foreach_get("normal", pn); pn = pn.reshape(-1, 3)
        ls = np.empty(npoly, np.int64); me.polygons.foreach_get("loop_start", ls)
        lt = np.empty(npoly, np.int64); me.polygons.foreach_get("loop_total", lt)
        mi = np.empty(npoly, np.int64); me.polygons.foreach_get("material_index", mi)
        tiles = np.array([MATS.get(s.name, {}).get("tile", 0.05) if s else 0.05 for s in me.materials] or [0.05])
        lp = np.repeat(np.arange(npoly), lt)       # loop -> polygon
        ax = np.abs(pn).argmax(1)[lp]
        p = co[lv]
        u = np.where(ax == 0, p[:, 1], p[:, 0]); v = np.where(ax == 2, p[:, 1], p[:, 2])
        t = tiles[np.clip(mi[lp], 0, len(tiles) - 1)]
        uv = np.stack([u / t, v / t], 1)
        if "OilFilter_Label" in [m.name for m in me.materials if m]:
            old = np.empty(nl * 2); uvl.data.foreach_get("uv", old); old = old.reshape(-1, 2)
            li = [m.name for m in me.materials].index("OilFilter_Label")
            keep = mi[lp] == li
            uv[keep] = old[keep]
        uvl.data.foreach_set("uv", uv.ravel())
    print(f"  uvs: {len(done)} meshes")

# ----------------------------------------------------------------------------------------------------
# Normals: sharp material boundaries, face-area weighted corner normals.

def normals_pass():
    done = set(); tmpc = bpy.data.collections.new("_wn_tmp"); bpy.context.scene.collection.children.link(tmpc)
    for o in engine_objects():
        me = o.data
        if me.name in done or len(me.polygons) == 0:
            continue
        done.add(me.name)
        # sharp edges where the material changes
        mi = np.empty(len(me.polygons), np.int64); me.polygons.foreach_get("material_index", mi)
        if mi.max() != mi.min():
            sharp = me.attributes.get("sharp_edge") or me.attributes.new("sharp_edge", "BOOLEAN", "EDGE")
            vals = np.zeros(len(me.edges), bool); sharp.data.foreach_get("value", vals)
            first = np.full(len(me.edges), -1); mixed = np.zeros(len(me.edges), bool)
            ek = np.empty(len(me.loops), np.int64); me.loops.foreach_get("edge_index", ek)
            lt = np.empty(len(me.polygons), np.int64); me.polygons.foreach_get("loop_total", lt)
            lm = np.repeat(mi, lt)
            for e, m in zip(ek, lm):
                if first[e] < 0: first[e] = m
                elif first[e] != m: mixed[e] = True
            sharp.data.foreach_set("value", vals | mixed)
        # weighted normals, computed on a single-user copy and written back
        cp = me.copy(); t = bpy.data.objects.new("_wn", cp); tmpc.objects.link(t)
        m = t.modifiers.new("wn", "WEIGHTED_NORMAL"); m.mode = "FACE_AREA"; m.weight = 50; m.keep_sharp = True; m.thresh = 0.01
        dg = bpy.context.evaluated_depsgraph_get()
        ev = t.evaluated_get(dg).to_mesh()
        cn = np.empty(len(ev.loops) * 3); ev.corner_normals.foreach_get("vector", cn)
        t.to_mesh_clear(); bpy.data.objects.remove(t); bpy.data.meshes.remove(cp)
        if len(cn) == len(me.loops) * 3:
            me.normals_split_custom_set(cn.reshape(-1, 3).tolist())
    bpy.data.collections.remove(tmpc)
    print(f"  normals: {len(done)} meshes")

# ----------------------------------------------------------------------------------------------------
# Clean-up of the grime layers an earlier version baked.

def clean_pass():
    """Remove the baked grime layers an earlier version of this pass left on the meshes."""
    n = 0
    for o in engine_objects():
        me = o.data
        for name in ("Grime", "AO"):
            a = me.attributes.get(name)
            if a: me.attributes.remove(a); n += 1
    print(f"  clean: {n} layers removed")


def run(stages=("slots", "clean", "materials", "uvs", "label", "normals")):
    for s in stages:
        print(f"finish_materials: {s}")
        dict(slots=slots_pass, clean=clean_pass, materials=materials_pass, label=label_pass, uvs=uv_pass, normals=normals_pass)[s]()


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    run()
    if "--save" in argv:
        bpy.ops.wm.save_mainfile()
