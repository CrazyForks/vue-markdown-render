<script lang="ts">
  import type { SvelteRenderableNode, SvelteRenderContext } from './shared/node-helpers'
  import { afterUpdate, onDestroy, onMount } from 'svelte'
  import { useSafeI18n } from '../i18n/useSafeI18n'
  import { getMermaid } from '../optional/mermaid'
  import { toSafeSvgMarkup } from '../sanitizeSvg'
  import { hideTooltip, showTooltipForAnchor, type TooltipPlacement } from '../tooltip/singletonTooltip'
  import { getLanguageIcon } from '../utils/languageIcon'
  import { canParseOffthread, findPrefixOffthread } from '../workers/mermaidWorkerClient'
  import { clampPreviewHeight, estimateMermaidPreviewHeight, getMermaidDiagramKind, parsePositiveNumber } from './shared/diagram-height'
  import { copyTextToClipboard, downloadSvgMarkup } from './shared/rich-block-helpers'
  import { getString } from './shared/node-helpers'

  type MermaidTheme = 'light' | 'dark'

  export let node: SvelteRenderableNode
  export let context: SvelteRenderContext | undefined = undefined
  export let maxHeight: string | null | undefined = '500px'
  export let estimatedPreviewHeightPx: number | undefined = undefined
  export let loading: boolean | undefined = undefined
  export let isDark: boolean | undefined = undefined
  export let workerTimeoutMs = 1400
  export let parseTimeoutMs = 1800
  export let renderTimeoutMs = 2500
  export let fullRenderTimeoutMs = 4000
  export let renderDebounceMs = 300
  export let showHeader = true
  export let showModeToggle = true
  export let showCopyButton = true
  export let showExportButton = true
  export let showFullscreenButton = true
  export let showCollapseButton = true
  export let showZoomControls = true
  export let isStrict = true

  const { t } = useSafeI18n()
  const mermaidIcon = getLanguageIcon('mermaid')

  let mounted = false
  let renderToken = 0
  let lastRenderSignature = ''
  let lastProgressiveMissSignature = ''
  let lastRenderedCode = ''
  let svgMarkup = ''
  let svgCache: Partial<Record<MermaidTheme, string>> = {}
  let renderError = ''
  let rendering = false
  let hasRenderedOnce = false
  let copied = false
  let collapsed = false
  let showSource = false
  let modalOpen = false
  let zoom = 1
  let renderTimer: ReturnType<typeof setTimeout> | null = null
  let copyTimer: ReturnType<typeof setTimeout> | null = null

  $: source = normalizeMermaidSource(getString((node as any)?.code))
  $: nodeLoading = typeof (node as any)?.loading === 'boolean' ? Boolean((node as any)?.loading) : true
  $: resolvedLoading = loading ?? nodeLoading
  $: resolvedIsDark = isDark ?? context?.isDark ?? false
  $: theme = (resolvedIsDark ? 'dark' : 'light') as MermaidTheme
  $: final = context?.final ?? resolvedLoading === false
  $: progressivePreview = resolvedLoading !== false || final === false
  $: maxPreviewHeight = maxHeight === 'none' ? null : parsePositiveNumber(maxHeight)
  $: previewHeight = clampPreviewHeight(
    parsePositiveNumber(estimatedPreviewHeightPx) ?? estimateMermaidPreviewHeight(source),
    undefined,
    maxPreviewHeight ?? undefined,
  )
  $: previewStyle = [
    `min-height: ${previewHeight}px`,
    maxHeight && maxHeight !== 'none' ? `max-height: ${maxHeight}` : '',
    `transform: scale(${zoom})`,
  ].filter(Boolean).join('; ')
  $: shouldRender = !(resolvedLoading && !source.trim())
  $: canUsePreview = Boolean(svgMarkup && !showSource)

  onMount(() => {
    mounted = true
    scheduleRender(true)
  })

  afterUpdate(() => {
    if (mounted)
      scheduleRender()
  })

  onDestroy(() => {
    mounted = false
    renderToken += 1
    clearRenderTimer()
    if (copyTimer)
      clearTimeout(copyTimer)
  })

  function clearRenderTimer() {
    if (!renderTimer)
      return
    clearTimeout(renderTimer)
    renderTimer = null
  }

  function scheduleRender(force = false) {
    if (!mounted || showSource || collapsed)
      return
    const signature = getRenderSignature()
    if (signature === lastRenderSignature && rendering)
      return
    if (!force && signature === lastRenderSignature && (svgMarkup || renderError || lastProgressiveMissSignature === signature))
      return
    if (force)
      clearRenderTimer()
    if (renderTimer)
      return
    const delay = force || !progressivePreview ? 0 : Math.max(0, renderDebounceMs)
    renderTimer = setTimeout(() => {
      renderTimer = null
      void renderMermaid(force)
    }, delay)
  }

  function normalizeMermaidSource(value: string) {
    return value
      .replace(/\]::([^:])/g, ']:::$1')
      .replace(/:::subgraphNode$/gm, '::subgraphNode')
  }

  function applyMermaidThemeTo(value: string, nextTheme: MermaidTheme) {
    const trimmed = value.trimStart()
    if (trimmed.startsWith('%%{'))
      return value
    const themeValue = nextTheme === 'dark' ? 'dark' : 'default'
    return `%%{init: {"theme": "${themeValue}"}}%%\n${value}`
  }

  async function renderMermaid(force = false) {
    if (!mounted || showSource || collapsed)
      return

    if (!source.trim()) {
      svgMarkup = ''
      renderError = ''
      lastRenderedCode = ''
      lastProgressiveMissSignature = ''
      hasRenderedOnce = false
      svgCache = {}
      return
    }

    const normalized = normalizeRenderedCode(source)
    const signature = getRenderSignature()
    if (signature === lastRenderSignature && rendering)
      return
    if (!force && signature === lastRenderSignature && (svgMarkup || renderError || lastProgressiveMissSignature === signature))
      return

    const token = ++renderToken
    lastRenderSignature = signature
    rendering = true
    if (!progressivePreview)
      renderError = ''

    try {
      const mermaid = await getMermaid({
        startOnLoad: false,
        securityLevel: isStrict ? 'strict' : 'loose',
        suppressErrorRendering: true,
        ...(isStrict ? { flowchart: { htmlLabels: false } } : {}),
      })
      if (!mounted || token !== renderToken)
        return
      if (!mermaid)
        throw new Error('Mermaid is not available.')

      let renderSource = source
      let fullRender = true

      if (progressivePreview) {
        if (hasRenderedOnce && normalized === lastRenderedCode && svgMarkup) {
          renderError = ''
          return
        }
        const parsed = await canParseOrPrefix(source, theme, mermaid)
        if (!mounted || token !== renderToken)
          return
        if (parsed.fullOk) {
          renderSource = source
        }
        else if (parsed.prefixOk && parsed.prefix && !hasRenderedOnce) {
          renderSource = parsed.prefix
          fullRender = false
        }
        else {
          renderError = ''
          lastProgressiveMissSignature = signature
          const cached = svgCache[theme]
          if (cached)
            svgMarkup = cached
          return
        }
      }
      else {
        await canParseMermaid(source, theme, mermaid)
      }

      const rendered = await withTimeout(
        () => Promise.resolve(mermaid.render(`markstream-svelte-mermaid-${token}`, applyMermaidThemeTo(renderSource, theme))),
        fullRender ? fullRenderTimeoutMs : renderTimeoutMs,
      )
      if (!mounted || token !== renderToken)
        return

      const rawSvg = typeof rendered === 'string' ? rendered : rendered?.svg
      const safeSvg = isStrict ? toSafeSvgMarkup(rawSvg) : rawSvg
      if (!safeSvg)
        throw new Error('Mermaid rendered empty SVG.')
      svgMarkup = safeSvg
      renderError = ''
      lastProgressiveMissSignature = ''
      if (fullRender) {
        hasRenderedOnce = true
        lastRenderedCode = normalized
        svgCache[theme] = safeSvg
      }
      rendered?.bindFunctions?.(document.createElement('div'))
    }
    catch (error) {
      if (token === renderToken) {
        if (progressivePreview) {
          renderError = ''
          lastProgressiveMissSignature = signature
        }
        else {
          svgMarkup = ''
          renderError = error instanceof Error ? error.message : String(error)
        }
      }
    }
    finally {
      if (token === renderToken)
        rendering = false
    }
  }

  async function canParseMermaid(value: string, nextTheme: MermaidTheme, mermaid: any) {
    try {
      if (await canParseOffthread(value, nextTheme, workerTimeoutMs))
        return true
    }
    catch {}

    const themedSource = applyMermaidThemeTo(value, nextTheme)
    if (typeof mermaid?.parse === 'function') {
      await withTimeout(() => Promise.resolve(mermaid.parse(themedSource)), parseTimeoutMs)
      return true
    }
    await withTimeout(() => Promise.resolve(mermaid.render(`markstream-svelte-mermaid-parse-${renderToken}`, themedSource)), parseTimeoutMs)
    return true
  }

  async function canParseOrPrefix(value: string, nextTheme: MermaidTheme, mermaid: any) {
    if (getMermaidDiagramKind(value) === 'gantt') {
      const prefix = getSafeMermaidPrefixCandidate(value)
      if (!prefix.trim())
        return { fullOk: false, prefixOk: false }
      try {
        await canParseMermaid(prefix, nextTheme, mermaid)
        return prefix === value
          ? { fullOk: true, prefixOk: false }
          : { fullOk: false, prefixOk: true, prefix }
      }
      catch {
        return { fullOk: false, prefixOk: false }
      }
    }

    try {
      await canParseMermaid(value, nextTheme, mermaid)
      return { fullOk: true, prefixOk: false }
    }
    catch {
      // Try a renderable prefix below.
    }

    let prefix = getSafeMermaidPrefixCandidate(value)
    if (!prefix.trim() || prefix === value)
      return { fullOk: false, prefixOk: false }

    try {
      const workerPrefix = await findPrefixOffthread(value, nextTheme, workerTimeoutMs)
      if (workerPrefix?.trim())
        prefix = workerPrefix
    }
    catch {
      // Keep the local prefix.
    }

    try {
      await canParseMermaid(prefix, nextTheme, mermaid)
      return { fullOk: false, prefixOk: true, prefix }
    }
    catch {
      return { fullOk: false, prefixOk: false }
    }
  }

  function isGanttTaskLine(rawLine: string) {
    const line = rawLine.trim()
    if (!line || line.startsWith('%%'))
      return false
    if (/^(?:gantt|title|dateformat|axisformat|tickinterval|excludes|section|todaymarker|topaxis|weekday|weekend|acctitle|accdescr|accdescrmultiline)\b/i.test(line))
      return false
    return line.includes(':')
  }

  function getSafeGanttPreviewCandidate(value: string) {
    const lines = value.split(/\r?\n/)
    if (!/\r?\n$/.test(value) && lines.length > 0)
      lines.pop()
    while (lines.length > 0) {
      const last = lines[lines.length - 1]?.trim()
      if (!last || last.startsWith('%%')) {
        lines.pop()
        continue
      }
      if (isGanttTaskLine(last))
        break
      lines.pop()
    }
    return lines.some(isGanttTaskLine) ? lines.join('\n') : ''
  }

  function getSafeMermaidPrefixCandidate(value: string) {
    if (getMermaidDiagramKind(value) === 'gantt')
      return getSafeGanttPreviewCandidate(value)
    const lines = value.split('\n')
    while (lines.length > 0) {
      const last = (lines[lines.length - 1] || '').trimEnd()
      if (!last) {
        lines.pop()
        continue
      }
      const dangling = /^[-=~>|<\s]+$/.test(last.trim())
        || /(?:--|==|~~|->|<-|-\||-\)|-x|o-|\|-|\.-)\s*$/.test(last)
        || /[-|><]$/.test(last)
        || /(?:graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt)\s*$/i.test(last)
      if (!dangling)
        break
      lines.pop()
    }
    return lines.join('\n').trim() || ''
  }

  function normalizeRenderedCode(value: string) {
    return value.replace(/\s+/g, '')
  }

  function getRenderSignature() {
    return `${source}\n${theme}\n${isStrict}\n${final}\n${progressivePreview}`
  }

  function withTimeout<T>(run: () => Promise<T>, timeoutMs: number) {
    if (!timeoutMs || timeoutMs <= 0)
      return run()
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Operation timed out')), timeoutMs)
      run().then((value) => {
        clearTimeout(timer)
        resolve(value)
      }).catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
    })
  }

  async function copy() {
    await copyTextToClipboard(source)
    context?.events?.onCopy?.(source)
    copied = true
    if (copyTimer)
      clearTimeout(copyTimer)
    copyTimer = setTimeout(() => {
      copied = false
    }, 1000)
  }

  function exportSvg() {
    if (svgMarkup)
      downloadSvgMarkup(svgMarkup, `mermaid-diagram-${Date.now()}.svg`)
  }

  function switchMode(mode: 'preview' | 'source') {
    showSource = mode === 'source'
    if (!showSource)
      void renderMermaid()
  }

  function zoomIn() {
    zoom = Math.min(3, Math.round((zoom + 0.1) * 10) / 10)
  }

  function zoomOut() {
    zoom = Math.max(0.5, Math.round((zoom - 0.1) * 10) / 10)
  }

  function showButtonTooltip(event: MouseEvent | FocusEvent, text: string, placement: TooltipPlacement = 'top') {
    const target = event.currentTarget as HTMLElement | null
    if (!target || (target instanceof HTMLButtonElement && target.disabled))
      return
    showTooltipForAnchor(target, text, placement, false, undefined, resolvedIsDark)
  }

  function showCopyTooltip(event: MouseEvent | FocusEvent) {
    showButtonTooltip(event, copied ? (t('common.copied') || 'Copied') : (t('common.copy') || 'Copy'))
  }

  function portal(node: HTMLElement) {
    document.body.appendChild(node)
    return {
      destroy() {
        node.remove()
      },
    }
  }

  function closeModal() {
    modalOpen = false
  }

  function onModalOverlayClick(event: MouseEvent) {
    if (event.target === event.currentTarget)
      closeModal()
  }

  function onModalKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape')
      closeModal()
  }
