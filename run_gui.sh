#!/bin/bash

script_dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

export HF_HOME=huggingface
export PYTHONUTF8=1

cd "$script_dir" || exit
uv run python gui.py "$@"
