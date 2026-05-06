<script lang="ts">
  import type { SvelteRenderableNode, SvelteRenderContext } from './shared/node-helpers'
  import InlineWrapNode from './InlineWrapNode.svelte'
  export let node: SvelteRenderableNode
  export let context: SvelteRenderContext | undefined = undefined
  export let indexKey: string | number | undefined = undefined
</script>
<InlineWrapNode {node} {context} {indexKey} tag="del" />
