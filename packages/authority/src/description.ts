import type { Effect } from './model.ts';

/** Small positive assertions only. The description is metadata; these effects remain INFERRED. */
export function inferDescriptionEffects(description: string): Effect[] {
  // First clause only. Quoted examples, negated instructions, and hypothetical language
  // do not establish an action performed by this tool.
  const clause = description.trim().split(/[.;\n]/, 1)[0].trim().toLowerCase();
  if (!clause || /["'`<>]/.test(clause)) return [];
  const start = clause.replace(/^(?:(?:this tool|the tool)\s+|use this tool to\s+)/, '')
    .replace(/^(?:permanently|directly|immediately)\s+/, '');
  // Context-specific phrases where a generic "execute" or "create" verb would
  // misclassify SQL reads or miss an explicitly documented overwrite.
  if (/^executes? (?:an? )?select query\b/.test(start)) return ['READ'];
  if (/^executes? (?:an? )?(?:insert|update|delete)(?:,| or| )/.test(start) && /\bdelete\b/.test(start)) return ['WRITE', 'DESTRUCTIVE'];
  if (/^creates? a new file or completely overwrites? an existing file\b/.test(start)) return ['WRITE', 'DESTRUCTIVE'];
  if (/^evaluates? javascript\b/.test(start)) return ['EXECUTE'];
  if (/^navigates? to a url\b/.test(start)) return ['EXTERNAL_COMMUNICATION', 'OPEN_WORLD'];
  if (/^adds? a reaction\b/.test(start)) return ['WRITE', 'EXTERNAL_COMMUNICATION'];
  const verbs: [RegExp, Effect[]][] = [
    [/^(?:lists?|reads?|retrieves?|searches?|fetches?|views?|gets?)\b/, ['READ']],
    [/^(?:creates?|writes?|updates?|modifies?|edits?|moves?)\b/, ['WRITE']],
    [/^(?:deletes?|removes?|destroys?|drops?|purges?)\b/, ['WRITE', 'DESTRUCTIVE']],
    [/^(?:executes?|runs?|invokes?)\b/, ['EXECUTE']],
    [/^(?:sends?|posts?|uploads?|publishes?)\b/, ['WRITE', 'EXTERNAL_COMMUNICATION']],
  ];
  const effect = verbs.find(([re]) => re.test(start));
  return effect?.[1] ?? [];
}
