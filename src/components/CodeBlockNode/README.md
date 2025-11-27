# CodeBlockNode

`CodeBlockNode` — feature-rich code block renderer (Monaco-based when `stream-monaco` is installed), with configurable header and toolbar.

Features
- Optional Monaco streaming editor integration (`stream-monaco`) for large/interactive blocks
- Fallback to lightweight `PreCodeNode` or `shiki` highlighting when optional deps are missing
- Header toolbar with copy, expand/collapse, preview, and font-size controls
- Named slots to replace header pieces (`header-left`, `header-right`) and loading placeholder
- Events for `copy` and `previewCode`

Props (high level)
- `node` — code block node (required)
- `isDark?: boolean`
- `loading?: boolean`
- `stream?: boolean` — whether streaming updates are used
- `enableFontSizeControl?: boolean`
- Header toggles (all default to true): `showHeader`, `showCopyButton`, `showExpandButton`, `showPreviewButton`, `showFontSizeButtons`

Slots
- `header-left` — replace left header area
- `header-right` — replace right header area
- `loading` — customize loading placeholder (receives `{ loading, stream }`)

Emits
- `copy` — emitted when the copy action occurs; payload is the copied text
- `previewCode` — emitted when preview action is triggered; payload contains an object like `{ type, content, title }`

Examples

Hide header completely:
```vue
<CodeBlockNode
  :node="{ type: 'code_block', language: 'javascript', code: 'console.log(1)', raw: 'console.log(1)' }"
  :showHeader="false"
  :loading="false"
/>
```

Replace header sections via slots:
```vue
<CodeBlockNode :node="node" :showCopyButton="false">
  <template #header-left>
    <div class="flex items-center gap-2">My custom label</div>
  </template>
  <template #header-right>
    <button @click="runExample">Run</button>
  </template>
</CodeBlockNode>
```

Intercept copy event:
```vue
<CodeBlockNode :node="node" @copy="(text) => console.log('copied', text)" />
```

Notes
- Install `stream-monaco` to enable the advanced Monaco-based renderer. Without it, the component uses a lightweight fallback.
- If you want the code block to behave similarly to the Mermaid component (events that can prevent default behavior), tell me and I can add a standardized event wrapper with `preventDefault()` for `previewCode`/`copy` as we did for Mermaid.
