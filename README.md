# 1968 Camaro web viewer

Interactive 3D viewer for a 1968 Camaro SS model (React Three Fiber, served by nginx in Docker).

## Update the model

The site serves `web/public/models/camaro.glb`, exported from `3d_model/camaro.blend`.
After editing the .blend, re-export (uses Blender 5.2; override the path with `$env:BLENDER`):

```powershell
./scripts/export_glb.ps1
```

The same script exports the engine for the Engine Model page: `3d_model/engine/bbc_block_work.blend`
-> `web/public/models/engine.glb` (`scripts/export_engine_glb.py`). Each top-level `BBC_*`
collection in the .blend becomes a tickbox on the page; give new ones a label in
`PART_LABELS` in `web/src/pages/EngineModel.tsx`.
The .blend's timeline (one four-stroke cycle driven by the crank's `crank_deg`) is baked
into the GLB as the animation the page plays.

## Local development

```powershell
cd web
npm install   # also copies the Draco decoder into public/draco
npm run dev
```

## Deploy

Every push to `main` builds the image and publishes it to `ghcr.io/drewsum/camaro-web`
(`.github/workflows/docker-publish.yml`). `docker-compose.yml` only pulls that image, so the
server never builds (log in to ghcr.io with a token that has `read:packages`).

To build and run locally instead (`docker-compose.override.yml` adds the build):

```sh
docker compose up -d --build
```

Serves on port 8080 by default; set `PORT` to change the host port.

## Model license

Based on a 1967 model, modified to 1968 specification (split tail lights, side marker lamps,
no vent windows, wheel well trim, cowl hood, paint and trim changes).

"1967 Chevrolet Camaro SS 350 Coupe" (https://skfb.ly/pNoxx) by Ddiaz Design, licensed under
CC BY-NC-SA 4.0 — see `3d_model/LICENSE.txt`.
