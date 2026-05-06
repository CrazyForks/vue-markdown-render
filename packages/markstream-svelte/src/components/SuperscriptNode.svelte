<script lang="ts">
  import type { SvelteRenderableNode, SvelteRenderContext } from './shared/node-helpers'
  import InlineWrapNode from './InlineWrapNode.svelte'

  let {
    node,
    context = undefined,
    indexKey = undefined
  }: {
    node: SvelteRenderableNode
    context?: SvelteRenderContext
    indexKey?: string | number
  } = $props()
</script>

<InlineWrapNode {node} {context} {indexKey} tag="sup" />
