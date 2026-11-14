# P2-01 proposed exchange additions for P1/P3 review

Status: **draft**, not an accepted v1 contract. Existing `contracts/` v0 files and the working app are unchanged.

## Team request

The proposed `team` object in `docs/NAVIGATION_DESIGN.md` is the input to `resolve_team`: `catalog_version`, `humans`, and `robots`. Each selected entry has a `profile_id`, required `payload_kg`, and optional `mission_overrides`. IDs are immutable catalog identities; permitted overrides are `flat_speed_m_s`, `max_ascent_deg`, `max_descent_deg`, `carrying_limit_kg`, and `max_sortie_s`. Every numeric field is finite, booleans are not numbers, and field suffixes are the accepted units. Unknown fields and alternative unit names are rejected. A comparison requires the same total payload with explicit reassignment.

The catalog currently contains synthetic development presets only. P1 should consume a single published catalog representation rather than copying these Python values into TypeScript. The service may later expose a versioned catalog endpoint or package a generated JSON snapshot; the delivery mechanism and avatar assets require review. Four English template IDs are proposed in the design document, but their task defaults have not been agreed.

## Directed edge input and result

`DirectedMetricEdge` takes source and target `CellTerrain` records (`terrain_code`, `elevation_m`, `excluded`), positive horizontal `run_m`, and signed `rise_m`. P3 must define the cell-center geometry, terrain code vocabulary, mask precedence, and conservative summary rule. P2-02 will separately prevent diagonal corner cutting. Missing essential elevation or terrain blocks an edge; exclusion blocks it even when the terrain summary otherwise looks benign. Direction reversal negates rise.

`evaluate_edge` returns `allowed`, `duration_s` or null, `participant_results`, `limiting_participant_ids`, and structured reasons (`code`, `path`, `message`, optional `participant_id`). Each participant result includes `evidence_ids`. Search may use `duration_s` only for allowed edges; it is strictly positive. The group result is the intersection of permissions and the maximum participant duration on that edge. A path duration is the sum of those maxima.

The current movement strategies are explicitly assumed formulas. Carrying capacity is validated, but load-dependent speed, energy, fatigue, oxygen, battery and relative effort are **not evaluated**. If P1 displays a capacity or speed value, it must retain the synthetic assumption label. `max_sortie_s` exists in the catalog but is not yet used for mission duration checks.

## Open integration semantics

- P1/P3 must accept or revise names, enum values, catalog delivery and result structure before a shared v1 schema replaces v0.
- P3 must specify whether `terrain_code` is categorical or has a conservative exclusion classification; this slice treats a present code as evidence only and applies no terrain speed effect.
- P3 must supply or define a normalized physical-second daylight interval. Local clock strings cannot be added directly to travel seconds. Participant `max_sortie_s` covers outbound, sequential tasks, and return, with reserve checked as margin in a later mission evaluator.
- Avatar references are stable keys without image assets yet. No identity attribute automatically changes a capability or task duration.
