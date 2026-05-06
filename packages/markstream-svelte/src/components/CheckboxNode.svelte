<script lang="ts">
  import type { SvelteRenderableNode } from './shared/node-helpers'
  
  let { node }: { node: SvelteRenderableNode } = $props()
</script>
<input class="checkbox-node" type="checkbox" disabled checked={Boolean((node as any)?.checked)} />
