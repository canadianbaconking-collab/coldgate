import type { AuthorityRecord, Claim } from '../../authority/src/model.ts';
import { validateSnapshots } from './validate.ts';
import { approvalDirection, boundaryDirection, evidenceDirection, setDirection } from './semantics.ts';
import type { Selector } from './semantics.ts';

export interface Change { kind: string; category: Selector; tool: string; before: string; after: string; explanation: string; }
export interface ColdgateDiff { schemaVersion: '0.1'; changes: Change[]; warnings: string[]; errors: string[]; }
const safe = (v: string): string => v.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/(?:token|secret|password|api[_-]?key|authorization)\s*[:=]\s*\S+/gi, '[redacted]').slice(0, 1000);
const set = (v: string[]) => [...new Set(v)].sort();
const show = (v: unknown) => safe(typeof v === 'string' ? v : JSON.stringify(v));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const key = (r: AuthorityRecord) => JSON.stringify([r.capability.provider, r.capability.operation]);
const title = (r: AuthorityRecord) => safe(`${r.capability.provider}.${r.capability.operation}`);
const claims = (r: AuthorityRecord): Record<string, Claim<unknown>> => ({
  principal: r.principal.claim, inventory: r.inventory, effects: r.capability.effects,
  approval: r.capability.approval, destination: r.capability.destination,
  credentials: r.capability.credentialNames, scopes: r.capability.scopes,
  delegation: r.capability.delegation, persistence: r.capability.persistence,
  ...(r.selection ? { selection: r.selection } : {}), ...(r.capability.parameters ? { parameters: r.capability.parameters } : {}),
});

