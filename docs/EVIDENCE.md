# Evidence Depth (0.5.0)

Coldgate Scan answers four separate coverage questions: what effect evidence exists, what approval is represented, whether a tool inventory was saved, and whether a resource boundary is represented. Counts indicate the **source and presence of evidence**, not whether tools are safe or approval/boundaries work at runtime. `coverage` is an optional additive field in schema-0.1 JSON scan reports; old snapshots remain readable, and Coldgate Diff compares supported underlying authority claims rather than a derived coverage count.

## Description-derived effects

A tool description is untrusted, declared metadata. An action inferred from it is tagged **INFERRED**, with a `.description` provenance locator. Name guesses also remain INFERRED at `.name`; MCP annotation hints remain DECLARED at `.annotations`. `effectEvidence` retains separate entries even when two sources yield the same effect. The aggregate effect list deduplicates values, but cannot strengthen a claim into OBSERVED or ENFORCED.

Inference uses anchored leading action phrases from a first clause, plus narrow context-specific patterns for SELECT/INSERT/UPDATE/DELETE SQL, overwriting files, browser navigation, JavaScript evaluation, and adding a reaction. A description such as “Lists files without modifying or deleting them” produces only a READ hypothesis. Quotations, negation and hypothetical claims are deliberately ignored when not independently recognized. This misses other legitimate tools and can still misread ambiguous prose; there is no semantic or runtime proof. Raw description text is excluded from reports; descriptions must be strings of at most 4,096 characters.

Connected native Responses mode imports descriptions from saved catalogs alongside standard schemas and annotations. Catalog approval/scopes still do not become client policy. Names, descriptions, and hints can disagree; no source silently overrides another.

## New rules

| Rule | Review signal | Existing semantics |
| --- | --- | --- |
| CG012 | A description-derived consequential action disagrees with a read-only hint or read-only name, or a destructive description disagrees with `destructiveHint=false`. | Both sources remain visible; behavior remains unverified. |
| CG013 | UNKNOWN effect plus declared wildcard/arbitrary resource boundary. | `CG002` still independently reports the unknown effect. |
| CG014 | UNKNOWN effect plus credential or scope identifiers. | Identifiers do not prove privilege or use. |
| CG015 | A consequential annotation hint exists without recognized name or description operation evidence. | The hint does not establish the real operation. |

CG007 retains its historical read-only-hint versus destructive-hint/name-derived write meaning. CG003 retains its existing approval review. None of these rules produces an overall risk score.

## Coverage fields

Each dimension has disjoint categories whose counts add to `coverage.records`:

- **Effect:** declared only, inferred only, mixed, observed claim, enforced claim, unknown.
- **Approval:** explicit required/not required declaration, conditional/inherited, observed claim, unknown.
- **Inventory:** static snapshot, observed claim, unknown.
- **Boundary:** explicit declaration, inference, observed claim, unknown.

The observed/enforced categories support future evidence sources; the static scanner itself does not create OBSERVED or ENFORCED claims. An explicit boundary may be a wildcard, and an explicit approval declaration need not be enforced. Connected report coverage is recomputed after catalog selection and native approval binding. A failed analysis does not return coverage.

## Quality measurement

Run from `C:\dev\playground\coldgate`:

```powershell
npm run benchmark
node scripts/benchmark.mjs --json
npm test
```

The benchmark reads 28 **selected, pinned public tool excerpts** from five source categories. Its 19 development examples shaped the leading-phrase rules. A nine-case holdout was selected afterward; it is the useful check on that tuning. Current local measurement:

| Metric | Development (19) | Holdout (9) |
| --- | ---: | ---: |
| Consequential effect recall | 19/19 (100%) | 1/4 (25%) |
| Consequential tool recall | 12/12 (100%) | 1/3 (33%) |
| Benign tools flagged consequential | 0/7 | 0/6 |
| UNKNOWN | 0/19 | 3/9 |
| Description-only signal | 5 | 1 |
| Incorrect description effect claims | 0 | 0 |

The holdout misses `browser_snapshot`, `append_insight`, and `slack_reply_to_thread`. The parser therefore under-recognizes some non-verb-leading browser and communication operations. No independent public contradiction was labeled, so contradiction detection rate is **not measurable** on this corpus; synthetic contradiction regression tests establish rule behavior, not real-world detection quality. These figures are small, selected, and in part in-sample. They are not population estimates. Cloud tools remain unscored until pinned definitions and independent ground truth are reviewed.

See [corpus provenance](../fixtures/corpus/README.md). Ground truth was manually labeled from the pinned implementation or provider behavior, not from the tool description being evaluated. No benchmark run starts a server or contacts a service. Revisions to descriptions, handlers, source metadata, or labels should be reviewed as data changes, not hidden inside parser changes.

## Trace boundary

`coldgate trace` preserves OBSERVED telemetry assertions about a recorded call or approval event. Its inferred effects remain separate. Evidence Depth does **not** join a static `read_branch` row to a similarly named trace event automatically: server identity, call matching, sampling, and trace completeness are unresolved. Approval not recorded in a trace stays UNKNOWN; a recorded approval never becomes ENFORCED by itself. Future reconciliation needs an explicit association contract and tests.
