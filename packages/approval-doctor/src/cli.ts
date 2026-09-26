import { scanFile } from '../../authority/src/scan.ts';
import type { Report } from '../../authority/src/model.ts';

function renderText(reports: Report[]): string {
  const lines: string[] = [];
  for (const report of reports) {
    lines.push(report.source);
    for (const error of report.errors) lines.push(`  ERROR ${error}`);
    for (const record of report.records) {
      const { effect, authorization } = record.capability;
      lines.push(`  ${record.id}  effect=${effect.value}(${effect.status})  approval=${authorization.approval.value}(${authorization.approval.status})`);
      for (const finding of report.findings.filter(f => f.recordId === record.id))
        lines.push(`    ${finding.level.toUpperCase()} ${finding.id} ${finding.message}`);
    }
    for (const finding of report.findings.filter(f => !report.records.some(r => r.id === f.recordId)))
      lines.push(`  ${finding.level.toUpperCase()} ${finding.id} ${finding.message}`);
  }
  return lines.join('\n') + '\n';
}

function renderSarif(reports: Report[]): object {
  const all = reports.flatMap(report => report.findings.map(finding => ({ report, finding })));
  return {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [{ tool: { driver: { name: 'Approval Doctor', version: '0.1.0',
      rules: [...new Set(all.map(x => x.finding.id))].sort().map(id => ({ id })) } },
      results: all.map(({ report, finding }) => ({
        ruleId: finding.id, level: finding.level,
        message: { text: `${finding.recordId}: ${finding.message}` },
        locations: [{ physicalLocation: { artifactLocation: { uri: report.source } } }],
      })) }],
  };
}

export async function main(args: string[], output = process.stdout, errors = process.stderr): Promise<number> {
  const usage = 'Usage: approval-doctor scan <config.json> [more.json ...] [--format text|json|sarif] [--fail-on warning|error]\n';
  if (args.includes('--help') || args.includes('-h')) { output.write(usage); return 0; }
  if (args.shift() !== 'scan') { errors.write(usage); return 2; }
  let format = 'text', failOn = 'error';
  const files: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--format') format = args[++i] ?? '';
    else if (args[i] === '--fail-on') failOn = args[++i] ?? '';
    else if (args[i].startsWith('-')) { errors.write(`Unknown option: ${args[i]}\n`); return 2; }
    else files.push(args[i]);
  }
  if (!files.length || !['text', 'json', 'sarif'].includes(format) || !['warning', 'error'].includes(failOn)) {
    errors.write(usage); return 2;
  }
  const reports = await Promise.all(files.map(scanFile));
  reports.sort((a, b) => a.source.localeCompare(b.source));
  output.write(format === 'text' ? renderText(reports) : JSON.stringify(format === 'sarif' ? renderSarif(reports) : reports, null, 2) + '\n');
  return reports.some(r => r.errors.length) ? 2 :
    failOn === 'warning' && reports.some(r => r.findings.some(f => f.level === 'warning')) ? 1 : 0;
}
