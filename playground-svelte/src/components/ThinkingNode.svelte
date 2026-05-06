<script lang="ts">
  import MarkdownRender from 'markstream-svelte'

  export let node: any
  export let customId: string | undefined = undefined
  export let isDark = false
  export let typewriter = true
</script>

<section class="thinking-node">
  <header class="thinking-node__header">Thinking</header>
  <div class="thinking-node__body">
    <MarkdownRender
      content={String(node?.content ?? '')}
      {customId}
      {isDark}
      {typewriter}
      customHtmlTags={['thinking']}
      viewportPriority={false}
      deferNodesUntilVisible={false}
      batchRendering={false}
      maxLiveNodes={0}
    />
  </div>
</section>
