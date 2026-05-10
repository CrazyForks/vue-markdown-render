<script lang="ts">
  import type {
    NodeRendererEvents,
    NodeRendererProps,
    SvelteRenderableNode,
    SvelteRenderContext,
  } from './shared/node-helpers'
  import { onDestroy, onMount, tick } from 'svelte'
  import { getCustomNodeComponents, subscribeCustomComponents } from '../customComponents'
  import { disposeRenderedHtmlEnhancements, enhanceRenderedHtml } from '../enhanceRenderedHtml'
  import NodeOutlet from './NodeOutlet.svelte'
  import { buildRenderContext, resolveParsedNodes } from './shared/node-helpers'
  import { useSmoothMarkdownStream } from '../composables/useSmoothMarkdownStream.svelte'

  type NodeRendererComponentProps = NodeRendererProps & NodeRendererEvents & {
    className?: string
    onClick?: (event: MouseEvent) => void
    onMouseover?: (event: MouseEvent) => void
    onMouseout?: (event: MouseEvent) => void
  }

  let {
    content = '',
    nodes = null,
    final = undefined,
    parseOptions = undefined,
    customMarkdownIt = undefined,
    debugPerformance = false,
    customHtmlTags = undefined,
    htmlPolicy = 'safe',
    viewportPriority = true,
    codeBlockStream = true,
    codeBlockDarkTheme = undefined,
    codeBlockLightTheme = undefined,
    codeBlockMonacoOptions = undefined,
    renderCodeBlocksAsPre = false,
    codeBlockMinWidth = undefined,
    codeBlockMaxWidth = undefined,
    codeBlockProps = undefined,
    mermaidProps = undefined,
    d2Props = undefined,
    infographicProps = undefined,
    customComponents = undefined,
    showTooltips = true,
    themes = undefined,
    isDark = false,
    customId = undefined,
    indexKey = undefined,
    typewriter = true,
    batchRendering = true,
    initialRenderBatchSize = 40,
    renderBatchSize = 80,
    renderBatchDelay = 16,
    renderBatchBudgetMs = 6,
    renderBatchIdleTimeoutMs = 120,
    deferNodesUntilVisible = true,
    maxLiveNodes = 320,
    liveNodeBuffer = 60,
    allowHtml = true,
    smoothStreaming = 'auto' as boolean | 'auto',
    smoothStreamingOptions = undefined,
    className = '',
    onCopy = undefined,
    onHandleArtifactClick = undefined,
    onClick = undefined,
    onMouseover = undefined,
    onMouseout = undefined,
  }: NodeRendererComponentProps = $props()

  let rootEl: HTMLDivElement | null = $state(null)
  let customComponentsRevision = $state(0)
  let streamRenderVersion = $state(0)
  let previousContent = $state<NodeRendererProps['content']>()
  let previousNodes = $state<NodeRendererProps['nodes']>()
  let enhancementToken = 0
  let enhancementHandle: { dispose: () => void } | null = null
  let renderedNodeCount = $state(0)
  let renderBatchTimer: ReturnType<typeof setTimeout> | null = null
  let renderBatchFrame: number | null = null
  let renderBatchIdle: number | null = null
  let renderBatchToken = 0
  const textStreamState = new Map<string, string>()

  const smoothStream = useSmoothMarkdownStream(smoothStreamingOptions)
  let hasMountedForSmoothStreaming = $state(typeof window === 'undefined' || smoothStreaming === true)
  const hasNodes = $derived(Array.isArray(nodes) && nodes.length > 0)
  const smoothStreamingEligible = $derived.by(() => {
    if (smoothStreaming === false)
      return false
    if (hasNodes)
      return false
    if (smoothStreaming === true)
      return true
    return typewriter === true || (maxLiveNodes ?? 0) <= 0
  })
  const smoothStreamingEnabled = $derived(hasMountedForSmoothStreaming && smoothStreamingEligible)
  const renderContent = $derived(smoothStreamingEnabled ? smoothStream.visible : (content ?? ''))
  const rawContent = $derived(content ?? '')
  const smoothSourceSynced = $derived(hasNodes || smoothStream.source === rawContent)
  const requestedFinal = $derived.by(() => {
    const base = parseOptions ?? {}
    return final ?? (base as any).final
  })
  const effectiveFinal = $derived.by(() => {
    if (smoothStreamingEnabled && requestedFinal != null)
      return Boolean(requestedFinal && smoothSourceSynced && smoothStream.caughtUp)
    return requestedFinal
  })

  onMount(() => {
    hasMountedForSmoothStreaming = true
  })

  $effect(() => {
    const nextContent = content ?? ''
    if (hasNodes) {
      smoothStream.reset('')
      return
    }
    if (!smoothStreamingEnabled) {
      smoothStream.reset(nextContent)
      if (requestedFinal)
        smoothStream.finish({ flush: true })
      return
    }
    const source = smoothStream.source
    if (!nextContent) {
      smoothStream.reset('')
    }
    else if (nextContent === source) {
      // no-op
    }
    else if (nextContent.startsWith(source)) {
      smoothStream.enqueue(nextContent.slice(source.length))
    }
    else {
      smoothStream.reset(nextContent)
    }
    if (requestedFinal)
      smoothStream.finish()
  })

  let rendererProps = $derived({
    content: renderContent,
    nodes,
    final: effectiveFinal,
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
    smoothStreaming,
    smoothStreamingOptions,
  } satisfies NodeRendererProps)

  $effect.pre(() => {
    if (previousContent !== renderContent || previousNodes !== nodes) {
      streamRenderVersion += 1
      previousContent = renderContent
      previousNodes = nodes
    }
  })

  let parsedNodes = $derived.by<SvelteRenderableNode[]>(() => {
    const start = debugPerformance && typeof performance !== 'undefined' ? performance.now() : 0
    const nextParsedNodes = resolveParsedNodes(rendererProps)
    if (debugPerformance && typeof console !== 'undefined' && typeof performance !== 'undefined') {
      console.info('[markstream-svelte][perf] parse(sync)', {
        ms: Math.round(performance.now() - start),
        nodes: nextParsedNodes.length,
        contentLength: renderContent?.length ?? 0,
      })
    }
    return nextParsedNodes
  })

  let renderContext = $derived.by<SvelteRenderContext>(() => {
    void customComponentsRevision
    const scopedCustomComponents = getCustomNodeComponents(customId)
    const mergedCustomComponents = customComponents
      ? { ...scopedCustomComponents, ...customComponents }
      : scopedCustomComponents
    return buildRenderContext(
      {
        ...rendererProps,
        customComponents: mergedCustomComponents,
      },
      {
        onCopy,
        onHandleArtifactClick,
      },
      textStreamState,
      streamRenderVersion,
    )
  })

  $effect(() => {
    void parsedNodes.length
    void batchRendering
    void initialRenderBatchSize
    void renderBatchSize
    void renderBatchDelay
    void renderBatchBudgetMs
    void renderBatchIdleTimeoutMs
    void effectiveFinal
    void renderedNodeCount
    syncRenderedNodeWindow()
  })
  let renderedNodes = $derived(parsedNodes.slice(0, Math.min(renderedNodeCount, parsedNodes.length)))

  $effect(() => {
    void rootEl
    void effectiveFinal
    void parsedNodes
    void renderedNodes
    void isDark
    void renderCodeBlocksAsPre
    void codeBlockMonacoOptions
    void codeBlockProps
    void mermaidProps
    void d2Props
    void infographicProps
    void showTooltips
    void onCopy
    scheduleEnhancement()
  })

  onMount(() => {
    const unsubscribe = subscribeCustomComponents(() => {
      customComponentsRevision += 1
    })
    return unsubscribe
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
    const shouldBatch = effectiveFinal !== false && batchRendering !== false && total > initialCount

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
    const enhancementFinal = typeof effectiveFinal === 'boolean' ? effectiveFinal : !hasLoadingNodes(parsedNodes)
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
  class="markstream-svelte markdown-renderer {className}"
  class:dark={isDark}
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
