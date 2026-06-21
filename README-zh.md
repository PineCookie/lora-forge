<div align="center">

<img src="assets/logo.svg" width="200" height="200" alt="LoRA Forge" style="border-radius: 25px">

# LoRA Forge

_✨ 享受 LoRA 训练！ ✨_

</div>

<p align="center">
  <a href="https://github.com/PineCookie/lora-scripts" style="margin: 2px;">
    <img alt="GitHub 仓库星标" src="https://img.shields.io/github/stars/PineCookie/lora-scripts">
  </a>
  <a href="https://github.com/PineCookie/lora-scripts" style="margin: 2px;">
    <img alt="GitHub 仓库分支" src="https://img.shields.io/github/forks/PineCookie/lora-scripts">
  </a>
  <a href="https://raw.githubusercontent.com/PineCookie/lora-scripts/master/LICENSE" style="margin: 2px;">
    <img src="https://img.shields.io/github/license/PineCookie/lora-scripts" alt="许可证">
  </a>
  <a href="https://github.com/PineCookie/lora-scripts/releases" style="margin: 2px;">
    <img src="https://img.shields.io/github/v/release/PineCookie/lora-scripts?color=blueviolet&include_prereleases" alt="发布版本">
  </a>
</p>

<p align="center">
  <a href="https://github.com/PineCookie/lora-scripts/releases">下载</a>
  ·
  <a href="https://github.com/PineCookie/lora-scripts/blob/main/README.md">文档</a>
  ·
  <a href="https://github.com/PineCookie/lora-scripts/blob/main/README-zh.md">中文README</a>
</p>

LoRA & Dreambooth 训练图形界面、脚本预设与一键训练环境，用于 [kohya-ss/sd-scripts](https://github.com/kohya-ss/sd-scripts.git)

**WARNING: 本项目主要为个人使用，目的是延续 [lora-scripts](https://github.com/Akegarasu/lora-scripts) 的易用 UI 和工作流。当前可能存在大量 Bug，欢迎提出意见或 PR！**

## ✨ 新增：Anima LoRA 训练

- [x] 重构界面以支持不同模型的训练参数，包括 Anima。目前为 Native JS + HTML
- [x] 使用 uv 安装和管理环境，不再依赖 requirements.txt 和旧安装脚本
- [ ] 支持不同显卡的 Torch 安装
- [ ] 加入缺失的原前端功能

# 使用方法

### 必要依赖

Python 3.12 和 Git

### 克隆带子模块的仓库

```sh
git clone --recurse-submodules https://github.com/PineCookie/lora-scripts
```

## ✨ LoRA Forge GUI

### Windows

#### 安装

运行 `install-cn.ps1` 将根据 `pyproject.toml` 安装依赖到 uv 管理的 `.venv`。

`flash-attn` 是可选依赖，默认不会安装。如果你有兼容的本地 wheel，请将它放在 Git 忽略的目录中，例如 `wheelhouse/`，并在同步环境时启用可选依赖：

```powershell
uv sync -U --extra flash-attn --find-links .\wheelhouse --no-build-package flash-attn
```

`-U` 会让 uv 更新本地 lockfile 以使用该 wheel，`--no-build-package flash-attn` 可以避免 uv 回退到从源码构建 `flash-attn`。

#### 训练

运行 `run_gui.ps1`，然后在浏览器中打开 [http://127.0.0.1:28000](http://127.0.0.1:28000)。
如需自动打开浏览器，请运行 `python gui.py --open-browser`。

### Linux

#### 安装

运行 `install.bash` 将根据 `pyproject.toml` 安装依赖到 uv 管理的 `.venv`。

`flash-attn` 是可选依赖，默认不会安装。如果你有兼容的本地 wheel，请将它放在 Git 忽略的目录中，例如 `wheelhouse/`，并在同步环境时启用可选依赖：

```sh
uv sync -U --extra flash-attn --find-links ./wheelhouse --no-build-package flash-attn
```

`-U` 会让 uv 更新本地 lockfile 以使用该 wheel，`--no-build-package flash-attn` 可以避免 uv 回退到从源码构建 `flash-attn`。

#### 训练

运行 `bash run_gui.sh`，然后在浏览器中打开 [http://127.0.0.1:28000](http://127.0.0.1:28000)。
如需自动打开浏览器，请运行 `python gui.py --open-browser`。

## 传统手动训练脚本

### Windows

#### 安装

运行 `install.ps1` 将根据 `pyproject.toml` 安装依赖到 uv 管理的 `.venv`。

#### 训练

编辑 `train.ps1`，然后运行。

### Linux

#### 安装

运行 `install.bash` 将根据 `pyproject.toml` 安装依赖到 uv 管理的 `.venv`。

#### 训练

脚本 `train.sh` **不会** 自动激活环境。请先激活环境。

```sh
source .venv/bin/activate
```

编辑 `train.sh`，然后运行。

#### TensorBoard

运行 `tensorboard.ps1` 将在 http://localhost:6006/ 启动 TensorBoard

## 程序参数

| 参数名称                     | 类型  | 默认值       | 描述                                            |
|------------------------------|-------|--------------|-------------------------------------------------|
| `--host`                     | str   | "127.0.0.1"  | 服务器的主机名                                  |
| `--port`                     | int   | 28000        | 运行服务器的端口                                |
| `--listen`                   | bool  | false        | 启用服务器的监听模式                            |
| `--skip-prepare-onnxruntime` | bool  | false        | 跳过 ONNX Runtime 准备                          |
| `--skip-prepare-sd-scripts`  | bool  | false        | 跳过克隆 kohya-ss/sd-scripts                    |
| `--sd-scripts-branch`        | str   | "main"        | 克隆 kohya-ss/sd-scripts 时使用的分支或标签           |
| `--enable-tensorboard`       | bool  | false        | 启用 TensorBoard                                |
| `--enable-tageditor`         | bool  | false        | 启用标签编辑器                                  |
| `--tensorboard-host`         | str   | "127.0.0.1"  | 运行 TensorBoard 的主机                         |
| `--tensorboard-port`         | int   | 6006         | 运行 TensorBoard 的端口                          |
| `--localization`             | str   |              | 界面的本地化设置                                |
| `--dev`                      | bool  | false        | 开发者模式，用于禁用某些检查                     |
| `--open-browser`             | bool  | false        | 服务器启动后自动打开浏览器                      |

## 鸣谢

本项目基于 Akegarasu 的原始项目 [lora-scripts](https://github.com/Akegarasu/lora-scripts)。感谢 Akegarasu 和原项目贡献者打下的基础。
