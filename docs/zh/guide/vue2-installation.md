# Vue 2 安装

使用 pnpm、npm 或 yarn 安装 markstream-vue2。

```bash
pnpm add markstream-vue2
# 或
npm install markstream-vue2
# 或
yarn add markstream-vue2
```

## 要求

markstream-vue2 需要：
- **Vue 2.6.14+**（推荐使用 Vue 2.7 以获得更好的 TypeScript 支持）
- **@vue/composition-api**（如果使用 Vue 2.6.x）

## 可选的对等依赖

markstream-vue2 通过可选的对等依赖支持各种功能。只安装你需要的功能：

| 功能 | 所需包 | 安装命令 |
|---------|------------------|-----------------|
| 代码语法高亮 | `shiki`、`stream-markdown` | `pnpm add shiki stream-markdown` |
| Monaco 编辑器（完整代码块功能） | `stream-monaco` | `pnpm add stream-monaco` |
| Mermaid 图表 | `mermaid` | `pnpm add mermaid` |
| 数学公式渲染（KaTeX） | `katex` | `pnpm add katex` |

## Vue 2.6.x 设置

如果你使用的是 Vue 2.6.x，需要安装并配置 `@vue/composition-api`：

```bash
pnpm add @vue/composition-api
```

然后在你的应用入口文件中：

```ts
import VueCompositionAPI from '@vue/composition-api'
import Vue from 'vue'

Vue.use(VueCompositionAPI)
```

## 启用功能加载器（Mermaid / KaTeX）

安装可选的对等依赖后，在客户端入口文件中选择性启用：

```ts
import { enableKatex, enableMermaid } from 'markstream-vue2'

enableMermaid()
enableKatex()
```

同时记得导入必需的 CSS：

```ts
import 'markstream-vue2/index.css'
import 'katex/dist/katex.min.css'
import 'mermaid/dist/mermaid.css'
```

Monaco（`stream-monaco`）不需要单独导入 CSS。

注意：`markstream-vue2/index.css` 的样式被限制在内部的 `.markstream-vue2` 容器下，以减少全局样式冲突。`MarkdownRender` 默认在该容器内渲染。如果你单独渲染节点组件，请用 `<div class="markstream-vue2">...</div>` 包裹它们。

## Tailwind CSS 支持

如果你的项目使用 Tailwind，并希望避免重复注入 Tailwind utilities，请改用 Tailwind-ready 输出：

```ts
import 'markstream-vue2/index.tailwind.css'
```

并在 `tailwind.config.js` 的 `content` 中加入该包导出的 class 列表：

```js
module.exports = {
  content: [
    './src/**/*.{js,ts,vue}',
    require('markstream-vue2/tailwind'),
  ],
}
```

这种方式可以确保 Tailwind 在清除未使用的样式时包含 markstream-vue2 使用的所有工具类，从而获得更小的最终打包体积。

### 快速安装：所有功能

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

这将使用 Shiki 启用代码块的语法高亮。

#### Monaco 编辑器

完整的代码块功能（复制按钮、字体大小控制、展开/折叠）：

```bash
pnpm add stream-monaco
```

如果不安装 `stream-monaco`，代码块仍会渲染，但交互式按钮可能无法工作。

#### Mermaid 图表

渲染 Mermaid 图表：

```bash
pnpm add mermaid
```

#### KaTeX 数学公式渲染

数学公式渲染：

```bash
pnpm add katex
```

同时在应用入口文件中导入 KaTeX CSS：

```ts
import 'katex/dist/katex.min.css'
```

## 快速测试

导入并渲染一个简单的 markdown 字符串：

```vue
<script>
import MarkdownRender from 'markstream-vue2'
import 'markstream-vue2/index.css'

export default {
  components: {
    MarkdownRender
  },
  data() {
    return {
      md: '# Hello from markstream-vue2!'
    }
  }
}
</script>

<template>
  <MarkdownRender :content="md" />
</template>
```

## 使用 Composition API（Vue 2.7+）

如果你使用的是 Vue 2.7 或已安装 `@vue/composition-api`：

```vue
<script>
import { defineComponent, ref } from '@vue/composition-api' // 或 Vue 2.7 的 'vue'
import MarkdownRender from 'markstream-vue2'
import 'markstream-vue2/index.css'

export default defineComponent({
  components: {
    MarkdownRender
  },
  setup() {
    const md = ref('# Hello from markstream-vue2 with Composition API!')
    return { md }
  }
})
</script>

<template>
  <MarkdownRender :content="md" />
</template>
```

## TypeScript 支持

markstream-vue2 包含 TypeScript 类型定义。对于 Vue 2.6.x，你可能需要配置 `tsconfig.json`：

```json
{
  "compilerOptions": {
    "types": ["@vue/composition-api"]
  }
}
```

对于 Vue 2.7+，类型会自动包含。
