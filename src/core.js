/**
 * Source-tagged assertion ledger (append-only event log).
 * Audit-hardened 2026-11-02:
 * - only inspectable pointer types count as a source: url / file / file-line / message;
 *   free-text "sources" are weak and can never be verified
 * - ledger is append-only (assert + verify events); no read-modify-write races
 * - corrupt log lines are quarantined, valid prefix preserved
 * - audit reports strong/weak/no-source rates over unique normalised claims,
 *   with a recorded sampling seed for reproducibility
 */
import { mkdir, readFile, rename, appendFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export const POINTER_TYPES = Object.freeze(['url', 'file', 'file-line', 'message', 'commit', 'stdout']);

export function detectSourceType(source) {
  const s = String(source || '').trim();
  if (!s) return 'none';
  if (/^https?:\/\/\S+$/i.test(s)) return 'url';
  if (/^msg:\S+$/.test(s)) return 'message';
  if (/^commit:[0-9a-f]{7,40}$/i.test(s)) return 'commit';
  if (/^stdout:\S+$/.test(s)) return 'stdout';
  if (/^(?:\.{0,2}\/|~\/|[A-Za-z]:\\|\/)[\w./@\\ -]+:\d+$/.test(s)) return 'file-line';
  if (/^(?:\.{0,2}\/|~\/|[A-Za-z]:\\|\/)[\w./@\\ -]+$/.test(s)) return 'file';
  return 'text';
}

export function isPointer(sourceType) {
  return POINTER_TYPES.includes(sourceType);
}

export function normalizeClaim(claim) {
  return String(claim || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function hashClaim(claim) {
  // FNV-1a 32-bit, enough for dedupe keys; not security-sensitive
  let h = 0x811c9dc5;
  const s = normalizeClaim(claim);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function createEntry({ claim, source = '', owner = '', recompute = '', sourceHash = null, snapshot = null, now = new Date() }, options = {}) {
  const pointerTypes = Array.isArray(options.pointerTypes) ? options.pointerTypes : POINTER_TYPES;
  const text = String(claim || '').trim();
  if (!text) throw new Error('createEntry: claim is required');
  const src = String(source || '').trim();
  const sourceType = detectSourceType(src);
  const inspectable = pointerTypes.includes(sourceType);
  return {
    v: 1,
    event: 'assert',
    id: randomUUID().slice(0, 12),
    claim: text,
    source: src,
    sourceType,
    hasSource: inspectable,
    weakSource: sourceType === 'text' || (sourceType !== 'none' && sourceType !== 'text' && !inspectable),
    sourceHash: sourceHash || null,
    sourceSnapshot: snapshot || null,
    owner: String(owner || ''),
    recompute: String(recompute || ''),
    createdAt: now.toISOString(),
    verified: false,
    verifiedAt: null,
    note: '',
  };
}

export function createVerifyEvent(id, { note = '', now = new Date() } = {}) {
  if (!id) throw new Error('createVerifyEvent: id is required');
  return { v: 1, event: 'verify', id, note: String(note || ''), at: now.toISOString() };
}

/** C1: snapshot a local file source so later verification can detect drift. */
export async function snapshotSource(source, sourceType, { snapshot = false } = {}) {
  if (!snapshot) return { status: 'skipped', reason: 'snapshot disabled' };
  if (sourceType === 'file') {
    try {
      const { hash, bytes } = await hashFile(source);
      return { status: 'hashed', algo: 'sha256', hash, bytes, at: new Date().toISOString() };
    } catch (err) {
      return { status: 'unreachable', reason: String(err.message || err), at: new Date().toISOString() };
    }
  }
  if (sourceType === 'url') {
    // Offline-first: never fetch unless explicitly allowed.
    if (process.env.DSH_SOURCE_LEDGER_ALLOW_FETCH !== '1') {
      return { status: 'skipped', reason: 'offline mode (set DSH_SOURCE_LEDGER_ALLOW_FETCH=1 to fetch)', at: new Date().toISOString() };
    }
    try {
      const res = await fetch(source);
      if (!res.ok) return { status: 'unreachable', reason: `HTTP ${res.status}`, at: new Date().toISOString() };
      const buf = Buffer.from(await res.arrayBuffer());
      return { status: 'hashed', algo: 'sha256', hash: createHash('sha256').update(buf).digest('hex'), bytes: buf.length, at: new Date().toISOString() };
    } catch (err) {
      return { status: 'unreachable', reason: String(err.message || err), at: new Date().toISOString() };
    }
  }
  return { status: 'skipped', reason: `no snapshot rule for ${sourceType}`, at: new Date().toISOString() };
}

export async function hashFile(file) {
  const buf = await readFile(file);
  return { hash: createHash('sha256').update(buf).digest('hex'), bytes: buf.length };
}

/** C1: re-check an entry's recorded snapshot; reports unchanged / changed / unreachable. */
export async function verifySnapshot(entry) {
  if (!entry || !entry.sourceHash || entry.sourceHash.status !== 'hashed') return { status: 'none' };
  try {
    const { hash, bytes } = await hashFile(entry.source);
    if (hash === entry.sourceHash.hash) return { status: 'unchanged', algo: 'sha256', bytes };
    return { status: 'changed', algo: 'sha256', before: entry.sourceHash.hash, after: hash, bytes };
  } catch (err) {
    return { status: 'unreachable', reason: String(err.message || err) };
  }
}

/** Materialise current state from append-only events. */
export function materialize(events) {
  const entries = new Map();
  for (const ev of events) {
    if (!ev || typeof ev !== 'object') continue;
    if (ev.event === 'assert' && ev.id) {
      entries.set(ev.id, { ...ev });
    } else if (ev.event === 'verify' && ev.id && entries.has(ev.id)) {
      const entry = entries.get(ev.id);
      entry.verified = true;
      entry.verifiedAt = ev.at;
      if (ev.note) entry.note = ev.note;
    }
  }
  return [...entries.values()];
}

export async function appendEvent(file, event) {
  await mkdir(dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(event)}\n`, 'utf8');
  return event;
}

/** Load events. Malformed lines: quarantine file, keep the valid prefix. */
export async function loadEvents(file) {
  let raw;
  try {
    raw = await readFile(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { events: [], corrupted: null };
    throw err;
  }
  const lines = raw.split('\n');
  const events = [];
  let badAt = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      badAt = i + 1;
      break;
    }
  }
  if (badAt > 0) {
    const backup = `${file}.corrupt-${Date.now()}`;
    await rename(file, backup).catch(() => {});
    await writeFile(file, events.map((e) => JSON.stringify(e)).join('\n') + (events.length ? '\n' : ''), 'utf8');
    return { events, corrupted: { backup, line: badAt } };
  }
  return { events, corrupted: null };
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Audit source rates over unique normalised claims; returns a reproducible sample.
 * @param {Array} eventsOrEntries events (preferred) or materialised entries
 * @param {{sampleN?: number, seed?: number}} [options]
 */
export function audit(eventsOrEntries, options = {}) {
  if (!Array.isArray(eventsOrEntries)) throw new Error('audit: events must be an array');
  const entries = eventsOrEntries.every((e) => e && e.event)
    ? materialize(eventsOrEntries)
    : eventsOrEntries;
  const unique = new Map();
  let refs = 0;
  for (const e of entries) {
    refs += 1;
    const key = hashClaim(e.claim);
    if (!unique.has(key)) unique.set(key, { ...e, refs: 1 });
    else unique.get(key).refs += 1;
  }
  const list = [...unique.values()];
  const total = list.length;
  const strong = list.filter((e) => e.hasSource).length;
  const weak = list.filter((e) => e.weakSource).length;
  const missing = total - strong - weak;
  const verified = list.filter((e) => e.verified).length;
  const sampleN = Math.max(0, Math.min(Number(options.sampleN ?? 3), total));
  const seed = Number.isFinite(Number(options.seed)) ? Number(options.seed) >>> 0 : Math.floor(Math.random() * 2 ** 32);
  const rng = mulberry32(seed);
  const pool = list.slice();
  const sample = [];
  while (sample.length < sampleN && pool.length > 0) {
    sample.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return {
    totalUniqueClaims: total,
    references: refs,
    duplicates: refs - total,
    withPointer: strong,
    weakSource: weak,
    missingSource: missing,
    verified,
    sourceRate: total ? Number((strong / total).toFixed(4)) : 1,
    sampleSeed: seed,
    sampleN: sample.length,
    sample,
    missingSample: list.filter((e) => !e.hasSource && !e.weakSource).slice(0, 10),
  };
}

/** C2: audit report export (markdown / json). */
export function renderAudit(auditResult, format = 'markdown') {
  if (format === 'json') return JSON.stringify(auditResult, null, 2);
  const a = auditResult;
  const lines = [
    '# Source audit report',
    '',
    `- unique claims: ${a.totalUniqueClaims}`,
    `- references: ${a.references} (duplicates: ${a.duplicates})`,
    `- with pointer: ${a.withPointer}`,
    `- weak source: ${a.weakSource}`,
    `- missing source: ${a.missingSource}`,
    `- verified: ${a.verified}`,
    `- source rate: ${(a.sourceRate * 100).toFixed(2)}%`,
    `- sample seed: ${a.sampleSeed} (n=${a.sampleN})`,
    '',
    '## Sample',
    '',
  ];
  for (const e of a.sample) lines.push(`- ${e.id}: ${e.claim} -> ${e.source || '(none)'} [${e.sourceType}]`);
  if (a.missingSample?.length) {
    lines.push('', '## Missing source (first 10)', '');
    for (const e of a.missingSample) lines.push(`- ${e.id}: ${e.claim}`);
  }
  return lines.join('\n');
}

/** Append a verify event; only inspectable pointers can be verified. */
export function assertVerifiable(entry) {
  if (!entry) throw new Error('verify: unknown entry id');
  if (!entry.hasSource) {
    throw new Error(`verify: entry ${entry.id} has no inspectable pointer (${entry.sourceType}); cannot be verified`);
  }
  return true;
}

export function verifyAppend(events, id, { note = '', now = new Date() } = {}) {
  const entries = materialize(events);
  const entry = entries.find((e) => e.id === id);
  if (!entry) throw new Error(`verify: unknown entry id ${id}`);
  assertVerifiable(entry);
  return createVerifyEvent(id, { note, now });
}
