import type { ComputedRef, Ref } from 'vue'
import { computed, onBeforeUnmount, ref } from 'vue'

export interface SmoothMarkdownStreamOptions {
  minCharsPerSecond?: number
  maxCharsPerSecond?: number
  targetLatencyMs?: number
  catchUpLatencyMs?: number
  catchUpThreshold?: number
  maxCommitFps?: number
  startDelayMs?: number
  maxCharsPerCommit?: number
  flushOnFinish?: boolean
}

export interface SmoothMarkdownStreamController {
  source: Ref<string>
  visible: Ref<string>
  done: Ref<boolean>
  final: ComputedRef<boolean>
  caughtUp: ComputedRef<boolean>
  pendingChars: ComputedRef<number>
  enqueue: (chunk: string) => void
  finish: (options?: { flush?: boolean }) => void
  flush: () => void
  reset: (initialMarkdown?: string) => void
  pause: () => void
  resume: () => void
}

interface GraphemeSlice {
  text: string
  graphemeCount: number
}

interface GraphemeSegment {
  segment: string
}

interface GraphemeSegmenter {
  segment: (input: string) => Iterable<GraphemeSegment>
}

export function useSmoothMarkdownStream(options: SmoothMarkdownStreamOptions = {}): SmoothMarkdownStreamController {
  const {
    minCharsPerSecond: rawMinCps = 40,
    maxCharsPerSecond: rawMaxCps = 1000,
    targetLatencyMs = 900,
    catchUpLatencyMs = 350,
    catchUpThreshold = 600,
    maxCommitFps: rawMaxFps = 30,
    startDelayMs = 80,
    maxCharsPerCommit: rawMaxChars = 80,
    flushOnFinish = false,
  } = options

  const minCharsPerSecond = Math.max(1, rawMinCps)
  const maxCharsPerSecond = Math.max(minCharsPerSecond, rawMaxCps)
  const maxCommitFps = Math.max(1, Math.trunc(rawMaxFps || 30))
  const maxCharsPerCommit = Math.max(1, Math.trunc(rawMaxChars || 1))

  const source = ref('')
  const visible = ref('')
  const done = ref(false)
  const paused = ref(false)

  const pendingChars = computed(() => Math.max(0, source.value.length - visible.value.length))
  const caughtUp = computed(() => pendingChars.value === 0)
  const final = computed(() => done.value && caughtUp.value)
  const segmenter = createGraphemeSegmenter()

  let rafId = 0
  let startedAt = 0
  let lastTick = 0
  let charBudget = 0
  let currentCps = minCharsPerSecond
  let hasStarted = false

  function enqueue(chunk: string) {
    if (!chunk)
      return

    if (done.value)
      done.value = false

    const hadSource = source.value.length > 0
    const wasIdle = pendingChars.value <= 0
    source.value += chunk

    if (wasIdle) {
      const t = now()
      // Only apply startDelay for the very first batch of a new stream.
      // If the stream already had content and wasn't finished, skip the delay
      // so subsequent appends resume smoothly without an artificial pause.
      startedAt = hadSource && hasStarted
        ? t - startDelayMs
        : t
      lastTick = t
      charBudget = 0
    }

    hasStarted = true
    ensureLoop()
  }

  function finish(finishOptions: { flush?: boolean } = {}) {
    done.value = true

    if (finishOptions.flush ?? flushOnFinish) {
      flush()
      return
    }

    ensureLoop()
  }

  function flush() {
    visible.value = source.value
    charBudget = 0
    currentCps = minCharsPerSecond
    cancelLoop()
  }

  function reset(initialMarkdown = '') {
    cancelLoop()

    source.value = initialMarkdown
    visible.value = initialMarkdown
    done.value = false
    paused.value = false
    hasStarted = false

    startedAt = 0
    lastTick = 0
    charBudget = 0
    currentCps = minCharsPerSecond
  }

  function pause() {
    paused.value = true
    cancelLoop()
  }

  function resume() {
    if (!paused.value)
      return

    paused.value = false
    const t = now()
    lastTick = t
    startedAt ||= t
    ensureLoop()
  }

  function ensureLoop() {
    if (rafId || paused.value || pendingChars.value <= 0)
      return

    if (typeof requestAnimationFrame !== 'function') {
      flush()
      return
    }

    rafId = requestAnimationFrame(tick)
  }

  function tick(timestamp: number) {
    rafId = 0

    if (paused.value)
      return

    if (pendingChars.value <= 0) {
      startedAt = 0
      lastTick = 0
      charBudget = 0
      currentCps = minCharsPerSecond
      return
    }

    if (timestamp - startedAt < startDelayMs) {
      rafId = requestAnimationFrame(tick)
      return
    }

    const minFrameMs = 1000 / Math.max(1, maxCommitFps)
    const dt = Math.min(100, Math.max(0, timestamp - lastTick))

    if (dt < minFrameMs) {
      rafId = requestAnimationFrame(tick)
      return
    }

    lastTick = timestamp
    const pending = pendingChars.value
    const latencyMs = pending > catchUpThreshold ? catchUpLatencyMs : targetLatencyMs

    const targetCps = clamp(
      pending / Math.max(0.001, latencyMs / 1000),
      minCharsPerSecond,
      maxCharsPerSecond,
    )

    currentCps += (targetCps - currentCps) * 0.2
    charBudget += currentCps * (dt / 1000)

    const desiredCount = clamp(Math.floor(charBudget), 1, maxCharsPerCommit)
    const rest = source.value.slice(visible.value.length)
    const nextSlice = takeGraphemes(rest, desiredCount, segmenter)

    if (nextSlice.text) {
      visible.value += nextSlice.text
      charBudget = Math.max(0, charBudget - nextSlice.graphemeCount)
    }

    ensureLoop()
  }

  function cancelLoop() {
    if (!rafId)
      return

    if (typeof cancelAnimationFrame === 'function')
      cancelAnimationFrame(rafId)

    rafId = 0
  }

  onBeforeUnmount(cancelLoop)

  return {
    source,
    visible,
    done,
    final,
    caughtUp,
    pendingChars,
    enqueue,
    finish,
    flush,
    reset,
    pause,
    resume,
  }
}

function createGraphemeSegmenter(): GraphemeSegmenter | null {
  if (typeof Intl === 'undefined')
    return null

  const SegmenterCtor = (Intl as unknown as {
    Segmenter?: new (locale?: string, options?: { granularity?: 'grapheme' }) => GraphemeSegmenter
  }).Segmenter

  if (!SegmenterCtor)
    return null

  return new SegmenterCtor(undefined, { granularity: 'grapheme' })
}

function takeGraphemes(input: string, count: number, segmenter: GraphemeSegmenter | null): GraphemeSlice {
  if (!input || count <= 0)
    return { text: '', graphemeCount: 0 }

  if (!segmenter) {
    const parts = Array.from(input).slice(0, count)
    return {
      text: parts.join(''),
      graphemeCount: parts.length,
    }
  }

  let output = ''
  let used = 0

  for (const part of segmenter.segment(input)) {
    if (used >= count)
      break
    output += part.segment
    used++
  }

  return {
    text: output,
    graphemeCount: used,
  }
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
