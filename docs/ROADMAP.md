# Coldgate development roadmap

Status: v0.8.0 is the pilot-readiness checkpoint. v0.7.0 hardened integration, v0.6.0 added authority change semantics, and v0.5 added evidence measurement. The source of authority remains explicit claims, not one safety score.

## Pending review fixes — PR #1

As checked on 2026-10-18, [PR #1](https://github.com/canadianbaconking-collab/coldgate/pull/1) is open and draft. Its reviewed code commit is `6adba3490ffa12b944fed6700a1024027e5e5a4a`; GitHub reports it mergeable, but there are no submitted reviews or review threads. Mergeability does not establish merge readiness.

The PR preserves supported boundary/scope values rather than truncating them, rejects lossy semantic identifiers, and classifies exact filesystem/network-to-wildcard transitions directionally. Its regression tests exercise scanner-to-diff change gates and invalid inputs. The PR description reports 108 tests passed on Windows/Node 24.19.0, two permission-dependent symlink subtests skipped, successful JavaScript/compiled CLI checks, and isolated offline package verification. These are recorded local results, not independently reproduced results from this review.

**Validation gate completed on 2026-10-18:** [hosted PR run 39148575539](https://github.com/canadianbaconking-collab/coldgate/actions/runs/39148575539) passed all three jobs. Candidate head `63331bb2ddf89694e9c228b2ee4d83003ed69532` was tested through GitHub's synthetic merge commit `7ed7f06a473be74d7568d885385c01fa521746f2` against main `87844dd8bbfeefae60202d175f18eefc51eecb0f`.

On Ubuntu, Node 22.18.0 and 24.21.0 each passed 110 tests with zero failures and zero skips. Job logs confirm both permission-dependent symlink subtests executed and passed. Both package jobs built and verified the 23-file, 33.3 KiB tarball through isolated offline installation and scan, diff, and trace checks. The composite Action job passed its expected-failure and expected-success category gates.

The workflow now triggers for pull requests targeting main as well as main pushes and manual dispatch; the main-only job conditions were removed. Read-only contents permission, pinned actions, and disabled persisted checkout credentials remain. This closes the missing hosted-validation gate for the cited candidate. PR #1 remains draft and unmerged; passing CI does not constitute review approval or a release decision.

## v0.5 — Evidence Depth (completed)

| Checkpoint | Deliverable | Acceptance |
| --- | --- | --- |
| 0.5a: source evidence | Conservative description patterns, independent INFERRED claim provenance, validation and connected-catalog propagation | Negated/quoted/hypothetical text stays UNKNOWN; annotation evidence remains DECLARED; raw description is excluded from reports; existing snapshots validate. |
| 0.5b: reconciliation | Deterministic conflict rules with stable CG007; new IDs for new conflicts and UNKNOWN combined with wildcard, network, consequential hints, or named credentials/scopes | Rules explain disagreeing sources, preserve uncertainty, use no severity score; adversarial fixtures cover contradictions and benign uses. |
| 0.5c: measurement | A separately executable, independently labeled corpus from licensed, pinned public definitions; benchmark of recall, false positives, UNKNOWN, contributions, contradictions | No live server invocation; each sample has a pinned implementation/documentation source, license, and independent label; real contradiction rate is unavailable because none are labeled. |
| 0.5d: coverage and release | Effect, approval, inventory, and boundary evidence summaries in scan text and structured reports; README, changelog, architecture, threat model and examples current | Coverage counts reconcile to record totals; the full suite and benchmark run cleanly; remote release commit matches local files. |

See [Evidence Depth](EVIDENCE.md) and the [pinned corpus](../fixtures/corpus/README.md) for the measured development/holdout split. The v0.4 trace model stays a separate OBSERVED source. A recorded tool call establishes a telemetry assertion, while its side effects can remain INFERRED or UNKNOWN. A future join between static and trace records needs explicit matching identities, trace completeness caveats, and separate claims. Do not silently merge same-named tools or treat approval records as enforcement.

No new configuration adapters during Evidence Depth. Supported old report schema 0.1 remains readable, with optional fields added only when justified. Older saved snapshots remain schema-readable, but snapshots produced before PR #1 may contain truncated boundary or scope values. Rescan their original configurations before relying on comparisons of long values; schema validity cannot recover lost information. Breaking schema revisions require explicit migration and documentation.

## v0.6 — Authority change semantics

Categorize represented expansions/contractions, approval weakening/strengthening, boundary widening/narrowing, credentials/scopes, consequential effects, inventory exposure, uncertainty, and evidence strength separately. Directional labels describe represented claims only. Add a deterministic CI gate for selected change categories; no total risk score or claimed runtime revocation. Keep `--fail-on change` compatible.

Diff now adds `category` labels, a selected category CLI/Action gate, and an explicit uncertainty change. `--fail-on change` retains its prior any-change behavior; unsupported selectors return exit 2. See [Diff semantics](DIFF.md). The hosted Action gate passed in the [0.7.0 integration run](https://github.com/canadianbaconking-collab/coldgate/actions/runs/36349044210).

## Integration hardening

The root package builds a small JavaScript tarball and verifies an isolated offline install of all three CLI commands. Individual source workspaces remain private and are not installable tarballs. The [integration smoke run](https://github.com/canadianbaconking-collab/coldgate/actions/runs/36349044210) passed package checks on Node 22.18 and 24 and the composite Action gate on a hosted runner. An [external pull request example](../examples/github-actions/coldgate-diff.yml) pins a trusted Coldgate commit and compares separately scanned base/candidate configurations; it has not been exercised in an independent repository. Preserve untrusted PR and secret boundaries. npm publication remains a separate decision; the existing public repository's visibility is unchanged.

## Decision gate

The [independent-use procedure](PILOT.md) now records setup friction, reviewed findings, and source-backed misses; its local count-only helper avoids copying identifiers into feedback summaries. This is pilot readiness, **not independent validation**. Seek independently operated configurations before automatic platform expansion. PolicyReplay can then consume explicit trace evidence and deterministic policies; runtime enforcement waits for evidence of demand and a separate threat model.
