# Changelog

## 0.3.0 — AuthorityDiff MVP

- Add a reusable snapshot differ and `authority-diff` CLI with text, JSON, Markdown, and SARIF output.
- Compare tools, effects, external communication, approval, resource boundaries, credential identifiers/scopes, principals, delegation, persistence, selection, inventory knowledge, and evidence provenance.
- Add input-schema fingerprints and top-level finite-constraint summaries without serializing enum/default values.
- Preserve unknown-inventory caveats and reject invalid, failed, duplicate, or inconsistent snapshots.
- Add an optional change exit gate and a composite GitHub Action that writes a job summary without posting comments.
- Add synthetic before/after snapshots and golden review output. 61 tests pass locally, including the Action runner; hosted GitHub Actions execution is not yet verified.

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
