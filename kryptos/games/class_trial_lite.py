"""Class trial lite game template."""

from kryptos.models.message import Visibility
from kryptos.models.template import ActionSpec, GameTemplate, PhaseSpec

CLASS_TRIAL_LITE = GameTemplate(
    id="class_trial_lite",
    name="班级审判·简化",
    description="弹丸论破式：调查获线索、公开辩论、私下投票、裁决。",
    min_players=3,
    max_players=8,
    phases=[
        PhaseSpec(
            id="investigation",
            name="调查",
            description="不同角色获得不同线索",
            turn_mode="referee_only",
            allowed_actions=[
                ActionSpec(type="clue", label="分发线索", visibility=Visibility.RESTRICTED)
            ],
        ),
        PhaseSpec(
            id="opening",
            name="开场陈述",
            description="每人公开陈述立场",
            turn_mode="sequential",
            allowed_actions=[
                ActionSpec(type="public_speak", label="公开发言", visibility=Visibility.PUBLIC)
            ],
        ),
        PhaseSpec(
            id="debate",
            name="自由辩论",
            description="可质疑、反驳、撒谎",
            turn_mode="free",
            allowed_actions=[
                ActionSpec(type="public_speak", label="公开发言", visibility=Visibility.PUBLIC),
                ActionSpec(
                    type="whisper",
                    label="私下结盟",
                    visibility=Visibility.RESTRICTED,
                    viewers_mode="custom",
                ),
            ],
        ),
        PhaseSpec(
            id="accusation",
            name="指认投票",
            description="私下投票，再公开票数",
            turn_mode="simultaneous",
            allowed_actions=[
                ActionSpec(
                    type="vote",
                    label="投票",
                    visibility=Visibility.RESTRICTED,
                    viewers_mode="self_and_referee",
                    required=True,
                )
            ],
        ),
        PhaseSpec(
            id="verdict",
            name="裁决",
            turn_mode="referee_only",
            allowed_actions=[
                ActionSpec(type="reveal", label="公布裁决", visibility=Visibility.PUBLIC)
            ],
        ),
    ],
    initial_state={"accused": None, "votes": {}},
    referee_system_prompt="你是班级审判主持。分发线索、维持秩序、最终揭晓投票。",
    player_system_prompt="你掌握的信息仅限于你能看到的消息。可以撒谎，但逻辑要自洽。",
)
