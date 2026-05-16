---
description: 生成 markstream-vue 1.0 benchmark 报告，包含环境披露和 playground 性能指标。
---

# 1.0 Benchmark 报告

此页面为中文占位，原文（English）：/guide/benchmark-1-0。

发布 `markstream-vue@1.0` 前运行：

```bash
pnpm benchmark:1.0
```

该命令会先构建 playground，再用 `vite preview` 跑 Diagnostic Studio 的 baseline、thinking、diff、stress 样例和主 playground reverse-flex chat 场景，生成 `benchmark/*.json`、`benchmark/*.md` 和 `benchmark/latest-summary.md`，并记录 LCP、CLS、settle time、p95 frame cost、long task、DOM 节点数、fallback、重节点完成数、滚动漂移和 heap after unmount 等指标。调试单个问题时可以用 `MARKSTREAM_BENCHMARK_SAMPLES=baseline,diff` 缩小样例范围。
