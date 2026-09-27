import type { Claim, Effect } from '../../authority/src/model.ts';
import { inferEffects } from '../../authority/src/scan.ts';
import type { ApprovalEvent, Outcome, TraceEvent, TraceReport } from './model.ts';

type Obj = Record<string, unknown>;
interface Span { trace: string; id: string; parent: string | null; start: string | null; end: string | null; event?: TraceEvent; }
const fail = (): never => { throw Error('Invalid or unsupported trace structure; no partial analysis returned'); };
function obj(v: unknown): Obj { if (v === null || typeof v !== 'object' || Array.isArray(v)) return fail(); return v as Obj; }
function list(v: unknown, max = 10000): unknown[] { if (!Array.isArray(v) || v.length > max) return fail(); return v; }
function str(v: unknown, max = 512): string { if (typeof v !== 'string' || !v.length || v.length > max) return fail(); return v; }
// Never use sanitized display text as identity. Unsupported identifier characters fail closed.
function id(v: unknown): string { const s = str(v, 128); if (!/^[A-Za-z0-9_-]+$/.test(s)) return fail(); return s; }
export const display = (s: string): string => s.replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/(?:token|secret|password|api[_-]?key|authorization)\s*[:=]\s*\S+/gi, '[redacted]').slice(0, 512);
function claim<T>(value: T, source: string, status: Claim<T>['status'] = 'OBSERVED'): Claim<T> {
  return { value, status, source, explanation: status === 'UNKNOWN' ? 'No supported trace evidence' : status === 'INFERRED' ? 'Hypothesis from tool name; actual side effect is unproven' : 'Reported by imported telemetry; authenticity and actual side effects are unverified' };
}
function textClaim(v: unknown, source: string): Claim<string> { return v == null ? claim('unknown', source, 'UNKNOWN') : claim(display(str(v)), source); }
function nano(v: unknown): string | null {
  if (v == null || v === '' || v === '0' || v === 0) return null;
  if (typeof v === 'number') { if (!Number.isSafeInteger(v)) return fail(); v = String(v); }
  if (typeof v !== 'string' || !/^[0-9]{1,20}$/.test(v)) return fail();
  const n = BigInt(v); if (n > 18446744073709551615n) return fail();
  return n === 0n ? null : n.toString();
}
function isoNano(v: unknown): string | null {
  if (v == null) return null;
  const s = str(v, 64), match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(s);
  if (!match) return fail();
  const local = Date.parse(match[1] + 'Z');
  if (!Number.isFinite(local) || new Date(local).toISOString().slice(0, 19) !== match[1]) return fail();
  const zone = match[3];
  if (zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59)) return fail();
  const ms = Date.parse(match[1] + zone); if (!Number.isFinite(ms) || ms < 0) return fail();
  return (BigInt(ms) * 1000000n + BigInt((match[2] ?? '').padEnd(9, '0'))).toString();
}
function date(n: string | null): string | null { return n === null ? null : new Date(Number(BigInt(n) / 1000000n)).toISOString(); }
function shell(trace: string, span: string, parent: string | null, start: string | null, end: string | null): Span {
  if (end !== null && (start === null || BigInt(end) < BigInt(start))) return fail();
  return { trace, id: span, parent, start, end };
}
function event(s: Span, kind: TraceEvent['kind'], operation: unknown, source: string, outcome: Outcome): TraceEvent {
  return { traceId: s.trace, spanId: s.id, parentSpanId: s.parent, kind, startedAt: date(s.start), endedAt: date(s.end), startUnixNano: s.start, endUnixNano: s.end,
    operation: textClaim(operation, source), provider: claim('unknown', source, 'UNKNOWN'),
    effects: claim<Effect[]>(['UNKNOWN'], source, 'UNKNOWN'), outcome: claim(outcome, source, outcome === 'UNKNOWN' ? 'UNKNOWN' : 'OBSERVED'),
    approval: claim('UNKNOWN', source, 'UNKNOWN'), resource: claim('unknown', source, 'UNKNOWN'), destination: claim('unknown', source, 'UNKNOWN'), source };
}
function toolEffects(e: TraceEvent, name: string) {
  const values = inferEffects(name);
  e.effects = claim(values, e.source, values[0] === 'UNKNOWN' ? 'UNKNOWN' : 'INFERRED');
}
function methodEffects(e: TraceEvent, value: Effect) {
  e.effects = { value: [value], status: 'INFERRED', source: e.source,
    explanation: 'Inferred from a recorded operation type; completion and actual side effects are unproven' };
}
function approval(v: unknown, source: string): Claim<ApprovalEvent> {
  if (v == null) return claim('UNKNOWN', source, 'UNKNOWN');
  if (!['REQUESTED', 'APPROVED', 'DENIED'].includes(v as string)) return fail();
  return claim(v as ApprovalEvent, source);
}
function destination(v: unknown, source: string): Claim<string> {
  if (v == null) return claim('unknown', source, 'UNKNOWN');
  const raw = str(v, 4096);
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return fail();
    // Origin only: discard credentials, paths, query and fragment; never contact the host.
    return claim(display(url.host), source);
  } catch { return fail(); }
}
function openai(input: unknown): Span[] {
  const records = Array.isArray(input) ? list(input) : list(obj(input).spans);
  return records.map((value, i) => {
    const v = obj(value), source = `spans[${i}]`;
    if (v.object !== 'trace.span') return fail();
    const s = shell(id(v.trace_id), id(v.id), v.parent_id == null ? null : id(v.parent_id), isoNano(v.started_at), isoNano(v.ended_at));
    const d = obj(v.span_data), type = str(d.type, 64);
    if (v.error != null) obj(v.error);
    const outcome: Outcome = v.error != null ? 'REPORTED_ERROR' : s.end === null ? 'INCOMPLETE' : v.error === null ? 'ENDED_WITHOUT_REPORTED_ERROR' : 'UNKNOWN';
    if (type === 'function') {
      const name = str(d.name); s.event = event(s, 'tool', name, source, outcome); toolEffects(s.event, name);
      // mcp_data is not a stable server identity contract; do not guess a provider from it.
    } else if (type === 'custom' && d.name === 'coldgate.approval') {
      const data = obj(d.data); s.event = event(s, 'approval', str(data.tool_name), source, outcome);
      s.event.approval = approval(data.decision, source + '.span_data.data.decision');
      if (s.event.approval.status === 'UNKNOWN') return fail();
      s.event.provider = textClaim(data.provider, source + '.span_data.data.provider');
    }
    return s;
  });
}
const recognized = new Set(['gen_ai.operation.name', 'gen_ai.tool.name', 'http.request.method', 'server.address', 'url.full', 'mcp.method.name', 'mcp.resource.uri', 'coldgate.provider', 'coldgate.resource', 'coldgate.approval']);
function attributes(v: unknown): Map<string, unknown> {
  const out = new Map<string, unknown>(), seen = new Set<string>();
  for (const value of list(v ?? [], 1000)) {
    const a = obj(value), key = str(a.key);
    if (seen.has(key)) return fail(); seen.add(key);
    if (!recognized.has(key)) continue; // arguments, results, messages and unrecognized metadata never enter output
    const val = obj(a.value);
    if (Object.keys(val).length !== 1 || typeof val.stringValue !== 'string') return fail();
    out.set(key, str(val.stringValue, 4096));
  }
  return out;
}
function otlp(input: Obj, warnings: Set<string>): Span[] {
  const spans: Span[] = [];
  for (const [ri, rv] of list(input.resourceSpans, 1000).entries()) {
    const r = obj(rv);
    for (const [si, sv] of list(r.scopeSpans ?? [], 1000).entries()) {
      const scope = obj(sv);
      for (const [i, value] of list(scope.spans ?? []).entries()) {
        if (spans.length >= 10000) return fail();
        const v = obj(value), source = `resourceSpans[${ri}].scopeSpans[${si}].spans[${i}]`;
        const hex = (x: unknown, length: number) => { const s = str(x, length); if (s.length !== length || !/^[0-9a-f]+$/i.test(s) || /^0+$/.test(s)) return fail(); return s.toLowerCase(); };
        const s = shell(hex(v.traceId, 32), hex(v.spanId, 16), v.parentSpanId == null || v.parentSpanId === '' ? null : hex(v.parentSpanId, 16), nano(v.startTimeUnixNano), nano(v.endTimeUnixNano));
        if (v.kind !== undefined && (!Number.isInteger(v.kind) || Number(v.kind) < 0 || Number(v.kind) > 5)) return fail();
        const status = v.status === undefined ? {} : obj(v.status), code = status.code ?? 0;
        if (![0, 1, 2].includes(code as number)) return fail();
        for (const key of ['droppedAttributesCount', 'droppedEventsCount', 'droppedLinksCount']) {
          if (v[key] !== undefined && (!Number.isSafeInteger(v[key]) || Number(v[key]) < 0)) return fail();
          if (Number(v[key]) > 0) warnings.add('Telemetry reports dropped data; details may be missing.');
        }
        const a = attributes(v.attributes), get = (key: string) => a.get(key);
        const outcome: Outcome = code === 2 ? 'REPORTED_ERROR' : s.end === null ? 'INCOMPLETE' : code === 1 ? 'REPORTED_OK' : 'UNKNOWN';
        if (get('gen_ai.operation.name') === 'execute_tool' || get('mcp.method.name') === 'tools/call') {
          const name = str(get('gen_ai.tool.name')); s.event = event(s, 'tool', name, source, outcome); toolEffects(s.event, name);
        } else if (get('mcp.method.name') === 'resources/read') {
          s.event = event(s, 'resource', 'resources/read', source, outcome);
          methodEffects(s.event, 'READ');
          // A resource URI can contain credentials. Only explicit caller-sanitized coldgate.resource is displayed.
        } else if (v.kind === 3 && get('http.request.method') !== undefined) {
          s.event = event(s, 'network', str(get('http.request.method'), 32), source, outcome);
          methodEffects(s.event, 'EXTERNAL_COMMUNICATION');
        }
        if (s.event) {
          const e = s.event;
          e.provider = textClaim(get('coldgate.provider'), source + '.attributes.coldgate.provider');
          e.approval = approval(get('coldgate.approval'), source + '.attributes.coldgate.approval');
          e.resource = textClaim(get('coldgate.resource'), source + '.attributes.coldgate.resource');
          e.destination = destination(get('server.address') ?? get('url.full'), source + '.attributes.destination');
        }
        spans.push(s);
      }
    }
  }
  return spans;
}
export function emptyReport(): TraceReport { return { schemaVersion: '0.1', kind: 'coldgate-trace', format: 'unknown', events: [], summary: { spans: 0, traces: 0, omittedSpans: 0, toolCalls: 0, networkCalls: 0, resourceCalls: 0, approvalEvents: 0, reportedErrors: 0, unknownApprovals: 0 }, warnings: [], errors: [] }; }
export function normalizeTrace(input: unknown): TraceReport {
  const result = emptyReport();
  const warnings = new Set<string>(['Imported telemetry is unauthenticated and may be incomplete. A recorded call or approval does not prove a completed side effect or enforcement.']);
  try {
    const root = Array.isArray(input) ? null : obj(input);
    if (root && 'resourceSpans' in root && 'spans' in root) return fail();
    result.format = root && 'resourceSpans' in root ? 'otlp-json' : 'openai-agents';
    const spans = result.format === 'otlp-json' ? otlp(root!, warnings) : openai(input);
    if (!spans.length) return fail();
    const key = (trace: string, span: string) => JSON.stringify([trace, span]);
    const byId = new Map<string, Span>();
    for (const s of spans) { const k = key(s.trace, s.id); if (byId.has(k)) return fail(); byId.set(k, s); }
    // Iterative cycle detection across all spans, including omitted model/agent spans.
    const done = new Set<string>();
    for (const s of spans) {
      let current: Span | undefined = s; const path = new Set<string>();
      while (current) {
        const k = key(current.trace, current.id); if (path.has(k)) return fail(); if (done.has(k)) break; path.add(k);
        if (!current.parent) break;
        const parent = byId.get(key(current.trace, current.parent));
        if (!parent) warnings.add('Some parent spans are absent; parent relationships are incomplete.');
        current = parent;
      }
      for (const k of path) done.add(k);
    }
    result.events = spans.flatMap(s => s.event ? [s.event] : []).sort((a, b) => {
      if (a.startUnixNano !== b.startUnixNano) {
        if (a.startUnixNano === null) return 1; if (b.startUnixNano === null) return -1;
        return BigInt(a.startUnixNano) < BigInt(b.startUnixNano) ? -1 : 1;
      }
      const ak = key(a.traceId, a.spanId), bk = key(b.traceId, b.spanId); return ak < bk ? -1 : ak > bk ? 1 : 0;
    });
    const events = result.events;
    result.summary = { spans: spans.length, traces: new Set(spans.map(s => s.trace)).size, omittedSpans: spans.length - events.length,
      toolCalls: events.filter(e => e.kind === 'tool').length, networkCalls: events.filter(e => e.kind === 'network').length,
      resourceCalls: events.filter(e => e.kind === 'resource').length, approvalEvents: events.filter(e => e.kind === 'approval' || e.approval.status === 'OBSERVED').length,
      reportedErrors: events.filter(e => e.outcome.value === 'REPORTED_ERROR').length, unknownApprovals: events.filter(e => e.kind === 'tool' && e.approval.status === 'UNKNOWN').length };
    if (!events.length) warnings.add('No supported capability events found; this is not evidence that no tools ran.');
    if (result.summary.omittedSpans) warnings.add('Non-capability and unsupported span types are omitted from the timeline; review the omitted count.');
    if (events.some(e => e.startUnixNano === null)) warnings.add('Events without start times appear last; their chronological position is unknown.');
    if (result.summary.unknownApprovals) warnings.add('Missing approval evidence means UNKNOWN, not unapproved or approved.');
    result.warnings = [...warnings];
    return result;
  } catch {
    const failed = emptyReport(); failed.errors.push('Invalid or unsupported trace structure; no partial analysis returned'); return failed;
  }
}
