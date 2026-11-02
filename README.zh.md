# dsh-source-ledger（带源断言台账）

影响决策的断言必须带**可核查的源指针**（url / `文件:行` / 消息 ID）。没有源的标记为
`[no-source]`，不能算已核实。`source_audit` 给出带源率并随机抽样供独立复算。

动机：同一个事实有两个都能执行的来源时，漂移就发生了。「会话外、无源，不作数。」

## 安装

```bash
dsh plugin --profile web add dsh-source-ledger
```

## 工具

- `source_assert { claim, source?, owner?, recompute? }`：登记断言
- `source_verify { id, note? }`：核实（无源条目会被拒绝）
- `source_audit { sampleN? }`：带源率 + 随机抽样
- `source_list { onlyMissingSource? }`：列出条目（可只看无源）

## 配置

```yaml
- id: dsh-source-ledger
  name: dsh-source-ledger
  config:
    ledgerFile: "/absolute/path/ledger.jsonl"
```

## License

MIT
