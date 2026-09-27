import { constants } from 'node:fs';
import { open, lstat } from 'node:fs/promises';
import { diffSnapshots } from './diff.ts';
import type { ColdgateDiff } from './diff.ts';
import { SELECTORS } from './semantics.ts';

async function readSnapshot(file: string): Promise<unknown> {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8_000_000) throw Error('Invalid snapshot file');
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 8_000_000) throw Error('Invalid snapshot file');
    const bytes = Buffer.alloc(8_000_001);
    let used = 0;
    while (used < bytes.length) { const r = await handle.read(bytes, used, bytes.length - used, null); if (!r.bytesRead) break; used += r.bytesRead; }
    if (used > 8_000_000) throw Error('Snapshot too large');
    return JSON.parse(bytes.subarray(0, used).toString('utf8').replace(/^\uFEFF/, ''));
  } finally { await handle.close(); }
}
const md = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/([\\`*_{}\[\]()#+.!|~-])/g, '\\$1').replace(/@/g, '&#64;');
export function renderDiff(report: ColdgateDiff, format: 'text' | 'markdown'): string {
  const lines = [format === 'markdown' ? '## Coldgate — Diff' : 'Coldgate — Diff', ''];
  const escape = format === 'markdown' ? md : (s: string) => s;
  for (const error of report.errors) lines.push(`ERROR: ${escape(error)}`);
  for (const warning of report.warnings) lines.push(`REVIEW: ${escape(warning)}`);
  for (const c of report.changes) {
    lines.push(`${format === 'markdown' ? '- ' : ''}${escape(c.kind)} ${escape(c.tool)}`);
    lines.push(`  Category: ${escape(c.category)}`);
    lines.push(`  Before: ${escape(c.before)}`, `  After: ${escape(c.after)}`, `  ${escape(c.explanation)}`, '');
  }
  lines.push(report.errors.length ? 'Comparison failed; no change conclusion is available.' : `${report.changes.length} represented changes.`, 'Snapshot changes do not prove runtime authority changes or enforcement.');
  return lines.join('\n') + '\n';
}
export function renderSarif(report: ColdgateDiff): object {
  return { version: '2.1.0', $schema: 'https://json.schemastore.org/sarif-2.1.0.json', runs: [{
    tool: { driver: { name: 'Coldgate Diff', version: '0.6.0', rules: [...new Set(report.changes.map(c => c.kind))].sort().map(id => ({ id })) } },
    invocations: [{ executionSuccessful: !report.errors.length, toolExecutionNotifications: [
      ...report.errors.map(text => ({ level: 'error', message: { text } })),
      ...report.warnings.map(text => ({ level: 'warning', message: { text } })),
    ] }],
    results: report.changes.map(c => ({ ruleId: c.kind, level: 'note', properties: { category: c.category }, message: { text: `${c.tool}: ${c.category}. ${c.before} -> ${c.after}. ${c.explanation}` } })),
  }] };
}
export async function main(args: string[], output = process.stdout, errors = process.stderr): Promise<number> {
  const usage = 'Usage: coldgate diff <before.json> <after.json> [--format text|json|markdown|sarif] [--fail-on change|selected|never] [--categories area:direction,...]\n';
  if (args.includes('--help')) { output.write(usage); return 0; }
  const files: string[] = [];
  let format = 'text', failOn = 'never', categories: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--format') format = args[++i] ?? '';
    else if (args[i] === '--fail-on') failOn = args[++i] ?? '';
    else if (args[i] === '--categories') categories = args[++i] ?? '';
    else if (args[i].startsWith('-')) { errors.write(usage); return 2; }
    else files.push(args[i]);
  }
  const selected = categories?.split(',') ?? [];
  if (files.length !== 2 || !['text', 'json', 'markdown', 'sarif'].includes(format) || !['change', 'selected', 'never'].includes(failOn) || (failOn === 'selected') !== (categories !== undefined) || selected.some(c => !SELECTORS.includes(c as typeof SELECTORS[number])) || (categories !== undefined && (!categories || new Set(selected).size !== selected.length))) { errors.write(usage); return 2; }
  let report: ColdgateDiff;
  try { const before = await readSnapshot(files[0]), after = await readSnapshot(files[1]); report = diffSnapshots(before, after); }
  catch { report = { schemaVersion: '0.1', changes: [], warnings: [], errors: ['Unable to read snapshots as regular JSON files under 8 MB'] }; }
  output.write(format === 'json' || format === 'sarif' ? JSON.stringify(format === 'sarif' ? renderSarif(report) : report, null, 2) + '\n' : renderDiff(report, format as 'text' | 'markdown'));
  return report.errors.length ? 2 : (failOn === 'change' && report.changes.length || failOn === 'selected' && report.changes.some(c => selected.includes(c.category))) ? 1 : 0;
}
