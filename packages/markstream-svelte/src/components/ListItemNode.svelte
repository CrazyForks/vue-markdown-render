<script lang="ts">
  import type { SvelteRenderableNode, SvelteRenderContext } from './shared/node-helpers'
  import RenderChildren from './RenderChildren.svelte'
  import { getNodeList } from './shared/node-helpers'
  export let node: SvelteRenderableNode
  export let context: SvelteRenderContext | undefined = undefined
  export let indexKey: string | number | undefined = undefined
</script>
<li><RenderChildren nodes={getNodeList((node as any)?.children)} context={context} prefix={String(indexKey ?? 'li') + '-li'} /></li>
