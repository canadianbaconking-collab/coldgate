import { lstat, readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { Approval, AuthorityRecord, Boundary, Capability, Claim, Effect, Report } from './model.ts';
import { parameterSurface } from './parameters.ts';
import { inferDescriptionEffects } from './description.ts';
import { summarizeCoverage } from './coverage.ts';
import { assess } from './rules.ts';
import { validateInput } from './validate.ts';

const object = (v: unknown): Record<string, unknown> | undefined => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : undefined;
const string = (v: unknown): string | undefined => typeof v === 'string' ? v : undefined;
const strings = (v: unknown): string[] | undefined => Array.isArray(v) && v.every(x => typeof x === 'string') ? v : undefined;
const safe = (v: string): string => v.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/(?:token|secret|password|api[_-]?key|authorization)\s*[:=]\s*\S+/gi, '[redacted]').slice(0, 120);
const claim = <T>(value: T, status: Claim<T>['status'], source: string, explanation: string): Claim<T> => ({ value, status, source, explanation });
const declared = <T>(v: T, source: string, explanation = 'Declared in static input'): Claim<T> => claim(v, 'DECLARED', source, explanation);
const unknown = <T>(v: T, source: string): Claim<T> => claim(v, 'UNKNOWN', source, 'No supported static evidence');
const entries = (v: unknown): [string, Record<string, unknown>][] => {
  if (object(v)) return Object.entries(object(v)!).filter(([, x]) => !!object(x)).map(([k, x]) => [k, object(x)!]).sort(([a], [b]) => a.localeCompare(b));
  if (Array.isArray(v)) return v.flatMap((x, i) => object(x) ? [[string(object(x)!.name) ?? `tool-${i}`, object(x)!] as [string, Record<string, unknown>]] : []).sort(([a], [b]) => a.localeCompare(b));
  return [];
};

/** Name tokens are weak hints. A read verb cannot establish a read-only guarantee. */
export function inferEffects(name: string): Effect[] {
  const words = name.toLowerCase().split(/[^a-z]+/);
  const has = (...s: string[]) => s.some(w => words.includes(w));
  const e: Effect[] = [];
  if (has('read', 'get', 'list', 'search', 'find', 'inspect', 'view')) e.push('READ');
  if (has('write', 'create', 'update', 'edit', 'commit', 'push', 'upload', 'deploy', 'post', 'send', 'publish')) e.push('WRITE');
  if (has('delete', 'remove', 'destroy', 'drop', 'purge', 'overwrite', 'reset', 'force')) {
    if (!e.includes('WRITE')) e.push('WRITE');
    e.push('DESTRUCTIVE');
  }
  if (has('exec', 'execute', 'shell', 'run', 'spawn', 'eval', 'command')) e.push('EXECUTE');
  if (has('send', 'publish', 'post', 'push', 'upload', 'deploy', 'email', 'message')) e.push('EXTERNAL_COMMUNICATION');
  return e.length ? e : ['UNKNOWN'];
}

