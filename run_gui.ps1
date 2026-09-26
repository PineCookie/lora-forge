$Env:HF_HOME = "huggingface"
$Env:PYTHONUTF8 = "1"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Push-Location $ScriptDir

# --- Auto-detect any installed Visual Studio (2022/2026/...) for torch.compile support ---
function Enable-MSVCEnvironment {
    # Prefer vswhere so the year-based install path does not matter; fall back to the
    # well-known VS 2022 paths when vswhere is unavailable.
    $vswhere = $null
    foreach ($base in @(${env:ProgramFiles(x86)}, $env:ProgramFiles)) {
        if ($base) {
            $candidate = Join-Path $base "Microsoft Visual Studio\Installer\vswhere.exe"
            if (Test-Path $candidate) { $vswhere = $candidate; break }
        }
    }

    $installationPath = $null
    if ($vswhere) {
        $installArgs = @("-latest", "-products", "*",
            "-requires", "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
            "-property", "installationPath")
        $installationPath = & $vswhere @installArgs 2>$null
        if (-not $installationPath) {
            # Also look at prerelease installs (e.g. Insiders) if no stable one matched.
            $installationPath = & $vswhere @installArgs -prerelease 2>$null
        }
        $installationPath = $installationPath | Select-Object -First 1
    }

    if (-not $installationPath) {
        $fallbacks = @(
            "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\BuildTools",
            "${env:ProgramFiles}\Microsoft Visual Studio\2022\Community",
            "${env:ProgramFiles}\Microsoft Visual Studio\2022\Professional",
            "${env:ProgramFiles}\Microsoft Visual Studio\2022\Enterprise"
        )
        $installationPath = $fallbacks |
            Where-Object { Test-Path (Join-Path $_ "VC\Auxiliary\Build\vcvars64.bat") } |
            Select-Object -First 1
    }

    if (-not $installationPath) {
        Write-Host -ForegroundColor Yellow "MSVC (Visual Studio C++ build tools) not found. --compile_dynamic=true will not work."
        Write-Host -ForegroundColor Yellow "  Install Visual Studio Build Tools and select 'Desktop development with C++': https://visualstudio.microsoft.com/downloads/"
        return $false
    }

    $vcvars = Join-Path $installationPath "VC\Auxiliary\Build\vcvars64.bat"
    if (-not (Test-Path $vcvars)) {
        Write-Host -ForegroundColor Yellow "Found Visual Studio at $installationPath but vcvars64.bat is missing (C++ workload not installed). --compile_dynamic=true will not work."
        return $false
    }

    Write-Host -ForegroundColor Cyan "Found Visual Studio at: $installationPath"
    Write-Host -ForegroundColor Cyan "Loading MSVC environment for torch.compile --compile_dynamic support..."
    # Run vcvars64.bat in cmd and capture the resulting environment
    cmd /c "`"$vcvars`" >NUL 2>&1 && set" | ForEach-Object {
        if ($_ -match '^([^=]+)=(.*)$') {
            $key = $matches[1]
            $val = $matches[2]
            if ($key -ne '_OLD_VIRTUAL_PATH' -and $key -ne 'PROMPT') {
                [Environment]::SetEnvironmentVariable($key, $val, 'Process')
            }
        }
    }
    Write-Host -ForegroundColor Green "MSVC environment loaded successfully"
    return $true
}

$vsLoaded = Enable-MSVCEnvironment
# --- End VS detection ---

if (Get-Command uv -ErrorAction SilentlyContinue) {
    uv run python gui.py @args
    Pop-Location
    Exit
}
elseif (Test-Path -Path ".venv\Scripts\activate") {
    Write-Host -ForegroundColor green "Activating virtual environment..."
    .\.venv\Scripts\activate
}
elseif (Test-Path -Path "python\python.exe") {
    Write-Host -ForegroundColor green "Using python from python folder..."
    $py_path = (Get-Item "python").FullName
    $env:PATH = "$py_path;$env:PATH"
}
else {
    Write-Host -ForegroundColor Blue "No virtual environment found, using system python..."
}

python gui.py @args
Pop-Location
