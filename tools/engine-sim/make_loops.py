"""Turn engine-sim dyno renders into seamless loops for the web app.

Each steady-state render is cut to a whole number of engine cycles (720 deg of
crank, 120/rpm seconds) close to one second, crossfaded at the seam, and
written as two back-to-back copies. The web player loops a one-period window
inside the second half, so any encoder delay or padding never lands in the
loop. Levels share one gain so layers keep their relative loudness.
"""
import glob, json, os, subprocess, sys
import numpy as np
from scipy.io import wavfile

# Two renders per clip at different fixed gains; use the louder take unless
# it clipped. Levels are recorded as dB of the unscaled synth output.
TAKES = [("work/rawB", 0.03), ("work/rawA", 0.002)]
START = [("work/start_0.3.wav", 0.3), ("work/start_0.1.wav", 0.1)]
OUT = sys.argv[1]
SR = 44100
XFADE = int(0.03 * SR)
os.makedirs(OUT, exist_ok=True)


def read(path):
    sr, x = wavfile.read(path)
    assert sr == SR
    return x.astype(np.float64) / 32768


def loop(x, L, start):
    y = x[start:start + L + XFADE]
    out = y[:L].copy()
    a = np.linspace(0, 1, XFADE)
    out[:XFADE] = y[:XFADE] * a + y[L:L + XFADE] * (1 - a)
    return out


def best(takes):
    for path, gain in takes:
        x = read(path)
        if np.abs(x).max() < 0.98:
            return x / gain, gain
    raise SystemExit(f"all takes clip: {takes}")


clips = {}
for d in sorted(glob.glob(f"{TAKES[0][0]}/*_*")):
    layer, rpm = os.path.basename(d).split("_")
    rpm = int(rpm)
    name = os.path.basename(glob.glob(f"{d}/*.wav")[0])
    x, g = best([(f"{root}/{layer}_{rpm}/{name}", gain) for root, gain in TAKES])
    cycle = 120.0 / rpm * SR
    n = max(1, round(SR / cycle))
    L = int(round(n * cycle))
    clips[f"{layer}_{rpm}"] = (loop(x, L, int(0.8 * SR)), {"rpm": rpm, "layer": layer, "cycles": n})

# Start-up and free-running idle from the starter program render.
s, _ = best(START)
START_LEN = int(3.0 * SR)
clips["start"] = (s[:START_LEN].copy(), {"layer": "start"})
idle_len = int(4.0 * SR)
idle = s[START_LEN + int(1.0 * SR):]
a = np.linspace(0, 1, int(0.25 * SR))
iy = idle[: idle_len + len(a)]
il = iy[:idle_len].copy()
il[: len(a)] = iy[: len(a)] * a + iy[idle_len: idle_len + len(a)] * (1 - a)
clips["idle"] = (il, {"layer": "idle", "rpm": 920})


manifest = {}
for name, (c, meta) in clips.items():
    level = 20 * np.log10(np.sqrt(np.mean(c ** 2)))
    c = c * (10 ** (-1 / 20) / np.abs(c).max())  # each clip to -1 dBFS peak
    looped = name != "start"
    data = np.concatenate([c, c]) if looped else c
    wav = f"/tmp/{name}.wav"
    wavfile.write(wav, SR, (np.clip(data, -1, 1) * 32767).astype(np.int16))
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-ac", "1", "-c:a", "libmp3lame",
                    "-b:a", "96k", f"{OUT}/{name}.mp3"], check=True)
    manifest[name] = {**meta, "period": len(c) / SR if looped else None, "level": round(level, 2)}
    print(f"{name:10s} {len(c)/SR:5.3f}s  level {level:6.1f} dB  {os.path.getsize(f'{OUT}/{name}.mp3')//1024} kB")
json.dump(manifest, open(f"{OUT}/manifest.json", "w"), indent=1)
