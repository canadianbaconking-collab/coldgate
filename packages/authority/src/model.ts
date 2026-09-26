/** Strength of evidence, independent of whether a capability is safe. */
export type Status = 'DECLARED' | 'INFERRED' | 'OBSERVED' | 'ENFORCED' | 'UNKNOWN';
export type Effect = 'READ' | 'WRITE' | 'DESTRUCTIVE' | 'EXECUTE' | 'EXTERNAL_COMMUNICATION' | 'OPEN_WORLD' | 'UNKNOWN';
export type Approval = 'NOT_REQUIRED' | 'REQUIRED' | 'CONDITIONAL' | 'INHERITED' | 'UNSPECIFIED' | 'UNKNOWN';
export type BoundaryKind = 'file' | 'directory' | 'repository' | 'repository_pattern' | 'domain' | 'api' | 'account' | 'arbitrary_filesystem' | 'arbitrary_network' | 'unknown';
export interface Claim<T> { value: T; status: Status; source: string; explanation: string; }
export interface Boundary { kind: BoundaryKind; value: string; claim: Claim<string>; }
export interface Principal { kind: 'user' | 'agent' | 'subagent' | 'mcp_server' | 'tool' | 'service_identity' | 'unknown'; name: string; claim: Claim<string>; }
export interface Capability {
  provider: string;
  operation: string;
  effects: Claim<Effect[]>;
  effectEvidence: Claim<Effect>[];
  boundaries: Boundary[];
  destination: Claim<string>;
  credentialNames: Claim<string[]>;
  scopes: Claim<string[]>;
  approval: Claim<Approval>;
  delegation: Claim<string>;
  persistence: Claim<string>;
  /** Only allowlisted nonsecret raw metadata. Original JSON is never returned. */
  annotations: { readOnlyHint?: boolean; destructiveHint?: boolean; openWorldHint?: boolean; idempotentHint?: boolean };
}
export interface AuthorityRecord { id: string; principal: Principal; capability: Capability; inventory: Claim<'snapshot' | 'unknown'>; }
export interface Finding {
  rule: string; level: 'OK' | 'INFO' | 'REVIEW' | 'WARN' | 'UNKNOWN'; recordId: string;
  observed: string; inferred: string; reason: string; missing: string; evidence: string[];
}
export interface Report { schemaVersion: '0.1'; source: string; format: string; records: AuthorityRecord[]; findings: Finding[]; errors: string[]; }
