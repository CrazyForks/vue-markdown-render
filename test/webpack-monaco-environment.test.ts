import { describe, expect, it, vi } from 'vitest'

describe('webpack MonacoEnvironment interop', () => {
  it('calls stream-monaco preload when MonacoEnvironment is absent', async () => {
    vi.resetModules()
    delete (globalThis as any).MonacoEnvironment

    const streamMonaco = await import('stream-monaco')
    ;(streamMonaco.preloadMonacoWorkers as any).mockClear?.()
    const { getUseMonaco } = await import('../src/components/CodeBlockNode/monaco')

    await getUseMonaco()

    expect(streamMonaco.preloadMonacoWorkers).toHaveBeenCalledTimes(1)
  })

  it('does not override existing MonacoEnvironment.getWorkerUrl (webpack plugin)', async () => {
    vi.resetModules()
    ;(globalThis as any).MonacoEnvironment = { getWorkerUrl: () => '/editor.worker.js' }

    const streamMonaco = await import('stream-monaco')
    ;(streamMonaco.preloadMonacoWorkers as any).mockClear?.()
    const { getUseMonaco } = await import('../src/components/CodeBlockNode/monaco')

    await getUseMonaco()

    expect(streamMonaco.preloadMonacoWorkers).not.toHaveBeenCalled()
  })

  it('does not override existing MonacoEnvironment.getWorker (webpack plugin)', async () => {
    vi.resetModules()
    ;(globalThis as any).MonacoEnvironment = { getWorker: () => new (globalThis as any).Worker('') }

    const streamMonaco = await import('stream-monaco')
    ;(streamMonaco.preloadMonacoWorkers as any).mockClear?.()
    const { getUseMonaco } = await import('../src/components/CodeBlockNode/monaco')

    await getUseMonaco()

    expect(streamMonaco.preloadMonacoWorkers).not.toHaveBeenCalled()
  })
})
