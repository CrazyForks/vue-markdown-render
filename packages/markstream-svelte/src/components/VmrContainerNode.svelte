<script lang="ts">
  import type { SvelteRenderableNode, SvelteRenderContext } from './shared/node-helpers'
  import { renderNodeHtml } from './shared/renderNodeHtml'

  let {
    node,
    context = undefined
  }: {
    node: SvelteRenderableNode
    context?: SvelteRenderContext
  } = $props()

  let html = $derived(renderNodeHtml(node, context))
</script>

{@html html}
