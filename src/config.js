/** Config validation for dsh-source-ledger (0.2.0 G1). Zero dependencies. */
export class ConfigError extends Error {
  constructor(errors) {
    super(`invalid dsh-source-ledger config:\n- ${errors.join('\n- ')}`);
    this.name = 'ConfigError';
    this.errors = errors;
  }
}

const DEFAULTS = Object.freeze({ ledgerFile: null });

export function validateConfig(raw = {}) {
  const errors = [];
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new ConfigError(['config: must be a plain object']);
  for (const key of Object.keys(raw)) {
    if (!(key in DEFAULTS)) errors.push(`config: unknown key "${key}" (allowed: ${Object.keys(DEFAULTS).join(', ')})`);
  }
  if (raw.ledgerFile !== undefined && raw.ledgerFile !== null) {
    if (typeof raw.ledgerFile !== 'string' || raw.ledgerFile.trim() === '') errors.push('ledgerFile: must be a non-empty string or null');
  }
  if (errors.length) throw new ConfigError(errors);
  return { config: { ledgerFile: raw.ledgerFile ?? null } };
}
