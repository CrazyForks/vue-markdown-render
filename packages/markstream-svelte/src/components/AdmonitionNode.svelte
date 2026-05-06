<script lang="ts">
  import type { SvelteRenderableNode, SvelteRenderContext } from './shared/node-helpers'
  import { renderNodeHtml } from './shared/renderNodeHtml'
  export let node: SvelteRenderableNode
  export let context: SvelteRenderContext | undefined = undefined
  $: html = renderNodeHtml(node, context)
</script>
{@html html}