function annotations(tool: Record<string, unknown>): Capability['annotations'] {
  const raw = object(tool.annotations) ?? {};
  const result: Capability['annotations'] = {};
  for (const key of ['readOnlyHint', 'destructiveHint', 'openWorldHint', 'idempotentHint'] as const)
    if (typeof raw[key] === 'boolean') result[key] = raw[key];
  return result;
}
function effectEvidence(tool: Record<string, unknown>, name: string, path: string): Claim<Effect>[] {
  const nameEffects = inferEffects(name);
  const descriptionEffects = typeof tool.description === 'string' ? inferDescriptionEffects(tool.description) : [];
  const h = annotations(tool);
  const hinted: Effect[] = [];
  if (h.readOnlyHint === true) hinted.push('READ');
  if (h.readOnlyHint === false) hinted.push('WRITE');
  if (h.destructiveHint === true) hinted.push('WRITE', 'DESTRUCTIVE');
  if (h.openWorldHint === true) hinted.push('OPEN_WORLD');
  const result = [...new Set(hinted)].map(e => declared(e, `${path}.annotations`, 'Untrusted MCP descriptive hint'));
  for (const e of nameEffects) if (e !== 'UNKNOWN') result.push(claim(e, 'INFERRED', `${path}.name`, 'Hypothesis from operation name'));
  for (const e of descriptionEffects) result.push(claim(e, 'INFERRED', `${path}.description`, 'Hypothesis from tool description'));
  if (!result.length) result.push(unknown('UNKNOWN', path));
  return result;
}
function boundaries(tool: Record<string, unknown>, server: Record<string, unknown>, path: string, serverPath: string): Boundary[] {
  const found: Boundary[] = [];
  for (const [owner, locator] of [[server, serverPath], [tool, path]] as const) {
    for (const [key, kind] of [['allowedPaths', 'directory'], ['allowedHosts', 'domain'], ['repositories', 'repository_pattern']] as const) {
      const values = strings(owner[key]);
      if (values) for (const v of values) found.push({ kind: v === '*' && kind === 'domain' ? 'arbitrary_network' : v === '*' && kind === 'directory' ? 'arbitrary_filesystem' : kind, value: safe(v), claim: declared(safe(v), `${locator}.${key}`) });
    }
  }
  return found.length ? found : [{ kind: 'unknown', value: 'unknown', claim: unknown('unknown', path) }];
}
function clientApproval(tool: Record<string, unknown>, server: Record<string, unknown>, path: string, serverPath: string): Claim<Approval> {
  // Nonstandard fields are a Coldgate overlay. MCP itself does not specify an approval field.
  if (typeof tool.requiresApproval === 'boolean') return declared(tool.requiresApproval ? 'REQUIRED' : 'NOT_REQUIRED', `${path}.requiresApproval`, 'Coldgate overlay declaration, not MCP enforcement');
  if (tool.approval === 'inherited' || tool.approval === 'conditional') return declared(tool.approval === 'inherited' ? 'INHERITED' : 'CONDITIONAL', `${path}.approval`, 'Coldgate overlay declaration');
  if (typeof server.requiresApproval === 'boolean') return declared('INHERITED', `${serverPath}.requiresApproval`, `Server rule says ${server.requiresApproval ? 'required' : 'not required'}; applicability unverified`);
  return unknown('UNSPECIFIED', path);
}
export function resolveApproval(policy: unknown, toolName: string, path: string, key = 'requireApproval'): Claim<Approval> {
  if (policy === 'always' || policy === 'never') return declared(policy === 'always' ? 'REQUIRED' : 'NOT_REQUIRED', `${path}.${key}`, 'OpenAI MCP policy declaration');
  const p = object(policy);
  if (p) {
    if ([p.always, p.never].some(v => object(v) && Object.keys(object(v)!).some(k => !['toolNames', 'tool_names'].includes(k))))
      return declared('CONDITIONAL', `${path}.${key}`, 'Annotation-dependent selector cannot be resolved from a tool name');
    const always = strings(object(p.always)?.toolNames) ?? strings(object(p.always)?.tool_names);
    const never = strings(object(p.never)?.toolNames) ?? strings(object(p.never)?.tool_names);
    if (always?.includes(toolName) && never?.includes(toolName)) return unknown('UNKNOWN', `${path}.${key}`);
    if (always?.includes(toolName)) return declared('REQUIRED', `${path}.${key}.always.${key === 'requireApproval' ? 'toolNames' : 'tool_names'}`);
    if (never?.includes(toolName)) return declared('NOT_REQUIRED', `${path}.${key}.never.${key === 'requireApproval' ? 'toolNames' : 'tool_names'}`);
    return declared('CONDITIONAL', `${path}.${key}`, 'Selector or unmatched tool needs effective policy resolution');
  }
  return unknown('UNSPECIFIED', path);
}
function normalize(provider: string, name: string, tool: Record<string, unknown>, server: Record<string, unknown>, path: string, serverPath: string, knownInventory: boolean, ap?: Claim<Approval>): AuthorityRecord {
  const envNames = Object.keys(object(server.env) ?? {}).map(safe).sort();
  const scope = strings(tool.scopes);
  const evidence = name === '*' ? [unknown<Effect>('UNKNOWN', path)] : effectEvidence(tool, name, path);
  const aggregateStatus = evidence.some(e => e.status === 'UNKNOWN') ? 'UNKNOWN' : evidence.some(e => e.status === 'INFERRED') ? 'INFERRED' : 'DECLARED';
  return {
    id: `${safe(provider)}.${safe(name)}`,
    principal: { kind: 'mcp_server', name: safe(provider), claim: declared(safe(provider), serverPath) },
    capability: {
      provider: safe(provider), operation: safe(name),
      parameters: parameterSurface(tool.inputSchema, `${path}.inputSchema`),
      effects: claim([...new Set(evidence.map(e => e.value))], aggregateStatus, [...new Set(evidence.map(e => e.source))].join(' + '), 'Aggregate status is no stronger than its weakest member; see effectEvidence'),
      effectEvidence: evidence,
      boundaries: boundaries(tool, server, path, serverPath), destination: unknown('unknown', path),
      credentialNames: envNames.length ? declared(envNames, `${serverPath}.env keys`) : unknown([], serverPath),
      scopes: scope ? declared(scope.map(safe), `${path}.scopes`) : unknown([], path),
      approval: ap ?? clientApproval(tool, server, path, serverPath),
      delegation: unknown('unknown', path), persistence: unknown('unknown', path), annotations: annotations(tool),
    },
    inventory: knownInventory ? declared('snapshot', path, 'Static snapshot may differ from live server') : unknown('unknown', path),
  };
}

