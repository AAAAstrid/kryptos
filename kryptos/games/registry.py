"""Game template registry."""

from kryptos.games.class_trial_lite import CLASS_TRIAL_LITE
from kryptos.games.prisoners_dilemma import PRISONERS_DILEMMA
from kryptos.models.template import GameTemplate

_TEMPLATES: dict[str, GameTemplate] = {
    PRISONERS_DILEMMA.id: PRISONERS_DILEMMA,
    CLASS_TRIAL_LITE.id: CLASS_TRIAL_LITE,
}


def list_templates() -> list[GameTemplate]:
    return list(_TEMPLATES.values())


def get_template(template_id: str) -> GameTemplate | None:
    return _TEMPLATES.get(template_id)
