import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import type { Approval, AuthorityRecord, Effect, Evidence, Finding, Report } from './model.ts';

const unknown = <T>(value: T): Evidence<T> => ({ value, status: 'UNKNOWN', source: 'not present in static config' });
const declared = <T>(value: T, source: string): Evidence<T> => ({ value, status: 'DECLARED', source });

const object = (v: unknown): Record<string, unknown> | undefined =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : undefined;
const strings = (v: unknown): string[] | undefined =>
  Array.isArray(v) && v.every(x => typeof x === 'string') ? [...v] : undefined;

/** A name is a hint. It is never proof of what code behind a tool will do. */
export function inferEffect(name: string): Effect {
  const n = name.toLowerCase();
  if (/(^|[._-])(delete|remove|destroy|drop|purge)([._-]|$)/.test(n)) return 'delete';
  if (/(^|[._-])(exec|execute|shell|run|spawn|eval)([._-]|$)/.test(n)) return 'execute';
  if (/(^|[._-])(send|post|publish|push|upload|deploy|create|update|write|edit|commit)([._-]|$)/.test(n)) return 'write';
  if (/(^|[._-])(fetch|request|http|browse|navigate)([._-]|$)/.test(n)) return 'network';
  if (/(^|[._-])(read|get|list|search|find|inspect|view)([._-]|$)/.test(n)) return 'read';
  return 'unknown';
}

function pickStrings(obj: Record<string, unknown>, keys: string[], source: string): Evidence<string[]> {
  for (const key of keys) {
    const val = strings(obj[key]);
    if (val) return declared(val.sort(), `${source}.${key}`);
  }
  return unknown([]);
}

function approval(obj: Record<string, unknown>, source: string): Evidence<Approval> {
  if (typeof obj.requiresApproval === 'boolean')
    return declared(obj.requiresApproval ? 'required' : 'disabled', `${source}.requiresApproval`);
  if (obj.approval === 'required' || obj.approval === 'disabled')
    return declared(obj.approval, `${source}.approval`);
  return unknown('unknown');
}

function entries(v: unknown): Array<[string, Record<string, unknown>]> {
  const o = object(v);
  if (o) return Object.entries(o).sort(([a], [b]) => a.localeCompare(b)).map(([k, val]) => [k, object(val) ?? {}]);
  if (Array.isArray(v)) return v.flatMap((val, index) => {
    const tool = object(val);
    return tool ? [[typeof tool.name === 'string' ? tool.name : `tool-${index}`, tool] as [string, Record<string, unknown>]] : [];
  }).sort(([a], [b]) => a.localeCompare(b));
  return [];
}

