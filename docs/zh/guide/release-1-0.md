---
description: markstream-vue 1.0 稳定范围、发布门禁、性能报告和发布前检查清单。
---

# 1.0 发布就绪

`markstream-vue@1.0` 表示 Vue 3 renderer package 已进入生产可用稳定范围。1.x 会保持稳定 API、行为、安全默认值和 package exports，除非进入下一个 major 版本。

## 1.0 稳定范围

- Vue 3 `MarkdownRender`。
- 原始 `content` 渲染和预解析 `nodes` 渲染。
- `final`、`typewriter`、`smoothStreaming`、`useSmoothMarkdownStream`。
- 默认安全 HTML 策略 `htmlPolicy="safe"`。
- 可选 Mermaid、KaTeX、D2、Infographic、Monaco 集成。
- Vue / Vite / Nuxt / VitePress SSR import 与 render-to-string。
- CSS exports：`index.css`、`index.tailwind.css`、`index.px.css`。
- Worker client exports：`markstream-vue/workers/katexWorkerClient` 与 `markstream-vue/workers/mermaidWorkerClient`。
- `markstream-vue/tailwind` 默认与命名 safelist exports。

## 实验或内部范围

- Vue 2、React、Angular、Svelte、Next adapters 与 playgrounds。
- 仓库 CLI helpers、skills/prompts、agent assets。
- 低层 worker implementation files 与 CDN worker helper subpaths。
- Height-estimation experiment APIs。
- 内部调试/性能 props。

这些内容可以继续存在于仓库中，但不属于 1.x 兼容性承诺。

## 发布版本策略

1.0 正式发布时三个包一起发：

```txt
markstream-vue@1.0.0
markstream-core@1.0.0
stream-markdown-parser@1.0.0
```

## 发布门禁

发布前运行：

```bash
pnpm run release:gate:1.0
```

该命令会执行 release verification、docs build、size budget 和 1.0 benchmark report。benchmark 会生成 `benchmark/*.json`、`benchmark/*.md`、`benchmark/latest-summary.md`，release notes 应引用该报告或 `1.0 Benchmark` workflow artifact。

## Go / No-Go

- [x] 稳定与实验 API 已记录。
- [x] Parser/core 与 Vue 3 renderer 采用同版本 1.0.0 发布策略。
- [x] Legacy fence renderer escaping 有测试覆盖。
- [x] Safe HTML 文档与 XSS 回归测试完成。
- [x] App-scoped custom component registry 有 SSR 测试覆盖。
- [x] CSS、Tailwind、worker subpath exports 已纳入 smoke test。
- [x] Unit、SSR、public API、package export checks 纳入 release gate。
- [x] `pnpm run release:gate:1.0` 已通过。
- [x] Nuxt SSR smoke 已通过 dev 和 preview 模式。
- [x] VitePress docs build 纳入 release gate。
- [x] Migration notes 与 changelog 已记录 beta/rc 到 1.0 的变更。
- [x] Benchmark report 可通过 `pnpm benchmark:1.0` 或 workflow artifact 生成。
