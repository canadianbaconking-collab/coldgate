# Coldgate development roadmap

Status: v0.6.0 includes authority change semantics and the v0.5 Evidence Depth benchmark and coverage. Integration hardening follows. Work proceeds through reviewable commits and versioned checkpoints. The source of authority remains explicit claims, not one safety score.

## v0.5 — Evidence Depth (completed)

| Checkpoint | Deliverable | Acceptance |
| --- | --- | --- |
| 0.5a: source evidence | Conservative description patterns, independent INFERRED claim provenance, validation and connected-catalog propagation | Negated/quoted/hypothetical text stays UNKNOWN; annotation evidence remains DECLARED; raw description is excluded from reports; existing snapshots validate. |
| 0.5b: reconciliation | Deterministic conflict rules with stable CG007; new IDs for new conflicts and UNKNOWN combined with wildcard, network, consequential hints, or named credentials/scopes | Rules explain disagreeing sources, preserve uncertainty, use no severity score; adversarial fixtures cover contradictions and benign uses. |
| 0.5c: measurement | A separately executable, independently labeled corpus from licensed, pinned public definitions; benchmark of recall, false positives, UNKNOWN, contributions, contradictions | No live server invocation; each sample has a pinned implementation/documentation source, license, and independent label; real contradiction rate is unavailable because none are labeled. |
| 0.5d: coverage and release | Effect, approval, inventory, and boundary evidence summaries in scan text and structured reports; README, changelog, architecture, threat model and examples current | Coverage counts reconcile to record totals; the full suite and benchmark run cleanly; remote release commit matches local files. |

See [Evidence Depth](EVIDENCE.md) and the [pinned corpus](../fixtures/corpus/README.md) for the measured development/holdout split. The v0.4 trace model stays a separate OBSERVED source. A recorded tool call establishes a telemetry assertion, while its side effects can remain INFERRED or UNKNOWN. A future join between static and trace records needs explicit matching identities, trace completeness caveats, and separate claims. Do not silently merge same-named tools or treat approval records as enforcement.

No new configuration adapters during Evidence Depth. Supported old report schema 0.1 remains readable, with optional fields added only when justified. Older saved snapshots should remain valid for diff comparison. Breaking schema revisions require explicit migration and documentation.

## v0.6 — Authority change semantics

Categorize represented expansions/contractions, approval weakening/strengthening, boundary widening/narrowing, credentials/scopes, consequential effects, inventory exposure, uncertainty, and evidence strength separately. Directional labels describe represented claims only. Add a deterministic CI gate for selected change categories; no total risk score or claimed runtime revocation. Keep `--fail-on change` compatible.

Diff now adds `category` labels, a selected category CLI/Action gate, and an explicit uncertainty change. `--fail-on change` retains its prior any-change behavior; unsupported selectors return exit 2. See [Diff semantics](DIFF.md). A hosted Action run remains unverified.

## Integration hardening

Verify npm package contents/install before proposing publication. Exercise the Action in hosted GitHub Actions with a pinned trusted checkout, add an external-repository CI example, and make artifacts easy to consume. Preserve untrusted PR and secret boundaries. Keep packages private and repository visibility unchanged until separately authorized.

## Decision gate

Once Evidence Depth and Diff semantics are useful, seek independent usage rather than automatic platform expansion. PolicyReplay can then consume explicit trace evidence and deterministic policies; runtime enforcement waits for evidence of demand and a separate threat model.
