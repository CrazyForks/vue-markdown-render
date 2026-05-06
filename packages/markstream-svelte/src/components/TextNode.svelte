<script lang="ts">
  import type { SvelteRenderableNode, SvelteRenderContext } from './shared/node-helpers'
  import { getString } from './shared/node-helpers'

  export let node: SvelteRenderableNode
  export let context: SvelteRenderContext | undefined = undefined
  export let indexKey: string | number | undefined = undefined
  export let typewriter: boolean | undefined = undefined

  let previousKey = ''
  let previousContent = ''
  let stableContent = ''
  let deltaContent = ''
  let deltaClass = 'markstream-svelte-text__stream-delta--a'

  $: content = getString((node as any)?.content ?? (node as any)?.raw)
  $: centered = Boolean((node as any)?.center)
  $: streamKey = String(context?.customId ?? 'global') + ':' + String(context?.streamRenderVersion ?? 0) + ':' + String(indexKey ?? 'node')
  $: {
    const state = context?.textStreamState
    const previous = streamKey === previousKey ? previousContent : (state?.get(streamKey) ?? '')
    if (previous && content.startsWith(previous) && content.length > previous.length) {
      stableContent = previous
      deltaContent = content.slice(previous.length)
      deltaClass = deltaClass.endsWith('--a') ? 'markstream-svelte-text__stream-delta--b' : 'markstream-svelte-text__stream-delta--a'
    }
    else {
      stableContent = content
      deltaContent = ''
    }
    previousKey = streamKey
    previousContent = content
    state?.set(streamKey, content)
  }
</script>

<span data-typewriter={typewriter !== false ? '1' : undefined} class:markstream-svelte-text--centered={centered} class="markstream-svelte-text-node text-node">{stableContent}{#if deltaContent}<span class={'markstream-svelte-text__stream-delta text-node-stream-delta ' + deltaClass}>{deltaContent}</span>{/if}</span>
