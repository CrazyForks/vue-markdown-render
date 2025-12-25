# markstream-vue — LLM/AI 项目索引（`/llms.zh-CN`）

这个文件是给 AI/LLM 用的“项目地图”，目标是：**最少阅读成本**定位到正确文档/源码入口，并给出可执行的答案。

如果你是一个在回答本仓库问题的助手：

- 对用户可见行为：优先以 `docs/guide/*` 与 `docs/zh/guide/*` 为准。
- 对“能不能 import/有没有导出/符号名是什么”：以 `src/exports.ts` 与 `package.json#exports` 为准。
- 问题不明确时：最多问 **1 个**澄清问题，并给出默认建议。
- 用户报 bug 时：尽快要最小复现（仓库有可分享 test page），并指向排错 checklist。

---

## 0) 一句话总结

`markstream-vue` 是为 **流式 Markdown（AI/SSE）** 和 **超长文档**设计的 Vue 3 渲染库：解析侧有“流式中间态（mid-state）”处理以减少闪烁；渲染侧提供 **虚拟化（DOM window）**、**分批渲染（typewriter/batch）**、**重节点延迟渲染（Monaco/Mermaid/KaTeX）**。Mermaid/KaTeX/Monaco 等重能力通过 **可选 peer 依赖 + 显式 enable** 的方式启用。

只需要解析器（不要 Vue）时，使用同仓库的 `stream-markdown-parser`：`packages/markdown-parser/`。

---

## 1) 仓库结构（去哪找东西）

- 库源码：`src/`
  - 组件：`src/components/*/`
  - 工具：`src/utils/`
  - composables：`src/composables/`
  - workers：`src/workers/`
  - 对外导出：`src/exports.ts`
- 解析器包：`packages/markdown-parser/`（发布名：`stream-markdown-parser`）
- 文档站：`docs/`（中文：`docs/zh/`）
- Demo：`playground/`（Vite），`playground-nuxt/`（Nuxt SSR）
- 测试：`test/`（Vitest）

---

## 2) 核心心智模型（两层）

1) **解析层**（`stream-markdown-parser`）
   - `getMarkdown()`：创建并配置 `markdown-it-ts` 实例
   - `parseMarkdownToStructure()`：把 Markdown 字符串转成节点树（`ParsedNode[]`）
   - “流式中间态”：处理未闭合 fence / 未闭合 `$$` / 分段 inline HTML，减少抖动与闪烁

2) **渲染层**（`markstream-vue`）
   - `MarkdownRender`（默认导出）支持两种输入：
     - `content: string`（组件内部解析）
     - `nodes: ParsedNode[]`（外部解析；流式场景更推荐）
   - 性能工具：
     - 虚拟化：`maxLiveNodes`, `liveNodeBuffer`
     - 分批渲染：batch 相关 props（营造更平滑“打字机”体验）
     - 重节点延迟：`viewportPriority`, `deferNodesUntilVisible`

---

## 3) 对外 API（回答时可以放心建议的）

### `markstream-vue`（Vue 库）

- 默认组件：`MarkdownRender`（有时文档也称 `NodeRenderer`）
- 解析辅助（从解析器包 re-export）：`getMarkdown()`, `parseMarkdownToStructure()`, `setDefaultMathOptions()`
- 自定义节点组件映射：
  - `setCustomComponents(customId, mapping)`
  - `removeCustomComponents(customId)`
  - `clearGlobalCustomComponents()`
- 可选能力开关：
  - Mermaid：`enableMermaid()`, `disableMermaid()`
  - KaTeX：`enableKatex()`, `disableKatex()`
- Worker 注入（CDN 或自定义 Worker）：
  - KaTeX：`createKaTeXWorkerFromCDN()`, `setKaTeXWorker()`
  - Mermaid：`createMermaidWorkerFromCDN()`, `setMermaidWorker()`

源码准绳：`src/exports.ts`

### `stream-markdown-parser`（解析器包）

- `getMarkdown()`, `parseMarkdownToStructure()`
- `ParseOptions` hooks（token/node transform）
- `final: true`（流结束时的行为）与 streaming mid-state 规则

源码/文档准绳：`packages/markdown-parser/src/index.ts`, `docs/guide/parser-api.md`

---

## 4) 常见用户流程（回答模板）

### A) 最小可用渲染

- 导入：`markstream-vue/index.css`
- 使用：`<MarkdownRender :content="md" />`

文档：`docs/zh/guide/quick-start.md`（如存在），`docs/guide/quick-start.md`, `docs/guide/installation.md`

### B) 流式（SSE / AI chat）+ 流结束处理

