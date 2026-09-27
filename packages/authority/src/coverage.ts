import type { AuthorityRecord, Coverage } from './model.ts';

export function summarizeCoverage(records: AuthorityRecord[]): Coverage {
  const coverage: Coverage = {
    records: records.length,
    effect: { declaredOnly: 0, inferredOnly: 0, mixed: 0, observedClaim: 0, enforcedClaim: 0, unknown: 0 },
    approval: { explicit: 0, conditionalInherited: 0, observedClaim: 0, unknown: 0 },
    inventory: { snapshot: 0, observedClaim: 0, unknown: 0 },
    boundary: { explicit: 0, inferred: 0, observedClaim: 0, unknown: 0 },
  };
  for (const record of records) {
    const c = record.capability, evidence = c.effectEvidence;
    if (c.effects.value.includes('UNKNOWN') || !evidence.length) coverage.effect.unknown++;
    else if (evidence.some(e => e.status === 'ENFORCED')) coverage.effect.enforcedClaim++;
    else if (evidence.some(e => e.status === 'OBSERVED')) coverage.effect.observedClaim++;
    else if (evidence.some(e => e.status === 'DECLARED') && evidence.some(e => e.status === 'INFERRED')) coverage.effect.mixed++;
    else if (evidence.some(e => e.status === 'INFERRED')) coverage.effect.inferredOnly++;
    else if (evidence.every(e => e.status === 'DECLARED')) coverage.effect.declaredOnly++;
    else coverage.effect.unknown++;

    if (c.approval.status === 'OBSERVED' || c.approval.status === 'ENFORCED') coverage.approval.observedClaim++;
    else if (c.approval.status === 'DECLARED' && ['REQUIRED', 'NOT_REQUIRED'].includes(c.approval.value)) coverage.approval.explicit++;
    else if (['INHERITED', 'CONDITIONAL'].includes(c.approval.value)) coverage.approval.conditionalInherited++;
    else coverage.approval.unknown++;

    if (record.inventory.status === 'OBSERVED' || record.inventory.status === 'ENFORCED') coverage.inventory.observedClaim++;
    else if (record.inventory.value === 'snapshot' && record.inventory.status === 'DECLARED') coverage.inventory.snapshot++;
    else coverage.inventory.unknown++;

    const known = c.boundaries.filter(b => b.kind !== 'unknown');
    if (known.some(b => b.claim.status === 'OBSERVED' || b.claim.status === 'ENFORCED')) coverage.boundary.observedClaim++;
    else if (known.some(b => b.claim.status === 'DECLARED')) coverage.boundary.explicit++;
    else if (known.some(b => b.claim.status === 'INFERRED')) coverage.boundary.inferred++;
    else coverage.boundary.unknown++;
  }
  return coverage;
}
