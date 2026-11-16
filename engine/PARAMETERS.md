# Synthetic team parameter register

Catalog version: `synthetic-team-v1`. Model version: `synthetic_constant_speed_v1`.

All values in the catalog are **scenario assumptions for deterministic development tests**. They are not validated astronaut, suit, or robot capabilities on Mars. No source presently supports adopting them as production defaults. The physical suitability of every value must be reviewed before a real route is described as operationally safe.

| Parameter | Scope | Unit | Current assumption | Limitation |
| --- | --- | --- | --- | --- |
| `flat_speed_m_s` | Per participant | m/s | Four humans: 0.40, 0.50, 0.35, 0.45; two robots: 0.30, 0.38 | Constant reference speed only; no terrain or load effect is claimed. |
| `max_ascent_deg`, `max_descent_deg` | Per participant, directed edge | degrees | Humans: 14/14, 15/15, 13/13, 17/17; robots: 8/8, 15/15 | Synthetic traversal gates, not injury, rollover, or hardware limits. The 15–17 degree profiles (Morgan, Jordan, Transport Rover) let the Gale terrain around Nevado Sajama connect: references are the Mark III suit test at 30 % grade (~16.7 degrees, Earth) and Curiosity's own traverse of these stops; not Mars operational limits. |
| `carrying_limit_kg` | Additional assigned payload per participant | kg | Humans: 10, 9, 14, 8; robots: 20, 40 | Excludes body mass, suit and fixed equipment. No load-to-speed model. |
| `max_sortie_s` | Complete sortie per participant | s | Humans: 21600; robots: 18000 | Planning availability only; not an oxygen, battery, or fatigue estimate. |
| Directional speed coefficients | Synthetic movement strategies | per degree | Human ascent 0.03, descent 0.01; robot ascent 0.02, descent 0.04 | `speed_m_s = flat_speed_m_s / (1 + coefficient * abs(signed_grade_deg))`; assumed response, not measured performance. |
| `age_years`, `sex`, `height_m`, `body_mass_kg` | Fictional human identity | years, category, m, kg | Values in `catalog.py` | Descriptive only; no automatic physiological effects. |
| `specialty`, `traits`, `avatar_ref` | Fictional identity and UI reference | text | Values in `catalog.py` | Descriptive only. Avatar keys do not assert that image assets exist. |

The catalog separates fixed identity from operational defaults. Selection returns references to frozen entries. Allowed mission overrides are `flat_speed_m_s`, `max_ascent_deg`, `max_descent_deg`, `carrying_limit_kg`, and `max_sortie_s`. The movement strategies evaluate directed grade separately from cell terrain and exclusion. A payload is checked against carrying capacity but does not change speed. The complete-mission evaluator now checks each original `max_sortie_s` against outbound plus sequential tasks plus return plus required reserve; this is planning availability, not an oxygen or battery model.

Template version `synthetic-mission-templates-v1` is defined only in `engine/templates.py` and exported by `export_mission_templates()`. It owns the four proposed English IDs and editable task/budget/reserve defaults. Every such number is an arbitrary development scenario assumption, not a sourced scientific procedure duration or a physical threshold. Consumers must retain the assumption label and review the shared schema/default adoption with P1/P3. The absolute 1e-6-second comparison tolerance in `engine/mission.py` is numerical policy only. No weather-to-speed effect, hourly weather, physiological threshold, radiation limit or DONKI veto is adopted.
