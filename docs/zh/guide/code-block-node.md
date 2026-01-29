# CodeBlockNode 组件

`CodeBlockNode` 是库中用于渲染富交互代码块的组件。对于需要编辑/高亮/增量渲染的场景，推荐安装 `stream-monaco`。组件为头部提供灵活的自定义点（props + slots），并在常见场景下提供可拦截的事件。

## 快速概览

- Monaco 模式（安装 `stream-monaco`）— 类编辑器渲染，带 worker 支持
- 降级模式 — 未安装 `stream-monaco` 时会回退为纯 `<pre><code>` 渲染
- 如果你希望用 Shiki（不引入 Monaco），请使用 `MarkdownCodeBlockNode`（同伴依赖：`shiki` + `stream-markdown`）

## Props

完整签名请参阅 `src/types/component-props.ts`。关键 props：

- `node` — code_block 节点（必需）
- `loading`、`stream`、`isShowPreview`
- 头部控制：`showHeader`、`showCopyButton`、`showExpandButton`、`showPreviewButton`、`showFontSizeButtons`

## Slots 插槽

- `header-left` — 替换左侧头部
- `header-right` — 替换右侧头部
- `loading` — 自定义流式禁用时的占位符

## Emits 事件

- `copy(text: string)` — 点击复制时触发
- `previewCode(payload)` — 仅在你监听 `@preview-code` 时才会触发；payload 为 `{ node, artifactType, artifactTitle, id }`

## 示例

### 安装并运行（Monaco 模式）

```bash
pnpm add stream-monaco
```

### 基础示例

```vue
<CodeBlockNode :node="{ type: 'code_block', language: 'js', code: 'console.log(1)', raw: 'console.log(1)' }" />
```

### 替换头部并隐藏复制按钮

```vue
<CodeBlockNode :node="node" :showCopyButton="false">
  <template #header-left>
    <div class="flex items-center">自定义左侧</div>
  </template>
  <template #header-right>
    <button @click="runSnippet">运行</button>
  </template>
</CodeBlockNode>
```

### 自定义加载占位符

```vue
<CodeBlockNode :node="node" :stream="false" :loading="true">
  <template #loading="{ loading, stream }">
    <div v-if="loading && !stream">正在加载编辑器资源…</div>
  </template>
</CodeBlockNode>
```

## 主题切换

`CodeBlockNode` 支持基于深色/浅色模式的自动主题切换。使用 `@vueuse/core` 的 `useDark` composable 来追踪主题状态，并将主题名称传递给 `MarkdownRender` 或 `CodeBlockNode`。

### 在独立的 Vue 应用中使用 @vueuse/core

```vue
<script setup>
import { toggleDark, useDark } from '@vueuse/core'
import MarkdownRender from 'markstream-vue'

const isDark = useDark() // Ref<boolean> 响应式系统/主题偏好
const content = '# 示例\n\n```js\nconsole.log("深色模式")\n```'

// 可用主题（必须包含你想要使用的主题）
const themes = [
  'vitesse-dark',
  'vitesse-light',
  'github-dark',
  'github-light',
  // ... 更多主题
]
</script>

<template>
  <div>
    <button @click="toggleDark()">
      切换主题
    </button>
    <MarkdownRender
      :is-dark="isDark"
      code-block-dark-theme="vitesse-dark"
      code-block-light-theme="vitesse-light"
      :themes="themes"
      :content="content"
    />
  </div>
</template>
```

### VitePress 集成

对于 VitePress，使用 VitePress 内置的 `useData()` 中的 `isDark`：

```ts
// docs/.vitepress/theme/composables/useDark.ts
import { useData } from 'vitepress'

/**
 * VitePress 主题 composable 用于深色模式
 * 使用 VitePress 内置的 useData() 获取 isDark
 */
export function useDark() {
  const { isDark } = useData()
  return isDark
}
```

```vue
<!-- 在任意 .md 文件或组件中 -->
<script setup>
import MarkdownRender from 'markstream-vue'
import { useDark } from '../../.vitepress/theme'

const isDark = useDark()
const content = '# 示例\n\n```js\nconsole.log("深色模式")\n```'

const themes = [
  'vitesse-dark',
  'vitesse-light',
  'github-dark',
  'github-light',
  // ... 更多主题
]
</script>

<template>
  <MarkdownRender
    :is-dark="isDark"
    code-block-dark-theme="vitesse-dark"
    code-block-light-theme="vitesse-light"
    :themes="themes"
    :content="content"
  />
</template>
```

**工作原理：**

当 `isDark` 变化时，`CodeBlockNode` 会自动切换到对应的主题：
- 当 `isDark` 为 `true` → 使用 `codeBlockDarkTheme`（如 `'vitesse-dark'`）
- 当 `isDark` 为 `false` → 使用 `codeBlockLightTheme`（如 `'vitesse-light'`）

`themes` prop 用于注册可用主题，以便 Monaco 可以按需懒加载它们。

**CodeBlockNode 的关键差异：**

| Prop | 直接使用 CodeBlockNode | 通过 MarkdownRender |
|------|---------------------|-------------------|
| `isDark` | 直接传给 `<CodeBlockNode :is-dark="isDark" />` | 通过 `<MarkdownRender :is-dark="isDark" />` 传入并自动转发 |
| 主题 props | `:dark-theme="'vitesse-dark'"` `:light-theme="'vitesse-light'"` | `:code-block-dark-theme="'vitesse-dark'"` `:code-block-light-theme="'vitesse-light'"` |
| 主题列表 | `:themes="['vitesse-dark', 'vitesse-light', ...]"` | `:themes="['vitesse-dark', 'vitesse-light', ...]"` |

## 注意事项

- CodeBlock 头部 API 在 [codeblock-header](/zh/guide/codeblock-header) 中有文档说明（包含替换头部和自定义加载占位符的示例）。
- `CodeBlockNode` 和 `MermaidBlockNode` 的 `copy` 事件 payload 不同：`CodeBlockNode` 触发 `copy(text: string)`，而 `MermaidBlockNode` 触发 `copy(ev: MermaidBlockEvent<{ type: 'copy'; text: string }>)`（支持 `preventDefault()`）。

快速尝试 — 简单的行内用法示例：

```vue
<script setup lang="ts">
const node = { type: 'code_block', language: 'js', code: 'console.log("hello")', raw: 'console.log("hello")' }
</script>

<template>
  <CodeBlockNode :node="node" />
</template>
```
