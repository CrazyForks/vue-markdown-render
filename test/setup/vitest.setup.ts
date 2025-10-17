import { Buffer } from 'node:buffer'
import { vi } from 'vitest'

class WorkerStub {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  addEventListener() {}
  removeEventListener() {}
  postMessage() {}
  terminate() {}
}

if (!(globalThis as any).Worker)
  (globalThis as any).Worker = WorkerStub as unknown as typeof Worker

if (!(globalThis as any).ResizeObserver) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  ;(globalThis as any).ResizeObserver = ResizeObserverStub
}

if (!(globalThis as any).btoa) {
  ;(globalThis as any).btoa = (input: string) => Buffer.from(input, 'utf-8').toString('base64')
}

if (!(globalThis as any).atob) {
  ;(globalThis as any).atob = (input: string) => Buffer.from(input, 'base64').toString('utf-8')
}

vi.mock('vue-use-monaco', () => ({
  useMonaco: () => ({
    createEditor: () => {},
    createDiffEditor: () => {},
    updateCode: () => {},
    updateDiff: () => {},
    getEditor: () => null,
    getEditorView: () => ({
      getModel: () => ({ getLineCount: () => 1 }),
      getOption: () => 14,
      updateOptions: () => {},
    }),
    getDiffEditorView: () => ({
      getModel: () => ({ getLineCount: () => 1 }),
      getOption: () => 14,
      updateOptions: () => {},
    }),
    cleanupEditor: () => {},
    setTheme: async () => {},
  }),
  detectLanguage: () => 'plaintext',
}))

vi.mock('mermaid', () => ({
  default: {
    initialize: () => {},
    render: async (_id: string, code: string) => `<svg data-testid="mermaid-svg">${code}</svg>`,
    parse: () => {},
  },
}))

vi.mock('../../src/workers/katexWorkerClient', () => ({
  // eslint-disable-next-line prefer-promise-reject-errors
  renderKaTeXInWorker: () => Promise.reject({ code: 'WORKER_INIT_ERROR', fallbackToRenderer: true }),
  setKaTeXWorkerDebug: () => {},
  setKaTeXCache: () => {},
}))
