# Svelte

`markstream-svelte` provides the Svelte 5-only renderer with the same component names, worker helpers, and playground fixtures as the Vue and React packages. Svelte 4 is not supported.

Install the package with Svelte 5:

```bash
pnpm add markstream-svelte svelte@^5
```

```svelte
<script lang="ts">
  import MarkdownRender from 'markstream-svelte'
  import 'markstream-svelte/index.css'

  let { content = '# markstream-svelte' }: { content?: string } = $props()
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

Example `ThinkingNode.svelte`:

```svelte
<script lang="ts">
  import MarkdownRender from 'markstream-svelte'

  let {
    node,
    customId = undefined,
  }: {
    node: any
    customId?: string
  } = $props()
</script>

<section class="thinking-node">
  <MarkdownRender
    content={String(node?.content ?? '')}
    {customId}
    customHtmlTags={['thinking']}
  />
</section>
```

Local playground:

```bash
pnpm play:svelte
```
