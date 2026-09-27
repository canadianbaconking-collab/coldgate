import type { Claim, Effect } from '../../authority/src/model.ts';

export type Outcome = 'REPORTED_OK' | 'REPORTED_ERROR' | 'ENDED_WITHOUT_REPORTED_ERROR' | 'INCOMPLETE' | 'UNKNOWN';
export type ApprovalEvent = 'REQUESTED' | 'APPROVED' | 'DENIED' | 'UNKNOWN';
/** Evidence from an imported log, not authenticated proof of execution or enforcement. */
export interface TraceEvent {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  kind: 'tool' | 'network' | 'resource' | 'approval';
  startedAt: string | null;
  endedAt: string | null;
  startUnixNano: string | null;
  endUnixNano: string | null;
  operation: Claim<string>;
  provider: Claim<string>;
  effects: Claim<Effect[]>;
  outcome: Claim<Outcome>;
  approval: Claim<ApprovalEvent>;
  resource: Claim<string>;
  destination: Claim<string>;
  source: string;
}
export interface TraceReport {
  schemaVersion: '0.1';
  kind: 'coldgate-trace';
  format: 'openai-agents' | 'otlp-json' | 'unknown';
  events: TraceEvent[];
  summary: { spans: number; traces: number; omittedSpans: number; toolCalls: number; networkCalls: number; resourceCalls: number; approvalEvents: number; reportedErrors: number; unknownApprovals: number };
  warnings: string[];
  errors: string[];
}
