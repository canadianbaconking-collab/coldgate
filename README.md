# Coldgate

**Trust deliberately. Enforce predictably. Keep systems understandable.**

Coldgate v0.1 contains `@frostedlogic/authority`, a reusable TypeScript authority record, and `approval-doctor`, a local static analysis CLI. It shows what a configuration declares, what a tool name suggests, and what remains unknown. It never calls an MCP server, runs its command, uploads configuration, or uses an LLM. There is no account or telemetry.

## Install and run (PowerShell)

Node.js 22.18+ is required; 24 is recommended. The repository is private and the CLI is not published to npm. `npx approval-doctor .` becomes available only after an eventual npm publication. Today use the installed workspace binary:

```powershell
cd C:\dev\playground
git clone https://github.com/canadianbaconking-collab/coldgate.git
cd coldgate
npm install --ignore-scripts
npm exec -- approval-doctor .
npm exec -- approval-doctor fixtures\tools.json --format json
npm exec -- approval-doctor fixtures\openai-hosted-mcp.json --format sarif
npm test
```

`approval-doctor` also accepts `scan` before the input path. An explicit JSON file may have any name. For a directory, it checks `mcp.json`, `.mcp.json`, `claude_desktop_config.json`, `coldgate.json`, `openai-hosted-mcp.json`, `openai-responses.json`, and `tools.json` in the root, `.cursor`, `.vscode`, and `fixtures`. It does not recursively crawl arbitrary source trees. No matches, bad JSON, or unreadable input exits 2. `--fail-on warning` exits 1 when a WARN finding occurs; otherwise findings do not change exit status. A zero exit code does not certify a tool.

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
Frosted Logic — Approval Doctor

tools.json (mcp-tools-snapshot)
  github.push_files | WRITE, DESTRUCTIVE, OPEN_WORLD, EXTERNAL_COMMUNICATION [INFERRED] | approval UNSPECIFIED [UNKNOWN]
    scope: repository_pattern:* [DECLARED]
    WARN CG003: Approval is UNSPECIFIED (UNKNOWN).
      Inference: Potential WRITE, DESTRUCTIVE, OPEN_WORLD, EXTERNAL_COMMUNICATION from inferred evidence. Why: A consequential operation may run without a confirmed approval boundary.
      Missing: Effective approval behavior and an explicit policy for this operation.

Summary: 4 entries; 0 unknown inventories; 0 explicit required approvals; 4 unspecified approvals; 2 warnings; 3 reviews.
Static declarations and hints do not prove runtime enforcement.
```

`DECLARED` means the input says something; `INFERRED` is a rule or tool-name hypothesis; `OBSERVED` would require runtime traces; `ENFORCED` would require evidence that a control actually prevents an action; `UNKNOWN` means the input does not establish it. The static scanner never emits `OBSERVED` or `ENFORCED`. `UNSPECIFIED` is an approval *value*, while `UNKNOWN` is the evidence *status*: they answer different questions. MCP annotations are untrusted descriptive hints, even when they claim read-only behavior. See [architecture](docs/ARCHITECTURE.md) and [threat model](docs/THREAT_MODEL.md).

## Approval examples

A declared write tool with `requiresApproval: true` reports the declared requirement and an INFO reminder that enforcement is unverified. A destructive tool with no policy emits WARN if its effect is hinted or inferred. An unknown tool catalog reports UNKNOWN rather than inventing a list of safe tools. An inherited or conditional approval emits REVIEW because static input cannot resolve each call.

## Development

```powershell
cd C:\dev\playground\coldgate
npm test
npm exec -- approval-doctor fixtures --fail-on warning
```

There are no runtime dependencies. The fixture corpus is synthetic. This initial milestone does not include AuthorityDiff, runtime enforcement, prompt-injection detection, vulnerability scanning, or a hosted service.