</script>

{#if shouldRender}
  <div
    class:dark={resolvedIsDark}
    class:is-rendering={resolvedLoading || rendering}
    class="mermaid-block"
    data-markstream-mermaid="1"
    data-markstream-mode={showSource ? 'source' : canUsePreview ? 'preview' : 'fallback'}
  >
    {#if showHeader}
      <div class="mermaid-header">
        <div class="mermaid-header__title">
          <span class="icon-slot action-icon" aria-hidden="true">{@html mermaidIcon}</span>
          <span class="mermaid-title__text">Mermaid</span>
        </div>
        {#if showModeToggle}
          <div class="mermaid-toggle">
            <button type="button" class:mermaid-toggle-btn--active={!showSource} class="mermaid-toggle-btn" onblur={() => hideTooltip()} onclick={() => switchMode('preview')} onfocus={(event) => showButtonTooltip(event, t('common.preview') || 'Preview')} onmouseleave={() => hideTooltip()} onmouseenter={(event) => showButtonTooltip(event, t('common.preview') || 'Preview')}>
              <span class="mermaid-action-content">
                <svg aria-hidden="true" role="img" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M2.062 12.348a1 1 0 0 1 0-.696a10.75 10.75 0 0 1 19.876 0a1 1 0 0 1 0 .696a10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></g></svg>
                <span>{t('common.preview')}</span>
              </span>
            </button>
            <button type="button" class:mermaid-toggle-btn--active={showSource} class="mermaid-toggle-btn" onblur={() => hideTooltip()} onclick={() => switchMode('source')} onfocus={(event) => showButtonTooltip(event, t('common.source') || 'Source')} onmouseleave={() => hideTooltip()} onmouseenter={(event) => showButtonTooltip(event, t('common.source') || 'Source')}>
              <span class="mermaid-action-content">
                <svg aria-hidden="true" role="img" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m16 18l6-6l-6-6M8 6l-6 6l6 6"/></svg>
                <span>{t('common.source')}</span>
              </span>
            </button>
          </div>
        {/if}
        <div class="mermaid-actions">
          {#if showCollapseButton}
            <button type="button" class="mermaid-btn mermaid-action-btn mermaid-btn--icon" aria-pressed={collapsed} aria-label={collapsed ? t('common.expand') : t('common.collapse')} onblur={() => hideTooltip()} onclick={() => (collapsed = !collapsed)} onfocus={(event) => showButtonTooltip(event, collapsed ? (t('common.expand') || 'Expand') : (t('common.collapse') || 'Collapse'))} onmouseleave={() => hideTooltip()} onmouseenter={(event) => showButtonTooltip(event, collapsed ? (t('common.expand') || 'Expand') : (t('common.collapse') || 'Collapse'))}>
              <svg style:rotate={collapsed ? '0deg' : '90deg'} viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 18l6-6l-6-6" /></svg>
            </button>
          {/if}
          {#if showCopyButton}
            <button type="button" class="mermaid-btn mermaid-action-btn mermaid-btn--icon" aria-label={copied ? t('common.copied') : t('common.copy')} onblur={() => hideTooltip()} onclick={copy} onfocus={showCopyTooltip} onmouseleave={() => hideTooltip()} onmouseenter={showCopyTooltip}>
              {#if copied}
                <svg aria-hidden="true" role="img" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 6L9 17l-5-5"/></svg>
              {:else}
                <svg aria-hidden="true" role="img" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></g></svg>
              {/if}
            </button>
          {/if}
          {#if showExportButton}
            <button type="button" class="mermaid-btn mermaid-action-btn mermaid-btn--icon" aria-label={t('common.export')} disabled={!svgMarkup || showSource || collapsed} onblur={() => hideTooltip()} onclick={exportSvg} onfocus={(event) => showButtonTooltip(event, t('common.export') || 'Export')} onmouseleave={() => hideTooltip()} onmouseenter={(event) => showButtonTooltip(event, t('common.export') || 'Export')}>
              <svg aria-hidden="true" role="img" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M12 15V3m9 12v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10l5 5l5-5"/></g></svg>
            </button>
          {/if}
          {#if showFullscreenButton}
            <button type="button" class="mermaid-btn mermaid-action-btn mermaid-btn--icon" aria-label={t('common.open')} disabled={!svgMarkup || showSource || collapsed} onblur={() => hideTooltip()} onclick={() => (modalOpen = true)} onfocus={(event) => showButtonTooltip(event, t('common.open') || 'Open')} onmouseleave={() => hideTooltip()} onmouseenter={(event) => showButtonTooltip(event, t('common.open') || 'Open')}>
              <svg aria-hidden="true" role="img" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 3h6v6m0-6l-7 7M3 21l7-7m-1 7H3v-6"/></svg>
            </button>
          {/if}
        </div>
      </div>
    {/if}

    {#if !collapsed}
      <div class="mermaid-body">
        {#if showSource}
          <pre class="mermaid-source"><code>{source}</code></pre>
        {:else}
          {#if showZoomControls}
            <div class="markstream-svelte-zoom-controls">
              <button type="button" class="mermaid-btn mermaid-action-btn mermaid-btn--icon" aria-label={t('common.zoomIn')} onblur={() => hideTooltip()} onclick={zoomIn} onfocus={(event) => showButtonTooltip(event, t('common.zoomIn') || 'Zoom in')} onmouseleave={() => hideTooltip()} onmouseenter={(event) => showButtonTooltip(event, t('common.zoomIn') || 'Zoom in')}>
                <svg aria-hidden="true" role="img" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21l-4.35-4.35M11 8v6m-3-3h6"/></g></svg>
              </button>
              <button type="button" class="mermaid-btn mermaid-action-btn mermaid-btn--icon" aria-label={t('common.zoomOut')} onblur={() => hideTooltip()} onclick={zoomOut} onfocus={(event) => showButtonTooltip(event, t('common.zoomOut') || 'Zoom out')} onmouseleave={() => hideTooltip()} onmouseenter={(event) => showButtonTooltip(event, t('common.zoomOut') || 'Zoom out')}>
                <svg aria-hidden="true" role="img" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21l-4.35-4.35M8 11h6"/></g></svg>
              </button>
              <button type="button" class="mermaid-btn mermaid-action-btn mermaid-zoom-reset" aria-label={t('common.resetZoom')} onblur={() => hideTooltip()} onclick={() => (zoom = 1)} onfocus={(event) => showButtonTooltip(event, t('common.resetZoom') || 'Reset zoom')} onmouseleave={() => hideTooltip()} onmouseenter={(event) => showButtonTooltip(event, t('common.resetZoom') || 'Reset zoom')}>{Math.round(zoom * 100)}%</button>
            </div>
          {/if}
          <div class="mermaid-preview markstream-svelte-mermaid" style={previewStyle}>
            {#if svgMarkup}
              {@html svgMarkup}
            {:else if renderError}
              <pre class="mermaid-source"><code>{source}</code></pre>
            {:else}
              <div class="mermaid-loading"><span class="mermaid-spinner"></span> {t('common.preview')}</div>
            {/if}
          </div>
          {#if renderError}
            <div class="mermaid-error">{renderError}</div>
          {/if}
        {/if}
      </div>
    {/if}

    {#if modalOpen}
      <div use:portal class:dark={resolvedIsDark} class="markstream-svelte markstream-svelte-modal-root">
        <div class="mermaid-modal-overlay" role="dialog" aria-modal="true" tabindex="-1" onclick={onModalOverlayClick} onkeydown={onModalKeydown}>
          <div class="mermaid-modal-panel">
            <div class="mermaid-modal-controls">
              <button type="button" class="mermaid-btn mermaid-action-btn mermaid-btn--icon" aria-label={t('common.zoomIn')} onclick={zoomIn}>
                <svg aria-hidden="true" role="img" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21l-4.35-4.35M11 8v6m-3-3h6"/></g></svg>
              </button>
              <button type="button" class="mermaid-btn mermaid-action-btn mermaid-btn--icon" aria-label={t('common.zoomOut')} onclick={zoomOut}>
                <svg aria-hidden="true" role="img" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21l-4.35-4.35M8 11h6"/></g></svg>
              </button>
              <button type="button" class="mermaid-btn mermaid-action-btn mermaid-zoom-reset" aria-label={t('common.resetZoom')} onclick={() => (zoom = 1)}>{Math.round(zoom * 100)}%</button>
              <button type="button" class="mermaid-btn mermaid-action-btn mermaid-btn--icon" aria-label={t('common.close')} onclick={closeModal}>
                <svg aria-hidden="true" role="img" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div class="mermaid-modal-body">
              <div class="mermaid-modal-content markstream-svelte-mermaid" style={`transform: scale(${zoom});`}>{@html svgMarkup}</div>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
{/if}