- 维护一个累积 `buffer`
- 每次增量后：`parseMarkdownToStructure(buffer, md, { final })` 更新 `nodes`
- 流结束：设置 `final: true`（ParseOptions 或组件 prop `final`），避免 mid-state “loading” 卡住

文档：`docs/guide/parser.md`, `docs/guide/parser-api.md`, `docs/guide/performance.md`

### C) 启用重能力（可选 peers）

- Mermaid：安装 `mermaid` → 客户端调用 `enableMermaid()`
- KaTeX：安装 `katex` + 导入 `katex/dist/katex.min.css` → 客户端调用 `enableKatex()`
- Monaco：安装 `stream-monaco` + 导入 `stream-monaco/esm/index.css`

文档：`docs/guide/installation.md`, `docs/guide/components.md`, `docs/guide/troubleshooting.md`

---

## 5) 高信号排错 checklist（先查这些）

1) **CSS 顺序/Reset**：先 reset，再 `markstream-vue/index.css`（Tailwind 常需要放进 `@layer components`）。
2) **可选 peer 是否安装**：Mermaid/KaTeX/Monaco/Shiki。
3) **是否显式启用**：`enableMermaid()` / `enableKatex()`（需要时）。
4) **peer CSS 是否导入**：`katex/dist/katex.min.css`、`stream-monaco/esm/index.css`（Mermaid 主题需要时也导入）。
5) **单独渲染节点组件**：外层需要 `.markstream-vue` 包裹以吃到库的 scoped CSS 变量。
6) **SSR（Nuxt）**：用 `&lt;client-only&gt;` 包裹，确保重 peer/worker 仅在浏览器侧初始化。

文档：`docs/guide/troubleshooting.md`, `docs/nuxt-ssr.md`, `docs/guide/tailwind.md`

---

## 6) 意图路由表（更像“问啥直接给答案”）

把用户一句话分类到意图后，直接用 “回答骨架 + 最小追问”。

