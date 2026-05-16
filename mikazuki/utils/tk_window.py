import os
import sys
from mikazuki.log import log

try:
    import tkinter
    from tkinter.filedialog import askdirectory, askopenfilename
except ImportError:
    tkinter = None
    askdirectory = None
    askopenfilename = None
    log.warning("tkinter not found, file selector will not work.")

last_dir = ""
dpi_awareness_configured = False


def _configure_windows_dpi_awareness():
    global dpi_awareness_configured
    if dpi_awareness_configured or sys.platform != "win32":
        return

    dpi_awareness_configured = True
    try:
        import ctypes

        try:
            # Per-monitor DPI awareness v2 gives the sharpest common dialogs on
            # modern Windows. The call can fail if awareness was already set.
            ctypes.windll.user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
            return
        except Exception:
            pass

        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(2)
            return
        except Exception:
            pass

        ctypes.windll.user32.SetProcessDPIAware()
    except Exception as e:
        log.debug(f"Unable to configure Windows DPI awareness for tkinter: {e}")


def _configure_tk_scaling(window):
    if sys.platform != "win32":
        return

    try:
        import ctypes

        dpi = ctypes.windll.user32.GetDpiForWindow(window.winfo_id())
        if dpi > 0:
            window.tk.call("tk", "scaling", dpi / 72)
    except Exception as e:
        log.debug(f"Unable to configure tkinter DPI scaling: {e}")


def _get_initial_dir(initialdir="") -> str:
    return last_dir or initialdir or os.getcwd()


def tk_window():
    if tkinter is None:
        return None

    _configure_windows_dpi_awareness()
    window = tkinter.Tk()
    _configure_tk_scaling(window)
    window.wm_attributes("-topmost", 1)
    window.withdraw()
    return window


def open_file_selector(
        initialdir="",
        title="Select a file",
        filetypes=(("All files", "*.*"),)) -> str:
    global last_dir
    initialdir = _get_initial_dir(initialdir)
    window = None

    try:
        if askopenfilename is None:
            return ""

        window = tk_window()
        if window is None:
            return ""

        filename = askopenfilename(
            initialdir=initialdir, title=title,
            filetypes=filetypes
        )

        if filename:
            last_dir = os.path.dirname(filename)

        return filename
    except Exception as e:
        log.error(f"Error opening file selector: {e}")
        return ""
    finally:
        if window is not None:
            window.destroy()


def open_directory_selector(initialdir="") -> str:
    global last_dir
    initialdir = _get_initial_dir(initialdir)
    window = None

    try:
        if askdirectory is None:
            return ""

        window = tk_window()
        if window is None:
            return ""

        directory = askdirectory(
            initialdir=initialdir
        )

        if directory:
            last_dir = directory

        return directory
    except Exception as e:
        log.error(f"Error opening directory selector: {e}")
        return ""
    finally:
        if window is not None:
            window.destroy()
