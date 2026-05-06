<script lang="ts">
  import type { SvelteRenderableNode } from './shared/node-helpers'
  export let node: SvelteRenderableNode
</script>
<input class="checkbox-node" type="checkbox" disabled checked={Boolean((node as any)?.checked)} />
