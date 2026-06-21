"""Uploaded image assets."""

from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from kryptos.config import DATA_DIR

router = APIRouter(prefix="/api/assets", tags=["assets"])

ASSETS_DIR = DATA_DIR / "assets"
MAX_BYTES = 5 * 1024 * 1024
MAX_FONT_BYTES = 10 * 1024 * 1024
ALLOWED = {"image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"}
ALLOWED_FONTS = {
    "font/woff2",
    "font/woff",
    "font/ttf",
    "font/otf",
    "application/font-woff2",
    "application/font-woff",
    "application/x-font-woff",
    "application/x-font-ttf",
    "application/x-font-otf",
    "application/vnd.ms-fontobject",
    "application/octet-stream",
}
EXT_TO_MIME = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
}
FONT_EXT_TO_MIME = {
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".ttf": "font/ttf",
    ".otf": "font/otf",
}


def _resolve_content_type(file: UploadFile, ext_map: dict[str, str], allowed: set[str]) -> str:
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if content_type in allowed:
        return content_type
    name = (file.filename or "").lower()
    for ext, mime in ext_map.items():
        if name.endswith(ext):
            return mime
    return content_type


def _resolve_image_type(file: UploadFile) -> str:
    return _resolve_content_type(file, EXT_TO_MIME, ALLOWED)


def _resolve_font_type(file: UploadFile) -> str:
    return _resolve_content_type(file, FONT_EXT_TO_MIME, ALLOWED_FONTS)


def _ext_from_font_mime(content_type: str) -> str:
    if "woff2" in content_type:
        return "woff2"
    if "woff" in content_type:
        return "woff"
    if "otf" in content_type or "opentype" in content_type:
        return "otf"
    return "ttf"


@router.post("")
async def upload_asset(file: UploadFile = File(...)):
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    content_type = _resolve_image_type(file)
    if content_type not in ALLOWED:
        raise HTTPException(400, "仅支持 JPEG / PNG / GIF / WebP / SVG 图片")

    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(400, "图片不能超过 5MB")
    if not data:
        raise HTTPException(400, "空文件")

    ext = content_type.split("/", 1)[-1]
    if ext == "jpeg":
        ext = "jpg"
    if ext == "svg+xml":
        ext = "svg"

    name = f"{uuid.uuid4().hex[:12]}.{ext}"
    path = Path(ASSETS_DIR) / name
    path.write_bytes(data)

    return {"url": f"/assets/{name}"}


@router.post("/font")
async def upload_font(file: UploadFile = File(...)):
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    content_type = _resolve_font_type(file)
    name_lower = (file.filename or "").lower()
    if content_type not in ALLOWED_FONTS:
        if not any(name_lower.endswith(ext) for ext in FONT_EXT_TO_MIME):
            raise HTTPException(400, "仅支持 WOFF2 / WOFF / TTF / OTF 字体文件")

    data = await file.read()
    if len(data) > MAX_FONT_BYTES:
        raise HTTPException(400, "字体文件不能超过 10MB")
    if not data:
        raise HTTPException(400, "空文件")

    ext = _ext_from_font_mime(content_type)
    for suffix in FONT_EXT_TO_MIME:
        if name_lower.endswith(suffix):
            ext = suffix[1:]
            break

    name = f"{uuid.uuid4().hex[:12]}.{ext}"
    path = Path(ASSETS_DIR) / name
    path.write_bytes(data)

    return {"url": f"/assets/{name}", "kind": "font"}
