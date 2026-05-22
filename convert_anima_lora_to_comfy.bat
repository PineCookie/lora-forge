@echo off
setlocal

if "%~2"=="" (
    echo Usage: %~nx0 SRC_PATH DST_PATH [--reverse]
    exit /b 1
)

set "REPO_ROOT=%~dp0"
set "SD_SCRIPTS_ROOT=%REPO_ROOT%scripts\sd-scripts"

if not exist "%~1" (
    echo Source path does not exist: %~1
    exit /b 1
)

for %%I in ("%~1") do set "SRC_PATH=%%~fI"

set "DST_PARENT=%~dp2"
if defined DST_PARENT (
    if not exist "%DST_PARENT%" (
        echo Destination parent does not exist: %DST_PARENT%
        exit /b 1
    )
)
for %%I in ("%~2") do set "DST_PATH=%%~fI"

set "REVERSE_ARG="
if /I "%~3"=="--reverse" set "REVERSE_ARG=--reverse"
if /I "%~3"=="-reverse" set "REVERSE_ARG=--reverse"
if /I "%~3"=="/reverse" set "REVERSE_ARG=--reverse"

pushd "%SD_SCRIPTS_ROOT%" || exit /b 1
uv run python -m networks.convert_anima_lora_to_comfy "%SRC_PATH%" "%DST_PATH%" %REVERSE_ARG%
set "EXIT_CODE=%ERRORLEVEL%"
popd

exit /b %EXIT_CODE%
