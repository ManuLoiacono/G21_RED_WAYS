# Team and directed movement slice

This is a pure Python 3.10+ development slice. It uses only the standard library and needs no HTTP server, browser, final Gale coordinates, or raster. All catalog values and directional speed coefficients are synthetic assumptions; see [PARAMETERS.md](PARAMETERS.md). No physiological consumption, fatigue, safety, or real robot performance is estimated.

From the repository root, run:

```sh
python -m engine.tests.test_catalog
python -m engine.tests.test_team
python -m engine.tests.test_movement
python -m engine.example
```

`engine.example` prints its complete input, per-participant edge decisions and durations, group edge maxima, and the sum of those maxima as JSON. Its `fixture: true` label is mandatory when displaying it. The functions `select_team`, `resolve_team`, `resolve_comparison`, `evaluate_edge`, and `evaluate_path` are exported from `engine`. `resolve_team` accepts the proposed v1 `team` object with `catalog_version`, `humans`, and `robots`; each participant has `profile_id`, required `payload_kg`, and optional `mission_overrides`.

An edge has separate source/target terrain and elevation evidence, a positive horizontal `run_m`, and a signed `rise_m`. A missing terrain class, missing essential elevation, or excluded cell blocks traversal. Positive rise is uphill; `reversed()` exchanges cells and negates rise. Each selected participant gets a permission decision, duration when permitted, structured reasons and evidence IDs. A group can use an edge only if everyone can; its duration is the maximum participant duration on that edge. Sum those maxima over a path. `evaluate_path` returns per-edge results and does not perform graph search.

Payload is additional assigned mass beyond baseline body, suit, and fixed equipment. It is checked against each participant's carrying limit, without a hidden speed penalty. `resolve_comparison` requires the same total payload in the proposal; removed participants' loads must be explicitly reassigned. Demographics, specialties, and descriptive traits add no movement effects.

The v0 JSON contracts remain untouched. The proposed v1 exchange in `docs/NAVIGATION_DESIGN.md` awaits P1/P3 review. The next P2-02 step is to consume these edge decisions in a directed eight-neighbor graph, with a conservative missing-data and diagonal policy agreed with P3. Search, mission budgets, daylight, effort, visibility, and real-data validation are outside this slice.
