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
