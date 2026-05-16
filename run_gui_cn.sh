#!/bin/bash

script_dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

export HF_HOME=huggingface
export HF_ENDPOINT=https://hf-mirror.com
export PIP_INDEX_URL="https://pypi.tuna.tsinghua.edu.cn/simple"
export UV_DEFAULT_INDEX="https://pypi.tuna.tsinghua.edu.cn/simple"
export PYTHONUTF8=1

cd "$script_dir" || exit
uv run python gui.py "$@"


