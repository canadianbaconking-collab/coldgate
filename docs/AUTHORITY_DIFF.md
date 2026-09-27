# AuthorityDiff 0.3.0

AuthorityDiff asks: **what changed in the authority represented by these snapshots?** It consumes one Approval Doctor report object or a nonempty array of reports on each side. It does not run either agent or MCP server.

## Generate and compare snapshots

Run from the Coldgate checkout in PowerShell:

```powershell
cd C:\dev\playground\coldgate
npm install --ignore-scripts
node packages/approval-doctor/bin/approval-doctor.js examples/diff/before-config.json --format json > examples/diff/before.json
node packages/approval-doctor/bin/approval-doctor.js examples/diff/after-config.json --format json > examples/diff/after.json
npm exec -- authority-diff examples/diff/before.json examples/diff/after.json --format markdown
npm exec -- authority-diff examples/diff/before.json examples/diff/after.json --format sarif
npm exec -- authority-diff examples/diff/before.json examples/diff/after.json --fail-on change
```

The last command exits 1 because the example deliberately changes claims. Default mode reports changes with exit 0; `--fail-on change` returns 1 for **any** represented change, including provenance/evidence changes. Invalid or failed inputs always exit 2. `--fail-on never` selects report-only behavior. Inputs are bounded to 8 MB, 100 reports, and 10,000 records per report.

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

The repository includes `.github/actions/authority-diff/action.yml`. Use Node 22.18+ (24 recommended), a **trusted pinned checkout of Coldgate**, and two snapshot JSON files within `GITHUB_WORKSPACE`. The repository remains private: other repositories need authorized access to its action. It is not published to the Marketplace.

After preparing those files and the trusted checkout, the relevant workflow step is:

```yaml
- name: Compare authority
  uses: ./trusted-coldgate/.github/actions/authority-diff
  with:
    before: snapshots/before.json
    after: snapshots/after.json
    fail-on: change
```

The step writes escaped Markdown to `GITHUB_STEP_SUMMARY`. That is the GitHub-supported job-summary mechanism; it is not a PR comment. If you want a comment, review `--format markdown` output and post it through your existing reviewed workflow. The action needs no write token or secret. Do not use an untrusted PR checkout as the code for a privileged workflow. Inputs are passed through environment variables, not injected into shell command text.

The Action runner is tested locally for changed, unchanged, and invalid inputs. Hosted Actions execution has not been verified. The runner requires Node to have been installed by the calling workflow and limits summary output size. See [GitHub composite actions](https://docs.github.com/en/actions/tutorials/create-actions/create-a-composite-action) and [job summaries](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#adding-a-job-summary).

## Programmatic API

Import `diffSnapshots(before, after)` from the `authority-diff` workspace package. It returns `changes`, `warnings`, and `errors`. Each change includes kind, tool, before/after summaries, and explanation. All decisions are deterministic. No baseline storage service, auto-approval, policy replay, or runtime enforcement is included.
