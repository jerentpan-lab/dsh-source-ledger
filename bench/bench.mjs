import { createEntry, audit } from '../src/core.js';
import { writeFileSync } from 'node:fs';
function bench(n) {
  const t0 = performance.now();
  const events = [];
  for (let i = 0; i < n; i += 1) events.push(createEntry({ claim: `claim ${i % 500}`, source: i % 3 === 0 ? '/tmp/x.md' : 'text' }));
  audit(events, { sampleN: 3, seed: 7 });
  return performance.now() - t0;
}
const rows = [1000, 10000].map((n) => {
  const samples = Array.from({ length: 5 }, () => bench(n)).sort((a, b) => a - b);
  return { n, p50: samples[2].toFixed(2), p95: samples[4].toFixed(2) };
});
const out = ['# Bench results (dsh-source-ledger)', '', '| ops | p50 (ms) | p95 (ms) |', '|---|---|---|', ...rows.map((r) => `| ${r.n} entries+audit | ${r.p50} | ${r.p95} |`)];
writeFileSync(new URL('./RESULTS.md', import.meta.url), out.join('\n') + '\n');
console.log(out.join('\n'));
