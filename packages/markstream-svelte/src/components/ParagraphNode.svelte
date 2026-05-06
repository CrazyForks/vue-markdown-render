<script lang="ts">
  import type { SvelteRenderableNode, SvelteRenderContext } from './shared/node-helpers'
  import RenderChildren from './RenderChildren.svelte'
  import NodeOutlet from './NodeOutlet.svelte'
  import { getNodeList, splitParagraphChildren } from './shared/node-helpers'

  export let node: SvelteRenderableNode
  export let context: SvelteRenderContext | undefined = undefined
  export let indexKey: string | number | undefined = undefined

  $: prefix = String(indexKey ?? 'p')
  $: parts = splitParagraphChildren(getNodeList((node as any)?.children))
</script>

{#each parts as part, index (prefix + '-' + index)}
  {#if part.kind === 'inline'}
    <p class="paragraph-node"><RenderChildren nodes={part.nodes} context={context} prefix={prefix + '-' + index} /></p>
  {:else}
    <NodeOutlet node={part.node} context={context} indexKey={prefix + '-' + index} />
  {/if}
{/each}
