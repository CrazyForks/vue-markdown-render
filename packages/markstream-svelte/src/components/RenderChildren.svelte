<script lang="ts">
  import type { SvelteRenderableNode, SvelteRenderContext } from './shared/node-helpers'
  import NodeOutlet from './NodeOutlet.svelte'

  let {
    nodes = [],
    context = undefined,
    prefix = 'child',
  }: {
    nodes?: readonly SvelteRenderableNode[] | null
    context?: SvelteRenderContext
    prefix?: string
  } = $props()
</script>

{#each nodes || [] as child, index (prefix + '-' + index)}
  <NodeOutlet node={child} context={context} indexKey={prefix + '-' + index} />
{/each}
