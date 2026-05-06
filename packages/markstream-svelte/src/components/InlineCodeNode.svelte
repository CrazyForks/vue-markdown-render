<script lang="ts">
  import type { SvelteRenderableNode } from './shared/node-helpers'
  import { getString } from './shared/node-helpers'
  
  interface Props {
    node: SvelteRenderableNode;
  }
  
  let { node }: Props = $props();
  
  let code = $derived(getString((node as any)?.code ?? (node as any)?.content ?? (node as any)?.raw));
</script>
<code class="inline-code-node">{code}</code>
