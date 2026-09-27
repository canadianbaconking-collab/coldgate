import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { AuthorityRecord, Report } from './model.ts';
import { resolveApproval, scanConfig } from './scan.ts';
import { summarizeCoverage } from './coverage.ts';
import { assess } from './rules.ts';

const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const identity = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_.-]{1,100}$/.test(v);
const label = (v: string) => v.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 120);

/** Bounded JSON read; references are relative, confined, and do not follow symlink components. */
async function readDocument(base: string, relative: string): Promise<{ value: unknown; sha256: string }> {
  if (!relative || isAbsolute(relative) || relative.includes('\\') || relative.includes(':')) throw Error('Reference must be a relative path using forward slashes');
  const parts = relative.split('/');
  if (parts.some(x => !x || x === '.' || x === '..')) throw Error('Reference contains a prohibited path component');
  let path = base;
  for (const [i, part] of parts.entries()) {
    path = join(path, part);
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw Error('Symlink references are not supported');
    if (i === parts.length - 1 && !info.isFile()) throw Error('Reference must be a regular file');
  }
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 2_000_000) throw Error('Reference must be a regular JSON file under 2 MB');
    const buffer = Buffer.alloc(2_000_001);
    let used = 0;
    while (used < buffer.length) {
      const { bytesRead } = await handle.read(buffer, used, buffer.length - used, null);
      if (!bytesRead) break;
      used += bytesRead;
    }
    if (used > 2_000_000) throw Error('Reference exceeds size limit');
    const bytes = buffer.subarray(0, used);
    return { value: JSON.parse(bytes.toString('utf8')), sha256: createHash('sha256').update(bytes).digest('hex') };
  } finally { await handle.close(); }
}

function qualify(record: AuthorityRecord, source: string): void {
  const c = record.capability;
  if (c.parameters) c.parameters.source = `${source}:${c.parameters.source}`;
  for (const claim of [record.principal.claim, record.inventory, ...c.effectEvidence, c.destination, c.credentialNames, c.scopes, c.approval, c.delegation, c.persistence, ...c.boundaries.map(b => b.claim)]) claim.source = `${source}:${claim.source}`;
  c.effects.source = [...new Set(c.effectEvidence.map(e => e.source))].join(' + ');
}

