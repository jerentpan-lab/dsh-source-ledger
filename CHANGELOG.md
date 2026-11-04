# Changelog

## 0.2.0 (2026-11-04)
- G1: config validation (`src/config.js`) with readable `ConfigError`; `config.example.json`.
- G2: `npm run verify` = tests + `npm pack` content/size/safety checks; GitHub Actions workflow.
- C1: optional source snapshot hash (file locally; url offline-first with `DSH_SOURCE_LEDGER_ALLOW_FETCH=1`); verify reports changed/unreachable.
- C2: audit report export (`source_audit {format, outFile}`).
- C3: pointer types `commit:<sha>` and `stdout:<ref>`.
- C4: configurable `pointerTypes` (weak-source口径 per team).
- G3: `bench/bench.mjs` + `bench/RESULTS.md` (P50/P95).
- G4: README error table (每失败路径一句话诊断).
- G5: runnable `examples/demo.mjs`.

## 0.1.1 (2026-11-02)
- Hardened after three-party audit (Hermes/Buddy/DSH). See ../AUDIT-2026-11-02.md.
- Fail-safe routing, literal-only user rules, negation handling, word boundaries.
- Concurrency locks, corrupt-state quarantine, UTC strict timestamps, ttl validation.
- Append-only event log, pointer whitelist, reproducible sampling seed.

## 0.1.0
- Initial MVP.
