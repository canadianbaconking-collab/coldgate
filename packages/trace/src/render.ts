import type { TraceEvent, TraceReport } from './model.ts';

const html = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const md = (s: string): string => html(s).replace(/([\\`*_{}\[\]()#+.!|~-])/g, '\\$1').replace(/@/g, '&#64;');
const evidence = (v: {value: unknown; status: string}) => `${Array.isArray(v.value) ? v.value.join(', ') : v.value} [${v.status}]`;
const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
function details(e: TraceEvent): [string, string][] {
  return [['Trace / span', `${e.traceId} / ${e.spanId}`], ['Parent span', e.parentSpanId ?? 'none recorded'],
    ['Start / end (UTC)', `${e.startedAt ?? 'unknown'} / ${e.endedAt ?? 'unknown'}`],
    ['Start / end (Unix ns)', `${e.startUnixNano ?? 'unknown'} / ${e.endUnixNano ?? 'unknown'}`],
    ['Provider', evidence(e.provider)], ['Outcome', evidence(e.outcome)], ['Effects', evidence(e.effects)],
    ['Approval', evidence(e.approval)], ['Resource label', evidence(e.resource)], ['Destination host', evidence(e.destination)], ['Evidence locator', e.source]];
}
export function renderTrace(report: TraceReport, format: 'text' | 'markdown'): string {
  const escape = format === 'markdown' ? md : (s: string) => s;
  const lines = [format === 'markdown' ? '# Coldgate — Trace' : 'Coldgate — Trace', ''];
  for (const error of report.errors) lines.push(`ERROR: ${escape(error)}`);
  if (report.errors.length) return lines.join('\n') + '\nAnalysis failed; no capability conclusion is available.\n';
  const s = report.summary;
  lines.push(`${count(s.spans, 'span')} across ${count(s.traces, 'trace')}; ${count(report.events.length, 'capability event')}; ${count(s.omittedSpans, 'omitted span')}.`,
    `${count(s.toolCalls, 'tool call')}; ${count(s.networkCalls, 'network call')}; ${count(s.resourceCalls, 'resource call')}; ${count(s.approvalEvents, 'approval record')}; ${count(s.reportedErrors, 'reported error')}.`, '');
  for (const w of report.warnings) lines.push(`REVIEW: ${escape(w)}`);
  lines.push('');
  for (const [i, e] of report.events.entries()) {
    lines.push(`${format === 'markdown' ? '## ' : ''}${i + 1}. ${e.kind}: ${escape(evidence(e.operation))}`);
    for (const [label, value] of details(e)) lines.push(`  ${label}: ${escape(value)}`);
    lines.push('');
  }
  return lines.join('\n') + '\n';
}
export function renderHtml(report: TraceReport): string {
  const s = report.summary;
  const cards = [['Capability events', report.events.length], ['Tool calls', s.toolCalls], ['Unknown approvals', s.unknownApprovals], ['Omitted spans', s.omittedSpans]];
  const body = report.errors.length ? `<section class="notice"><h2>Analysis failed</h2>${report.errors.map(e => `<p>${html(e)}</p>`).join('')}<p>No capability conclusion is available.</p></section>` : `
    <section class="metrics" aria-label="Summary">${cards.map(([label, count]) => `<div><strong>${count}</strong><span>${label}</span></div>`).join('')}</section>
    <section class="notice"><h2>Read the evidence carefully</h2><ul>${report.warnings.map(w => `<li>${html(w)}</li>`).join('')}</ul></section>
    <section aria-label="Capability timeline"><div class="section-title"><h2>Recorded capability timeline</h2><span>${count(s.traces, 'trace')} · ${count(s.spans, 'span')}</span></div>
    <p class="muted">Ordered by recorded start time, not causal certainty. Expand a row for evidence and parent IDs. Missing start times appear last.</p>
    ${report.events.length ? report.events.map((e, i) => `<details class="event"${i === 0 ? ' open' : ''}><summary><span class="number">${String(i + 1).padStart(2, '0')}</span><span class="operation"><small>${e.kind.toUpperCase()} · ${html(e.startedAt ?? 'TIME UNKNOWN')}</small><strong>${html(e.operation.value)}</strong></span><span class="badge ${e.outcome.value === 'REPORTED_ERROR' ? 'error' : ''}">${e.outcome.value.replace(/_/g, ' ')}</span></summary><dl>${details(e).map(([label, value]) => `<div><dt>${label}</dt><dd>${html(value)}</dd></div>`).join('')}</dl></details>`).join('') : '<p>No supported capability events found.</p>'}</section>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Coldgate — Trace review</title><style>
:root{color-scheme:dark;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#101820;color:#edf3f5}*{box-sizing:border-box}body{margin:0}main{max-width:1120px;margin:auto;padding:48px 28px 64px}.brand{font-size:14px;letter-spacing:.18em;font-weight:750;color:#9cdeed}header{border-bottom:1px solid #35444e;padding-bottom:28px;margin-bottom:28px}h1{font-size:clamp(30px,5vw,46px);letter-spacing:-.035em;margin:12px 0}h2{font-size:18px}p,li{line-height:1.65}.muted,header p{color:#b7c8d1}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:24px 0}.metrics div{border:1px solid #35444e;padding:22px;background:#17232c}.metrics strong{display:block;font-size:34px;font-weight:650}.metrics span{display:block;color:#b7c8d1;font-size:13px;margin-top:8px}.notice{border-left:3px solid #a2c4d6;background:#1b2a34;padding:8px 22px;margin-bottom:32px}.notice li{font-size:14px;margin:7px 0}.notice ul{padding-left:20px}.section-title{display:flex;align-items:center;justify-content:space-between;gap:16px}.section-title span{font-size:13px;color:#b7c8d1}.event{border-top:1px solid #35444e}.event:last-child{border-bottom:1px solid #35444e}summary{cursor:pointer;display:flex;align-items:center;gap:20px;padding:22px 0;list-style:none}summary:focus-visible{outline:2px solid #9cdeed;outline-offset:4px}.number{font-family:monospace;color:#9cdeed;font-size:16px}.operation{flex:1;min-width:0}.operation small{display:block;color:#b7c8d1;font-size:11px;letter-spacing:.06em;margin-bottom:7px}.operation strong{display:block;font-size:17px;overflow-wrap:anywhere}.badge{font-size:10px;letter-spacing:.06em;padding:7px 10px;border:1px solid #5b7484;color:#c5e0ed}.badge.error{color:#ffb7ac;border-color:#ad6c62}dl{margin:0 0 24px 40px;background:#17232c;padding:16px 20px}dl div{display:grid;grid-template-columns:180px 1fr;gap:16px;padding:7px 0}dt{color:#b7c8d1;font-size:12px}dd{margin:0;font:12px/1.65 ui-monospace,monospace;overflow-wrap:anywhere}footer{margin-top:36px;color:#b7c8d1;font-size:12px}@media(max-width:650px){main{padding:28px 18px}.metrics{grid-template-columns:repeat(2,1fr)}summary{flex-wrap:wrap;gap:12px}.badge{margin-left:32px}dl{margin-left:0;padding:12px}dl div{grid-template-columns:1fr;gap:3px}.section-title{display:block}}@media print{:root{color-scheme:light;background:white;color:black}.notice,.metrics div,dl{background:white;color:black}.muted,header p,dt,footer{color:#333}}
</style></head><body><main><header><div class="brand">COLDGATE / TRACE</div><h1>What did this run record?</h1><p>Capability evidence, chronological context, and the boundaries of what a trace can establish.</p></header>${body}<footer>Coldgate · Offline report · No scripts, remote assets, or telemetry. Labels can still contain sensitive information; review before sharing.</footer></main></body></html>\n`;
}
