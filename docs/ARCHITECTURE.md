# Authority Model and Coldgate Scan v0.1

`packages/authority/src/model.ts` defines principals, capabilities, effects, resource boundaries, approval states, and claims with status and provenance. `scan.ts` accepts four static JSON shapes and normalizes them. `rules.ts` turns records into deterministic findings. `packages/cli/src/cli.ts` discovers files and formats text, JSON, or SARIF. No network calls or process execution occur during scanning.

A capability includes provider and operation; a multi-effect summary; zero or more declared resource boundaries; external destination; credential names and scopes; approval, delegation and persistence claims; and allowlisted MCP annotation booleans. Currently unknown destination/delegation/persistence are explicit UNKNOWN claims. Principal defaults to the MCP server in these inputs; downstream agents or user identities cannot be inferred from a server declaration. Inventory is a static snapshot or unknown.

`Claim<T>` stores `value`, `status`, `source` and `explanation`. The aggregate effect summary can mix annotation declarations and name inferences; where it does, its overall status is INFERRED and per-effect evidence keeps their distinct origins. No status is promoted to OBSERVED or ENFORCED. An MCP annotation is only a declaration, and an inferred verb is only a hypothesis. JSON output excludes original config and secret values. Rule IDs CG001–CG009 remain stable within v0.1, but are not a public policy language.

The decisive missing link for later Coldgate Diff is a **stable tool identity paired with comparable evidence**. A diff must compare changes in source, confidence, inventory completeness, and effective approval separately. A changed static catalog alone cannot prove newly acquired or removed runtime authority. Keep prior and current claims side by side instead of reducing them to one severity number.

## Validation boundary (0.1.1)

`validate.ts` checks the recognized container, names, annotation booleans, scope arrays, overlay controls, and approval-selector shapes before normalization. Invalid documents produce diagnostics without partial records. Diagnostic messages use fixed field names and indices rather than input values. Normalized identity collisions are detected before the report is returned. The validator deliberately rejects unsupported/mixed tool formats instead of ignoring their entries.

SARIF records analysis failures in `runs[].invocations[]`, independently of security findings. A successful invocation says only that the supported input was analyzed. Schema version remains 0.1; package version is 0.1.1.

## Connected configurations (0.2.0)

`project.ts` reads a Coldgate project manifest and binds every server in one native Responses MCP configuration to one catalog. It normalizes only standard tool names and annotation hints from the catalog, then assigns approval from the native config and reruns the deterministic rules. Catalog-only tools excluded by an explicit name allowlist do not generate current-capability findings. Missing configured names produce unknown-inventory records and CG010. Annotation-dependent selection retains candidates with a CONDITIONAL selection and CG011.

Reports add optional `connections` metadata and optional per-record `selection` claims. The schema remains additive under 0.1. Fingerprints identify the exact catalog bytes, including JSON-RPC envelopes; they do not authenticate the catalog or establish freshness. Config hashes are deliberately omitted to avoid fingerprinting credentials. Binding by server label is an explicit user declaration, not an independently verified server identity.

## Coldgate Diff (0.3.0)

`packages/diff` validates existing schema-0.1 reports, matches tools by `(provider, operation)` tuples, and emits deterministic changes. Duplicate identities across a report collection fail comparison. Ordering within set-like fields is ignored; provenance and epistemic status remain independently comparable. Connection fingerprints and non-authority narrative changes are not diffed by themselves.

The authority model gains optional `parameters`, a declared canonical input-schema fingerprint plus names of top-level properties with `enum` or `const`. A removed finite restriction is a review hint, not a general JSON Schema widening proof. Reordered object keys leave the fingerprint unchanged; other syntactic changes may still be semantically equivalent. Older reports without this optional claim remain valid and produce a not-recorded-to-recorded change when compared with new ones.

Coldgate Diff validates only the snapshot contract it consumes. It cannot authenticate claimed OBSERVED/ENFORCED evidence. The Action wrapper runs the same CLI, takes snapshot paths through environment variables, checks workspace containment, and writes escaped Markdown to the job summary.

## Coldgate Trace (0.4.0)

`packages/trace` imports saved Python SDK span objects and OTLP/JSON into a distinct `TraceReport`. Events reuse `Claim<T>` and `Effect`, preserving imported OBSERVED assertions separately from INFERRED effects and UNKNOWN missing evidence. No control is reported ENFORCED. Parent IDs are scoped to trace IDs; missing parents warn and cycles fail. Timestamps retain decimal-string nanoseconds for exact ordering.

Adapters copy only allowlisted fields; input/output payloads and error details do not cross the normalization boundary. Rendering operates only on normalized reports. HTML uses escaped text, no JavaScript or remote resources, and a restrictive CSP. The unified CLI dispatches scan, diff, and trace. See [TRACE.md](TRACE.md) for format contracts and limits.
