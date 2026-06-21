"""LLM config API routes."""

from pydantic import BaseModel

from fastapi import APIRouter, HTTPException

from kryptos.config import llm_config
from kryptos.llm.client import test_connection

router = APIRouter(prefix="/api/config", tags=["config"])


class LLMConfigUpdate(BaseModel):
    api_key: str | None = None
    api_base: str | None = None
    model: str | None = None
    max_tokens: int | None = None
    reply_length: str | None = None


@router.get("/llm")
def api_get_llm_config():
    return llm_config.to_dict(mask_key=True)


@router.patch("/llm")
def api_update_llm_config(body: LLMConfigUpdate):
    update_key = body.api_key is not None and body.api_key != ""
    llm_config.save(
        api_key=body.api_key if update_key else None,
        api_base=body.api_base,
        model=body.model,
        max_tokens=body.max_tokens,
        reply_length=body.reply_length,
        update_key=update_key,
    )
    return llm_config.to_dict(mask_key=True)


@router.post("/llm/test")
async def api_test_llm_config():
    if not llm_config.api_key:
        raise HTTPException(status_code=400, detail="请先配置 API Key")
    config = llm_config.resolve()
    result = await test_connection(config)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("error", "连接失败"))
    return result
