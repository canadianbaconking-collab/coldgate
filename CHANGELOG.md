# Changelog

## 0.6.0 — Authority change semantics

- Add directional `category` labels to each Diff change without changing existing change kinds or schema-0.1 snapshot compatibility.
- Separate known effect changes, approval weakening/strengthening, exact wildcard boundary changes, identifiers/scopes, finite parameter restrictions, inventory exposure, uncertainty and evidence changes.
- Add `--fail-on selected --categories ...` and the corresponding composite Action input for an exact, deterministic CI gate; preserve `--fail-on change` and invalid-input exit 2.
- Update review output, examples, docs and regression tests; 103 tests pass locally. These are comparisons of represented claims, not verified runtime privilege or enforcement.

## 0.5.0 — Evidence Depth

- Infer a conservative set of effects from leading tool description statements, keeping description, name, and annotation claims separate.
- Preserve CG007 meaning; add CG012 description disagreement and CG013–CG015 composition reviews for unknown effects and consequential hints.
- Validate description length, import connected catalog descriptions, and retain old report schema 0.1.
- Add a separately runnable 28-case pinned public corpus across five categories, split into development (19) and untouched holdout (9). Holdout consequential-effect recall is 1/4; benign false positives 0/6; no independent contradiction cases are labeled.
- Add separate effect, approval, inventory, and boundary evidence coverage counts to text and schema-0.1 JSON reports. Older saved snapshots remain readable.
- Add Evidence Depth guide and roadmap; 98 tests pass locally. Real trace export/hosted Action verification remains unverified.

## 0.4.0 — Coldgate Trace

- Add `@coldgate/trace` and `coldgate trace` for saved OpenAI Agents Python span exports and OTLP/JSON.
- Normalize tool, HTTP client, MCP resource-read, and explicit approval records into a chronological evidence model. Preserve exact nanoseconds and parent IDs.
- Separate reported outcomes, missing approvals, inferred effects, and unauthenticated observations; never claim runtime enforcement.
- Add text, JSON, Markdown, and standalone offline HTML output; optional reported-error exit gate and exclusive output-file creation.
- Omit raw arguments, results, prompts, error details, and URI payloads. Reject malformed inputs, duplicate IDs/attributes, and parent cycles without partial analysis.
- Add synthetic fixtures and 29 trace regression tests (90 total). Real production export validation and hosted Actions runs remain unverified.

### Coldgate naming

- Consolidate commands as `coldgate scan` and `coldgate diff`; use `@coldgate/authority`, `@coldgate/cli`, and `@coldgate/diff` workspace packages.
- Rename the connection manifest to `coldgate.project.json` and the Action to `.github/actions/coldgate-diff`. Update existing integrations to these names.
- Align internal paths, report headers, SARIF tool names, documentation, and examples with Coldgate. Snapshot schema and rule IDs are unchanged.

## 0.3.0 — Coldgate Diff MVP

- Add a reusable snapshot differ and `coldgate diff` CLI with text, JSON, Markdown, and SARIF output.
- Compare tools, effects, external communication, approval, resource boundaries, credential identifiers/scopes, principals, delegation, persistence, selection, inventory knowledge, and evidence provenance.
- Add input-schema fingerprints and top-level finite-constraint summaries without serializing enum/default values.
- Preserve unknown-inventory caveats and reject invalid, failed, duplicate, or inconsistent snapshots.
- Add an optional change exit gate and a composite GitHub Action that writes a job summary without posting comments.
- Add synthetic before/after snapshots and golden review output. 61 tests pass locally, including the Action runner; hosted GitHub Actions execution is not yet verified.

## 0.2.0 — Connect native approval policy and saved catalogs

- Add explicit server-to-catalog bindings through `coldgate.project.json`.
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

Authority Model, Coldgate Scan CLI, static MCP and OpenAI JSON adapters, nine deterministic rules, fixture corpus, and text/JSON/SARIF output. No runtime enforcement or npm publication.
