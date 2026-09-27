import { constants } from 'node:fs';
import { open, lstat } from 'node:fs/promises';
import { emptyReport, normalizeTrace } from './normalize.ts';
import { renderHtml, renderTrace } from './render.ts';

async function readTrace(file: string): Promise<unknown> {
  const before = await lstat(file);
  if (!before.isFile() || before.isSymbolicLink() || before.size > 8_000_000) throw Error('Invalid input');
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 8_000_000) throw Error('Invalid input');
    const bytes = Buffer.alloc(8_000_001); let used = 0;
    while (used < bytes.length) { const read = await handle.read(bytes, used, bytes.length - used, null); if (!read.bytesRead) break; used += read.bytesRead; }
    if (used > 8_000_000) throw Error('Invalid input');
    return JSON.parse(bytes.subarray(0, used).toString('utf8').replace(/^\uFEFF/, ''));
  } finally { await handle.close(); }
}
export async function main(args: string[], output = process.stdout, errors = process.stderr): Promise<number> {
  const usage = 'Usage: coldgate trace <export.json> [--format text|json|markdown|html] [--output new-file] [--fail-on reported-error|never]\n';
  if (args.includes('--help') || args.includes('-h')) { output.write(usage); return 0; }
  const files: string[] = []; let format = 'text', failOn = 'never', destination: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--format') format = args[++i] ?? '';
    else if (args[i] === '--fail-on') failOn = args[++i] ?? '';
    else if (args[i] === '--output') { destination = args[++i]; if (!destination || destination.startsWith('-')) { errors.write(usage); return 2; } }
    else if (args[i].startsWith('-')) { errors.write(usage); return 2; }
    else files.push(args[i]);
  }
  if (files.length !== 1 || !['text', 'json', 'markdown', 'html'].includes(format) || !['never', 'reported-error'].includes(failOn)) { errors.write(usage); return 2; }
  let report;
  try { report = normalizeTrace(await readTrace(files[0])); }
  catch { report = emptyReport(); report.errors.push('Unable to read trace as a regular JSON file under 8 MB'); }
  const rendered = format === 'json' ? JSON.stringify(report, null, 2) + '\n' : format === 'html' ? renderHtml(report) : renderTrace(report, format as 'text' | 'markdown');
  if (destination) {
    // Exclusive creation prevents clobbering input, existing reports, or symlink targets.
    try { const handle = await open(destination, 'wx', 0o600); try { await handle.writeFile(rendered); } finally { await handle.close(); } }
    catch { errors.write('Unable to create output file; choose a new writable path.\n'); return 2; }
  } else output.write(rendered);
  return report.errors.length ? 2 : failOn === 'reported-error' && report.summary.reportedErrors ? 1 : 0;
}
