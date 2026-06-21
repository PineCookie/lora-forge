import locale
import os
import platform
import re
import shutil
import subprocess
import sys
import socket
import sysconfig
from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as package_version
from typing import List
from pathlib import Path
from typing import Optional
import tomllib

from packaging.requirements import InvalidRequirement, Requirement

from mikazuki.log import log

python_bin = sys.executable


def base_dir_path():
    return Path(__file__).parents[1].absolute()


def find_windows_git():
    possible_paths = ["git\\bin\\git.exe", "git\\cmd\\git.exe",
                      "Git\\mingw64\\libexec\\git-core\\git.exe", "C:\\Program Files\\Git\\cmd\\git.exe"]
    for path in possible_paths:
        if os.path.exists(path):
            return path


def prepare_git():
    if shutil.which("git"):
        return True

    log.info("Finding git...")

    if sys.platform == "win32":
        git_path = find_windows_git()

        if git_path is not None:
            log.info(f"Git not found, but found git in {git_path}, add it to PATH")
            os.environ["PATH"] += os.pathsep + os.path.dirname(git_path)
            return True
        else:
            return False
    else:
        log.error("git not found, please install git first")
        return False


def prepare_submodules():
    frontend_path = base_dir_path() / "frontend" / "dist"
    tag_editor_path = base_dir_path() / "mikazuki" / "dataset-tag-editor" / "scripts"

    if not os.path.exists(frontend_path) or not os.path.exists(tag_editor_path):
        log.info("submodule not found, try clone...")
        log.info("checking git installation...")
        if not prepare_git():
            log.error("git not found, please install git first")
            sys.exit(1)
        subprocess.run(["git", "submodule", "init"])
        subprocess.run(["git", "submodule", "update"])


def prepare_sd_scripts(ref: str = "main"):
    """Clone or update kohya-ss/sd-scripts at the given branch or tag.

    Args:
        ref: A branch name (e.g. "sd3", "main") or tag (e.g. "v0.11.1").
    """
    sd_scripts_path = base_dir_path() / "scripts" / "sd-scripts"

    if (sd_scripts_path / ".git").exists():
        # Already cloned — fetch latest and switch to the target ref
        if not prepare_git():
            log.error("git not found, please install git first")
            sys.exit(1)

        # Fetch all to get latest branches and tags
        log.info("Fetching latest sd-scripts...")
        subprocess.run(
            ["git", "-C", str(sd_scripts_path), "fetch", "--all", "--tags", "--prune"],
            capture_output=True
        )

        # Check if ref is a tag
        tag_check = subprocess.run(
            ["git", "-C", str(sd_scripts_path), "rev-parse", "--verify", f"refs/tags/{ref}"],
            capture_output=True
        )
        is_tag = tag_check.returncode == 0

        # Determine current HEAD
        try:
            current = subprocess.run(
                ["git", "-C", str(sd_scripts_path), "rev-parse", "HEAD"],
                capture_output=True, text=True, check=True
            ).stdout.strip()
        except subprocess.CalledProcessError:
            current = "unknown"

        target = subprocess.run(
            ["git", "-C", str(sd_scripts_path), "rev-parse", "--verify", ref],
            capture_output=True
        )

        if target.returncode != 0:
            # Ref not found locally yet — try fetching it explicitly
            log.info(f"Ref '{ref}' not found locally, fetching from origin...")
            subprocess.run(
                ["git", "-C", str(sd_scripts_path), "fetch", "origin", f"{ref}:refs/remotes/origin/{ref}"],
                capture_output=True
            )
            target = subprocess.run(
                ["git", "-C", str(sd_scripts_path), "rev-parse", "--verify", f"origin/{ref}"],
                capture_output=True, text=True
            )
            if target.returncode != 0:
                log.error(f"Ref '{ref}' does not exist on remote either")
                return
            target_commit = target.stdout.strip()
        else:
            target_commit = target.stdout.strip()

        if current == target_commit:
            # Already on the right ref — pull if it's a branch
            if not is_tag:
                log.info(f"Already on '{ref}', pulling latest...")
                subprocess.run(
                    ["git", "-C", str(sd_scripts_path), "pull", "--ff-only", "origin", ref],
                    capture_output=True
                )
            else:
                log.info(f"Already at tag '{ref}', nothing to do")
            return

        log.info(f"Switching sd-scripts to '{ref}'...")
        if is_tag:
            # Tags: checkout directly (detached HEAD is fine)
            subprocess.run(
                ["git", "-C", str(sd_scripts_path), "checkout", f"refs/tags/{ref}"],
                check=True
            )
        else:
            # Branches: create/update local branch from remote
            subprocess.run(
                ["git", "-C", str(sd_scripts_path), "checkout", "-B", ref, f"origin/{ref}"],
                check=True
            )
        return

    if sd_scripts_path.exists() and any(sd_scripts_path.iterdir()):
        log.warning(f"sd-scripts path already exists and is not empty: {sd_scripts_path}")
        return

    if not prepare_git():
        log.error("git not found, please install git first")
        sys.exit(1)

    sd_scripts_path.parent.mkdir(parents=True, exist_ok=True)
    log.info(f"Cloning kohya-ss/sd-scripts ({ref}) to {sd_scripts_path}...")
    result = subprocess.run([
        "git",
        "clone",
        "--branch",
        ref,
        "https://github.com/kohya-ss/sd-scripts.git",
        str(sd_scripts_path),
    ])
    if result.returncode != 0:
        # Fallback: clone then checkout the ref (handles tags that aren't branches)
        log.info("Branch clone failed, trying full clone + checkout...")
        result = subprocess.run([
            "git", "clone",
            "https://github.com/kohya-ss/sd-scripts.git",
            str(sd_scripts_path),
        ])
        if result.returncode != 0:
            raise RuntimeError(f"Failed to clone kohya-ss/sd-scripts")
        subprocess.run(
            ["git", "-C", str(sd_scripts_path), "checkout", ref],
            check=True
        )


