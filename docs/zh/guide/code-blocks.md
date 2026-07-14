# 代码块渲染

## 概述

代码块渲染有三种策略，取决于你安装的可选依赖与配置：

- 增强 surface（推荐用于大型或交互式代码块）：安装 `stream-diffs`，获得 File/FileDiff 渲染、语法高亮和 diff 交互。代码块结束流式输出并进入可视区域后，`CodeBlockNode` 才按需加载 core runtime。
- Shiki（MarkdownCodeBlockNode）：安装 `stream-markdown`，并通过 `setCustomComponents` 覆盖 `code_block` 节点以使用轻量的 Markdown 渲染器。
- 回退（无额外依赖）：如果两个可选包均未安装，代码块会退回为普通的 `<pre><code>` 渲染，仅保留基础样式。

## stream-diffs surface（推荐）

- 安装：

```bash
pnpm add stream-diffs
# or
npm i stream-diffs
```

- 职责边界：`stream-diffs` 根入口与框架无关。它的 controller 接收 `HTMLElement` 与普通的 code/diff 数据，不包含 Vue lifecycle。`stream-diffs/vue` 是独立的可选便捷入口，`markstream-vue` 当前不会使用它。
- 行为：Vue 适配层在内容仍在流式输出时让 `CodeBlockNode` 保持稳定的 `PreCodeNode` 表示；代码块结束且进入可视区域后，才挂载一个 `stream-diffs` File 或 FileDiff surface 并应用语法高亮。
- `CodeBlockShell` 负责标题和操作栏，内部 `data-diffs-header` 会被关闭，File surface 不会再渲染第二行标题。
- 这个集成不需要 worker plugin，也不需要额外 CSS import。运行时与预热说明见 [/zh/guide/monaco](/zh/guide/monaco)。

## Shiki 模式（MarkdownCodeBlockNode）

- 安装：

```bash
pnpm add stream-markdown
# or
npm i stream-markdown
```

- 通过 `setCustomComponents` 覆盖 `code_block` 节点以注册 Shiki 版渲染器。示例：

```ts twoslash
import { MarkdownCodeBlockNode, setCustomComponents } from 'markstream-vue'

setCustomComponents({ code_block: MarkdownCodeBlockNode })
```

设置后，`code_block` 会使用 `MarkdownCodeBlockNode`（由 `stream-markdown` + Shiki 驱动）。你也可以自定义组件并直接使用 `stream-markdown`。

### 语言图标懒加载

为了减小主包体积，低频语言图标已拆分到异步 chunk：

- 常见语言（JS/TS/HTML/CSS/JSON/Python 等）图标仍在主包内。
- 低频语言图标按需加载，异步 chunk 返回后会自动刷新图标显示。
- 如果你希望避免首次命中时的回退图标，可在应用空闲阶段预热一次：

```ts twoslash
import { preloadExtendedLanguageIcons } from 'markstream-vue'

if (typeof window !== 'undefined')
  void preloadExtendedLanguageIcons()
```

快速试一下：

```vue twoslash
<script setup lang="ts">
import type { CodeBlockNodeProps } from 'markstream-vue'
import { CodeBlockNode } from 'markstream-vue'

const node = {
  type: 'code_block',
  language: 'js',
  code: 'console.log(42)',
  raw: 'console.log(42)',
} satisfies CodeBlockNodeProps['node']
</script>

<template>
  <CodeBlockNode :node="node" />
</template>
```

### Vue CLI 4（Webpack 4）注意事项

如果你使用 Vue CLI 4（Webpack 4），更推荐把代码块切到 Shiki 模式，并通过覆盖 `code_block` 来避免 Monaco 在 legacy bundler 下的一些兼容性问题。

踩坑与解决（可直接参考 `playground-vue2-cli`）：

- Webpack 4 不支持 `package.json#exports`：建议通过 `resolve.alias` 指向真实的 `dist/*` 文件路径。
- `stream-markdown` 属于 ESM-only 包，在 `vue.config.js`（CJS）里可能无法用 `require.resolve('stream-markdown')` 找到：需要用文件系统兜底去定位 `node_modules/stream-markdown`，并 alias 到 `dist/index.js`。
- 如果你用 `IgnorePlugin` 忽略可选依赖，注意不要误伤 `stream-markdown`，否则运行时会出现 `webpackMissingModule`（表现为 “Cannot find module 'stream-markdown'”）。

## 回退

若未安装上述任一可选包，渲染器会回退为简单的 `pre`/`code` 表现。

## 参考链接

- Worker / SSR 指南：[/zh/nuxt-ssr](/zh/nuxt-ssr)
- 安装说明：[/zh/guide/installation](/zh/guide/installation)
