import os
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


def _get_initial_dir(initialdir="") -> str:
    return last_dir or initialdir or os.getcwd()


def tk_window():
    if tkinter is None:
        return None

    window = tkinter.Tk()
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
