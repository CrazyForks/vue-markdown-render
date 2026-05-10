/**
 * @vitest-environment jsdom
 */

import type { SmoothStreamingScope } from '../packages/markstream-angular/src/components/shared/smooth-streaming-scope'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SmoothMarkdownStreamService } from '../packages/markstream-angular/src/services/smooth-markdown-stream.service'

/**
 * Minimal harness that replicates the NodeRendererComponent's smooth streaming
 * logic (smoothStreamingEnabled gate, renderContent, effectiveFinal, syncSmoothStream,
 * rebuild skip) so we can test the contract without Angular TestBed.
 */
function createHarness(options: {
  smoothStreaming?: boolean | 'auto'
  typewriter?: boolean
  maxLiveNodes?: number
  hasNodes?: boolean
  parentSmoothStreamingEnabled?: boolean
}) {
  const {
    smoothStreaming = 'auto',
    typewriter = true,
    maxLiveNodes = 320,
    hasNodes = false,
    parentSmoothStreamingEnabled = false,
  } = options

  const smoothStream = new SmoothMarkdownStreamService()
  let hasMountedForSmoothStreaming = false
  let content = ''
  let finalValue: boolean | undefined
  let rebuildCount = 0
  let parsedContent = ''

  const parentScope: SmoothStreamingScope | null = parentSmoothStreamingEnabled
    ? { isSmoothStreamingEnabled: () => true }
    : null

  function getSmoothStreamingEligible(): boolean {
    if (smoothStreaming === false)
      return false
    if (hasNodes)
      return false
    if (smoothStreaming !== true && parentScope?.isSmoothStreamingEnabled())
      return false
    if (smoothStreaming === true)
      return true
    return typewriter === true || maxLiveNodes <= 0
  }

  function getSmoothStreamingEnabled(): boolean {
    const gateOpen = typeof window === 'undefined'
      || hasMountedForSmoothStreaming
      || smoothStreaming === true
    return gateOpen && getSmoothStreamingEligible()
  }

  function getRenderContent(): string {
    return getSmoothStreamingEnabled() ? smoothStream.visible : (content ?? '')
  }

  function getRequestedFinal(): boolean | undefined {
    return finalValue
  }

  function getEffectiveFinal(): boolean | undefined {
    const requested = getRequestedFinal()
    if (getSmoothStreamingEnabled() && requested != null) {
      const smoothSourceSynced = hasNodes || smoothStream.source === (content ?? '')
      return Boolean(requested && smoothSourceSynced && smoothStream.caughtUp)
    }
    return requested
  }

  function syncSmoothStream() {
    if (!smoothStream)
      return

    const nextContent = content ?? ''

    if (hasNodes) {
      smoothStream.reset('')
      return
    }

    if (!getSmoothStreamingEnabled()) {
      smoothStream.reset(nextContent)
      if (getRequestedFinal())
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

    if (getRequestedFinal())
      smoothStream.finish()
  }

  function rebuild() {
    rebuildCount += 1
    parsedContent = getRenderContent()
  }

  // Simulate ngOnChanges (with rebuild-skip logic)
  function ngOnChanges(changes: { content?: boolean, nodes?: boolean }) {
    smoothStream.init()

    const previousRenderContent = getRenderContent()
    const previousEffectiveFinal = getEffectiveFinal()

    syncSmoothStream()

    if (
      getSmoothStreamingEnabled()
      && changes.content
      && !changes.nodes
      && previousRenderContent === getRenderContent()
      && previousEffectiveFinal === getEffectiveFinal()
    ) {
      return
    }

    rebuild()
  }

  // Simulate ngOnInit
  function ngOnInit() {
    smoothStream.init()
    hasMountedForSmoothStreaming = true
    syncSmoothStream()
    rebuild()
  }

  return {
    get smoothStream() { return smoothStream },
    setContent(c: string) { content = c },
    setFinal(f: boolean | undefined) { finalValue = f },
    ngOnChanges,
    ngOnInit,
    getSmoothStreamingEnabled,
    getRenderContent,
    getEffectiveFinal,
    get rebuildCount() { return rebuildCount },
    get parsedContent() { return parsedContent },
  }
}

describe('markstream-angular NodeRenderer smooth streaming contract', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('paces initial client content when smoothStreaming=true', () => {
    // With smoothStreaming=true, the gate is always open — even before ngOnInit.
    // So initial content should go through enqueue/reset and be paced, not
    // immediately visible.
    vi.useFakeTimers()
    const harness = createHarness({ smoothStreaming: true, typewriter: false })

    harness.setContent('Hello world from initial content')

    // ngOnChanges runs before ngOnInit in Angular
    harness.ngOnChanges({ content: true })

    // smoothStreaming=true opens the gate, so smooth streaming is enabled
    expect(harness.getSmoothStreamingEnabled()).toBe(true)

    // Content was enqueued but visible should be behind source
    expect(harness.smoothStream.source).toBe('Hello world from initial content')
    expect(harness.smoothStream.visible.length).toBeLessThan(
      'Hello world from initial content'.length,
    )

    // renderContent should use visible (paced), not raw content
    expect(harness.getRenderContent().length).toBeLessThan(
      'Hello world from initial content'.length,
    )

    harness.smoothStream.ngOnDestroy()
  })

  it('does not pace initial content in auto mode before mount', () => {
    // In auto mode, ngOnChanges runs before ngOnInit, so hasMountedForSmoothStreaming
    // is still false. The gate should protect initial content from blank.
    const harness = createHarness({ smoothStreaming: 'auto', typewriter: true })

    harness.setContent('static initial content')

    // ngOnChanges runs first (hasMountedForSmoothStreaming = false)
    harness.ngOnChanges({ content: true })

    // Before mount, smoothStreamingEnabled should be false in auto mode
    expect(harness.getSmoothStreamingEnabled()).toBe(false)

    // renderContent should return the raw content immediately
    expect(harness.getRenderContent()).toBe('static initial content')
  })

  it('paces post-mount appends in auto mode', async () => {
    vi.useFakeTimers()
    const harness = createHarness({ smoothStreaming: 'auto', typewriter: true })

    // Mount with empty content
    harness.ngOnInit()

    // After mount, smoothStreamingEnabled should be true (typewriter=true)
    expect(harness.getSmoothStreamingEnabled()).toBe(true)

    // Append content after mount
    harness.setContent('Hello smooth streaming markdown renderer.')
    harness.ngOnChanges({ content: true })

    // Content should be enqueued and visible should be behind
    expect(harness.smoothStream.source).toBe('Hello smooth streaming markdown renderer.')
    expect(harness.smoothStream.visible.length).toBeLessThan(
      'Hello smooth streaming markdown renderer.'.length,
    )

    harness.smoothStream.ngOnDestroy()
  })

  it('shows content immediately when smoothStreaming=false', () => {
    const harness = createHarness({ smoothStreaming: false, typewriter: true })

    harness.setContent('Immediate content')
    harness.ngOnInit()
    harness.ngOnChanges({ content: true })

    expect(harness.getSmoothStreamingEnabled()).toBe(false)
    expect(harness.getRenderContent()).toBe('Immediate content')
  })

  it('skips rebuild for raw content append when visible has not advanced', async () => {
    vi.useFakeTimers()
    const harness = createHarness({ smoothStreaming: true, typewriter: false })

    // Mount and set initial content
    harness.setContent('abc')
    harness.ngOnInit()
    const rebuildsAfterInit = harness.rebuildCount

    // Now append raw chunks without advancing visible (rAF never ticks)
    harness.setContent('abcdef')
    harness.ngOnChanges({ content: true })
    const rebuildsAfterFirstAppend = harness.rebuildCount

    harness.setContent('abcdefghijkl')
    harness.ngOnChanges({ content: true })
    const rebuildsAfterSecondAppend = harness.rebuildCount

    // Visible hasn't advanced, so rebuilds should be skipped for raw content appends
    // Only the init rebuild should have happened, not additional ones from raw appends
    expect(rebuildsAfterFirstAppend).toBe(rebuildsAfterInit)
    expect(rebuildsAfterSecondAppend).toBe(rebuildsAfterInit)

    // After visible catches up, the subscription would trigger rebuild
    // (In real Angular, smoothStream.subscribe() calls rebuild when visible changes)
    harness.smoothStream.flush()

    harness.smoothStream.ngOnDestroy()
  })

  it('gates final by caughtUp when smooth streaming is active', async () => {
    vi.useFakeTimers()
    const harness = createHarness({ smoothStreaming: true, typewriter: false })

    harness.setContent('Hello world')
    harness.setFinal(true)
    harness.ngOnInit()

    // Before visible catches up, effectiveFinal should be false
    // (source is ahead of visible)
    if (harness.smoothStream.source.length > harness.smoothStream.visible.length) {
      expect(harness.getEffectiveFinal()).toBe(false)
    }

    // Flush to let visible catch up
    harness.smoothStream.flush()

    // After caught up, effectiveFinal should reflect the requested final
    expect(harness.smoothStream.caughtUp).toBe(true)
    expect(harness.getEffectiveFinal()).toBe(true)

    harness.smoothStream.ngOnDestroy()
  })

  it('suppresses auto mode but not explicit true under parent scope', () => {
    // Auto mode with parent already smoothing → should be suppressed
    const autoHarness = createHarness({
      smoothStreaming: 'auto',
      typewriter: true,
      parentSmoothStreamingEnabled: true,
    })
    autoHarness.ngOnInit()
    expect(autoHarness.getSmoothStreamingEnabled()).toBe(false)

    // Explicit true with parent smoothing → should NOT be suppressed
    const explicitHarness = createHarness({
      smoothStreaming: true,
      typewriter: false,
      parentSmoothStreamingEnabled: true,
    })
    explicitHarness.ngOnInit()
    expect(explicitHarness.getSmoothStreamingEnabled()).toBe(true)
  })

  it('has initial snapshot final=false in SmoothMarkdownStreamService', () => {
    const service = new SmoothMarkdownStreamService()
    // Before init, the default snapshot should have final: false
    expect(service.final).toBe(false)
    service.ngOnDestroy()
  })
})
