#!/usr/bin/env node
/** G5 demo: assert claims with different pointer types, audit, export a report. */
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendEvent, audit, createEntry, materialize, renderAudit } from '../src/core.js';

const dir = await mkdtemp(join(tmpdir(), 'sl-demo-'));
const evidence = join(dir, 'evidence.md');
await writeFile(evidence, 'the gateway was restarted at 10:00');
const ledger = join(dir, 'ledger.jsonl');
const events = [];
for (const args of [
  { claim: 'gateway restarted at 10:00', source: evidence },
  { claim: 'bridge is reachable', source: 'https://example.com/health' },
  { claim: 'someone said it works', source: 'free text' },
  { claim: 'commit fixes the bug', source: `commit:${'a'.repeat(40)}` },
]) {
  const entry = createEntry(args);
  events.push(entry);
  await appendEvent(ledger, entry);
}
const result = audit(events, { sampleN: 3, seed: 42 });
console.log(JSON.stringify({ total: result.totalUniqueClaims, withPointer: result.withPointer, weak: result.weakSource, missing: result.missingSource, rate: result.sourceRate }, null, 2));
console.log('\n--- markdown export (excerpt) ---');
console.log(renderAudit(result, 'markdown').split('\n').slice(0, 12).join('\n'));
console.log('\nentries:', materialize(events).length, '| ledger:', ledger);
