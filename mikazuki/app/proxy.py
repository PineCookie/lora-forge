import asyncio
import os
from dataclasses import dataclass

import httpx
import websockets
from fastapi import APIRouter, Request, WebSocket
from httpx import HTTPError
from starlette.background import BackgroundTask
from starlette.responses import PlainTextResponse, StreamingResponse
from starlette.websockets import WebSocketDisconnect

from mikazuki.log import log

router = APIRouter()

PROXY_TIMEOUT_SECONDS = 360
PROXY_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]
HOP_BY_HOP_HEADERS = {
    b"connection",
    b"keep-alive",
    b"proxy-authenticate",
    b"proxy-authorization",
    b"te",
    b"trailer",
    b"transfer-encoding",
    b"upgrade",
}


@dataclass(frozen=True)
class ProxyTarget:
    host_env: str
    port_env: str
    default_host: str
    default_port: str


PROXY_TARGETS = {
    "tensorboard": ProxyTarget(
        host_env="MIKAZUKI_TENSORBOARD_HOST",
        port_env="MIKAZUKI_TENSORBOARD_PORT",
        default_host="127.0.0.1",
        default_port="6006",
    ),
    "tageditor": ProxyTarget(
        host_env="MIKAZUKI_TAGEDITOR_HOST",
        port_env="MIKAZUKI_TAGEDITOR_PORT",
        default_host="127.0.0.1",
        default_port="28001",
    ),
}
_proxy_clients: list[httpx.AsyncClient] = []


def _client_for_target(url_type: str) -> httpx.AsyncClient:
    target = PROXY_TARGETS.get(url_type)
    if target is None:
        raise ValueError(f"Unknown proxy target: {url_type}")

    host = os.environ.get(target.host_env, target.default_host)
    port = os.environ.get(target.port_env, target.default_port)
    client = httpx.AsyncClient(
        base_url=f"http://{host}:{port}/",
        trust_env=False,
        timeout=PROXY_TIMEOUT_SECONDS,
    )
    _proxy_clients.append(client)
    return client


async def close_proxy_clients():
    for client in _proxy_clients:
        await client.aclose()
    _proxy_clients.clear()


def _proxy_path(request: Request, full_path: bool) -> str:
    if full_path:
        return request.url.path

    path = request.path_params.get("path", "")
    return "/" if path == "" else f"/{path.lstrip('/')}"


def _filtered_headers(raw_headers: list[tuple[bytes, bytes]]) -> list[tuple[bytes, bytes]]:
    return [
        (name, value)
        for name, value in raw_headers
        if name.lower() not in HOP_BY_HOP_HEADERS and name.lower() != b"host"
    ]


def reverse_proxy_maker(url_type: str, full_path: bool = False):
    client = _client_for_target(url_type)

    async def _reverse_proxy(request: Request):
        url = httpx.URL(
            path=_proxy_path(request, full_path),
            query=request.url.query.encode("utf-8"),
        )
        rp_req = client.build_request(
            request.method,
            url,
            headers=_filtered_headers(request.headers.raw),
            content=None if request.method in {"GET", "HEAD"} else request.stream(),
        )
        try:
            rp_resp = await client.send(rp_req, stream=True)
        except HTTPError as e:
            log.warning(f"Reverse proxy failed for {url_type}: {e}")
            return PlainTextResponse(
                content="The requested service not started yet or service started fail. This may cost a while when you first time startup\n请求的服务尚未启动或启动失败。若是第一次启动，可能需要等待一段时间后再刷新网页。",
                status_code=502
            )
        return StreamingResponse(
            rp_resp.aiter_raw(),
            status_code=rp_resp.status_code,
            headers=_filtered_headers(rp_resp.headers.raw),
            background=BackgroundTask(rp_resp.aclose),
        )

    return _reverse_proxy


async def proxy_ws_forward(ws_a: WebSocket, ws_b: websockets.WebSocketClientProtocol):
    while True:
        try:
            data = await ws_a.receive_text()
            await ws_b.send(data)
        except WebSocketDisconnect:
            break
        except Exception as e:
            log.error(f"Error when proxy data client -> backend: {e}")
            break


async def proxy_ws_reverse(ws_a: WebSocket, ws_b: websockets.WebSocketClientProtocol):
    while True:
        try:
            data = await ws_b.recv()
            await ws_a.send_text(data)
        except websockets.exceptions.ConnectionClosedOK as e:
            break
        except Exception as e:
            log.error(f"Error when proxy data backend -> client: {e}")
            break


@router.websocket("/proxy/tageditor/queue/join")
async def websocket_a(ws_a: WebSocket):
    # for temp use
    ws_b_uri = "ws://127.0.0.1:28001/queue/join"
    await ws_a.accept()
    async with websockets.connect(ws_b_uri, timeout=360, ping_timeout=None) as ws_b_client:
        fwd_task = asyncio.create_task(proxy_ws_forward(ws_a, ws_b_client))
        rev_task = asyncio.create_task(proxy_ws_reverse(ws_a, ws_b_client))
        await asyncio.gather(fwd_task, rev_task)

router.add_route("/proxy/tensorboard/{path:path}", reverse_proxy_maker("tensorboard"), PROXY_METHODS)
router.add_route("/font-roboto/{path:path}", reverse_proxy_maker("tensorboard", full_path=True), PROXY_METHODS)
router.add_route("/proxy/tageditor/{path:path}", reverse_proxy_maker("tageditor"), PROXY_METHODS)
