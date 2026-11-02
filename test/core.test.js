import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  appendEvent, audit, createEntry, createVerifyEvent, detectSourceType, loadEvents,
  materialize, mulberry32, verifyAppend,
} from '../src/core.js';

test('pointer type detection and whitelist', () => {
  assert.equal(detectSourceType('https://example.com/x'), 'url');
  assert.equal(detectSourceType('msg:abc123'), 'message');
  assert.equal(detectSourceType('/workspace/links/progress.py:42'), 'file-line');
  assert.equal(detectSourceType('/workspace/links/progress.py'), 'file');
  assert.equal(detectSourceType('C:\\Logs\\x.txt:12'), 'file-line');
  assert.equal(detectSourceType('我记得是这样'), 'text');
  assert.equal(detectSourceType(''), 'none');
});

test('only inspectable pointers count as source (audit S1)', () => {
  const strong = createEntry({ claim: 'Qdrant has 12 collections', source: 'msg:m1' });
  assert.equal(strong.hasSource, true);
  assert.equal(strong.weakSource, false);
  const weak = createEntry({ claim: 'Qdrant has 12 collections', source: '我记得是这样' });
  assert.equal(weak.hasSource, false);
  assert.equal(weak.weakSource, true);
  const none = createEntry({ claim: 'no source' });
  assert.equal(none.hasSource, false);
  assert.equal(none.weakSource, false);
});

test('weak/text sources cannot be verified (audit S1)', () => {
  const e = createEntry({ claim: 'x', source: 'todo' });
  assert.throws(() => verifyAppend([e], e.id), /no inspectable pointer/);
});

test('append-only log: assert and verify events, no rewrite', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-ledger-'));
  const file = join(dir, 'ledger.jsonl');
  const e = createEntry({ claim: 'Qdrant has 12 collections', source: 'msg:m1' });
  await appendEvent(file, e);
  const before = await readFile(file, 'utf8');
  const entries = materialize(await loadEvents(file).then((r) => r.events));
  assert.equal(entries[0].claim, 'Qdrant has 12 collections');
  const v = createVerifyEvent(e.id, { note: 'recomputed' });
  await appendEvent(file, v);
  const after = await readFile(file, 'utf8');
  assert.ok(after.startsWith(before), 'assert event must not be rewritten');
  const state = materialize((await loadEvents(file)).events);
  assert.equal(state[0].verified, true);
  assert.equal(state[0].note, 'recomputed');
});

test('audit rates are computed over unique normalised claims (audit S6/S7)', () => {
  const events = [
    createEntry({ claim: 'Qdrant has 12 collections', source: 'msg:m1' }),
    createEntry({ claim: 'qdrant  has 12 collections', source: 'msg:m2' }), // duplicate claim
    createEntry({ claim: 'another claim', source: '/tmp/x:1' }),
    createEntry({ claim: 'weak claim', source: 'some note' }),
    createEntry({ claim: 'no source claim' }),
  ];
  const r = audit(events, { sampleN: 2, seed: 42 });
  assert.equal(r.totalUniqueClaims, 4);
  assert.equal(r.references, 5);
  assert.equal(r.duplicates, 1);
  assert.equal(r.withPointer, 2);
  assert.equal(r.weakSource, 1);
  assert.equal(r.missingSource, 1);
  assert.equal(r.sourceRate, 0.5);
  assert.equal(r.sampleSeed, 42);
  assert.equal(r.sampleN, 2);
});

test('audit sampling is reproducible with the same seed (audit S6)', () => {
  const events = [1, 2, 3, 4, 5].map((n) => createEntry({ claim: `claim ${n}`, source: `msg:m${n}` }));
  const a = audit(events, { sampleN: 3, seed: 7 });
  const b = audit(events, { sampleN: 3, seed: 7 });
  assert.deepEqual(a.sample.map((e) => e.id), b.sample.map((e) => e.id));
});

test('mulberry32 is deterministic', () => {
  const a = mulberry32(1);
  const b = mulberry32(1);
  assert.equal(a(), b());
  assert.notEqual(mulberry32(1)(), mulberry32(2)());
});

test('corrupt log is quarantined, valid prefix preserved (audit S5/H5)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-ledger-'));
  const file = join(dir, 'ledger.jsonl');
  const good = createEntry({ claim: 'good', source: 'msg:g' });
  await writeFile(file, `${JSON.stringify(good)}\n{oops\n`, 'utf8');
  const r = await loadEvents(file);
  assert.equal(r.events.length, 1);
  assert.ok(r.corrupted && r.corrupted.backup);
  const after = await readFile(file, 'utf8');
  assert.ok(after.includes('good'));
  assert.ok(!after.includes('{oops'));
});

test('empty claim is rejected', () => {
  assert.throws(() => createEntry({ claim: '  ' }), /claim is required/);
});
