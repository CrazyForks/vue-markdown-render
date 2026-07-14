import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearKaTeXWorker,
  getKaTeXWorkerLoad,
  renderKaTeXInWorker,
  renderKaTeXWithBackpressure,
  setKaTeXWorker,
  setKaTeXWorkerMaxConcurrency,
  WORKER_BUSY_CODE,
} from '../../src/workers/katexWorkerClient'

// A minimal controllable fake Worker for tests
class FakeWorker {
  onmessage: ((ev: MessageEvent<any>) => any) | null = null
  onerror: ((ev: ErrorEvent) => any) | null = null
  private inbox: Array<{ id: string, content: string, displayMode: boolean }> = []

  postMessage(data: { id: string, content: string, displayMode: boolean }) {
    // store request, do not auto-resolve
    this.inbox.push({ id: data.id, content: data.content, displayMode: data.displayMode })
  }

  // Resolve the oldest pending request
  resolveNext(htmlFactory?: (content: string) => string) {
    const msg = this.inbox.shift()
    if (!msg)
      return false
    const html = htmlFactory ? htmlFactory(msg.content) : `<span>${msg.content}</span>`
    this.onmessage?.({
      data: { id: msg.id, html, content: msg.content, displayMode: msg.displayMode },
    } as any)
    return true
  }

  // For completeness
  terminate() {}
}

describe('katexWorkerClient concurrency cap', () => {
  let worker: FakeWorker

  beforeEach(() => {
    worker = new FakeWorker()
    setKaTeXWorker(worker as unknown as Worker)
    setKaTeXWorkerMaxConcurrency(5)
  })

  afterEach(() => {
    clearKaTeXWorker()
  })

  it('6th concurrent render rejects with WORKER_BUSY; after freeing one, retry succeeds', async () => {
    const contents = ['a', 'b', 'c', 'd', 'e', 'f']

    // Fire 5 in-flight renders that will remain pending
    const p1 = renderKaTeXInWorker(contents[0], true, 2000)
    const p2 = renderKaTeXInWorker(contents[1], true, 2000)
    const p3 = renderKaTeXInWorker(contents[2], true, 2000)
    const p4 = renderKaTeXInWorker(contents[3], true, 2000)
    const p5 = renderKaTeXInWorker(contents[4], true, 2000)

    // 6th should be busy
    await expect(renderKaTeXInWorker(contents[5], true, 2000)).rejects.toMatchObject({ code: WORKER_BUSY_CODE })

    // Free one slot by resolving one of the pending requests
    worker.resolveNext()

    // Now retry the 6th; it should be accepted and resolve once we resolveNext again
    const p6 = renderKaTeXInWorker(contents[5], true, 2000)

    // Resolve remaining in some order
    worker.resolveNext(c => `<ok>${c}</ok>`) // resolves one of p2..p6
    worker.resolveNext(c => `<ok>${c}</ok>`)
    worker.resolveNext(c => `<ok>${c}</ok>`)
    worker.resolveNext(c => `<ok>${c}</ok>`)
    worker.resolveNext(c => `<ok>${c}</ok>`)

    const results = await Promise.all([p1, p2, p3, p4, p5, p6].map(p => p.catch(e => e)))

    // Ensure all resolved to HTML strings, not errors
    for (const r of results) {
      expect(typeof r).toBe('string')
      expect(r).toMatch(/<ok>|<span>/)
    }
  })

  it('keeps aborted posted work in the concurrency count until the worker replies', async () => {
    const abortController = new AbortController()
    const render = renderKaTeXInWorker('abort-in-flight', true, 2000, abortController.signal)

    expect(getKaTeXWorkerLoad().inFlight).toBe(1)
    abortController.abort()
    await expect(render).rejects.toMatchObject({ name: 'AbortError' })
    expect(getKaTeXWorkerLoad().inFlight).toBe(1)

    worker.resolveNext()
    expect(getKaTeXWorkerLoad().inFlight).toBe(0)
  })

  it('wakes only as many backpressure waiters as there are worker slots', async () => {
    setKaTeXWorkerMaxConcurrency(1)
    const first = renderKaTeXInWorker('queue-first', true, 2000)
    const second = renderKaTeXWithBackpressure('queue-second', true, {
      backoffMs: 0,
      maxRetries: 1,
      waitTimeout: 2000,
    })
    const third = renderKaTeXWithBackpressure('queue-third', true, {
      backoffMs: 0,
      maxRetries: 1,
      waitTimeout: 2000,
    })

    await new Promise(resolve => setTimeout(resolve, 0))
    worker.resolveNext()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(worker.resolveNext()).toBe(true)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(worker.resolveNext()).toBe(true)

    await expect(Promise.all([first, second, third])).resolves.toHaveLength(3)
  })

  it('continues draining when the first waiter resolves from cache without taking the slot', async () => {
    setKaTeXWorkerMaxConcurrency(1)
    const first = renderKaTeXInWorker('cache-first', true, 2000)
    const cached = renderKaTeXWithBackpressure('cache-first', true, {
      backoffMs: 0,
      maxRetries: 1,
      waitTimeout: 2000,
    })
    const other = renderKaTeXWithBackpressure('cache-other', true, {
      backoffMs: 0,
      maxRetries: 1,
      waitTimeout: 2000,
    })

    await Promise.resolve()
    await Promise.resolve()
    worker.resolveNext(content => `<cached>${content}</cached>`)

    await expect(cached).resolves.toBe('<cached>cache-first</cached>')
    await Promise.resolve()
    expect(worker.inbox.map(message => message.content)).toEqual(['cache-other'])

    worker.resolveNext(content => `<other>${content}</other>`)
    await expect(Promise.all([first, other])).resolves.toEqual([
      '<cached>cache-first</cached>',
      '<other>cache-other</other>',
    ])
  })
})
