# Independent use pilot

The next decision is whether Coldgate helps a person review authority in a configuration they already use. The 28-case benchmark measures selected tool definitions, not setup time, real-world finding quality, or adoption. The external GitHub Action example has passed an in-repository hosted smoke test, but has not run in an independent repository.

## Run on your own configuration

Use a local checkout of the public repository with Node.js 22.18+; Coldgate is not published to npm. The scanner reads supported JSON files only. It does not start a server, invoke a tool, or upload a report. A folder scan checks only supported file names in known locations; give an explicit path for other names. A connected project can join a native Responses config with a separately saved tool catalog; see [connected setup](CONNECTED_CONFIGS.md).

```powershell
git clone https://github.com/canadianbaconking-collab/coldgate.git
cd coldgate
npm ci --ignore-scripts --no-audit --no-fund
$pilotDir = Join-Path $env:TEMP 'coldgate-pilot'
New-Item -ItemType Directory -Force $pilotDir | Out-Null
$scanFile = Join-Path $pilotDir 'scan.json'
$summaryFile = Join-Path $pilotDir 'summary.json'
$scanOutput = @(npm exec -- coldgate scan C:\path\to\your\config.json --format json)
if ($LASTEXITCODE -ne 0) { throw 'Scan failed; do not use the output for a pilot summary.' }
[System.IO.File]::WriteAllLines($scanFile, $scanOutput, (New-Object System.Text.UTF8Encoding($false)))
$summaryOutput = @(node scripts/pilot-summary.mjs $scanFile)
if ($LASTEXITCODE -ne 0) { throw 'Summary failed; inspect the scan locally.' }
[System.IO.File]::WriteAllLines($summaryFile, $summaryOutput, (New-Object System.Text.UTF8Encoding($false)))
Get-Content $summaryFile
```

The scan report can contain tool names, paths, domain names, credential **names**, and provenance identifiers. The commands write under your temporary directory, outside the checkout. Keep `scan.json` local and out of version control; inspect it before sharing. The count-only summary omits identifiers and finding text, but its aggregate counts can still be sensitive. Inspect it before sharing too. Delete both files when finished if they are no longer needed.

If a directory contains multiple supported inputs, use the directory in place of the config path. Do not count the same tool twice by passing both a project manifest and its underlying files. A successful scan indicates only that the supported static input was parsed. `UNKNOWN`, inferred effects, and declared approval still require human checking.

## Record observations separately

The summary provides counts of reports, records, conditional selections, each evidence coverage category, finding levels, and fixed CG001–CG015 rule IDs. It does not contain tool names, raw descriptions, warning text, a safety score, or proof of enforcement. Rule counts can exceed record counts because a record may have several findings. Coverage is recomputed from validated records, rather than trusted from an optional saved coverage field.

For a useful pilot, make a private note with these fields. Share only what you intentionally disclose:

| Field | Observation to record |
| --- | --- |
| Context | Configuration family (MCP client, saved catalog, native Responses, hosted MCP export), version or date, and whether this is in real use. |
| Setup | Minutes to first complete scan, required edits or catalog export, unsupported fields, and whether a directory scan found the intended input. |
| Review | For each finding inspected, rule ID, whether the explanation led to a useful next action, false alarm, or unresolved question. Keep identifying details local. |
| Misses | For independently checked operations, actual consequential effects absent from the report, with a source of ground truth such as implementation or provider documentation. Do not infer truth from a tool name alone. |
| Evidence gaps | UNKNOWN inventory/effect/approval/boundary counts and which gaps could be resolved with available evidence. |
| Integration | Whether the pinned external pull request workflow ran in a separate repository; include the run URL only if it is safe to disclose. |
| Outcome | Would you use the report again? What decision did it change, if any? |

Do not add pilot cases to the existing benchmark holdout or adjust inference rules merely because they miss a pilot example. Preserve the original input, independent evidence, and expected behavior before using a case for future evaluation. A trace can support an OBSERVED call but does not alone prove side effects or enforcement.

## Decision checkpoint

This checkpoint supplies a repeatable local procedure and a count-only feedback artifact. **No independent pilot result has yet been recorded.** Before building PolicyReplay or another adapter, seek at least two independently operated configurations, record setup friction and reviewed findings with source-backed misses, and exercise the external workflow in a separate repository if its integration is under evaluation. Treat this as a decision criterion, not a claim that demand or accuracy has been established. The [roadmap](ROADMAP.md) keeps runtime enforcement behind a separate demand and threat-model decision.
