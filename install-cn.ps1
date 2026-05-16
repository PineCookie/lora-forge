$Env:HF_HOME = "huggingface"
$Env:PIP_DISABLE_PIP_VERSION_CHECK = 1
$Env:PIP_NO_CACHE_DIR = 1
$Env:PIP_INDEX_URL = "https://pypi.tuna.tsinghua.edu.cn/simple"
$Env:UV_DEFAULT_INDEX = "https://pypi.tuna.tsinghua.edu.cn/simple"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
function InstallFail {
    Write-Output "安装失败。"
    Read-Host | Out-Null ;
    Exit
}

function Check {
    param (
        $ErrorInfo
    )
    if (!($?)) {
        Write-Output $ErrorInfo
        InstallFail
    }
}
if (Test-Path -Path "python\python.exe") {
    Write-Output "使用 python 文件夹内的 python..."
    $py_path = (Get-Item "python").FullName
    $env:PATH = "$py_path;$env:PATH"
}

Write-Output "安装程序所需依赖 (已进行国内加速，若在国外或无法使用加速源请换用 install.ps1 脚本)"
Write-Output "受限于国内加速镜像，Torch 安装仍会使用 pyproject.toml 中配置的 PyTorch 源，安装可能较慢。"

if (!(Get-Command uv -ErrorAction SilentlyContinue)) {
    python -m pip install --upgrade uv
    Check "uv 安装失败，请检查 Python 和网络。"
}

uv sync --project "$ScriptDir"
Check "训练界面依赖安装失败。"

Write-Output "安装完毕"
Read-Host | Out-Null ;