/** Parses configuration declarations only. No MCP server or tool is executed. */
export function scanConfig(config: unknown, source: string): Report {
  const report: Report = { schemaVersion: '0.1', source, records: [], findings: [], errors: [] };
  const root = object(config);
  if (!root) { report.errors.push('Root must be a JSON object'); return report; }
  const containers: Array<[string, unknown]> = [];
  if (root.mcpServers !== undefined) containers.push(['mcpServers', root.mcpServers]);
  if (root.servers !== undefined) containers.push(['servers', root.servers]);
  if (containers.length === 0) { report.errors.push('No mcpServers or servers object found'); return report; }

  for (const [container, serverMap] of containers) {
    if (!object(serverMap)) { report.errors.push(`${container} must be an object`); continue; }
    for (const [serverName, server] of entries(serverMap)) {
      const path = `${container}.${serverName}`;
      const toolEntries = entries(server.tools);
      const explicitInventory = server.tools !== undefined && (object(server.tools) !== undefined || Array.isArray(server.tools));
      // A client config commonly lists servers, not their remotely advertised tools.
      const candidates = toolEntries.length ? toolEntries : [['*', {}] as [string, Record<string, unknown>]];
      for (const [toolName, tool] of candidates) {
        const toolPath = `${path}.tools.${toolName}`;
        const effect = toolName === '*' ? 'unknown' : inferEffect(toolName);
        const paths = pickStrings(tool, ['allowedPaths', 'paths'], toolPath);
        const serverPaths = pickStrings(server, ['allowedPaths', 'paths'], path);
        const hosts = pickStrings(tool, ['allowedHosts', 'hosts'], toolPath);
        const serverHosts = pickStrings(server, ['allowedHosts', 'hosts'], path);
        const scope = pickStrings(tool, ['scopes'], toolPath);
        const serverScope = pickStrings(server, ['scopes'], path);
        const toolApproval = approval(tool, toolPath);
        const serverApproval = approval(server, path);
        const envNames = Object.keys(object(server.env) ?? {}).sort();
        const id = `${container}.${serverName}.${toolName}`;
        const record: AuthorityRecord = {
          id,
          principal: unknown('unknown'),
          agent: declared(basename(source), source),
          capability: {
            provider: serverName,
            operation: toolName,
            effect: effect === 'unknown' ? unknown(effect) : { value: effect, status: 'INFERRED', source: `tool name: ${toolName}` },
            boundary: {
              paths: paths.status === 'DECLARED' ? paths : serverPaths,
              hosts: hosts.status === 'DECLARED' ? hosts : serverHosts,
              openWorld: unknown(true),
            },
            authorization: {
              credentialNames: envNames.length ? declared(envNames, `${path}.env keys`) : unknown([]),
              scopes: scope.status === 'DECLARED' ? scope : serverScope,
              approval: toolApproval.status === 'DECLARED' ? toolApproval : serverApproval,
              delegation: unknown('unknown'),
            },
          },
          inventory: explicitInventory ? declared(toolEntries.length ? 'partial' : 'unknown', `${path}.tools`) : unknown('unknown'),
        };
        report.records.push(record);
        report.findings.push(...assess(record));
      }
      if (!explicitInventory || !toolEntries.length) report.findings.push({
        id: 'CG001', level: 'note', recordId: `${path}.*`,
        message: 'Tool inventory is unknown from this static config; query the server separately to establish actual tools.',
      });
    }
  }
  return report;
}

export function assess(record: AuthorityRecord): Finding[] {
  const { effect, authorization, boundary } = record.capability;
  const findings: Finding[] = [];
  if (effect.value === 'unknown') findings.push({ id: 'CG002', level: 'note', recordId: record.id,
    message: 'Effect is unknown; a tool name or server declaration does not establish actual behavior.' });
  if (authorization.approval.value === 'disabled' && ['write', 'delete', 'execute'].includes(effect.value))
    findings.push({ id: 'CG003', level: 'warning', recordId: record.id,
      message: 'Config declares approval disabled for a potentially mutating tool.' });
  else if (['write', 'delete', 'execute'].includes(effect.value))
    findings.push({ id: 'CG004', level: 'warning', recordId: record.id,
      message: authorization.approval.value === 'required'
        ? 'Approval is declared, but static config cannot establish enforcement.'
        : 'Approval requirement is unknown for a potentially mutating tool.' });
  if (['write', 'delete', 'execute', 'network'].includes(effect.value) &&
      boundary.paths.status === 'UNKNOWN' && boundary.hosts.status === 'UNKNOWN')
    findings.push({ id: 'CG005', level: 'note', recordId: record.id,
      message: 'Resource scope is not established by the parsed config.' });
  return findings;
}

export async function scanFile(file: string): Promise<Report> {
  const source = resolve(file);
  try {
    const raw = await readFile(source, 'utf8');
    return scanConfig(JSON.parse(raw), source);
  } catch (error) {
    // Avoid including raw config or error messages that may echo secret values.
    const message = error instanceof SyntaxError ? 'Invalid JSON' : 'Unable to read file';
    return { schemaVersion: '0.1', source, records: [], findings: [], errors: [message] };
  }
}
