import argparse
import shutil
import subprocess
from pathlib import Path


REPO_URL = "https://github.com/kohya-ss/sd-scripts.git"
# Keep this in sync with gui.py's --sd-scripts-branch default (and
# launch_utils.prepare_sd_scripts): Anima training relies on options that only
# exist on main (per-block torch.compile, --qwen_image_vae_2d, per-subset
# timestep offsets), and older branches silently ignore them.
DEFAULT_BRANCH = "main"


def run(command: list[str], cwd: Path | None = None) -> None:
    result = subprocess.run(command, cwd=cwd)
    if result.returncode != 0:
        raise SystemExit(result.returncode)


def output(command: list[str], cwd: Path | None = None) -> str:
    result = subprocess.run(command, cwd=cwd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    return result.stdout.strip()


def succeeds(command: list[str], cwd: Path | None = None) -> bool:
    return subprocess.run(command, cwd=cwd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0


def ensure_git() -> None:
    if shutil.which("git") is None:
        raise SystemExit("git was not found on PATH. Install Git before updating sd-scripts.")


def update_sd_scripts(branch: str, remote: str, path: Path) -> None:
    ensure_git()

    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        run(["git", "clone", "--branch", branch, remote, str(path)])
        return

    if not (path / ".git").exists():
        raise SystemExit(f"{path} exists but is not a Git checkout.")

    current_remote = output(["git", "remote", "get-url", "origin"], cwd=path)
    if current_remote != remote:
        run(["git", "remote", "set-url", "origin", remote], cwd=path)

    run(["git", "fetch", "origin", f"refs/heads/{branch}:refs/remotes/origin/{branch}"], cwd=path)
    if succeeds(["git", "show-ref", "--verify", "--quiet", f"refs/heads/{branch}"], cwd=path):
        run(["git", "checkout", branch], cwd=path)
    else:
        run(["git", "checkout", "--track", f"origin/{branch}"], cwd=path)
    run(["git", "pull", "--ff-only", "origin", branch], cwd=path)


def main() -> None:
    parser = argparse.ArgumentParser(description="Clone or fast-forward scripts/sd-scripts.")
    parser.add_argument("--branch", default=DEFAULT_BRANCH, help=f"Branch to track. Default: {DEFAULT_BRANCH}")
    parser.add_argument("--remote", default=REPO_URL, help=f"Git remote URL. Default: {REPO_URL}")
    parser.add_argument(
        "--path",
        default=Path(__file__).resolve().parent / "scripts" / "sd-scripts",
        type=Path,
        help="Path to the sd-scripts checkout.",
    )
    args = parser.parse_args()

    update_sd_scripts(args.branch, args.remote, args.path.resolve())


if __name__ == "__main__":
    main()
