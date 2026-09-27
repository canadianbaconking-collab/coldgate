#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { scanConfig } from '../packages/authority/src/scan.ts';

const categories = ['browser', 'database', 'filesystem', 'github', 'slack'];
const validEffects = new Set(['READ', 'WRITE', 'DESTRUCTIVE', 'EXECUTE', 'EXTERNAL_COMMUNICATION', 'OPEN_WORLD']);
const consequential = new Set(['WRITE', 'DESTRUCTIVE', 'EXECUTE', 'EXTERNAL_COMMUNICATION', 'OPEN_WORLD']);
const nonempty = x => typeof x === 'string' && x.length > 0;
const sum = xs => xs.reduce((a, b) => a + b, 0);
const ratio = (a, b) => b ? Number((a / b).toFixed(4)) : null;
function fail(message) { throw Error(message); }

function summarize(rows) {
  const gold = rows.filter(r => r.expected.some(e => consequential.has(e)));
  const benign = rows.filter(r => !r.expected.some(e => consequential.has(e)));
  const expectedConsequential = sum(rows.map(r => r.expected.filter(e => consequential.has(e)).length));
  const foundConsequential = sum(rows.map(r => r.expected.filter(e => consequential.has(e) && r.predicted.includes(e)).length));
  const mismatch = rows.filter(r => r.expected.some(e => !r.predicted.includes(e)) || r.predicted.some(e => e !== 'UNKNOWN' && !r.expected.includes(e)));
  return { samples: rows.length,
    metrics: {
      consequentialEffectRecall: {found: foundConsequential, expected: expectedConsequential, rate: ratio(foundConsequential, expectedConsequential)},
      consequentialToolRecall: {found: gold.filter(r => r.predicted.some(e => consequential.has(e))).length, expected: gold.length, rate: ratio(gold.filter(r => r.predicted.some(e => consequential.has(e))).length, gold.length)},
      benignFalsePositiveRate: {falsePositives: benign.filter(r => r.predicted.some(e => consequential.has(e))).length, benign: benign.length, rate: ratio(benign.filter(r => r.predicted.some(e => consequential.has(e))).length, benign.length)},
      unknownRate: {unknown: rows.filter(r => r.predicted.includes('UNKNOWN')).length, total: rows.length, rate: ratio(rows.filter(r => r.predicted.includes('UNKNOWN')).length, rows.length)},
      contradictionDetectionRate: {detected: 0, labeledContradictions: 0, rate: null, reason: 'No independently labeled contradictory public definitions in this corpus'},
      sourceContribution: {nameOnly: rows.filter(r => r.nameEvidence.length && !r.description.length).length, descriptionOnly: rows.filter(r => !r.nameEvidence.length && r.description.length).length, combined: rows.filter(r => r.nameEvidence.length && r.description.length).length, neither: rows.filter(r => !r.nameEvidence.length && !r.description.length).length},
      descriptionRescues: rows.filter(r => !r.nameEvidence.length && r.description.length).length,
      incorrectDescriptionEffectClaims: sum(rows.map(r => r.descriptionIncorrect.length)),
    }, mismatches: mismatch.map(r => ({category: r.category, name: r.name, expected: r.expected, predicted: r.predicted, descriptionIncorrect: r.descriptionIncorrect})) };
}

export async function benchmark() {
  const rows = [], seen = new Set();
  for (const category of categories) for (const [split, filename] of [['development','definitions.json'], ['holdout','holdout.json']]) {
    const path = join('fixtures', 'corpus', category, filename);
    const doc = JSON.parse(await readFile(path, 'utf8'));
    if (!nonempty(doc.repository) || !/^[0-9a-f]{40}$/.test(doc.commit) || !nonempty(doc.license) || !nonempty(doc.definition) || !nonempty(doc.groundTruth) || !Array.isArray(doc.cases) || !doc.cases.length) fail(`Invalid corpus metadata: ${path}`);
    for (const [i, item] of doc.cases.entries()) {
      if (!nonempty(item.name) || typeof item.description !== 'string' || !nonempty(item.labelNote) || !Array.isArray(item.expectedEffects) || !item.expectedEffects.length || item.expectedEffects.some(x => !validEffects.has(x)) || new Set(item.expectedEffects).size !== item.expectedEffects.length) fail(`Invalid corpus entry: ${path} row ${i}`);
      const identity = JSON.stringify([doc.repository, item.name]); if (seen.has(identity)) fail('Duplicate corpus tool identity'); seen.add(identity);
      const input = {tools: [{name: item.name, description: item.description, ...(item.annotations ? {annotations: item.annotations} : {})}]};
      const report = scanConfig(input, 'corpus.json');
      if (report.errors.length || report.records.length !== 1) fail(`Unable to analyze corpus row: ${path} row ${i}`);
      const r = report.records[0], evidence = r.capability.effectEvidence;
      const name = [...new Set(evidence.filter(e => e.source.endsWith('.name')).map(e => e.value))];
      const description = [...new Set(evidence.filter(e => e.source.endsWith('.description')).map(e => e.value))];
      rows.push({ category, split, name: item.name, expected: item.expectedEffects, predicted: r.capability.effects.value,
        nameEvidence: name, description, conflicts: report.findings.filter(f => f.rule === 'CG012' || f.rule === 'CG007').map(f => f.rule),
        descriptionIncorrect: description.filter(e => !item.expectedEffects.includes(e)) });
    }
  }
  return {schemaVersion: '0.1', scope: 'pinned-public-excerpts', samples: rows.length, categories,
    splits: {development: summarize(rows.filter(r => r.split === 'development')), holdout: summarize(rows.filter(r => r.split === 'holdout'))} };
}

if (process.argv[1]?.endsWith('benchmark.mjs')) {
  try {
    if (process.argv.length > 3 || (process.argv[2] !== undefined && process.argv[2] !== '--json')) fail('Usage: npm run benchmark [-- --json]');
    const result = await benchmark();
    if (process.argv[2] === '--json') console.log(JSON.stringify(result, null, 2));
    else {
      const rate = r => r.rate === null ? 'n/a' : `${Math.round(r.rate * 100)}% (${r.found ?? r.falsePositives ?? r.unknown}/${r.expected ?? r.benign ?? r.total})`;
      console.log(`Coldgate evidence benchmark: ${result.samples} pinned public tool excerpts in ${result.categories.length} categories`);
      for (const [split, group] of Object.entries(result.splits)) {
        const m = group.metrics;
        console.log(`${split}: ${group.samples} tools; consequential-effect recall ${rate(m.consequentialEffectRecall)}; consequential-tool recall ${rate(m.consequentialToolRecall)}; benign false-positive rate ${rate(m.benignFalsePositiveRate)}; UNKNOWN ${rate(m.unknownRate)}`);
        console.log(`  name only ${m.sourceContribution.nameOnly}, description only ${m.sourceContribution.descriptionOnly}, both ${m.sourceContribution.combined}, neither ${m.sourceContribution.neither}; description rescues ${m.descriptionRescues}; incorrect description claims ${m.incorrectDescriptionEffectClaims}`);
        console.log(`  mismatches: ${group.mismatches.map(x => `${x.category}/${x.name}`).join(', ') || 'none'}`);
      }
      console.log('Contradiction detection: n/a (no independently labeled public contradictions). Development examples informed the parser; holdout examples did not. Small selected sample, not a population estimate.');
    }
  } catch { console.error('Benchmark input is invalid or unreadable.'); process.exitCode = 2; }
}
