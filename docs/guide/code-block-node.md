# CodeBlockNode (Component)

`CodeBlockNode` 是库中用于渲染富交互代码块的组件。对于需要编辑/高亮/增量渲染的场景，推荐安装 `stream-monaco`。组件为头部提供灵活的自定义点（props + slots），并在常见场景下提供可拦截的事件。

## Quick summary
- Monaco mode (install `stream-monaco`) — editor-like rendering with workers
- Markdown mode (install `stream-markdown`) — alternative markdown-driven renderer
- Fallback — plain `<pre><code>` when no optional deps present

## Props
Refer to `src/types/component-props.ts` for full signature. Key props:
- `node` — code_block node (required)
- `loading`, `stream`, `isShowPreview`
- Header controls: `showHeader`, `showCopyButton`, `showExpandButton`, `showPreviewButton`, `showFontSizeButtons`

## Slots
- `header-left` — replace left header
- `header-right` — replace right header
- `loading` — customize placeholder when streaming is disabled

## Emits
- `copy(text: string)` — when copy pressed
- `previewCode(payload)` — when preview action triggers; payload contains `{ type, content, title }`

## Examples
### Install and run (Monaco)

```bash
pnpm add stream-monaco
```

### Basic example

```vue
<CodeBlockNode :node="{ type: 'code_block', language: 'js', code: 'console.log(1)', raw: 'console.log(1)' }" />
```

### Replace header and hide copy button

```vue
<CodeBlockNode :node="node" :showCopyButton="false">
  <template #header-left>
    <div class="flex items-center">Custom left</div>
  </template>
  <template #header-right>
    <button @click="runSnippet">Run</button>
  </template>
</CodeBlockNode>
```

### Custom loading placeholder

```vue
<CodeBlockNode :node="node" :stream="false" :loading="true">
  <template #loading="{ loading, stream }">
    <div v-if="loading && !stream">Loading editor assets…</div>
  </template>
</CodeBlockNode>
```

## Notes
- The CodeBlock header API is documented in `docs/guide/codeblock-header.md` (examples for replacing header and custom loading placeholder).
- If you'd like `copy`/`previewCode` to use the same `MermaidBlockEvent` wrapper with `preventDefault()` semantics, I can update the component and docs accordingly — this enables consumers to intercept and cancel default behaviors.

---

Tell me if you want me to also:
- Add stricter TS types for `defineEmits` in the SFC
- Update the docs sidebar to link this page (I can add the entry to `docs/guide/index.md` or the sidebar config)
- Add a runnable example in `playground/` demonstrating slot usage and event interception
