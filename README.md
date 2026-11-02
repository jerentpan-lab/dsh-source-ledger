# dsh-source-ledger

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
