<script lang="ts">
  import type { SvelteRenderableNode } from './shared/node-helpers'
  import { getString } from './shared/node-helpers'

  export let node: SvelteRenderableNode

  $: id = getString((node as any)?.id)
  $: href = id ? `#fnref--${id}` : undefined
  $: linkAttrs = href ? { href } : {}

  function scrollToFootnote(event: MouseEvent) {
    event.preventDefault()
    if (typeof document === 'undefined' || !id)
      return
    const target = document.querySelector(href || '')
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<sup id={id ? `fnref-${id}` : undefined} class="footnote-reference" onclick={scrollToFootnote}>
  <span {...linkAttrs} title={id ? `查看脚注 ${id}` : undefined} class="footnote-link cursor-pointer">
    [{id}]
  </span>
</sup>