| 意图 | 常见表述 | 快速检查 | 回答骨架（可直接复用） | 最小追问（最多 1~3 个） | 优先打开文档 | 必要时看源码 |
| --- | --- | --- | --- | --- | --- | --- |
| 安装 + 跑通最小例子 | “怎么用”, “最小示例” | CSS 已导入；组件能渲染 | “安装 `markstream-vue`，导入 `markstream-vue/index.css`，然后 `&lt;MarkdownRender :content="md" /&gt;` 即可渲染。” | “你是 Vite 还是 Nuxt？reset/CSS 导入顺序是怎样的？” | `docs/guide/quick-start.md`, `docs/guide/installation.md` | `src/exports.ts` |
| 样式缺失/很丑/不生效 | “没样式”, “CSS 乱了” | reset → 库 CSS；Tailwind 层；`.markstream-vue` 包裹 | “这类问题优先看 CSS 顺序：先 reset，再 `markstream-vue/index.css`（Tailwind 放 `@layer components`）。如果你没用 `MarkdownRender` 而是单独用节点组件，外层要有 `.markstream-vue`。” | “贴 `main.css`/入口 CSS 的导入顺序；你是用 `MarkdownRender` 还是单独节点组件？” | `docs/guide/troubleshooting.md`, `docs/guide/tailwind.md` | `src/index.css` |
| Tailwind 覆盖冲突 | “Tailwind 抢样式” | `@layer components`；用 `custom-id` 做局部覆盖 | “把库 CSS 放进 `@layer components`，并用 `custom-id` + `[data-custom-id=\"...\"]` 做局部样式覆盖，避免全局互相踩。” | “你的 Tailwind layers 写法是什么？是否给 `MarkdownRender` 传了 `custom-id`？” | `docs/guide/tailwind.md`, `docs/guide/props.md` | `src/index.css` |
| 流结束后卡 loading | “最后卡住”, “loading 一直转” | 结束时 `final: true` | “流式渲染结束时要设置 `final: true`（`parseMarkdownToStructure(..., { final: true })` 或 `&lt;MarkdownRender final /&gt;`），否则未闭合 fence/数学公式会保持 mid-state。” | “你在 end-of-stream 时是否设置 `final`？最后一段 markdown 是否以 ``` 或 $$ 结尾？” | `docs/guide/parser-api.md`, `docs/guide/parser.md` | `packages/markdown-parser/src/index.ts` |
| 流式很跳/一坨一坨冒出来 | “不平滑”, “像卡顿后一次性出来” | 调 batch；保持重节点延迟 | “开启/调小 batch（`renderBatchSize`/`renderBatchDelay`）来做更平滑的‘打字机’；同时保持重节点延迟渲染，避免 Monaco/Mermaid 抢主线程。” | “你每次 chunk 都立刻 setState 吗？当前 batch 参数是多少？” | `docs/guide/performance.md`, `docs/guide/props.md` | `src/components/NodeRenderer/NodeRenderer.vue` |
| 大文档性能差 | “长文卡”, “滚动掉帧” | 虚拟化 + buffer；延迟重节点 | “用虚拟化（`maxLiveNodes`, `liveNodeBuffer`）把 DOM 控制在窗口内，并延迟渲染 Monaco/Mermaid/KaTeX 等重节点。” | “文档大概多长（KB/行数）？是否包含很多 code block/mermaid？” | `docs/guide/performance.md` | `src/components/NodeRenderer/NodeRenderer.vue` |
| Mermaid 不显示 | “mermaid 空白” | peer 安装；`enableMermaid()`；CSS 顺序 | “先确认安装了 `mermaid`，然后在客户端调用 `enableMermaid()`；再检查 reset/CSS 顺序。Mermaid 相关节点在 peer 未安装/未启用时不会正常渲染。” | “你在哪里调用 `enableMermaid()`？是否 SSR？fence 是否是 ```mermaid？” | `docs/guide/mermaid.md`, `docs/guide/troubleshooting.md` | `src/components/MermaidBlockNode/mermaid.ts` |
| KaTeX 不显示 | “公式不渲染” | `katex` + CSS；`enableKatex()` | “安装 `katex` 并导入 `katex/dist/katex.min.css`，然后在客户端调用 `enableKatex()`。” | “是否导入 KaTeX CSS？你用的是 `$...$` 还是 `$$...$$`？是否 SSR？” | `docs/guide/math.md`, `docs/guide/installation.md` | `src/components/MathInlineNode/katex.ts` |
| Monaco 代码块没功能/空白 | “toolbar 没了”, “编辑器空白” | `stream-monaco` + CSS；CSS 顺序 | “安装 `stream-monaco` 并导入 `stream-monaco/esm/index.css`；编辑器空白通常是缺 CSS 或 CSS 被覆盖。” | “是否导入 `stream-monaco/esm/index.css`？控制台有 worker/Monaco 报错吗？” | `docs/guide/monaco.md`, `docs/guide/components.md` | `src/components/CodeBlockNode/` |
| 想要轻量代码块（不装 Monaco） | “SSR 友好”, “减包体” | Shiki 或 `&lt;pre&gt;` fallback | “如果不想装 Monaco，用 `MarkdownCodeBlockNode`（Shiki）或开启 `render-code-blocks-as-pre` 强制输出 `&lt;pre&gt;&lt;code&gt;`。” | “你需要语法高亮吗？是否接受安装 `shiki` + `stream-markdown`？” | `docs/guide/code-blocks.md`, `docs/guide/components.md` | `src/components/MarkdownCodeBlockNode/`, `src/components/PreCodeNode/` |
| Markdown 里嵌自定义组件 | “自定义 tag”, `&lt;thinking&gt;` | `customHtmlTags`/`custom-html-tags`；`setCustomComponents` | “把 tag 加进 `customHtmlTags`/`custom-html-tags` 让解析器产出对应 node type，再用 `setCustomComponents(customId, { thinking: 你的组件 })` 映射渲染。” | “tag 名称是什么？你希望按 HTML 透传还是变成自定义 node type？” | `docs/guide/advanced.md`, `docs/guide/parser-api.md` | `src/utils/nodeComponents.ts` |
| Nuxt SSR 报错 | “window is not defined” | `&lt;client-only&gt;`；重 peer 仅客户端 | “Nuxt SSR 场景用 `&lt;client-only&gt;` 包裹渲染器，并确保 Mermaid/Monaco/worker 初始化只在浏览器端执行。” | “报错发生在 build 还是 runtime？安装/启用了哪些 peers？” | `docs/nuxt-ssr.md` | `playground-nuxt/` |
| 想确认导出/怎么 import | “是否导出 X”, “import 路径” | 查 `exports.ts` + `package.json#exports` | “以 `src/exports.ts` 和 `package.json#exports` 为准，确认符号是否导出以及正确的 import 路径。” | “你要 import 的符号名是什么？现在写的 import 路径是什么？” | `docs/guide/api.md`, `docs/guide/components.md` | `src/exports.ts`, `package.json` |

---

## 7) 常用命令（repo）

- Playground：`pnpm dev`
- 文档：`pnpm docs:dev` / `pnpm docs:build` / `pnpm docs:serve`
- 测试：`pnpm test`
- 类型检查：`pnpm typecheck`
- Lint：`pnpm lint`
