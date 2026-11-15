const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

// Compile the actual browser-independent consumer modules, without a second implementation.
require.extensions[".ts"] = (module, filename) => {
  // Vite normally injects this variable; Node transport checks use the default URL.
  const source = fs.readFileSync(filename, "utf8").replaceAll("import.meta.env.VITE_SERVICE_URL", "undefined");
  module._compile(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText, filename);
};
const { RequestGate, baselineRequest } = require("../src/mission/request.ts");
const { isDraftResponse, isHealth, isParcel, isCatalogs } = require("../src/mission/validation.ts");
const service = process.env.SERVICE_TEST_URL;

async function post(request) {
  const response = await fetch(service + "/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.ok(isDraftResponse(result));
  return result;
}

test("actual HTTP metadata and baseline calculation", { skip: !service }, async () => {
  const get = async (path) => {
    const response = await fetch(service + path);
    assert.equal(response.status, 200);
    return response.json();
  };
  const health = await get("/health");
  const catalogs = await get("/catalogs");
  const parcel = await get("/parcel?id=synthetic_metric_demo&version=v1");
  assert.ok(isHealth(health));
  assert.ok(isCatalogs(catalogs));
  assert.ok(isParcel(parcel));
  const state = baselineRequest({ health, catalogs, parcel });
  const gate = new RequestGate();
  const request = gate.submit(state);
  const response = await fetch(service + "/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.ok(isDraftResponse(result));
  assert.equal(result.alternatives[0].metrics.elapsed_s, 800);
  assert.equal(result.alternatives[0].metrics.reserved_total_s, 2600);
  assert.ok(gate.accepts(request, result, state));
  const invalid = structuredClone(result);
  invalid.alternatives[0].outbound.xy_m[0][0] = null;
  assert.equal(isDraftResponse(invalid), false);
  gate.edit();
  assert.equal(gate.accepts(request, result, state), false);
});

test("reverted edits, newer submits and mismatched echoes reject late responses", () => {
  const state = { request_id: "session", revision: 0, mission: { tasks: [{ duration_s: 600 }] } };
  const gate = new RequestGate();
  const old = gate.submit(state);
  assert.ok(gate.accepts(old, { request_echo: old }, state));
  const newer = gate.submit(state);
  assert.equal(gate.accepts(old, { request_echo: old }, state), false);
  assert.ok(gate.accepts(newer, { request_echo: newer }, state));
  assert.equal(gate.accepts(newer, { request_echo: { ...newer, revision: 3 } }, state), false);
  gate.edit(); gate.edit();
  assert.equal(gate.accepts(newer, { request_echo: newer }, state), false);
});

test("metadata selects the exact advertised default and keeps synthetic discovery", { skip: !service }, async () => {
  browserLabels();
  const { loadMetadata, loadParcel } = require("../src/mission/api.ts");
  const originalFetch = global.fetch;
  try {
    global.fetch = (url, options) => {
      const parsed = new URL(url);
      return originalFetch(service + parsed.pathname + parsed.search, options);
    };
    const result = await loadMetadata();
    assert.ok(result.ok, result.error);
    assert.deepEqual({ id: result.data.parcel.id, version: result.data.parcel.version }, result.data.health.default_parcel);
    const synthetic = await loadParcel("synthetic_metric_demo", "v1");
    assert.ok(synthetic.ok);
    assert.equal(synthetic.data.geographic_adapter, null);
    const request = baselineRequest({ ...result.data, parcel: synthetic.data });
    assert.equal((await post(request)).alternatives[0].metrics.elapsed_s, 800);
    assert.equal((await loadParcel("synthetic_metric_demo", "unregistered-version")).ok, false);
  } finally { global.fetch = originalFetch; }
});

test("calculated task, participant and daylight boundaries preserve draft semantics", { skip: !service }, async () => {
  const baseline = require("../../service/examples/request.example.json");
  const cases = [
    ["baseline", () => {}, "viable_model", 800, 2600, 2300],
    ["task-edit", (r) => { r.mission.tasks[0].duration_s += 1; }, "viable_model", 801, 2601, 2299],
    ["participant-limit", (r) => { r.team.robots[0].mission_overrides = { max_sortie_s: 2599 }; }, "incompatible", 800, 2600, 2300],
    ["exact-daylight", (r) => { r.mission.departure_utc = "2025-10-25T12:38:20Z"; }, "viable_model", 800, 2600, 0],
    ["missing-daylight", (r) => { r.scenario.id = "synthetic_missing_daylight"; }, "insufficient_evidence", 800, 2600, null],
  ];
  for (const [name, edit, assessment, elapsed, total, daylight] of cases) {
    const request = structuredClone(baseline);
    request.request_id = name; request.revision = 42; edit(request);
    const result = await post(request);
    assert.deepEqual(result.request_echo, request);
    assert.equal(result.assessment, assessment);
    assert.equal(result.search_status, "complete");
    assert.equal(result.calculation_origin, "engine");
    assert.equal(result.input_provenance.fixture, true);
    assert.equal(result.alternatives.length, 1);
    const m = result.alternatives[0].metrics;
    assert.equal(m.elapsed_s, elapsed); assert.equal(m.reserved_total_s, total);
    assert.equal(m.daylight_reserved_return_margin_s, daylight);
    if (name === "participant-limit") assert.equal(m.participant_margins.find((p) => p.participant_id === "support_rover").margin_s, -1);
    if (name === "missing-daylight") {
      assert.ok(result.environment.missing_required.length);
      assert.equal(result.alternatives[0].checks.filter((c) => c.status === "missing_evidence").length, 2);
    }
    const invalid = structuredClone(result);
    invalid.alternatives[0].metrics.reserve_s = null;
    assert.equal(isDraftResponse(invalid), false);
  }
});

test("central roster and allowlisted overrides are preserved, with zero or two robots", { skip: !service }, async () => {
  const catalogs = await (await fetch(service + "/catalogs")).json();
  const request = structuredClone(require("../../service/examples/request.example.json"));
  request.team.humans = catalogs.catalog.entries.filter((e) => e.kind === "human").map((e) => ({ profile_id: e.identity.profile_id, payload_kg: 0 }));
  request.team.robots = catalogs.catalog.entries.filter((e) => e.kind === "robot").map((e) => ({ profile_id: e.identity.profile_id, payload_kg: 0 }));
  request.team.humans[0] = { ...request.team.humans[0], payload_kg: 2, mission_overrides: { flat_speed_m_s: 0.6, max_ascent_deg: 20, max_descent_deg: 19, carrying_limit_kg: 15, max_sortie_s: 20000 } };
  const result = await post(request);
  assert.equal(result.resolved_team.length, 6);
  assert.deepEqual(result.request_echo.team, request.team);
  for (const [key, value] of Object.entries(request.team.humans[0].mission_overrides)) assert.equal(result.resolved_team[0].parameters[key], value);
  assert.equal(result.resolved_team[0].payload_kg, 2);
  request.team.robots = [];
  assert.equal((await post(request)).resolved_team.length, 4);
});

test("unavailable and same-cell legs retain nullability and independent search status", { skip: !service }, async () => {
  const request = structuredClone(require("../../service/examples/request.example.json"));
  request.destination = structuredClone(request.origin);
  const sameCell = await post(request);
  assert.equal(sameCell.alternatives[0].outbound.xy_m.length, 1);
  assert.equal(sameCell.alternatives[0].outbound.duration_s, 0);
  // An intentionally incomplete adapter payload exercises the frontend's nullable contract.
  const incomplete = structuredClone(sameCell);
  incomplete.assessment = null; incomplete.search_status = "search_inconclusive"; incomplete.status = "search_inconclusive";
  const a = incomplete.alternatives[0];
  a.assessment = null; a.search_status = "search_inconclusive";
  a.return = { status: "search_inconclusive", reason: "search_interrupted", cells: [], xy_m: [], duration_s: null, search_cost_s: null, horizontal_distance_m: null, ascent_m: null, descent_m: null };
  for (const key of ["elapsed_s", "reserved_total_s", "return_s", "mission_margin_s", "temporal_budget_limiting_margin_s", "daylight_reserved_return_margin_s", "estimated_return_offset_s", "reserved_deadline_offset_s"]) a.metrics[key] = null;
  a.metrics.unavailable_totals_reason = "movement_duration_unavailable";
  a.metrics.participant_margins.forEach((p) => { p.margin_s = null; });
  assert.ok(isDraftResponse(incomplete));
  incomplete.assessment = "incompatible"; incomplete.status = "incompatible"; a.assessment = "incompatible";
  assert.ok(isDraftResponse(incomplete));
  a.return.xy_m = [[0, 0]];
  assert.equal(isDraftResponse(incomplete), false);
});

function browserLabels() {
  // Minimal label context for pure render/transport checks; this is not a browser mock.
  global.location = { search: "?lang=en" };
  global.document = { documentElement: {} };
}

test("transport failures, HTTP errors and malformed success never produce a plan", async () => {
  browserLabels();
  const { requestPlan } = require("../src/mission/api.ts");
  const originalFetch = global.fetch;
  const request = require("../../service/examples/request.example.json");
  try {
    global.fetch = async () => { throw new TypeError("Connection refused"); };
    let result = await requestPlan(request);
    assert.equal(result.ok, false);
    assert.match(result.error, /Could not reach/);
    assert.equal(result.data, undefined);
    for (const status of [409, 422, 500]) {
      global.fetch = async () => new Response(JSON.stringify({ error: { code: "test_failure", path: "team", message: "Test error" } }), { status });
      result = await requestPlan(request);
      assert.equal(result.ok, false);
      assert.match(result.error, /test_failure.*team.*Test error/);
    }
    global.fetch = async () => new Response("not json");
    assert.equal((await requestPlan(request)).ok, false);
    global.fetch = async () => new Response(JSON.stringify({ schema_version: 0, alternatives: [] }));
    assert.equal((await requestPlan(request)).ok, false);
  } finally { global.fetch = originalFetch; }
});

test("metric preview uses equal scale, real vertices and empty/same-cell semantics", { skip: !service }, async () => {
  browserLabels();
  const { metricProjection, renderMetricPreview } = require("../src/mission/routes.ts");
  const p = metricProjection([[0, 0], [30, 30]]).project;
  assert.equal(p([30, 0])[0] - p([0, 0])[0], p([0, 0])[1] - p([0, 30])[1]);
  assert.deepEqual(metricProjection([[0, 0]]).project([0, 0]), [160, 100]);
  const result = await post(require("../../service/examples/request.example.json"));
  const a = result.alternatives[0];
  let svg = renderMetricPreview(a, result.locations, 0);
  assert.match(svg, /Local metric preview/);
  assert.match(svg, /data-coordinate-frame="parcel_metric"/);
  assert.match(svg, /data-leg="outbound"/);
  assert.match(svg, /data-leg="return"/);
  assert.match(svg, /stroke-dasharray="7 5"/);
  a.return.xy_m = [];
  svg = renderMetricPreview(a, result.locations, 0);
  assert.doesNotMatch(svg, /data-leg="return"/);
  assert.match(svg, /returned no geometry/);
  a.outbound.xy_m = [[0, 0]];
  svg = renderMetricPreview(a, result.locations, 0);
  assert.match(svg, /<circle data-leg="outbound"/);
  const invalid = structuredClone(result);
  invalid.environment.clock_mapping.offset_at_epoch_s = Infinity;
  assert.equal(isDraftResponse(invalid), false);
});

test("actual HTTP no-return and interrupted-search payloads validate and render", { skip: !process.env.P2_TEST_PYTHON }, () => {
  browserLabels();
  const { spawnSync } = require("node:child_process");
  const path = require("node:path");
  const run = spawnSync(process.env.P2_TEST_PYTHON, ["-m", "app.tests.edge_cases"], {
    cwd: path.resolve(__dirname, "../.."), encoding: "utf8", timeout: 15000,
  });
  assert.equal(run.status, 0, run.stderr || run.error?.message);
  const cases = JSON.parse(run.stdout);
  const { renderMetricPreview } = require("../src/mission/routes.ts");
  for (const result of Object.values(cases)) {
    assert.ok(isDraftResponse(result));
    const a = result.alternatives[0];
    assert.equal(a.return.xy_m.length, 0);
    assert.equal(typeof a.return.reason, "string");
    assert.equal(a.metrics.reserved_total_s, null);
    const svg = renderMetricPreview(a, result.locations, 0);
    assert.doesNotMatch(svg, /data-leg="return"/);
    assert.match(svg, /returned no geometry/);
  }
  assert.equal(cases.no_return.assessment, "incompatible");
  assert.equal(cases.no_return.search_status, "complete");
  assert.equal(cases.inconclusive.assessment, null);
  assert.equal(cases.inconclusive.search_status, "search_inconclusive");
});

test("three Gale controls preserve source latitude and apply the registered scene shift once", () => {
  const { metricToGeographic, geographicToMetric, metricToScene, sceneToMetric } = require("../src/mission/geography.ts");
  const manifest = require("../../data/processed/gale/analytical/manifest.json");
  const a = manifest.geographic_adapter;
  for (const [row, col] of [[731, 1288], [790, 1317], [760, 1346]]) {
    const xy = [manifest.grid.origin_center_xy_m[0] + col*manifest.grid.spacing_m[1],
      manifest.grid.origin_center_xy_m[1] - row*manifest.grid.spacing_m[0]];
    const geographic = metricToGeographic(xy, a);
    const scene = metricToScene(xy, a);
    const back = sceneToMetric(scene, a);
    assert.ok(Math.hypot(back[0]-xy[0], back[1]-xy[1]) < 1e-7);
    const native = geographicToMetric(geographic, a);
    assert.ok(Math.hypot(native[0]-xy[0], native[1]-xy[1]) < 1e-7);
    assert.ok(Math.abs((scene[0]-geographic[0])*Math.PI/180*a.radius_m - a.horizontal_shift_m.east) < 1e-7);
    assert.ok(Math.abs((scene[1]-geographic[1])*Math.PI/180*a.radius_m - a.horizontal_shift_m.north) < 1e-7);
    assert.ok(Math.abs(geographic[1]+4.826) < .01, "No additional planetocentric/geodetic conversion");
  }
});

test("real replay forecast records validate, render and preserve model uncertainty", { skip: !service }, async () => {
  browserLabels();
  const request = structuredClone(require("../../service/examples/gale-replay.request.json"));
  const result = await post(request);
  const { renderEnvironment } = require("../src/mission/environment.ts");
  const html = renderEnvironment(result.environment);
  assert.equal(result.assessment, "viable_model");
  assert.match(html, /Derived geometric daylight/);
  assert.match(html, /Historical model predictions \(4\)/);
  assert.match(html, /p10/); assert.match(html, /p90/);
  assert.match(html, /A1_lgbm_norm_v1/); assert.match(html, /microgray\/day/);
  assert.match(html, /Retrospective reconstruction/);
  const invalid = structuredClone(result);
  const forecast = invalid.environment.decision_records.find((r) => r.record.kind === "forecast").record;
  forecast.quantiles.p10 = forecast.quantiles.p90 + 1;
  assert.equal(isDraftResponse(invalid), false);
  forecast.quantiles.p10 = null;
  assert.ok(isDraftResponse(invalid));
  assert.match(renderEnvironment(invalid.environment), /Unavailable/);
  forecast.observed = 99999;
  assert.equal(isDraftResponse(invalid), false);
});

test("real replay missing daylight and earlier missing forecasts remain distinct", { skip: !service }, async () => {
  browserLabels();
  const { renderEnvironment } = require("../src/mission/environment.ts");
  const request = structuredClone(require("../../service/examples/gale-replay.request.json"));
  request.scenario.id = "gale_historical_missing_daylight";
  const missing = await post(request);
  assert.equal(missing.assessment, "insufficient_evidence");
  assert.match(renderEnvironment(missing.environment), /Required daylight evidence is missing/);
  request.scenario.id = "gale_historical_replay";
  request.scenario.as_of_utc = "2025-10-25T03:26:03Z";
  request.mission.departure_utc = request.scenario.as_of_utc;
  const early = await post(request);
  assert.equal(early.assessment, "viable_model");
  assert.equal(early.environment.missing_forecast_variables.length, 4);
  assert.match(renderEnvironment(early.environment), /No eligible forecast/);
  assert.equal(early.movement_reuse.base_search, true);
});
