# VitePress 文档指南

这篇页面用来记录我们在编写 VitePress 文档时的目标与模板，确保每个组件、API 以及常见问题都覆盖到以下三个问题：

1. 组件解决了什么问题，与 Vue/Nuxt/VitePress 的关系是什么？
2. 使用时需要哪些 props、事件、插槽，如何一步步集成？
3. 出现样式异常（浏览器默认样式、Tailwind/UnoCSS 冲突）时如何排查？

## 1. 组件章节怎么写

- **概览卡片**：在开头用列表说明「最适合的场景」、「是否需要可选依赖（Mermaid、Monaco、KaTeX）」以及「关键 props / events」。
- **Usage 梯度**：准备三个层级的代码片段——最小示例、带完整 props/slot 的示例、以及在 VitePress/Nuxt 中通过 `setCustomComponents` 集成的示例。
- **常见坑**：列举 2–3 条失败场景，例如缺少样式依赖、`window is not defined`、或是 `mermaid` 版本不兼容。
- **See also**：在每个组件段落末尾附上相关页面链接（`/guide/components`、`/guide/advanced`、`/guide/troubleshooting` 等）。

推荐的 Markdown 模板：

```md
## ComponentName

> 一句话说明用途

### Quick Reference
- 最佳使用场景
- 关键 props / 事件（链接到 API 表）
- 需要的 peerDependencies

### Usage
```vue
<!-- 最小示例 -->
```

```vue
<!-- 完整示例 + playground 链接 -->
```

### Customize & Integrate
- 插槽、`setCustomComponents` 用法
- 可覆盖的 CSS 变量或类名

### Common pitfalls
- 浏览器默认样式导致的显示异常
- 缺少 peerDependency
```

## 2. 入口页面的结构

`Quick Start`、`Usage & API`、`Components`、`Troubleshooting` 是访问量最高的页面，需要包含：

- 针对 VitePress / Nuxt / 独立 Vue 的「入口卡片」。
- Markdown 渲染流程图（Markdown → Parser → AST → 组件树）。
- 样式排障提醒：指出 CSS Reset、UnoCSS/Tailwind `@layer`、以及 playground 复现方法。
- 「组件矩阵」表格，标记每个节点对应的文件、是否有 Slot、是否可通过 CSS 变量定制。

## 3. 样式排障提前写进文档

- **浏览器默认样式**：提醒先引入 reset（`modern-css-reset`、`@unocss/reset`、`@tailwind base`），然后再引入 `markstream-vue/index.css`。
- **Tailwind / UnoCSS 层级**：告诉读者使用 `@layer components { @import 'markstream-vue/index.css' }`，或 UnoCSS `preflights` 来固定顺序。
- **组件库 / 设计系统冲突**：建议给 `MarkdownRender` 加上 `custom-id`，并使用 `[data-custom-id="docs"] .class` 的方式做局部覆盖。

## 4. 发布新页面前的检查清单

1. Sidebar 是否已添加链接（中英文）。
2. 示例是否附带 playground 链接。
3. 提到样式就要提醒 reset 顺序。
4. 本地跑一次 `pnpm docs:dev` 并用浏览器的 Cascade Layers 查顺序。
5. 若描述新的异常/坑，记得同步更新 `/guide/troubleshooting.md`。

## 5. 常见问题分类

- **浏览器默认样式**：`p`、`pre`、`table` 的 margin/padding 不一致，建议使用 `@unocss/reset` 或 `modern-css-reset`。
- **工具类框架**：Tailwind/UnoCSS utility 覆盖组件样式，建议使用 layer/prefix，例如 Tailwind `prefix: 'tw-'`。
- **第三方 CSS**：UI 库修改 `:root` 或 `body`，可以通过 `custom-id` + `setCustomComponents` 限定在某个渲染实例里覆盖。
