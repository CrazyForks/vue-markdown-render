# 安装

使用 `pnpm`, `npm` 或 `yarn`:

```bash
pnpm add markstream-vue
# 或
npm install markstream-vue
# 或
yarn add markstream-vue
```

## 可选 Peer 依赖

markstream-vue 通过可选的 peer 依赖支持各种功能。按需安装：

| 功能 | 需要的包 | 安装命令 |
|------|---------|---------|
| Shiki 代码块（`MarkdownCodeBlockNode`） | `shiki`, `stream-markdown` | `pnpm add shiki stream-markdown` |
| Monaco 编辑器（完整代码块功能） | `stream-monaco` | `pnpm add stream-monaco` |
| Mermaid 图表 | `mermaid` | `pnpm add mermaid` |
| 数学公式渲染（KaTeX） | `katex` | `pnpm add katex` |

## 功能加载器（Mermaid / KaTeX）

安装可选 peer 后，默认 loader 已经启用。仅当你之前手动关闭，或需要自定义 loader（例如使用 CDN 版本）时才需要调用：

```ts
import { enableKatex, enableMermaid } from 'markstream-vue'

// 可选：重新启用或覆盖 loader
enableMermaid()
enableKatex()
```

同时别忘了导入必需的 CSS（按需使用，Monaco 不需要额外导入 CSS）：

```ts
import 'markstream-vue/index.css'
import 'katex/dist/katex.min.css'
```

### 快速安装：全部功能

一次性启用所有功能：

```bash
pnpm add shiki stream-markdown stream-monaco mermaid katex
# 或
npm install shiki stream-markdown stream-monaco mermaid katex
```

### 功能详情

#### 代码语法高亮

需要同时安装 `shiki` 和 `stream-markdown`：

```bash
pnpm add shiki stream-markdown
```

这些包用于 Shiki 版的 `MarkdownCodeBlockNode`。若要在 `MarkdownRender` 中使用 Shiki，请覆盖 `code_block` 渲染器（或直接使用 `MarkdownCodeBlockNode`）。

```ts
import MarkdownRender, { MarkdownCodeBlockNode, setCustomComponents } from 'markstream-vue'

setCustomComponents({ code_block: MarkdownCodeBlockNode })
```

#### Monaco 编辑器

获得完整的代码块功能（复制按钮、字体大小控制、展开/折叠）：

```bash
pnpm add stream-monaco
```

没有 `stream-monaco`，代码块会渲染但交互按钮可能无法工作。

#### Mermaid 图表

渲染 Mermaid 图表：

```bash
pnpm add mermaid
```

#### KaTeX 数学公式渲染

渲染数学公式：

```bash
pnpm add katex
```

还需要在应用入口文件（如 `main.ts`）中导入 KaTeX 的 CSS：

```ts
import 'katex/dist/katex.min.css'
```

## 快速测试

导入并渲染一个简单的 markdown 字符串：

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import 'markstream-vue/index.css'

const md = '# 你好，markstream-vue！'
</script>

<template>
  <MarkdownRender :content="md" />
</template>
```

补充说明：`markstream-vue/index.css` 已限定在内部 `.markstream-vue` 容器中，用于降低全局样式冲突。`MarkdownRender` 默认渲染在容器内部；如果你独立使用节点组件，请外层包一层 `<div class="markstream-vue">...</div>`。
