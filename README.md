# 1967 Camaro web viewer

Interactive 3D viewer for the Camaro model (React Three Fiber, served by nginx in Docker).

## Update the model

The site serves `web/public/models/camaro.glb`, exported from `3d_model/camaro.blend`.
After editing the .blend, re-export (uses Blender 5.2; override the path with `$env:BLENDER`):

```powershell
./scripts/export_glb.ps1
```

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

"1967 Chevrolet Camaro SS 350 Coupe" (https://skfb.ly/pNoxx) by Ddiaz Design, licensed under
CC BY-NC-SA 4.0 — see `3d_model/LICENSE.txt`.
