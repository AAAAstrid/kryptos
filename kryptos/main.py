"""FastAPI application entry."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from kryptos.api.assets import router as assets_router
from kryptos.api.characters import router as characters_router
from kryptos.api.config import router as config_router
from kryptos.api.messages import router as messages_router
from kryptos.api.roster import router as roster_router
from kryptos.api.sessions import router as sessions_router
from kryptos.api.templates import router as templates_router
from kryptos.api.world_book import router as world_book_router
from kryptos.config import DATA_DIR, HOST, PORT

ROOT_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = ROOT_DIR / "static"

app = FastAPI(title="Kryptos", description="Asymmetric-information multi-agent game runtime")

app.include_router(assets_router)
app.include_router(templates_router)
app.include_router(roster_router)
app.include_router(sessions_router)
app.include_router(characters_router)
app.include_router(messages_router)
app.include_router(world_book_router)
app.include_router(config_router)


@app.get("/settings")
def settings_page():
    return FileResponse(STATIC_DIR / "settings.html")


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


assets_dir = DATA_DIR / "assets"
assets_dir.mkdir(parents=True, exist_ok=True)

app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def run() -> None:
    import os
    import sys
    import uvicorn

    reload = os.getenv("KRYPTOS_RELOAD", "1") == "1"
    try:
        uvicorn.run(
            "kryptos.main:app",
            host=HOST,
            port=PORT,
            reload=reload,
        )
    except OSError as e:
        winerr = getattr(e, "winerror", None)
        if winerr == 10013 or "10013" in str(e) or "address already in use" in str(e).lower():
            print(f"\n无法启动：端口 {PORT} 已被占用（旧 Kryptos 可能仍在运行）。")
            print("请先关闭旧进程：")
            print(f"  netstat -ano | findstr :{PORT}")
            print(f"  taskkill /F /PID <上面看到的 PID>")
            print("或换端口启动：")
            print(f"  set KRYPTOS_PORT=8770")
            print(f"  python -m kryptos.main")
            sys.exit(1)
        raise


if __name__ == "__main__":
    run()
