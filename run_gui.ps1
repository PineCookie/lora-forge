$Env:HF_HOME = "huggingface"
$Env:PYTHONUTF8 = "1"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Push-Location $ScriptDir

# --- Auto-detect VS 2022 for torch.compile --compile_dynamic support ---
function Enable-VS2022Environment {
    $vsPaths = @(
        "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\BuildTools",
        "${env:ProgramFiles}\Microsoft Visual Studio\2022\Community",
        "${env:ProgramFiles}\Microsoft Visual Studio\2022\Professional",
        "${env:ProgramFiles}\Microsoft Visual Studio\2022\Enterprise"
    )
    foreach ($vsPath in $vsPaths) {
        $vcvars = Join-Path $vsPath "VC\Auxiliary\Build\vcvars64.bat"
        if (Test-Path $vcvars) {
            Write-Host -ForegroundColor Cyan "Found VS 2022 at: $vsPath"
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
    }
    Write-Host -ForegroundColor Yellow "Visual Studio 2022 not found. --compile_dynamic=true will not work."
    Write-Host -ForegroundColor Yellow "  Install VS 2022 Build Tools from: https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022"
    return $false
}

$vsLoaded = Enable-VS2022Environment
# --- End VS 2022 detection ---

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