def git_tag(path: str) -> str:
    try:
        result = subprocess.run(
            ["git", "-C", path, "describe", "--tags"],
            capture_output=True,
            check=True,
            text=True,
        )
        return result.stdout.strip()
    except Exception:
        pyproject_path = Path(path) / "pyproject.toml"
        if pyproject_path.exists():
            try:
                with pyproject_path.open("rb") as f:
                    return tomllib.load(f).get("project", {}).get("version", "<none>")
            except Exception:
                pass
        return "<none>"


def check_dirs(dirs: List):
    for d in dirs:
        if not os.path.exists(d):
            os.makedirs(d)


def run(command,
        desc: Optional[str] = None,
        errdesc: Optional[str] = None,
        custom_env: Optional[list] = None,
        live: Optional[bool] = True,
        shell: Optional[bool] = None):

    if shell is None:
        shell = False if sys.platform == "win32" else True

    if desc is not None:
        print(desc)

    if live:
        result = subprocess.run(command, shell=shell, env=os.environ if custom_env is None else custom_env)
        if result.returncode != 0:
            raise RuntimeError(f"""{errdesc or 'Error running command'}.
Command: {command}
Error code: {result.returncode}""")

        return ""

    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            shell=shell, env=os.environ if custom_env is None else custom_env)

    if result.returncode != 0:
        message = f"""{errdesc or 'Error running command'}.
Command: {command}
Error code: {result.returncode}
stdout: {result.stdout.decode(encoding="utf8", errors="ignore") if len(result.stdout) > 0 else '<empty>'}
stderr: {result.stderr.decode(encoding="utf8", errors="ignore") if len(result.stderr) > 0 else '<empty>'}
"""
        raise RuntimeError(message)

    return result.stdout.decode(encoding="utf8", errors="ignore")


def is_installed(package, friendly: str = None):
    #
    # This function was adapted from code written by vladimandic: https://github.com/vladmandic/automatic/commits/master
    #

    # Remove brackets and their contents from the line using regular expressions
    # e.g., diffusers[torch]==0.10.2 becomes diffusers==0.10.2
    package = re.sub(r'\[.*?\]', '', package)

    try:
        if friendly:
            pkgs = friendly.split()
        else:
            pkgs = [
                p
                for p in package.split()
                if not p.startswith('-') and not p.startswith('=')
            ]
            pkgs = [
                p.split('/')[-1] for p in pkgs
            ]   # get only package name if installing from URL

        for pkg in pkgs:
            try:
                requirement = Requirement(pkg)
                pkg_name = requirement.name
                specifier = requirement.specifier
                if requirement.marker is not None and not requirement.marker.evaluate():
                    continue
            except InvalidRequirement:
                pkg_name = pkg.strip()
                specifier = None

            try:
                version = package_version(pkg_name)
            except PackageNotFoundError:
                log.warning(f'Package version not found: {pkg_name}')
                return False

            # log.debug(f'Package version found: {pkg_name} {version}')
            if specifier and version not in specifier:
                log.info(f'Package wrong version: {pkg_name} {version} required {specifier}')
                return False

        return True
    except ModuleNotFoundError:
        log.warning(f'Package not installed: {pkgs}')
        return False


def sync_project_dependencies():
    if shutil.which("uv") is None:
        run_pip("install uv", "uv", live=True)

    run(["uv", "sync", "--project", str(base_dir_path())], desc="Installing dependencies from pyproject.toml",
        errdesc="Couldn't install dependencies from pyproject.toml", live=True)


