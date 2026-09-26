import type { AuthorityRecord, Finding } from './model.ts';

/** Small ordered rules. Each finding separates observation, inference, and missing evidence. */
export function assess(record: AuthorityRecord): Finding[] {
  const { effects, approval, annotations, boundaries } = record.capability;
  const result: Finding[] = [];
  const add = (rule: string, level: Finding['level'], observed: string, inferred: string, reason: string, missing: string, evidence: string[]) =>
    result.push({ rule, level, recordId: record.id, observed, inferred, reason, missing, evidence });
  const consequential = effects.value.some(x => ['WRITE', 'DESTRUCTIVE', 'EXECUTE', 'EXTERNAL_COMMUNICATION', 'OPEN_WORLD'].includes(x));
  if (record.inventory.value === 'unknown') add('CG001', 'UNKNOWN', 'The actual tool catalog is absent.', 'Available operations may differ from configured names.', 'A server declaration or allowed-tools selector is not a live inventory.', 'A trusted tools/list snapshot or runtime inventory.', [record.inventory.source]);
  if (effects.value.includes('UNKNOWN')) add('CG002', 'UNKNOWN', 'No supported effect hint.', 'None.', 'A name without a recognized verb cannot establish behavior.', 'Tool implementation or independent observation.', [effects.source]);
  if (consequential && ['UNSPECIFIED', 'NOT_REQUIRED', 'UNKNOWN'].includes(approval.value)) {
    const dangerous = effects.value.some(x => ['DESTRUCTIVE', 'EXECUTE', 'OPEN_WORLD'].includes(x));
    add('CG003', dangerous ? 'WARN' : 'REVIEW', `Approval is ${approval.value} (${approval.status}).`, `Potential ${effects.value.join(', ')} from ${effects.status.toLowerCase()} evidence.`, 'A consequential operation may run without a confirmed approval boundary.', 'Effective approval behavior and an explicit policy for this operation.', [effects.source, approval.source]);
  }
  if (approval.value === 'INHERITED' || approval.value === 'CONDITIONAL') add('CG004', 'REVIEW', `Approval is ${approval.value} (${approval.status}).`, 'Effective per-tool behavior is unresolved.', 'An inherited or conditional declaration cannot prove a particular call will pause.', 'Resolved rule and enforcement evidence.', [approval.source]);
  if (approval.value === 'REQUIRED') add('CG005', 'INFO', 'Approval is explicitly configured as required.', 'None.', 'Static configuration does not prove runtime enforcement or a human reviewer.', 'Runtime enforcement evidence.', [approval.source]);
  if (annotations.readOnlyHint === true) add('CG006', 'INFO', 'MCP readOnlyHint=true.', 'Tool declares read-only behavior.', 'An MCP annotation is an untrusted descriptive hint.', 'Implementation or observed behavior to establish read-only operation.', [effects.source]);
  if (annotations.readOnlyHint === true && (annotations.destructiveHint === true || effects.value.includes('DESTRUCTIVE') || effects.value.includes('WRITE'))) add('CG007', 'REVIEW', 'Read-only hint conflicts with destructive hint or name-derived write effect.', 'Effect metadata may be contradictory.', 'Do not discard either signal until verified.', 'Independent behavior evidence.', [effects.source]);
  if (consequential && boundaries.every(b => b.kind === 'unknown')) add('CG008', 'REVIEW', 'No supported resource boundary was found.', 'Scope may be broad.', 'Tool reach cannot be determined from this static input.', 'Explicit allowed resources or independent enforcement evidence.', boundaries.map(b => b.claim.source));
  if (boundaries.some(b => b.value === '*')) add('CG009', 'REVIEW', 'A declared resource boundary contains *.', 'Scope could include arbitrary resources.', 'Wildcard scope is wider than a named resource.', 'Effective scope and enforcement behavior.', boundaries.map(b => b.claim.source));
  return result;
}
