# Coldgate — Trace

3 spans across 1 trace; 3 capability events; 0 omitted spans.
1 tool call; 1 network call; 1 resource call; 1 approval record; 1 reported error.

REVIEW: Imported telemetry is unauthenticated and may be incomplete\. A recorded call or approval does not prove a completed side effect or enforcement\.

## 1. tool: create\_issue \[OBSERVED\]
  Trace / span: 11111111111111111111111111111111 / 0000000000000001
  Parent span: none recorded
  Start / end (UTC): 2026\-09\-26T20:00:00\.000Z / 2026\-09\-26T20:00:00\.100Z
  Start / end (Unix ns): 1790452800000000001 / 1790452800100000001
  Provider: repository \[OBSERVED\]
  Outcome: REPORTED\_OK \[OBSERVED\]
  Effects: WRITE \[INFERRED\]
  Approval: APPROVED \[OBSERVED\]
  Resource label: demo/project \[OBSERVED\]
  Destination host: unknown \[UNKNOWN\]
  Evidence locator: resourceSpans\[0\]\.scopeSpans\[0\]\.spans\[2\]

## 2. network: POST \[OBSERVED\]
  Trace / span: 11111111111111111111111111111111 / 0000000000000002
  Parent span: 0000000000000001
  Start / end (UTC): 2026\-09\-26T20:00:00\.000Z / 2026\-09\-26T20:00:00\.100Z
  Start / end (Unix ns): 1790452800000000002 / 1790452800100000002
  Provider: unknown \[UNKNOWN\]
  Outcome: REPORTED\_ERROR \[OBSERVED\]
  Effects: EXTERNAL\_COMMUNICATION \[INFERRED\]
  Approval: UNKNOWN \[UNKNOWN\]
  Resource label: unknown \[UNKNOWN\]
  Destination host: api\.example\.invalid \[OBSERVED\]
  Evidence locator: resourceSpans\[0\]\.scopeSpans\[0\]\.spans\[1\]

## 3. resource: resources/read \[OBSERVED\]
  Trace / span: 11111111111111111111111111111111 / 0000000000000003
  Parent span: none recorded
  Start / end (UTC): 2026\-09\-26T20:00:00\.200Z / 2026\-09\-26T20:00:00\.300Z
  Start / end (Unix ns): 1790452800200000000 / 1790452800300000000
  Provider: unknown \[UNKNOWN\]
  Outcome: REPORTED\_OK \[OBSERVED\]
  Effects: READ \[INFERRED\]
  Approval: UNKNOWN \[UNKNOWN\]
  Resource label: docs/overview \[OBSERVED\]
  Destination host: unknown \[UNKNOWN\]
  Evidence locator: resourceSpans\[0\]\.scopeSpans\[0\]\.spans\[0\]

