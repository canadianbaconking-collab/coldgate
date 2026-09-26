import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanConfig } from '../packages/authority/src/index.ts';
import { main } from '../packages/approval-doctor/src/cli.ts';

const invalid = [
  ['null tool', { tools: [null] }],
  ['nameless tool', { tools: [{}] }],
  ['nonobject server', { mcpServers: { example: 'SECRET' } }],
  ['duplicate names', { tools: [{ name: 'read' }, { name: 'read' }] }],
  ['invalid annotation', { tools: [{ name: 'read', annotations: { readOnlyHint: 'true' } }] }],
  ['invalid approval', { hostedMcpTools: [{ serverLabel: 'example', requireApproval: 'sometimes' }] }],
  ['wrong selector spelling', { tools: [{ type: 'mcp', server_label: 'example', require_approval: { always: { toolNames: ['read'] } } }] }],
  ['malformed allowlist', { tools: [{ type: 'mcp', server_label: 'example', allowed_tools: [42] }] }],
  ['ambiguous containers', { tools: [], mcpServers: {} }],
  ['unsupported function tool', { tools: [{ type: 'function', name: 'read' }] }],
  ['conflicting overlay', { tools: [{ name: 'write', requiresApproval: true, approval: 'inherited' }] }],
] as const;
for (const [label, input] of invalid) test(`rejects ${label} without a partial clean report`, () => {
  const report = scanConfig(input);
  assert.ok(report.errors.length);
  assert.equal(report.records.length, 0);
  assert.equal(report.findings.length, 0);
  assert.ok(!JSON.stringify(report).includes('SECRET'));
});

test('detects normalized identity collisions instead of attaching findings to both tools', () => {
  const report = scanConfig({ mcpServers: { 'a.b': { tools: [{ name: 'c' }] }, a: { tools: [{ name: 'b.c' }] } } });
  assert.match(report.errors[0], /Duplicate normalized identity/);
  assert.equal(report.records.length, 0);
});

test('positive annotations supply evidence even when name has no recognized verb', () => {
  const report = scanConfig({ tools: [{ name: 'opaque', annotations: { readOnlyHint: true } }] });
  assert.deepEqual(report.records[0].capability.effects.value, ['READ']);
  assert.equal(report.records[0].capability.effects.status, 'DECLARED');
});

test('annotation-dependent policy is not resolved from matching name alone', () => {
  const report = scanConfig({ tools: [{ type: 'mcp', server_label: 'example', allowed_tools: ['write'], require_approval: { always: { tool_names: ['write'], read_only: true } } }] });
  assert.equal(report.records[0].capability.approval.value, 'CONDITIONAL');
});

test('server-wide explicit policy survives an unknown inventory', () => {
  const report = scanConfig({ tools: [{ type: 'mcp', server_label: 'example', require_approval: 'always' }] });
  assert.equal(report.records[0].inventory.status, 'UNKNOWN');
  assert.equal(report.records[0].capability.approval.value, 'REQUIRED');
});

test('explicit empty allowlist does not manufacture a wildcard capability', () => {
  const report = scanConfig({ tools: [{ type: 'mcp', server_label: 'example', allowed_tools: [] }] });
  assert.equal(report.errors.length, 0);
  assert.equal(report.records.length, 0);
});

const capture = () => {
  let text = '';
  return { stream: { write: (s: string) => { text += s; return true; } } as typeof process.stdout, get: () => text };
};
test('malformed input is visible in SARIF and returns exit 2', async () => {
  const out = capture(), err = capture();
  const code = await main(['fixtures/adversarial/malformed-tools.json', '--format', 'sarif'], out.stream, err.stream);
  assert.equal(code, 2);
  const run = JSON.parse(out.get()).runs[0];
  assert.equal(run.invocations[0].executionSuccessful, false);
  assert.ok(run.invocations[0].toolExecutionNotifications.length);
  assert.equal(run.results.length, 0);
});

test('invalid JSON cannot echo contents into diagnostics', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'coldgate-'));
  try {
    const file = join(dir, 'broken.json');
    await writeFile(file, '{SECRET_CREDENTIAL');
    const out = capture();
    assert.equal(await main([file, '--format', 'json'], out.stream, capture().stream), 2);
    assert.ok(!out.get().includes('SECRET_CREDENTIAL'));
    assert.deepEqual(JSON.parse(out.get())[0].errors, ['Invalid JSON']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('directory discovery does not follow a symlinked config directory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'coldgate-'));
  const outside = await mkdtemp(join(tmpdir(), 'coldgate-outside-'));
  try {
    await writeFile(join(outside, 'mcp.json'), '{"mcpServers":{}}');
    await symlink(outside, join(dir, '.cursor'), process.platform === 'win32' ? 'junction' : 'dir');
    const out = capture();
    assert.equal(await main([dir], out.stream, capture().stream), 2);
    assert.equal(out.get(), '');
  } finally { await rm(dir, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});
