"""Guard rails for the sd-scripts checkout the GUI drives.

The GUI hands its options to sd-scripts as TOML config keys, and sd-scripts ignores unknown
keys silently: an outdated checkout accepts an option and simply does nothing. These helpers
map GUI options to the sd-scripts feature they need and report which ones the installed
checkout cannot provide.

Each feature records the upstream commit that introduced it (used for a precise
``git merge-base --is-ancestor`` check) plus a cheap file marker, used as a fallback when git
cannot answer -- for example a checkout whose ``.git`` directory was removed.
"""

from dataclasses import dataclass
from pathlib import Path
import subprocess
from typing import Dict, Iterable, List, Mapping, Optional, Set

from mikazuki.launch_utils import base_dir_path
from mikazuki.log import log


@dataclass(frozen=True)
class Feature:
    label: str
    min_commit: str
    marker_path: str
    marker_text: Optional[str] = None


# upstream commits that introduced the options the GUI exposes
V0_11_1 = "6721028c79ee85a78b3a06dfd8954dae310a1cce"
TIMESTEP_OFFSET = "5bf1dd510e49efc9304f140773a8465d5b0fd299"

FEATURES: Dict[str, Feature] = {
    "compile": Feature("逐 block torch.compile / CUDA 性能开关", V0_11_1, "library/compile_utils.py"),
    "qwen_image_vae_2d": Feature("2D Qwen-Image VAE", V0_11_1, "library/qwen_image_autoencoder_kl_2d.py"),
    "show_timesteps": Feature("时间步分布预览", V0_11_1, "library/args.py", '"--show_timesteps"'),
    "timestep_offset": Feature(
        "子文件夹时间步偏移 / 偏移预览", TIMESTEP_OFFSET, "library/flux_train_utils.py", "timestep_sampling_offset"
    ),
}

# last checkout this GUI was verified against (main)
SD_SCRIPTS_TESTED_REF = "690ea7f96c23182352ec63def76d431c6120bd2f"
SD_SCRIPTS_SUBPATH = ("scripts", "sd-scripts")

# config key -> feature the key needs. Keys that are always sent with their default value
# (compile_backend, compile_mode, compile_cache_size_limit, ...) are deliberately absent:
# they only take effect once `compile` itself is enabled.
CONFIG_KEY_FEATURES = {
    "compile": "compile",
    "cuda_allow_tf32": "compile",
    "cuda_cudnn_benchmark": "compile",
    "qwen_image_vae_2d": "qwen_image_vae_2d",
    "show_timesteps": "show_timesteps",
    "show_timesteps_offset": "timestep_offset",
}

_SUPPORT_CACHE: Dict[tuple, bool] = {}


def sd_scripts_dir(root: Optional[Path] = None) -> Path:
    return Path(root) if root is not None else base_dir_path().joinpath(*SD_SCRIPTS_SUBPATH)


def requested_features(config: Mapping, has_offsets: bool = False) -> Set[str]:
    """The sd-scripts features a submitted config actually relies on."""
    features = {feature for key, feature in CONFIG_KEY_FEATURES.items() if config.get(key)}
    if has_offsets:
        features.add("timestep_offset")
    return features


def head_commit(root: Optional[Path] = None) -> Optional[str]:
    """HEAD of the checkout, or None when git cannot tell."""
    try:
        result = subprocess.run(
            ["git", "-C", str(sd_scripts_dir(root)), "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (OSError, subprocess.SubprocessError) as e:
        log.debug(f"cannot read sd-scripts HEAD: {e}")
        return None
    if result.returncode != 0:
        return None
    return result.stdout.strip() or None


def _introduced_before(feature: Feature, root: Optional[Path], head: Optional[str]) -> Optional[bool]:
    if head is None:
        return None
    try:
        result = subprocess.run(
            ["git", "-C", str(sd_scripts_dir(root)), "merge-base", "--is-ancestor", feature.min_commit, head],
            capture_output=True,
            timeout=10,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if result.returncode == 0:
        return True
    if result.returncode == 1:
        return False
    return None  # 128: unknown commit or not a repository


def _marker_present(feature: Feature, root: Optional[Path]) -> Optional[bool]:
    path = sd_scripts_dir(root) / feature.marker_path
    try:
        if feature.marker_text is None:
            return path.is_file()
        return feature.marker_text in path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return None


def feature_supported(key: str, root: Optional[Path] = None, head: Optional[str] = None) -> bool:
    """Whether the checkout can apply `key`. Undeterminable situations count as supported."""
    feature = FEATURES[key]
    if head is None:
        head = head_commit(root)

    cache_key = (str(sd_scripts_dir(root)), head or "", key)
    if cache_key in _SUPPORT_CACHE:
        return _SUPPORT_CACHE[cache_key]

    supported = _introduced_before(feature, root, head)
    if supported is None:
        supported = _marker_present(feature, root)
    result = True if supported is None else supported
    _SUPPORT_CACHE[cache_key] = result
    return result


def missing_features(features: Iterable[str], root: Optional[Path] = None) -> List[str]:
    """Requested features the installed checkout cannot provide (sorted, deduplicated)."""
    head = head_commit(root)
    return [key for key in sorted(set(features)) if not feature_supported(key, root, head)]


def missing_features_message(missing: List[str], root: Optional[Path] = None) -> str:
    labels = "、".join(FEATURES[key].label for key in missing)
    ref = (head_commit(root) or "unknown")[:12]
    return (
        f"已安装的 sd-scripts（{ref}）不支持：{labels}。"
        "这些选项会被 sd-scripts 静默忽略，请先更新到 main 分支后重试："
        "update_sd_scripts.ps1 --branch main"
    )


def compatibility_status(root: Optional[Path] = None) -> str:
    """Short human-readable state of the checkout, for /api/runtime."""
    head = head_commit(root)
    missing = missing_features(FEATURES, root)
    if missing:
        return "过旧：缺少 " + "、".join(FEATURES[key].label for key in missing)
    if head == SD_SCRIPTS_TESTED_REF:
        return "兼容（已测试版本）"
    if head is None:
        return "兼容（未能读取 git 版本信息）"
    return "兼容"
