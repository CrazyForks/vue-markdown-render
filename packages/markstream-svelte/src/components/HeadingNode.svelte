<script lang="ts">
  import type { SvelteRenderableNode, SvelteRenderContext } from './shared/node-helpers'
  import RenderChildren from './RenderChildren.svelte'
  import { clampHeadingLevel, getNodeList } from './shared/node-helpers'

  export let node: SvelteRenderableNode
  export let context: SvelteRenderContext | undefined = undefined
  export let indexKey: string | number | undefined = undefined
  $: level = clampHeadingLevel((node as any)?.level)
  $: tag = 'h' + level
</script>

<svelte:element this={tag} class={'heading-node heading-' + level}>
  <RenderChildren nodes={getNodeList((node as any)?.children)} context={context} prefix={String(indexKey ?? 'heading') + '-heading'} />
</svelte:element>
