# Export 3d_model/camaro.blend -> web/public/models/camaro.glb using headless Blender.
# Override the Blender executable with $env:BLENDER.
$ErrorActionPreference = "Stop"

$blender = $env:BLENDER
if (-not $blender) {
    $blender = "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
}

$root = Split-Path -Parent $PSScriptRoot
& $blender -b (Join-Path $root "3d_model\camaro.blend") --python (Join-Path $root "scripts\export_glb.py")
if ($LASTEXITCODE -ne 0) { throw "Blender export failed with exit code $LASTEXITCODE" }
