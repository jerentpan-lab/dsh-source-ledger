/**
 * dsh-source-ledger — source-tagged assertions with sampling audit.
 * Config: { ledgerFile?: string }
 * Audit-hardened 2026-11-02 (three-party review). Append-only event log.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import {
  appendEvent, audit, createEntry, detectSourceType, loadEvents, materialize,
  renderAudit, snapshotSource, verifyAppend, verifySnapshot,
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
        'Record a decision-grade claim with an inspectable pointer (url / file / file:line / msg:<id> / commit:<sha> / stdout:<ref>). Free-text sources are weak and can never be verified; missing sources are flagged.',
      parameters: {
        claim: { type: 'string', required: true, description: 'The assertion.' },
        source: { type: 'string', description: 'Pointer: https://…, /path/file, /path/file:42, msg:<id>.' },
        owner: { type: 'string', description: 'Who asserts it.' },
        recompute: { type: 'string', description: 'Command to recompute / confirm the claim.' },
        snapshot: { type: 'boolean', description: 'Snapshot the source content hash (C1; file sources hashed locally, url skipped in offline mode).' },
      },
      output: out,
      async execute(args = {}) {
        if (!args?.claim || !String(args.claim).trim()) throw new Error('source_assert: claim is required');
        const sourceType = detectSourceType(args.source || '');
        const snapshot = await snapshotSource(String(args.source || ''), sourceType, { snapshot: args.snapshot === true });
        const entry = createEntry(
          { ...args, sourceHash: snapshot.status === 'hashed' ? snapshot : null, snapshot },
          { pointerTypes: config.pointerTypes || undefined }
        );
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
        const entryBefore = materialize(events).find((e) => e.id === args.id);
        const snapshotCheck = await verifySnapshot(entryBefore);
        if (snapshotCheck.status === 'changed') {
          throw new Error(`source_verify: source changed since assert (sha256 ${snapshotCheck.before} -> ${snapshotCheck.after}); refusing to verify`);
        }
        if (snapshotCheck.status === 'unreachable') {
          throw new Error(`source_verify: source unreachable (${snapshotCheck.reason}); refusing to verify`);
        }
        const verifyEvent = verifyAppend(events, args.id, { note: args.note });
        await appendEvent(ledgerFile, verifyEvent);
        const entry = materialize([...events, verifyEvent]).find((e) => e.id === args.id);
        return { ...entry, snapshot_check: snapshotCheck };
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
        format: { type: 'string', description: 'Export report format: markdown or json (C2).' },
        outFile: { type: 'string', description: 'Optional path to write the exported report (C2).' },
      },
      output: out,
      async execute(args = {}) {
        const { events, corrupted } = await loadWithWarnings();
        const result = audit(events, { sampleN: args.sampleN ?? 3, seed: args.seed });
        const payload = { ledgerFile, ...result, corrupted };
        if (args.format || args.outFile) {
          const format = args.format === 'json' ? 'json' : 'markdown';
          const report = renderAudit(result, format);
          if (args.outFile) await writeFile(String(args.outFile), report, 'utf8');
          payload.reportFormat = format;
          payload.report = report;
          if (args.outFile) payload.reportFile = String(args.outFile);
        }
        return payload;
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

  return { ledgerFile, pointerTypes: config.pointerTypes || null };
}
