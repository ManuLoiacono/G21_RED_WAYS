const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require('cesium');

// Exercise the real rendering modules without loading the map.
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText, filename);
global.location = { search: '?lang=en', href: 'http://localhost/?lang=en' };
global.history = { replaceState() {} };
global.document = { documentElement: {}, querySelectorAll: () => [] };
const { environmentContext, terrainContext } = require('../src/mission/context.ts');
const { createResultsPanel } = require('../src/mission/results.ts');
const { isDraftResponse } = require('../src/mission/validation.ts');
const { setLanguage } = require('../src/i18n/index.ts');
// Captured from the real Gale replay request; contains only public prepared data.
const response = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/route-context.json'), 'utf8'));

test('eligible context keeps quantiles/classification; nulls and verification stay absent', () => {
  assert.ok(isDraftResponse(response));
  const html = environmentContext(response.alternatives[0], response.environment);
  for (const expected of [/687.05/, /p10: 685.37/, /microgray\/day/, /Historical observation/,
    /Model prediction/, /2025-10-26T00:00:00Z/, /Target sol: 4700/, /Lead \(sols\): 1/]) assert.match(html, expected);
  const empty = { environment: { ...response.environment, decision_records: [{ record: {
    kind: 'verification', evidence_kind: 'observed', variable: 'pressure_pa', units: 'Pa', value: 999,
  } }] } };
  assert.equal(environmentContext(empty, response.environment), '');
  const nulls = { environment: { ...empty.environment, decision_records: [{ record: {
    kind: 'forecast', evidence_kind: 'forecast', variable: 'pressure_pa', units: 'Pa',
    quantiles: { p10: null, p50: null, p90: null },
  } }] } };
  assert.equal(environmentContext(nulls, response.environment), '');
  assert.equal(environmentContext(response.alternatives[0]), '');
  const malformed = structuredClone(response);
  malformed.alternatives[0].terrain_context.categories.unknown.distance_m = -1;
  assert.equal(isDraftResponse(malformed), false);
});

test('selection and languages use matching context without public absence inventory', () => {
  let click;
  const root = { innerHTML: '', classList: { toggle() {} }, querySelectorAll: () => [],
    querySelector: () => null, addEventListener: (type, handler) => { click = handler; }, dispatchEvent() {} };
  const panel = createResultsPanel(root);
  const r = structuredClone(response);
  r.alternatives[0].environment = structuredClone(r.environment);
  const second = { ...structuredClone(r.alternatives[0]), id: 'second',
    environment: { ...r.environment, decision_records: [] } };
  second.terrain_context.categories.looser.distance_m = 25;
  second.terrain_context.warning = true;
  r.alternatives.push(second);
  panel.show(r);
  assert.match(root.innerHTML, /data-context="environment"/);
  assert.doesNotMatch(root.innerHTML, /Not evaluated:|Physiology|Terrain shadow/);
  assert.match(terrainContext(second), /25 m/);
  assert.doesNotMatch(terrainContext(r.alternatives[0]), /along 25 m/);
  click({ target: { closest: selector => selector === 'button[data-alt]' ? { dataset: { alt: 'second' } } : null } });
  assert.doesNotMatch(root.innerHTML, /data-context="environment"/);
  assert.match(root.innerHTML, /rs-card selected[^]*data-alt="second"/);
  setLanguage('es');
  assert.match(root.innerHTML, /Contexto del terreno/);
  assert.doesNotMatch(root.innerHTML, /No evaluado:|Fisiología|Sombras del terreno/);
  setLanguage('en');
});

test('terrain crossing and unknown coverage are compact advisory summaries', () => {
  const alt = { id: 'test', terrain_context: { status: 'partial', warning: true, pixel_m: 100,
    categories: Object.fromEntries(['looser', 'intermediate', 'firmer', 'unknown'].map(band =>
      [band, { distance_m: band === 'looser' ? 25 : 10, travel_s: 0 }])) } };
  const html = terrainContext(alt);
  assert.match(html, /25 m/);
  assert.match(html, /Unknown/);
  assert.match(html, /partial/);
  assert.equal(terrainContext({ id: 'none', terrain_context: { status: 'unevaluated', warning: false } }), '');
});
