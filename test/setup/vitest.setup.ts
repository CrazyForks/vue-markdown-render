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

const editorView = {
  getModel: () => ({ getLineCount: () => 1 }),
  getOption: () => 14,
  updateOptions: () => {},
  layout: () => {},
}

const diffEditorView = {
  getModel: () => ({ getLineCount: () => 1 }),
  getOption: () => 14,
  updateOptions: () => {},
  layout: () => {},
}

const streamMonacoHelpers = {
  createEditor: vi.fn(async () => {}),
  createDiffEditor: vi.fn(async () => {}),
  updateCode: vi.fn(),
  updateDiff: vi.fn(),
  getEditor: vi.fn(() => null),
  getEditorView: vi.fn(() => editorView),
  getDiffEditorView: vi.fn(() => diffEditorView),
  cleanupEditor: vi.fn(() => {}),
  safeClean: vi.fn(() => {}),
  setTheme: vi.fn(async () => {}),
}

// Tests reach into this global handle to reset/inspect the shared stream-monaco mock.
;(globalThis as any).__streamMonacoHelpers = streamMonacoHelpers

vi.mock('stream-monaco', () => ({
  useMonaco: () => streamMonacoHelpers,
  preloadMonacoWorkers: vi.fn(async () => {}),
  getOrCreateHighlighter: vi.fn(async () => ({
    codeToTokens: vi.fn(() => ({
      tokens: [],
      fg: '#000000',
      bg: '#ffffff',
      themeName: 'vitesse-dark',
      rootStyle: {},
      grammarState: null,
    })),
  })),
  detectLanguage: () => 'plaintext',
}))

vi.mock('mermaid', () => ({
  default: {
    initialize: () => {},
    render: async (_id: string, code: string) => `<svg data-testid="mermaid-svg">${code}</svg>`,
    parse: () => {},
  },
}))

// Do not mock katexWorkerClient here to allow tests to exercise real behavior.
