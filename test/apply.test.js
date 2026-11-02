import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply } from '../src/index.js';

test('apply registers tools and full flow works', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-ledger-apply-'));
  const tools = [];
  const ctx = { tools: { register: (t) => tools.push(t) } };
  apply(ctx, { ledgerFile: join(dir, 'ledger.jsonl') });
  assert.deepEqual(tools.map((t) => t.name).sort(), ['source_assert', 'source_audit', 'source_list', 'source_verify']);
  const assertTool = tools.find((t) => t.name === 'source_assert');
  const e = await assertTool.execute({ claim: 'c1', source: 'msg:x' });
  assert.equal(e.hasSource, true);
  const verify = tools.find((t) => t.name === 'source_verify');
  const v = await verify.execute({ id: e.id, note: 'recomputed ok' });
  assert.equal(v.verified, true);
  const auditTool = tools.find((t) => t.name === 'source_audit');
  const r = await auditTool.execute({ sampleN: 1 });
  assert.equal(r.totalUniqueClaims, 1);
  assert.equal(r.withPointer, 1);
});
