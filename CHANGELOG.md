# Changelog

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
