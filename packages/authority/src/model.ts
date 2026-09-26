/** Evidence describes what a source supports, not what the running agent actually does. */
export type EpistemicStatus =
  | 'DECLARED' | 'INFERRED' | 'OBSERVED' | 'ENFORCED' | 'UNKNOWN';

export type Effect = 'read' | 'write' | 'delete' | 'execute' | 'network' | 'unknown';
export type Approval = 'required' | 'disabled' | 'unknown';

export interface Evidence<T> {
  value: T;
  status: EpistemicStatus;
  source: string;
}

export interface ResourceBoundary {
  paths: Evidence<string[]>;
  hosts: Evidence<string[]>;
  openWorld: Evidence<boolean>;
}

export interface Authorization {
  credentialNames: Evidence<string[]>;
  scopes: Evidence<string[]>;
  approval: Evidence<Approval>;
  delegation: Evidence<string>;
}

export interface Capability {
  provider: string;
  operation: string;
  effect: Evidence<Effect>;
  boundary: ResourceBoundary;
  authorization: Authorization;
}

export interface AuthorityRecord {
  id: string;
  principal: Evidence<string>;
  agent: Evidence<string>;
  capability: Capability;
  inventory: Evidence<'complete' | 'partial' | 'unknown'>;
}

export interface Finding {
  id: string;
  level: 'warning' | 'note';
  message: string;
  recordId: string;
}

export interface Report {
  schemaVersion: '0.1';
  source: string;
  records: AuthorityRecord[];
  findings: Finding[];
  errors: string[];
}
