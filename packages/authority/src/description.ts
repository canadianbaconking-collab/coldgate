import type { Effect } from './model.ts';

/** Small positive assertions only. The description is metadata; these effects remain INFERRED. */
export function inferDescriptionEffects(description: string): Effect[] {
  // First clause only. Quoted examples, negated instructions, and hypothetical language
  // do not establish an action performed by this tool.
  const clause = description.trim().split(/[.;\n]/, 1)[0].trim().toLowerCase();
  if (!clause || /["'`<>]/.test(clause)) return [];
  const start = clause.replace(/^(?:(?:this tool|the tool)\s+|use this tool to\s+)/, '')
    .replace(/^(?:permanently|directly|immediately)\s+/, '');
  const verbs: [RegExp, Effect[]][] = [
    [/^(?:lists?|reads?|retrieves?|searches?|fetches?|views?)\b/, ['READ']],
    [/^(?:creates?|writes?|updates?|modifies?|edits?)\b/, ['WRITE']],
    [/^(?:deletes?|removes?|destroys?|drops?|purges?)\b/, ['WRITE', 'DESTRUCTIVE']],
    [/^(?:executes?|runs?|invokes?)\b/, ['EXECUTE']],
    [/^(?:sends?|posts?|uploads?|publishes?)\b/, ['WRITE', 'EXTERNAL_COMMUNICATION']],
  ];
  const effect = verbs.find(([re]) => re.test(start));
  return effect?.[1] ?? [];
}
