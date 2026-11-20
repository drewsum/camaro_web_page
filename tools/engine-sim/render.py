"""Render the engine-sim takes that make_loops.py turns into web loops.

Run from an engine-sim checkout (its es/ script library is found relative to
the working directory), with es-render built (see README.md):

    python3 render.py <path/to/es-render> <path/to/camaro_540.mr>

Writes work/rawA, work/rawB (each dyno clip at a low and a high fixed gain)
and work/start_*.wav (starter, catch and free-running idle).
"""
import os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

ES, SCRIPT = sys.argv[1], sys.argv[2]
RPMS = [1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500, 6000, 6500]
# Light cruise: about 20-60 ft-lb at each rpm.
MID = {1000: .08, 1500: .12, 2000: .15, 2500: .18, 3000: .21, 3500: .23,
       4000: .25, 4500: .27, 5000: .30, 5500: .32, 6000: .34, 6500: .36}


def dyno(job):
    root, gain, rpm, layer, thr = job
    d = f"{root}/{layer}_{rpm}"
    os.makedirs(d, exist_ok=True)
    out = subprocess.run([ES, SCRIPT, "dyno", d, str(rpm), str(thr), "3.0"], capture_output=True, text=True,
                         env={**os.environ, "ES_GAIN": str(gain)}).stdout.strip()
    return f"{layer:4s} gain {gain}: {out}"


jobs = [(root, gain, r, layer, thr)
        for root, gain in [("work/rawA", 0.002), ("work/rawB", 0.03)]
        for r in RPMS
        for layer, thr in [("on", 1.0), ("mid", MID[r]), ("off", 0.0)]]
with ThreadPoolExecutor(os.cpu_count()) as ex:
    for line in ex.map(dyno, jobs):
        print(line, flush=True)

# Starter for 1.1 s, then let it catch and idle.
with open("work/start.txt", "w") as f:
    f.write("0 0 1\n1.1 0 1\n1.2 0 0\n9 0 0\n")
for gain in (0.1, 0.3):
    subprocess.run([ES, SCRIPT, "program", f"work/start_{gain}.wav", "work/start.txt"],
                   env={**os.environ, "ES_GAIN": str(gain)}, check=True)
