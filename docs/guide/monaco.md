# Monaco Editor Integration

Monaco integration is provided by `stream-monaco` and is optional. It supports fast, incremental updates for large code blocks.

Install:

```bash
pnpm add stream-monaco
```

Use `CodeBlockNode` (default) to render Monaco-powered code blocks. For read-only usage, use `MarkdownCodeBlockNode`.

Tips:
- Defer Monaco initialization for offscreen code blocks
- Use `codeBlockStream: false` to avoid partial updates if desired

![Monaco demo](/screenshots/codeblock-demo.svg)

### Vite & worker setup

Monaco requires worker packaging for production builds. Use `vite-plugin-monaco-editor-esm` to ensure workers are bundled into your app's build output. Example config:

```ts
import path from 'node:path'
import monacoEditorPlugin from 'vite-plugin-monaco-editor-esm'

export default defineConfig({
  plugins: [
    monacoEditorPlugin({
      languageWorkers: [
        'editorWorkerService',
        'typescript',
        'css',
        'html',
        'json',
      ],
      customDistPath(root, buildOutDir, base) {
        return path.resolve(buildOutDir, 'monacoeditorwork')
      },
    }),
  ],
})
```

### Preloading Monaco

To avoid a first-render flash when the first code block mounts, preload the Monaco integration during app initialization or on first route mount:

```ts
import { getUseMonaco } from 'markstream-vue'

getUseMonaco()
```

`getUseMonaco` attempts to dynamically import `stream-monaco` and call its helper to register workers; if not available it fails gracefully and the code block falls back to a lightweight rendering.
