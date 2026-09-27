import type { AuthorityRecord, Effect } from './model.ts';

const consequential = (effect: Effect) => ['WRITE', 'DESTRUCTIVE', 'EXECUTE', 'EXTERNAL_COMMUNICATION', 'OPEN_WORLD'].includes(effect);

/** Independent source projections; never overwrite one claim with another. */
export function effectSignals(record: AuthorityRecord) {
  const claims = record.capability.effectEvidence;
  const select = (field: string) => claims.filter(c => c.source.endsWith(`.${field}`));
  return { name: select('name'), description: select('description'), annotations: select('annotations') };
}

export interface EvidenceDisagreement { reason: string; sources: string[]; }
export function reconcileEffects(record: AuthorityRecord): EvidenceDisagreement[] {
  const { name, description, annotations } = effectSignals(record);
  const h = record.capability.annotations;
  const descriptionConsequential = description.filter(c => consequential(c.value));
  const nameReadOnly = name.some(c => c.value === 'READ') && !name.some(c => consequential(c.value));
  const sources = new Set<string>(descriptionConsequential.map(c => c.source));
  const reasons: string[] = [];
  if (descriptionConsequential.length && h.readOnlyHint === true) {
    for (const c of annotations) sources.add(c.source);
    reasons.push('Read-only annotation conflicts with a description-derived consequential effect');
  }
  if (descriptionConsequential.length && nameReadOnly) {
    for (const c of name) sources.add(c.source);
    reasons.push('Read-oriented tool name differs from a description-derived consequential effect');
  }
  if (description.some(c => c.value === 'DESTRUCTIVE') && h.destructiveHint === false) {
    // The raw boolean is normalized to an annotation field, but negative hints
    // do not create a positive effect claim. Locate it via the record evidence.
    sources.add(description[0].source.replace(/\.description$/, '.annotations'));
    reasons.push('Destructive description conflicts with destructiveHint=false');
  }
  return reasons.length ? [{ reason: reasons.join('; '), sources: [...sources].sort() }] : [];
}
