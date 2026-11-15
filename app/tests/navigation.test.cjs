const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8').replaceAll('import.meta.env.VITE_SERVICE_URL', 'undefined');
  module._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
};
global.location = { search: '?lang=en' };
global.document = { documentElement: {} };
const { isDraftResponse, isRecommendations } = require('../src/mission/validation.ts');
const { RequestGate, canApplyProposal } = require('../src/mission/request.ts');
const service = process.env.SERVICE_TEST_URL;
const real = () => JSON.parse(fs.readFileSync(require('node:path').join(__dirname, '../../service/examples/gale-comparison.request.json'), 'utf8'));
async function post(path, request) {
  const response = await fetch(service + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
  assert.equal(response.status, 200);
  return response.json();
}
test('real comparison consumer validates distinct candidates, own evidence and seconds', { skip: !service }, async () => {
  const response = await post('/plan', real());
  assert.ok(isDraftResponse(response));
  assert.equal(response.alternatives.length, 2);
  const [fast, ascent] = response.alternatives;
  assert.ok(ascent.optimization.total_positive_ascent_m < fast.optimization.total_positive_ascent_m);
  assert.ok(ascent.metrics.elapsed_s > fast.metrics.elapsed_s);
  assert.notDeepEqual(ascent.outbound.cells, fast.outbound.cells);
  for (const alt of response.alternatives) {
    assert.equal(alt.metrics.elapsed_s, alt.outbound.duration_s + alt.return.duration_s + 600);
    assert.equal(alt.metrics.reserved_total_s - alt.metrics.elapsed_s, 1800);
    assert.ok(Math.abs(Date.parse(alt.environment.mission_target_interval.to_utc) - Date.parse(response.request_echo.mission.departure_utc) - alt.metrics.reserved_total_s * 1000) < 1);
  }
  const bad = structuredClone(response); bad.alternatives[1].communication.unknown_s = -1;
  assert.equal(isDraftResponse(bad), false);
});
test('evaluated proposal requires explicit payload-preserving application and a new identity', { skip: !service }, async () => {
  const request = JSON.parse(fs.readFileSync(require('node:path').join(__dirname, '../../service/examples/gale-replay.request.json'), 'utf8'));
  request.team.humans[0].payload_kg = 4; request.team.robots[0].payload_kg = 5;
  const suggestions = await post('/recommendations', request);
  assert.ok(isRecommendations(suggestions));
  assert.ok(suggestions.proposals.length > 0);
  for (const proposal of suggestions.proposals) {
    assert.ok(canApplyProposal(request, proposal.proposed_request));
    const changed = structuredClone(proposal.proposed_request);
    changed.mission.reserve_s -= 1;
    assert.equal(canApplyProposal(request, changed), false);
    changed.mission.reserve_s += 1; changed.team.humans[0].payload_kg += 1;
    assert.equal(canApplyProposal(request, changed), false);
  }
  const gate = new RequestGate(); const first = gate.submit(request);
  gate.edit(); const second = gate.submit(suggestions.proposals[0].proposed_request);
  assert.notEqual(first.request_id, second.request_id);
  assert.equal(gate.accepts(first, { request_echo: first }, request), false);
});
