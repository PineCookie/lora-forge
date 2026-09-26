import os
import subprocess
import threading
import uuid
from enum import Enum
from subprocess import CompletedProcess, TimeoutExpired
from typing import Dict, List

import psutil

from mikazuki.log import log

_mswindows = os.name == "nt"


def kill_proc_tree(pid, including_parent=True):
    parent = psutil.Process(pid)
    children = parent.children(recursive=True)
    for child in children:
        child.kill()
    gone, still_alive = psutil.wait_procs(children, timeout=5)
    if including_parent:
        parent.kill()
        parent.wait(5)


class TaskStatus(Enum):
    CREATED = 0
    RUNNING = 1
    FINISHED = 2
    TERMINATED = 3


class Task:
    def __init__(self, task_id, command, environ=None):
        self.task_id = task_id
        self.lock = threading.Lock()
        self.command = command
        self.status = TaskStatus.CREATED
        self.environ = environ or os.environ

    def communicate(self, input=None, timeout=None):
        try:
            stdout, stderr = self.process.communicate(input, timeout=timeout)
        except TimeoutExpired as exc:
            self.process.kill()
            if _mswindows:
                exc.stdout, exc.stderr = self.process.communicate()
            else:
                self.process.wait()
            raise
        except:
            self.process.kill()
            raise
        retcode = self.process.poll()
        self.status = TaskStatus.FINISHED
        return CompletedProcess(self.process.args, retcode, stdout, stderr)

    def wait(self):
        self.process.wait()
        self.status = TaskStatus.FINISHED

    def execute(self):
        self.status = TaskStatus.RUNNING
        self.process = subprocess.Popen(self.command, env=self.environ)

    def terminate(self):
        try:
            kill_proc_tree(self.process.pid, False)
        except Exception as e:
            log.error(f"Error when killing process: {e}")
            return
        finally:
            self.status = TaskStatus.TERMINATED


class TaskManager:
    # Keep a bounded history of finished/terminated tasks so a long session does not grow forever.
    MAX_RETAINED_TASKS = 20

    def __init__(self, max_concurrent=1) -> None:
        self.max_concurrent = max_concurrent
        self.tasks: Dict[str, Task] = {}

    def _prune(self):
        done = [
            task_id for task_id, task in self.tasks.items()
            if task.status in (TaskStatus.FINISHED, TaskStatus.TERMINATED)
        ]
        for task_id in done[: -self.MAX_RETAINED_TASKS]:
            self.tasks.pop(task_id, None)

    def create_task(self, command: List[str], environ):
        self._prune()
        running_tasks = [t for _, t in self.tasks.items() if t.status == TaskStatus.RUNNING]
        if len(running_tasks) >= self.max_concurrent:
            log.error(
                f"Unable to create a task because there are already {len(running_tasks)} tasks running, reaching the maximum concurrent limit. / 无法创建任务，因为已经有 {len(running_tasks)} 个任务正在运行，已达到最大并发限制。")
            return None
        task_id = str(uuid.uuid4())
        task = Task(task_id=task_id, command=command, environ=environ)
        self.tasks[task_id] = task
        # task.execute() # breaking change
        log.info(f"Task {task_id} created")
        return task

    def add_task(self, task_id: str, task: Task):
        self.tasks[task_id] = task

    def terminate_task(self, task_id: str):
        if task_id in self.tasks:
            task = self.tasks[task_id]
            task.terminate()

    def wait_for_process(self, task_id: str):
        if task_id in self.tasks:
            task: Task = self.tasks[task_id]
            task.wait()

    def dump(self) -> List[Dict]:
        return [
            {
                "id": task.task_id,
                "status": task.status.name,
            }
            for task in self.tasks.values()
        ]


tm = TaskManager()
