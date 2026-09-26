import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { scanConfig, scanFile } from '../packages/authority/src/index.ts';
import { main } from '../packages/approval-doctor/src/cli.ts';

const fixture = new URL('../fixtures/mcp-basic.json', import.meta.url);

test('keeps claims tied to their evidence and does not export credential values', async () => {
  const report = await scanFile(fixture.pathname);
  assert.equal(report.errors.length, 0);
  const write = report.records.find(x => x.id.endsWith('.write_file'))!;
  assert.equal(write.capability.effect.value, 'write');
  assert.equal(write.capability.effect.status, 'INFERRED');
  assert.equal(write.capability.authorization.approval.status, 'DECLARED');
  assert.equal(write.capability.authorization.approval.value, 'required');
  assert.notEqual(write.capability.authorization.approval.status, 'ENFORCED');
  assert.equal(write.capability.boundary.paths.status, 'DECLARED');
  assert.ok(report.findings.some(x => x.id === 'CG004' && x.recordId === write.id));
  assert.ok(!JSON.stringify(report).includes('EXAMPLE_SECRET_DO_NOT_EXPORT'));
  assert.deepEqual(write.capability.authorization.credentialNames.value, ['TOKEN']);
});

test('reports explicit disabled approval and undiscovered server tools', async () => {
  const report = await scanFile(fixture.pathname);
  assert.ok(report.findings.some(x => x.id === 'CG003' && x.recordId.endsWith('.delete_file')));
  assert.ok(report.findings.some(x => x.id === 'CG001' && x.recordId === 'mcpServers.remote.*'));
  assert.equal(report.records.find(x => x.id === 'mcpServers.remote.*')?.inventory.status, 'UNKNOWN');
});

test('malformed config fails closed without echoing input', () => {
  const report = scanConfig({ mcpServers: [] }, 'broken.json');
  assert.deepEqual(report.errors, ['mcpServers must be an object']);
  assert.equal(report.records.length, 0);
});

test('SARIF and warning gate produce stable machine output', async () => {
  let out = '', err = '';
  const writer = (append: (text: string) => void) => ({ write: (text: string) => { append(text); return true; } });
  const exit = await main(['scan', fixture.pathname, '--format', 'sarif', '--fail-on', 'warning'],
    writer(text => out += text) as typeof process.stdout, writer(text => err += text) as typeof process.stderr);
  assert.equal(exit, 1);
  assert.equal(err, '');
  const sarif = JSON.parse(out);
  assert.equal(sarif.version, '2.1.0');
  assert.ok(sarif.runs[0].results.some((x: { ruleId: string }) => x.ruleId === 'CG003'));
  assert.ok(!out.includes('EXAMPLE_SECRET_DO_NOT_EXPORT'));
});

test('fixture is ordinary JSON without execution', async () => {
  const raw = await readFile(fixture, 'utf8');
  assert.doesNotThrow(() => JSON.parse(raw));
});
