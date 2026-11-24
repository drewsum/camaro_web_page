// Downloads the Poly Haven assets listed in src/scenes/common/polyHavenAssets.json
// into public/ph/ and shrinks them for the web, so the site serves them itself
// instead of every visitor pulling Poly Haven's originals from their CDN.
//
//   textures   2k/1k JPGs (saved near-lossless, 3-6 MB a map) -> WebP. Only the
//              maps the manifest lists, so a scene that samples just the colour
//              doesn't download the normal and ARM maps too.
//   HDRIs      the .hdr as is (the sun analysis needs every bit of it), plus a
//              gzipped copy nginx serves in its place (gzip_static): ~45% smaller.
//   models     the .gltf and .bin (both gzipped too) with their textures as WebP.
//
// Runs before `vite` and `vite build` (predev/prebuild) and in the Dockerfile.
// Files already in public/ph/ are skipped, so after the first run it's instant;
// delete public/ph/ to rebuild after changing the quality settings below.
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import sharp from "sharp";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(web, "public", "ph");
const manifest = JSON.parse(await readFile(join(web, "src/scenes/common/polyHavenAssets.json"), "utf8"));
const CDN = "https://dl.polyhaven.org/file/ph-assets";

// WebP quality per map. Colour and ARM maps stay within ~38-41 dB of the
// originals, invisible once tiled and mipmapped; normal maps hold more fine
// detail per bit, so they keep a higher quality.
const QUALITY = { diff: 92, arm: 90, nor_gl: 95 };
const qualityFor = (file) => (/_nor_gl_/.test(file) ? QUALITY.nor_gl : /_arm_/.test(file) ? QUALITY.arm : QUALITY.diff);

let fetched = 0;
let before = 0;
let after = 0;

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function download(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const buf = Buffer.from(await res.arrayBuffer());
      before += buf.length;
      fetched++;
      return buf;
    } catch (e) {
      if (attempt >= 3) throw new Error(`downloading ${url}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

// Written beside the target and renamed, so an interrupted run never leaves a
// half-written file that later runs would skip.
async function save(path, data) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${createHash("md5").update(path).digest("hex").slice(0, 6)}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, path);
  after += data.length;
}

const toWebp = (jpg, quality) => sharp(jpg).webp({ quality, effort: 5 }).toBuffer();
const gzip = (buf) => gzipSync(buf, { level: 9 });

const jobs = [];

for (const [name, sizes] of Object.entries(manifest.textures)) {
  for (const [res, maps] of Object.entries(sizes)) {
    for (const map of maps) {
      const file = `${name}_${map}_${res}`;
      const dst = join(out, "tex", `${file}.webp`);
      jobs.push(async () => {
        if (await exists(dst)) return;
        await save(dst, await toWebp(await download(`${CDN}/Textures/jpg/${res}/${name}/${file}.jpg`), qualityFor(file)));
      });
    }
  }
}

for (const name of manifest.hdris) {
  const dst = join(out, "hdri", `${name}_2k.hdr`);
  jobs.push(async () => {
    if ((await exists(dst)) && (await exists(`${dst}.gz`))) return;
    const hdr = await download(`${CDN}/HDRIs/hdr/2k/${name}_2k.hdr`);
    await save(`${dst}.gz`, gzip(hdr));
    await save(dst, hdr);
  });
}

for (const name of manifest.models) {
  const dir = join(out, "models", name);
  const dst = join(dir, `${name}.gltf`);
  jobs.push(async () => {
    if (await exists(dst)) return; // written last, so its presence means the rest is there
    const base = `${CDN}/Models/gltf/1k/${name}`;
    const gltf = JSON.parse((await download(`${base}/${name}_1k.gltf`)).toString("utf8"));
    for (const buffer of gltf.buffers ?? []) {
      const bin = await download(`${base}/${buffer.uri}`);
      await save(join(dir, `${buffer.uri}.gz`), gzip(bin));
      await save(join(dir, buffer.uri), bin);
    }
    // The .gltf points at textures/<file>.jpg, which the CDN serves from a
    // parallel jpg/ tree; here they sit beside it as WebP.
    for (const image of gltf.images ?? []) {
      const jpg = image.uri.split("/").pop();
      const webp = jpg.replace(/\.(jpe?g|png)$/i, ".webp");
      await save(join(dir, webp), await toWebp(await download(`${CDN}/Models/jpg/1k/${name}/${jpg}`), qualityFor(jpg)));
      image.uri = webp;
      delete image.mimeType;
    }
    const json = Buffer.from(JSON.stringify(gltf));
    await save(`${dst}.gz`, gzip(json));
    await save(dst, json);
  });
}

// A few downloads at a time: quick, without hammering Poly Haven's CDN.
const queue = [...jobs];
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (queue.length) await queue.shift()();
  }),
);

if (fetched) {
  const mb = (n) => (n / 1e6).toFixed(1);
  console.log(`polyhaven: fetched ${fetched} files (${mb(before)} MB), wrote ${mb(after)} MB to public/ph/ (gzipped copies included)`);
}
