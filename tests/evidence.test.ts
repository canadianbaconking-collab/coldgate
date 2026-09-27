import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanConfig, inferDescriptionEffects, scanProject, summarizeCoverage } from '../packages/authority/src/index.ts';

test('description-derived effect is INFERRED and independently sourced', () => {
  const r = scanConfig({tools: [{name: 'read_branch', description: 'Permanently deletes matching branches', annotations: {readOnlyHint: true}}]});
  assert.deepEqual(r.errors, []);
  const e = r.records[0].capability.effectEvidence;
  assert.ok(e.some(c => c.value === 'READ' && c.status === 'DECLARED' && c.source.endsWith('.annotations')));
  assert.ok(e.some(c => c.value === 'READ' && c.status === 'INFERRED' && c.source.endsWith('.name')));
  assert.ok(e.some(c => c.value === 'DESTRUCTIVE' && c.status === 'INFERRED' && c.source.endsWith('.description')));
  assert.ok(!JSON.stringify(r).includes('Permanently deletes matching branches'));
});

test('negations, quotations, capability claims, and examples do not produce an action', () => {
  for (const description of [
    'Lists files without modifying or deleting them.',
    'Does not delete matching branches.',
    'May delete matching branches.',
    'Can delete matching branches.',
    'Use "delete" to remove branches.',
    'For example: delete a branch.',
    'Never deletes a branch.',
  ]) assert.ok(!inferDescriptionEffects(description).includes('DESTRUCTIVE'), description);
  assert.deepEqual(inferDescriptionEffects('Lists files without modifying or deleting them.'), ['READ']);
  assert.deepEqual(inferDescriptionEffects('This tool sends messages to the team.'), ['WRITE', 'EXTERNAL_COMMUNICATION']);
  assert.deepEqual(inferDescriptionEffects('Execute a SELECT query on the SQLite database'), ['READ']);
  assert.deepEqual(inferDescriptionEffects('Execute an INSERT, UPDATE, or DELETE query on the SQLite database'), ['WRITE', 'DESTRUCTIVE']);
});

test('description validates type and size without echoing content', () => {
  const oversized = 'SECRET_SENTINEL'.repeat(300);
  for (const description of [42, oversized]) {
    const r = scanConfig({ tools: [{name: 'run', description}] });
    assert.equal(r.records.length, 0);
    assert.ok(r.errors.some(e => e.includes('description')));
    assert.ok(!JSON.stringify(r).includes('SECRET_SENTINEL'));
  }
});

test('connected catalogs propagate description provenance without trusting catalog approval', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'coldgate-evidence-'));
  try {
    await writeFile(join(dir, 'coldgate.project.json'), JSON.stringify({version: 1, config: 'config.json', inventories: [{server: 'repo', file: 'catalog.json'}]}));
    await writeFile(join(dir, 'config.json'), JSON.stringify({tools: [{type: 'mcp', server_label: 'repo', require_approval: 'always'}]}));
    await writeFile(join(dir, 'catalog.json'), JSON.stringify({tools: [{name: 'mystery', description: 'Deletes matching branches.', requiresApproval: false}]}));
    const report = await scanProject(join(dir, 'coldgate.project.json'));
    assert.deepEqual(report.errors, []);
    const c = report.records[0].capability;
    assert.equal(c.approval.value, 'REQUIRED');
    assert.equal(report.coverage?.approval.explicit, 1);
    assert.ok(c.effectEvidence.some(e => e.value === 'DESTRUCTIVE' && e.source.startsWith('catalog.json:') && e.source.endsWith('.description')));
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test('coverage dimensions use disjoint counts and expose unknowns, not safety', () => {
  const report = scanConfig({mcpServers: {server: {tools: [
    {name: 'list_records', description: 'List records.', annotations: {readOnlyHint: true}, requiresApproval: true, repositories: ['*']},
    {name: 'opaque', description: 'For example, this tool could delete records.'},
  ]}}});
  assert.deepEqual(report.errors, []);
  const c = report.coverage!;
  assert.equal(c.records, 2);
  for (const key of ['effect', 'approval', 'inventory', 'boundary'] as const) assert.equal(Object.values(c[key]).reduce((a, b) => a + b, 0), c.records);
  assert.equal(c.effect.mixed, 1); assert.equal(c.effect.unknown, 1);
  assert.equal(c.approval.explicit, 1); assert.equal(c.approval.unknown, 1);
  assert.equal(c.inventory.snapshot, 2);
  assert.equal(c.boundary.explicit, 1); assert.equal(c.boundary.unknown, 1);
  assert.deepEqual(summarizeCoverage(report.records), c);
  assert.ok(!JSON.stringify(report).includes('For example, this tool could delete records.'));
});

test('CG007 keeps its name-and-annotation meaning while CG012 reconciles description disagreement', () => {
  const report = scanConfig({ tools: [
    {name: 'read_branch', description: 'Permanently deletes matching branches.', annotations: {readOnlyHint: true, destructiveHint: false}},
    {name: 'read_write', annotations: {readOnlyHint: true}},
    {name: 'unknown', description: 'This tool lists records.', annotations: {readOnlyHint: true}},
  ]});
  assert.deepEqual(report.errors, []);
  const findings = (name: string) => report.findings.filter(f => f.recordId === `snapshot.${name}`);
  assert.ok(findings('read_branch').some(f => f.rule === 'CG012' && f.evidence.some(p => p.endsWith('.description')) && f.evidence.some(p => p.endsWith('.name'))));
  assert.ok(!findings('unknown').some(f => f.rule === 'CG007' || f.rule === 'CG012'));
  assert.ok(findings('read_write').some(f => f.rule === 'CG007'));
  assert.ok(!findings('read_write').some(f => f.rule === 'CG012'));
});

test('UNKNOWN composition reports reach, credential identifiers, and consequential hints separately', () => {
  const report = scanConfig({mcpServers: {gateway: {env: {POWER_TOKEN: 'SYNTHETIC_VALUE'}, tools: [
    {name: 'mystery', allowedHosts: ['*']},
    {name: 'opaque', scopes: ['write:admin']},
    {name: 'unclear', annotations: {destructiveHint: true}},
  ]}}});
  assert.deepEqual(report.errors, []);
  const rules = (name: string) => report.findings.filter(f => f.recordId === `gateway.${name}`).map(f => f.rule);
  assert.ok(rules('mystery').includes('CG002'));
  assert.ok(rules('mystery').includes('CG013'));
  assert.ok(rules('mystery').includes('CG014'));
  assert.ok(rules('opaque').includes('CG002') && rules('opaque').includes('CG014'));
  assert.ok(rules('unclear').includes('CG015'));
  assert.ok(!rules('unclear').includes('CG002'));
  assert.ok(!JSON.stringify(report).includes('SYNTHETIC_VALUE'));
});
