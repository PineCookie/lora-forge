#!/usr/bin/bash

script_dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

echo "Installing deps..."

cd "$script_dir" || exit
if ! command -v uv >/dev/null 2>&1; then
    python3 -m pip install --upgrade uv
fi

uv sync --project "$script_dir"

echo "Install completed"
