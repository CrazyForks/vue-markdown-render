import { describe, expect, it, vi } from 'vitest'

describe('code block runtime interop', () => {
  it('preloads the optional stream-diffs runtime once', async () => {
    vi.resetModules()
    const streamDiffs = await import('stream-diffs')
    ;(streamDiffs.preloadMonacoWorkers as any).mockClear?.()
    const { getUseMonaco, isCodeBlockRuntimeReady } = await import('../src/components/CodeBlockNode/monaco')

    await getUseMonaco()

    expect(streamDiffs.preloadMonacoWorkers).toHaveBeenCalledTimes(1)
    expect(isCodeBlockRuntimeReady()).toBe(true)
  })

  it('exposes a reusable runtime preload API', async () => {
    vi.resetModules()
    const streamDiffs = await import('stream-diffs')
    ;(streamDiffs.preloadMonacoWorkers as any).mockClear?.()
    const { isCodeBlockRuntimeReady, preloadCodeBlockRuntime } = await import('../src/components/CodeBlockNode/monaco')

    expect(isCodeBlockRuntimeReady()).toBe(false)
    await expect(preloadCodeBlockRuntime()).resolves.toBe(true)
    expect(isCodeBlockRuntimeReady()).toBe(true)
    expect(streamDiffs.preloadMonacoWorkers).toHaveBeenCalledTimes(1)
  })
})
