import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdtemp, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { normalizeTrace } from '../packages/trace/src/normalize.ts';
import { renderHtml, renderTrace } from '../packages/trace/src/render.ts';
import { main } from '../packages/trace/src/cli.ts';

const fixture = async (name: string) => JSON.parse(await readFile(`examples/trace/${name}.json`, 'utf8'));
const spans = (x: any) => x.resourceSpans[0].scopeSpans[0].spans;
const sink = () => ({ value: '', write(s: string) { this.value += s; return true; } });
const output = (s: ReturnType<typeof sink>) => s as typeof process.stdout;

test('OpenAI function events are ordered and keep approvals separate from effects', async () => {
  const r = normalizeTrace(await fixture('openai'));
  assert.deepEqual(r.errors, []); assert.equal(r.events.length, 3); assert.equal(r.summary.omittedSpans, 1);
  assert.deepEqual(r.events.map(e => e.spanId), ['span_read', 'span_approval', 'span_failed']);
  assert.equal(r.events[0].effects.status, 'INFERRED'); assert.equal(r.events[0].operation.status, 'OBSERVED');
  assert.equal(r.events[0].outcome.value, 'ENDED_WITHOUT_REPORTED_ERROR');
  assert.equal(r.events[1].approval.value, 'DENIED'); assert.equal(r.events[2].approval.value, 'UNKNOWN');
  assert.equal(r.summary.unknownApprovals, 2); assert.equal(r.summary.reportedErrors, 1);
});
test('OTLP nanoseconds survive JS precision, and destinations exclude URL secrets', async () => {
  const r = normalizeTrace(await fixture('otlp'));
  assert.deepEqual(r.errors, []); assert.deepEqual(r.events.map(e => e.kind), ['tool', 'network', 'resource']);
  assert.equal(r.events[0].startUnixNano, '1790452800000000001');
  assert.equal(r.events[1].startUnixNano, '1790452800000000002');
  assert.equal(r.events[1].destination.value, 'api.example.invalid');
  assert.equal(r.events[0].outcome.value, 'REPORTED_OK'); assert.equal(r.events[0].approval.value, 'APPROVED');
  assert.deepEqual(r.events[1].effects.value, ['EXTERNAL_COMMUNICATION']); assert.equal(r.events[1].effects.status, 'INFERRED');
  assert.deepEqual(r.events[2].effects.value, ['READ']); assert.equal(r.events[2].effects.status, 'INFERRED');
  assert.equal(r.events[2].resource.value, 'docs/overview');
});
test('all outputs exclude raw arguments, results, error details, and unrecognized resource URIs', async () => {
  for (const name of ['openai', 'otlp']) {
    const r = normalizeTrace(await fixture(name));
    for (const rendered of [JSON.stringify(r), renderTrace(r, 'text'), renderTrace(r, 'markdown'), renderHtml(r)]) {
      assert.ok(!rendered.includes('SYNTHETIC_')); assert.ok(!rendered.includes('ENFORCED'));
    }
  }
});
test('OTLP unset status stays unknown, and unfinished records are not successful', async () => {
  const x = await fixture('otlp'); for (const s of spans(x)) s.status = {};
  spans(x)[0].endTimeUnixNano = '0';
  const r = normalizeTrace(x);
  assert.equal(r.events[0].outcome.value, 'UNKNOWN'); assert.equal(r.events[2].outcome.value, 'INCOMPLETE');
});
test('missing timestamps sort last and produce explicit caveats', async () => {
  const x = await fixture('openai'); x.spans[0].started_at = null; x.spans[0].ended_at = null;
  const r = normalizeTrace(x); assert.deepEqual(r.errors, []);
  assert.equal(r.events.at(-1)?.startUnixNano, null); assert.ok(r.warnings.some(w => w.includes('chronological')));
});
test('ISO offsets normalize and submillisecond order remains exact', async () => {
  const x = await fixture('openai'); x.spans[3].started_at = '2026-09-26T13:00:00.000000002-07:00';
  assert.equal(normalizeTrace(x).events[0].startUnixNano, '1790452800000000002');
});
test('missing parents and dropped telemetry warn without inventing relationships', async () => {
  const x = await fixture('otlp'); spans(x)[0].parentSpanId = 'f'.repeat(16); spans(x)[0].droppedEventsCount = 2;
  const r = normalizeTrace(x); assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some(w => w.includes('parent'))); assert.ok(r.warnings.some(w => w.includes('dropped')));
});
test('a reused span ID in different traces is allowed and never merges their parents', async () => {
  const x = await fixture('openai'); const s = structuredClone(x.spans[3]); s.trace_id = 'trace_other'; x.spans.push(s);
  const r = normalizeTrace(x); assert.deepEqual(r.errors, []); assert.equal(r.summary.traces, 2);
});
for (const mode of ['duplicate', 'cycle', 'reversed time', 'invalid date', 'invalid name', 'malformed span', 'ambiguous root', 'invalid approval'] as const) test(`OpenAI rejects ${mode} without partial results`, async () => {
  const x = await fixture('openai');
  if (mode === 'duplicate') x.spans.push(x.spans[0]);
  if (mode === 'cycle') x.spans[2].parent_id = x.spans[0].id;
  if (mode === 'reversed time') x.spans[0].ended_at = '2026-01-01T00:00:00Z';
  if (mode === 'invalid date') x.spans[0].started_at = '2026-02-30T00:00:00Z';
  if (mode === 'invalid name') x.spans[0].span_data.name = {};
  if (mode === 'malformed span') x.spans.push(null);
  if (mode === 'ambiguous root') x.resourceSpans = [];
  if (mode === 'invalid approval') x.spans[1].span_data.data.decision = 'ENFORCED';
  const r = normalizeTrace(x); assert.ok(r.errors.length); assert.deepEqual(r.events, []); assert.equal(r.summary.spans, 0);
});
for (const mode of ['unsafe integer', 'invalid hex', 'duplicate attribute', 'wrong anyvalue', 'missing tool name', 'invalid status', 'wrong container', 'too many spans'] as const) test(`OTLP rejects ${mode}`, async () => {
  const x = await fixture('otlp'), s = spans(x)[2];
  if (mode === 'unsafe integer') s.startTimeUnixNano = 1790452800000000001;
  if (mode === 'invalid hex') s.spanId = 'z'.repeat(16);
  if (mode === 'duplicate attribute') s.attributes.push(s.attributes[0]);
  if (mode === 'wrong anyvalue') s.attributes[0].value = {intValue: '1'};
  if (mode === 'missing tool name') s.attributes = s.attributes.filter((a: any) => a.key !== 'gen_ai.tool.name');
  if (mode === 'invalid status') s.status.code = 'OK';
  if (mode === 'wrong container') x.resourceSpans[0].scopeSpans = {};
  if (mode === 'too many spans') x.resourceSpans[0].scopeSpans[0].spans = Array(10001).fill(s);
  const r = normalizeTrace(x); assert.ok(r.errors.length); assert.deepEqual(r.events, []);
});
test('unsupported span types are counted; empty or unknown input cannot produce a clean review', async () => {
  const x = await fixture('openai'); x.spans = [x.spans[2]];
  const r = normalizeTrace(x); assert.equal(r.summary.omittedSpans, 1); assert.ok(r.warnings.some(w => w.includes('No supported')));
  for (const bad of [null, {}, [], { spans: [] }, {resourceSpans: []}]) assert.ok(normalizeTrace(bad).errors.length);
});
test('HTML and Markdown escape active content; terminal output strips controls', async () => {
  const x = await fixture('openai'); x.spans[3].span_data.name = '<script>alert(1)</script> @everyone \u001b[31m';
  const r = normalizeTrace(x), h = renderHtml(r);
  assert.ok(!h.includes('<script>')); assert.ok(h.includes('&lt;script&gt;')); assert.ok(h.includes("default-src 'none'"));
  assert.ok(!renderTrace(r, 'markdown').includes('@everyone')); assert.ok(!renderTrace(r, 'text').includes('\u001b'));
});
test('CLI outputs, error gates and exclusive file creation work', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'coldgate-trace-'));
  try {
    const o = sink(), e = sink();
    assert.equal(await main(['examples/trace/otlp.json', '--format', 'json', '--fail-on', 'reported-error'], output(o), output(e)), 1);
    assert.equal(JSON.parse(o.value).summary.toolCalls, 1);
    const path = join(dir, 'review.html');
    assert.equal(await main(['examples/trace/openai.json', '--format', 'html', '--output', path], output(sink()), output(e)), 0);
    assert.match(await readFile(path, 'utf8'), /Coldgate — Trace review/);
    assert.equal(await main(['examples/trace/openai.json', '--output', path], output(sink()), output(e)), 2);
    const bad = join(dir, 'bad.json'); await writeFile(bad, '{PRIVATE_BAD_JSON');
    const out = sink(); assert.equal(await main([bad, '--format', 'json'], output(out), output(e)), 2);
    assert.ok(!out.value.includes('PRIVATE_BAD_JSON'));
    for (const args of [[], ['--format'], ['examples/trace/openai.json', '--output'], ['examples/trace/openai.json', '--format', 'unknown']]) assert.equal(await main(args, output(sink()), output(e)), 2);
  } finally { await rm(dir, {recursive: true, force: true}); }
});
test('CLI rejects symlinks, directories and oversized trace inputs', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'coldgate-trace-input-'));
  try {
    const large = join(dir, 'large.json'); await writeFile(large, ' '.repeat(8_000_001));
    for (const file of [dir, large]) assert.equal(await main([file], output(sink()), output(sink())), 2);
    await t.test('rejects a symlink when the host permits creating one', async t => {
      const link = join(dir, 'link.json');
      try { await symlink(resolve('examples/trace/openai.json'), link); }
      catch (error) {
        if (process.platform === 'win32' && (error as NodeJS.ErrnoException).code === 'EPERM') return t.skip('Windows symlink creation requires permission');
        throw error;
      }
      assert.equal(await main([link], output(sink()), output(sink())), 2);
    });
  } finally { await rm(dir, {recursive: true, force: true}); }
});
test('unified Coldgate command dispatches trace and rejects unknown commands', () => {
  const run = (...args: string[]) => spawnSync(process.execPath, ['packages/cli/bin/coldgate.js', ...args], {encoding: 'utf8'});
  assert.equal(run('trace', 'examples/trace/otlp.json', '--fail-on', 'reported-error').status, 1);
  assert.match(run('trace', '--help').stdout, /coldgate trace/); assert.equal(run('traces').status, 2);
});
