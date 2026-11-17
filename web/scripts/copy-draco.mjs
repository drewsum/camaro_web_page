// Copy three's Draco decoder into public/ so the GLB decodes without a CDN.
import { cpSync, existsSync } from "node:fs";

const src = "node_modules/three/examples/jsm/libs/draco/gltf";
if (existsSync(src)) {
  cpSync(src, "public/draco", { recursive: true });
}
