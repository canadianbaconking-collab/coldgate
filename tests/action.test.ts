import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('Action runner writes a summary and preserves change/no-change/error exit codes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'coldgate-action-'));
  try {
    const run = (after: string, summary: string) => spawnSync(process.execPath, ['.github/actions/coldgate-diff/run.mjs'], { encoding: 'utf8', env: { ...process.env, GITHUB_WORKSPACE: resolve('.'), GITHUB_STEP_SUMMARY: summary, COLDGATE_DIFF_BEFORE: 'examples/diff/before.json', COLDGATE_DIFF_AFTER: after, COLDGATE_DIFF_FAIL_ON: 'change' } });
    const changed = run('examples/diff/after.json', join(dir, 'changed.md'));
    assert.equal(changed.status, 1, changed.stderr);
    assert.match(await readFile(join(dir, 'changed.md'), 'utf8'), /APPROVAL/);
    assert.equal(run('examples/diff/before.json', join(dir, 'same.md')).status, 0);
    assert.equal(run(join(dir, 'changed.md'), join(dir, 'error.md')).status, 2);
    assert.match(await readFile(join(dir, 'error.md'), 'utf8'), /outside the workspace/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('Action runner passes selected category gate without shell interpolation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'coldgate-action-selected-'));
  try {
    const run = (categories: string, summary: string) => spawnSync(process.execPath, ['.github/actions/coldgate-diff/run.mjs'], { encoding: 'utf8', env: { ...process.env, GITHUB_WORKSPACE: resolve('.'), GITHUB_STEP_SUMMARY: summary, COLDGATE_DIFF_BEFORE: 'examples/diff/before.json', COLDGATE_DIFF_AFTER: 'examples/diff/after.json', COLDGATE_DIFF_FAIL_ON: 'selected', COLDGATE_DIFF_CATEGORIES: categories } });
    assert.equal(run('approval:weakening', join(dir, 'selected.md')).status, 1);
    assert.match(await readFile(join(dir, 'selected.md'), 'utf8'), /Category: approval:weakening/);
    assert.equal(run('approval:strengthening', join(dir, 'ignored.md')).status, 0);
    assert.equal(run('approval:made-up', join(dir, 'invalid.md')).status, 2);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
