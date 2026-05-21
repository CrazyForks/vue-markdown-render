import type { Ref } from 'vue'
import type { NodeRendererProps } from '../src/types/node-renderer-props'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, effectScope, reactive, ref } from 'vue'
import { useMarkdownParsing } from '../src/components/NodeRenderer/composables/useMarkdownParsing'

function createParsingState(
  content: Ref<string>,
  smooth = ref(false),
  initialProps: Partial<NodeRendererProps> = {},
  debugPerformance = ref(false),
  logPerf = vi.fn(),
) {
  const props = reactive({ ...initialProps } as NodeRendererProps)
  const final = ref(false)
  const scope = effectScope()
  const state = scope.run(() => useMarkdownParsing(props, {
    instanceMsgId: `test-${Math.random().toString(36).slice(2)}`,
    renderContent: computed(() => content.value),
    effectiveFinal: computed(() => final.value),
    smoothStreamingEnabled: computed(() => smooth.value),
    debugPerformanceEnabled: computed(() => debugPerformance.value),
    logPerf,
  }))

  if (!state)
    throw new Error('failed to create parsing state')

  return { props, final, scope, state }
}

function paragraphChildren(node: unknown) {
  return ((node as { children?: unknown[] } | undefined)?.children ?? []) as Array<{ type?: string }>
}

describe('useMarkdownParsing performance behavior', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('coalesces smooth streaming character updates until the parse interval elapses', async () => {
    vi.useFakeTimers()
    const initial = 'hello '.repeat(18).trim()
    const next = `${initial} world`
    const content = ref(initial)
    const smooth = ref(true)
    const { scope, state } = createParsingState(content, smooth)

    expect(state.parsedNodes.value[0]?.raw).toBe(initial)

    content.value = next
    expect(state.parsedNodes.value[0]?.raw).toBe(initial)

    await vi.advanceTimersByTimeAsync(79)
    expect(state.parsedNodes.value[0]?.raw).toBe(initial)

    await vi.advanceTimersByTimeAsync(1)
    expect(state.parsedNodes.value[0]?.raw).toBe(next)

    content.value = `${next}\n\nnext`
    expect(state.parsedNodes.value.length).toBe(2)

    scope.stop()
  })

  it('uses parseCoalesceMs to pace smooth streaming parse commits', async () => {
    vi.useFakeTimers()
    const initial = 'hello '.repeat(18).trim()
    const next = `${initial} world`
    const content = ref(initial)
    const smooth = ref(true)
    const { scope, state } = createParsingState(content, smooth, { parseCoalesceMs: 20 })

    expect(state.parsedNodes.value[0]?.raw).toBe(initial)

    content.value = next
    expect(state.parsedNodes.value[0]?.raw).toBe(initial)

    await vi.advanceTimersByTimeAsync(19)
    expect(state.parsedNodes.value[0]?.raw).toBe(initial)

    await vi.advanceTimersByTimeAsync(1)
    expect(state.parsedNodes.value[0]?.raw).toBe(next)

    scope.stop()
  })

  it('reuses unchanged ParsedNode references after append parses', () => {
    const content = ref('alpha\n\nbeta')
    const { scope, state } = createParsingState(content)
    const first = state.parsedNodes.value

    content.value = 'alpha\n\nbeta\n\ngamma'
    const second = state.parsedNodes.value

    expect(second[0]).toBe(first[0])
    expect(second[1]).toBe(first[1])
    expect(second[2]).not.toBe(first[2])

    scope.stop()
  })

  it('does not reuse a node when appended reference definitions change inline children', () => {
    const content = ref('[foo][bar]\n\n')
    const { scope, state } = createParsingState(content)

    const first = state.parsedNodes.value[0]
    expect(paragraphChildren(first).some(child => child.type === 'link')).toBe(false)

    content.value = '[foo][bar]\n\n[bar]: https://example.com\n\n'

    const second = state.parsedNodes.value[0]
    expect(second).not.toBe(first)
    expect(paragraphChildren(second).some(child => child.type === 'link')).toBe(true)

    scope.stop()
  })

  it('does not reuse stale ParsedNode references when final changes', () => {
    const content = ref('**hello')
    const { final, scope, state } = createParsingState(content)
    const first = state.parsedNodes.value[0]

    final.value = true
    const second = state.parsedNodes.value[0]

    expect(second).not.toBe(first)

    scope.stop()
  })

  it('does not reuse stale ParsedNode references when parseOptions changes', () => {
    const content = ref('**hello')
    const { props, scope, state } = createParsingState(content)
    const first = state.parsedNodes.value[0]
    const reset = vi.spyOn((state.mdInstance.value as any).stream, 'reset')

    props.parseOptions = { requireClosingStrong: true }
    const second = state.parsedNodes.value[0]

    expect(second).not.toBe(first)
    expect(reset).toHaveBeenCalled()

    scope.stop()
  })

  it('does not reuse stale ParsedNode references when customMarkdownIt changes', () => {
    const content = ref('[x](https://example.com)')
    const { props, scope, state } = createParsingState(content)
    const first = state.parsedNodes.value[0]

    props.customMarkdownIt = (md) => {
      const markdownIt = md as any
      markdownIt.set?.({ validateLink: () => false })
      return md
    }
    const second = state.parsedNodes.value[0]

    expect(second).not.toBe(first)
    expect(paragraphChildren(second).some(child => child.type === 'link')).toBe(false)

    scope.stop()
  })

  it('does not reuse a paragraph when children differ but raw is unchanged', () => {
    const content = ref('[x](https://example.com)')
    const { props, scope, state } = createParsingState(content)
    const first = state.parsedNodes.value[0]

    expect(paragraphChildren(first).some(child => child.type === 'link')).toBe(true)

    props.parseOptions = { validateLink: () => false }
    const second = state.parsedNodes.value[0]

    expect(second).not.toBe(first)
    expect((second as any).raw).toBe((first as any).raw)
    expect(paragraphChildren(second).some(child => child.type === 'link')).toBe(false)

    scope.stop()
  })

  it('logs stream stats deltas when debug performance is enabled', () => {
    const content = ref('alpha')
    const logPerf = vi.fn()
    const { scope, state } = createParsingState(content, ref(false), {}, ref(true), logPerf)

    expect(state.parsedNodes.value.length).toBe(1)

    const data = logPerf.mock.calls.at(-1)?.[1]
    expect(data).toMatchObject({
      streamDelta: expect.objectContaining({
        total: expect.any(Number),
      }),
      streamStats: expect.any(Object),
    })
    expect(typeof data?.streamMode === 'string' || data?.streamMode == null).toBe(true)

    scope.stop()
  })
})
