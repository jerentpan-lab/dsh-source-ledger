/**
 * dsh-source-ledger — source-tagged assertions with sampling audit.
 * Config: { ledgerFile?: string }
 * Audit-hardened 2026-11-02 (three-party review). Append-only event log.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  appendEvent, audit, createEntry, loadEvents, materialize, verifyAppend,
} from './core.js';
import { validateConfig } from './config.js';

export const name = 'dsh-source-ledger';
export const inject = ['tools'];

let defineTool;
try {
  ({ defineTool } = await import('@deepseek-ai/dsh-tools'));
} catch (err) {
  if (err?.code !== 'ERR_MODULE_NOT_FOUND') throw err;
  console.warn('[dsh-source-ledger] @deepseek-ai/dsh-tools not found, running unvalidated (tests only).');
  defineTool = (options) => ({ ...options });
}

export function apply(ctx, rawConfig = {}) {
  const { config } = validateConfig(rawConfig);
  const ledgerFile =
    config.ledgerFile || process.env.DSH_SOURCE_LEDGER_FILE || join(homedir(), '.dsh', 'source-ledger.jsonl');

  const out = {
    schema: { type: 'object', additionalProperties: true },
    render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  };

  const warnings = () => {
    const w = {};
    // loadEvents is called per tool; surface corruption via the tool result instead.
    return w;
  };

  async function loadWithWarnings() {
    const { events, corrupted } = await loadEvents(ledgerFile);
    return { events, corrupted };
  }

  ctx.tools.register(
    defineTool({
      name: 'source_assert',
      description:
        'Record a decision-grade claim with an inspectable pointer (url / file / file:line / msg:<id>). Free-text sources are weak and can never be verified; missing sources are flagged.',
      parameters: {
        claim: { type: 'string', required: true, description: 'The assertion.' },
        source: { type: 'string', description: 'Pointer: https://…, /path/file, /path/file:42, msg:<id>.' },
        owner: { type: 'string', description: 'Who asserts it.' },
        recompute: { type: 'string', description: 'Command to recompute / confirm the claim.' },
      },
      output: out,
      async execute(args = {}) {
        if (!args?.claim || !String(args.claim).trim()) throw new Error('source_assert: claim is required');
        const entry = createEntry(args);
        await appendEvent(ledgerFile, entry);
        return entry;
      },
    })
  );

  ctx.tools.register(
    defineTool({
      name: 'source_verify',
      description: 'Mark a ledger entry verified after independent recomputation. Requires an inspectable pointer.',
      parameters: {
        id: { type: 'string', required: true, description: 'Ledger entry id.' },
        note: { type: 'string', description: 'Recompute command/result.' },
      },
      output: out,
      async execute(args = {}) {
        if (!args?.id) throw new Error('source_verify: id is required');
        const { events } = await loadWithWarnings();
        const verifyEvent = verifyAppend(events, args.id, { note: args.note });
        await appendEvent(ledgerFile, verifyEvent);
        const entry = materialize([...events, verifyEvent]).find((e) => e.id === args.id);
        return entry;
      },
    })
  );

  ctx.tools.register(
    defineTool({
      name: 'source_audit',
      description:
        'Audit pointer rates over unique normalised claims and return a reproducible random sample (seed recorded).',
      parameters: {
        sampleN: { type: 'number', description: 'How many entries to sample (default 3).' },
        seed: { type: 'number', description: 'Deterministic sampling seed (optional).' },
      },
      output: out,
      async execute(args = {}) {
        const { events, corrupted } = await loadWithWarnings();
        const result = audit(events, { sampleN: args.sampleN ?? 3, seed: args.seed });
        return { ledgerFile, ...result, corrupted };
      },
    })
  );

  ctx.tools.register(
    defineTool({
      name: 'source_list',
      description: 'List ledger entries; optionally only entries without an inspectable pointer.',
      parameters: {
        onlyMissingSource: { type: 'boolean', description: 'Only entries without an inspectable pointer.' },
      },
      output: out,
      async execute(args = {}) {
        const { events, corrupted } = await loadWithWarnings();
        const entries = materialize(events);
        const filtered = args.onlyMissingSource === true ? entries.filter((e) => !e.hasSource) : entries;
        return { ledgerFile, count: filtered.length, entries: filtered, corrupted };
      },
    })
  );

  return { ledgerFile };
}
