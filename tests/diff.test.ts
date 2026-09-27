import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { scanConfig } from '../packages/authority/src/scan.ts';
import { diffSnapshots } from '../packages/diff/src/diff.ts';
import { main, renderDiff, renderSarif } from '../packages/diff/src/cli.ts';

function sample() {
  return scanConfig({ mcpServers: { repo: { tools: [{ name: 'create_issue', requiresApproval: true, repositories: ['owner/repo'], inputSchema: { type: 'object', properties: { repo: { const: 'owner/repo' } } } }] } } });
}
const kinds = (r: ReturnType<typeof diffSnapshots>) => r.changes.map(c => c.kind);

test('unchanged reports and set reordering produce no changes', () => {
  const a = sample(), b = structuredClone(a);
  b.records[0].capability.effects.value.reverse();
  b.records[0].capability.effectEvidence.reverse();
  assert.deepEqual(diffSnapshots(a, b).changes, []);
  assert.deepEqual(diffSnapshots(a, b).errors, []);
});

test('old schema-0.1 snapshots without derived coverage remain comparable', () => {
  const a = sample(), b = structuredClone(a);
  delete a.coverage;
  assert.deepEqual(diffSnapshots(a, b).errors, []);
  assert.deepEqual(diffSnapshots(a, b).changes, []);
});

test('reports approval loss, wildcard scopes and credential identifier changes', () => {
  const a = sample(), b = structuredClone(a), c = b.records[0].capability;
  a.records[0].capability.credentialNames.status = 'DECLARED'; c.credentialNames.status = 'DECLARED';
  c.approval.value = 'NOT_REQUIRED';
  c.boundaries[0].value = '*'; c.boundaries[0].claim.value = '*';
  c.credentialNames.value.push('GITHUB_TOKEN');
  assert.ok(kinds(diffSnapshots(a, b)).includes('APPROVAL_CHANGED'));
  assert.ok(kinds(diffSnapshots(a, b)).includes('CREDENTIALS_CHANGED'));
  assert.ok(diffSnapshots(a, b).changes.some(c => c.kind === 'BOUNDARIES_CHANGED' && c.explanation.includes('wildcard')));
  assert.ok(diffSnapshots(a, b).changes.some(c => c.category === 'approval:weakening'));
  assert.ok(diffSnapshots(a, b).changes.some(c => c.category === 'boundaries:widening'));
  assert.ok(diffSnapshots(a, b).changes.some(c => c.category === 'credentials:expansion'));
});

test('direction is limited to represented comparisons and unknown effects remain unresolved', () => {
  const a = sample(), b = structuredClone(a), c = b.records[0].capability;
  a.records[0].capability.scopes.status = 'DECLARED'; c.scopes.status = 'DECLARED';
  c.approval.value = 'NOT_REQUIRED';
  c.boundaries[0].value = '*'; c.boundaries[0].claim.value = '*';
  c.scopes.value.push('issue:write');
  const reverse = diffSnapshots(b, a).changes;
  assert.ok(reverse.some(v => v.category === 'approval:strengthening'));
  assert.ok(reverse.some(v => v.category === 'boundaries:narrowing'));
  assert.ok(reverse.some(v => v.category === 'scopes:contraction'));
  c.approval.value = 'CONDITIONAL';
  c.effects.value = ['UNKNOWN']; c.effectEvidence = [{ value: 'UNKNOWN', status: 'UNKNOWN', source: 'test', explanation: '' }];
  const changes = diffSnapshots(a, b).changes;
  assert.ok(changes.some(v => v.category === 'approval:unresolved'));
  assert.ok(changes.some(v => v.category === 'effects:unresolved'));
  assert.ok(changes.some(v => v.category === 'uncertainty:increase'));
});

test('patterns and conditional selection do not imply a directional exposure', () => {
  const a = sample(), b = structuredClone(a);
  a.records[0].capability.boundaries[0].value = 'owner/*';
  a.records[0].capability.boundaries[0].claim.value = 'owner/*';
  b.records[0].capability.boundaries[0].value = '*';
  b.records[0].capability.boundaries[0].claim.value = '*';
  a.records[0].selection = { value: 'CONDITIONAL', status: 'DECLARED', source: 'test', explanation: '' };
  b.records[0].selection = { value: 'INCLUDED', status: 'DECLARED', source: 'test', explanation: '' };
  const changes = diffSnapshots(a, b).changes;
  assert.ok(changes.some(c => c.kind === 'BOUNDARIES_CHANGED' && c.category === 'boundaries:unresolved'));
  assert.ok(changes.some(c => c.kind === 'SELECTION_CHANGED' && c.category === 'inventory:unresolved'));
});

