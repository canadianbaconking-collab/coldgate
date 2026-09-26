# Changelog

## 0.2.0 — Connect native approval policy and saved catalogs

- Add explicit server-to-catalog bindings through `approval-doctor.project.json`.
- Join native OpenAI Responses MCP approval settings to saved tool definitions.
- Preserve separate config/catalog evidence and SHA-256 catalog fingerprints.
- Apply name allowlists, retain missing configured names as UNKNOWN inventory, and report unresolved annotation filters.
- Reject missing, orphaned, duplicate, mismatched, paginated, and unsafe file bindings.
- Never import catalog-supplied approval policy or resource restrictions as client controls.
- Add two-server runnable example, full setup documentation, and 16 connection regression tests (42 tests total).

## 0.1.1 — Input validation and failure reporting

- Reject malformed tool/server rows, duplicate names, incompatible root containers, invalid approval selectors, and normalized identity collisions.
- Report validation and parse failures in SARIF invocation diagnostics and return exit 2.
- Preserve explicit server-wide approval declarations when the catalog is unknown.
- Keep annotation-dependent selectors unresolved rather than resolving from names alone.
- Preserve usable declared effect evidence for tools with unrecognized names; deduplicate effects.
- Treat an explicit empty native allowlist as zero candidate operations.
- Expand regression coverage from 7 to 26 tests; retain the existing golden text report.

## 0.1.0 — Initial working checkpoint

Authority Model, Approval Doctor CLI, static MCP and OpenAI JSON adapters, nine deterministic rules, fixture corpus, and text/JSON/SARIF output. No runtime enforcement or npm publication.
