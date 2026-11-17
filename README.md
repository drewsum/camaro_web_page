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

```sh
docker compose up -d --build
```

Serves on port 8080 by default; set `PORT` to change the host port (`PORT=3000 docker compose up -d --build`).

## Model license

"1967 Chevrolet Camaro SS 350 Coupe" (https://skfb.ly/pNoxx) by Ddiaz Design, licensed under
CC BY-NC-SA 4.0 — see `3d_model/LICENSE.txt`.
