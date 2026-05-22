param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$SrcPath,

    [Parameter(Mandatory = $true, Position = 1)]
    [string]$DstPath,

    [switch]$Reverse
)

$ErrorActionPreference = "Stop"

$repoRoot = $PSScriptRoot
$sdScriptsRoot = Join-Path $repoRoot "scripts\sd-scripts"

$resolvedSrcPath = (Resolve-Path -LiteralPath $SrcPath).Path
$dstParent = Split-Path -Parent $DstPath
if ($dstParent) {
    $resolvedDstParent = (Resolve-Path -LiteralPath $dstParent).Path
    $resolvedDstPath = Join-Path $resolvedDstParent (Split-Path -Leaf $DstPath)
} else {
    $resolvedDstPath = Join-Path (Get-Location).Path $DstPath
}

$converterArgs = @(
    "-m",
    "networks.convert_anima_lora_to_comfy",
    $resolvedSrcPath,
    $resolvedDstPath
)

if ($Reverse) {
    $converterArgs += "--reverse"
}

Push-Location $sdScriptsRoot
try {
    uv run python @converterArgs
} finally {
    Pop-Location
}
