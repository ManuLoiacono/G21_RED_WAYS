# Synthetic team parameter register

Catalog version: `synthetic-team-v1`. Model version: `synthetic_constant_speed_v1`.

All values in the catalog are **scenario assumptions for deterministic development tests**. They are not validated astronaut, suit, or robot capabilities on Mars. No source presently supports adopting them as production defaults. The physical suitability of every value must be reviewed before a real route is described as operationally safe.

| Parameter | Scope | Unit | Current assumption | Limitation |
| --- | --- | --- | --- | --- |
| `flat_speed_m_s` | Per participant | m/s | Four humans: 0.40, 0.50, 0.35, 0.45; two robots: 0.30, 0.38 | Constant reference speed only; no terrain or load effect is claimed. |
| `max_ascent_deg`, `max_descent_deg` | Per participant, directed edge | degrees | Humans: 14/14, 15/15, 13/13, 16/16; robots: 8/8, 10/10 | Synthetic traversal gates, not injury, rollover, or hardware limits. |
| `carrying_limit_kg` | Additional assigned payload per participant | kg | Humans: 10, 9, 14, 8; robots: 20, 40 | Excludes body mass, suit and fixed equipment. No load-to-speed model. |
| `max_sortie_s` | Complete sortie per participant | s | Humans: 21600; robots: 18000 | Planning availability only; not an oxygen, battery, or fatigue estimate. |
| `age_years`, `sex`, `height_m`, `body_mass_kg` | Fictional human identity | years, category, m, kg | Values in `catalog.py` | Descriptive only; no automatic physiological effects. |
| `specialty`, `traits`, `avatar_ref` | Fictional identity and UI reference | text | Values in `catalog.py` | Descriptive only. Avatar keys do not assert that image assets exist. |

The catalog separates fixed identity from operational defaults. Selection returns references to frozen entries. Mission overrides and the effective movement model are added in the next increments. Template IDs proposed for shared v1 exchange are `geological_observation`, `topographic_exploration`, `reconnaissance`, and `environmental_measurement`; task-duration defaults and a shared schema remain pending P1/P3 review.
