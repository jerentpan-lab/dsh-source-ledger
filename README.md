# dsh-source-ledger

[![npm version](https://img.shields.io/npm/v/dsh-source-ledger)](https://www.npmjs.com/package/dsh-source-ledger) [![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

> Author: jetpan (npm) ↔ jerentpan-lab (GitHub) | [npm package](https://www.npmjs.com/package/dsh-source-ledger) | [GitHub repo](https://github.com/jerentpan-lab/dsh-source-ledger) | install from GitHub: `dsh plugin --profile web add github:jerentpan-lab/dsh-source-ledger`


Decision-grade claims must carry an inspectable **source pointer** (url / `file:line` /
message id). Claims without one are flagged `[no-source]` and cannot be verified.
`source_audit` reports the source-tag rate and returns a random sample for independent
recomputation.

Motivation: agents drift when the same fact has two executable sources. "Outside the
session / without a source, it is not a fact."

## Install

```bash
dsh plugin --profile web add dsh-source-ledger
```

## Tools

- `source_assert { claim, source?, owner?, recompute? }`
- `source_verify { id, note? }` — only works when a source exists
- `source_audit { sampleN? }` — source rate + random sample
- `source_list { onlyMissingSource? }`

## Config

```yaml
- id: dsh-source-ledger
  name: dsh-source-ledger
  config:
    ledgerFile: "/absolute/path/ledger.jsonl"
```

## License

MIT
