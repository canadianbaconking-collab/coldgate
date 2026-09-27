# Connecting native approval configs

The connection layer accepts a native OpenAI Responses API tool configuration and separately saved MCP tool catalogs. It uses a small Coldgate manifest to say which catalog belongs to which configured server. Approval remains a declaration until runtime enforcement is independently established.

## Native configuration

Save the `tools` portion of your Responses request (other ordinary request fields can remain):

```json
{
  "tools": [{
    "type": "mcp",
    "server_label": "repository",
    "server_url": "https://your-server.example/mcp",
    "allowed_tools": ["list_issues", "create_issue", "delete_issue"],
    "require_approval": {
      "always": {"tool_names": ["create_issue", "delete_issue"]},
      "never": {"tool_names": ["list_issues"]}
    }
  }]
}
```

For an explicit blanket requirement, replace the selector with `"require_approval": "always"`. The analyzer also recognizes `"never"`, but does not recommend disabling approval automatically. The file uses native API fields; it is not a Coldgate policy DSL. Other required request settings, such as model and input, belong in your calling application. Credentials are supplied by that application, not by these examples.

The [official OpenAI MCP guide](https://developers.openai.com/api/docs/guides/tools-connectors-mcp) describes approvals and the native tool interface. The API's documented default requires approval; Coldgate keeps an omitted policy UNSPECIFIED so you can distinguish an explicit boundary from reliance on a default. Unmatched per-tool selectors, conflicting matches, and annotation-dependent selectors remain unresolved rather than claiming an effective runtime result.

## Catalog and binding

Save the full `tools/list` result as JSON using your existing trusted MCP client. Coldgate does not run servers or perform discovery. It accepts either `{ "tools": [...] }` or a JSON-RPC response whose `result` has that shape. Combine all pages first; a remaining `nextCursor` is rejected. Optional `serverName` must match the binding if supplied.

Create `coldgate.project.json`:

```json
{
  "version": 1,
  "config": "responses.json",
  "inventories": [
    {"server": "repository", "file": "catalogs/repository.tools.json"}
  ]
}
```

Every configured server needs exactly one binding, with no extra bindings. Paths are relative to this manifest and must stay beneath it. Connected identities support 1–100 ASCII letters, digits, dots, hyphens, and underscores; unsupported names fail explicitly so display sanitization cannot silently change policy matching.

```powershell
cd C:\dev\playground\coldgate
npm exec -- coldgate scan examples/connected
npm exec -- coldgate scan examples/connected --format json
npm exec -- coldgate scan examples/connected --format sarif --fail-on warning
```

For your project, pass its directory or the exact `coldgate.project.json` path. Directory mode prefers that manifest over standalone files. `scanProject(path)` exposes the same behavior to TypeScript callers.

## Reading the result

- Each connection reports listed, included, excluded, and missing-name counts, plus a SHA-256 fingerprint of the catalog bytes.
- Each tool's effects cite its catalog. Its approval cites the native config.
- Name-only `allowed_tools` lists select exact names. Catalog tools outside the list are excluded. An empty list selects nothing.
- A configured name missing from the catalog is retained as an unknown-inventory record with CG010 REVIEW.
- Annotation-based filters retain candidates with CONDITIONAL selection and CG011 REVIEW. The count is then a candidate count, not proof of exposure.
- Missing files/bindings, identity mismatches, malformed catalogs, or incomplete pagination fail the entire connected report with exit 2 and SARIF execution errors.

The sample config uses two synthetic endpoints and catalogs. The connection is a static association; it does not authenticate a server, activate tools, test credentials, or establish effective privileges.
