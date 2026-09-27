import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'coldgate-package-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(command, args, cwd, expected = 0) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, shell: process.platform === 'win32' && command.endsWith('.cmd') });
  assert.equal(result.status, expected, `${command} ${args.join(' ')} exited ${result.status}\n${result.stderr}\n${result.stdout}`);
  return result.stdout;
}

try {
  const packed = JSON.parse(run(npm, ['pack', '--json', '--pack-destination', temporary], root))[0];
  const paths = packed.files.map(entry => entry.path);
  for (const required of [
    'dist/packages/cli/bin/coldgate.js', 'dist/packages/cli/src/cli.js',
    'dist/packages/authority/src/scan.js', 'dist/packages/diff/src/diff.js',
    'dist/packages/trace/src/cli.js',
  ]) assert.ok(paths.includes(required), `Missing packed file: ${required}`);
  assert.ok(paths.every(path => !/^(?:tests|fixtures|examples|scripts|docs|\.github)\//.test(path)), 'Non-runtime content entered the tarball');

  const installed = join(temporary, 'consumer');
  run(npm, ['install', '--ignore-scripts', '--offline', '--no-audit', '--no-fund', '--prefix', installed, join(temporary, packed.filename)], root);
  const bin = join(installed, 'node_modules', '.bin', process.platform === 'win32' ? 'coldgate.cmd' : 'coldgate');
  await stat(bin);
  const scan = JSON.parse(run(bin, ['scan', resolve(root, 'fixtures/tools.json'), '--format', 'json'], installed));
  assert.ok(scan.length && scan[0].records.length, 'Installed scan returned no records');
  const pair = [resolve(root, 'examples/diff/before.json'), resolve(root, 'examples/diff/after.json')];
  run(bin, ['diff', ...pair, '--fail-on', 'selected', '--categories', 'approval:weakening'], installed, 1);
  run(bin, ['diff', ...pair, '--fail-on', 'selected', '--categories', 'approval:strengthening'], installed);
  JSON.parse(run(bin, ['trace', resolve(root, 'examples/trace/openai.json'), '--format', 'json'], installed));
  console.log(`Verified ${packed.filename}: ${paths.length} packed files, ${(packed.size / 1024).toFixed(1)} KiB; isolated scan, diff and trace passed.`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
