import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { enableMermaid } from '../../src/components/MermaidBlockNode/mermaid'
import {
  canParseOffthread,
  clearMermaidWorker,
  getMermaidWorkerLoad,
  setMermaidWorker,
  setMermaidWorkerMaxConcurrency,
} from '../../src/workers/mermaidWorkerClient'

class FakeWorker {
  onmessage: ((event: MessageEvent<any>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessageerror: ((event: MessageEvent<any>) => void) | null = null
  inbox: Array<{ id: string, action: string, payload: unknown }> = []

  postMessage(message: { id: string, action: string, payload: unknown }) {
    this.inbox.push(message)
  }

  resolveNext(result: unknown = true) {
    const message = this.inbox.shift()
    if (!message)
      return false
    this.onmessage?.({ data: { id: message.id, ok: true, result } } as MessageEvent)
    return true
  }

  terminate() {}
}

describe('mermaidWorkerClient shared parsing', () => {
  let worker: FakeWorker

  beforeEach(() => {
    enableMermaid()
    worker = new FakeWorker()
    setMermaidWorker(worker as unknown as Worker)
    setMermaidWorkerMaxConcurrency(5)
  })

  afterEach(() => {
    clearMermaidWorker()
    vi.useRealTimers()
  })

  it('deduplicates identical in-flight parse requests', async () => {
    const first = canParseOffthread('graph LR\nA-->B', 'light')
    const second = canParseOffthread('graph LR\nA-->B', 'light')

    expect(worker.inbox).toHaveLength(1)
    expect(getMermaidWorkerLoad().inFlight).toBe(1)
    worker.resolveNext(true)

    await expect(Promise.all([first, second])).resolves.toEqual([true, true])
    expect(getMermaidWorkerLoad().inFlight).toBe(0)
  })

  it('aborts one subscriber without duplicating or freeing posted worker work', async () => {
    const abortController = new AbortController()
    const first = canParseOffthread('graph LR\nA-->B', 'dark')
    const second = canParseOffthread('graph LR\nA-->B', 'dark', 1400, abortController.signal)

    abortController.abort()
    await expect(second).rejects.toMatchObject({ name: 'AbortError' })
    expect(worker.inbox).toHaveLength(1)
    expect(getMermaidWorkerLoad().inFlight).toBe(1)

    worker.resolveNext(true)
    await expect(first).resolves.toBe(true)
    expect(getMermaidWorkerLoad().inFlight).toBe(0)
  })

  it('does not share a shorter timeout with an otherwise identical request', async () => {
    vi.useFakeTimers()
    const short = canParseOffthread('graph LR\nA-->B', 'light', 20).catch(error => error)
    const long = canParseOffthread('graph LR\nA-->B', 'light', 500)

    expect(worker.inbox).toHaveLength(2)
    expect(getMermaidWorkerLoad().inFlight).toBe(2)

    await vi.advanceTimersByTimeAsync(20)
    await expect(short).resolves.toMatchObject({ code: 'WORKER_TIMEOUT' })
    expect(getMermaidWorkerLoad().inFlight).toBe(1)

    worker.resolveNext()
    expect(getMermaidWorkerLoad().inFlight).toBe(1)
    worker.resolveNext(true)
    await expect(long).resolves.toBe(true)
  })

  it('sends a replacement request to the new worker instead of reusing the old shared call', async () => {
    const first = canParseOffthread('graph LR\nA-->B', 'light').catch(error => error)
    const replacement = new FakeWorker()

    expect(worker.inbox).toHaveLength(1)
    setMermaidWorker(replacement as unknown as Worker)

    const second = canParseOffthread('graph LR\nA-->B', 'light')
    expect(replacement.inbox).toHaveLength(1)

    replacement.resolveNext(true)

    await expect(first).resolves.toMatchObject({ code: 'WORKER_REPLACED' })
    await expect(second).resolves.toBe(true)
  })
})
