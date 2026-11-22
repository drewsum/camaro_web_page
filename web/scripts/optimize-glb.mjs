// Re-encode the PNG/JPEG textures inside exported GLBs as WebP (EXT_texture_webp),
// which roughly halves the car models' download. Only the image bytes change: the
// Draco geometry, node extras and materials are copied through untouched.
//
//   node scripts/optimize-glb.mjs public/models/camaro.glb [more.glb ...]
//
// Colour textures (base colour, emissive, specular/sheen colour) go lossy at
// quality 92, which is visually lossless. Normal, roughness/metal, occlusion
// and other data maps are linear values the shader does maths on, so they are
// stored lossless. A texture whose WebP isn't smaller keeps its original
// encoding. Images already in WebP are left alone, so re-running is harmless.
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const COLOR_SLOTS = new Set(["baseColorTexture", "emissiveTexture", "specularColorTexture", "sheenColorTexture"]);
const LOSSY = { quality: 92, alphaQuality: 100, smartSubsample: true, effort: 6, exact: true };
const LOSSLESS = { lossless: true, effort: 6, exact: true };

function readGlb(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path}: not a GLB`);
  let offset = 12;
  let json, bin;
  while (offset < buf.length) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString("utf8"));
    else if (type === 0x004e4942) bin = data;
    offset += 8 + length;
  }
  return { json, bin };
}

function writeGlb(path, json, bin) {
  const pad = (b, fill) => (b.length % 4 ? Buffer.concat([b, Buffer.alloc(4 - (b.length % 4), fill)]) : b);
  const jsonChunk = pad(Buffer.from(JSON.stringify(json), "utf8"), 0x20);
  const binChunk = pad(bin, 0);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
  const chunkHeader = (len, type) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(len, 0);
    h.writeUInt32LE(type, 4);
    return h;
  };
  writeFileSync(
    path,
    Buffer.concat([header, chunkHeader(jsonChunk.length, 0x4e4f534a), jsonChunk, chunkHeader(binChunk.length, 0x004e4942), binChunk]),
  );
}

// Which images are sampled as colour, found by walking every material
// (extensions included) for textureInfo objects under a "...Texture" key.
function colorOnlyImages(json) {
  const color = new Set();
  const data = new Set();
  const visit = (node, key) => {
    if (!node || typeof node !== "object") return;
    if (key?.endsWith("Texture") && typeof node.index === "number") {
      const tex = json.textures[node.index];
      const src = tex.source ?? tex.extensions?.EXT_texture_webp?.source;
      if (src !== undefined) (COLOR_SLOTS.has(key) ? color : data).add(src);
    }
    for (const [k, v] of Object.entries(node)) visit(v, k);
  };
  for (const m of json.materials ?? []) visit(m);
  return new Set([...color].filter((i) => !data.has(i)));
}

async function optimize(path) {
  const { json, bin } = readGlb(path);
  const colorImages = colorOnlyImages(json);
  const replaced = new Map(); // bufferView index -> new bytes
  let before = 0;
  let after = 0;
  for (const [i, image] of (json.images ?? []).entries()) {
    if (image.bufferView === undefined || image.mimeType === "image/webp") continue;
    const view = json.bufferViews[image.bufferView];
    const original = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    const webp = await sharp(original).webp(colorImages.has(i) ? LOSSY : LOSSLESS).toBuffer();
    before += original.length;
    if (webp.length >= original.length) {
      after += original.length;
      continue;
    }
    after += webp.length;
    replaced.set(image.bufferView, webp);
    image.mimeType = "image/webp";
  }
  if (!replaced.size) return console.log(`${path}: nothing to do`);

  // Point every texture of a converted image at it through EXT_texture_webp.
  // Its `source` is dropped, so the extension is required (every browser
  // three.js supports decodes WebP).
  for (const tex of json.textures ?? []) {
    if (tex.source === undefined || json.images[tex.source].mimeType !== "image/webp") continue;
    tex.extensions = { ...tex.extensions, EXT_texture_webp: { source: tex.source } };
    delete tex.source;
  }
  for (const list of ["extensionsUsed", "extensionsRequired"]) {
    json[list] = [...new Set([...(json[list] ?? []), "EXT_texture_webp"])];
  }

  // Repack the binary chunk, keeping each view 4-byte aligned.
  const parts = [];
  let offset = 0;
  for (const [i, view] of json.bufferViews.entries()) {
    const bytes = replaced.get(i) ?? bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    const padding = (4 - (offset % 4)) % 4;
    if (padding) parts.push(Buffer.alloc(padding));
    offset += padding;
    view.byteOffset = offset;
    view.byteLength = bytes.length;
    parts.push(bytes);
    offset += bytes.length;
  }
  const newBin = Buffer.concat(parts);
  json.buffers[0].byteLength = newBin.length;
  writeGlb(path, json, newBin);
  console.log(`${path}: ${replaced.size} textures, ${(before / 1e6).toFixed(2)} MB -> ${(after / 1e6).toFixed(2)} MB`);
}

for (const path of process.argv.slice(2)) await optimize(path);
