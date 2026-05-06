<script lang="ts">
  import type { SvelteRenderableNode, SvelteRenderContext } from './shared/node-helpers'
  import RenderChildren from './RenderChildren.svelte'
  import { getNodeList, getString } from './shared/node-helpers'

  export let node: SvelteRenderableNode
  export let context: SvelteRenderContext | undefined = undefined
  export let indexKey: string | number | undefined = undefined

  $: id = getString((node as any)?.id)
  $: children = getNodeList((node as any)?.children)
  $: prefix = `footnote-${indexKey ?? (id || 'node')}`
</script>

<div id={id ? `fnref--${id}` : undefined} class="footnote-node">
  <div class="footnote-node__content">
    <RenderChildren nodes={children} context={context} {prefix} />
  </div>
</div>
