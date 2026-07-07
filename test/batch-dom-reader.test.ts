/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBatchDOMReader } from '../src/utils/batchDOMReader'

describe('batchDOMReader', () => {
  let frameHandle: number
  let frameCallbacks: Map<number, FrameRequestCallback>

  function flushNextFrame() {
    const entry = frameCallbacks.entries().next().value
    expect(entry).toBeTruthy()

    const [id, callback] = entry!
    frameCallbacks.delete(id)
    callback(performance.now())
  }

  beforeEach(() => {
    frameHandle = 0
    frameCallbacks = new Map()

    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      frameHandle += 1
      frameCallbacks.set(frameHandle, callback)
      return frameHandle
    }))

    vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => {
      frameCallbacks.delete(id)
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('flushes reads queued by a running read in a follow-up frame', async () => {
    const reader = createBatchDOMReader()
    const seen: string[] = []
    let nested: Promise<string> | null = null

    const first = reader.read(() => {
      seen.push('first')
      nested = reader.read(() => {
        seen.push('nested')
        return 'nested-result'
      })
      return 'first-result'
    })

    flushNextFrame()

    await expect(first).resolves.toBe('first-result')
    expect(seen).toEqual(['first'])
    expect(frameCallbacks.size).toBe(1)

    flushNextFrame()

    expect(nested).not.toBeNull()
    await expect(nested!).resolves.toBe('nested-result')
    expect(seen).toEqual(['first', 'nested'])
  })

  it('runs readSync directly while a batch is flushing', async () => {
    const reader = createBatchDOMReader()
    const seen: string[] = []

    const promise = reader.read(() => {
      seen.push('first')
      const value = reader.readSync(() => {
        seen.push('sync')
        return 'sync-result'
      })
      seen.push(value)
      return 'first-result'
    })

    flushNextFrame()

    await expect(promise).resolves.toBe('first-result')
    expect(seen).toEqual(['first', 'sync', 'sync-result'])
    expect(frameCallbacks.size).toBe(0)
  })

  it('settles every queued read when one read throws', async () => {
    const reader = createBatchDOMReader()
    const error = new Error('read failed')
    const seen: string[] = []

    const first = reader.read(() => {
      seen.push('first')
      return 'first-result'
    })
    const failed = reader.read(() => {
      seen.push('failed')
      throw error
    })
    const third = reader.read(() => {
      seen.push('third')
      return 'third-result'
    })

    flushNextFrame()

    await expect(first).resolves.toBe('first-result')
    await expect(failed).rejects.toBe(error)
    await expect(third).resolves.toBe('third-result')
    expect(seen).toEqual(['first', 'failed', 'third'])
  })
})