test('new external effect with a removed effect is mixed, not expansion', () => {
  const a = sample(), b = structuredClone(a);
  b.records[0].capability.effects.value = ['EXTERNAL_COMMUNICATION'];
  b.records[0].capability.effectEvidence = [{ value: 'EXTERNAL_COMMUNICATION', status: 'INFERRED', source: 'test', explanation: '' }];
  const changes = diffSnapshots(a, b).changes;
  assert.ok(changes.some(c => c.kind === 'EFFECTS_CHANGED' && c.category === 'effects:mixed'));
  assert.ok(changes.some(c => c.kind === 'EXTERNAL_EFFECT_ADDED' && c.category === 'effects:unresolved'));
});

test('status-only changes are not lost', () => {
  const a = sample(), b = structuredClone(a);
  b.records[0].capability.approval.status = 'UNKNOWN';
  assert.ok(kinds(diffSnapshots(a, b)).includes('EVIDENCE_CHANGED'));
  assert.ok(!kinds(diffSnapshots(a, b)).includes('APPROVAL_CHANGED'));
  assert.ok(diffSnapshots(a, b).changes.some(c => c.category === 'evidence:loss'));
  assert.ok(diffSnapshots(a, b).changes.some(c => c.category === 'uncertainty:increase'));
});

test('new external side effect and per-effect evidence changes are visible', () => {
  const a = sample(), b = structuredClone(a), c = b.records[0].capability;
  c.effects.value.push('EXTERNAL_COMMUNICATION');
  c.effectEvidence.push({ value: 'EXTERNAL_COMMUNICATION', status: 'INFERRED', source: 'new', explanation: 'test' });
  assert.ok(kinds(diffSnapshots(a, b)).includes('EXTERNAL_EFFECT_ADDED'));
  assert.ok(kinds(diffSnapshots(a, b)).includes('EFFECT_EVIDENCE_CHANGED'));
});

test('absent entries do not become a revocation claim', () => {
  const a = sample(), b = structuredClone(a); b.records = [];
  const r = diffSnapshots(a, b);
  assert.equal(r.changes[0].kind, 'TOOL_REMOVED');
  assert.match(r.changes[0].explanation, /revocation is unproven/);
});

test('unknown inventories qualify additions and removals', () => {
  const a = sample(), b = structuredClone(a);
  b.records[0].inventory.value = 'unknown'; b.records[0].inventory.status = 'UNKNOWN';
  const r = diffSnapshots(a, b);
  assert.ok(r.warnings.length);
  assert.ok(kinds(r).includes('INVENTORY_CHANGED'));
});

test('parameter fingerprints find finite restriction removal without disclosing schema values', () => {
  const a = scanConfig({ tools: [{ name: 'create_issue', inputSchema: { type: 'object', properties: { secret: { const: 'DO_NOT_DISCLOSE_THIS' } } } }] });
  const b = scanConfig({ tools: [{ name: 'create_issue', inputSchema: { type: 'object', properties: { secret: { type: 'string' } } } }] });
  const r = diffSnapshots(a, b);
  assert.ok(r.changes.some(c => c.kind === 'PARAMETERS_CHANGED' && c.explanation.includes('enum/const')));
  assert.ok(!JSON.stringify(a).includes('DO_NOT_DISCLOSE_THIS'));
  assert.ok(!JSON.stringify(r).includes('DO_NOT_DISCLOSE_THIS'));
});

test('schema key ordering does not change fingerprint', () => {
  const a = scanConfig({ tools: [{ name: 'read', inputSchema: { type: 'object', properties: { x: { type: 'string', maxLength: 10 } } } }] });
  const b = scanConfig({ tools: [{ name: 'read', inputSchema: { properties: { x: { maxLength: 10, type: 'string' } }, type: 'object' } }] });
  assert.deepEqual(diffSnapshots(a, b).changes, []);
});

