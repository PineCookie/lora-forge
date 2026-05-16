$Env:HF_HOME = "huggingface"
$Env:PYTHONUTF8 = "1"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Push-Location $ScriptDir

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
