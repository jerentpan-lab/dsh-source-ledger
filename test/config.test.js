import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigError, validateConfig } from '../src/config.js';
import { apply } from '../src/index.js';

test('G1: example config validates and unknown key is readable error', async () => {
  const example = JSON.parse(await readFile(new URL('../config.example.json', import.meta.url), 'utf8'));
  assert.equal(validateConfig(example).config.ledgerFile, null);
  assert.throws(() => validateConfig({ nope: 1 }), (e) => e instanceof ConfigError && /unknown key "nope"/.test(e.message));
  assert.throws(() => validateConfig({ ledgerFile: '' }), /ledgerFile: must be a non-empty string or null/);
});

test('G1: apply accepts validated config and registers tools', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-sl-cfg-'));
  const tools = [];
  const ctx = { tools: { register: (t) => tools.push(t) } };
  apply(ctx, { ledgerFile: join(dir, 'ledger.jsonl') });
  assert.ok(tools.some((t) => t.name === 'source_assert'));
});
