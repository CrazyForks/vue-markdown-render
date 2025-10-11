type Theme = 'light' | 'dark'

let worker: Worker | null = null
// If worker instantiation fails (for example due to an incorrect new Worker URL/path),
// we capture the error here so callers can decide to fallback to a main-thread parser.
let workerInitError: any = null
const rpcMap = new Map<string, { resolve: (v: any) => void, reject: (e: any) => void }>()

function ensureWorker() {
  if (worker)
    return worker

  // Vite-style worker URL import
  // Only create a Worker if running in a browser environment
  if (typeof window === 'undefined') {
    worker = null
    console.warn('[mermaidWorkerClient] window is undefined — Web Worker will not be created')
  }
  else {
    worker = new Worker(new URL('./mermaidParser.worker.ts', import.meta.url), { type: 'module' })
    workerInitError = null
  }

  if (worker) {
    worker.addEventListener('message', (ev: MessageEvent) => {
      const { id, ok, result, error } = ev.data || {}
      const entry = rpcMap.get(id)
      if (!entry)
        return
      if (ok)
        entry.resolve(result)
      else entry.reject(new Error(error ?? 'Worker error'))
      rpcMap.delete(id)
    })

    worker.addEventListener('error', (e) => {
      const err = new Error(String((e as any)?.message ?? e))
        ; (err as any).name = 'WorkerInitError'
      ; (err as any).code = 'WORKER_INIT_ERROR'
      ; (err as any).original = e
      ; (err as any).fallbackToRenderer = true
      workerInitError = err
      console.error(err)

      // reject all pending RPCs so callers can fallback
      for (const [_id, entry] of rpcMap.entries()) {
        entry.reject(err)
      }
      rpcMap.clear()
    })

    worker.addEventListener('messageerror', (ev) => {
      console.error('[mermaidWorkerClient] Worker messageerror', ev)
    })
  }

  return worker
}

function callWorker<T>(action: 'canParse' | 'findPrefix', payload: any, timeout = 1400): Promise<T> {
  if (workerInitError)
    return Promise.reject(workerInitError)

  const wk = ensureWorker()
  if (!wk) {
    return Promise.reject(workerInitError)
  }

  return new Promise<T>((resolve, reject) => {
    const id = Math.random().toString(36).slice(2)
    rpcMap.set(id, { resolve, reject })
    wk.postMessage({ id, action, payload })

    const timeoutId = (globalThis as any).setTimeout(() => {
      if (rpcMap.has(id))
        rpcMap.delete(id)
      reject(new Error('Worker call timed out'))
    }, timeout)

    // clear timeout on resolution
    const wrapResolve = (v: any) => {
      (globalThis as any).clearTimeout(timeoutId)
      resolve(v)
    }
    const wrapReject = (e: any) => {
      (globalThis as any).clearTimeout(timeoutId)
      reject(e)
    }
    rpcMap.set(id, { resolve: wrapResolve, reject: wrapReject })
  })
}

export async function canParseOffthread(code: string, theme: Theme, timeout = 1400) {
  try {
    return await callWorker<boolean>('canParse', { code, theme }, timeout)
  }
  catch (e) {
    return Promise.reject(e)
  }
}

export async function findPrefixOffthread(code: string, theme: Theme, timeout = 1400) {
  try {
    return await callWorker<string | null>('findPrefix', { code, theme }, timeout)
  }
  catch (e) {
    return Promise.reject(e)
  }
}

export function terminateWorker() {
  if (worker) {
    worker.terminate()
    worker = null
  }
}
