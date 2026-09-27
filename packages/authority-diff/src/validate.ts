import type { Report, AuthorityRecord } from '../../authority/src/model.ts';
const obj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === 'string' && v.length <= 10000;
const list = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 10000 && v.every(str);
const statuses = ['DECLARED', 'INFERRED', 'OBSERVED', 'ENFORCED', 'UNKNOWN'];
const effects = ['READ', 'WRITE', 'DESTRUCTIVE', 'EXECUTE', 'EXTERNAL_COMMUNICATION', 'OPEN_WORLD', 'UNKNOWN'];
function claim(v: unknown, check: (x: unknown) => boolean): boolean {
  return obj(v) && statuses.includes(v.status as string) && str(v.source) && str(v.explanation) && check(v.value);
}
const oneOf = (values: string[]) => (v: unknown) => typeof v === 'string' && values.includes(v);
const surface = (v: unknown) => obj(v) && typeof v.fingerprint === 'string' && /^[a-f0-9]{64}$/.test(v.fingerprint) && list(v.finiteProperties);

export function validateSnapshots(input: unknown): { reports: Report[]; errors: string[] } {
  const reports = Array.isArray(input) ? input : [input];
  const errors: string[] = [];
  const seen = new Set<string>();
  if (!reports.length || reports.length > 100) return { reports: [], errors: ['Expected 1–100 Approval Doctor reports'] };
  for (const [i, r] of reports.entries()) {
    const fail = () => errors.push(`Report ${i} is malformed, incomplete, or contains analysis errors`);
    if (!obj(r) || r.schemaVersion !== '0.1' || !str(r.source) || !str(r.format) || !Array.isArray(r.findings) || !Array.isArray(r.errors) || r.errors.length || !Array.isArray(r.records) || r.records.length > 10000) { fail(); continue; }
    for (const row of r.records) {
      if (!obj(row) || !str(row.id) || !obj(row.capability) || !obj(row.principal)) { fail(); break; }
      const c = row.capability, p = row.principal;
      const key = JSON.stringify([c.provider, c.operation]);
      if (!str(c.provider) || !c.provider || !str(c.operation) || !c.operation || seen.has(key)) { fail(); break; }
      seen.add(key);
      if (!str(p.kind) || !str(p.name) || !claim(p.claim, str) || !claim(row.inventory, oneOf(['snapshot', 'unknown'])) ||
          !claim(c.effects, v => list(v) && v.length > 0 && v.every(e => effects.includes(e))) ||
          !Array.isArray(c.effectEvidence) || !c.effectEvidence.length || !c.effectEvidence.every(e => claim(e, oneOf(effects))) ||
          !claim(c.approval, oneOf(['NOT_REQUIRED', 'REQUIRED', 'CONDITIONAL', 'INHERITED', 'UNSPECIFIED', 'UNKNOWN'])) ||
          ![c.destination, c.delegation, c.persistence].every(v => claim(v, str)) ||
          ![c.credentialNames, c.scopes].every(v => claim(v, list)) || !obj(c.annotations) ||
          !Array.isArray(c.boundaries) || !c.boundaries.length || !c.boundaries.every(b => obj(b) && ['file', 'directory', 'repository', 'repository_pattern', 'domain', 'api', 'account', 'arbitrary_filesystem', 'arbitrary_network', 'unknown'].includes(b.kind as string) && str(b.value) && claim(b.claim, str) && (b.claim as Record<string, unknown>).value === b.value) ||
          (row.selection !== undefined && !claim(row.selection, oneOf(['INCLUDED', 'CONDITIONAL']))) ||
          (c.parameters !== undefined && !claim(c.parameters, surface))) { fail(); break; }
      const record = row as unknown as AuthorityRecord;
      if (record.capability.effects.value.some(e => !record.capability.effectEvidence.some(c => c.value === e)) || record.capability.effectEvidence.some(e => !record.capability.effects.value.includes(e.value))) { fail(); break; }
      if (Object.values(c.annotations).some(v => typeof v !== 'boolean')) { fail(); break; }
    }
  }
  return { reports: errors.length ? [] : reports as Report[], errors };
}
