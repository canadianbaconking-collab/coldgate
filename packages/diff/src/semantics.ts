/** Directions describe differences in represented claims, never effective runtime authority. */
export const SELECTORS = [
  'effects:expansion', 'effects:contraction', 'effects:mixed', 'effects:unresolved',
  'approval:weakening', 'approval:strengthening', 'approval:unresolved',
  'boundaries:widening', 'boundaries:narrowing', 'boundaries:unresolved',
  'credentials:expansion', 'credentials:contraction', 'credentials:mixed', 'credentials:unresolved',
  'scopes:expansion', 'scopes:contraction', 'scopes:mixed', 'scopes:unresolved',
  'parameters:widening', 'parameters:narrowing', 'parameters:unresolved',
  'inventory:exposure', 'inventory:reduction', 'inventory:unresolved',
  'uncertainty:increase', 'uncertainty:decrease', 'uncertainty:changed',
  'evidence:gain', 'evidence:loss', 'evidence:changed',
  'other:changed',
] as const;
export type Selector = typeof SELECTORS[number];
export function setDirection(before: string[], after: string[], unknown = false): 'expansion' | 'contraction' | 'mixed' | 'unresolved' {
  if (unknown) return 'unresolved';
  const added = after.some(v => !before.includes(v)), removed = before.some(v => !after.includes(v));
  return added && removed ? 'mixed' : added ? 'expansion' : removed ? 'contraction' : 'unresolved';
}
export function approvalDirection(before: string, after: string): 'weakening' | 'strengthening' | 'unresolved' {
  if (before === 'REQUIRED' && after === 'NOT_REQUIRED') return 'weakening';
  if (before === 'NOT_REQUIRED' && after === 'REQUIRED') return 'strengthening';
  return 'unresolved';
}
export function boundaryDirection(before: string[], after: string[]): 'widening' | 'narrowing' | 'unresolved' {
  // Only a single exact boundary replaced by a wildcard of the same kind is directional.
  if (before.length !== 1 || after.length !== 1) return 'unresolved';
  const [oldKind, oldValue] = before[0].split(/:(.*)/s), [newKind, newValue] = after[0].split(/:(.*)/s);
  // The scanner represents an unrestricted directory/domain with its arbitrary kind.
  const family = (kind: string) => kind === 'arbitrary_filesystem' ? 'directory' : kind === 'arbitrary_network' ? 'domain' : kind;
  if (family(oldKind) !== family(newKind) || oldKind === 'unknown') return 'unresolved';
  // A pre-existing pattern or empty value is not an exact boundary.
  const exact = (value: string) => !!value && !/[?*]/.test(value);
  if (newValue === '*' && exact(oldValue)) return 'widening';
  if (oldValue === '*' && exact(newValue)) return 'narrowing';
  return 'unresolved';
}
export function evidenceDirection(before: string, after: string): 'gain' | 'loss' | 'changed' {
  if (before === 'UNKNOWN' && after !== 'UNKNOWN') return 'gain';
  if (before !== 'UNKNOWN' && after === 'UNKNOWN') return 'loss';
  return 'changed';
}
