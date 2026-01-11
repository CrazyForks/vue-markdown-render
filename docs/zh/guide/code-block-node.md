# CodeBlockNode 组件

`CodeBlockNode` 是库中用于渲染富交互代码块的组件。对于需要编辑/高亮/增量渲染的场景，推荐安装 `stream-monaco`。组件为头部提供灵活的自定义点（props + slots），并在常见场景下提供可拦截的事件。

## 快速概览

- Monaco 模式（安装 `stream-monaco`）— 类编辑器渲染，带 worker 支持
- Markdown 模式（安装 `stream-markdown`）— 替代的 markdown 驱动渲染器
- 降级模式 — 当没有可选依赖时，使用纯 `<pre><code>` 渲染

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
- `previewCode(payload)` — 预览操作触发时；payload 包含 `{ type, content, title }`

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
