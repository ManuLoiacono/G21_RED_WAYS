const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

// Compile the actual browser-independent consumer modules, without a second implementation.
require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
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
  a.return = { status: "search_inconclusive", reason: null, cells: [], xy_m: [], duration_s: null, search_cost_s: null, horizontal_distance_m: null, ascent_m: null, descent_m: null };
  for (const key of ["elapsed_s", "reserved_total_s", "return_s", "mission_margin_s", "temporal_budget_limiting_margin_s", "daylight_reserved_return_margin_s", "estimated_return_offset_s", "reserved_deadline_offset_s"]) a.metrics[key] = null;
  a.metrics.unavailable_totals_reason = "movement_duration_unavailable";
  a.metrics.participant_margins.forEach((p) => { p.margin_s = null; });
  assert.ok(isDraftResponse(incomplete));
  incomplete.assessment = "incompatible"; incomplete.status = "incompatible"; a.assessment = "incompatible";
  assert.ok(isDraftResponse(incomplete));
  a.return.xy_m = [[0, 0]];
  assert.equal(isDraftResponse(incomplete), false);
});
