<script lang="ts">
  import type { SvelteRenderableNode, SvelteRenderContext } from './shared/node-helpers'
  import RenderChildren from './RenderChildren.svelte'
  import { getNodeList } from './shared/node-helpers'
  export let node: SvelteRenderableNode
  export let context: SvelteRenderContext | undefined = undefined
  export let indexKey: string | number | undefined = undefined
  $: ordered = Boolean((node as any)?.ordered)
  $: start = Number((node as any)?.start)
  $: tag = ordered ? 'ol' : 'ul'
</script>
{#if ordered}
  <ol start={Number.isFinite(start) ? start : undefined}><RenderChildren nodes={getNodeList((node as any)?.items)} context={context} prefix={String(indexKey ?? 'list') + '-list'} /></ol>
{:else}
  <ul><RenderChildren nodes={getNodeList((node as any)?.items)} context={context} prefix={String(indexKey ?? 'list') + '-list'} /></ul>
{/if}
