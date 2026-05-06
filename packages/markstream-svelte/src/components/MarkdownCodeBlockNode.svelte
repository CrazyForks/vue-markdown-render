<script lang="ts">
  import type { SvelteRenderableNode, SvelteRenderContext } from './shared/node-helpers'
  import CodeBlockNode from './CodeBlockNode.svelte'

  let {
    node,
    context = undefined
  }: {
    node: SvelteRenderableNode
    context?: SvelteRenderContext
  } = $props()
</script>

<CodeBlockNode {node} {context} />
