<script lang="ts">
  import type { SvelteRenderableNode, SvelteRenderContext } from './shared/node-helpers'
  import NodeOutlet from './NodeOutlet.svelte'

  export let nodes: readonly SvelteRenderableNode[] | null | undefined = []
  export let context: SvelteRenderContext | undefined = undefined
  export let prefix = 'child'
</script>

{#each nodes || [] as child, index (prefix + '-' + index)}
  <NodeOutlet node={child} context={context} indexKey={prefix + '-' + index} />
{/each}
