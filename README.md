# Coldgate

**Trust deliberately. Enforce predictably. Keep systems understandable.**

Coldgate v0.8.0 contains `@coldgate/authority`, a reusable TypeScript authority record, `coldgate scan`, a local static analysis CLI, `coldgate diff` for comparing saved reports, and `coldgate trace` for reviewing saved execution telemetry. It shows what a configuration declares, what a tool name suggests, and what remains unknown. It never calls an MCP server, runs its command, uploads configuration, or uses an LLM. There is no account or telemetry.

## Install and run (PowerShell)

Node.js 22.18+ is required; 24 is recommended. The repository is public, but Coldgate is not published to npm. Use the checked-out workspace binary:

```powershell
cd C:\dev\playground
git clone https://github.com/canadianbaconking-collab/coldgate.git
cd coldgate
npm install --ignore-scripts
npm exec -- coldgate scan .
npm exec -- coldgate scan fixtures\tools.json --format json
npm exec -- coldgate scan fixtures\openai-hosted-mcp.json --format sarif
npm test
```

For an isolated consumer, build the JavaScript tarball and install it locally. The individual `@coldgate/*` workspaces are source packages; use the root tarball for installation:

```powershell
cd C:\dev\playground\coldgate
npm run verify:package
npm pack --pack-destination ..
cd C:\dev\playground\my-agent
npm install --ignore-scripts ..\coldgate-0.8.0.tgz
.\node_modules\.bin\coldgate.cmd scan .
```

`verify:package` checks the tarball contents and exercises scan, diff, and trace from an isolated offline install. The tarball contains JavaScript runtime files and no fixture corpus or test suite. No registry publication is implied.

Use `coldgate scan` to analyze configuration and `coldgate diff` to compare snapshots. An explicit JSON file may have any name. For a directory, it checks `mcp.json`, `.mcp.json`, `claude_desktop_config.json`, `coldgate.json`, `openai-hosted-mcp.json`, `openai-responses.json`, and `tools.json` in the root, `.cursor`, `.vscode`, and `fixtures`. It does not recursively crawl arbitrary source trees. No matches, bad JSON, or unreadable input exits 2. `--fail-on warning` exits 1 when a WARN finding occurs; otherwise findings do not change exit status. A zero exit code does not certify a tool.

## Connect native approval policy to a saved tool inventory

```powershell
npm exec -- coldgate scan examples/connected
npm exec -- coldgate scan examples/connected --format json
```

The runnable example joins native OpenAI Responses MCP settings to two saved tool catalogs. It demonstrates per-tool approval selectors and server-wide `require_approval: "always"`. Example endpoints and catalog contents are synthetic; they do not represent a live connected account. Replace them with your own native config and saved `tools/list` results. Coldgate never contacts those endpoints.

Create `coldgate.project.json` beside your real configuration:

```json
{
  "version": 1,
  "config": "responses.json",
  "inventories": [
    {"server": "repository", "file": "catalogs/repository.tools.json"}
  ]
}
```

`server` must exactly match the native configuration's `server_label`. Then run `npm exec -- coldgate scan .` in that directory. A root connection manifest takes precedence over loose-file discovery, so the same config and catalog are not counted twice. See [connected setup](docs/CONNECTED_CONFIGS.md) for native fields, trust boundaries, and unsupported selectors.

## Compare authority changes

```powershell
npm exec -- coldgate diff examples/diff/before.json examples/diff/after.json
npm exec -- coldgate diff examples/diff/before.json examples/diff/after.json --format markdown
npm exec -- coldgate diff examples/diff/before.json examples/diff/after.json --fail-on change
npm exec -- coldgate diff examples/diff/before.json examples/diff/after.json --fail-on selected --categories approval:weakening,boundaries:widening
```

The two gated commands deliberately exit 1: the example changes approval, scope, credentials, parameters, and tools. The selective gate fails only on the named directional categories; invalid selectors and snapshots exit 2. Unchanged snapshots exit 0. The CLI compares represented claims, including evidence changes, without treating a removed entry as proven revocation. Source-file moves are reported separately as provenance changes.

See [Coldgate Diff](docs/DIFF.md) for snapshot generation, JSON/SARIF output, and the GitHub Action. The action writes a job summary; Markdown is also ready for human PR review. No PR comment is posted automatically. The package remains unpublished.

## Review recorded capability use

```powershell
npm exec -- coldgate trace examples/trace/openai.json
npm exec -- coldgate trace examples/trace/otlp.json --format html --output trace-review.html
Start-Process .\trace-review.html
```

Imports saved OpenAI Agents Python span exports and OTLP/JSON into a chronological capability timeline. Text, JSON, Markdown, and a standalone offline HTML viewer retain recorded outcomes and approval evidence separately from inferred effects. Missing approvals remain UNKNOWN; raw arguments, results, and error details are omitted. See [trace import contracts and limits](docs/TRACE.md). The examples are synthetic; real production exports remain unvalidated.

## Measure evidence depth

```powershell
npm exec -- coldgate scan examples/connected --format json
npm run benchmark
```

Scan reports now retain name, description, and annotation effect signals independently, flag conflicts and unknown authority combined with broad reach, and summarize effect, approval, inventory, and boundary evidence. The benchmark separates development examples from a nine-case holdout: only 1 of 4 consequential effects was found in that holdout, with no false positives among six benign examples. The parser remains deliberately conservative; see [measurement details and limitations](docs/EVIDENCE.md).

For an independently operated configuration, follow the [local pilot procedure](docs/PILOT.md). Its repository-only summary helper reports counts without copying tool names, paths, or finding text. Independent pilot results have not been recorded yet.

## What is supported

