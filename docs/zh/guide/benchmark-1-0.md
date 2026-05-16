---
description: 生成 markstream-vue 1.0 benchmark 报告，包含环境披露和 playground 性能指标。
---

# 1.0 Benchmark 报告

发布 `markstream-vue@1.0` 前运行公开 benchmark 报告：

```bash
pnpm benchmark:1.0
```

这个命令会先构建 playground，再用 `vite preview` 启动站点，并执行已经纳入性能回归覆盖的 playground 检查：

- Diagnostic Studio 的 baseline、thinking、diff、stress 样例，会在 MarkdownCodeBlock 和 Monaco 两种模式下访问 `/test?benchmark=1`。该 benchmark 路由会禁用版本沙箱 iframe 与标注层，让 frame 和 DOM 指标更接近 renderer surface。
- 主 playground 的 reverse-flex chat 场景，包括 initial load、full-scroll pass 和 streaming replay。

脚本会生成：

```txt
benchmark/
  1.0.0.chrome-linux-x64.json
  1.0.0.chrome-linux-x64.md
  latest-summary.md
```

Markdown 摘要会记录 package 版本、Node、OS、CPU、browser、viewport、server mode、LCP、CLS、settle time、frame sample count、当前阶段的 p95 `requestAnimationFrame` interval、max long task、DOM node count、visible fallback count、重节点 readiness、scroll drift，以及浏览器暴露时的 Chrome-only best-effort component unmount + GC 后 heap。

Initial 行只报告当前 viewport 内可见重节点的 readiness。Full-scroll 行会在滚完整个 surface 后报告所有重节点的 readiness。每个阶段都会记录 frame interval p95；release gate 只有在该阶段至少采到 30 个 frame sample 时，才会强制执行 120 ms 预算。

仅调试脚本时，可以设置 `MARKSTREAM_BENCHMARK_SKIP_BUILD=1` 复用已有 playground build。除非 build artifact 刚刚生成，否则不要把这个快捷方式生成的结果当作 release evidence。排查单个问题时，可以设置 `MARKSTREAM_BENCHMARK_SAMPLES=baseline,diff` 缩小样例范围。

## CI workflow

`1.0 Benchmark` GitHub Actions workflow 会在 nightly schedule 运行，也可以手动触发。它会把生成的 `benchmark/` 目录作为 artifact 上传。

Release notes 优先引用 workflow artifact。本地生成的报告只是当前 OS、CPU、browser 环境下的快照；`benchmark/latest-summary.md` 只是本地报告的便捷副本，不代表 CI latest。不要宣称生成报告里没有出现的 speedup。

## Release gate

1.0 release gate 运行：

```bash
pnpm run release:gate:1.0
```

该命令会执行 `release:verify`、`docs:build:ci`、`size:check` 和 benchmark report。Release 命令会把报告输出到 `.tmp/benchmark`，避免发布依赖 tracked benchmark artifacts。
