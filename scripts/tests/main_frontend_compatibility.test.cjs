/** Transport checks import the actual browser consumer. Nothing is served to the UI. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../..');
const fromApp = createRequire(path.join(root, 'app/package.json'));
const ts = fromApp('typescript');

require.extensions['.ts'] = (module, filename) => {
  // Equivalent to the existing main test harness: only Vite's configuration syntax is adapted to Node.
  const source = fs.readFileSync(filename, 'utf8').replaceAll('import.meta.env.VITE_SERVICE_URL', 'undefined');
  module._compile(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText, filename);
};
global.location = { search: '?lang=en' };
global.document = { documentElement: {} };
const { loadMetadata, requestPlan } = require('../../app/src/mission/api.ts');
const { baselineRequest, RequestGate } = require('../../app/src/mission/request.ts');
const { isDraftResponse } = require('../../app/src/mission/validation.ts');
const real = process.env.SERVICE_TEST_URL || 'http://127.0.0.1:8000';
const synthetic = process.env.SYNTHETIC_SERVICE_TEST_URL || 'http://127.0.0.1:8001';

async function consumerAt(url, run) {
  const actualFetch = global.fetch;
  global.fetch = (input, options) => {
    const parsed = new URL(input);
    return actualFetch(url + parsed.pathname + parsed.search, options);
  };
  try { return await run(); } finally { global.fetch = actualFetch; }
}

async function metadata() {
  const result = await loadMetadata();
  assert.ok(result.ok, result.error);
  return result.data;
}

async function calculate(request) {
  const result = await requestPlan(request);
  assert.ok(result.ok, result.error);
  assert.ok(isDraftResponse(result.data));
  assert.deepEqual(result.data.request_echo, request);
  return result.data;
}

function noVerification(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.ok(!['observed', 'skill_summary', 'baseline_persistence'].includes(key), `Unexpected decision field ${key}`);
    noVerification(child);
  }
}

test('consumer request gate includes additive options and edit/revert invalidation', () => {
  const gate = new RequestGate();
  const request = JSON.parse(fs.readFileSync(path.join(root, 'service/examples/request.example.json'), 'utf8'));
  const submitted = gate.submit(request);
  const response = { request_echo: submitted };
  const edited = structuredClone(request);
  edited.options = { visibility: true, communication: { base_height_m: 7 } };
  assert.equal(gate.accepts(submitted, response, edited), false);
  gate.edit(); gate.edit();
  assert.equal(gate.accepts(submitted, response, request), false);
});

test('current consumer initializes synthetic startup and retains 800/2600', async () => {
  await consumerAt(synthetic, async () => {
    const data = await metadata();
    assert.equal(data.health.default_parcel.id, 'synthetic_metric_demo');
    assert.equal(data.parcel.fixture, true);
    const request = baselineRequest(data);
    const gate = new RequestGate();
    const submitted = gate.submit(request);
    const response = await calculate(submitted);
    assert.ok(gate.accepts(submitted, response, request));
    assert.equal(response.assessment, 'viable_model');
    assert.equal(response.alternatives[0].metrics.elapsed_s, 800);
    assert.equal(response.alternatives[0].metrics.reserved_total_s, 2600);
  });
});

test('current consumer calculates real daylight and retains safe forecast evidence', async () => {
  await consumerAt(real, async () => {
    const data = await metadata();
    assert.equal(data.health.default_parcel.id, 'gale_hirise_019698');
    const request = baselineRequest(data);
    assert.equal(request.scenario.as_of_utc, '2025-10-26T00:26:28Z');
    const response = await calculate(request);
    assert.equal(response.assessment, 'viable_model');
    assert.equal(response.environment.daylight.evidence_kind, 'derived');
    const metrics = response.alternatives[0].metrics;
    assert.ok(Math.abs(metrics.elapsed_s - 1718.7375283296024) < 1e-6);
    assert.equal(metrics.reserved_total_s - metrics.elapsed_s, request.mission.reserve_s);
    const forecasts = response.environment.decision_records.filter((r) => r.record.kind === 'forecast');
    assert.equal(forecasts.length, 4);
    const cutoff = Date.parse(request.scenario.as_of_utc);
    for (const { record, effective_available_at_utc } of forecasts) {
      assert.ok(Date.parse(effective_available_at_utc) <= cutoff);
      assert.ok(Date.parse(record.model_available_at_utc) <= cutoff);
      assert.ok(Date.parse(record.issued_at_utc) <= cutoff);
      assert.ok(record.quantiles.p10 <= record.quantiles.p50 && record.quantiles.p50 <= record.quantiles.p90);
      assert.ok(Date.parse(record.valid_from_utc) <= Date.parse(request.mission.departure_utc));
      assert.ok(Date.parse(record.valid_to_utc) >= Date.parse(response.environment.mission_target_interval.to_utc));
    }
    for (const { record } of response.environment.decision_records.filter((r) => r.record.kind === 'observation')) {
      assert.ok(Date.parse(record.observation_end_utc) <= cutoff);
    }
    noVerification(response.environment);
    const gate = new RequestGate();
    const submitted = gate.submit(request);
    const pending = await calculate(submitted);
    gate.edit(); gate.edit();
    assert.equal(gate.accepts(submitted, pending, request), false);
  });
});

test('actual consumer validator accepts boundary, late, missing and early backend cases', async () => {
  await consumerAt(real, async () => {
    const cases = [
      ['gale-replay-boundary', 'viable_model'], ['gale-replay-late', 'incompatible'],
      ['gale-replay-missing', 'insufficient_evidence'], ['gale-replay-early', 'viable_model'],
    ];
    for (const [name, expected] of cases) {
      const request = JSON.parse(fs.readFileSync(path.join(root, `service/examples/${name}.request.json`), 'utf8'));
      const response = await calculate(request);
      assert.equal(response.assessment, expected, name);
      if (name.endsWith('early')) assert.equal(response.environment.missing_forecast_variables.length, 4);
      if (name.endsWith('missing')) assert.equal(response.environment.daylight, null);
      if (name.endsWith('boundary')) assert.ok(Math.abs(response.alternatives[0].metrics.daylight_reserved_return_margin_s) <= 1e-6);
      noVerification(response.environment);
    }
  });
});

test('physical task +1 s is sent directly without reinterpreting main minute controls', async () => {
  await consumerAt(real, async () => {
    const request = baselineRequest(await metadata());
    const before = await calculate(request);
    request.mission.tasks[0].duration_s += 1;
    const after = await calculate(request);
    assert.equal(after.alternatives[0].metrics.elapsed_s - before.alternatives[0].metrics.elapsed_s, 1);
    assert.equal(after.alternatives[0].metrics.reserved_total_s - before.alternatives[0].metrics.reserved_total_s, 1);
    assert.deepEqual(after.movement_reuse, { graph: true, base_search: true });
    for (const margin of after.alternatives[0].metrics.participant_margins) {
      assert.equal(margin.margin_s, margin.max_sortie_s - after.alternatives[0].metrics.reserved_total_s);
    }
    const { fromHhMm, toHhMm } = require('../../app/src/mission/time.ts');
    assert.equal(fromHhMm('00:10'), 600);
    assert.equal(fromHhMm('00:10:01'), null);
    assert.equal(toHhMm(601), '00:10');
  });
});