/** Parses static JSON only. No server, package, command, or URL is executed. */
export function scanConfig(input: unknown, source = 'input.json'): Report {
  const report: Report = { schemaVersion: '0.1', source: safe(basename(source)), format: 'unknown', records: [], findings: [], errors: [] };
  report.errors = validateInput(input);
  if (report.errors.length) return report;
  const root = object(input);
  if (!root) { report.errors.push('Root must be a JSON object'); return report; }
  const seen = new Set<string>();
  const add = (r: AuthorityRecord) => {
    if (seen.has(r.id)) { report.errors.push('Duplicate normalized identity; use distinct provider and tool names'); return; }
    seen.add(r.id); report.records.push(r); report.findings.push(...assess(r));
  };
  if (Array.isArray(root.tools) && root.mcpServers === undefined && root.servers === undefined) {
    if (root.tools.some(x => object(x)?.type === 'mcp')) {
      report.format = 'openai-responses-mcp-json';
      for (const [i, value] of root.tools.entries()) {
        const server = object(value);
        if (server?.type !== 'mcp') continue;
        const label = string(server.server_label);
        if (!label) { report.errors.push(`tools[${i}] MCP entry requires server_label`); continue; }
        const path = `tools[${i}]`;
        const names = strings(server.allowed_tools) ?? strings(object(server.allowed_tools)?.tool_names) ?? [];
        if (Array.isArray(server.allowed_tools) && !server.allowed_tools.length) continue;
        for (const name of names.length ? names : ['*'])
          add(normalize(label, name, {}, {}, `${path}.allowed_tools.${safe(name)}`, path, false,
            resolveApproval(server.require_approval, name, path, 'require_approval')));
      }
    } else {
      report.format = 'mcp-tools-snapshot';
      const provider = string(root.serverName) ?? 'snapshot';
      for (const [name, tool] of entries(root.tools)) add(normalize(provider, name, tool, {}, `tools.${safe(name)}`, 'serverName', true));
    }
  } else if (Array.isArray(root.hostedMcpTools)) {
    report.format = 'openai-hosted-mcp-json';
    for (const [i, item] of root.hostedMcpTools.entries()) {
      const server = object(item), label = string(server?.serverLabel);
      if (!server || !label) { report.errors.push(`hostedMcpTools[${i}] requires serverLabel`); continue; }
      const path = `hostedMcpTools[${i}]`, tools = entries(server.tools);
      for (const [name, tool] of tools.length ? tools : [['*', {}] as [string, Record<string, unknown>]])
        add(normalize(label, name, tool, server, `${path}.tools.${safe(name)}`, path, !!tools.length, resolveApproval(server.requireApproval, name, path)));
    }
  } else if (root.mcpServers !== undefined || root.servers !== undefined) {
    report.format = 'mcp-client-json';
    for (const key of ['mcpServers', 'servers'] as const) {
      if (root[key] === undefined) continue;
      if (!object(root[key])) { report.errors.push(`${key} must be an object`); continue; }
      for (const [serverName, server] of entries(root[key])) {
        const path = `${key}.${safe(serverName)}`, tools = entries(server.tools);
        for (const [name, tool] of tools.length ? tools : [['*', {}] as [string, Record<string, unknown>]])
          add(normalize(serverName, name, tool, server, `${path}.tools.${safe(name)}`, path, !!tools.length));
      }
    }
  } else report.errors.push('Unsupported JSON: expected tools, hostedMcpTools, mcpServers, or servers');
  if (report.errors.length) { report.records = []; report.findings = []; }
  else report.coverage = summarizeCoverage(report.records);
  return report;
}
export async function scanFile(file: string): Promise<Report> {
  const source = safe(basename(file));
  const failure = (message: string): Report => ({ schemaVersion: '0.1', source, format: 'unknown', records: [], findings: [], errors: [message] });
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink()) return failure('Input must be a regular file, not a symlink');
    if (info.size > 2_000_000) return failure('Input exceeds 2 MB limit');
    return scanConfig(JSON.parse(await readFile(file, 'utf8')), source);
  } catch (err) { return failure(err instanceof SyntaxError ? 'Invalid JSON' : 'Unable to read file'); }
}