| Format | Example | What it can establish |
| --- | --- | --- |
| MCP client JSON with `mcpServers` or `servers` | `fixtures/mcp.json` | Configured servers and credential **names**. Usually no tool inventory. Optional `tools`, `requiresApproval`, `allowedPaths`, `allowedHosts`, and `repositories` are **Coldgate overlay declarations**, not standard MCP client controls. |
| Saved MCP `tools/list` JSON (`tools` array) | `fixtures/tools.json` | A static catalog with annotation hints and tool names. It does not contain client approval policy. |
| OpenAI Responses API request JSON (`tools` entries with `type: "mcp"`) | `fixtures/openai-responses.json` | Native `server_label`, `allowed_tools`, and `require_approval` declarations. An allowlist is **not** a discovered inventory. |
| OpenAI hosted MCP **JSON export** (`hostedMcpTools` array) | `fixtures/openai-hosted-mcp.json` | Explicit `requireApproval: 'always'/'never'` and `always/never.toolNames` selectors if the exported tool list is included. This is a deliberately narrow interchange format, not a parser for Agents SDK TypeScript source or a native config file. |

A client config without a tool list emits a `provider.*` placeholder with an UNKNOWN inventory. The scanner does not assume that a server exposes zero tools. JSON Schema describes input shape, not effects. Commands, arguments, environment **values**, URLs, and raw JSON are not returned in reports. A tool snapshot can become stale.

Format references: [MCP tool definitions and annotation trust](https://modelcontextprotocol.io/specification/2026-07-28/server/tools), [OpenAI Responses MCP tool fields](https://platform.openai.com/docs/api-reference/responses/create), and [Agents SDK hosted MCP approvals](https://openai.github.io/openai-agents-js/guides/mcp/).

## Example

```text
Coldgate — Scan

tools.json (mcp-tools-snapshot)
  github.push_files | WRITE, DESTRUCTIVE, OPEN_WORLD, EXTERNAL_COMMUNICATION [INFERRED] | approval UNSPECIFIED [UNKNOWN]
    scope: repository_pattern:* [DECLARED]
    WARN CG003: Approval is UNSPECIFIED (UNKNOWN).
      Inference: Potential WRITE, DESTRUCTIVE, OPEN_WORLD, EXTERNAL_COMMUNICATION from inferred evidence. Why: A consequential operation may run without a confirmed approval boundary.
      Missing: Effective approval behavior and an explicit policy for this operation.

Summary: 4 entries; 0 unknown inventories; 0 explicit required approvals; 4 unspecified approvals; 2 warnings; 3 reviews.
Evidence coverage (4 records; not a safety score):
  effects: 0 declared only; 0 inferred only; 3 mixed; 0 observed claims; 0 enforced claims; 1 unknown.
  approvals: 0 explicit; 0 conditional/inherited; 0 observed claims; 4 unknown.
  inventory: 4 snapshots; 0 observed claims; 0 unknown.
  boundaries: 1 explicit; 0 inferred; 0 observed claims; 3 unknown.
Static declarations and hints do not prove runtime enforcement.
```

`DECLARED` means the input says something; `INFERRED` is a rule or tool-name hypothesis; `OBSERVED` would require runtime traces; `ENFORCED` would require evidence that a control actually prevents an action; `UNKNOWN` means the input does not establish it. The static scanner never emits `OBSERVED` or `ENFORCED`. `UNSPECIFIED` is an approval *value*, while `UNKNOWN` is the evidence *status*: they answer different questions. MCP annotations are untrusted descriptive hints, even when they claim read-only behavior. See [architecture](docs/ARCHITECTURE.md) and [threat model](docs/THREAT_MODEL.md).

## Approval examples

A declared write tool with `requiresApproval: true` reports the declared requirement and an INFO reminder that enforcement is unverified. A destructive tool with no policy emits WARN if its effect is hinted or inferred. An unknown tool catalog reports UNKNOWN rather than inventing a list of safe tools. An inherited or conditional approval emits REVIEW because static input cannot resolve each call.

## Development

```powershell
cd C:\dev\playground\coldgate
npm test
npm exec -- coldgate scan fixtures --fail-on warning
```

There are no runtime dependencies. The fixture corpus is synthetic. Runtime enforcement, prompt-injection detection, vulnerability scanning, and a hosted service remain outside this release.

## Checkpoint 0.1.1 — input validation and failure reporting

Malformed supported input now fails the entire document with exit code 2; valid-looking rows in a malformed document are not presented as a complete analysis. SARIF includes failed execution status and error notifications. Duplicate tool names, ambiguous root containers, and normalized identity collisions are rejected. Unknown fields outside the recognized analysis fields are still ignored; this is a structural validator for the supported subset, not a complete MCP schema validator.

Limits: 2 MB per file, 100 servers per server container, 1,000 tools per catalog, and 50 validation diagnostics per document. Each document must contain exactly one root container. Native Responses inputs must contain only MCP tool entries; mixed function/built-in tool requests are explicitly unsupported. Annotation-dependent approval selectors remain CONDITIONAL. An explicit empty `allowed_tools: []` produces no candidate operations; it does not establish whole-agent safety.

Checkpoint 0.1.1 introduced 26 tests, including adversarial input cases and the golden report. Run the rejected-input example explicitly (it is outside normal directory discovery):

```powershell
npm exec -- coldgate scan fixtures/adversarial/malformed-tools.json --format sarif
# Expected exit code: 2
```

See [Evidence Depth](docs/EVIDENCE.md) for source claims, rule semantics, coverage fields, and the separate 28-case benchmark; [Diff semantics](docs/DIFF.md) for the v0.6 directional categories; and the [roadmap](docs/ROADMAP.md) for subsequent integration hardening. Checkpoint history and narrower limitations are recorded in [CHANGELOG.md](CHANGELOG.md).
