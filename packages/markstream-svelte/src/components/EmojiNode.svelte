<script lang="ts">
  import type { SvelteRenderableNode } from './shared/node-helpers'
  import { getString } from './shared/node-helpers'
  export let node: SvelteRenderableNode
  $: value = getString((node as any)?.raw || (node as any)?.markup || (node as any)?.content || (node as any)?.name)
</script>
<span class="emoji-node">{value}</span>
