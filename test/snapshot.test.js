import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectSourceType } from '../src/core.js';
import { ConfigError, validateConfig } from '../src/config.js';
import { apply } from '../src/index.js';

async function setup(extra = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-sl-snap-'));
  const tools = [];
  const ctx = { tools: { register: (t) => tools.push(t) } };
  const runtime = apply(ctx, { ledgerFile: join(dir, 'ledger.jsonl'), ...extra });
  return { dir, tools, runtime, tool: (n) => tools.find((t) => t.name === n) };
}

test('C1: file snapshot is hashed; verify reports source changed after edit', async () => {
  const { dir, tool } = await setup();
  const target = join(dir, 'evidence.md');
  await writeFile(target, 'original evidence');
  const entry = await tool('source_assert').execute({ claim: 'file says original', source: target, snapshot: true });
  assert.equal(entry.sourceType, 'file');
  assert.equal(entry.sourceSnapshot.status, 'hashed');
  assert.equal(entry.sourceHash.algo, 'sha256');

  await tool('source_verify').execute({ id: entry.id, note: 'checked' });

  await writeFile(target, 'tampered evidence');
  await assert.rejects(() => tool('source_verify').execute({ id: entry.id, note: 'recheck' }), /source changed since assert/);
});

test('C1: missing file is reported as unreachable at verify time', async () => {
  const { dir, tool } = await setup();
  const target = join(dir, 'gone.md');
  await writeFile(target, 'temp');
  const entry = await tool('source_assert').execute({ claim: 'gone', source: target, snapshot: true });
  await writeFile(join(dir, 'moved'), 'x');
  const { unlink } = await import('node:fs/promises');
  await unlink(target);
  await assert.rejects(() => tool('source_verify').execute({ id: entry.id }), /source unreachable/);
});

test('C3: commit:hash and stdout:ref are inspectable pointer types', async () => {
  assert.equal(detectSourceType(`commit:${'a'.repeat(40)}`), 'commit');
  assert.equal(detectSourceType('stdout:task-42/run-7'), 'stdout');
  assert.equal(detectSourceType('commit:xyz'), 'text');
  const { tool } = await setup();
  const commit = await tool('source_assert').execute({ claim: 'commit fixes bug', source: `commit:${'b'.repeat(40)}` });
  assert.equal(commit.hasSource, true);
  assert.equal(commit.weakSource, false);
  const verified = await tool('source_verify').execute({ id: commit.id, note: 'checked commit' });
  assert.equal(verified.verified, true);
});

test('C4: pointerTypes config can demote file sources to weak (team口径)', async () => {
  const { dir, tool } = await setup({ pointerTypes: ['url'] });
  const target = join(dir, 'x.txt');
  await writeFile(target, 'x');
  const entry = await tool('source_assert').execute({ claim: 'weak in this team', source: target });
  assert.equal(entry.hasSource, false);
  assert.equal(entry.weakSource, true);
  await assert.rejects(() => tool('source_verify').execute({ id: entry.id }), /no inspectable pointer/);
  assert.throws(() => validateConfig({ pointerTypes: ['nope'] }), (e) => e instanceof ConfigError && /unknown type/.test(e.message));
});

test('C2: source_audit exports markdown/json reports (optionally to file)', async () => {
  const { dir, tool } = await setup();
  await tool('source_assert').execute({ claim: 'a', source: 'https://example.com/x' });
  await tool('source_assert').execute({ claim: 'b', source: 'free text source' });
  const md = await tool('source_audit').execute({ sampleN: 2, format: 'markdown', outFile: join(dir, 'audit.md') });
  assert.equal(md.reportFormat, 'markdown');
  assert.match(md.report, /# Source audit report/);
  assert.match(await readFile(join(dir, 'audit.md'), 'utf8'), /source rate/);
  const js = await tool('source_audit').execute({ sampleN: 1, format: 'json' });
  assert.doesNotThrow(() => JSON.parse(js.report));
});
