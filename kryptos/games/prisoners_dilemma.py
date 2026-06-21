"""Prisoner's Dilemma game template."""

from kryptos.models.message import Visibility
from kryptos.models.template import ActionSpec, GameTemplate, PhaseSpec

PRISONERS_DILEMMA = GameTemplate(
    id="prisoners_dilemma",
    name="囚徒困境",
    description="多轮合作/背叛博弈。私下选择，公开讨论，可撒谎。",
    min_players=2,
    max_players=8,
    phases=[
        PhaseSpec(
            id="private_choice",
            name="私下选择",
            description="选择合作或背叛，对方不可见",
            turn_mode="simultaneous",
            allowed_actions=[
                ActionSpec(
                    type="choose",
                    label="合作/背叛",
                    visibility=Visibility.RESTRICTED,
                    viewers_mode="self_and_referee",
                    required=True,
                )
            ],
            exit_condition="all_submitted",
        ),
        PhaseSpec(
            id="revelation",
            name="结果揭晓",
            description="裁判公开本轮选择与得分",
            turn_mode="referee_only",
            allowed_actions=[
                ActionSpec(type="reveal", label="公布结果", visibility=Visibility.PUBLIC)
            ],
        ),
        PhaseSpec(
            id="debrief",
            name="公开讨论",
            description="可撒谎、可试探，讨论下一轮策略",
            turn_mode="free",
            allowed_actions=[
                ActionSpec(type="public_speak", label="公开发言", visibility=Visibility.PUBLIC)
            ],
            max_rounds=1,
        ),
    ],
    initial_state={"scores": {}, "round": 1, "max_rounds": 5},
    referee_system_prompt="你是博弈实验主持者，公正揭晓结果，不泄露未公开的选择。",
    player_system_prompt="你在信息不对称博弈中。你可以说谎。不要引用你看不到的私密消息。",
)