for (const mode of ['errors', 'version', 'duplicate', 'missing claim', 'inconsistent effects', 'inconsistent boundary'] as const) test(`rejects ${mode} snapshots without a clean comparison`, () => {
  const a = sample(), b = structuredClone(a) as any;
  if (mode === 'errors') b.errors.push('PRIVATE_DATA');
  if (mode === 'version') b.schemaVersion = 'future';
  if (mode === 'duplicate') b.records.push(b.records[0]);
  if (mode === 'missing claim') delete b.records[0].capability.approval;
  if (mode === 'inconsistent effects') b.records[0].capability.effects.value.push('EXECUTE');
  if (mode === 'inconsistent boundary') b.records[0].capability.boundaries[0].claim.value = '*';
  const r = diffSnapshots(a, b);
  assert.ok(r.errors.length); assert.equal(r.changes.length, 0);
  assert.ok(!JSON.stringify(r).includes('PRIVATE_DATA'));
});

test('matching uses provider and operation tuple rather than concatenated ID', () => {
  const a = sample();
  const b = structuredClone(a); b.records[0].capability.provider = 'repo.create'; b.records[0].capability.operation = 'issue';
  assert.deepEqual(kinds(diffSnapshots(a, b)).sort(), ['TOOL_ADDED', 'TOOL_REMOVED']);
});

test('Markdown escapes active HTML and mentions', () => {
  const a = sample(), b = structuredClone(a);
  b.records[0].capability.operation = '<img>@everyone';
  const text = renderDiff(diffSnapshots(a, b), 'markdown');
  assert.ok(!text.includes('<img>')); assert.ok(!text.includes('@everyone'));
});

test('CLI change gate and golden Markdown output', async () => {
  const out = { value: '', write(s: string) { this.value += s; return true; } };
  const code = await main(['examples/diff/before.json', 'examples/diff/after.json', '--format', 'markdown', '--fail-on', 'change'], out as typeof process.stdout);
  assert.equal(code, 1);
  assert.equal(out.value, await readFile('examples/diff/review.md', 'utf8'));
  const silent = { write: () => true } as typeof process.stdout;
  assert.equal(await main(['examples/diff/before.json', 'examples/diff/before.json', '--fail-on', 'change'], silent), 0);
  assert.equal(await main(['fixtures/adversarial/malformed-tools.json', 'examples/diff/after.json'], silent), 2);
});

test('selected CI gate accepts exact known categories and rejects invalid lists', async () => {
  const out = { value: '', write(s: string) { this.value += s; return true; } };
  const files = ['examples/diff/before.json', 'examples/diff/after.json'];
  assert.equal(await main([...files, '--fail-on', 'selected', '--categories', 'approval:weakening,boundaries:widening'], out as typeof process.stdout), 1);
  assert.equal(await main([...files, '--fail-on', 'selected', '--categories', 'approval:strengthening'], out as typeof process.stdout), 0);
  assert.equal(await main([...files, '--fail-on', 'selected'], out as typeof process.stdout, out as typeof process.stderr), 2);
  assert.equal(await main([...files, '--fail-on', 'selected', '--categories', 'approval:weakening,approval:weakening'], out as typeof process.stdout, out as typeof process.stderr), 2);
  assert.equal(await main([...files, '--fail-on', 'never', '--categories', 'approval:weakening'], out as typeof process.stdout, out as typeof process.stderr), 2);
  assert.equal(await main([...files, '--fail-on', 'selected', '--categories', 'approval:made-up'], out as typeof process.stdout, out as typeof process.stderr), 2);
  assert.equal(await main(['fixtures/adversarial/malformed-tools.json', files[1], '--fail-on', 'selected', '--categories', 'approval:weakening'], out as typeof process.stdout), 2);
});

test('SARIF preserves comparison failure and change semantics', () => {
  const a = sample(), b = structuredClone(a); b.records[0].capability.approval.value = 'NOT_REQUIRED';
  const good = renderSarif(diffSnapshots(a, b)) as any;
  assert.equal(good.runs[0].invocations[0].executionSuccessful, true);
  assert.ok(good.runs[0].results.some((r: any) => r.ruleId === 'APPROVAL_CHANGED'));
  assert.ok(good.runs[0].results.some((r: any) => r.properties.category === 'approval:weakening'));
  const bad = renderSarif(diffSnapshots(a, {})) as any;
  assert.equal(bad.runs[0].invocations[0].executionSuccessful, false);
  assert.ok(bad.runs[0].invocations[0].toolExecutionNotifications.length);
});
