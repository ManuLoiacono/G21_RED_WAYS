"""The single source of editable, explicitly synthetic mission template defaults."""

from dataclasses import asdict, dataclass

from .mission import MissionTask


TEMPLATE_VERSION = "synthetic-mission-templates-v1"


@dataclass(frozen=True)
class MissionTemplate:
    id: str
    name: str
    tasks: tuple[MissionTask, ...]
    time_budget_s: float
    reserve_s: float


MISSION_TEMPLATES = (
    MissionTemplate("geological_observation", "Geological observation",
                    (MissionTask("context_photography", 600.0), MissionTask("outcrop_observation", 900.0)), 21600.0, 1800.0),
    MissionTemplate("topographic_exploration", "Topographic exploration",
                    (MissionTask("terrain_survey", 1200.0),), 21600.0, 1800.0),
    MissionTemplate("reconnaissance", "Reconnaissance",
                    (MissionTask("visual_reconnaissance", 600.0),), 21600.0, 1800.0),
    MissionTemplate("environmental_measurement", "Environmental measurement",
                    (MissionTask("environment_recording", 900.0),), 21600.0, 1800.0),
)


def export_mission_templates() -> dict:
    """Export fresh JSON-compatible definitions for consumers; no second defaults."""
    return {
        "version": TEMPLATE_VERSION,
        "fixture": True,
        "evidence_kind": "assumed",
        "assumption": "Editable development scenarios, not measured scientific task times or operational limits.",
        "editable_fields": ["tasks", "time_budget_s", "reserve_s"],
        "templates": [asdict(template) for template in MISSION_TEMPLATES],
    }
