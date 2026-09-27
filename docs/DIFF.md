# Coldgate Diff 0.7.0

Coldgate Diff asks: **what changed in the authority represented by these snapshots?** It consumes one Coldgate Scan report object or a nonempty array of reports on each side. It does not run either agent or MCP server.

## Generate and compare snapshots

Run from the Coldgate checkout in PowerShell:

```powershell
cd C:\dev\playground\coldgate
npm install --ignore-scripts
node packages/cli/bin/coldgate.js scan examples/diff/before-config.json --format json > examples/diff/before.json
node packages/cli/bin/coldgate.js scan examples/diff/after-config.json --format json > examples/diff/after.json
npm exec -- coldgate diff examples/diff/before.json examples/diff/after.json --format markdown
npm exec -- coldgate diff examples/diff/before.json examples/diff/after.json --format sarif
npm exec -- coldgate diff examples/diff/before.json examples/diff/after.json --fail-on change
npm exec -- coldgate diff examples/diff/before.json examples/diff/after.json --fail-on selected --categories approval:weakening,boundaries:widening
```

The two gated commands exit 1 because the example weakens a declared approval requirement and changes an exact repository pattern to a wildcard. Default mode reports changes with exit 0; `--fail-on change` returns 1 for **any** represented change, including provenance/evidence changes. `--fail-on selected` returns 1 only when a change has one of the exact comma-separated `--categories` selectors. Unknown, duplicate, missing, or misplaced selectors exit 2. Invalid or failed snapshots always exit 2; `--fail-on never` selects report-only behavior. Inputs are bounded to 8 MB, 100 reports, and 10,000 records per report.

## Directional categories and CI

Every change retains its original `kind` and adds a `category` field in JSON and SARIF properties, with an `area:direction` label shown in text/Markdown. These labels compare **represented claims**. They do not measure risk, actual privileges, or runtime revocation. Selectors are exact and case-sensitive. `packages/diff/src/semantics.ts` enumerates the supported selectors.

| Area | Directional labels | Conservative interpretation |
| --- | --- | --- |
| `effects` | `expansion`, `contraction`, `mixed`, `unresolved` | Known effect classes were added/removed; any UNKNOWN effect makes direction unresolved. Consequential effects use the same class. |
| `approval` | `weakening`, `strengthening`, `unresolved` | Only REQUIRED ↔ NOT_REQUIRED is directional; conditional, inherited, unspecified, and UNKNOWN transitions remain unresolved. Enforcement is unverified. |
| `boundaries` | `widening`, `narrowing`, `unresolved` | Only one exact boundary replaced by `*` of the same kind is widening, or the reverse is narrowing. Other patterns are not ordered. |
| `credentials`, `scopes` | `expansion`, `contraction`, `mixed`, `unresolved` | Identifier strings were added/removed; UNKNOWN evidence makes direction unresolved, and privileges are not compared. |
| `parameters` | `widening`, `narrowing`, `unresolved` | A top-level finite restriction disappeared/appeared; other schema semantics remain unverified. |
| `inventory` | `exposure`, `reduction`, `unresolved` | Snapshot entries appeared/disappeared. Conditional selection changes remain unresolved; inventory discovery and runtime authority are separate. |
| `uncertainty` | `increase`, `decrease`, `changed` | UNKNOWN effects/inventory/boundaries, unresolved approval, or conditional selection appeared/disappeared. |
| `evidence` | `gain`, `loss`, `changed` | Only status transitions to/from UNKNOWN are gain/loss; DECLARED/INFERRED/OBSERVED/ENFORCED are distinct evidence types, not a single rank. |
| `other` | `changed` | Principal, destination, delegation, persistence, or annotation differences lack a sound direction. |

For a selective gate, choose a short reviewed list such as `approval:weakening,boundaries:widening,effects:expansion,uncertainty:increase`. This choice is policy for the repository consuming the report; review remaining categories in the full summary. Mixed or unresolved changes require explicit selectors if they should fail CI. A `TOOL_REMOVED` entry is `inventory:reduction` **only in the saved representation**.