def setup_windows_bitsandbytes():
    if sys.platform != "win32":
        return

    # bnb_windows_index = os.environ.get("BNB_WINDOWS_INDEX", "https://jihulab.com/api/v4/projects/140618/packages/pypi/simple")
    bnb_package = "bitsandbytes==0.46.0"
    bnb_path = os.path.join(sysconfig.get_paths()["purelib"], "bitsandbytes")

    installed_bnb = is_installed("bitsandbytes")  # don't check version here
    bnb_cuda_setup = len([f for f in os.listdir(bnb_path) if re.findall(r"libbitsandbytes_cuda.+?\.dll", f)]) != 0

    if not installed_bnb or not bnb_cuda_setup:
        log.error("detected wrong install of bitsandbytes, reinstall it")
        run_pip(f"uninstall bitsandbytes -y", "bitsandbytes", live=True)
        run_pip(f"install {bnb_package}", bnb_package, live=True)


def setup_onnxruntime(
        onnx_version: Optional[str] = None,
        index_url: Optional[str] = None
):
    if sys.platform == "linux":
        libc_ver = platform.libc_ver()
        if libc_ver[0] == "glibc" and libc_ver[1] <= "2.27":
            onnx_version = "1.16.3"

    onnx_version = os.environ.get("ONNXRUNTIME_VERSION", onnx_version)

    if onnx_version and not is_installed(f"onnxruntime-gpu=={onnx_version}"):
        log.info("uninstalling wrong onnxruntime version")
        run_pip(f"uninstall onnxruntime -y", "onnxruntime", live=True)
        run_pip(f"uninstall onnxruntime-gpu -y", "onnxruntime", live=True)

    if not is_installed(f"onnxruntime-gpu"):
        log.info(f"installing onnxruntime")
        pip_install("onnxruntime", onnx_version, index_url=index_url, live=True)
        pip_install("onnxruntime-gpu", onnx_version, index_url=index_url, live=True)


def run_pip(command, desc=None, live=False):
    return run(f'"{python_bin}" -m pip {command}', desc=f"Installing {desc}", errdesc=f"Couldn't install {desc}", live=live)


def pip_install(package: str, version: Optional[str] = None, index_url: Optional[str] = None, live: bool = True):
    """
    Install a package using pip.
    :param package: The name of the package to install.
    :param version: The version of the package to install (optional).
    :param index_url: The index URL to use for installing the package (optional).
    """
    if version:
        package = f"{package}=={version}"

    command = f"install {package}"

    if index_url:
        command = f"{command} -i {index_url}"

    run_pip(command, desc=f"Installing {package}", live=live)


def check_run(file: str) -> bool:
    result = subprocess.run([python_bin, file], capture_output=True, shell=False)
    log.info(result.stdout.decode("utf-8").strip())
    return result.returncode == 0


def network_gfw_test(timeout=3):
    try:
        import requests
        # requests will auto detect system proxies
        response = requests.get("https://www.google.com", timeout=timeout)
        if response.status_code == 200:
            log.info("Network test passed")
            return True
        else:
            log.error(f"Network test failed: {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        log.error(f"Network test failed: {e}")
        return False


def prepare_environment(disable_auto_mirror: bool = True, prepare_onnxruntime: bool = True):
    if sys.platform == "win32":
        # disable triton on windows
        os.environ["XFORMERS_FORCE_DISABLE_TRITON"] = "1"

    os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
    os.environ["BITSANDBYTES_NOWELCOME"] = "1"
    os.environ["PYTHONWARNINGS"] = "ignore::UserWarning"
    os.environ["PIP_DISABLE_PIP_VERSION_CHECK"] = "1"

    if not disable_auto_mirror and not network_gfw_test():
        log.info("use pip & huggingface mirrors")
        os.environ.setdefault("PIP_FIND_LINKS", "https://mirror.sjtu.edu.cn/pytorch-wheels/torch_stable.html")
        os.environ.setdefault("PIP_INDEX_URL", "https://pypi.tuna.tsinghua.edu.cn/simple")
        os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")

    if not os.environ.get("PATH"):
        os.environ["PATH"] = os.path.dirname(sys.executable)

    prepare_submodules()

    check_dirs(["config/autosave", "logs"])

    # if not check_run("mikazuki/scripts/torch_check.py"):
    #     sys.exit(1)

    sync_project_dependencies()
    setup_windows_bitsandbytes()

    if prepare_onnxruntime:
        setup_onnxruntime()


def catch_exception(f):
    def wrapper(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except Exception as e:
            log.error(f"An error occurred: {e}")
    return wrapper


def check_port_avaliable(port: int):
    try:
        s = socket.socket()
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind(("127.0.0.1", port))
        s.close()
        return True
    except:
        return False


def find_avaliable_ports(port_init: int, port_range: int):
    server_ports = range(port_init, port_range)

    for p in server_ports:
        if check_port_avaliable(p):
            return p

    log.error(f"error finding avaliable ports in range: {port_init} -> {port_range}")
    return None
