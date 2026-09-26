import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm, readFile, symlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanProject } from '../packages/authority/src/project.ts';
import { main, renderText } from '../packages/approval-doctor/src/cli.ts';

async function project(run: (dir: string, config: any, catalog: any, manifest: any) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'coldgate-project-'));
  const config = { tools: [{ type: 'mcp', server_label: 'test', server_url: 'https://example.invalid/mcp', require_approval: 'always' }] };
  const catalog = { tools: [{ name: 'delete_file', annotations: { destructiveHint: true }, requiresApproval: false }] };
  const manifest = { version: 1, config: 'responses.json', inventories: [{ server: 'test', file: 'tools.json' }] };
  try { await run(dir, config, catalog, manifest); } finally { await rm(dir, { recursive: true, force: true }); }
}
async function save(dir: string, config: unknown, catalog: unknown, manifest: unknown) {
  for (const [name, value] of [['responses.json', config], ['tools.json', catalog], ['approval-doctor.project.json', manifest]] as const) await writeFile(join(dir, name), JSON.stringify(value));
  return scanProject(join(dir, 'approval-doctor.project.json'));
}

test('native policy overrides catalog approval and retains distinct evidence sources', async () => {
  await project(async (dir, config, catalog, manifest) => {
    config.tools[0].authorization = 'PRIVATE_AUTHORIZATION_VALUE';
    const report = await save(dir, config, catalog, manifest);
    assert.deepEqual(report.errors, []);
    const r = report.records[0];
    assert.equal(r.capability.approval.value, 'REQUIRED');
    assert.match(r.capability.approval.source, /^responses.json:/);
    assert.match(r.capability.effects.source, /^tools.json:/);
    assert.equal(r.inventory.value, 'snapshot');
    assert.match(report.connections![0].sha256, /^[a-f0-9]{64}$/);
    assert.ok(!JSON.stringify(report).includes('PRIVATE_AUTHORIZATION_VALUE'));
  });
});

test('named allowlist excludes catalog tools and reports configured names absent from catalog', async () => {
  await project(async (dir, config, catalog, manifest) => {
    config.tools[0].allowed_tools = ['send_email'];
    const r = await save(dir, config, catalog, manifest);
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.records.map(x => x.id), ['test.send_email']);
    assert.equal(r.connections![0].excluded, 1);
    assert.equal(r.connections![0].missing, 1);
    assert.equal(r.records[0].inventory.status, 'UNKNOWN');
    assert.match(r.records[0].capability.effects.source, /^responses.json:/);
    assert.ok(r.findings.some(f => f.rule === 'CG010'));
  });
});

test('empty native allowlist selects nothing', async () => {
  await project(async (dir, config, catalog, manifest) => {
    config.tools[0].allowed_tools = [];
    const r = await save(dir, config, catalog, manifest);
    assert.deepEqual(r.errors, []);
    assert.equal(r.records.length, 0);
    assert.equal(r.connections![0].excluded, 1);
  });
});

test('annotation selector retains uncertain candidates with review finding', async () => {
  await project(async (dir, config, catalog, manifest) => {
    config.tools[0].allowed_tools = { read_only: true };
    const r = await save(dir, config, catalog, manifest);
    assert.equal(r.records[0].selection?.value, 'CONDITIONAL');
    assert.ok(r.findings.some(f => f.rule === 'CG011'));
  });
});

for (const scenario of ['mismatch', 'missing binding', 'orphan binding', 'duplicate binding', 'paginated', 'invalid catalog', 'traversal', 'absolute', 'long identity'] as const) {
  test(`connected input rejects ${scenario} without a partial report`, async () => {
    await project(async (dir, config, catalog, manifest) => {
      if (scenario === 'mismatch') catalog.serverName = 'other';
      if (scenario === 'missing binding') manifest.inventories = [];
      if (scenario === 'orphan binding') manifest.inventories.push({ server: 'other', file: 'tools.json' });
      if (scenario === 'duplicate binding') manifest.inventories.push(manifest.inventories[0]);
      if (scenario === 'paginated') catalog.nextCursor = 'another-page';
      if (scenario === 'invalid catalog') catalog.tools.push(null);
      if (scenario === 'traversal') manifest.inventories[0].file = '../tools.json';
      if (scenario === 'absolute') manifest.inventories[0].file = join(dir, 'tools.json');
      if (scenario === 'long identity') catalog.tools[0].name = 'a'.repeat(150);
      const r = await save(dir, config, catalog, manifest);
      assert.ok(r.errors.length);
      assert.equal(r.records.length, 0);
      assert.equal(r.connections!.length, 0);
    });
  });
}

test('catalog change changes its fingerprint', async () => {
  await project(async (dir, config, catalog, manifest) => {
    const first = await save(dir, config, catalog, manifest);
    catalog.tools.push({ name: 'read_file' });
    const second = await save(dir, config, catalog, manifest);
    assert.notEqual(first.connections![0].sha256, second.connections![0].sha256);
  });
});

test('connection rejects symlink inventory references', async () => {
  await project(async (dir, config, catalog, manifest) => {
    await save(dir, config, catalog, manifest);
    await mkdir(join(dir, 'target'));
    await writeFile(join(dir, 'target', 'tools.json'), JSON.stringify(catalog));
    await symlink(join(dir, 'target'), join(dir, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    manifest.inventories[0].file = 'linked/tools.json';
    await writeFile(join(dir, 'approval-doctor.project.json'), JSON.stringify(manifest));
    assert.ok((await scanProject(join(dir, 'approval-doctor.project.json'))).errors.length);
  });
});

test('example CLI uses project manifest once and agrees with golden output', async () => {
  let text = '';
  const writer = { write: (s: string) => { text += s; return true; } } as typeof process.stdout;
  const code = await main(['examples/connected', '--format', 'json'], writer, writer);
  assert.equal(code, 0);
  const reports = JSON.parse(text);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].connections.length, 2);
  assert.equal(reports[0].records.length, 4);
  const report = await scanProject('examples/connected/approval-doctor.project.json');
  assert.equal(renderText([report]), await readFile('examples/connected/report.txt', 'utf8'));
});