/** Compare represented claims only. Absence in a snapshot is not proof of revoked authority. */
export function diffSnapshots(before: unknown, after: unknown): ColdgateDiff {
  const a = validateSnapshots(before), b = validateSnapshots(after);
  const result: ColdgateDiff = { schemaVersion: '0.1', changes: [], warnings: [], errors: [...a.errors.map(e => `Before: ${e}`), ...b.errors.map(e => `After: ${e}`)] };
  if (result.errors.length) return result;
  const left = new Map(a.reports.flatMap(r => r.records).map(r => [key(r), r]));
  const right = new Map(b.reports.flatMap(r => r.records).map(r => [key(r), r]));
  if ([...left.values(), ...right.values()].some(r => r.inventory.value === 'unknown' || r.selection?.value === 'CONDITIONAL')) result.warnings.push('At least one snapshot has an unknown inventory or unresolved selection. Added/removed entries may reflect discovery or selection changes.');
  const add = (kind: string, category: Selector, r: AuthorityRecord, old: unknown, next: unknown, explanation: string) => result.changes.push({ kind, category, tool: title(r), before: show(old), after: show(next), explanation });
  for (const id of [...new Set([...left.keys(), ...right.keys()])].sort()) {
    const old = left.get(id), next = right.get(id);
    if (!old || !next) {
      const r = (next ?? old)!;
      add(next ? 'TOOL_ADDED' : 'TOOL_REMOVED', next ? 'inventory:exposure' : 'inventory:reduction', r, old ? `${old.inventory.value} [${old.inventory.status}]` : 'absent', next ? `${next.inventory.value} [${next.inventory.status}]` : 'absent', next ? 'New snapshot entry; this does not establish when runtime authority was acquired.' : 'Entry absent from the new snapshot; revocation is unproven.');
      continue;
    }
    const x = old.capability, y = next.capability;
    const effectDirection = setDirection(set(x.effects.value), set(y.effects.value), x.effects.value.includes('UNKNOWN') || y.effects.value.includes('UNKNOWN') || x.effects.status === 'UNKNOWN' || y.effects.status === 'UNKNOWN');
    if (!same(set(x.effects.value), set(y.effects.value))) add('EFFECTS_CHANGED', `effects:${effectDirection}`, next, set(x.effects.value), set(y.effects.value), 'Declared or inferred effect classes changed. Actual implementation behavior is unverified.');
    if (!x.effects.value.includes('EXTERNAL_COMMUNICATION') && y.effects.value.includes('EXTERNAL_COMMUNICATION')) add('EXTERNAL_EFFECT_ADDED', `effects:${effectDirection === 'expansion' ? 'expansion' : 'unresolved'}`, next, 'not represented', 'EXTERNAL_COMMUNICATION', 'A new external-communication classification is represented in the evidence.');
    if (x.approval.value !== y.approval.value) add('APPROVAL_CHANGED', `approval:${x.approval.status === 'UNKNOWN' || y.approval.status === 'UNKNOWN' ? 'unresolved' : approvalDirection(x.approval.value, y.approval.value)}`, next, `${x.approval.value} [${x.approval.status}]`, `${y.approval.value} [${y.approval.status}]`, x.approval.value === 'REQUIRED' ? 'The explicit requirement changed; review whether consequential calls still need approval.' : 'Approval declaration changed; no runtime enforcement claim.');
    const bx = set(x.boundaries.map(v => `${v.kind}:${v.value}`)), by = set(y.boundaries.map(v => `${v.kind}:${v.value}`));
    if (!same(bx, by)) add('BOUNDARIES_CHANGED', `boundaries:${[...x.boundaries, ...y.boundaries].some(b => b.claim.status === 'UNKNOWN') ? 'unresolved' : boundaryDirection(bx, by)}`, next, bx, by, y.boundaries.some(v => v.value.includes('*') && !x.boundaries.some(o => o.kind === v.kind && o.value === v.value)) ? 'A new wildcard boundary is declared; potential scope expansion needs review.' : 'Declared resource boundaries changed; effective reach remains unverified.');
    for (const [field, kind] of [['credentialNames', 'CREDENTIALS_CHANGED'], ['scopes', 'SCOPES_CHANGED']] as const) {
      if (!same(set(x[field].value), set(y[field].value))) add(kind, `${field === 'credentialNames' ? 'credentials' : 'scopes'}:${setDirection(set(x[field].value), set(y[field].value), x[field].status === 'UNKNOWN' || y[field].status === 'UNKNOWN')}`, next, set(x[field].value), set(y[field].value), field === 'credentialNames' ? 'Credential identifiers changed; values and effective privileges are not compared.' : 'Declared scopes changed; their effective permissions are unverified.');
    }
    for (const [field, kind] of [['destination', 'DESTINATION_CHANGED'], ['delegation', 'DELEGATION_CHANGED'], ['persistence', 'PERSISTENCE_CHANGED']] as const)
      if (x[field].value !== y[field].value) add(kind, 'other:changed', next, x[field].value, y[field].value, 'Represented authority claim changed.');
    if (!same([old.principal.kind, old.principal.name, old.principal.claim.value], [next.principal.kind, next.principal.name, next.principal.claim.value])) add('PRINCIPAL_CHANGED', 'other:changed', next, [old.principal.kind, old.principal.name, old.principal.claim.value], [next.principal.kind, next.principal.name, next.principal.claim.value], 'Principal claim changed; identity is not independently verified.');
    if (old.inventory.value !== next.inventory.value) add('INVENTORY_CHANGED', 'inventory:unresolved', next, old.inventory.value, next.inventory.value, 'Inventory knowledge changed; this may explain apparent capability changes.');
    if (old.selection?.value !== next.selection?.value) add('SELECTION_CHANGED', 'inventory:unresolved', next, old.selection?.value ?? 'not recorded', next.selection?.value ?? 'not recorded', 'Configuration selection evidence changed; conditional selection does not prove exposure or reduction.');
    if (x.parameters?.value.fingerprint !== y.parameters?.value.fingerprint) {
      const removed = x.parameters && y.parameters ? x.parameters.value.finiteProperties.filter(k => !y.parameters!.value.finiteProperties.includes(k)) : [];
      const added = x.parameters && y.parameters ? y.parameters.value.finiteProperties.filter(k => !x.parameters!.value.finiteProperties.includes(k)) : [];
      const direction = x.parameters?.status === 'UNKNOWN' || y.parameters?.status === 'UNKNOWN' ? 'unresolved' : removed.length && !added.length ? 'widening' : added.length && !removed.length ? 'narrowing' : 'unresolved';
      add('PARAMETERS_CHANGED', `parameters:${direction}`, next, x.parameters?.value.fingerprint ?? 'not recorded', y.parameters?.value.fingerprint ?? 'not recorded', removed.length ? 'A top-level enum/const restriction is no longer represented. Review possible parameter widening; other constraints may still apply.' : added.length ? 'A top-level enum/const restriction is now represented. Review possible parameter narrowing; other constraints may still apply.' : 'Input-schema fingerprint changed or became available. Direction of authority change is unresolved.');
    }
    const annotations = (r: typeof x) => Object.entries(r.annotations).sort(([a], [b]) => a.localeCompare(b));
    if (!same(annotations(x), annotations(y))) add('ANNOTATIONS_CHANGED', 'other:changed', next, annotations(x), annotations(y), 'MCP descriptive hints changed; these are not enforcement guarantees.');
    const unknown = (r: AuthorityRecord) => [
      ...(r.inventory.value === 'unknown' ? ['inventory'] : []),
      ...(r.selection?.value === 'CONDITIONAL' ? ['selection'] : []),
      ...(r.capability.effects.value.includes('UNKNOWN') || r.capability.effects.status === 'UNKNOWN' ? ['effects'] : []),
      ...(['UNKNOWN', 'UNSPECIFIED', 'CONDITIONAL', 'INHERITED'].includes(r.capability.approval.value) || r.capability.approval.status === 'UNKNOWN' ? ['approval'] : []),
      ...(r.capability.boundaries.some(b => b.kind === 'unknown' || b.claim.status === 'UNKNOWN') ? ['boundaries'] : []),
    ];
    const ux = unknown(old), uy = unknown(next);
    if (!same(ux, uy)) add('UNCERTAINTY_CHANGED', `uncertainty:${uy.some(v => !ux.includes(v)) && ux.some(v => !uy.includes(v)) ? 'changed' : uy.some(v => !ux.includes(v)) ? 'increase' : 'decrease'}`, next, ux, uy, 'Unresolved dimensions changed. Their presence does not establish effective authority.');
    const ca = claims(old), cb = claims(next);
    for (const field of [...new Set([...Object.keys(ca), ...Object.keys(cb)])].sort()) {
      if (ca[field]?.status !== cb[field]?.status) add('EVIDENCE_CHANGED', `evidence:${evidenceDirection(ca[field]?.status ?? 'UNKNOWN', cb[field]?.status ?? 'UNKNOWN')}`, next, `${field}: ${ca[field]?.status ?? 'not recorded'}`, `${field}: ${cb[field]?.status ?? 'not recorded'}`, 'Evidence status changed independently of the claimed value.');
      if (ca[field] && cb[field] && ca[field].source !== cb[field].source) add('PROVENANCE_CHANGED', 'evidence:changed', next, `${field}: ${ca[field].source}`, `${field}: ${cb[field].source}`, 'Source attribution changed; this can reflect a file move or different evidence.');
    }
    const perEffect = (r: typeof x) => set(r.effectEvidence.map(e => `${e.value}:${e.status}:${e.source}`));
    if (!same(perEffect(x), perEffect(y))) add('EFFECT_EVIDENCE_CHANGED', 'evidence:changed', next, perEffect(x), perEffect(y), 'Per-effect evidence changed; the aggregate effect set alone may hide this difference.');
    const boundaryEvidence = (r: typeof x) => set(r.boundaries.map(e => `${e.kind}:${e.value}:${e.claim.status}:${e.claim.source}`));
    if (!same(boundaryEvidence(x), boundaryEvidence(y))) add('BOUNDARY_EVIDENCE_CHANGED', 'evidence:changed', next, boundaryEvidence(x), boundaryEvidence(y), 'Boundary evidence changed independently of whether the boundary is enforced.');
  }
  return result;
}