/** Coldgate connection manifest; native API config and catalogs remain separate documents. */
export async function scanProject(file: string): Promise<Report> {
  const report: Report = { schemaVersion: '0.1', source: label(basename(file)), format: 'connected-openai-responses-mcp', records: [], findings: [], errors: [], connections: [] };
  const fail = (message: string): Report => { report.errors.push(message); report.records = []; report.findings = []; report.connections = []; return report; };
  const base = dirname(resolve(file));
  try {
    const { value: manifest } = await readDocument(base, basename(file));
    if (!object(manifest) || manifest.version !== 1 || typeof manifest.config !== 'string' || !Array.isArray(manifest.inventories) || !manifest.inventories.length || manifest.inventories.length > 100 || Object.keys(manifest).some(k => !['version', 'config', 'inventories'].includes(k))) return fail('Manifest requires version 1, config, and 1–100 inventory bindings');
    const bindings = new Map<string, string>();
    for (const binding of manifest.inventories) {
      if (!object(binding) || typeof binding.server !== 'string' || !binding.server.trim() || typeof binding.file !== 'string' || Object.keys(binding).some(k => !['server', 'file'].includes(k)) || bindings.has(binding.server)) return fail('Inventory bindings require distinct server labels and file paths');
      bindings.set(binding.server, binding.file);
    }
    let config: unknown;
    try { config = (await readDocument(base, manifest.config)).value; } catch { return fail('Unable to read config reference as confined, bounded JSON'); }
    const configReport = scanConfig(config, 'config');
    if (configReport.errors.length) return fail(`Invalid native configuration: ${configReport.errors.join('; ')}`);
    if (!object(config) || !Array.isArray(config.tools) || !config.tools.length || configReport.format !== 'openai-responses-mcp-json') return fail('Connected mode requires a native OpenAI Responses MCP configuration');
    const servers = config.tools as Record<string, unknown>[];
    const labels = servers.map(s => s.server_label as string);
    if (!labels.every(identity)) return fail('Connected mode requires server labels of 1–100 ASCII letters, digits, dots, hyphens, or underscores');
    if (new Set(labels).size !== labels.length) return fail('Configuration contains duplicate server labels');
    if (labels.some(s => !bindings.has(s)) || [...bindings.keys()].some(s => !labels.includes(s))) return fail('Inventory bindings must match configuration server labels exactly');
    const ids = new Set<string>();
    for (const [index, server] of servers.entries()) {
      const provider = server.server_label as string;
      const catalogSource = bindings.get(provider)!;
      let catalog: unknown, sha256: string;
      try { const doc = await readDocument(base, catalogSource); catalog = doc.value; sha256 = doc.sha256; } catch { return fail(`Unable to read inventory binding ${index} as confined, bounded JSON`); }
      // Accept either the tools/list result body or a JSON-RPC response envelope.
      if (object(catalog) && Object.hasOwn(catalog, 'result')) {
        if (Object.hasOwn(catalog, 'error') || !object(catalog.result)) return fail(`Inventory binding ${index} contains a failed or malformed JSON-RPC response`);
        catalog = catalog.result;
      }
      if (!object(catalog) || !Array.isArray(catalog.tools)) return fail(`Inventory binding ${index} requires a tools array`);
      if (Object.hasOwn(catalog, 'nextCursor')) return fail(`Inventory binding ${index} is paginated; combine all pages and remove nextCursor before analysis`);
      if (Object.hasOwn(catalog, 'serverName') && catalog.serverName !== provider) return fail(`Inventory binding ${index} has a mismatched serverName`);
      const checked = scanConfig({ tools: catalog.tools });
      if (checked.errors.length || checked.format !== 'mcp-tools-snapshot') return fail(`Inventory binding ${index} is malformed or uses an unsupported format`);
      // Catalog-supplied approval/scopes are not trusted as client policy. Only standard tool descriptions, schemas and hints are imported.
      const definitions = catalog.tools as Record<string, unknown>[];
      if (!definitions.every(t => identity(t.name))) return fail(`Inventory binding ${index} contains a tool name outside the supported identity format`);
      const clean = definitions.map(t => ({ name: t.name, ...(t.description === undefined ? {} : { description: t.description }), ...(t.inputSchema === undefined ? {} : { inputSchema: t.inputSchema }), ...(t.annotations === undefined ? {} : { annotations: t.annotations }) }));
      const catalogReport = scanConfig({ serverName: provider, tools: clean });
      if (catalogReport.errors.length) return fail(`Inventory binding ${index} cannot be normalized`);
      const allow = server.allowed_tools;
      const names = Array.isArray(allow) ? allow as string[] : object(allow) && Array.isArray(allow.tool_names) ? allow.tool_names as string[] : undefined;
      if (names && !names.every(identity)) return fail(`Configuration server ${index} has an unsupported allowed tool name`);
      const selectionConditional = object(allow) && Object.hasOwn(allow, 'read_only');
      // Leave combined name/annotation filter semantics unresolved; do not silently exclude candidates.
      const candidates = selectionConditional || names === undefined ? catalogReport.records : catalogReport.records.filter(r => names.includes(r.capability.operation));
      const originalNames = new Set(definitions.map(t => t.name));
      const missing = (names ?? []).filter(n => !originalNames.has(n));
      for (const name of missing) {
        const unknown = scanConfig({ tools: [{ ...server, allowed_tools: [name] }] }).records[0];
        if (!unknown) return fail(`Inventory binding ${index} has an invalid named selection`);
        candidates.push(unknown);
      }
      for (const r of candidates) {
        if (ids.has(r.id)) return fail('Connected inventories produce duplicate normalized identities');
        ids.add(r.id);
        const absent = missing.includes(r.capability.operation);
        qualify(r, label(absent ? manifest.config : catalogSource));
        if (absent) r.inventory.source = `${label(catalogSource)}:tools (configured name absent)`;
        r.principal.claim.source = `${label(manifest.config)}:tools[${index}].server_label`;
        r.capability.approval = resolveApproval(server.require_approval, r.capability.operation, `${label(manifest.config)}:tools[${index}]`, 'require_approval');
        r.selection = { value: selectionConditional ? 'CONDITIONAL' : 'INCLUDED', status: allow === undefined ? 'INFERRED' : 'DECLARED', source: `${label(manifest.config)}:tools[${index}].allowed_tools`, explanation: selectionConditional ? 'Annotation-dependent filter is unresolved; candidate retained for review' : 'Listed by explicit configuration selection or unfiltered catalog' };
        report.records.push(r);
        report.findings.push(...assess(r));
        if (missing.includes(r.capability.operation)) report.findings.push({ rule: 'CG010', level: 'REVIEW', recordId: r.id, observed: 'Configured tool name is missing from the bound catalog.', inferred: 'The catalog may be stale or the allowlist may be incorrect.', reason: 'Configured and listed tools disagree.', missing: 'A matching current catalog or corrected configuration.', evidence: [r.inventory.source, r.selection.source] });
        if (selectionConditional) report.findings.push({ rule: 'CG011', level: 'REVIEW', recordId: r.id, observed: 'Tool selection uses an annotation-dependent filter.', inferred: 'Whether this candidate is exposed remains unresolved.', reason: 'Static hints do not prove effective tool selection.', missing: 'Effective selection evidence.', evidence: [r.selection.source] });
      }
      report.connections!.push({ provider: label(provider), configSource: label(manifest.config), catalogSource: label(catalogSource), sha256, listed: definitions.length, included: candidates.length - missing.length, excluded: definitions.length - (candidates.length - missing.length), missing: missing.length, selectionConditional });
    }
    report.coverage = summarizeCoverage(report.records);
    return report;
  } catch { return fail('Unable to read or validate project manifest'); }
}
