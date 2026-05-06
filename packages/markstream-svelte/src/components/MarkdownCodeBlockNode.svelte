<script lang="ts">
  import type { SvelteRenderableNode, SvelteRenderContext } from './shared/node-helpers'
  import CodeBlockNode from './CodeBlockNode.svelte'
  export let node: SvelteRenderableNode
  export let context: SvelteRenderContext | undefined = undefined
</script>
<CodeBlockNode {node} {context} />
