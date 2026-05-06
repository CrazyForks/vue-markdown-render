<script lang="ts">
  import type { SvelteRenderableNode } from './shared/node-helpers'
  import { getString } from './shared/node-helpers'

  export let node: SvelteRenderableNode

  $: id = getString((node as any)?.id)
  $: href = id ? `#fnref-${id}` : undefined

  function scrollToReference(event: MouseEvent) {
    event.preventDefault()
    if (typeof document === 'undefined' || !id)
      return
    const target = document.getElementById(`fnref-${id}`)
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
</script>

<a class="footnote-anchor" href={href} title={id ? `返回引用 ${id}` : undefined} onclick={scrollToReference}>
  ↩︎
</a>
