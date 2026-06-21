"""Template API routes."""

from fastapi import APIRouter, HTTPException

from kryptos.games.registry import get_template, list_templates

router = APIRouter(prefix="/api/templates", tags=["templates"])


@router.get("")
def api_list_templates():
    return [t.model_dump() for t in list_templates()]


@router.get("/{template_id}")
def api_get_template(template_id: str):
    template = get_template(template_id)
    if not template:
        raise HTTPException(404, "Template not found")
    return template.model_dump()
