import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scanConfig, scanFile, inferEffects } from '../packages/authority/src/index.ts';
import { main, renderText } from '../packages/approval-doctor/src/cli.ts';

const fixture = (name: string) => new URL(`../fixtures/${name}`, import.meta.url).pathname;
const capture = () => {
  let text = '';
  return { stream: { write: (s: string) => { text += s; return true; } } as typeof process.stdout, get: () => text };
};

test('MCP snapshot preserves hints as declarations and exposes contradictions', async () => {
  const report = await scanFile(fixture('tools.json'));
  assert.equal(report.format, 'mcp-tools-snapshot');
  assert.equal(report.records.length, 4);
  const push = report.records.find(r => r.id === 'github.push_files')!;
  assert.ok(push.capability.effects.value.includes('DESTRUCTIVE'));
  assert.equal(push.capability.effects.status, 'INFERRED');
  assert.equal(push.capability.effectEvidence.find(x => x.value === 'DESTRUCTIVE')?.status, 'DECLARED');
  assert.equal(push.capability.effectEvidence.find(x => x.value === 'EXTERNAL_COMMUNICATION')?.status, 'INFERRED');
  assert.equal(push.capability.approval.value, 'UNSPECIFIED');
  assert.equal(push.capability.boundaries[0].kind, 'repository_pattern');
  assert.ok(report.findings.some(f => f.rule === 'CG003' && f.level === 'WARN' && f.recordId === push.id));
  assert.ok(report.findings.some(f => f.rule === 'CG007' && f.recordId === 'github.delete_issue'));
  assert.ok(report.findings.some(f => f.rule === 'CG002' && f.recordId === 'github.mystery'));
  assert.match(renderText([report]), /Missing: Effective approval behavior/);
});

test('client config keeps unknown inventory, redacts secrets, and identifies inherited approval', async () => {
  const report = await scanFile(fixture('mcp.json'));
  const remote = report.records.find(r => r.id === 'remote.*')!;
  assert.equal(remote.inventory.status, 'UNKNOWN');
  assert.equal(remote.capability.effects.value[0], 'UNKNOWN');
  assert.ok(report.findings.some(f => f.rule === 'CG001' && f.recordId === remote.id));
  const write = report.records.find(r => r.id === 'filesystem.write_file')!;
  assert.equal(write.capability.approval.value, 'REQUIRED');
  assert.equal(write.capability.approval.status, 'DECLARED');
  assert.ok(report.findings.some(f => f.rule === 'CG005' && f.recordId === write.id));
  assert.ok(report.findings.some(f => f.rule === 'CG004' && f.recordId === 'filesystem.shell_exec'));
  assert.ok(report.findings.some(f => f.rule === 'CG003' && f.recordId === 'filesystem.delete_file'));
  assert.deepEqual(write.capability.credentialNames.value, ['GITHUB_TOKEN']);
  assert.ok(!JSON.stringify(report).includes('EXAMPLE_SECRET_DO_NOT_EXPORT'));
});

test('OpenAI hosted MCP JSON resolves explicit tool names, preserves conditional selectors', async () => {
  const report = await scanFile(fixture('openai-hosted-mcp.json'));
  const issue = report.records.find(r => r.id === 'issues.create_issue')!;
  assert.equal(issue.capability.approval.value, 'REQUIRED');
  const list = report.records.find(r => r.id === 'issues.list_issues')!;
  assert.equal(list.capability.approval.value, 'NOT_REQUIRED');
  const send = report.records.find(r => r.id === 'issues.send_email')!;
  assert.equal(send.capability.approval.value, 'CONDITIONAL');
  assert.ok(report.findings.some(f => f.rule === 'CG004' && f.recordId === send.id));
  assert.ok(!JSON.stringify(report).includes('EXAMPLE_SECRET_DO_NOT_EXPORT'));
});

test('malformed and unsupported input cannot echo data', async () => {
  assert.deepEqual(scanConfig({ mcpServers: [] }, 'bad.json').errors, ['mcpServers must be an object']);
  assert.equal(scanConfig({ foo: 'password=SECRET' }, 'bad.json').records.length, 0);
  assert.deepEqual(inferEffects('unusual_name'), ['UNKNOWN']);
});

test('directory discovery, JSON, SARIF and warning gate work from clean invocation', async () => {
  const out = capture(), err = capture();
  const exit = await main(['fixtures', '--format', 'json', '--fail-on', 'warning'], out.stream, err.stream);
  assert.equal(exit, 1);
  assert.equal(err.get(), '');
  const reports = JSON.parse(out.get());
  assert.equal(reports.length, 3);
  assert.ok(!out.get().includes('EXAMPLE_SECRET_DO_NOT_EXPORT'));
  const sarif = capture();
  assert.equal(await main(['fixtures/tools.json', '--format', 'sarif'], sarif.stream, capture().stream), 0);
  assert.equal(JSON.parse(sarif.get()).version, '2.1.0');
});
