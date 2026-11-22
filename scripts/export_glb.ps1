# Export 3d_model/{camaro,mustang,charger}.blend -> web/public/models/*.glb, and
# 3d_model/engine/bbc_block_work.blend -> web/public/models/engine.glb,
# using headless Blender. Override the Blender executable with $env:BLENDER.
$ErrorActionPreference = "Stop"

$blender = $env:BLENDER
if (-not $blender) {
    $blender = "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
}

$root = Split-Path -Parent $PSScriptRoot
foreach ($model in "camaro", "mustang", "charger") {
    & $blender -b (Join-Path $root "3d_model\$model.blend") --python (Join-Path $root "scripts\export_glb.py")
    if ($LASTEXITCODE -ne 0) { throw "Blender export of $model failed with exit code $LASTEXITCODE" }
}

# Blender writes the car textures as PNG; re-encode them as WebP (needs `npm install` in web/).
Push-Location (Join-Path $root "web")
try {
    node scripts/optimize-glb.mjs public/models/camaro.glb public/models/mustang.glb public/models/charger.glb
    if ($LASTEXITCODE -ne 0) { throw "Texture optimization failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}

& $blender -b (Join-Path $root "3d_model\engine\bbc_block_work.blend") --python (Join-Path $root "scripts\export_engine_glb.py")
if ($LASTEXITCODE -ne 0) { throw "Blender export of the engine failed with exit code $LASTEXITCODE" }
