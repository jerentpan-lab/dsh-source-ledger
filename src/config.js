/** Config validation for dsh-source-ledger (0.2.0 G1). Zero dependencies. */
export class ConfigError extends Error {
  constructor(errors) {
    super(`invalid dsh-source-ledger config:\n- ${errors.join('\n- ')}`);
    this.name = 'ConfigError';
    this.errors = errors;
  }
}

const DEFAULTS = Object.freeze({ ledgerFile: null, pointerTypes: null });
import { POINTER_TYPES } from './core.js';

export function validateConfig(raw = {}) {
  const errors = [];
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new ConfigError(['config: must be a plain object']);
  for (const key of Object.keys(raw)) {
    if (!(key in DEFAULTS)) errors.push(`config: unknown key "${key}" (allowed: ${Object.keys(DEFAULTS).join(', ')})`);
  }
  let pointerTypes = null;
  if (raw.pointerTypes !== undefined) {
    if (!Array.isArray(raw.pointerTypes) || raw.pointerTypes.length === 0) errors.push('pointerTypes: must be a non-empty array of known pointer types');
    else {
      const bad = raw.pointerTypes.filter((t) => !POINTER_TYPES.includes(t));
      if (bad.length) errors.push(`pointerTypes: unknown type(s) ${bad.join(', ')} (known: ${POINTER_TYPES.join(', ')})`);
      else pointerTypes = [...new Set(raw.pointerTypes)];
    }
  }
  if (raw.ledgerFile !== undefined && raw.ledgerFile !== null) {
    if (typeof raw.ledgerFile !== 'string' || raw.ledgerFile.trim() === '') errors.push('ledgerFile: must be a non-empty string or null');
  }
  if (errors.length) throw new ConfigError(errors);
  return { config: { ledgerFile: raw.ledgerFile ?? null, pointerTypes } };
}
