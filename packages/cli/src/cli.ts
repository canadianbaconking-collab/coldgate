import { lstat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { scanFile } from '../../authority/src/scan.ts';
import { scanProject } from '../../authority/src/project.ts';
import type { Report } from '../../authority/src/model.ts';
import { summarizeCoverage } from '../../authority/src/coverage.ts';

const CANDIDATES = ['coldgate.project.json', 'mcp.json', '.mcp.json', 'claude_desktop_config.json', 'coldgate.json', 'openai-hosted-mcp.json', 'openai-responses.json', 'tools.json'];
const SUBDIRS = ['', '.cursor', '.vscode', 'fixtures'];

export function renderText(reports: Report[]): string {
  const lines = ['Coldgate — Scan', ''];
  for (const report of reports) {
    lines.push(`${report.source} (${report.format})`);
    for (const error of report.errors) lines.push(`  ERROR ${error}`);
    for (const link of report.connections ?? []) {
      lines.push(`  Connected ${link.provider}: ${link.configSource} + ${link.catalogSource}`);
      lines.push(`    inventory: ${link.listed} listed; ${link.included} selected; ${link.excluded} excluded; ${link.missing} configured names missing`);
      lines.push(`    catalog sha256: ${link.sha256}`);
    }
    for (const r of report.records) {
      const c = r.capability;
      lines.push(`  ${r.id} | ${c.effects.value.join(', ')} [${c.effects.status}] | approval ${c.approval.value} [${c.approval.status}]`);
      if (r.selection) lines.push(`    selection: ${r.selection.value} [${r.selection.status}]`);
      lines.push(`    scope: ${c.boundaries.map(b => `${b.kind}:${b.value} [${b.claim.status}]`).join(', ')}`);
      lines.push(`    evidence: effects=${c.effects.source}; approval=${c.approval.source}`);
      for (const f of report.findings.filter(f => f.recordId === r.id)) {
        lines.push(`    ${f.level} ${f.rule}: ${f.observed}`);
        lines.push(`      Inference: ${f.inferred} Why: ${f.reason}`);
        lines.push(`      Missing: ${f.missing}`);
      }
    }
    lines.push('');
  }
  const records = reports.flatMap(r => r.records), findings = reports.flatMap(r => r.findings);
  lines.push(`Summary: ${records.length} entries; ${records.filter(r => r.inventory.value === 'unknown').length} unknown inventories; ${records.filter(r => r.capability.approval.value === 'REQUIRED').length} explicit required approvals; ${records.filter(r => r.capability.approval.value === 'UNSPECIFIED').length} unspecified approvals; ${findings.filter(f => f.level === 'WARN').length} warnings; ${findings.filter(f => f.level === 'REVIEW').length} reviews.`);
  if (reports.some(r => r.errors.length)) lines.push('Coverage unavailable: at least one analysis failed.');
  else {
    const c = summarizeCoverage(records), e = c.effect, a = c.approval, i = c.inventory, b = c.boundary;
    lines.push(`Evidence coverage (${c.records} records; not a safety score):`,
      `  effects: ${e.declaredOnly} declared only; ${e.inferredOnly} inferred only; ${e.mixed} mixed; ${e.observedClaim} observed claims; ${e.enforcedClaim} enforced claims; ${e.unknown} unknown.`,
      `  approvals: ${a.explicit} explicit; ${a.conditionalInherited} conditional/inherited; ${a.observedClaim} observed claims; ${a.unknown} unknown.`,
      `  inventory: ${i.snapshot} snapshots; ${i.observedClaim} observed claims; ${i.unknown} unknown.`,
      `  boundaries: ${b.explicit} explicit; ${b.inferred} inferred; ${b.observedClaim} observed claims; ${b.unknown} unknown.`);
  }
  lines.push('Static declarations and hints do not prove runtime enforcement.');
  return lines.join('\n') + '\n';
}
function renderSarif(reports: Report[]): object {
  const all = reports.flatMap(report => report.findings.map(finding => ({ report, finding })));
  return { version: '2.1.0', $schema: 'https://json.schemastore.org/sarif-2.1.0.json', runs: [{
    tool: { driver: { name: 'Coldgate Scan', version: '0.6.0', rules: [...new Set(all.map(x => x.finding.rule))].sort().map(id => ({ id })) } },
    invocations: [{ executionSuccessful: !reports.some(r => r.errors.length),
      toolExecutionNotifications: reports.flatMap(r => r.errors.map(message => ({ level: 'error', message: { text: `${r.source}: ${message}` } }))) }],
    results: all.map(({ report, finding }) => ({ ruleId: finding.rule, level: finding.level === 'WARN' ? 'warning' : 'note',
      message: { text: `${finding.recordId}: ${finding.observed} ${finding.reason} Missing: ${finding.missing}` },
      locations: [{ physicalLocation: { artifactLocation: { uri: report.source } } }] }))
  }] };
}
async function collect(path: string): Promise<string[]> {
  const info = await lstat(path);
  if (info.isSymbolicLink()) throw Error('Symlink inputs are not supported');
  if (info.isFile()) return [path];
  if (!info.isDirectory()) throw Error('Input must be a file or directory');
  try {
    const manifest = join(path, 'coldgate.project.json');
    if ((await lstat(manifest)).isFile()) return [manifest];
  } catch { /* no project manifest */ }
  const found: string[] = [];
  for (const dir of SUBDIRS) {
    if (dir) { try { if (!(await lstat(join(path, dir))).isDirectory()) continue; } catch { continue; } }
    for (const name of CANDIDATES) {
    const file = join(path, dir, name);
    try { if ((await lstat(file)).isFile()) found.push(file); } catch { /* candidate absent */ }
    }
  }
  return found;
}
export async function main(args: string[], output = process.stdout, errors = process.stderr): Promise<number> {
  const usage = 'Usage: coldgate scan <project-dir|config.json> [more inputs...] [--format text|json|sarif] [--fail-on warning|error]\n';
  if (args.includes('--help') || args.includes('-h')) { output.write(usage); return 0; }
  const rest = args[0] === 'scan' ? args.slice(1) : args;
  let format = 'text', failOn = 'error';
  const inputs: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--format') format = rest[++i] ?? '';
    else if (rest[i] === '--fail-on') failOn = rest[++i] ?? '';
    else if (rest[i].startsWith('-')) { errors.write(`Unknown option: ${rest[i]}\n`); return 2; }
    else inputs.push(rest[i]);
  }
  if (!['text', 'json', 'sarif'].includes(format) || !['warning', 'error'].includes(failOn)) { errors.write(usage); return 2; }
  if (!inputs.length) inputs.push('.');
  const files: string[] = [];
  for (const input of inputs) {
    try { files.push(...await collect(input)); } catch { errors.write(`Unable to inspect input: ${input}\n`); return 2; }
  }
  if (!files.length) { errors.write('No supported configuration files found. Pass an explicit JSON file or add mcp.json, tools.json, or openai-hosted-mcp.json.\n'); return 2; }
  const reports = await Promise.all([...new Set(files)].sort().map(file => basename(file) === 'coldgate.project.json' ? scanProject(file) : scanFile(file)));
  output.write(format === 'text' ? renderText(reports) : JSON.stringify(format === 'sarif' ? renderSarif(reports) : reports, null, 2) + '\n');
  return reports.some(r => r.errors.length) ? 2 : failOn === 'warning' && reports.some(r => r.findings.some(f => f.level === 'WARN')) ? 1 : 0;
}
