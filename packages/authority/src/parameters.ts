import { createHash } from 'node:crypto';
import type { Claim, ParameterSurface } from './model.ts';

function canonical(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical((v as Record<string, unknown>)[k])).join(',') + '}';
  return JSON.stringify(v) ?? 'null';
}
/** Summarize a schema without exporting defaults, enum members, or credential values. */
export function parameterSurface(schema: unknown, source: string): Claim<ParameterSurface> | undefined {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return undefined;
  const s = schema as Record<string, unknown>;
  const props = s.properties && typeof s.properties === 'object' && !Array.isArray(s.properties) ? s.properties as Record<string, unknown> : {};
  const finiteProperties = Object.keys(props).filter(k => {
    const p = props[k];
    return p && typeof p === 'object' && (Object.hasOwn(p, 'const') || Object.hasOwn(p, 'enum'));
  }).sort();
  return { value: { fingerprint: createHash('sha256').update(canonical(schema)).digest('hex'), finiteProperties }, status: 'DECLARED', source, explanation: 'Input schema declaration; fingerprint is not an enforcement or equivalence proof' };
}
