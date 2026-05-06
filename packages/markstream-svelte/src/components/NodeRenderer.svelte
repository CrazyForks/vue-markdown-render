<script lang="ts">
  import type {
    NodeRendererEvents,
    NodeRendererProps,
    SvelteRenderableNode,
    SvelteRenderContext,
  } from './shared/node-helpers'
  import { afterUpdate, onDestroy, onMount, tick } from 'svelte'
  import { getCustomNodeComponents, subscribeCustomComponents } from '../customComponents'
  import { disposeRenderedHtmlEnhancements, enhanceRenderedHtml } from '../enhanceRenderedHtml'
  import NodeOutlet from './NodeOutlet.svelte'
  import { buildRenderContext, resolveParsedNodes } from './shared/node-helpers'

  export let content: NodeRendererProps['content'] = ''
  export let nodes: NodeRendererProps['nodes'] = null
  export let final: NodeRendererProps['final'] = undefined
  export let parseOptions: NodeRendererProps['parseOptions'] = undefined
  export let customMarkdownIt: NodeRendererProps['customMarkdownIt'] = undefined
  export let debugPerformance = false
  export let customHtmlTags: NodeRendererProps['customHtmlTags'] = undefined
  export let htmlPolicy: NodeRendererProps['htmlPolicy'] = 'safe'
  export let viewportPriority: NodeRendererProps['viewportPriority'] = true
  export let codeBlockStream = true
  export let codeBlockDarkTheme: NodeRendererProps['codeBlockDarkTheme'] = undefined
  export let codeBlockLightTheme: NodeRendererProps['codeBlockLightTheme'] = undefined
  export let codeBlockMonacoOptions: NodeRendererProps['codeBlockMonacoOptions'] = undefined
  export let renderCodeBlocksAsPre = false
  export let codeBlockMinWidth: NodeRendererProps['codeBlockMinWidth'] = undefined
  export let codeBlockMaxWidth: NodeRendererProps['codeBlockMaxWidth'] = undefined
  export let codeBlockProps: NodeRendererProps['codeBlockProps'] = undefined
  export let mermaidProps: NodeRendererProps['mermaidProps'] = undefined
  export let d2Props: NodeRendererProps['d2Props'] = undefined
  export let infographicProps: NodeRendererProps['infographicProps'] = undefined
  export let customComponents: NodeRendererProps['customComponents'] = undefined
  export let showTooltips = true
  export let themes: NodeRendererProps['themes'] = undefined
  export let isDark = false
  export let customId: NodeRendererProps['customId'] = undefined
  export let indexKey: NodeRendererProps['indexKey'] = undefined
  export let typewriter = true
  export let batchRendering = true
  export let initialRenderBatchSize = 40
  export let renderBatchSize = 80
  export let renderBatchDelay = 16
  export let renderBatchBudgetMs = 6
  export let renderBatchIdleTimeoutMs = 120
  export let deferNodesUntilVisible = true
  export let maxLiveNodes = 320
  export let liveNodeBuffer = 60
  export let allowHtml = true
  export let className = ''
  export let onCopy: NodeRendererEvents['onCopy'] = undefined
  export let onHandleArtifactClick: NodeRendererEvents['onHandleArtifactClick'] = undefined
  export let onClick: ((event: MouseEvent) => void) | undefined = undefined
  export let onMouseover: ((event: MouseEvent) => void) | undefined = undefined
  export let onMouseout: ((event: MouseEvent) => void) | undefined = undefined

  let rootEl: HTMLDivElement | null = null
  let parsedNodes: SvelteRenderableNode[] = []
  let renderContext: SvelteRenderContext = { events: {} }
  let customComponentsRevision = 0
  let streamRenderVersion = 0
  let previousContent: typeof content = undefined
  let previousNodes: typeof nodes = undefined
  let enhancementToken = 0
  let enhancementHandle: { dispose: () => void } | null = null
  let renderedNodeCount = 0
  let renderBatchTimer: ReturnType<typeof setTimeout> | null = null
  let renderBatchFrame: number | null = null
  let renderBatchIdle: number | null = null
  let renderBatchToken = 0
  const textStreamState = new Map<string, string>()

  $: props = {
    content,
    nodes,
    final,
    parseOptions,
    customMarkdownIt,
    debugPerformance,
    customHtmlTags,
    htmlPolicy,
    viewportPriority,
    codeBlockStream,
    codeBlockDarkTheme,
    codeBlockLightTheme,
    codeBlockMonacoOptions,
    renderCodeBlocksAsPre,
    codeBlockMinWidth,
    codeBlockMaxWidth,
    codeBlockProps,
    mermaidProps,
    d2Props,
    infographicProps,
    customComponents,
    showTooltips,
    themes,
    isDark,
    customId,
    indexKey,
    typewriter,
    batchRendering,
    initialRenderBatchSize,
    renderBatchSize,
    renderBatchDelay,
    renderBatchBudgetMs,
    renderBatchIdleTimeoutMs,
    deferNodesUntilVisible,
    maxLiveNodes,
    liveNodeBuffer,
    allowHtml,
  } satisfies NodeRendererProps

  $: {
    if (previousContent !== content || previousNodes !== nodes) {
      streamRenderVersion += 1
      previousContent = content
      previousNodes = nodes
    }
  }

  $: {
    const start = debugPerformance && typeof performance !== 'undefined' ? performance.now() : 0
    parsedNodes = resolveParsedNodes(props)
    if (debugPerformance && typeof console !== 'undefined' && typeof performance !== 'undefined') {
      console.info('[markstream-svelte][perf] parse(sync)', {
        ms: Math.round(performance.now() - start),
        nodes: parsedNodes.length,
        contentLength: content?.length ?? 0,
      })
    }
  }

  $: {
    void customComponentsRevision
    const scopedCustomComponents = getCustomNodeComponents(customId)
    const mergedCustomComponents = customComponents
      ? { ...scopedCustomComponents, ...customComponents }
      : scopedCustomComponents
    renderContext = buildRenderContext(
      {
        ...props,
        customComponents: mergedCustomComponents,
      },
      {
        onCopy,
        onHandleArtifactClick,
      },
      textStreamState,
      streamRenderVersion,
    )
  }

  $: {
    void parsedNodes.length
    void batchRendering
    void initialRenderBatchSize
    void renderBatchSize
    void renderBatchDelay
    void renderBatchBudgetMs
    void renderBatchIdleTimeoutMs
    void final
    void renderedNodeCount
    syncRenderedNodeWindow()
  }
  $: renderedNodes = parsedNodes.slice(0, Math.min(renderedNodeCount, parsedNodes.length))

  onMount(() => {
    const unsubscribe = subscribeCustomComponents(() => {
      customComponentsRevision += 1
    })
    scheduleEnhancement()
    return unsubscribe
  })

  afterUpdate(() => {
    scheduleEnhancement()
  })

  onDestroy(() => {
    enhancementToken += 1
    cancelRenderBatch()
    enhancementHandle?.dispose()
    enhancementHandle = null
    disposeRenderedHtmlEnhancements(rootEl)
  })

  function toPositiveInteger(value: unknown, fallback: number) {
    const numeric = Number(value)
    return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback
  }

  function syncRenderedNodeWindow() {
    const total = parsedNodes.length
    const initialCount = Math.min(total, toPositiveInteger(initialRenderBatchSize, 40))
    const shouldBatch = final !== false && batchRendering !== false && total > initialCount

    if (!shouldBatch) {
      cancelRenderBatch()
      if (renderedNodeCount !== total)
        renderedNodeCount = total
      return
    }

    if (renderedNodeCount <= 0 || renderedNodeCount > total)
      renderedNodeCount = initialCount
    else if (renderedNodeCount < initialCount)
      renderedNodeCount = initialCount

    scheduleRenderBatch()
  }

  function scheduleRenderBatch() {
    if (renderedNodeCount >= parsedNodes.length || renderBatchTimer || renderBatchFrame != null || renderBatchIdle != null)
      return
    const token = ++renderBatchToken
    const delay = Math.max(0, Number(renderBatchDelay) || 0)
    const run = (deadline?: { timeRemaining?: () => number }) => {
      renderBatchTimer = null
      renderBatchFrame = null
      renderBatchIdle = null
      if (token !== renderBatchToken)
        return
      const batchSize = toPositiveInteger(renderBatchSize, 80)
      const budget = Math.max(2, toPositiveInteger(renderBatchBudgetMs, 6))
      let nextCount = renderedNodeCount
      do {
        nextCount = Math.min(parsedNodes.length, nextCount + batchSize)
        if (!deadline)
          break
        const remaining = typeof deadline.timeRemaining === 'function' ? deadline.timeRemaining() : 0
        if (remaining <= budget * 0.5)
          break
      } while (nextCount < parsedNodes.length)
      if (nextCount !== renderedNodeCount)
        renderedNodeCount = nextCount
    }

    const requestIdle = typeof window !== 'undefined' ? (window as any).requestIdleCallback as ((callback: (deadline: { timeRemaining?: () => number }) => void, options?: { timeout?: number }) => number) | undefined : undefined
    if (requestIdle) {
      renderBatchIdle = requestIdle(run, { timeout: Math.max(0, Number(renderBatchIdleTimeoutMs) || 120) })
      return
    }

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      renderBatchFrame = window.requestAnimationFrame(() => {
        renderBatchFrame = null
        if (delay > 0)
          renderBatchTimer = setTimeout(run, delay)
        else
          run()
      })
      return
    }

    renderBatchTimer = setTimeout(run, delay)
  }

  function cancelRenderBatch() {
    renderBatchToken += 1
    if (renderBatchTimer) {
      clearTimeout(renderBatchTimer)
      renderBatchTimer = null
    }
    if (renderBatchFrame != null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(renderBatchFrame)
      renderBatchFrame = null
    }
    const cancelIdle = typeof window !== 'undefined' ? (window as any).cancelIdleCallback as ((id: number) => void) | undefined : undefined
    if (renderBatchIdle != null) {
      cancelIdle?.(renderBatchIdle)
      renderBatchIdle = null
    }
  }

  async function scheduleEnhancement() {
    if (!rootEl || typeof window === 'undefined')
      return
    const enhancementFinal = typeof final === 'boolean' ? final : !hasLoadingNodes(parsedNodes)
    if (!enhancementFinal) {
      enhancementToken += 1
      enhancementHandle?.dispose()
      enhancementHandle = null
      return
    }
    const token = ++enhancementToken
    await tick()
    if (token !== enhancementToken || !rootEl)
      return
    enhancementHandle?.dispose()
    enhancementHandle = await enhanceRenderedHtml(rootEl, {
      final: enhancementFinal,
      isDark,
      renderCodeBlocksAsPre,
      monacoOptions: codeBlockMonacoOptions,
      codeBlockProps,
      mermaidProps,
      d2Props,
      infographicProps,
      showTooltips,
      onCopy,
      isCancelled: () => token !== enhancementToken,
    })
  }

  function hasLoadingNodes(nodes: SvelteRenderableNode[]): boolean {
    for (const node of nodes) {
      if ((node as any)?.loading === true)
        return true
      if (hasLoadingNodes(((node as any)?.children || []) as SvelteRenderableNode[]))
        return true
      if (hasLoadingNodes(((node as any)?.items || []) as SvelteRenderableNode[]))
        return true
    }
    return false
  }

  function handleMouseover(event: MouseEvent) {
    const target = event.target as HTMLElement | null
    if (target?.closest('[data-node-index]'))
      onMouseover?.(event)
  }

  function handleMouseout(event: MouseEvent) {
    const target = event.target as HTMLElement | null
    if (target?.closest('[data-node-index]'))
      onMouseout?.(event)
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_mouse_events_have_key_events -->
<div
  bind:this={rootEl}
  class={'markstream-svelte markdown-renderer' + (isDark ? ' dark' : '') + (className ? ' ' + className : '')}
  data-custom-id={customId}
  onclick={onClick}
  onmouseover={handleMouseover}
  onmouseout={handleMouseout}
>
  {#each renderedNodes as node, index ((indexKey != null ? String(indexKey) : 'markdown-renderer') + '-' + index)}
    <div class="node-slot" data-node-index={index} data-node-type={(node as any)?.type}>
      <div class:typewriter-node={typewriter !== false && String((node as any)?.type || '') !== 'code_block'} class="node-content" data-node-index={index}>
        <NodeOutlet node={node} context={renderContext} indexKey={(indexKey != null ? String(indexKey) : 'markdown-renderer') + '-' + index} />
      </div>
    </div>
  {/each}
</div>