Use the same snapshot commands with a connected project directory to compare real native configuration/catalog combinations. Save the baseline before editing; do not overwrite it with the new scan. Ignore npm command chatter by using the direct Node snapshot command shown above. The CLI accepts UTF-8 BOMs as well as ordinary UTF-8 JSON.

## What changes are reported

| Area | Interpretation |
| --- | --- |
| Added/removed tool | Entry appears/disappears in represented inventory; no acquisition/revocation proof |
| Effects and external communication | Hint or inference changed, including per-effect evidence |
| Approval | Requirement changed; strength of its evidence is compared separately |
| Resource boundary | Declared value changed; new wildcard warrants review |
| Credentials and scopes | Identifiers/scope claims changed; no secret values or credential probing |
| Parameters | Schema fingerprint changed; disappearance of a top-level enum/const restriction is highlighted |
| Principal/delegation/persistence/destination | Represented claim changed |
| Inventory/selection | Knowledge or configured exposure changed |
| Evidence/provenance | Status or source attribution changed even if the claimed value did not |

Identity is the exact provider/operation tuple. Renames become removal plus addition. Duplicate identities across files fail rather than being merged silently. Unknown inventory or conditional selection adds a report caveat. Input errors prevent a clean comparison. Source-file renames may create provenance findings.

The schema fingerprint is deliberately conservative. It ignores object-key order, but may flag semantically equivalent schemas. It does not solve JSON Schema implication or establish that a changed parameter grants broader real authority. Raw schemas, enum values, defaults and descriptions are not printed. Hashes are not encryption.

## GitHub Action

The repository includes `.github/actions/coldgate-diff/action.yml`. Use Node 22.18+ (24 recommended), a **trusted pinned checkout of Coldgate**, and two snapshot JSON files within `GITHUB_WORKSPACE`. The repository is public; its action is not published to the Marketplace.

After preparing those files and the trusted checkout, the relevant workflow step is:

```yaml
- name: Compare authority
  uses: ./trusted-coldgate/.github/actions/coldgate-diff
  with:
    before: snapshots/before.json
    after: snapshots/after.json
    fail-on: selected
    categories: approval:weakening,boundaries:widening
```

The step writes escaped Markdown to `GITHUB_STEP_SUMMARY`. That is the GitHub-supported job-summary mechanism; it is not a PR comment. If you want a comment, review `--format markdown` output and post it through your existing reviewed workflow. The action needs no write token or secret. Do not use an untrusted PR checkout as the code for a privileged workflow. Inputs are passed through environment variables, not injected into shell command text.

For a consuming repository, adapt [the full pull request example](../examples/github-actions/coldgate-diff.yml). It checks out the protected base and candidate configurations separately, generates snapshots from both with one reviewed Coldgate commit, and runs the same pinned Action without secrets or a write token. Replace `agent/` with your actual configuration directory and review the chosen selectors. Do not compare two snapshots that a pull request can both rewrite.

The Action runner is tested locally for changed, unchanged, and invalid inputs. The [hosted integration run](https://github.com/canadianbaconking-collab/coldgate/actions/runs/36349044210) passed: the selected weakening failed as expected, an unselected category passed, and package jobs passed on Node 22.18 and 24. The external repository example has not yet been run in another repository. The runner requires Node to have been installed by the calling workflow and limits summary output size. See [GitHub composite actions](https://docs.github.com/en/actions/tutorials/create-actions/create-a-composite-action) and [job summaries](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#adding-a-job-summary).

## Programmatic API

Import `diffSnapshots(before, after)` from the `@coldgate/diff` workspace package. It returns `changes`, `warnings`, and `errors`. Each change includes kind, category, tool, before/after summaries, and explanation. The report remains schema 0.1 and accepts older schema-0.1 snapshots. All decisions are deterministic. No baseline storage service, auto-approval, policy replay, or runtime enforcement is included.
