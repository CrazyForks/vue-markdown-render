# Svelte

`markstream-svelte` provides the Svelte 5 renderer with the same component names, worker helpers, and playground fixtures as the Vue and React packages.

```svelte
<script lang="ts">
  import MarkdownRender from 'markstream-svelte'
  import 'markstream-svelte/index.css'

  export let content = '# markstream-svelte'
</script>

<MarkdownRender
  {content}
  codeBlockDarkTheme="vitesse-dark"
  codeBlockLightTheme="vitesse-light"
/>
```

The default export and named `MarkdownRender` / `NodeRenderer` export point to the same Svelte component.

For KaTeX and Mermaid worker parity:

```svelte
<script lang="ts">
  import { setKaTeXWorker, setMermaidWorker } from 'markstream-svelte'
  import KatexWorker from 'markstream-svelte/workers/katexRenderer.worker?worker&inline'
  import MermaidWorker from 'markstream-svelte/workers/mermaidParser.worker?worker&inline'

  setKaTeXWorker(new KatexWorker())
setMermaidWorker(new MermaidWorker())
</script>
```

Custom HTML tags use the same scoped component registry:

```svelte
<script lang="ts">
  import MarkdownRender, { setCustomComponents } from 'markstream-svelte'
  import ThinkingNode from './ThinkingNode.svelte'

  const customId = 'demo'

  setCustomComponents(customId, {
    thinking: ThinkingNode,
  })
</script>

<MarkdownRender
  content="<thinking>nested **markdown**</thinking>"
  {customId}
  customHtmlTags={['thinking']}
/>
```

Local playground:

```bash
pnpm play:svelte
```
