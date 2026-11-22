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

& $blender -b (Join-Path $root "3d_model\engine\bbc_block_work.blend") --python (Join-Path $root "scripts\export_engine_glb.py")
if ($LASTEXITCODE -ne 0) { throw "Blender export of the engine failed with exit code $LASTEXITCODE" }
