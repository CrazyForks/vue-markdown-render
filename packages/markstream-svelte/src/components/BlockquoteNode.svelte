<script lang="ts">
  import type { SvelteRenderableNode, SvelteRenderContext } from './shared/node-helpers'
  import RenderChildren from './RenderChildren.svelte'
  import { getNodeList, getString } from './shared/node-helpers'
  export let node: SvelteRenderableNode
  export let context: SvelteRenderContext | undefined = undefined
  export let indexKey: string | number | undefined = undefined
  $: cite = getString((node as any)?.cite)
</script>
<blockquote class="blockquote blockquote-node" dir="auto" cite={cite || undefined}><RenderChildren nodes={getNodeList((node as any)?.children)} context={context} prefix={String(indexKey ?? 'blockquote') + '-blockquote'} /></blockquote>
