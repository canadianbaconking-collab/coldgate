import { lstat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSnapshots } from '../packages/diff/src/validate.ts';
import { summarizeCoverage } from '../packages/authority/src/coverage.ts';

const MAX_BYTES = 8 * 1024 * 1024;
const LEVELS = ['OK', 'INFO', 'REVIEW', 'WARN', 'UNKNOWN'];
const RULES = Array.from({ length: 15 }, (_, i) => `CG${String(i + 1).padStart(3, '0')}`);

/** Fixed, count-only output. Never copy identifiers, paths, evidence, or finding text. */
export function summarizePilot(input) {
  const { reports, errors } = validateSnapshots(input);
  if (errors.length) throw Error('Invalid or failed scan report');
  const records = reports.flatMap(report => report.records);
  const findings = reports.flatMap(report => report.findings);
  const ids = new Set(records.map(record => record.id));
  if (findings.some(f => f === null || typeof f !== 'object' || !LEVELS.includes(f.level) ||
      !RULES.includes(f.rule) || typeof f.recordId !== 'string' || !ids.has(f.recordId))) {
    throw Error('Invalid scan findings');
  }
  const byLevel = Object.fromEntries(LEVELS.map(level => [level, findings.filter(f => f.level === level).length]));
  const byRule = Object.fromEntries(RULES.map(rule => [rule, findings.filter(f => f.rule === rule).length]));
  return {
    schemaVersion: 'pilot-summary-0.1',
    reports: reports.length,
    coverage: summarizeCoverage(records),
    conditionalSelections: records.filter(record => record.selection?.value === 'CONDITIONAL').length,
    findingsByLevel: byLevel,
    findingsByRule: byRule,
  };
}

export async function main(args, output = process.stdout, errors = process.stderr) {
  if (args.length !== 1 || args[0].startsWith('-')) {
    errors.write('Usage: node scripts/pilot-summary.mjs <scan-report.json>\n');
    return 2;
  }
  try {
    const file = args[0];
    const stat = await lstat(file);
    if (!stat.isFile() || stat.size > MAX_BYTES) throw Error('Invalid input');
    const input = JSON.parse(await readFile(file, 'utf8'));
    output.write(JSON.stringify(summarizePilot(input), null, 2) + '\n');
    return 0;
  } catch {
    errors.write('Unable to summarize: input must be a valid, successful Coldgate JSON scan report (8 MiB maximum).\n');
    return 2;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = await main(process.argv.slice(2));
}
