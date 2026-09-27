import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanConfig } from '../packages/authority/src/scan.ts';
import { main, summarizePilot } from '../scripts/pilot-summary.mjs';

test('pilot summary counts evidence and rules without copying report identifiers or text', () => {
  const privateName = 'PRIVATE_CUSTOMER_PROJECT_837';
  const report = scanConfig({ tools: [{ name: privateName, description: 'Deletes records.', requiresApproval: false }] }, privateName);
  assert.deepEqual(report.errors, []);
  const summary = summarizePilot([report]);
  assert.equal(summary.schemaVersion, 'pilot-summary-0.1');
  assert.equal(summary.reports, 1);
  assert.equal(summary.coverage.records, 1);
  assert.ok(summary.findingsByLevel.WARN > 0);
  assert.ok(!JSON.stringify(summary).includes(privateName));
  assert.ok(!JSON.stringify(summary).includes('Deletes records'));
});

test('pilot command fails closed for failed reports, unknown findings, and symlinks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'coldgate-pilot-'));
  const report = scanConfig({ tools: [{ name: 'read_entry' }] }, 'internal/source.json');
  const path = join(dir, 'scan.json');
  const link = join(dir, 'link.json');
  let stdout = '', stderr = '';
  const output = { write: (s: string) => { stdout += s; } };
  const errors = { write: (s: string) => { stderr += s; } };
  try {
    await writeFile(path, JSON.stringify([report]));
    assert.equal(await main([path], output, errors), 0);
    assert.equal(JSON.parse(stdout).coverage.records, 1);
    assert.ok(!stdout.includes('internal/source.json'));
    stdout = ''; stderr = '';
    await writeFile(path, JSON.stringify([{ ...report, errors: ['PRIVATE_FAILURE'] }]));
    assert.equal(await main([path], output, errors), 2);
    assert.equal(stdout, '');
    assert.ok(!stderr.includes('PRIVATE_FAILURE'));
    await writeFile(path, JSON.stringify([{ ...report, findings: [{ level: 'WARN', rule: 'PRIVATE_RULE', recordId: report.records[0].id }] }]));
    assert.equal(await main([path], output, errors), 2);
    await symlink(path, link);
    assert.equal(await main([link], output, errors), 2);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
