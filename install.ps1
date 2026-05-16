$Env:HF_HOME = "huggingface"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Output "Installing deps..."

if (!(Get-Command uv -ErrorAction SilentlyContinue)) {
    python -m pip install --upgrade uv
}

uv sync --project "$ScriptDir"

Write-Output "Install completed"
Read-Host | Out-Null ;
