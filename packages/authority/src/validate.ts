/** Structural checks for the supported analysis inputs, not a full MCP protocol validator.
 * Diagnostics use fixed field names and indices; never interpolate untrusted values.
 */
type Obj = Record<string, unknown>;
const obj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
// Semantic strings must survive display/redaction unchanged; reject unsupported values
// instead of collapsing distinct identities or boundaries to the same sanitized text.
const semanticText = (v: unknown): v is string => text(v) && v.length <= 4096 &&
  !/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/.test(v) &&
  !/(?:token|secret|password|api[_-]?key|authorization)\s*[:=]\s*\S+/i.test(v);
const identity = (v: unknown): v is string => semanticText(v) && v.length <= 120;
const distinct = (v: unknown, check: (x: unknown) => boolean): v is string[] => Array.isArray(v) && v.every(check) && new Set(v).size === v.length;
const names = (v: unknown): v is string[] => distinct(v, identity);
const owns = (v: Obj, k: string) => Object.hasOwn(v, k);

export function validateInput(input: unknown): string[] {
  const errors: string[] = [];
  const fail = (path: string, message: string) => { if (errors.length < 50) errors.push(`${path} ${message}`); };
  if (!obj(input)) return ['Root must be a JSON object'];
  const root = input;
  if (owns(root, 'serverName') && !identity(root.serverName)) return ['serverName must be a supported identifier of at most 120 characters'];
  const formats = ['tools', 'hostedMcpTools', 'mcpServers', 'servers'].filter(k => owns(root, k));
  if (formats.length !== 1) return [formats.length ? 'Ambiguous input: provide exactly one supported root container' : 'Unsupported JSON: expected tools, hostedMcpTools, mcpServers, or servers'];
  const lists = (v: Obj, path: string) => {
    for (const k of ['allowedPaths', 'allowedHosts', 'repositories', 'scopes'])
      if (owns(v, k) && !distinct(v[k], semanticText)) fail(`${path}.${k}`, 'must contain distinct supported strings of at most 4096 characters');
  };
  const overlay = (v: Obj, path: string) => {
    lists(v, path);
    if (owns(v, 'env') && !obj(v.env)) fail(`${path}.env`, 'must be an object');
    else if (obj(v.env) && !Object.keys(v.env).every(identity)) fail(`${path}.env`, 'contains an unsupported credential identifier');
    if (owns(v, 'requiresApproval') && typeof v.requiresApproval !== 'boolean') fail(`${path}.requiresApproval`, 'must be boolean');
    if (owns(v, 'approval') && !['inherited', 'conditional'].includes(v.approval as string)) fail(`${path}.approval`, 'must be inherited or conditional');
    if (owns(v, 'approval') && owns(v, 'requiresApproval')) fail(path, 'contains conflicting approval fields');
  };
  const tools = (v: unknown, path: string) => {
    if (!Array.isArray(v) && !obj(v)) { fail(path, 'must be a tool array or map'); return; }
    const rows = Array.isArray(v) ? v.map((value, i) => [undefined, value, i] as const) : Object.entries(v).map(([key, value], i) => [key, value, i] as const);
    const seen = new Set<string>();
    if (rows.length > 1000) { fail(path, 'exceeds 1000 entries'); return; }
    for (const [key, value, i] of rows) {
      const locator = `${path}[${i}]`;
      if (!obj(value)) { fail(locator, 'must be an object'); continue; }
      const name = key ?? value.name;
      if (!identity(name)) fail(locator, 'requires a supported tool name of at most 120 characters');
      else if (seen.has(name)) fail(locator, 'duplicates a tool name');
      else seen.add(name);
      if (key !== undefined && owns(value, 'name') && value.name !== key) fail(locator, 'has a name different from its map key');
      if (owns(value, 'description') && (typeof value.description !== 'string' || value.description.length > 4096)) fail(`${locator}.description`, 'must be a string of at most 4096 characters');
      overlay(value, locator);
      if (owns(value, 'inputSchema')) {
        if (!obj(value.inputSchema)) fail(`${locator}.inputSchema`, 'must be a JSON Schema object');
        else {
          const stack: [unknown, number][] = [[value.inputSchema, 0]];
          let count = 0;
          while (stack.length) {
            const [item, depth] = stack.pop()!;
            if (++count > 10000 || depth > 64) { fail(`${locator}.inputSchema`, 'exceeds supported schema complexity'); break; }
            if (item && typeof item === 'object') for (const child of Object.values(item)) stack.push([child, depth + 1]);
          }
        }
      }
      if (owns(value, 'annotations')) {
        if (!obj(value.annotations)) fail(`${locator}.annotations`, 'must be an object');
        else for (const k of ['readOnlyHint', 'destructiveHint', 'openWorldHint', 'idempotentHint'])
          if (owns(value.annotations, k) && typeof value.annotations[k] !== 'boolean') fail(`${locator}.annotations.${k}`, 'must be boolean');
      }
    }
  };
  const policy = (v: unknown, path: string, field: string) => {
    if (v === 'always' || v === 'never') return;
    if (!obj(v) || !Object.keys(v).length || Object.keys(v).some(k => k !== 'always' && k !== 'never')) { fail(path, 'must be always, never, or an approval selector'); return; }
    for (const k of ['always', 'never']) if (owns(v, k)) {
      const filter = v[k];
      const read = field === 'toolNames' ? 'readOnly' : 'read_only';
      if (!obj(filter) || !Object.keys(filter).length || Object.keys(filter).some(f => f !== field && f !== read)) { fail(`${path}.${k}`, 'contains an unsupported selector'); continue; }
      if (owns(filter, field) && !names(filter[field])) fail(`${path}.${k}.${field}`, 'must contain distinct nonempty names');
      if (owns(filter, read) && typeof filter[read] !== 'boolean') fail(`${path}.${k}.${read}`, 'must be boolean');
    }
  };
  if (owns(root, 'mcpServers') || owns(root, 'servers')) {
    const key = owns(root, 'mcpServers') ? 'mcpServers' : 'servers';
    const servers = root[key];
    if (!obj(servers)) return [`${key} must be an object`];
    if (Object.keys(servers).length > 100) return [`${key} exceeds 100 servers`];
    Object.entries(servers).forEach(([name, v], i) => {
      const path = `${key}[${i}]`;
      if (!identity(name) || !obj(v)) { fail(path, 'requires a supported named server object'); return; }
      overlay(v, path);
      if (owns(v, 'tools')) tools(v.tools, `${path}.tools`);
    });
  } else if (owns(root, 'hostedMcpTools')) {
    if (!Array.isArray(root.hostedMcpTools)) return ['hostedMcpTools must be an array'];
    if (root.hostedMcpTools.length > 100) return ['hostedMcpTools exceeds 100 servers'];
    root.hostedMcpTools.forEach((v, i) => {
      const path = `hostedMcpTools[${i}]`;
      if (!obj(v) || !identity(v.serverLabel)) { fail(path, 'requires a supported serverLabel'); return; }
      overlay(v, path);
      if (owns(v, 'tools')) tools(v.tools, `${path}.tools`);
      if (owns(v, 'requireApproval')) policy(v.requireApproval, `${path}.requireApproval`, 'toolNames');
    });
  } else {
    if (!Array.isArray(root.tools)) return ['tools must be an array'];
    if (root.tools.some(v => obj(v) && owns(v, 'type'))) {
      if (root.tools.length > 100) return ['tools exceeds 100 server entries'];
      root.tools.forEach((v, i) => {
        const path = `tools[${i}]`;
        if (!obj(v) || v.type !== 'mcp') { fail(path, 'is unsupported; this adapter analyzes MCP entries only'); return; }
        if (!identity(v.server_label)) fail(path, 'requires a supported server_label');
        if (owns(v, 'require_approval')) policy(v.require_approval, `${path}.require_approval`, 'tool_names');
        if (owns(v, 'allowed_tools')) {
          const a = v.allowed_tools;
          if (Array.isArray(a)) { if (!names(a)) fail(`${path}.allowed_tools`, 'must contain distinct nonempty names'); }
          else if (!obj(a) || !Object.keys(a).length || Object.keys(a).some(k => !['tool_names', 'read_only'].includes(k))) fail(`${path}.allowed_tools`, 'contains an unsupported selector');
          else {
            if (owns(a, 'tool_names') && !names(a.tool_names)) fail(`${path}.allowed_tools.tool_names`, 'must contain distinct nonempty names');
            if (owns(a, 'read_only') && typeof a.read_only !== 'boolean') fail(`${path}.allowed_tools.read_only`, 'must be boolean');
          }
        }
      });
    } else tools(root.tools, 'tools');
  }
  return errors;
}
