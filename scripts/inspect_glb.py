"""Print the node hierarchy, rig metadata and lamp materials of the exported GLB.

    python scripts/inspect_glb.py [path/to/camaro.glb]
"""
import json
import os
import struct
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "web", "public", "models", "camaro.glb")
with open(path, "rb") as f:
    f.read(12)
    length, _ = struct.unpack("<I4s", f.read(8))
    gltf = json.loads(f.read(length))

nodes = gltf["nodes"]
RIG = ("Camaro", "Body", "SteeringWheel", "Hub_", "Wheel_", "LightAnchor_")


def show(i, depth=0):
    n = nodes[i]
    name = n.get("name", "?")
    if name.startswith(RIG):
        t = [round(v, 4) for v in n.get("translation", [0, 0, 0])]
        r = [round(v, 4) for v in n.get("rotation", [0, 0, 0, 1])]
        extra = f" extras={n['extras']}" if "extras" in n else ""
        kids = len(n.get("children", []))
        print(f"{'  ' * depth}{name}  t={t} r={r} children={kids}{extra}")
    for c in n.get("children", []):
        show(c, depth + 1)


for i in gltf["scenes"][0]["nodes"]:
    show(i)
print("\nLamp materials:")
for m in gltf["materials"]:
    if m["name"].startswith("Lamp_"):
        print(" ", m["name"], m.get("extras"), "emissive", m.get("emissiveFactor"))
