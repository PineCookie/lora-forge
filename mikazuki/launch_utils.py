import os
import shutil
import subprocess
import sys
import socket
from pathlib import Path
from typing import Optional
import tomllib

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
