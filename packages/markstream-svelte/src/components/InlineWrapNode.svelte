<script lang="ts">
  import type { SvelteRenderableNode, SvelteRenderContext } from './shared/node-helpers'
  import RenderChildren from './RenderChildren.svelte'
  import { getNodeList } from './shared/node-helpers'
  export let node: SvelteRenderableNode
  export let context: SvelteRenderContext | undefined = undefined
  export let indexKey: string | number | undefined = undefined
  export let tag = 'span'
</script>
<svelte:element this={tag}><RenderChildren nodes={getNodeList((node as any)?.children)} context={context} prefix={String(indexKey ?? tag) + '-' + tag} /></svelte:element>
