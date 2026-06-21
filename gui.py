import argparse
import locale
import os
import platform
import subprocess
import sys

from mikazuki.launch_utils import (
    base_dir_path,
    catch_exception,
    git_tag,
    check_port_avaliable,
    find_avaliable_ports,
    prepare_sd_scripts,
)
from mikazuki.log import log

parser = argparse.ArgumentParser(description="GUI for stable diffusion training")
parser.add_argument("--host", type=str, default="127.0.0.1")
parser.add_argument("--port", type=int, default=28000, help="Port to run the server on")
parser.add_argument("--listen", action="store_true")
parser.add_argument("--skip-prepare-onnxruntime", action="store_true")
parser.add_argument("--enable-tensorboard", action="store_true")
parser.add_argument("--enable-tageditor", action="store_true")
parser.add_argument("--disable-auto-mirror", action="store_true")
parser.add_argument("--skip-prepare-sd-scripts", action="store_true")
parser.add_argument("--sd-scripts-branch", type=str, default="main", help="Branch or tag to use from kohya-ss/sd-scripts (e.g. 'sd3', 'main', 'v0.11.1')")
parser.add_argument("--tensorboard-host", type=str, default="127.0.0.1", help="Port to run the tensorboard")
parser.add_argument("--tensorboard-port", type=int, default=6006, help="Port to run the tensorboard")
parser.add_argument("--localization", type=str)
parser.add_argument("--dev", action="store_true")
parser.add_argument("--open-browser", action="store_true", help="Open the browser after the server starts")


@catch_exception
def run_tensorboard():
    log.info("Starting tensorboard...")
    subprocess.Popen([sys.executable, "-m", "tensorboard.main", "--logdir", "logs",
                     "--host", args.tensorboard_host, "--port", str(args.tensorboard_port)])


@catch_exception
def run_tag_editor():
    log.info("Starting tageditor...")
    cmd = [
        sys.executable,
        base_dir_path() / "mikazuki/dataset-tag-editor/scripts/launch.py",
        "--port", "28001",
        "--shadow-gradio-output",
        "--root-path", "/proxy/tageditor"
    ]
    if args.localization:
        cmd.extend(["--localization", args.localization])
    else:
        l = locale.getencoding()
        if l and l.startswith("cp936"):
            cmd.extend(["--localization", "zh-Hans"])
    subprocess.Popen(cmd)


def launch():
    log.info("Starting LoRA-Forge GUI...")
    log.info(f"Base directory: {base_dir_path()}, Working directory: {os.getcwd()}")
    log.info(f"{platform.system()} Python {platform.python_version()} {sys.executable}")

    if not args.skip_prepare_sd_scripts:
        prepare_sd_scripts(args.sd_scripts_branch)

    if not check_port_avaliable(args.port):
        avaliable = find_avaliable_ports(30000, 30000+20)
        if avaliable:
            args.port = avaliable
        else:
            log.error("port finding fallback error")

    log.info(f"LoRA-Forge Version: {git_tag(str(base_dir_path()))}")

    if args.listen:
        args.host = "0.0.0.0"
        args.tensorboard_host = "0.0.0.0"

    os.environ["MIKAZUKI_HOST"] = args.host
    os.environ["MIKAZUKI_PORT"] = str(args.port)
    os.environ["MIKAZUKI_TENSORBOARD_HOST"] = args.tensorboard_host
    os.environ["MIKAZUKI_TENSORBOARD_PORT"] = str(args.tensorboard_port)
    os.environ["MIKAZUKI_ENABLE_TENSORBOARD"] = "1" if args.enable_tensorboard else "0"
    os.environ["MIKAZUKI_ENABLE_TAGEDITOR"] = "1" if args.enable_tageditor else "0"
    os.environ["MIKAZUKI_DEV"] = "1" if args.dev else "0"
    os.environ["MIKAZUKI_OPEN_BROWSER"] = "1" if args.open_browser else "0"

    if args.enable_tageditor:
        run_tag_editor()

    if args.enable_tensorboard:
        run_tensorboard()

    import uvicorn
    log.info(f"Server started at http://{args.host}:{args.port}")
    uvicorn.run("mikazuki.app:app", host=args.host, port=args.port, log_level="error", reload=args.dev)


if __name__ == "__main__":
    args, _ = parser.parse_known_args()
    launch()
