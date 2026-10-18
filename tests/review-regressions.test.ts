import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanConfig } from '../packages/authority/src/scan.ts';
import { diffSnapshots } from '../packages/diff/src/diff.ts';
import { main } from '../packages/diff/src/cli.ts';

const config = (key: string, value: string) => ({ mcpServers: { files: {
  tools: [{ name: 'write_file', [key]: [value] }]
} } });
const sink = { write: () => true } as typeof process.stdout;

test('long semantic boundaries and scopes survive scan and block the change gate', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'coldgate-long-values-'));
  try {
    const prefix = '/workspace/' + 'a'.repeat(120);
    for (const key of ['allowedPaths', 'allowedHosts', 'repositories', 'scopes']) {
      const before = scanConfig(config(key, prefix + '/public'));
      const after = scanConfig(config(key, prefix + '/private'));
      assert.deepEqual(before.errors, []);
      assert.deepEqual(after.errors, []);
      const diff = diffSnapshots(before, after);
      assert.deepEqual(diff.errors, []);
      assert.ok(diff.changes.some(c => c.kind === (key === 'scopes' ? 'SCOPES_CHANGED' : 'BOUNDARIES_CHANGED')));
      const files = [join(dir, 'before.json'), join(dir, 'after.json')];
      await writeFile(files[0], JSON.stringify(before));
      await writeFile(files[1], JSON.stringify(after));
      assert.equal(await main([...files, '--fail-on', 'change'], sink, sink), 1);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('lossy semantic values fail closed without echoing secrets or collapsing identity', () => {
  for (const value of ['repo\nprivate', 'repo\x7fprivate', 'repo\u202eprivate', 'secret=PRIVATE_VALUE', 'a'.repeat(4097)]) {
    const report = scanConfig(config('allowedPaths', value));
    assert.ok(report.errors.length);
    assert.equal(report.records.length, 0);
    assert.ok(!JSON.stringify(report).includes('PRIVATE_VALUE'));
  }
  for (const input of [
    { serverName: 'a'.repeat(121), tools: [{ name: 'read' }] },
    { tools: [{ name: 'a'.repeat(121) }] },
    { mcpServers: { files: { env: { 'token=PRIVATE_VALUE': 'ignored' } } } },
    { tools: [{ type: 'mcp', server_label: 'files', allowed_tools: ['a'.repeat(121)] }] }
  ]) {
    const report = scanConfig(input);
    assert.ok(report.errors.length);
    assert.equal(report.records.length, 0);
    assert.ok(!JSON.stringify(report).includes('PRIVATE_VALUE'));
  }
});

test('filesystem and network wildcard transitions trigger the selected directional gates', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'coldgate-wildcard-'));
  try {
    for (const [key, exact] of [['allowedPaths', '/safe'], ['allowedHosts', 'example.com']]) {
      const before = scanConfig(config(key, exact)), after = scanConfig(config(key, '*'));
      const files = [join(dir, 'before.json'), join(dir, 'after.json')];
      await writeFile(files[0], JSON.stringify(before));
      await writeFile(files[1], JSON.stringify(after));
      for (const [pair, category] of [[files, 'boundaries:widening'], [[...files].reverse(), 'boundaries:narrowing']] as const) {
        assert.equal(await main([...pair, '--fail-on', 'selected', '--categories', category], sink, sink), 1);
      }
      assert.ok(diffSnapshots(before, after).changes.some(c => c.category === 'boundaries:widening'));
      assert.ok(diffSnapshots(after, before).changes.some(c => c.category === 'boundaries:narrowing'));
    }
    // Unrelated resource types and partially specified patterns remain unresolved.
    assert.equal(diffSnapshots(scanConfig(config('allowedPaths', '/safe')), scanConfig(config('allowedHosts', '*')))
      .changes.find(c => c.kind === 'BOUNDARIES_CHANGED')?.category, 'boundaries:unresolved');
    assert.equal(diffSnapshots(scanConfig(config('allowedPaths', '/safe/*')), scanConfig(config('allowedPaths', '*')))
      .changes.find(c => c.kind === 'BOUNDARIES_CHANGED')?.category, 'boundaries:unresolved');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
