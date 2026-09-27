import { appendFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { main } from '../../../packages/diff/src/cli.ts';

let report = '';
let code = 2;
try {
  const workspace = await realpath(process.env.GITHUB_WORKSPACE ?? process.cwd());
  const paths = [];
  for (const input of [process.env.COLDGATE_DIFF_BEFORE, process.env.COLDGATE_DIFF_AFTER]) {
    if (!input) throw Error('Missing input');
    const file = await realpath(resolve(workspace, input));
    const rel = relative(workspace, file);
    if (!rel || rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel)) throw Error('Outside workspace');
    paths.push(file);
  }
  const capture = { write(s) { report += s; return true; } };
  const failOn = process.env.COLDGATE_DIFF_FAIL_ON ?? 'change';
  const categories = process.env.COLDGATE_DIFF_CATEGORIES ?? '';
  code = await main([...paths, '--format', 'markdown', '--fail-on', failOn, ...(failOn === 'selected' || categories ? ['--categories', categories] : [])], capture, capture);
} catch { report = '## Coldgate — Diff\n\nERROR: Missing or unreadable snapshot, or input outside the workspace.\n'; }
if (process.env.GITHUB_STEP_SUMMARY) {
  // GitHub job summaries are limited to 1 MiB. Avoid invalid/truncated multi-byte boundaries.
  const maximum = 200000;
  const summary = report.length > maximum ? report.slice(0, maximum) + '\n\nReport truncated; run the local CLI for complete output.\n' : report;
  try { await appendFile(process.env.GITHUB_STEP_SUMMARY, summary); }
  catch { process.stderr.write('Unable to write the job summary.\n'); code = 2; }
} else { process.stdout.write(report); }
process.stdout.write(`Coldgate Diff completed with exit code ${code}.\n`);
process.exitCode = code;
